import { describe, expect, it } from 'vitest'

import { createDefaultSettings, IPC } from '../shared/protocol'

describe('createDefaultSettings', () => {
  it('provides the required default accelerators', () => {
    expect(createDefaultSettings().hotkeys).toEqual({
      answer: 'Alt+W',
      capture: 'Alt+Q',
      clear: 'Alt+R',
      pointerThrough: 'Alt+D',
      quit: 'Alt+X',
      scrollDown: 'Shift+Down',
      scrollUp: 'Shift+Up',
      toggle: 'Alt+E'
    })
    expect(createDefaultSettings().opacity).toBe(0.88)
  })

  it('defines a temporary window opacity channel', () => {
    expect(IPC.WINDOW_SET_OPACITY).toBe('window:set-opacity')
  })
})
