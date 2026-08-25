import { describe, expect, it } from 'vitest'

import { registerHotkeys, type ShortcutRegistrar } from '../electron/hotkeys'
import type { HotkeySettings } from '../shared/protocol'

const oldHotkeys: HotkeySettings = {
  answer: 'Alt+W',
  capture: 'Alt+Q',
  clear: 'Alt+R',
  pointerThrough: 'Alt+D',
  quit: 'Alt+X',
  scrollDown: 'Shift+Down',
  scrollUp: 'Shift+Up',
  toggle: 'Alt+E'
}

describe('registerHotkeys', () => {
  it('registers every semantic action', () => {
    const registered: string[] = []
    const registrar: ShortcutRegistrar = {
      register: (accelerator) => {
        registered.push(accelerator)
        return true
      },
      unregisterAll: () => undefined
    }

    expect(registerHotkeys(registrar, oldHotkeys, oldHotkeys, () => undefined)).toEqual({ ok: true })
    expect(registered).toEqual([
      'Alt+Q',
      'Alt+W',
      'Alt+R',
      'Alt+E',
      'Alt+X',
      'Alt+D',
      'Shift+Up',
      'Shift+Down',
      'Alt+M',
      'Control+Up',
      'Control+Down',
      'Control+Left',
      'Control+Right'
    ])
  })

  it('rolls back all shortcuts when one registration fails', () => {
    const rounds: string[][] = [[]]
    const registrar: ShortcutRegistrar = {
      register: (accelerator) => {
        rounds.at(-1)?.push(accelerator)
        return accelerator !== 'Ctrl+W'
      },
      unregisterAll: () => rounds.push([])
    }
    const next = { ...oldHotkeys, answer: 'Ctrl+W' }

    expect(registerHotkeys(registrar, next, oldHotkeys, () => undefined)).toEqual({
      accelerator: 'Ctrl+W',
      message: '快捷键 Ctrl+W 注册失败',
      ok: false
    })
    expect(rounds.at(-1)).toEqual([
      'Alt+Q',
      'Alt+W',
      'Alt+R',
      'Alt+E',
      'Alt+X',
      'Alt+D',
      'Shift+Up',
      'Shift+Down',
      'Alt+M',
      'Control+Up',
      'Control+Down',
      'Control+Left',
      'Control+Right'
    ])
  })
})
