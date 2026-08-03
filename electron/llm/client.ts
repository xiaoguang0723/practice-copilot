import { normalizeApiUrl } from '../../shared/validation'
import {
  buildVisionMessages,
  toResponsesInput,
  type VisionMessage,
  type VisionPromptInput
} from './messages'
import { parseSseStream } from './sse'

export interface StreamVisionOptions extends VisionPromptInput {
  apiKey: string
  apiProtocol?: 'chat' | 'response'
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
    const targetUrl = normalizeApiUrl(options.baseUrl, options.apiProtocol)
    const messages = buildVisionMessages(options)
    const body = options.apiProtocol === 'response'
      ? { input: toResponsesInput(messages), model: options.model, stream: true }
      : { messages, model: options.model, stream: true }

    const response = await fetch(targetUrl, {
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json'
      },
      method: 'POST',
      signal: request.signal
    })

    if (!response.ok) {
      const detail = await extractErrorDetail(response, options.apiKey)
      throw new Error(detail)
    }
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
    const targetUrl = normalizeApiUrl(options.baseUrl, options.apiProtocol)
    const messages = buildRetrievalMessages(options)
    const body = options.apiProtocol === 'response'
      ? { input: toResponsesInput(messages), model: options.model, stream: false }
      : { messages, model: options.model, stream: false }

    const response = await fetch(targetUrl, {
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json'
      },
      method: 'POST',
      signal: request.signal
    })
    if (!response.ok) {
      const detail = await extractErrorDetail(response, options.apiKey)
      throw new Error(detail)
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>
      output?: Array<{ content?: Array<{ text?: unknown }> }>
      output_text?: unknown
    }
    let content: unknown = payload.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      content = payload.output_text
    }
    if (typeof content !== 'string' || !content.trim()) {
      content = payload.output?.[0]?.content?.[0]?.text
    }

    if (typeof content !== 'string' || !content.trim()) throw new Error('模型未返回检索词')
    return content.trim().slice(0, 1200)
  } finally {
    request.dispose()
  }
}

async function extractErrorDetail(response: Response, apiKey: string): Promise<string> {
  let raw = ''
  try {
    raw = await response.text()
  } catch {
    // Ignore body reading failure
  }
  if (apiKey && raw.includes(apiKey)) {
    raw = raw.replaceAll(apiKey, '***')
  }
  const snippet = raw.trim().slice(0, 200)
  return snippet
    ? `模型服务返回 HTTP ${response.status}: ${snippet}`
    : `模型服务返回 HTTP ${response.status}`
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
