import type { HotkeyAction, HotkeySettings } from '../shared/protocol'

export interface ShortcutRegistrar {
  register(accelerator: string, callback: () => void): boolean
  unregisterAll(): void
}

export type HotkeyRegistrationResult =
  | { ok: true }
  | { accelerator: string; message: string; ok: false }

type ShortcutAction = Exclude<HotkeyAction, 'settings'>

const orderedActions: ShortcutAction[] = ['capture', 'answer', 'toggle', 'quit']

function registerSet(
  registrar: ShortcutRegistrar,
  hotkeys: HotkeySettings,
  onAction: (action: HotkeyAction) => void
): string | undefined {
  for (const action of orderedActions) {
    const accelerator = hotkeys[action]
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
