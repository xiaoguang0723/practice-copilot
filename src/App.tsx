import { useCallback, useEffect, useReducer, useRef, useState } from 'react'

import type { PublicSettings, SettingsPatch } from '../shared/protocol'
import { MarkdownAnswer } from './components/MarkdownAnswer'
import { SettingsPanel } from './components/SettingsPanel'
import { appReducer, initialAppState } from './state'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请重试'
}

export function App() {
  const [state, dispatch] = useReducer(appReducer, initialAppState)
  const [settings, setSettings] = useState<PublicSettings>()
  const [showSettings, setShowSettings] = useState(false)
  const [extraPrompt, setExtraPrompt] = useState('')
  const promptRef = useRef(extraPrompt)
  promptRef.current = extraPrompt

  const capture = useCallback(async () => {
    try {
      dispatch({ result: await window.practice.capture.primary(), type: 'capture-success' })
    } catch (error) {
      dispatch({ message: errorMessage(error), type: 'local-error' })
    }
  }, [])

  const answer = useCallback(async () => {
    try {
      const { requestId } = await window.practice.answer.start({ extraPrompt: promptRef.current })
      dispatch({ requestId, type: 'stream-start' })
    } catch (error) {
      dispatch({ message: errorMessage(error), type: 'local-error' })
    }
  }, [])

  useEffect(() => {
    void window.practice.settings.get().then((loaded) => {
      setSettings(loaded)
      if (!loaded.apiKeySet) setShowSettings(true)
    })
    const removeAnswerListener = window.practice.answer.onEvent((event) => {
      if (event.type === 'delta') {
        dispatch({ delta: event.delta, requestId: event.requestId, type: 'stream-delta' })
      } else if (event.type === 'done') {
        dispatch({ requestId: event.requestId, type: 'stream-done' })
      } else {
        dispatch({ message: event.message, requestId: event.requestId, type: 'stream-error' })
      }
    })
    const removeHotkeyListener = window.practice.hotkeys.onAction((action) => {
      if (action === 'capture') void capture()
      if (action === 'answer') void answer()
      if (action === 'settings') setShowSettings(true)
    })
    return () => {
      removeAnswerListener()
      removeHotkeyListener()
    }
  }, [answer, capture])

  const saveSettings = async (patch: SettingsPatch) => {
    const saved = await window.practice.settings.save(patch)
    setSettings(saved)
    setShowSettings(false)
  }

  const capturedTime = state.capture
    ? new Date(state.capture.capturedAt).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    : undefined

  return (
    <main className="app-shell">
      <header className="titlebar">
        <div className="brand-mark">P</div>
        <div className="brand-copy">
          <strong>Practice Copilot</strong>
          <span>{capturedTime ? `已捕获 · ${capturedTime}` : 'Alt+Q 截图 · Alt+W 发送'}</span>
        </div>
        <div className="title-actions">
          <button aria-label="打开设置" className="icon-button" onClick={() => setShowSettings(true)}>
            ⚙
          </button>
          <button aria-label="隐藏窗口" className="icon-button" onClick={() => void window.practice.window.hide()}>
            —
          </button>
        </div>
      </header>

      {state.error && (
        <div className="error-banner">
          <span>{state.error}</span>
        </div>
      )}

      <section className="answer-region">
        <MarkdownAnswer content={state.answer} streaming={state.phase === 'streaming'} />
      </section>

      <footer className="prompt-footer">
        <textarea
          aria-label="临时提示词"
          maxLength={8000}
          placeholder="临时补充提示词，例如：只给出 Python 代码…"
          rows={2}
          value={extraPrompt}
          onChange={(event) => setExtraPrompt(event.target.value)}
        />
        <div className="shortcut-strip">
          <span><kbd>Alt</kbd> + <kbd>Q</kbd> 截图</span>
          <span><kbd>Alt</kbd> + <kbd>W</kbd> 发送</span>
          <button onClick={() => void answer()} type="button">发送</button>
        </div>
      </footer>

      {showSettings && settings && (
        <SettingsPanel
          onClearApiKey={async () => setSettings(await window.practice.settings.clearApiKey())}
          onClose={() => setShowSettings(false)}
          onSave={saveSettings}
          settings={settings}
        />
      )}
    </main>
  )
}
