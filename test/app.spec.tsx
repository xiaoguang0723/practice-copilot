import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MarkdownAnswer } from '../src/components/MarkdownAnswer'
import { SettingsPanel } from '../src/components/SettingsPanel'
import { createDefaultSettings } from '../shared/protocol'

describe('MarkdownAnswer', () => {
  it('renders headings, tables, and code blocks', () => {
    render(<MarkdownAnswer content={'# 标题\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```js\nconst x = 1\n```'} />)

    expect(screen.getByRole('heading', { name: '标题' })).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('const x = 1')).toBeInTheDocument()
  })
})

describe('SettingsPanel', () => {
  it('shows validation feedback before saving an invalid URL', async () => {
    const onSave = vi.fn()
    render(
      <SettingsPanel
        onClose={vi.fn()}
        onSave={onSave}
        settings={createDefaultSettings()}
      />
    )

    fireEvent.change(screen.getByLabelText('API Base URL'), { target: { value: 'file:///secret' } })
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    expect(await screen.findByText('API 地址必须使用 HTTP 或 HTTPS')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })
})
