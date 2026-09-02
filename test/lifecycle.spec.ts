import { describe, expect, it, vi } from 'vitest'

import { AppCoordinator } from '../electron/coordinator'

describe('AppCoordinator', () => {
  it('queues up to five captures, sends them in capture order, and clears them', async () => {
    let captureCount = 0
    const streamedInputs: Array<{ imageDataUrls: string[] }> = []
    const coordinator = new AppCoordinator({
      capture: async () => {
        captureCount += 1
        return {
          capturedAt: captureCount,
          dataUrl: `data:image/jpeg;base64,${captureCount}`,
          height: 1080,
          width: 1920
        }
      },
      emitAnswer: vi.fn(),
      quit: vi.fn(),
      stream: async (input) => {
        streamedInputs.push(input)
        return 'ok'
      },
      unregisterHotkeys: vi.fn()
    })

    for (let index = 0; index < 6; index += 1) await coordinator.capturePrimary()
    coordinator.startAnswer({
      apiKey: 'key',
      baseUrl: 'https://example.com/v1',
      extraPrompt: '',
      model: 'vision',
      persistentPrompt: '',
      userText: '继续'
    })
    await vi.waitFor(() => expect(streamedInputs).toHaveLength(1))

    expect(streamedInputs[0].imageDataUrls).toEqual([
      'data:image/jpeg;base64,2',
      'data:image/jpeg;base64,3',
      'data:image/jpeg;base64,4',
      'data:image/jpeg;base64,5',
      'data:image/jpeg;base64,6'
    ])

    coordinator.clearConversation()
    expect(() => coordinator.startAnswer({
      apiKey: 'key',
      baseUrl: 'https://example.com/v1',
      extraPrompt: '',
      model: 'vision',
       persistentPrompt: '',
       userText: ''
    })).toThrow('请输入问题或先双击左键捕获屏幕')
  })

  it('cancels the previous answer when a new answer starts', async () => {
    const signals: AbortSignal[] = []
    const coordinator = new AppCoordinator({
      capture: async () => ({
        capturedAt: 1,
        dataUrl: 'data:image/jpeg;base64,abc',
        height: 1080,
        width: 1920
      }),
      emitAnswer: vi.fn(),
      quit: vi.fn(),
      stream: async (_input, _emit, signal) => {
        signals.push(signal)
        await new Promise<void>(() => undefined)
        return ''
      },
      unregisterHotkeys: vi.fn()
    })

    await coordinator.capturePrimary()
    coordinator.startAnswer({
      apiKey: 'key',
      baseUrl: 'https://example.com/v1',
      extraPrompt: '',
      model: 'vision',
      persistentPrompt: '',
      userText: '继续'
    })
    coordinator.startAnswer({
      apiKey: 'key',
      baseUrl: 'https://example.com/v1',
      extraPrompt: '',
      model: 'vision',
      persistentPrompt: '',
      userText: '换一个问题'
    })

    await vi.waitFor(() => expect(signals).toHaveLength(2))
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)
  })

  it('cleans owned resources before quitting', () => {
    const unregisterHotkeys = vi.fn()
    const quit = vi.fn()
    const coordinator = new AppCoordinator({
      capture: vi.fn(),
      emitAnswer: vi.fn(),
      quit,
      stream: vi.fn(),
      unregisterHotkeys
    })

    coordinator.shutdown()

    expect(unregisterHotkeys).toHaveBeenCalledOnce()
    expect(quit).toHaveBeenCalledOnce()
  })

  it('retrieves local knowledge only when the user enables selected libraries', async () => {
    const retrieve = vi.fn(async () => '来源：两数之和\n哈希表解法')
    const streamedInputs: Array<{ knowledgeContext?: string }> = []
    const coordinator = new AppCoordinator({
      capture: async () => ({
        capturedAt: 1,
        dataUrl: 'data:image/jpeg;base64,abc',
        height: 1080,
        width: 1920
      }),
      emitAnswer: vi.fn(),
      quit: vi.fn(),
      retrieve,
      stream: async (input) => {
        streamedInputs.push(input)
        return 'ok'
      },
      unregisterHotkeys: vi.fn()
    })
    await coordinator.capturePrimary()

    coordinator.startAnswer({
      apiKey: 'key', baseUrl: 'https://example.com/v1', extraPrompt: '', knowledgeBaseEnabled: false,
      model: 'vision', persistentPrompt: '', selectedKnowledgeBaseIds: ['library-a'], userText: '第一问'
    })
    await vi.waitFor(() => expect(streamedInputs).toHaveLength(1))
    expect(retrieve).not.toHaveBeenCalled()
    expect(streamedInputs[0].knowledgeContext).toBeUndefined()

    coordinator.startAnswer({
      apiKey: 'key', baseUrl: 'https://example.com/v1', extraPrompt: '', knowledgeBaseEnabled: true,
      model: 'vision', persistentPrompt: '', selectedKnowledgeBaseIds: ['library-a'], userText: '第二问'
    })
    await vi.waitFor(() => expect(streamedInputs).toHaveLength(2))
    expect(retrieve).toHaveBeenCalledOnce()
    expect(streamedInputs[1].knowledgeContext).toContain('哈希表')
  })

  it('resets the capture count after clearing the pending screenshots', async () => {
    let captureCount = 0
    const coordinator = new AppCoordinator({
      capture: async () => ({
        capturedAt: ++captureCount,
        dataUrl: `data:image/jpeg;base64,${captureCount}`,
        height: 1,
        width: 1
      }),
      emitAnswer: vi.fn(),
      quit: vi.fn(),
      stream: vi.fn(async () => 'ok'),
      unregisterHotkeys: vi.fn()
    })

    expect((await coordinator.capturePrimary()).count).toBe(1)
    expect((await coordinator.capturePrimary()).count).toBe(2)
    coordinator.clearConversation()
    expect((await coordinator.capturePrimary()).count).toBe(1)
  })

  it('summarizes the first ten turns before sending the eleventh turn', async () => {
    const streamedInputs: Array<{ conversationTurns?: Array<{ userText: string }>; memorySummary?: string }> = []
    const summaryInputs: Array<{ conversationTurns?: Array<{ userText: string }> }> = []
    let answerCount = 0
    const coordinator = new AppCoordinator({
      capture: vi.fn(),
      emitAnswer: vi.fn(),
      quit: vi.fn(),
      stream: async (input) => {
        streamedInputs.push(input)
        answerCount += 1
        return `回答 ${answerCount}`
      },
      summarize: async (input) => {
        summaryInputs.push(input)
        return '早期对话摘要'
      },
      unregisterHotkeys: vi.fn()
    })

    for (let index = 1; index <= 11; index += 1) {
      coordinator.startAnswer({
        apiKey: 'key',
        baseUrl: 'https://example.com/v1',
        model: 'vision',
        persistentPrompt: '',
        userText: `问题 ${index}`
      })
      await vi.waitFor(() => expect(streamedInputs).toHaveLength(index))
    }

    expect(summaryInputs).toHaveLength(1)
    expect(summaryInputs[0].conversationTurns?.[0].userText).toBe('问题 1')
    expect(summaryInputs[0].conversationTurns?.[9].userText).toBe('问题 10')
    expect(summaryInputs[0].conversationTurns?.at(-1)?.userText).toContain('压缩成事实性记忆')
    expect(streamedInputs[10].conversationTurns).toHaveLength(1)
    expect(streamedInputs[10].conversationTurns?.[0].userText).toBe('问题 11')
    expect(streamedInputs[10].memorySummary).toBe('早期对话摘要')
  })

  it('passes each complete assistant answer into the next turn', async () => {
    const inputs: Array<{
      conversationTurns?: Array<{ assistantText?: string; userText: string }>
    }> = []
    const coordinator = new AppCoordinator({
      capture: vi.fn(),
      emitAnswer: vi.fn(),
      quit: vi.fn(),
      stream: async (input) => {
        inputs.push(input)
        return `回答 ${inputs.length}`
      },
      unregisterHotkeys: vi.fn()
    })

    coordinator.startAnswer({
      apiKey: 'key', apiProtocol: 'response', baseUrl: 'https://example.com/v1',
      model: 'vision', persistentPrompt: '', userText: '第一问'
    })
    await vi.waitFor(() => expect(inputs).toHaveLength(1))
    coordinator.startAnswer({
      apiKey: 'key', apiProtocol: 'response', baseUrl: 'https://example.com/v1',
      model: 'vision', persistentPrompt: '', userText: '第二问'
    })
    await vi.waitFor(() => expect(inputs).toHaveLength(2))

    expect(inputs[1].conversationTurns?.[0]).toMatchObject({
      assistantText: '回答 1',
      userText: '第一问'
    })
  })
})
