import { useCallback, useEffect, useReducer, useRef, useState } from 'react'

import type { PublicSettings, SettingsPatch } from '../shared/protocol'
import { MarkdownAnswer } from './components/MarkdownAnswer'
import { KnowledgeBasePanel } from './components/KnowledgeBasePanel'
import { SettingsPanel } from './components/SettingsPanel'
import { appReducer, initialAppState } from './state'

const ANSWER_SCROLL_STEP = 180

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请重试'
}

export function App() {
  const [state, dispatch] = useReducer(appReducer, initialAppState)
  const [settings, setSettings] = useState<PublicSettings>()
  const [showKnowledge, setShowKnowledge] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [isGhostMode, setIsGhostMode] = useState(false)
  const [message, setMessage] = useState('')
  const answerRegionRef = useRef<HTMLElement>(null)
  const messageRef = useRef(message)
  messageRef.current = message
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const isNearBottomRef = useRef(true)

  const handleScroll = useCallback(() => {
    const el = answerRegionRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight)
    isNearBottomRef.current = distFromBottom <= 120
  }, [])

  useEffect(() => {
    const el = answerRegionRef.current
    if (!el) return
    if (isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [state.turns])

  const capture = useCallback(async () => {
    try {
      dispatch({ result: await window.practice.capture.primary(), type: 'capture-success' })
    } catch (error) {
      dispatch({ message: errorMessage(error), type: 'local-error' })
    }
  }, [])

  const answer = useCallback(async () => {
    try {
      const isRemoteOnly = Boolean(
        settingsRef.current?.remoteCompanion?.enabled &&
        settingsRef.current?.remoteCompanion?.outputTarget === 'remote-only'
      )
      const { requestId, turnId } = await window.practice.answer.start({ text: messageRef.current })
      if (!isRemoteOnly) {
        isNearBottomRef.current = true
        dispatch({ requestId, turnId, type: 'turn-start', userText: messageRef.current })
      }
      setMessage('')
      dispatch({ type: 'capture-clear' })
    } catch (error) {
      dispatch({ message: errorMessage(error), type: 'local-error' })
    }
  }, [])

  const clearConversation = useCallback(async () => {
    try {
      await window.practice.conversation.clear()
      setMessage('')
      isNearBottomRef.current = true
      dispatch({ type: 'conversation-clear' })
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
      const isRemoteOnly = Boolean(
        settingsRef.current?.remoteCompanion?.enabled &&
        settingsRef.current?.remoteCompanion?.outputTarget === 'remote-only'
      )
      if (isRemoteOnly) return

      if (event.type === 'delta') {
        dispatch({ delta: event.delta, requestId: event.requestId, turnId: event.turnId, type: 'stream-delta' })
      } else if (event.type === 'done') {
        dispatch({ requestId: event.requestId, turnId: event.turnId, type: 'stream-done' })
      } else {
        dispatch({ message: event.message, requestId: event.requestId, turnId: event.turnId, type: 'stream-error' })
      }
    })
    const removeHotkeyListener = window.practice.hotkeys.onAction((action) => {
      if (action === 'capture') void capture()
      if (action === 'answer') void answer()
      if (action === 'clear') void clearConversation()
      if (action === 'settings') setShowSettings(true)
      if (action === 'ghost-mode') setIsGhostMode((prev) => !prev)
      if (action === 'pointer-through') setIsGhostMode(false)
      if (action === 'scroll-down' || action === 'scroll-up') {
        const el = answerRegionRef.current
        if (!el) return
        el.scrollBy({
          behavior: 'smooth',
          top: action === 'scroll-down' ? ANSWER_SCROLL_STEP : -ANSWER_SCROLL_STEP
        })
        setTimeout(() => {
          if (el) {
            const distFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight)
            isNearBottomRef.current = distFromBottom <= 120
          }
        }, 200)
      }
    })
    const removeSettingsListener = window.practice.settings.onChange((nextSettings) => {
      setSettings(nextSettings)
      setMessage('')
      dispatch({ type: 'conversation-clear' })
    })
    return () => {
      removeAnswerListener()
      removeHotkeyListener()
      removeSettingsListener()
    }
  }, [answer, capture, clearConversation])

  const saveSettings = async (patch: SettingsPatch) => {
    const saved = await window.practice.settings.save(patch)
    setSettings(saved)
    setShowSettings(false)
  }

  const captureStatus = state.capture
    ? new Date(state.capture.capturedAt).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    : undefined

  return (
    <main className={`app-shell ${isGhostMode ? 'ghost-mode' : ''}`}>
      <header className="titlebar">
        <div className="brand-mark">P</div>
        <div className="brand-copy">
          <strong>Practice Copilot</strong>
          {settings && <span className="configuration-badge">{settings.apiConfigurations.find((configuration) => configuration.id === settings.activeApiConfigurationId)?.name}</span>}
          {settings && <span className="prompt-template-badge">提示词：{settings.promptTemplates.find((template) => template.id === settings.activePromptTemplateId)?.name}</span>}
          <span>{captureStatus ? `已捕获 ${state.capture?.count} 张 · ${captureStatus}` : '左键双击截图 · 右键双击发送'}</span>
        </div>
        <div className="title-actions">
          <button aria-label="新建对话" className="icon-button" onClick={() => void clearConversation()}>
            +
          </button>
          <button aria-label="打开知识库" className="icon-button" onClick={() => setShowKnowledge(true)}>
            K
          </button>
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

      <section aria-label="模型回答" className="answer-region" onScroll={handleScroll} ref={answerRegionRef}>
        {Boolean(settings?.remoteCompanion?.enabled && settings?.remoteCompanion?.outputTarget === 'remote-only') ? (
          isGhostMode ? null : (
            <div className="answer-empty">
              <span>已开启「仅远端副屏显示」</span>
              <small>题目与回答仅在手机副屏实时流式呈现，桌面保持静默无痕</small>
            </div>
          )
        ) : state.turns.length === 0 ? (
          isGhostMode ? null : <MarkdownAnswer content="" />
        ) : (
          <div className="conversation-transcript">
            {state.turns.map((turn) => (
              <div className="conversation-turn" key={turn.id}>
                {!isGhostMode && <div className="user-message">{turn.userText || '请分析当前截图。'}</div>}
                <MarkdownAnswer content={turn.assistantText} streaming={turn.status === 'streaming'} />
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="prompt-footer">
          <textarea
          aria-label="输入问题"
          maxLength={8000}
          placeholder="输入问题，或结合截图继续追问…"
          rows={2}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <div className="shortcut-strip">
          <span>左键双击截图</span>
          <span>右键双击发送</span>
          <span>中键双击清空</span>
          <button onClick={() => void clearConversation()} type="button">清除截图</button>
          <button onClick={() => void answer()} type="button">发送</button>
        </div>
      </footer>

      {showSettings && settings && (
        <SettingsPanel
          key={`${settings.activeApiConfigurationId}:${settings.activePromptTemplateId}`}
          onActivateApiConfiguration={async (id) => setSettings(await window.practice.settings.activateApiConfiguration(id))}
          onClearApiKey={async () => setSettings(await window.practice.settings.clearApiKey())}
          onClose={() => setShowSettings(false)}
          onCopyApiKey={() => window.practice.settings.copyApiKey()}
          onCreateApiConfiguration={async (name) => setSettings(await window.practice.settings.createApiConfiguration(name))}
          onDeleteApiConfiguration={async (id) => setSettings(await window.practice.settings.deleteApiConfiguration(id))}
          onMoveApiConfiguration={async (id, direction) => setSettings(await window.practice.settings.moveApiConfiguration(id, direction))}
          onActivatePromptTemplate={async (id) => setSettings(await window.practice.settings.activatePromptTemplate(id))}
          onCreatePromptTemplate={async (name) => setSettings(await window.practice.settings.createPromptTemplate(name))}
          onDeletePromptTemplate={async (id) => setSettings(await window.practice.settings.deletePromptTemplate(id))}
          onMovePromptTemplate={async (id, direction) => setSettings(await window.practice.settings.movePromptTemplate(id, direction))}
          onOpacityPreview={(opacity) => {
            void window.practice.window.setOpacity(opacity)
          }}
          onSave={saveSettings}
          settings={settings}
        />
      )}
      {showKnowledge && settings && (
        <KnowledgeBasePanel
          onClose={() => setShowKnowledge(false)}
          onSettingsChange={async () => setSettings(await window.practice.settings.get())}
          settings={settings}
        />
      )}
    </main>
  )
}
