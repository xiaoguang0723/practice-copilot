import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

import { MouseHotkeyManager } from '../electron/mouse-hotkeys'

class FakeHook extends EventEmitter {
  start = vi.fn()
  stop = vi.fn()
}

describe('MouseHotkeyManager', () => {
  it('keeps one global listener when shortcuts are repeatedly re-registered', () => {
    const hook = new FakeHook()
    const manager = new MouseHotkeyManager(hook)
    const first = vi.fn()
    const second = vi.fn()

    manager.register('Mouse5', first)
    hook.emit('mousedown', { button: 5 })
    manager.unregisterAll()
    manager.register('Mouse5', second)
    hook.emit('mousedown', { button: 5 })

    expect(hook.listenerCount('mousedown')).toBe(1)
    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
  })
})
