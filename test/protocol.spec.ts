import { describe, expect, it } from 'vitest'

import { createDefaultSettings, IPC } from '../shared/protocol'

describe('createDefaultSettings', () => {
  it('provides the required default accelerators', () => {
    expect(createDefaultSettings().hotkeys).toEqual({
      answer: 'MouseRightDoubleClick',
      capture: 'MouseLeftDoubleClick',
      clear: 'MouseMiddleDoubleClick',
      ghostMode: 'Alt+M',
      pointerThrough: 'Alt+D',
      quit: 'Alt+X',
      scrollDown: 'MouseLeftHold+WheelDown',
      scrollUp: 'MouseLeftHold+WheelUp',
      toggle: 'MouseMiddleLongPress'
    })
    expect(createDefaultSettings().opacity).toBe(0.88)
  })

  it('defines a temporary window opacity channel', () => {
    expect(IPC.WINDOW_SET_OPACITY).toBe('window:set-opacity')
  })
})
