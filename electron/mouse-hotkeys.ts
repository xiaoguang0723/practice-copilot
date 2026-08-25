import { uIOhook } from 'uiohook-napi'

export type MouseShortcut = 'MouseMiddle' | 'Mouse4' | 'Mouse5'
export type RecordedShortcut = string

const buttonNames: Record<number, MouseShortcut> = { 3: 'MouseMiddle', 4: 'Mouse4', 5: 'Mouse5' }

interface InputHook {
  off(event: 'keydown', listener: (event: KeyboardHookEvent) => void): unknown
  off(event: 'mousedown', listener: (event: MouseHookEvent) => void): unknown
  on(event: 'keydown', listener: (event: KeyboardHookEvent) => void): unknown
  on(event: 'mousedown', listener: (event: MouseHookEvent) => void): unknown
  start(): void
  stop(): void
}

interface KeyboardHookEvent {
  altKey: boolean
  ctrlKey: boolean
  keycode: number
  metaKey: boolean
  shiftKey: boolean
}

interface MouseHookEvent { button: unknown }

export function isMouseShortcut(value: string): value is MouseShortcut {
  return value === 'MouseMiddle' || value === 'Mouse4' || value === 'Mouse5'
}

function formatKey(event: { keycode: number; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }): string | undefined {
  const names: Record<number, string> = { 28: 'Enter', 57: 'Space', 1: 'Escape', 3657: 'PageUp', 3665: 'PageDown', 57416: 'Up', 57424: 'Down', 57419: 'Left', 57421: 'Right' }
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']
  const letterCodes = [30, 48, 46, 32, 18, 33, 34, 35, 23, 36, 37, 38, 50, 49, 24, 25, 16, 19, 31, 20, 22, 47, 17, 45, 21, 44]
  const key = names[event.keycode] ?? letters[letterCodes.indexOf(event.keycode)] ?? Object.entries({
    59: 'F1', 60: 'F2', 61: 'F3', 62: 'F4', 63: 'F5', 64: 'F6', 65: 'F7', 66: 'F8', 67: 'F9', 68: 'F10', 87: 'F11', 88: 'F12'
  }).find(([code]) => Number(code) === event.keycode)?.[1]
  if (!key) return undefined
  const modifiers = [event.ctrlKey && 'Control', event.shiftKey && 'Shift', event.altKey && 'Alt', event.metaKey && 'Super'].filter(Boolean)
  return [...modifiers, key].join('+')
}

export class MouseHotkeyManager {
  private handlers = new Map<MouseShortcut, () => void>()
  private listenerAttached = false
  private recording = false
  private started = false
  private readonly dispatchMouseDown = (event: { button: unknown }) => {
    if (this.recording) return
    const shortcut = buttonNames[Number(event.button)]
    if (shortcut) this.handlers.get(shortcut)?.()
  }

  constructor(private readonly hook: InputHook = uIOhook) {}

  register(shortcut: string, callback: () => void): void {
    if (!isMouseShortcut(shortcut)) return
    this.handlers.set(shortcut, callback)
    this.ensureStarted()
  }

  unregisterAll(): void {
    this.handlers.clear()
    if (this.started) {
      this.hook.stop()
      this.started = false
    }
  }

  record(): Promise<RecordedShortcut> {
    this.ensureStarted()
    this.recording = true
    return new Promise((resolve) => {
      const onKey = (event: { keycode: number; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }) => {
        const shortcut = formatKey(event)
        if (shortcut) finish(shortcut)
      }
      const onMouse = (event: { button: unknown }) => {
        const shortcut = buttonNames[Number(event.button)]
        if (shortcut) finish(shortcut)
      }
      const finish = (shortcut: string) => {
        this.recording = false
        this.hook.off('keydown', onKey)
        this.hook.off('mousedown', onMouse)
        resolve(shortcut)
      }
      this.hook.on('keydown', onKey)
      this.hook.on('mousedown', onMouse)
    })
  }

  private ensureStarted(): void {
    if (this.started) return
    if (!this.listenerAttached) {
      this.hook.on('mousedown', this.dispatchMouseDown)
      this.listenerAttached = true
    }
    this.hook.start()
    this.started = true
  }
}
