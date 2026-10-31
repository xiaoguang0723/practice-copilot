import { useCallback, useEffect, useReducer, useRef, useState } from 'react'

import type { AudioStateEvent, PublicSettings, SettingsPatch } from '../shared/protocol'
import { SystemAudioListener } from './audio-listener'
import { MarkdownAnswer } from './components/MarkdownAnswer'
import { KnowledgeBasePanel } from './components/KnowledgeBasePanel'
import { SettingsPanel } from './components/SettingsPanel'
import { appReducer, initialAppState } from './state'

const ANSWER_SCROLL_STEP = 180

const INITIAL_AUDIO_STATE: AudioStateEvent = {
  listening: false,
  speaking: false,
  transcribing: false,
  transcript: ''
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请重试'
}

export function App() {
  const [state, dispatch] = useReducer(appReducer, initialAppState)
  const [settings, setSettings] = useState<PublicSettings>()
  const [showKnowledge, setShowKnowledge] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [isGhostMode, setIsGhostMode] = useState(false)
  const [audioState, setAudioState] = useState<AudioStateEvent>(INITIAL_AUDIO_STATE)
  const [message, setMessage] = useState('')
  const answerRegionRef = useRef<HTMLElement>(null)
  const audioListenerRef = useRef<SystemAudioListener | null>(null)
  const messageRef = useRef(message)
  messageRef.current = message
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const audioStateRef = useRef(audioState)
  audioStateRef.current = audioState
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
  }, [state.turns, audioState.transcript])

  const capture = useCallback(async () => {
    try {
      dispatch({ result: await window.practice.capture.primary(), type: 'capture-success' })
    } catch (error) {
      dispatch({ message: errorMessage(error), type: 'local-error' })
    }
  }, [])

  const importImageFile = useCallback(async () => {
    try {
      const result = await window.practice.capture.importImageFile()
      if (result) dispatch({ result, type: 'capture-success' })
    } catch (error) {
      dispatch({ message: errorMessage(error), type: 'local-error' })
    }
  }, [])

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const image = Array.from(event.clipboardData?.files ?? []).find((file) => file.type.startsWith('image/'))
      if (!image) return
      event.preventDefault()
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result !== 'string') return
        void window.practice.capture
          .importImage(reader.result)
          .then((result) => dispatch({ result, type: 'capture-success' }))
          .catch((error) => dispatch({ message: errorMessage(error), type: 'local-error' }))
      }
      reader.readAsDataURL(image)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const answer = useCallback(async () => {
    try {
      if (audioListenerRef.current) {
        await audioListenerRef.current.flushNow()
      }
      const latestAudio = await window.practice.audio?.getState()
      const transcriptPart = (latestAudio?.transcript ?? audioStateRef.current.transcript).trim()
      const manualPart = messageRef.current.trim()
      const combinedText = [transcriptPart, manualPart].filter(Boolean).join('\n')

      const isRemoteOnly = Boolean(
        settingsRef.current?.remoteCompanion?.enabled &&
        settingsRef.current?.remoteCompanion?.outputTarget === 'remote-only'
      )
      const { requestId, turnId } = await window.practice.answer.start({ text: combinedText })
      if (!isRemoteOnly) {
        isNearBottomRef.current = true
        dispatch({ requestId, turnId, type: 'turn-start', userText: combinedText })
      }
      setMessage('')
      setAudioState((prev) => ({ ...prev, error: undefined, transcript: '' }))
      dispatch({ type: 'capture-clear' })
    } catch (error) {
      dispatch({ message: errorMessage(error), type: 'local-error' })
    }
  }, [])

  const clearConversation = useCallback(async () => {
    try {
      await window.practice.conversation.clear()
      setMessage('')
      setAudioState((prev) => ({ ...prev, error: undefined, transcript: '' }))
      isNearBottomRef.current = true
      dispatch({ type: 'conversation-clear' })
    } catch (error) {
      dispatch({ message: errorMessage(error), type: 'local-error' })
    }
  }, [])

  const toggleAudio = useCallback(async () => {
    try {
      if (window.practice.audio?.toggle) {
        const next = await window.practice.audio.toggle()
        setAudioState(next)
      }
    } catch (error) {
      dispatch({ message: errorMessage(error), type: 'local-error' })
    }
  }, [])

  useEffect(() => {
    if (!audioState.listening) {
      audioListenerRef.current?.stop()
      audioListenerRef.current = null
      return
    }

    const listener = new SystemAudioListener({
      onAudioChunk: async (wavBase64) => {
        if (window.practice.audio?.transcribe) {
          const updated = await window.practice.audio.transcribe(wavBase64)
          setAudioState(updated)
        }
      },
      onError: (msg) => {
        dispatch({ message: msg, type: 'local-error' })
      },
      onSpeakingChange: (speaking) => {
        setAudioState((prev) => ({ ...prev, speaking }))
        void window.practice.audio?.setSpeaking(speaking)
      }
    })
    audioListenerRef.current = listener
    void listener.start()

    return () => {
      listener.stop()
      if (audioListenerRef.current === listener) {
        audioListenerRef.current = null
      }
    }
  }, [audioState.listening])

  useEffect(() => {
    void window.practice.settings.get().then((loaded) => {
      setSettings(loaded)
      if (!loaded.apiKeySet) setShowSettings(true)
    })
    if (window.practice.audio?.getState) {
      void window.practice.audio.getState().then((initialAudio) => {
        setAudioState(initialAudio)
      })
    }
    const removeAudioListener = window.practice.audio?.onState
      ? window.practice.audio.onState((nextAudioState) => {
          setAudioState(nextAudioState)
        })
      : () => undefined

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
    const removeCapturePushedListener = window.practice.capture.onPushed
      ? window.practice.capture.onPushed((result) => {
          dispatch({ result, type: 'capture-success' })
        })
      : () => undefined
    const removeClearedListener = window.practice.conversation.onCleared
      ? window.practice.conversation.onCleared(() => {
          setMessage('')
          setAudioState((prev) => ({ ...prev, error: undefined, transcript: '' }))
          dispatch({ type: 'conversation-clear' })
        })
      : () => undefined
    const removeSettingsListener = window.practice.settings.onChange((nextSettings) => {
      setSettings(nextSettings)
      setMessage('')
      dispatch({ type: 'conversation-clear' })
    })
    return () => {
      removeAudioListener()
      removeAnswerListener()
      removeHotkeyListener()
      removeCapturePushedListener()
      removeClearedListener()
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
  const protectedWindowTitles = state.capture?.protectedWindows ?? []
  const rescuedWindowTitles = state.capture?.rescuedWindows ?? []
  const missingWindowTitles = protectedWindowTitles.filter((title) => !rescuedWindowTitles.includes(title))

  const isRemoteOnly = Boolean(
    settings?.remoteCompanion?.enabled && settings?.remoteCompanion?.outputTarget === 'remote-only'
  )

  return (
    <main className={`app-shell ${isGhostMode ? 'ghost-mode' : ''} ${audioState.listening ? 'audio-mode' : ''}`}>
      <header className="titlebar">
        <div className="brand-mark">P</div>
        <div className="brand-copy">
          <strong>Practice Copilot</strong>
          {settings && <span className="configuration-badge">{settings.apiConfigurations.find((configuration) => configuration.id === settings.activeApiConfigurationId)?.name}</span>}
          {settings && <span className="prompt-template-badge">提示词：{settings.promptTemplates.find((template) => template.id === settings.activePromptTemplateId)?.name}</span>}
          <span title={protectedWindowTitles.length ? (rescuedWindowTitles.length ? `已补拍防截屏窗口内容：${rescuedWindowTitles.join('、')}${missingWindowTitles.length ? `；仍缺失：${missingWindowTitles.join('、')}` : ''}` : `以下窗口处于防截屏保护，截图中不含其内容：${missingWindowTitles.join('、')}`) : undefined}>
            {audioState.listening
              ? `● 音频听写开启 (${settings?.hotkeys.audioToggle ?? 'Alt+S'})${captureStatus ? ` · 已捕获 ${state.capture?.count} 张` : ''}`
              : captureStatus
                ? `已捕获 ${state.capture?.count} 张 · ${captureStatus}${rescuedWindowTitles.length ? ` · ✓ 已补拍 ${rescuedWindowTitles.join('、')}` : ''}${missingWindowTitles.length ? ` · ⚠ 缺失防截屏窗口 ${missingWindowTitles.join('、')}` : ''}`
                : '左键双击截图 · 右键双击发送 · Ctrl+V 贴入图片'}
          </span>
        </div>
        <div className="title-actions">
          <button
            aria-label={audioState.listening ? '关闭音频听写' : '开启音频听写'}
            className={`icon-button ${audioState.listening ? 'active-audio-button' : ''}`}
            onClick={() => void toggleAudio()}
            title={`系统音频听写 (${settings?.hotkeys.audioToggle ?? 'Alt+S'})`}
          >
            🎙
          </button>
          <button aria-label="新建对话" className="icon-button" onClick={() => void clearConversation()}>
            +
          </button>
          <button aria-label="打开知识库" className="icon-button" onClick={() => setShowKnowledge(true)}>
            K
          </button>
          <button aria-label="导入图片" className="icon-button" onClick={() => void importImageFile()}>
            📷
          </button>
          <button aria-label="打开设置" className="icon-button" onClick={() => setShowSettings(true)}>
            ⚙
          </button>
          <button aria-label="隐藏窗口" className="icon-button" onClick={() => void window.practice.window.hide()}>
            —
          </button>
        </div>
      </header>

      {(state.error || audioState.error) && (
        <div className="error-banner">
          <span>{state.error || audioState.error}</span>
        </div>
      )}

      <section aria-label="模型回答" className="answer-region" onScroll={handleScroll} ref={answerRegionRef}>
        {!isRemoteOnly && !isGhostMode && (audioState.listening || Boolean(audioState.transcript)) && (
          <div aria-label="实时语音听写" className="live-transcript-bar">
            <div className="live-transcript-header">
              <span className={`audio-status-dot ${audioState.speaking || audioState.transcribing ? 'pulsing' : ''}`} />
              <strong>
                {audioState.transcribing
                  ? '正在转写系统语音…'
                  : audioState.speaking
                    ? '正在收音（检测到系统声音）…'
                    : '系统音频后台听写中'}
              </strong>
              <small>右键双击立即发送 · 中键双击清空</small>
            </div>
            <div className="live-transcript-content">
              {audioState.transcript ? (
                <span>{audioState.transcript}</span>
              ) : (
                <span className="live-transcript-placeholder">
                  {audioState.speaking ? '正在录制当前语句…' : '等待系统声音播放…'}
                </span>
              )}
              {audioState.listening && <span aria-hidden="true" className="stream-cursor audio-cursor" />}
            </div>
          </div>
        )}

        {!isRemoteOnly && isGhostMode && (audioState.listening || Boolean(audioState.transcript)) && (
          <div aria-label="隐身模式实时听写" className="ghost-live-transcript">
            {audioState.transcript ? (
              <span>{audioState.transcript}</span>
            ) : audioState.transcribing ? (
              <span>正在转写…</span>
            ) : audioState.speaking ? (
              <span>正在收音…</span>
            ) : null}
            {audioState.listening && (
              <span aria-label="音频模式红色光标" className="stream-cursor audio-cursor" />
            )}
          </div>
        )}

        {isRemoteOnly ? (
          isGhostMode ? null : (
            <div className="answer-empty">
              <span>已开启「仅远端副屏显示」</span>
              <small>题目与回答仅在手机副屏实时流式呈现，桌面保持静默无痕</small>
            </div>
          )
        ) : state.turns.length === 0 ? (
          isGhostMode || audioState.listening || Boolean(audioState.transcript) ? null : <MarkdownAnswer content="" />
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
          placeholder={audioState.listening ? '系统语音自动听写中，也可在此补充问题后右键双击发送…' : '输入问题，或结合截图继续追问…'}
          rows={2}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <div className="shortcut-strip">
          <span>左键双击截图</span>
          <span>右键双击发送</span>
          <span>{settings?.hotkeys.audioToggle ?? 'Alt+S'} 音频听写</span>
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
