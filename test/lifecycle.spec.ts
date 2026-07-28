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
      persistentPrompt: ''
    })
    await vi.waitFor(() => expect(streamedInputs).toHaveLength(1))

    expect(streamedInputs[0].imageDataUrls).toEqual([
      'data:image/jpeg;base64,2',
      'data:image/jpeg;base64,3',
      'data:image/jpeg;base64,4',
      'data:image/jpeg;base64,5',
      'data:image/jpeg;base64,6'
    ])

    coordinator.clearCaptures()
    expect(() => coordinator.startAnswer({
      apiKey: 'key',
      baseUrl: 'https://example.com/v1',
      extraPrompt: '',
      model: 'vision',
      persistentPrompt: ''
    })).toThrow('请先按 Alt+Q 捕获屏幕')
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
      persistentPrompt: ''
    })
    coordinator.startAnswer({
      apiKey: 'key',
      baseUrl: 'https://example.com/v1',
      extraPrompt: '',
      model: 'vision',
      persistentPrompt: ''
    })

    expect(signals).toHaveLength(2)
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
      model: 'vision', persistentPrompt: '', selectedKnowledgeBaseIds: ['library-a']
    })
    await vi.waitFor(() => expect(streamedInputs).toHaveLength(1))
    expect(retrieve).not.toHaveBeenCalled()
    expect(streamedInputs[0].knowledgeContext).toBeUndefined()

    coordinator.startAnswer({
      apiKey: 'key', baseUrl: 'https://example.com/v1', extraPrompt: '', knowledgeBaseEnabled: true,
      model: 'vision', persistentPrompt: '', selectedKnowledgeBaseIds: ['library-a']
    })
    await vi.waitFor(() => expect(streamedInputs).toHaveLength(2))
    expect(retrieve).toHaveBeenCalledOnce()
    expect(streamedInputs[1].knowledgeContext).toContain('哈希表')
  })
})
