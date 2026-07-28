import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { App } from '../src/App'
import { MarkdownAnswer } from '../src/components/MarkdownAnswer'
import { SettingsPanel } from '../src/components/SettingsPanel'
import {
  createDefaultSettings,
  type HotkeyAction,
  type PracticeApi
} from '../shared/protocol'

afterEach(cleanup)

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

  it('previews opacity changes and restores the saved value on cancel', () => {
    const onClose = vi.fn()
    const onOpacityPreview = vi.fn()
    render(
      <SettingsPanel
        onClose={onClose}
        onOpacityPreview={onOpacityPreview}
        onSave={vi.fn()}
        settings={createDefaultSettings()}
      />
    )

    fireEvent.change(screen.getByRole('slider', { name: '窗口透明度' }), {
      target: { value: '64' }
    })
    expect(onOpacityPreview).toHaveBeenCalledWith(0.64)

    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onOpacityPreview).toHaveBeenLastCalledWith(0.88)
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('App hotkey scrolling', () => {
  it('scrolls the answer region when global scroll actions arrive', async () => {
    let onHotkey: ((action: HotkeyAction) => void) | undefined
    const settings = createDefaultSettings()
    const api: PracticeApi = {
      answer: {
        cancel: vi.fn(),
        onEvent: vi.fn(() => () => undefined),
        start: vi.fn()
      },
      app: { quit: vi.fn() },
      capture: { clear: vi.fn(), primary: vi.fn() },
      hotkeys: {
        onAction: vi.fn((callback) => {
          onHotkey = callback
          return () => undefined
        })
      },
      knowledge: {
        create: vi.fn(),
        delete: vi.fn(),
        deleteDocument: vi.fn(),
        importDocument: vi.fn(),
        list: vi.fn(async () => []),
        listDocuments: vi.fn(async () => []),
        rename: vi.fn(),
        updateDocument: vi.fn()
      },
      settings: {
        clearApiKey: vi.fn(async () => settings),
        get: vi.fn(async () => settings),
        save: vi.fn(async () => settings)
      },
      window: { hide: vi.fn(), setOpacity: vi.fn(), toggle: vi.fn() }
    }
    Object.defineProperty(window, 'practice', { configurable: true, value: api })

    render(<App />)
    const answerRegion = screen.getByRole('region', { name: '模型回答' })
    const scrollBy = vi.fn()
    Object.defineProperty(answerRegion, 'scrollBy', { configurable: true, value: scrollBy })
    await waitFor(() => expect(onHotkey).toBeTypeOf('function'))

    onHotkey?.('scroll-down')
    onHotkey?.('scroll-up')

    expect(scrollBy).toHaveBeenNthCalledWith(1, { behavior: 'smooth', top: 180 })
    expect(scrollBy).toHaveBeenNthCalledWith(2, { behavior: 'smooth', top: -180 })
  })
})
