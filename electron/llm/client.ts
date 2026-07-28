import { normalizeChatCompletionsUrl } from '../../shared/validation'
import { buildVisionMessages, type VisionPromptInput } from './messages'
import { parseSseStream } from './sse'

export interface StreamVisionOptions extends VisionPromptInput {
  apiKey: string
  baseUrl: string
  model: string
}

export interface RequestSignal {
  dispose(): void
  signal: AbortSignal
  timedOut(): boolean
}

export function createRequestSignal(parent: AbortSignal, timeoutMs = 120_000): RequestSignal {
  const timeoutController = new AbortController()
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs)
  return {
    dispose: () => clearTimeout(timer),
    signal: AbortSignal.any([parent, timeoutController.signal]),
    timedOut: () => timeoutController.signal.aborted && !parent.aborted
  }
}

export async function streamVisionAnswer(
  options: StreamVisionOptions,
  emitDelta: (delta: string) => void,
  signal: AbortSignal
): Promise<string> {
  const request = createRequestSignal(signal)
  try {
    const response = await fetch(normalizeChatCompletionsUrl(options.baseUrl), {
      body: JSON.stringify({
        messages: buildVisionMessages(options),
        model: options.model,
        stream: true
      }),
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json'
      },
      method: 'POST',
      signal: request.signal
    })

    if (!response.ok) throw new Error(`模型服务返回 HTTP ${response.status}`)
    if (!response.body) throw new Error('模型服务未返回可读取的响应')

    let answer = ''
    for await (const delta of parseSseStream(response.body)) {
      answer += delta
      emitDelta(delta)
    }
    if (!answer.trim()) throw new Error('模型服务返回了空回答')
    return answer
  } catch (error) {
    if (request.timedOut()) throw new Error('模型请求超时，请重试')
    throw error
  } finally {
    request.dispose()
  }
}
