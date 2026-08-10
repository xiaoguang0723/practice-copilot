import { afterEach, describe, expect, it, vi } from 'vitest'

import { createRequestSignal, extractVisionSearchQuery, streamVisionAnswer } from '../electron/llm/client'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('streamVisionAnswer', () => {
  it('uses a five-minute default idle timeout', async () => {
    vi.useFakeTimers()
    const request = createRequestSignal(new AbortController().signal)

    await vi.advanceTimersByTimeAsync(5 * 60_000 - 1)
    expect(request.signal.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    expect(request.signal.aborted).toBe(true)
    request.dispose()
    vi.useRealTimers()
  })

  it('times out only after a continuous idle period', async () => {
    vi.useFakeTimers()
    const request = createRequestSignal(new AbortController().signal, 50)

    await vi.advanceTimersByTimeAsync(40)
    request.touch()
    await vi.advanceTimersByTimeAsync(40)

    expect(request.signal.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(11)

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
        imageDataUrls: ['data:image/jpeg;base64,abc'],
        model: 'vision-model',
        persistentPrompt: ''
      },
      (delta) => deltas.push(delta),
      new AbortController().signal
    )

    expect(answer).toBe('答案')
    expect(deltas).toEqual(['答案'])
  })

  it('posts a streamed request to /responses when apiProtocol is response', async () => {
    const encoder = new TextEncoder()
    globalThis.fetch = vi.fn(async (url, init) => {
      expect(String(url)).toBe('https://api.example.com/v1/responses')
      const body = JSON.parse(String(init?.body))
      expect(body.input.at(-1).content.slice(1)).toEqual([
        {
          detail: 'high',
          image_url: 'data:image/jpeg;base64,abc',
          type: 'input_image'
        },
        {
          detail: 'high',
          image_url: 'data:image/jpeg;base64,def',
          type: 'input_image'
        }
      ])
      expect(body.model).toBe('vision-model')
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"delta":"Responses API 答案"}\n\ndata: [DONE]\n\n'))
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
        apiProtocol: 'response',
        baseUrl: 'https://api.example.com/v1',
        extraPrompt: '',
        imageDataUrls: ['data:image/jpeg;base64,abc', 'data:image/jpeg;base64,def'],
        model: 'vision-model',
        persistentPrompt: ''
      },
      (delta) => deltas.push(delta),
      new AbortController().signal
    )

    expect(answer).toBe('Responses API 答案')
    expect(deltas).toEqual(['Responses API 答案'])
  })

  it('returns a sanitized HTTP error', async () => {
    globalThis.fetch = vi.fn(async () => new Response('api-key-secret leaked', { status: 401 }))

    await expect(
      streamVisionAnswer(
        {
          apiKey: 'api-key-secret',
          baseUrl: 'https://api.example.com/v1',
          extraPrompt: '',
          imageDataUrls: ['data:image/jpeg;base64,abc'],
          model: 'vision-model',
          persistentPrompt: ''
        },
        () => undefined,
        new AbortController().signal
      )
    ).rejects.toThrow('模型服务返回 HTTP 401')
  })

  it('makes a short non-streaming vision request to extract retrieval terms', async () => {
    globalThis.fetch = vi.fn(async (_url, init) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'vision-model', stream: false })
      return new Response(JSON.stringify({ choices: [{ message: { content: 'nums target 哈希表 两数之和' } }] }), { status: 200 })
    })

    await expect(extractVisionSearchQuery({
      apiKey: 'key-secret', baseUrl: 'https://api.example.com/v1', extraPrompt: '',
      imageDataUrls: ['data:image/jpeg;base64,abc'], model: 'vision-model', persistentPrompt: ''
    }, new AbortController().signal)).resolves.toBe('nums target 哈希表 两数之和')
  })

  it('replays the latest multimodal turns and complete assistant answers in order', async () => {
    const encoder = new TextEncoder()
    globalThis.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      expect(body.previous_response_id).toBeUndefined()
      expect(body.store).toBe(false)
      expect(body.instructions).toContain('模拟练习解题助手')
      expect(body.input).toHaveLength(3)
      expect(body.input[0].content).toEqual([
        { text: '第一轮问题', type: 'input_text' },
        { detail: 'high', image_url: 'data:image/jpeg;base64/old', type: 'input_image' }
      ])
      expect(body.input[1]).toEqual({ content: '第一轮回答', role: 'assistant' })
      expect(body.input.at(-1).content).toEqual([
        { text: '第二轮问题', type: 'input_text' },
        { detail: 'high', image_url: 'data:image/jpeg;base64/current', type: 'input_image' }
      ])
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(
            'data: {"delta":"第二轮回答"}\n\ndata: [DONE]\n\n'
          ))
          controller.close()
        }
      }), { status: 200 })
    })
    await expect(streamVisionAnswer({
      apiKey: 'key-secret',
      apiProtocol: 'response',
      baseUrl: 'https://api.example.com/v1',
      conversationTurns: [
        { assistantText: '第一轮回答', imageDataUrls: ['data:image/jpeg;base64/old'], userText: '第一轮问题' },
        { imageDataUrls: ['data:image/jpeg;base64/current'], userText: '第二轮问题' }
      ],
      extraPrompt: '第二轮问题',
      imageDataUrls: ['data:image/jpeg;base64/current'],
      model: 'vision-model',
      persistentPrompt: ''
    }, () => undefined, new AbortController().signal)).resolves.toBe('第二轮回答')
  })

  it('uses a two-minute idle timeout for knowledge retrieval', async () => {
    vi.useFakeTimers()
    let requestSignal: AbortSignal | undefined
    globalThis.fetch = vi.fn(async (_url, init) => {
      requestSignal = init?.signal as AbortSignal
      return await new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
    })

    const pending = extractVisionSearchQuery({
      apiKey: 'key-secret', baseUrl: 'https://api.example.com/v1', extraPrompt: '',
      imageDataUrls: ['data:image/jpeg;base64,abc'], model: 'vision-model', persistentPrompt: ''
    }, new AbortController().signal)

    await vi.advanceTimersByTimeAsync(2 * 60_000 - 1)
    expect(requestSignal?.aborted).toBe(false)

    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(1)
    await rejection
    vi.useRealTimers()
  })
})
