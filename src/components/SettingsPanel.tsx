import { useEffect, useState, type FormEvent } from 'react'

import { createDefaultSettings, type PublicSettings, type SettingsPatch } from '../../shared/protocol'
import { validateSettingsPatch } from '../../shared/validation'

export interface SettingsPanelProps {
  onActivateApiConfiguration?(id: string): Promise<void> | void
  onClearApiKey?: () => Promise<void>
  onClose(): void
  onCopyApiKey?: () => Promise<void> | void
  onCreateApiConfiguration?(name: string): Promise<void> | void
  onDeleteApiConfiguration?(id: string): Promise<void> | void
  onMoveApiConfiguration?(id: string, direction: 'up' | 'down'): Promise<void> | void
  onActivatePromptTemplate?(id: string): Promise<void> | void
  onCreatePromptTemplate?(name: string): Promise<void> | void
  onDeletePromptTemplate?(id: string): Promise<void> | void
  onMovePromptTemplate?(id: string, direction: 'up' | 'down'): Promise<void> | void
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
  onActivatePromptTemplate,
  onCreatePromptTemplate,
  onDeletePromptTemplate,
  onMovePromptTemplate,
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
  const [newPromptTemplateName, setNewPromptTemplateName] = useState('')
  const [opacity, setOpacity] = useState(settings.opacity)
  const [promptTemplateName, setPromptTemplateName] = useState(activePromptTemplate(settings).name)
  const [persistentPrompt, setPersistentPrompt] = useState(settings.persistentPrompt)
  const [hotkeys, setHotkeys] = useState({ ...settings.hotkeys })
  const [remoteEnabled, setRemoteEnabled] = useState(settings.remoteCompanion?.enabled ?? false)
  const [remoteIp, setRemoteIp] = useState(settings.remoteCompanion?.ip)
  const [remoteOutputTarget, setRemoteOutputTarget] = useState<'both' | 'remote-only'>(settings.remoteCompanion?.outputTarget ?? 'both')
  const [remoteStatus, setRemoteStatus] = useState<{ active: boolean; availableIps?: Array<{ address: string; name: string }>; clientCount: number; ip: string; port: number; qrDataUrl: string; url: string }>()
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [recordingKey, setRecordingKey] = useState<string>()

  useEffect(() => {
    if (window.practice?.remote?.getStatus) {
      void window.practice.remote.getStatus().then((status) => {
        setRemoteStatus(status)
      })
    }
  }, [remoteEnabled, remoteIp])

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
      promptTemplateName,
      persistentPrompt,
      remoteCompanion: {
        enabled: remoteEnabled,
        ip: remoteIp,
        outputTarget: remoteOutputTarget
      }
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

  const recordHotkey = async (key: keyof typeof hotkeys) => {
    setRecordingKey(key)
    setError(undefined)
    try {
      const value = await window.practice.hotkeys.record()
      setHotkeys((current) => ({ ...current, [key]: value }))
    } catch (recordError) {
      setError(recordError instanceof Error ? recordError.message : '快捷键录制失败')
    } finally {
      setRecordingKey(undefined)
    }
  }

