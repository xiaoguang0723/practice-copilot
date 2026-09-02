import rehypeKatex from 'rehype-katex'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import 'katex/dist/katex.min.css'

import { normalizeMathDelimiters } from '../math'

export interface MarkdownAnswerProps {
  content: string
  streaming?: boolean
}

export function MarkdownAnswer({ content, streaming = false }: MarkdownAnswerProps) {
  if (!content && !streaming) {
    return (
      <div className="answer-empty">
        <strong>等待截图</strong>
        <span>左键双击截图，右键双击发送</span>
      </div>
    )
  }

  return (
    <article className="markdown-answer">
      <ReactMarkdown
        rehypePlugins={[rehypeKatex]}
        remarkPlugins={[remarkGfm, remarkMath]}
      >
        {normalizeMathDelimiters(content)}
      </ReactMarkdown>
      {streaming && <span aria-hidden="true" className="stream-cursor" />}
    </article>
  )
}

