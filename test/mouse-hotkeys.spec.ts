import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

import { MouseHotkeyManager } from '../electron/mouse-hotkeys'

class FakeHook extends EventEmitter {
  start = vi.fn()
  stop = vi.fn()
}

function click(hook: FakeHook, button: number, time: number) {
  hook.emit('mousedown', { button, time })
  hook.emit('mouseup', { button, time })
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

  it('dispatches default double-click gestures', () => {
    vi.useFakeTimers()
    const hook = new FakeHook()
    const manager = new MouseHotkeyManager(hook)
    const capture = vi.fn()
    const answer = vi.fn()
    const clear = vi.fn()
    manager.register('MouseLeftDoubleClick', capture)
    manager.register('MouseRightDoubleClick', answer)
    manager.register('MouseMiddleDoubleClick', clear)

    click(hook, 1, 100)
    click(hook, 1, 300)
    click(hook, 3, 1000)
    click(hook, 3, 1200)
    click(hook, 2, 2000)
    click(hook, 2, 2200)
    vi.advanceTimersByTime(150)

    expect(capture).toHaveBeenCalledOnce()
    expect(answer).toHaveBeenCalledOnce()
    expect(clear).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('suppresses pending left and right double clicks when a chord is detected', () => {
    vi.useFakeTimers()
    const hook = new FakeHook()
    const manager = new MouseHotkeyManager(hook)
    const capture = vi.fn()
    const answer = vi.fn()
    const nextConfiguration = vi.fn()
    manager.register('MouseLeftDoubleClick', capture)
    manager.register('MouseRightDoubleClick', answer)
    manager.register('MouseLeftRightChord', nextConfiguration)

    click(hook, 1, 100)
    hook.emit('mousedown', { button: 1, time: 300 })
    hook.emit('mousedown', { button: 2, time: 380 })
    vi.advanceTimersByTime(150)

    expect(nextConfiguration).toHaveBeenCalledOnce()
    expect(capture).not.toHaveBeenCalled()
    expect(answer).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('dispatches left-right chord and middle long-press gestures', () => {
    vi.useFakeTimers()
    const hook = new FakeHook()
    const manager = new MouseHotkeyManager(hook)
    const nextConfiguration = vi.fn()
    const toggle = vi.fn()
    manager.register('MouseLeftRightChord', nextConfiguration)
    manager.register('MouseMiddleLongPress', toggle)

    hook.emit('mousedown', { button: 1, time: 100 })
    hook.emit('mousedown', { button: 2, time: 180 })
    hook.emit('mouseup', { button: 2, time: 200 })
    hook.emit('mouseup', { button: 1, time: 220 })
    hook.emit('mousedown', { button: 3, time: 500 })
    vi.advanceTimersByTime(1000)
    hook.emit('mouseup', { button: 3, time: 1500 })

    expect(nextConfiguration).toHaveBeenCalledOnce()
    expect(toggle).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('does not turn a long middle press into a later double click', () => {
    vi.useFakeTimers()
    const hook = new FakeHook()
    const manager = new MouseHotkeyManager(hook)
    const toggle = vi.fn()
    const clear = vi.fn()
    manager.register('MouseMiddleLongPress', toggle)
    manager.register('MouseMiddleDoubleClick', clear)

    hook.emit('mousedown', { button: 3, time: 100 })
    vi.advanceTimersByTime(1000)
    hook.emit('mouseup', { button: 3, time: 1100 })
    hook.emit('mousedown', { button: 3, time: 1200 })
    hook.emit('mouseup', { button: 3, time: 1250 })

    expect(toggle).toHaveBeenCalledOnce()
    expect(clear).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('scrolls only while the left button is held', () => {
    const hook = new FakeHook()
    const manager = new MouseHotkeyManager(hook)
    const events: string[] = []
    const up = vi.fn(() => events.push('up'))
    const down = vi.fn(() => events.push('down'))
    manager.register('MouseLeftHold+WheelUp', up)
    manager.register('MouseLeftHold+WheelDown', down)

    hook.emit('wheel', { direction: 3, rotation: 1 })
    hook.emit('mousedown', { button: 1 })
    hook.emit('wheel', { direction: 3, rotation: 1 })
    hook.emit('wheel', { direction: 3, rotation: -1 })
    hook.emit('mouseup', { button: 1 })
    hook.emit('wheel', { direction: 3, rotation: -1 })

    expect(up).toHaveBeenCalledOnce()
    expect(down).toHaveBeenCalledOnce()
    expect(events).toEqual(['down', 'up'])
  })

  it('records a complete mouse gesture instead of a raw button click', async () => {
    const hook = new FakeHook()
    const manager = new MouseHotkeyManager(hook)
    const recording = manager.record()

    click(hook, 1, 100)
    click(hook, 1, 300)

    await expect(recording).resolves.toBe('MouseLeftDoubleClick')
  })

  it('records left-held wheel gestures', async () => {
    const hook = new FakeHook()
    const manager = new MouseHotkeyManager(hook)
    const recording = manager.record()

    hook.emit('mousedown', { button: 1, time: 100 })
    hook.emit('wheel', { direction: 3, rotation: -1 })

    await expect(recording).resolves.toBe('MouseLeftHold+WheelUp')
  })
})
