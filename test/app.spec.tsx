import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { App } from '../src/App'
import { MarkdownAnswer } from '../src/components/MarkdownAnswer'
import { normalizeMathDelimiters } from '../src/math'
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

  it('renders LaTeX block and inline formulas', () => {
    render(
      <MarkdownAnswer
        content={'\\[x_i = \\begin{cases}1,&x>0\\\\-1,&x\\le 0\\end{cases}\\]\n\nInline \\(a_i^2\\)\n\n$\n(2^{n-1}+1)^k\n$'}
      />
    )

    expect(document.querySelectorAll('.katex')).toHaveLength(3)
    expect(normalizeMathDelimiters('[普通文本]')).toBe('[普通文本]')
    expect(normalizeMathDelimiters('[ x_i^2 + \\sum_i x_i ]')).toContain('$$')
    expect(normalizeMathDelimiters('$\n(2^{n-1}+1)^k\n$')).toContain('$$')
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

  it('shows named API configurations and copies an already saved key', async () => {
    const settings = createDefaultSettings()
    settings.apiConfigurations = [
      { ...settings.apiConfigurations[0], apiKeySet: true, name: '主线路' },
      { ...settings.apiConfigurations[0], apiKeySet: false, id: 'backup', name: '备用线路' }
    ]
    settings.activeApiConfigurationId = settings.apiConfigurations[0].id
    settings.apiKeySet = true
    const onCopyApiKey = vi.fn()
    const onCreateApiConfiguration = vi.fn(async () => undefined)
    const onMoveApiConfiguration = vi.fn(async () => undefined)

    render(
      <SettingsPanel
        onClose={vi.fn()}
        onCopyApiKey={onCopyApiKey}
        onCreateApiConfiguration={onCreateApiConfiguration}
        onMoveApiConfiguration={onMoveApiConfiguration}
        onSave={vi.fn()}
        settings={settings}
      />
    )

    expect(screen.getByText('主线路')).toBeInTheDocument()
    expect(screen.getByText('备用线路')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '复制 API Key' }))
    await waitFor(() => expect(onCopyApiKey).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: '上移 备用线路' }))
    await waitFor(() => expect(onMoveApiConfiguration).toHaveBeenCalledWith('backup', 'up'))
    fireEvent.change(screen.getByLabelText('新配置名称'), { target: { value: '面试线路' } })
    fireEvent.click(screen.getByRole('button', { name: '新建配置' }))
    await waitFor(() => expect(onCreateApiConfiguration).toHaveBeenCalledWith('面试线路'))
  })

  it('restores the default hotkeys in the form without saving immediately', async () => {
    const settings = createDefaultSettings()
    settings.hotkeys.capture = 'Control+Q'
    const onSave = vi.fn()
    render(<SettingsPanel onClose={vi.fn()} onSave={onSave} settings={settings} />)

    fireEvent.click(screen.getByRole('button', { name: '恢复默认按键' }))

    expect(screen.getByLabelText('截图快捷键')).toHaveValue('MouseLeftDoubleClick')
    expect(screen.getByLabelText('发送快捷键')).toHaveValue('MouseRightDoubleClick')
    expect(onSave).not.toHaveBeenCalled()
  })
})

describe('App hotkey scrolling', () => {
  it('scrolls the answer region when global scroll actions arrive', async () => {
    let onHotkey: ((action: HotkeyAction) => void) | undefined
    const settings = createDefaultSettings()
    settings.apiConfigurations[0].name = '主线路'
    const api: PracticeApi = {
      answer: {
        cancel: vi.fn(),
        onEvent: vi.fn(() => () => undefined),
        start: vi.fn()
      },
      app: { quit: vi.fn() },
      capture: { primary: vi.fn() },
      conversation: { clear: vi.fn() },
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
        activateApiConfiguration: vi.fn(async () => settings),
        clearApiKey: vi.fn(async () => settings),
        copyApiKey: vi.fn(),
        createApiConfiguration: vi.fn(async () => settings),
        deleteApiConfiguration: vi.fn(async () => settings),
        get: vi.fn(async () => settings),
        moveApiConfiguration: vi.fn(async () => settings),
        onChange: vi.fn(() => () => undefined),
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

  it('toggles ghost mode and resets it on pointer-through change', async () => {
    let onHotkey: ((action: HotkeyAction) => void) | undefined
    const settings = createDefaultSettings()
    const api: PracticeApi = {
      answer: {
        cancel: vi.fn(),
        onEvent: vi.fn(() => () => undefined),
        start: vi.fn()
      },
      app: { quit: vi.fn() },
      capture: { primary: vi.fn() },
      conversation: { clear: vi.fn() },
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
        activateApiConfiguration: vi.fn(async () => settings),
        clearApiKey: vi.fn(async () => settings),
        copyApiKey: vi.fn(),
        createApiConfiguration: vi.fn(async () => settings),
        deleteApiConfiguration: vi.fn(async () => settings),
        get: vi.fn(async () => settings),
        moveApiConfiguration: vi.fn(async () => settings),
        onChange: vi.fn(() => () => undefined),
        save: vi.fn(async () => settings)
      },
      window: { hide: vi.fn(), setOpacity: vi.fn(), toggle: vi.fn() }
    }
    Object.defineProperty(window, 'practice', { configurable: true, value: api })

    const { container } = render(<App />)
    const shell = container.querySelector('.app-shell')!
    await waitFor(() => expect(onHotkey).toBeTypeOf('function'))

    expect(shell).not.toHaveClass('ghost-mode')

    // Toggling ghost-mode adds class
    onHotkey?.('ghost-mode')
    await waitFor(() => expect(shell).toHaveClass('ghost-mode'))

    // Toggling pointer-through resets ghost mode
    onHotkey?.('pointer-through')
    await waitFor(() => expect(shell).not.toHaveClass('ghost-mode'))
  })
})
