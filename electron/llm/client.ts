import { normalizeChatCompletionsUrl } from '../../shared/validation'
import { buildVisionMessages, type VisionMessage, type VisionPromptInput } from './messages'
import { parseSseStream } from './sse'

export interface StreamVisionOptions extends VisionPromptInput {
  apiKey: string
  baseUrl: string
  knowledgeBaseEnabled?: boolean
  model: string
  selectedKnowledgeBaseIds?: string[]
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

export async function extractVisionSearchQuery(
  options: StreamVisionOptions,
  signal: AbortSignal
): Promise<string> {
  const request = createRequestSignal(signal, 45_000)
  try {
    const response = await fetch(normalizeChatCompletionsUrl(options.baseUrl), {
      body: JSON.stringify({
        messages: buildRetrievalMessages(options),
        model: options.model,
        stream: false
      }),
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json'
      },
      method: 'POST',
      signal: request.signal
    })
    if (!response.ok) throw new Error(`模型服务返回 HTTP ${response.status}`)
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> }
    const content = payload.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) throw new Error('模型未返回检索词')
    return content.trim().slice(0, 1200)
  } finally {
    request.dispose()
  }
}

function buildRetrievalMessages(input: VisionPromptInput): VisionMessage[] {
  return [
    {
      content:
        '仅从截图中提取用于本地知识库检索的题目文字、题名、示例、约束、变量名与算法关键词。不要解题，不要解释；用空格分隔关键词，最多 1200 字。',
      role: 'system'
    },
    {
      content: [
        { text: '提取检索关键词。', type: 'text' },
        ...input.imageDataUrls.map((url) => ({ image_url: { url }, type: 'image_url' as const }))
      ],
      role: 'user'
    }
  ]
}
