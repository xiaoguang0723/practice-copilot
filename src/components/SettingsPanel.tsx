import { useState, type FormEvent } from 'react'

import type { PublicSettings, SettingsPatch } from '../../shared/protocol'
import { validateSettingsPatch } from '../../shared/validation'

export interface SettingsPanelProps {
  onActivateApiConfiguration?(id: string): Promise<void> | void
  onClearApiKey?: () => Promise<void>
  onClose(): void
  onCopyApiKey?: () => Promise<void> | void
  onCreateApiConfiguration?(name: string): Promise<void> | void
  onDeleteApiConfiguration?(id: string): Promise<void> | void
  onMoveApiConfiguration?(id: string, direction: 'up' | 'down'): Promise<void> | void
  onOpacityPreview?(opacity: number): void
  onSave(patch: SettingsPatch): Promise<void> | void
  settings: PublicSettings
}

export function SettingsPanel({
  onActivateApiConfiguration,
  onClearApiKey,
  onClose,
  onCopyApiKey,
  onCreateApiConfiguration,
  onDeleteApiConfiguration,
  onMoveApiConfiguration,
  onOpacityPreview,
  onSave,
  settings
}: SettingsPanelProps) {
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl)
  const [apiConfigName, setApiConfigName] = useState(activeConfiguration(settings).name)
  const [apiProtocol, setApiProtocol] = useState<'chat' | 'response'>(settings.apiProtocol)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(settings.model)
  const [newConfigurationName, setNewConfigurationName] = useState('')
  const [opacity, setOpacity] = useState(settings.opacity)
  const [persistentPrompt, setPersistentPrompt] = useState(settings.persistentPrompt)
  const [hotkeys, setHotkeys] = useState({ ...settings.hotkeys })
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  const cancel = () => {
    onOpacityPreview?.(settings.opacity)
    onClose()
  }

  const runOperation = async (operation: () => Promise<void> | void) => {
    setError(undefined)
    try {
      await operation()
    } catch (operationError) {
      setError(operationError instanceof Error ? operationError.message : '操作失败，请重试')
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const patch: SettingsPatch = {
      apiConfigName,
      apiKey,
      apiProtocol,
      baseUrl,
      hotkeys,
      model,
      opacity,
      persistentPrompt
    }
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

  const createConfiguration = () => {
    const name = newConfigurationName.trim()
    if (!name) {
      setError('请输入配置名称')
      return
    }
    if (name.length > 80) {
      setError('配置名称必须为 1 到 80 个字符')
      return
    }
    void runOperation(async () => {
      await onCreateApiConfiguration?.(name)
      setNewConfigurationName('')
    })
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

        <section aria-label="API 配置列表" className="api-configuration-section">
          <div className="configuration-section-heading">
            <span>API 配置</span>
            <small><kbd>Alt</kbd> + <kbd>M</kbd> 切换</small>
          </div>
          <div className="api-configuration-list">
            {settings.apiConfigurations.map((configuration, index) => (
              <div className={`api-configuration-row ${configuration.id === settings.activeApiConfigurationId ? 'active' : ''}`} key={configuration.id}>
                <button
                  aria-label={`使用配置 ${configuration.name}`}
                  className="configuration-name"
                  onClick={() => void runOperation(() => onActivateApiConfiguration?.(configuration.id))}
                  type="button"
                >
                  {configuration.name}
                </button>
                <button aria-label={`上移 ${configuration.name}`} className="configuration-order" disabled={index === 0} onClick={() => void runOperation(() => onMoveApiConfiguration?.(configuration.id, 'up'))} type="button">↑</button>
                <button aria-label={`下移 ${configuration.name}`} className="configuration-order" disabled={index === settings.apiConfigurations.length - 1} onClick={() => void runOperation(() => onMoveApiConfiguration?.(configuration.id, 'down'))} type="button">↓</button>
                <button aria-label={`删除 ${configuration.name}`} className="configuration-delete" disabled={settings.apiConfigurations.length === 1} onClick={() => void runOperation(() => onDeleteApiConfiguration?.(configuration.id))} type="button">×</button>
              </div>
            ))}
          </div>
          <div className="configuration-create">
            <input aria-label="新配置名称" maxLength={80} placeholder="新配置名称" value={newConfigurationName} onChange={(event) => setNewConfigurationName(event.target.value)} />
            <button className="secondary-button" onClick={createConfiguration} type="button">新建配置</button>
          </div>
        </section>

        <label>
          <span>配置名称</span>
          <input aria-label="配置名称" maxLength={80} value={apiConfigName} onChange={(event) => setApiConfigName(event.target.value)} />
        </label>
        <label>
          <span>API 接口协议</span>
          <select aria-label="API 接口协议" value={apiProtocol} onChange={(event) => setApiProtocol(event.target.value as 'chat' | 'response')}>
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
          <div className="api-key-input">
            <input autoComplete="off" placeholder={settings.apiKeySet ? '留空以保留当前密钥' : 'sk-…'} type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
            <button aria-label="复制 API Key" className="secondary-button" disabled={!settings.apiKeySet} onClick={() => void runOperation(() => onCopyApiKey?.())} type="button">复制</button>
          </div>
        </label>
        <label>
          <span>模型名</span>
          <input value={model} onChange={(event) => setModel(event.target.value)} />
        </label>
        <label>
          <span>窗口透明度 {Math.round(opacity * 100)}%</span>
          <input aria-label="窗口透明度" max="95" min="35" onChange={(event) => {
            const nextOpacity = Number(event.target.value) / 100
            setOpacity(nextOpacity)
            onOpacityPreview?.(nextOpacity)
          }} step="1" type="range" value={Math.round(opacity * 100)} />
        </label>
        <label>
          <span>持久化提示词</span>
          <textarea maxLength={8000} placeholder="例如：重点覆盖数据结构与算法，优先使用 JavaScript。" rows={4} value={persistentPrompt} onChange={(event) => setPersistentPrompt(event.target.value)} />
        </label>

        <div className="hotkey-grid">
          {([
            ['capture', '截图'],
            ['answer', '发送'],
            ['clear', '清空截图'],
            ['toggle', '显示 / 隐藏'],
            ['quit', '退出']
          ] as const).map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <input value={hotkeys[key]} onChange={(event) => setHotkeys((current) => ({ ...current, [key]: event.target.value }))} />
            </label>
          ))}
        </div>

        {error && <div className="form-error">{error}</div>}
        <div className="settings-actions">
          {settings.apiKeySet && onClearApiKey && <button className="danger-link" onClick={() => void runOperation(onClearApiKey)} type="button">清除密钥</button>}
          <span className="action-spacer" />
          <button className="secondary-button" onClick={cancel} type="button">取消</button>
          <button className="primary-button" disabled={saving} type="submit">{saving ? '保存中…' : '保存设置'}</button>
        </div>
      </form>
    </div>
  )
}

function activeConfiguration(settings: PublicSettings) {
  return settings.apiConfigurations.find((configuration) => configuration.id === settings.activeApiConfigurationId)
    ?? settings.apiConfigurations[0]
}
