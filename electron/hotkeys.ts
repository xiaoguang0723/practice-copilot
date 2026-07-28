import type { HotkeyAction, HotkeySettings } from '../shared/protocol'

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
const fixedActions: Array<[Exclude<ShortcutAction, keyof HotkeySettings>, string]> = [
  ['pointer-through', 'Alt+D'],
  ['scroll-up', 'Alt+Up'],
  ['scroll-down', 'Alt+Down'],
  ['move-up', 'Control+Up'],
  ['move-down', 'Control+Down'],
  ['move-left', 'Control+Left'],
  ['move-right', 'Control+Right']
]

function registerSet(
  registrar: ShortcutRegistrar,
  hotkeys: HotkeySettings,
  onAction: (action: HotkeyAction) => void
): string | undefined {
  for (const action of orderedActions) {
    const accelerator = hotkeys[action]
    if (!registrar.register(accelerator, () => onAction(action))) return accelerator
  }
  for (const [action, accelerator] of fixedActions) {
    if (!registrar.register(accelerator, () => onAction(action))) return accelerator
  }
  return undefined
}

export function registerHotkeys(
  registrar: ShortcutRegistrar,
  next: HotkeySettings,
  previous: HotkeySettings,
  onAction: (action: HotkeyAction) => void
): HotkeyRegistrationResult {
  registrar.unregisterAll()
  const failed = registerSet(registrar, next, onAction)
  if (!failed) return { ok: true }

  registrar.unregisterAll()
  registerSet(registrar, previous, onAction)
  return { accelerator: failed, message: `快捷键 ${failed} 注册失败`, ok: false }
}
