import { describe, expect, it, vi } from 'vitest'

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

  it('parses Responses API event format (text/output_text/delta)', async () => {
    const deltas: string[] = []
    for await (const delta of parseSseStream(
      stream([
        'data: {"delta":"Hello"}\n\n',
        'data: {"response":{"output_text":" World"}}\n\n',
        'data: [DONE]\n\n'
      ])
    )) {
      deltas.push(delta)
    }

    expect(deltas).toEqual(['Hello', ' World'])
  })

  it('uses a completion-only Responses event when no deltas were sent', async () => {
    const deltas: string[] = []
    for await (const delta of parseSseStream(stream([
      'event: response.completed\n',
      'data: {"type":"response.completed","response":{"output":[{"content":[{"type":"output_text","text":"完整回答"}]}]}}\n\n'
    ]))) {
      deltas.push(delta)
    }

    expect(deltas).toEqual(['完整回答'])
  })

  it('does not duplicate completed text after Responses deltas', async () => {
    const deltas: string[] = []
    for await (const delta of parseSseStream(stream([
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"回答"}\n\n',
      'event: response.completed\ndata: {"type":"response.completed","response":{"output_text":"回答"}}\n\n'
    ]))) {
      deltas.push(delta)
    }

    expect(deltas).toEqual(['回答'])
  })

  it('falls back to a non-streaming JSON response', async () => {
    const deltas: string[] = []
    for await (const delta of parseSseStream(stream([
      '{"output":[{"content":[{"type":"output_text","text":"JSON 回答"}]}]}'
    ]))) {
      deltas.push(delta)
    }

    expect(deltas).toEqual(['JSON 回答'])
  })

  it('surfaces Responses stream errors instead of reporting an empty answer', async () => {
    const collect = async () => {
      for await (const _delta of parseSseStream(stream([
        'event: error\ndata: {"type":"error","code":"provider_error","message":"upstream failed"}\n\n'
      ]))) {
        // Consume the generator.
      }
    }

    await expect(collect()).rejects.toThrow('provider_error: upstream failed')
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

  it('reports activity for every received network chunk', async () => {
    const onActivity = vi.fn()

    for await (const _delta of parseSseStream(
      stream(['data: {"delta":"一"}\n', '\ndata: {"delta":"二"}\n\n']),
      onActivity
    )) {
      // Consume the generator.
    }

    expect(onActivity).toHaveBeenCalledTimes(2)
  })
})

