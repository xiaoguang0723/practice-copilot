interface ChunkPayload {
  choices?: Array<{ delta?: { content?: string } }>
  delta?: string | { content?: string }
  output_text?: string
  response?: {
    output_item?: {
      content?: Array<{ text?: string }>
    }
    output_text?: string
  }
  text?: string
}

function extractDeltaText(parsed: ChunkPayload): string | undefined {
  if (typeof parsed.delta === 'string' && parsed.delta.length > 0) return parsed.delta
  if (typeof parsed.delta === 'object' && parsed.delta && typeof parsed.delta.content === 'string') {
    return parsed.delta.content
  }
  const chatContent = parsed.choices?.[0]?.delta?.content
  if (typeof chatContent === 'string' && chatContent.length > 0) return chatContent
  if (typeof parsed.text === 'string' && parsed.text.length > 0) return parsed.text
  if (typeof parsed.output_text === 'string' && parsed.output_text.length > 0) return parsed.output_text
  if (typeof parsed.response?.output_text === 'string' && parsed.response.output_text.length > 0) {
    return parsed.response.output_text
  }
  const itemText = parsed.response?.output_item?.content?.[0]?.text
  if (typeof itemText === 'string' && itemText.length > 0) return itemText
  return undefined
}

function decodeEvent(event: string): string | undefined | 'done' {
  const data = event
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
    .trim()

  if (!data) return undefined
  if (data === '[DONE]') return 'done'

  let parsed: ChunkPayload
  try {
    parsed = JSON.parse(data) as ChunkPayload
  } catch {
    throw new Error('流式响应格式无效')
  }
  const content = extractDeltaText(parsed)
  return typeof content === 'string' && content.length > 0 ? content : undefined
}

export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<string, void, void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split(/\r?\n\r?\n/)
      buffer = events.pop() ?? ''
      for (const event of events) {
        const delta = decodeEvent(event)
        if (delta === 'done') return
        if (delta) yield delta
      }
    }

    buffer += decoder.decode()
    if (buffer.trim()) {
      const delta = decodeEvent(buffer)
      if (delta && delta !== 'done') yield delta
    }
  } finally {
    reader.releaseLock()
  }
}

