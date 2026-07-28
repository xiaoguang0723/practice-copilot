interface ChatCompletionChunk {
  choices?: Array<{ delta?: { content?: string } }>
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

  let parsed: ChatCompletionChunk
  try {
    parsed = JSON.parse(data) as ChatCompletionChunk
  } catch {
    throw new Error('流式响应格式无效')
  }
  const content = parsed.choices?.[0]?.delta?.content
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

