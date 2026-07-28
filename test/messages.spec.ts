import { describe, expect, it } from 'vitest'

import { buildVisionMessages } from '../electron/llm/messages'

describe('buildVisionMessages', () => {
  it('orders built-in, persistent, and screenshot prompts', () => {
    const messages = buildVisionMessages({
      extraPrompt: '使用 JavaScript',
      imageDataUrl: 'data:image/jpeg;base64,abc',
      persistentPrompt: '范围：数据结构'
    })

    expect(messages).toHaveLength(3)
    expect(messages[0]).toMatchObject({ role: 'system' })
    expect(messages[1]).toEqual({ content: '范围：数据结构', role: 'system' })
    expect(messages[2]).toEqual({
      content: [
        { text: '请分析截图中的题目并给出答案。\n\n补充要求：使用 JavaScript', type: 'text' },
        { image_url: { url: 'data:image/jpeg;base64,abc' }, type: 'image_url' }
      ],
      role: 'user'
    })
  })

  it('omits empty optional prompts', () => {
    expect(
      buildVisionMessages({
        extraPrompt: ' ',
        imageDataUrl: 'data:image/jpeg;base64,abc',
        persistentPrompt: ''
      })
    ).toHaveLength(2)
  })
})

