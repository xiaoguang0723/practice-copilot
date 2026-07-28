import { randomUUID } from 'node:crypto'

import type { AnswerEvent, CaptureResult } from '../shared/protocol'
import type { CapturedScreen } from './capture'
import type { StreamVisionOptions } from './llm/client'

const MAX_CAPTURE_COUNT = 5

type AnswerInput = Omit<StreamVisionOptions, 'imageDataUrls'>

export interface CoordinatorDependencies {
  capture(): Promise<CapturedScreen>
  destroyTray(): void
  emitAnswer(event: AnswerEvent): void
  quit(): void
  stream(
    input: StreamVisionOptions,
    emitDelta: (delta: string) => void,
    signal: AbortSignal
  ): Promise<string>
  unregisterHotkeys(): void
}

export class AppCoordinator {
  private active?: { controller: AbortController; requestId: string }
  private captures: CapturedScreen[] = []
  private shuttingDown = false

  constructor(private readonly dependencies: CoordinatorDependencies) {}

  async capturePrimary(): Promise<CaptureResult> {
    const captured = await this.dependencies.capture()
    this.captures = [...this.captures, captured].slice(-MAX_CAPTURE_COUNT)
    const { capturedAt, height, width } = captured
    return { capturedAt, count: this.captures.length, height, width }
  }

  clearCaptures(): void {
    this.captures = []
  }

  startAnswer(input: AnswerInput): { requestId: string } {
    if (this.captures.length === 0) throw new Error('请先按 Alt+Q 捕获屏幕')
    this.active?.controller.abort()

    const requestId = randomUUID()
    const controller = new AbortController()
    this.active = { controller, requestId }
    void this.runAnswer(requestId, controller, {
      ...input,
      imageDataUrls: this.captures.map((capture) => capture.dataUrl)
    })
    return { requestId }
  }

  cancelAnswer(requestId: string): void {
    if (this.active?.requestId === requestId) this.active.controller.abort()
  }

  shutdown(): void {
    if (this.shuttingDown) return
    this.shuttingDown = true
    this.active?.controller.abort()
    this.dependencies.unregisterHotkeys()
    this.dependencies.destroyTray()
    this.dependencies.quit()
  }

  private async runAnswer(
    requestId: string,
    controller: AbortController,
    input: StreamVisionOptions
  ): Promise<void> {
    try {
      await this.dependencies.stream(
        input,
        (delta) => this.dependencies.emitAnswer({ delta, requestId, type: 'delta' }),
        controller.signal
      )
      if (!controller.signal.aborted) this.dependencies.emitAnswer({ requestId, type: 'done' })
    } catch (error) {
      if (!controller.signal.aborted) {
        this.dependencies.emitAnswer({
          message: error instanceof Error ? error.message : '模型请求失败',
          requestId,
          type: 'error'
        })
      }
    } finally {
      if (this.active?.requestId === requestId) this.active = undefined
    }
  }
}
