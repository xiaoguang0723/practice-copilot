import type { AnswerEvent } from '../shared/protocol'

type DeltaEvent = Extract<AnswerEvent, { type: 'delta' }>

/**
 * 合并高频 delta 事件：每个请求的首个 delta 立即发送（保证首字延迟），
 * 之后按固定窗口合并，减少 IPC / Markdown 重渲染 / 远端 SSE 次数。
 * done / error 会先冲刷缓冲再发送，保证顺序。
 */
export class AnswerEventBatcher {
  private lastRequestId?: string
  private pending?: DeltaEvent
  private timer?: ReturnType<typeof setTimeout>

  constructor(
    private readonly emit: (event: AnswerEvent) => void,
    private readonly intervalMs = 40
  ) {}

  push(event: AnswerEvent): void {
    if (event.type !== 'delta') {
      this.flush()
      this.lastRequestId = undefined
      this.emit(event)
      return
    }
    if (this.lastRequestId !== event.requestId) {
      this.flush()
      this.lastRequestId = event.requestId
      this.emit(event)
      return
    }
    this.pending = this.pending
      ? { ...this.pending, delta: this.pending.delta + event.delta }
      : { ...event }
    if (!this.timer) this.timer = setTimeout(() => this.flush(), this.intervalMs)
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    const event = this.pending
    this.pending = undefined
    if (event) this.emit(event)
  }
}
