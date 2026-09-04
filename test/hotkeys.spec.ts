import { describe, expect, it } from 'vitest'

import { registerHotkeys, type ShortcutRegistrar } from '../electron/hotkeys'
import type { HotkeySettings } from '../shared/protocol'

const oldHotkeys: HotkeySettings = {
  answer: 'MouseRightDoubleClick',
  capture: 'MouseLeftDoubleClick',
  clear: 'MouseMiddleDoubleClick',
  ghostMode: 'Alt+M',
  pointerThrough: 'Alt+D',
  promptTemplateNext: 'MouseRightLongPress',
  quit: 'Alt+X',
  remoteOutputToggle: 'Alt+R',
  scrollDown: 'MouseLeftHold+WheelDown',
  scrollUp: 'MouseLeftHold+WheelUp',
  toggle: 'MouseMiddleLongPress'
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
      'Alt+X',
      'Alt+D',
      'Alt+M',
      'Alt+R',
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
      'Alt+X',
      'Alt+D',
      'Alt+M',
      'Alt+R',
      'Control+Up',
      'Control+Down',
      'Control+Left',
      'Control+Right'
    ])
  })

  it('registers prompt switching as the configurable default mouse gesture', () => {
    const registered: string[] = []
    const registrar: ShortcutRegistrar = {
      register: (accelerator) => {
        registered.push(accelerator)
        return true
      },
      unregisterAll: () => undefined
    }

    expect(registerHotkeys(registrar, oldHotkeys, oldHotkeys, () => undefined)).toEqual({ ok: true })
    expect(registered).not.toContain('MouseRightLongPress')

    const custom = { ...oldHotkeys, promptTemplateNext: 'Alt+P' }
    registered.length = 0
    expect(registerHotkeys(registrar, custom, oldHotkeys, () => undefined)).toEqual({ ok: true })
    expect(registered).toContain('Alt+P')
  })
})
