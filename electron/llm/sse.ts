interface TextContent {
  text?: string
}

interface ResponseStreamOutputItem extends Record<string, unknown> {
  content?: TextContent[]
}

interface ChunkPayload {
  choices?: Array<{
    delta?: { content?: string }
    message?: { content?: string | TextContent[] }
  }>
  code?: string
  delta?: string | { content?: string }
  error?: string | { code?: string; message?: string }
  message?: string
  output?: ResponseStreamOutputItem[]
  output_text?: string
  response?: {
    error?: { code?: string; message?: string }
    output?: ResponseStreamOutputItem[]
    output_item?: { content?: TextContent[] }
    output_text?: string
    status?: string
  }
  text?: string
  type?: string
}

type DecodedEvent =
  | { kind: 'completed'; text?: string }
  | { cumulative?: boolean; kind: 'delta'; text: string }
  | { kind: 'done' }
  | { kind: 'ignored' }

function firstText(content?: TextContent[]): string | undefined {
  return content
    ?.map((item) => item.text ?? '')
    .join('')
    .trim() || undefined
}

function extractCompletedText(parsed: ChunkPayload): string | undefined {
  const chatContent = parsed.choices?.[0]?.message?.content
  if (typeof chatContent === 'string' && chatContent.trim()) return chatContent
  if (Array.isArray(chatContent)) {
    const text = firstText(chatContent)
    if (text) return text
  }

  if (typeof parsed.output_text === 'string' && parsed.output_text.trim()) {
    return parsed.output_text
  }
  if (typeof parsed.text === 'string' && parsed.text.trim()) {
    return parsed.text
  }
  if (typeof parsed.response?.output_text === 'string' && parsed.response.output_text.trim()) {
    return parsed.response.output_text
  }

  const outputs = parsed.output ?? parsed.response?.output
  const outputText = outputs
    ?.map((item) => firstText(item.content) ?? '')
    .join('')
    .trim()
  if (outputText) return outputText
  return firstText(parsed.response?.output_item?.content)
}

function extractDeltaText(parsed: ChunkPayload): string | undefined {
  const typedNonDelta = Boolean(parsed.type && !parsed.type.endsWith('.delta'))
  if (typedNonDelta) return undefined
  if (typeof parsed.delta === 'string' && parsed.delta.length > 0) return parsed.delta
  if (typeof parsed.delta === 'object' && parsed.delta && typeof parsed.delta.content === 'string') {
    return parsed.delta.content
  }
  const chatContent = parsed.choices?.[0]?.delta?.content
  if (typeof chatContent === 'string' && chatContent.length > 0) return chatContent
  if (typeof parsed.text === 'string' && parsed.text.length > 0) return parsed.text

  // Some compatible gateways stream these fields without a Responses event type.
  if (!parsed.type) {
    if (typeof parsed.output_text === 'string' && parsed.output_text.length > 0) {
      return parsed.output_text
    }
    if (typeof parsed.response?.output_text === 'string' && parsed.response.output_text.length > 0) {
      return parsed.response.output_text
    }
    return firstText(parsed.response?.output_item?.content)
  }
  return undefined
}

function serviceError(parsed: ChunkPayload): string | undefined {
  const failed = parsed.type === 'error' || parsed.type === 'response.failed' || parsed.response?.status === 'failed'
  if (!failed) return undefined

  const error = parsed.error ?? parsed.response?.error
  const message = typeof error === 'string' ? error : error?.message ?? parsed.message
  const code = typeof error === 'object' ? error?.code : parsed.code
  const detail = [code, message].filter(Boolean).join(': ').slice(0, 200)
  return detail ? `模型服务流式请求失败：${detail}` : '模型服务流式请求失败'
}

function eventData(event: string): { raw?: string; sse: boolean } {
  const lines = event.split(/\r?\n/)
  const dataLines = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
  if (dataLines.length) return { raw: dataLines.join('\n').trim(), sse: true }

  const raw = event.trim()
  if (!raw || lines.some((line) => line.startsWith('event:') || line.startsWith(':'))) {
    return { sse: true }
  }
  return { raw, sse: false }
}

function decodeEvent(event: string): DecodedEvent {
  const { raw, sse } = eventData(event)
  if (!raw) return { kind: 'ignored' }
  if (raw === '[DONE]') return { kind: 'done' }

  let parsed: ChunkPayload
  try {
    parsed = JSON.parse(raw) as ChunkPayload
  } catch {
    throw new Error('流式响应格式无效')
  }

  const error = serviceError(parsed)
  if (error) throw new Error(error)

  const delta = extractDeltaText(parsed)
  if (delta) {
    const cumulative = !parsed.type && (
      typeof parsed.output_text === 'string' || typeof parsed.response?.output_text === 'string'
    )
    return cumulative ? { cumulative: true, kind: 'delta', text: delta } : { kind: 'delta', text: delta }
  }

  const completed = !sse || parsed.type === 'response.completed' || parsed.type?.endsWith('.done')
  if (completed) return { kind: 'completed', text: extractCompletedText(parsed) }
  return { kind: 'ignored' }
}

export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
  onActivity?: () => void
): AsyncGenerator<string, void, void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let emittedOutput = false
  let emittedText = ''

  const consume = function* (event: string): Generator<string, boolean, void> {
    const decoded = decodeEvent(event)
    if (decoded.kind === 'done') return true
    if (decoded.kind === 'delta') {
      emittedOutput = true
      if (decoded.cumulative) {
        if (decoded.text === emittedText) return false
        const suffix = decoded.text.startsWith(emittedText)
          ? decoded.text.slice(emittedText.length)
          : decoded.text
        emittedText = decoded.text
        if (suffix) yield suffix
      } else {
        emittedText += decoded.text
        yield decoded.text
      }
    } else if (decoded.kind === 'completed' && decoded.text && !emittedOutput) {
      emittedOutput = true
      emittedText = decoded.text
      yield decoded.text
    }
    return false
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      onActivity?.()
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split(/\r?\n\r?\n/)
      buffer = events.pop() ?? ''
      for (const event of events) {
        const iterator = consume(event)
        let next = iterator.next()
        while (!next.done) {
          yield next.value
          next = iterator.next()
        }
        if (next.value) return
      }
    }

    buffer += decoder.decode()
    if (buffer.trim()) {
      yield* consume(buffer)
    }
  } finally {
    reader.releaseLock()
  }
}
