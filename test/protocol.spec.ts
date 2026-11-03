import { describe, expect, it } from 'vitest'

import { createDefaultSettings, IPC } from '../shared/protocol'
import { normalizeTranscriptionsUrl } from '../shared/validation'

describe('createDefaultSettings', () => {
  it('provides the required default accelerators', () => {
    expect(createDefaultSettings().hotkeys).toEqual({
      answer: 'MouseRightDoubleClick',
      audioToggle: 'Alt+S',
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
    })
    expect(createDefaultSettings().opacity).toBe(0.88)
    expect(createDefaultSettings().sttModel).toBe('gpt-4o-mini-transcribe')
    expect(createDefaultSettings().audioAutoStopOnSend).toBe(true)
  })

  it('defines a temporary window opacity channel', () => {
    expect(IPC.WINDOW_SET_OPACITY).toBe('window:set-opacity')
  })

  it('normalizes transcription URLs across baseUrl formats', () => {
    expect(normalizeTranscriptionsUrl('https://api.chatanywhere.tech')).toBe(
      'https://api.chatanywhere.tech/v1/audio/transcriptions'
    )
    expect(normalizeTranscriptionsUrl('https://api.chatanywhere.tech/v1')).toBe(
      'https://api.chatanywhere.tech/v1/audio/transcriptions'
    )
    expect(normalizeTranscriptionsUrl('https://api.chatanywhere.tech/v1/chat/completions')).toBe(
      'https://api.chatanywhere.tech/v1/audio/transcriptions'
    )
  })
})
