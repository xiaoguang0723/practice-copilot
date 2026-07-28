import { afterEach, describe, expect, it, vi } from 'vitest'

import { createRequestSignal, streamVisionAnswer } from '../electron/llm/client'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('streamVisionAnswer', () => {
  it('aborts with a readable timeout reason', async () => {
    vi.useFakeTimers()
    const request = createRequestSignal(new AbortController().signal, 50)

    await vi.advanceTimersByTimeAsync(51)

    expect(request.signal.aborted).toBe(true)
    expect(request.timedOut()).toBe(true)
    request.dispose()
    vi.useRealTimers()
  })

  it('posts a streamed multimodal request and emits deltas', async () => {
    const encoder = new TextEncoder()
    globalThis.fetch = vi.fn(async (_url, init) => {
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer key-secret' })
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'vision-model', stream: true })
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode('data: {"choices":[{"delta":{"content":"答案"}}]}\n\ndata: [DONE]\n\n')
            )
            controller.close()
          }
        }),
        { status: 200 }
      )
    })
    const deltas: string[] = []

    const answer = await streamVisionAnswer(
      {
        apiKey: 'key-secret',
        baseUrl: 'https://api.example.com/v1',
        extraPrompt: '',
        imageDataUrl: 'data:image/jpeg;base64,abc',
        model: 'vision-model',
        persistentPrompt: ''
      },
      (delta) => deltas.push(delta),
      new AbortController().signal
    )

    expect(answer).toBe('答案')
    expect(deltas).toEqual(['答案'])
  })

  it('returns a sanitized HTTP error', async () => {
    globalThis.fetch = vi.fn(async () => new Response('api-key-secret leaked', { status: 401 }))

    await expect(
      streamVisionAnswer(
        {
          apiKey: 'api-key-secret',
          baseUrl: 'https://api.example.com/v1',
          extraPrompt: '',
          imageDataUrl: 'data:image/jpeg;base64,abc',
          model: 'vision-model',
          persistentPrompt: ''
        },
        () => undefined,
        new AbortController().signal
      )
    ).rejects.toThrow('模型服务返回 HTTP 401')
  })
})
