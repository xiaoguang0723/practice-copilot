import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export interface MarkdownAnswerProps {
  content: string
  streaming?: boolean
}

export function MarkdownAnswer({ content, streaming = false }: MarkdownAnswerProps) {
  if (!content && !streaming) {
    return (
      <div className="answer-empty">
        <strong>等待截图</strong>
        <span>Alt+Q 捕获主屏幕，Alt+W 发送</span>
      </div>
    )
  }

  return (
    <article className="markdown-answer">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      {streaming && <span aria-hidden="true" className="stream-cursor" />}
    </article>
  )
}