  const resetHotkeys = () => {
    setHotkeys({ ...createDefaultSettings().hotkeys })
    setError(undefined)
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

  const createPromptTemplate = () => {
    const name = newPromptTemplateName.trim()
    if (!name) {
      setError('请输入提示词模板名称')
      return
    }
    if (name.length > 80) {
      setError('提示词模板名称必须为 1 到 80 个字符')
      return
    }
    void runOperation(async () => {
      await onCreatePromptTemplate?.(name)
      setNewPromptTemplateName('')
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
            <small>左右键同时按下切换</small>
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

        <section aria-label="提示词模板列表" className="api-configuration-section prompt-template-section">
          <div className="configuration-section-heading">
            <span>提示词模板</span>
            <small>右键长按 1 秒切换下一套</small>
          </div>
          <div className="api-configuration-list">
            {settings.promptTemplates.map((template, index) => (
              <div className={`api-configuration-row ${template.id === settings.activePromptTemplateId ? 'active' : ''}`} key={template.id}>
                <button
                  aria-label={`使用提示词 ${template.name}`}
                  className="configuration-name"
                  onClick={() => void runOperation(() => onActivatePromptTemplate?.(template.id))}
                  type="button"
                >
                  {template.name}
                </button>
                <button aria-label={`上移提示词 ${template.name}`} className="configuration-order" disabled={index === 0} onClick={() => void runOperation(() => onMovePromptTemplate?.(template.id, 'up'))} type="button">↑</button>
                <button aria-label={`下移提示词 ${template.name}`} className="configuration-order" disabled={index === settings.promptTemplates.length - 1} onClick={() => void runOperation(() => onMovePromptTemplate?.(template.id, 'down'))} type="button">↓</button>
                <button aria-label={`删除提示词 ${template.name}`} className="configuration-delete" disabled={settings.promptTemplates.length === 1} onClick={() => void runOperation(() => onDeletePromptTemplate?.(template.id))} type="button">×</button>
              </div>
            ))}
          </div>
          <div className="configuration-create">
            <input aria-label="新提示词模板名称" maxLength={80} placeholder="新提示词模板名称" value={newPromptTemplateName} onChange={(event) => setNewPromptTemplateName(event.target.value)} />
            <button className="secondary-button" onClick={createPromptTemplate} type="button">新建提示词模板</button>
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
          <span>提示词模板名称</span>
          <input aria-label="提示词模板名称" maxLength={80} value={promptTemplateName} onChange={(event) => setPromptTemplateName(event.target.value)} />
        </label>
        <label>
          <span>提示词内容</span>
          <textarea maxLength={8000} placeholder="例如：重点覆盖数据结构与算法，优先使用 JavaScript。" rows={4} value={persistentPrompt} onChange={(event) => setPersistentPrompt(event.target.value)} />
        </label>

        <div className="remote-companion-card">
          <div className="remote-companion-header">
            <div>
              <div className="remote-card-title">局域网远端副屏（免装 App）</div>
              <div className="remote-card-subtitle">手机扫码实时打字机接收回答，支持双端同步或主屏静默无痕</div>
            </div>
            <label className="remote-toggle-label">
              <input
                type="checkbox"
                checked={remoteEnabled}
                onChange={(e) => setRemoteEnabled(e.target.checked)}
              />
              <span>{remoteEnabled ? '已启用' : '已关闭'}</span>
            </label>
          </div>

          {remoteEnabled && (
            <div className="remote-companion-body">
              <div className="remote-target-row">
                <span>输出目标：</span>
                <label>
                  <input
                    type="radio"
                    name="outputTarget"
                    value="both"
                    checked={remoteOutputTarget === 'both'}
                    onChange={() => setRemoteOutputTarget('both')}
                  />
                  双端同步显示
                </label>
                <label>
                  <input
                    type="radio"
                    name="outputTarget"
                    value="remote-only"
                    checked={remoteOutputTarget === 'remote-only'}
                    onChange={() => setRemoteOutputTarget('remote-only')}
                  />
                  仅远端显示（主屏静默无痕）
                </label>
              </div>

              {remoteStatus?.availableIps && remoteStatus.availableIps.length > 1 && (
                <div className="remote-target-row">
                  <span>电脑网络：</span>
                  <select
                    value={remoteIp || remoteStatus.ip}
                    onChange={(e) => setRemoteIp(e.target.value)}
                    style={{ flex: 1, padding: '3px 6px', background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '4px', color: '#e2e8f0', fontSize: '11px' }}
                  >
                    {remoteStatus.availableIps.map((cand) => (
                      <option key={cand.address} value={cand.address}>
                        {cand.name} ({cand.address})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {remoteStatus?.qrDataUrl ? (
                <div className="remote-qr-section">
                  <img src={remoteStatus.qrDataUrl} alt="扫码连接远端副屏" className="remote-qr-image" />
                  <div className="remote-qr-info">
                    <span className="remote-connection-badge">
                      {remoteStatus.clientCount > 0 ? `● 已连接 ${remoteStatus.clientCount} 台设备` : '○ 等待设备扫码连接'}
                    </span>
                    <span className="remote-url-text">{remoteStatus.url}</span>
                    <span className="remote-hint-text">① 手机与电脑需连接同一 Wi-Fi 或热点</span>
                    <span className="remote-hint-text" style={{ color: '#93c5fd' }}>② 推荐使用手机【自带相机】或【自带浏览器】扫码打开（避免微信内置拦截）</span>
                  </div>
                </div>
              ) : (
                <div className="remote-hint-text">保存设置后将启动局域网服务并生成二维码</div>
              )}
            </div>
          )}
        </div>

        <div className="hotkey-grid">
          {(
            [
              ['capture', '截图'],
              ['answer', '发送'],
              ['clear', '清空截图'],
              ['toggle', '显示 / 隐藏'],
              ['pointerThrough', '鼠标穿透'],
              ['promptTemplateNext', '切换提示词模板'],
              ['ghostMode', '纯文字悬浮 (穿透模式生效)'],
              ['remoteOutputToggle', '切换远端输出模式'],
              ['scrollUp', '向上滚动回答'],
              ['scrollDown', '向下滚动回答'],
              ['quit', '退出']
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="hotkey-field">
              <span>{label}</span>
              <div className="hotkey-input-row">
                <input
                  aria-label={`${label}快捷键`}
                  value={hotkeys[key]}
                  onChange={(event) => setHotkeys((current) => ({ ...current, [key]: event.target.value }))}
                />
                <button
                  aria-label={`录制${label}快捷键`}
                  className="secondary-button hotkey-record-button"
                  disabled={recordingKey !== undefined}
                  onClick={() => void recordHotkey(key)}
                  type="button"
                >
                  {recordingKey === key ? '按键中…' : '录制'}
                </button>
              </div>
            </label>
          ))}
        </div>

        <button aria-label="恢复默认按键" className="secondary-button reset-hotkeys-button" onClick={resetHotkeys} type="button">
          恢复默认按键
        </button>

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

function activePromptTemplate(settings: PublicSettings) {
  return settings.promptTemplates.find((template) => template.id === settings.activePromptTemplateId)
    ?? settings.promptTemplates[0]
}
