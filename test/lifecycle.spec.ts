import { describe, expect, it, vi } from 'vitest'

import { AppCoordinator } from '../electron/coordinator'

describe('AppCoordinator', () => {
  it('cancels the previous answer when a new answer starts', async () => {
    const signals: AbortSignal[] = []
    const coordinator = new AppCoordinator({
      capture: async () => ({
        capturedAt: 1,
        dataUrl: 'data:image/jpeg;base64,abc',
        height: 1080,
        width: 1920
      }),
      destroyTray: vi.fn(),
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
    const destroyTray = vi.fn()
    const quit = vi.fn()
    const coordinator = new AppCoordinator({
      capture: vi.fn(),
      destroyTray,
      emitAnswer: vi.fn(),
      quit,
      stream: vi.fn(),
      unregisterHotkeys
    })

    coordinator.shutdown()

    expect(unregisterHotkeys).toHaveBeenCalledOnce()
    expect(destroyTray).toHaveBeenCalledOnce()
    expect(quit).toHaveBeenCalledOnce()
  })
})
