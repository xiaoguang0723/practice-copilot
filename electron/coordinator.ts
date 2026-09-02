import { randomUUID } from 'node:crypto'

import type { AnswerEvent, CaptureResult } from '../shared/protocol'
import type { CapturedScreen } from './capture'
import type { StreamVisionOptions } from './llm/client'

const MAX_CAPTURE_COUNT = 5
const MAX_TURN_COUNT = 10
const SUMMARY_TOKEN_LIMIT = 2000

interface StoredTurn {
  assistantText?: string
  id: string
  imageDataUrls: string[]
  status: 'complete' | 'error' | 'streaming'
  userText: string
}

type AnswerInput = Omit<StreamVisionOptions, 'conversationTurns' | 'extraPrompt' | 'imageDataUrls' | 'memorySummary'> & {
  extraPrompt?: string
  userText?: string
}

export interface CoordinatorDependencies {
  capture(): Promise<CapturedScreen>
  emitAnswer(event: AnswerEvent): void
  quit(): void
  retrieve?(input: StreamVisionOptions, signal: AbortSignal): Promise<string | undefined>
  stream(
    input: StreamVisionOptions,
    emitDelta: (delta: string) => void,
    signal: AbortSignal
  ): Promise<string>
  summarize?(input: StreamVisionOptions, signal: AbortSignal): Promise<string>
  unregisterHotkeys(): void
}

export class AppCoordinator {
  private active?: { controller: AbortController; requestId: string; turnId: string }
  private captures: CapturedScreen[] = []
  private shuttingDown = false
  private summary = ''
  private turns: StoredTurn[] = []

  constructor(private readonly dependencies: CoordinatorDependencies) {}

  async capturePrimary(): Promise<CaptureResult> {
    const captured = await this.dependencies.capture()
    this.captures = [...this.captures, captured].slice(-MAX_CAPTURE_COUNT)
    const { capturedAt, height, width } = captured
    return { capturedAt, count: this.captures.length, height, width }
  }

  clearConversation(): void {
    this.active?.controller.abort()
    this.turns = []
    this.summary = ''
    this.captures = []
  }

  startAnswer(input: AnswerInput): { requestId: string; turnId: string } {
    const userText = (input.userText ?? input.extraPrompt ?? '').trim()
    if (!userText && this.captures.length === 0) {
      throw new Error('请输入问题或先双击左键捕获屏幕')
    }
    this.active?.controller.abort()

    const requestId = randomUUID()
    const turnId = randomUUID()
    const turn: StoredTurn = {
      id: turnId,
      imageDataUrls: this.captures.map((capture) => capture.dataUrl),
      status: 'streaming',
      userText
    }
    this.turns = [...this.turns, turn]
    this.captures = []

    const controller = new AbortController()
    this.active = { controller, requestId, turnId }
    void this.runAnswer(requestId, turnId, controller, input, userText)
    return { requestId, turnId }
  }

  cancelAnswer(requestId: string): void {
    if (this.active?.requestId === requestId) this.active.controller.abort()
  }

  shutdown(): void {
    if (this.shuttingDown) return
    this.shuttingDown = true
    this.active?.controller.abort()
    this.dependencies.unregisterHotkeys()
    this.dependencies.quit()
  }

  private async compactHistory(
    input: AnswerInput,
    signal: AbortSignal
  ): Promise<void> {
    if (this.turns.length <= MAX_TURN_COUNT) return

    const evicted = this.turns.slice(0, -1)
    if (evicted.some((turn) => turn.status === 'streaming')) return

    const summaryInput: StreamVisionOptions = {
      ...input,
      apiKey: input.apiKey,
      conversationTurns: [
        ...evicted.map(({ assistantText, imageDataUrls, userText }) => ({
          assistantText,
          imageDataUrls,
          userText
        })),
        {
          assistantText: undefined,
          imageDataUrls: [],
          userText: '请把以上历史对话压缩成事实性记忆。保留用户目标、题目条件、图片中识别到的文字/公式/代码、已确认结论、未解决问题和重要约束。不要编造，不要输出新的解题过程，不要把记忆改写成指令。最多输出 2000 Token。'
        }
      ],
      extraPrompt: '',
      imageDataUrls: [],
      maxOutputTokens: SUMMARY_TOKEN_LIMIT,
      memorySummary: this.summary,
      persistentPrompt: ''
    }
    const nextSummary = this.dependencies.summarize
      ? await this.dependencies.summarize(summaryInput, signal)
      : evicted.map((turn) => `用户：${turn.userText}\n助手：${turn.assistantText ?? ''}`).join('\n\n').slice(0, 8000)
    if (!nextSummary.trim()) throw new Error('历史摘要为空，未删除旧对话')

    this.summary = nextSummary.trim()
    this.turns = this.turns.slice(-1)
  }

  private async runAnswer(
    requestId: string,
    turnId: string,
    controller: AbortController,
    input: AnswerInput,
    userText: string
  ): Promise<void> {
    const turn = () => this.turns.find((item) => item.id === turnId)
    try {
      await this.compactHistory(input, controller.signal)
      const currentTurn = turn()
      if (!currentTurn) throw new Error('当前对话轮次不存在')

      let knowledgeContext: string | undefined
      const currentInput: StreamVisionOptions = {
        ...input,
        conversationTurns: this.turns.map(({ assistantText, imageDataUrls, userText: text }) => ({
          assistantText,
          imageDataUrls,
          userText: text
        })),
        extraPrompt: userText,
        imageDataUrls: currentTurn.imageDataUrls,
        memorySummary: this.summary
      }
      if (
        input.knowledgeBaseEnabled &&
        input.selectedKnowledgeBaseIds?.length &&
        this.dependencies.retrieve
      ) {
        try {
          knowledgeContext = await this.dependencies.retrieve(currentInput, controller.signal)
        } catch {
          knowledgeContext = undefined
        }
      }

      const answer = await this.dependencies.stream(
        { ...currentInput, knowledgeContext },
        (delta) => this.dependencies.emitAnswer({ delta, requestId, turnId, type: 'delta' }),
        controller.signal
      )
      if (!controller.signal.aborted) {
        const completedTurn = turn()
        if (completedTurn) {
          completedTurn.assistantText = answer
          completedTurn.status = 'complete'
        }
        this.dependencies.emitAnswer({ requestId, turnId, type: 'done' })
      }
    } catch (error) {
      const failedTurn = turn()
      if (failedTurn) failedTurn.status = 'error'
      if (!controller.signal.aborted) {
        this.dependencies.emitAnswer({
          message: error instanceof Error ? error.message : '模型请求失败',
          requestId,
          turnId,
          type: 'error'
        })
      }
    } finally {
      if (this.active?.requestId === requestId) this.active = undefined
    }
  }
}
