import { describe, expect, it } from 'vitest'

import { normalizeChatCompletionsUrl, validateSettingsPatch } from '../shared/validation'

describe('normalizeChatCompletionsUrl', () => {
  it('appends the chat completions path once', () => {
    expect(normalizeChatCompletionsUrl('https://api.example.com/v1/')).toBe(
      'https://api.example.com/v1/chat/completions'
    )
    expect(normalizeChatCompletionsUrl('https://api.example.com/v1/chat/completions')).toBe(
      'https://api.example.com/v1/chat/completions'
    )
  })

  it('rejects non-http protocols', () => {
    expect(() => normalizeChatCompletionsUrl('file:///tmp/key')).toThrow('HTTP')
  })
})

describe('validateSettingsPatch', () => {
  it('rejects oversized model and prompt values', () => {
    expect(validateSettingsPatch({ model: 'm'.repeat(201) })).toEqual({
      message: '模型名不能超过 200 个字符',
      ok: false
    })
    expect(validateSettingsPatch({ persistentPrompt: 'p'.repeat(8001) })).toEqual({
      message: '提示词不能超过 8000 个字符',
      ok: false
    })
  })
})

