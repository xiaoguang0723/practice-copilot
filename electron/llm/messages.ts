export interface VisionPromptInput {
  extraPrompt: string
  imageDataUrls: string[]
  persistentPrompt: string
}

export type VisionMessage =
  | { content: string; role: 'system' }
  | {
      content: Array<
        | { text: string; type: 'text' }
        | { image_url: { url: string }; type: 'image_url' }
      >
      role: 'user'
    }

const BUILT_IN_PROMPT = `你是一个模拟练习解题助手。请准确识别截图中的题目，先给出明确结论，再说明关键推理步骤。遇到编程题时，提供可运行代码、必要说明以及时间和空间复杂度。无法可靠识别时应说明缺失信息，不要编造题目内容。`

export function buildVisionMessages(input: VisionPromptInput): VisionMessage[] {
  const messages: VisionMessage[] = [{ content: BUILT_IN_PROMPT, role: 'system' }]
  const persistentPrompt = input.persistentPrompt.trim()
  if (persistentPrompt) messages.push({ content: persistentPrompt, role: 'system' })

  const extraPrompt = input.extraPrompt.trim()
  messages.push({
    content: [
      {
        text: extraPrompt
          ? `请分析截图中的题目并给出答案。\n\n补充要求：${extraPrompt}`
          : '请分析截图中的题目并给出答案。',
        type: 'text'
      },
      ...input.imageDataUrls.map((url) => ({ image_url: { url }, type: 'image_url' as const }))
    ],
    role: 'user'
  })
  return messages
}
