import { toSimplifiedChinese } from '../../shared/chinese-converter'
import { normalizeApiUrl, normalizeTranscriptionsUrl } from '../../shared/validation'
import {
  buildResponsesConversationInput,
  buildVisionMessages,
  toResponsesInput,
  type VisionMessage,
  type VisionPromptInput
} from './messages'
import { parseSseStream } from './sse'

const ANSWER_IDLE_TIMEOUT_MS = 5 * 60_000
const RETRIEVAL_IDLE_TIMEOUT_MS = 2 * 60_000
const TRANSCRIPTION_IDLE_TIMEOUT_MS = 30_000

const WHISPER_HALLUCINATION_PATTERNS = [
  /^字幕由\s*amara\.org/i,
  /^amara\.org/i,
  /^请不吝点赞\s*订阅/,
  /^谢谢观看$/,
  /^感谢观看$/,
  /^thank you for watching\.?$/i,
  /^subtitles by/i,
  /^you$/i,
  /^\.+$/
]

export interface StreamVisionOptions extends VisionPromptInput {
  apiKey: string
  apiProtocol?: 'chat' | 'response'
  baseUrl: string
  knowledgeBaseEnabled?: boolean
  model: string
  selectedKnowledgeBaseIds?: string[]
}

export interface TranscribeAudioOptions {
  apiKey: string
  baseUrl: string
  sttModel: string
  wavBase64: string
}

export interface RequestSignal {
  dispose(): void
  signal: AbortSignal
  touch(): void
  timedOut(): boolean
}

export function createRequestSignal(
  parent: AbortSignal,
  timeoutMs = ANSWER_IDLE_TIMEOUT_MS
): RequestSignal {
  const timeoutController = new AbortController()
  let timer: ReturnType<typeof setTimeout>
  const armTimer = () => {
    clearTimeout(timer)
    timer = setTimeout(() => timeoutController.abort(), timeoutMs)
  }
  armTimer()
  return {
    dispose: () => clearTimeout(timer),
    signal: AbortSignal.any([parent, timeoutController.signal]),
    touch: () => {
      if (!parent.aborted && !timeoutController.signal.aborted) armTimer()
    },
    timedOut: () => timeoutController.signal.aborted && !parent.aborted
  }
}

export async function transcribeAudioChunk(
  options: TranscribeAudioOptions,
  signal: AbortSignal
): Promise<string> {
  const request = createRequestSignal(signal, TRANSCRIPTION_IDLE_TIMEOUT_MS)
  try {
    const targetUrl = normalizeTranscriptionsUrl(options.baseUrl)
    const wavBytes = Buffer.from(options.wavBase64, 'base64')
    const formData = new FormData()
    const blob = new Blob([wavBytes], { type: 'audio/wav' })
    formData.append('file', blob, 'speech.wav')
    formData.append('model', options.sttModel.trim() || 'whisper-1')
    formData.append('language', 'zh')
    formData.append('prompt', '请将语音转录为简体中文，普通话。')
    formData.append('response_format', 'json')
    formData.append('temperature', '0')

    const response = await fetch(targetUrl, {
      body: formData,
      headers: {
        Authorization: `Bearer ${options.apiKey}`
      },
      method: 'POST',
      signal: request.signal
    })

    if (!response.ok) {
      const detail = await extractErrorDetail(response, options.apiKey)
      throw new Error(detail)
    }
    request.touch()

    const rawText = await response.text()
    let text = rawText.trim()
    try {
      const parsed = JSON.parse(rawText) as { text?: unknown }
      if (typeof parsed.text === 'string') {
        text = parsed.text.trim()
      }
    } catch {
      // Plain text response format
    }

    if (!text) return ''
    text = toSimplifiedChinese(text)
    if (WHISPER_HALLUCINATION_PATTERNS.some((pattern) => pattern.test(text))) {
      return ''
    }
    return text
  } catch (error) {
    if (request.timedOut()) throw new Error('语音转文字请求超时')
    throw error
  } finally {
    request.dispose()
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
    const responsesConversation = options.apiProtocol === 'response'
      ? buildResponsesConversationInput(options)
      : undefined
    const body = options.apiProtocol === 'response'
      ? {
          input: responsesConversation?.input,
          instructions: responsesConversation?.instructions,
          max_output_tokens: options.maxOutputTokens,
          model: options.model,
          store: false,
          stream: true
        }
      : {
          max_tokens: options.maxOutputTokens,
          messages,
          model: options.model,
          stream: true
        }

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
    request.touch()

    let answer = ''
    for await (const delta of parseSseStream(response.body, request.touch)) {
      answer += delta
      emitDelta(delta)
    }
    if (!answer.trim()) throw new Error('模型服务返回了空回答')
    return answer
  } catch (error) {
    if (request.timedOut()) throw new Error('模型请求长时间无响应，请重试')
    throw error
  } finally {
    request.dispose()
  }
}

export async function extractVisionSearchQuery(
  options: StreamVisionOptions,
  signal: AbortSignal
): Promise<string> {
  const request = createRequestSignal(signal, RETRIEVAL_IDLE_TIMEOUT_MS)
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
    request.touch()
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
        {
          text: input.extraPrompt.trim()
            ? `从当前问题和截图提取检索关键词。当前问题：${input.extraPrompt.trim()}`
            : '提取检索关键词。',
          type: 'text'
        },
        ...input.imageDataUrls.map((url) => ({ image_url: { url }, type: 'image_url' as const }))
      ],
      role: 'user'
    }
  ]
}
