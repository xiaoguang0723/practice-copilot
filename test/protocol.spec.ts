import { describe, expect, it } from 'vitest'

import { createDefaultSettings } from '../shared/protocol'

describe('createDefaultSettings', () => {
  it('provides the required default accelerators', () => {
    expect(createDefaultSettings().hotkeys).toEqual({
      answer: 'Alt+W',
      capture: 'Alt+Q',
      clear: 'Alt+R',
      quit: 'Alt+X',
      toggle: 'Alt+E'
    })
    expect(createDefaultSettings().opacity).toBe(0.88)
  })
})
