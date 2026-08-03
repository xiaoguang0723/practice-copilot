import { describe, expect, it } from 'vitest'

import { buildVisionMessages, toResponsesInput } from '../electron/llm/messages'

describe('buildVisionMessages', () => {
  it('orders built-in, persistent, and screenshot prompts', () => {
    const messages = buildVisionMessages({
      extraPrompt: '使用 JavaScript',
      imageDataUrls: ['data:image/jpeg;base64,abc', 'data:image/jpeg;base64,def'],
      persistentPrompt: '范围：数据结构'
    })

    expect(messages).toHaveLength(3)
    expect(messages[0]).toMatchObject({ role: 'system' })
    expect(messages[1]).toEqual({ content: '范围：数据结构', role: 'system' })
    expect(messages[2]).toEqual({
      content: [
        {
          text: '以下 2 张截图按捕获时间从早到晚排列，请结合全部截图分析题目并给出答案。\n\n补充要求：使用 JavaScript',
          type: 'text'
        },
        { image_url: { url: 'data:image/jpeg;base64,abc' }, type: 'image_url' },
        { image_url: { url: 'data:image/jpeg;base64,def' }, type: 'image_url' }
      ],
      role: 'user'
    })
  })

  it('omits empty optional prompts', () => {
    expect(
      buildVisionMessages({
        extraPrompt: ' ',
        imageDataUrls: ['data:image/jpeg;base64,abc'],
        persistentPrompt: ''
      })
    ).toHaveLength(2)
  })

  it('converts every image to Responses input in capture order', () => {
    const input = toResponsesInput(buildVisionMessages({
      extraPrompt: '',
      imageDataUrls: ['data:image/jpeg;base64,first', 'data:image/jpeg;base64,second'],
      persistentPrompt: ''
    }))

    expect(input[1].content).toEqual([
      {
        text: '以下 2 张截图按捕获时间从早到晚排列，请结合全部截图分析题目并给出答案。',
        type: 'input_text'
      },
      {
        detail: 'high',
        image_url: 'data:image/jpeg;base64,first',
        type: 'input_image'
      },
      {
        detail: 'high',
        image_url: 'data:image/jpeg;base64,second',
        type: 'input_image'
      }
    ])
  })
})
