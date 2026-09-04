import { uIOhook, type UiohookMouseEvent, type UiohookWheelEvent } from 'uiohook-napi'

export type MouseShortcut =
  | 'MouseLeftDoubleClick'
  | 'MouseLeftHold+WheelDown'
  | 'MouseLeftHold+WheelUp'
  | 'MouseLeftRightChord'
  | 'MouseMiddle'
  | 'MouseMiddleDoubleClick'
  | 'MouseMiddleLongPress'
  | 'Mouse4'
  | 'Mouse5'
  | 'MouseRightDoubleClick'
  | 'MouseRightLongPress'
export type RecordedShortcut = string

const buttonNames: Record<number, MouseShortcut> = { 3: 'MouseMiddle', 4: 'Mouse4', 5: 'Mouse5' }

interface InputHook {
  off(event: 'keydown', listener: (event: KeyboardHookEvent) => void): unknown
  off(event: 'mousedown', listener: (event: MouseHookEvent) => void): unknown
  off(event: 'mouseup', listener: (event: MouseHookEvent) => void): unknown
  off(event: 'wheel', listener: (event: WheelHookEvent) => void): unknown
  on(event: 'keydown', listener: (event: KeyboardHookEvent) => void): unknown
  on(event: 'mousedown', listener: (event: MouseHookEvent) => void): unknown
  on(event: 'mouseup', listener: (event: MouseHookEvent) => void): unknown
  on(event: 'wheel', listener: (event: WheelHookEvent) => unknown): unknown
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

type MouseHookEvent = Pick<UiohookMouseEvent, 'button' | 'time'>
type WheelHookEvent = Pick<UiohookWheelEvent, 'direction' | 'rotation'>

function wheelShortcut(rotation: number): 'MouseLeftHold+WheelDown' | 'MouseLeftHold+WheelUp' {
  // uiohook-napi normalizes vertical Windows wheel rotation: positive means down.
  return rotation > 0 ? 'MouseLeftHold+WheelDown' : 'MouseLeftHold+WheelUp'
}

export function isMouseShortcut(value: string): value is MouseShortcut {
  return [
    'MouseLeftDoubleClick',
    'MouseLeftHold+WheelDown',
    'MouseLeftHold+WheelUp',
    'MouseLeftRightChord',
    'MouseMiddle',
    'MouseMiddleDoubleClick',
    'MouseMiddleLongPress',
    'Mouse4',
    'Mouse5',
    'MouseRightDoubleClick',
    'MouseRightLongPress'
  ].includes(value)
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
  private readonly pressed = new Set<number>()
  private readonly pressedAt = new Map<number, number>()
  private readonly lastClickAt = new Map<number, number>()
  private readonly pendingDoubleClickTimers = new Map<number, ReturnType<typeof setTimeout>>()
  private middleLongPressTimer: ReturnType<typeof setTimeout> | undefined
  private rightLongPressTimer: ReturnType<typeof setTimeout> | undefined
  private rightDoubleClickPending = false
  private chordActive = false
  private readonly dispatchMouseDown = (event: MouseHookEvent) => {
    if (this.recording) return
    const button = Number(event.button)
    const now = event.time || Date.now()
    if (button === 1 || button === 2) {
      const other = button === 1 ? 2 : 1
      this.pressed.add(button)
      this.pressedAt.set(button, now)
      if (this.pressed.has(other) && now - (this.pressedAt.get(other) ?? now) <= 150) {
        this.chordActive = true
        this.lastClickAt.delete(1)
        this.lastClickAt.delete(2)
        this.cancelPendingDoubleClick(1)
        this.cancelPendingDoubleClick(2)
        this.clearRightLongPressTimer()
        this.rightDoubleClickPending = false
        this.handlers.get('MouseLeftRightChord')?.()
        return
      }
      if (button === 2) {
        this.clearRightLongPressTimer()
        this.rightLongPressTimer = setTimeout(() => {
          this.rightLongPressTimer = undefined
          this.lastClickAt.delete(2)
          this.cancelPendingDoubleClick(2)
          this.rightDoubleClickPending = false
          this.handlers.get('MouseRightLongPress')?.()
        }, 1000)
      }
      this.dispatchDoubleClick(button, now)
      return
    }
    if (button === 3) {
      this.pressed.add(button)
      this.pressedAt.set(button, now)
      const previous = this.lastClickAt.get(button)
      if (previous !== undefined && now - previous <= 350) {
        this.lastClickAt.delete(button)
        this.clearMiddleLongPressTimer()
        this.handlers.get('MouseMiddleDoubleClick')?.()
      } else {
        this.lastClickAt.set(button, now)
        this.middleLongPressTimer = setTimeout(() => {
          this.lastClickAt.delete(button)
          this.handlers.get('MouseMiddleLongPress')?.()
        }, 1000)
      }
      return
    }
    const shortcut = buttonNames[button]
    if (shortcut) this.handlers.get(shortcut)?.()
  }

  private readonly dispatchMouseUp = (event: MouseHookEvent) => {
    const button = Number(event.button)
    this.pressed.delete(button)
    this.pressedAt.delete(button)
    if (button === 2) {
      this.clearRightLongPressTimer()
      if (this.rightDoubleClickPending && !this.chordActive) {
        this.rightDoubleClickPending = false
        this.handlers.get('MouseRightDoubleClick')?.()
      }
    }
    if (button === 3) this.clearMiddleLongPressTimer()
    if ((button === 1 || button === 2) && this.pressed.size === 0) this.chordActive = false
  }

  private readonly dispatchWheel = (event: WheelHookEvent) => {
    if (this.recording || !this.pressed.has(1) || Number(event.direction) !== 3) return
    const shortcut = wheelShortcut(Number(event.rotation))
    this.handlers.get(shortcut)?.()
  }

  private dispatchDoubleClick(button: number, now: number): void {
    if (this.chordActive) return
    const previous = this.lastClickAt.get(button)
    if (previous !== undefined && now - previous <= 350) {
      this.lastClickAt.delete(button)
      if (button === 2) this.rightDoubleClickPending = true
      const shortcut = button === 1 ? 'MouseLeftDoubleClick' : 'MouseRightDoubleClick'
      this.cancelPendingDoubleClick(button)
      if (button === 1) {
        this.pendingDoubleClickTimers.set(button, setTimeout(() => {
          this.pendingDoubleClickTimers.delete(button)
          this.handlers.get(shortcut)?.()
        }, 150))
      }
    } else {
      this.lastClickAt.set(button, now)
    }
  }

  private clearMiddleLongPressTimer(): void {
    if (this.middleLongPressTimer !== undefined) {
      clearTimeout(this.middleLongPressTimer)
      this.middleLongPressTimer = undefined
    }
  }

  private clearRightLongPressTimer(): void {
    if (this.rightLongPressTimer !== undefined) {
      clearTimeout(this.rightLongPressTimer)
      this.rightLongPressTimer = undefined
    }
  }

  private clearGestureState(): void {
    this.clearMiddleLongPressTimer()
    this.clearRightLongPressTimer()
    this.rightDoubleClickPending = false
    this.pressed.clear()
    this.pressedAt.clear()
    this.lastClickAt.clear()
    this.chordActive = false
    for (const timer of this.pendingDoubleClickTimers.values()) clearTimeout(timer)
    this.pendingDoubleClickTimers.clear()
  }

  private cancelPendingDoubleClick(button: number): void {
    const timer = this.pendingDoubleClickTimers.get(button)
    if (timer !== undefined) {
      clearTimeout(timer)
      this.pendingDoubleClickTimers.delete(button)
    }
  }

  constructor(private readonly hook: InputHook = uIOhook) {}

  register(shortcut: string, callback: () => void): void {
    if (!isMouseShortcut(shortcut)) return
    this.handlers.set(shortcut, callback)
    this.ensureStarted()
  }

  unregisterAll(): void {
    this.handlers.clear()
    this.clearGestureState()
    if (this.started) {
      this.hook.stop()
      this.started = false
    }
  }

  record(): Promise<RecordedShortcut> {
    this.ensureStarted()
    this.recording = true
    return new Promise((resolve) => {
      const pressed = new Set<number>()
      const pressedAt = new Map<number, number>()
      const lastClickAt = new Map<number, number>()
      let middleTimer: ReturnType<typeof setTimeout> | undefined
      let rightTimer: ReturnType<typeof setTimeout> | undefined
      let rightDoubleClickPending = false

      const onKey = (event: { keycode: number; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }) => {
        const shortcut = formatKey(event)
        if (shortcut) finish(shortcut)
      }
      const onMouseDown = (event: MouseHookEvent) => {
        const button = Number(event.button)
        const now = event.time || Date.now()
        if (button === 1 || button === 2) {
          const other = button === 1 ? 2 : 1
          pressed.add(button)
          pressedAt.set(button, now)
          if (pressed.has(other) && now - (pressedAt.get(other) ?? now) <= 150) {
            if (rightTimer !== undefined) clearTimeout(rightTimer)
            finish('MouseLeftRightChord')
            return
          }
          if (button === 2) {
            if (rightTimer !== undefined) clearTimeout(rightTimer)
            rightTimer = setTimeout(() => {
              rightTimer = undefined
              rightDoubleClickPending = false
              finish('MouseRightLongPress')
            }, 1000)
          }
          const previous = lastClickAt.get(button)
          if (previous !== undefined && now - previous <= 350) {
            if (button === 1) finish('MouseLeftDoubleClick')
            else rightDoubleClickPending = true
          } else {
            lastClickAt.set(button, now)
          }
          return
        }
        if (button === 3) {
          pressed.add(button)
          const previous = lastClickAt.get(button)
          if (previous !== undefined && now - previous <= 350) {
            finish('MouseMiddleDoubleClick')
          } else {
            lastClickAt.set(button, now)
            middleTimer = setTimeout(() => finish('MouseMiddleLongPress'), 1000)
          }
        }
      }
      const onMouseUp = (event: MouseHookEvent) => {
        const button = Number(event.button)
        pressed.delete(button)
        pressedAt.delete(button)
        if (button === 2 && rightTimer !== undefined) {
          clearTimeout(rightTimer)
          rightTimer = undefined
        }
        if (button === 2 && rightDoubleClickPending) finish('MouseRightDoubleClick')
        if (button === 3 && middleTimer !== undefined) {
          clearTimeout(middleTimer)
          middleTimer = undefined
        }
      }
      const onWheel = (event: WheelHookEvent) => {
        if (!pressed.has(1) || Number(event.direction) !== 3) return
        finish(wheelShortcut(Number(event.rotation)))
      }
      const finish = (shortcut: string) => {
        this.recording = false
        this.hook.off('keydown', onKey)
        this.hook.off('mousedown', onMouseDown)
        this.hook.off('mouseup', onMouseUp)
        this.hook.off('wheel', onWheel)
        if (middleTimer !== undefined) clearTimeout(middleTimer)
        if (rightTimer !== undefined) clearTimeout(rightTimer)
        resolve(shortcut)
      }
      this.hook.on('keydown', onKey)
      this.hook.on('mousedown', onMouseDown)
      this.hook.on('mouseup', onMouseUp)
      this.hook.on('wheel', onWheel)
    })
  }

  private ensureStarted(): void {
    if (this.started) return
    if (!this.listenerAttached) {
      this.hook.on('mousedown', this.dispatchMouseDown)
      this.hook.on('mouseup', this.dispatchMouseUp)
      this.hook.on('wheel', this.dispatchWheel)
      this.listenerAttached = true
    }
    this.hook.start()
    this.started = true
  }
}
