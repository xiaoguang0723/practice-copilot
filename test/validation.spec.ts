import { describe, expect, it } from 'vitest'

import { normalizeApiUrl, normalizeChatCompletionsUrl, normalizeResponsesUrl, validateSettingsPatch } from '../shared/validation'

describe('normalizeChatCompletionsUrl & normalizeResponsesUrl', () => {
  it('appends the chat completions path once', () => {
    expect(normalizeChatCompletionsUrl('https://api.example.com/v1/')).toBe(
      'https://api.example.com/v1/chat/completions'
    )
    expect(normalizeChatCompletionsUrl('https://api.example.com/v1/chat/completions')).toBe(
      'https://api.example.com/v1/chat/completions'
    )
  })

  it('appends or replaces with the responses path', () => {
    expect(normalizeResponsesUrl('https://api.example.com/v1/')).toBe(
      'https://api.example.com/v1/responses'
    )
    expect(normalizeResponsesUrl('https://api.example.com/v1/chat/completions')).toBe(
      'https://api.example.com/v1/responses'
    )
    expect(normalizeResponsesUrl('https://api.example.com/v1/responses')).toBe(
      'https://api.example.com/v1/responses'
    )
  })

  it('normalizes based on protocol', () => {
    expect(normalizeApiUrl('https://api.example.com/v1', 'chat')).toBe(
      'https://api.example.com/v1/chat/completions'
    )
    expect(normalizeApiUrl('https://api.example.com/v1', 'response')).toBe(
      'https://api.example.com/v1/responses'
    )
  })

  it('rejects non-http protocols', () => {
    expect(() => normalizeChatCompletionsUrl('file:///tmp/key')).toThrow('HTTP')
  })
})

describe('validateSettingsPatch', () => {
  it('validates apiProtocol', () => {
    expect(validateSettingsPatch({ apiProtocol: 'invalid' as any })).toEqual({
      message: '接口协议无效',
      ok: false
    })
    expect(validateSettingsPatch({ apiProtocol: 'response' })).toEqual({ ok: true })
  })

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

