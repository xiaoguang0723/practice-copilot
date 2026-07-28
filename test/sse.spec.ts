import { describe, expect, it } from 'vitest'

import { parseSseStream } from '../electron/llm/sse'

function stream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    }
  })
}

describe('parseSseStream', () => {
  it('parses fragmented data events and stops at DONE', async () => {
    const deltas: string[] = []
    for await (const delta of parseSseStream(
      stream([
        'data: {"choices":[{"delta":{"content":"你"}}]}\n',
        '\ndata: {"choices":[{"delta":{"con',
        'tent":"好"}}]}\n\ndata: [DONE]\n\n'
      ])
    )) {
      deltas.push(delta)
    }

    expect(deltas).toEqual(['你', '好'])
  })

  it('reports invalid JSON without exposing event data', async () => {
    const collect = async () => {
      for await (const _delta of parseSseStream(stream(['data: {secret}\n\n']))) {
        // Consume the generator.
      }
    }

    await expect(collect()).rejects.toThrow('流式响应格式无效')
    await expect(collect()).rejects.not.toThrow('secret')
  })
})

