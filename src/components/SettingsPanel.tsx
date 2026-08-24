import { useState, type FormEvent } from 'react'

import type { PublicSettings, SettingsPatch } from '../../shared/protocol'
import { validateSettingsPatch } from '../../shared/validation'

export interface SettingsPanelProps {
  onClearApiKey?: () => Promise<void>
  onClose(): void
  onOpacityPreview?(opacity: number): void
  onSave(patch: SettingsPatch): Promise<void> | void
  settings: PublicSettings
}

export function SettingsPanel({
  onClearApiKey,
  onClose,
  onOpacityPreview,
  onSave,
  settings
}: SettingsPanelProps) {
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl)
  const [apiProtocol, setApiProtocol] = useState<'chat' | 'response'>(settings.apiProtocol ?? 'chat')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(settings.model)
  const [opacity, setOpacity] = useState(settings.opacity)
  const [persistentPrompt, setPersistentPrompt] = useState(settings.persistentPrompt)
  const [hotkeys, setHotkeys] = useState({ ...settings.hotkeys })
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  const cancel = () => {
    onOpacityPreview?.(settings.opacity)
    onClose()
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const patch: SettingsPatch = { apiKey, apiProtocol, baseUrl, hotkeys, model, opacity, persistentPrompt }
    const validation = validateSettingsPatch(patch)
    if (!validation.ok) {
      setError(validation.message)
      return
    }
    setSaving(true)
    setError(undefined)
    try {
      await onSave(patch)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '设置保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-backdrop">
      <form className="settings-panel" onSubmit={submit}>
        <div className="settings-heading">
          <div>
            <span className="eyebrow">SETTINGS</span>
            <h2>连接与快捷键</h2>
          </div>
          <button aria-label="关闭设置" className="icon-button" onClick={cancel} type="button">
            ×
          </button>
        </div>

        <label>
          <span>API 接口协议</span>
          <select
            aria-label="API 接口协议"
            value={apiProtocol}
            onChange={(event) => setApiProtocol(event.target.value as 'chat' | 'response')}
          >
            <option value="chat">Chat Completions (/chat/completions)</option>
            <option value="response">Response API (/responses)</option>
          </select>
        </label>
        <label>
          <span>API Base URL</span>
          <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
        </label>
        <label>
          <span>API Key {settings.apiKeySet && <small>已安全保存</small>}</span>
          <input
            autoComplete="off"
            placeholder={settings.apiKeySet ? '留空以保留当前密钥' : 'sk-…'}
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </label>
        <label>
          <span>模型名</span>
          <input value={model} onChange={(event) => setModel(event.target.value)} />
        </label>
        <label>
          <span>窗口透明度 {Math.round(opacity * 100)}%</span>
          <input
            aria-label="窗口透明度"
            max="95"
            min="35"
            onChange={(event) => {
              const nextOpacity = Number(event.target.value) / 100
              setOpacity(nextOpacity)
              onOpacityPreview?.(nextOpacity)
            }}
            step="1"
            type="range"
            value={Math.round(opacity * 100)}
          />
        </label>
        <label>
          <span>持久化提示词</span>
          <textarea
            maxLength={8000}
            placeholder="例如：重点覆盖数据结构与算法，优先使用 JavaScript。"
            rows={4}
            value={persistentPrompt}
            onChange={(event) => setPersistentPrompt(event.target.value)}
          />
        </label>

        <div className="hotkey-grid">
          {(
            [
              ['capture', '截图'],
              ['answer', '发送'],
              ['clear', '清空截图'],
              ['toggle', '显示 / 隐藏'],
              ['scrollUp', '向上滚动回答'],
              ['scrollDown', '向下滚动回答'],
              ['quit', '退出']
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <input
                value={hotkeys[key]}
                onChange={(event) => setHotkeys((current) => ({ ...current, [key]: event.target.value }))}
              />
            </label>
          ))}
        </div>

        {error && <div className="form-error">{error}</div>}
        <div className="settings-actions">
          {settings.apiKeySet && onClearApiKey && (
            <button className="danger-link" onClick={() => void onClearApiKey()} type="button">
              清除密钥
            </button>
          )}
          <span className="action-spacer" />
          <button className="secondary-button" onClick={cancel} type="button">
            取消
          </button>
          <button className="primary-button" disabled={saving} type="submit">
            {saving ? '保存中…' : '保存设置'}
          </button>
        </div>
      </form>
    </div>
  )
}
