import { describe, expect, it } from 'vitest'

import {
  buildResponsesConversationInput,
  buildVisionMessages,
  toResponsesInput
} from '../electron/llm/messages'

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

  it('builds recent conversation turns with assistant history and memory', () => {
    const messages = buildVisionMessages({
      conversationTurns: [
        { assistantText: '第一轮回答', imageDataUrls: ['data:image/jpeg;base64,old'], userText: '第一轮问题' },
        { assistantText: undefined, imageDataUrls: [], userText: '继续解释' }
      ],
      extraPrompt: '',
      imageDataUrls: [],
      memorySummary: '早期摘要',
      persistentPrompt: ''
    })

    expect(messages.some((message) => message.role === 'assistant' && message.content === '第一轮回答')).toBe(true)
    expect(messages.some((message) => message.role === 'system' && typeof message.content === 'string' && message.content.includes('早期摘要'))).toBe(true)
  })

  it('keeps historical images and uses string assistant content for Responses', () => {
    const messages = buildVisionMessages({
      conversationTurns: [
        { assistantText: '第一轮回答', imageDataUrls: ['data:image/jpeg;base64,old'], userText: '第一轮问题' },
        { assistantText: undefined, imageDataUrls: ['data:image/jpeg;base64,current'], userText: '继续解释' }
      ],
      extraPrompt: '',
      imageDataUrls: [],
      persistentPrompt: ''
    })

    const input = toResponsesInput(messages)
    expect(input.find((message) => message.role === 'assistant')).toEqual({
      content: '第一轮回答',
      role: 'assistant'
    })
    expect(input.some((message) => JSON.stringify(message).includes('data:image/jpeg;base64,old'))).toBe(true)
    expect(input.at(-1)).toEqual({
      content: [
        { text: '继续解释', type: 'input_text' },
        { detail: 'high', image_url: 'data:image/jpeg;base64,current', type: 'input_image' }
      ],
      role: 'user'
    })
    expect(input[0].content).toEqual(expect.any(String))
  })

  it('keeps ten Responses turns alternating between user arrays and assistant strings', () => {
    const turns = Array.from({ length: 10 }, (_, index) => ({
      assistantText: `回答 ${index + 1}`,
      imageDataUrls: [`data:image/jpeg;base64,${index + 1}`],
      userText: `问题 ${index + 1}`
    }))

    const input = buildResponsesConversationInput({
      conversationTurns: turns,
      extraPrompt: '',
      imageDataUrls: [],
      persistentPrompt: ''
    }).input

    expect(input).toHaveLength(20)
    for (let index = 0; index < 10; index += 1) {
      expect(input[index * 2].role).toBe('user')
      expect(Array.isArray(input[index * 2].content)).toBe(true)
      expect(input[index * 2 + 1]).toEqual({
        content: `回答 ${index + 1}`,
        role: 'assistant'
      })
    }
  })
})
