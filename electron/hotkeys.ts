import type { HotkeyAction, HotkeySettings } from '../shared/protocol'
import { isMouseShortcut, type MouseHotkeyManager } from './mouse-hotkeys'

export interface ShortcutRegistrar {
  register(accelerator: string, callback: () => void): boolean
  unregisterAll(): void
}

export type HotkeyRegistrationResult =
  | { ok: true }
  | { accelerator: string; message: string; ok: false }

type ShortcutAction = Exclude<HotkeyAction, 'settings'>

const orderedActions: Array<Extract<ShortcutAction, keyof HotkeySettings>> = [
  'capture',
  'answer',
  'clear',
  'toggle',
  'quit'
]
const configurableActions: Array<[keyof HotkeySettings, HotkeyAction]> = [
  ['pointerThrough', 'pointer-through'],
  ['scrollUp', 'scroll-up'],
  ['scrollDown', 'scroll-down']
]
const fixedActions: Array<[Exclude<ShortcutAction, keyof HotkeySettings>, string]> = [
  ['move-up', 'Control+Up'],
  ['move-down', 'Control+Down'],
  ['move-left', 'Control+Left'],
  ['move-right', 'Control+Right']
]

function registerSet(
  registrar: ShortcutRegistrar,
  hotkeys: HotkeySettings,
  onAction: (action: HotkeyAction) => void,
  mouse?: MouseHotkeyManager
): string | undefined {
  for (const action of orderedActions) {
    const accelerator = hotkeys[action]
    if (isMouseShortcut(accelerator)) {
      mouse?.register(accelerator, () => onAction(action))
    } else if (!registrar.register(accelerator, () => onAction(action))) return accelerator
  }
  for (const [key, action] of configurableActions) {
    const accelerator = hotkeys[key]
    if (isMouseShortcut(accelerator)) mouse?.register(accelerator, () => onAction(action))
    else if (!registrar.register(accelerator, () => onAction(action))) return accelerator
  }
  for (const [action, accelerator] of fixedActions) {
    if (!registrar.register(accelerator, () => onAction(action))) return accelerator
  }
  mouse?.register('MouseLeftRightChord', () => onAction('configuration-next'))
  return undefined
}

export function registerHotkeys(
  registrar: ShortcutRegistrar,
  next: HotkeySettings,
  previous: HotkeySettings,
  onAction: (action: HotkeyAction) => void,
  mouse?: MouseHotkeyManager
): HotkeyRegistrationResult {
  registrar.unregisterAll()
  mouse?.unregisterAll()
  const failed = registerSet(registrar, next, onAction, mouse)
  if (!failed) return { ok: true }

  registrar.unregisterAll()
  mouse?.unregisterAll()
  registerSet(registrar, previous, onAction, mouse)
  return { accelerator: failed, message: `快捷键 ${failed} 注册失败`, ok: false }
}
