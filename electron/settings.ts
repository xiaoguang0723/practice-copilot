import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import {
  createDefaultSettings,
  type ApiConfiguration,
  type HotkeySettings,
  type PublicSettings,
  type RemoteCompanionSettings,
  type SettingsPatch
} from '../shared/protocol'
import { normalizeBaseUrl, validateSettingsPatch } from '../shared/validation'

export interface SecretCipher {
  available(): boolean
  decrypt(encrypted: string): string
  encrypt(plain: string): string
}

interface StoredApiConfiguration {
  apiKeyEncrypted?: string
  apiProtocol: 'chat' | 'response'
  baseUrl: string
  id: string
  model: string
  name: string
}

interface LegacySettingsFile {
  apiKeyEncrypted?: string
  apiProtocol?: 'chat' | 'response'
  baseUrl?: string
  hotkeys?: HotkeySettings
  knowledgeBaseEnabled?: boolean
  model?: string
  opacity?: number
  persistentPrompt?: string
  promptTemplates?: StoredPromptTemplate[]
  activePromptTemplateId?: string
  selectedKnowledgeBaseIds?: string[]
  version?: number
}

interface StoredPromptTemplate {
  content: string
  id: string
  name: string
}

interface SettingsFile {
  activeApiConfigurationId: string
  activePromptTemplateId: string
  apiConfigurations: StoredApiConfiguration[]
  hotkeys: HotkeySettings
  knowledgeBaseEnabled: boolean
  opacity: number
  promptTemplates: StoredPromptTemplate[]
  remoteCompanion: RemoteCompanionSettings
  selectedKnowledgeBaseIds: string[]
  version: 4
}

function defaultFile(): SettingsFile {
  const defaults = createDefaultSettings()
  const configuration = defaults.apiConfigurations[0]
  return {
    activeApiConfigurationId: configuration.id,
    activePromptTemplateId: defaults.activePromptTemplateId,
    apiConfigurations: [{
      apiProtocol: configuration.apiProtocol,
      baseUrl: configuration.baseUrl,
      id: configuration.id,
      model: configuration.model,
      name: configuration.name
    }],
    hotkeys: { ...defaults.hotkeys },
    knowledgeBaseEnabled: defaults.knowledgeBaseEnabled,
    opacity: defaults.opacity,
    promptTemplates: [{ content: '', id: defaults.activePromptTemplateId, name: '默认提示词' }],
    remoteCompanion: {
      ...defaults.remoteCompanion,
      token: randomUUID().replace(/-/g, '')
    },
    selectedKnowledgeBaseIds: defaults.selectedKnowledgeBaseIds,
    version: 4
  }
}

export class SettingsStore {
  private data: SettingsFile

  constructor(
    private readonly filePath: string,
    private readonly cipher: SecretCipher
  ) {
    this.data = this.load()
    this.persistMigratedFileIfNeeded()
  }

  getPublic(): PublicSettings {
    const active = this.activeConfiguration()
    return {
      activeApiConfigurationId: active.id,
      activePromptTemplateId: this.data.activePromptTemplateId,
      apiConfigurations: this.data.apiConfigurations.map((configuration) => this.toPublicConfiguration(configuration)),
      apiKeySet: Boolean(active.apiKeyEncrypted),
      apiProtocol: active.apiProtocol,
      baseUrl: active.baseUrl,
      hotkeys: { ...this.data.hotkeys },
      knowledgeBaseEnabled: this.data.knowledgeBaseEnabled,
      model: active.model,
      opacity: this.data.opacity,
      persistentPrompt: this.activePromptTemplate().content,
      promptTemplates: this.data.promptTemplates.map((template) => ({ ...template })),
      remoteCompanion: { ...this.data.remoteCompanion },
      selectedKnowledgeBaseIds: [...this.data.selectedKnowledgeBaseIds]
    }
  }

  getApiKey(): string | undefined {
    const encrypted = this.activeConfiguration().apiKeyEncrypted
    if (!encrypted || !this.cipher.available()) return undefined
    try {
      return this.cipher.decrypt(encrypted)
    } catch {
      return undefined
    }
  }

  applyPatch(patch: SettingsPatch): PublicSettings {
    const validation = validateSettingsPatch(patch)
    if (!validation.ok) throw new Error(validation.message)

    const active = this.activeConfiguration()
    if (patch.apiConfigName !== undefined) active.name = patch.apiConfigName.trim()
    if (patch.apiProtocol !== undefined) active.apiProtocol = patch.apiProtocol
    if (patch.baseUrl !== undefined) active.baseUrl = normalizeBaseUrl(patch.baseUrl)
    if (patch.model !== undefined) active.model = patch.model.trim()
    if (patch.opacity !== undefined) this.data.opacity = patch.opacity
    if (patch.persistentPrompt !== undefined) this.activePromptTemplate().content = patch.persistentPrompt
    if (patch.promptTemplateName !== undefined) this.activePromptTemplate().name = this.validateName(patch.promptTemplateName)
    if (patch.hotkeys) this.data.hotkeys = { ...this.data.hotkeys, ...patch.hotkeys }
    if (patch.knowledgeBaseEnabled !== undefined) this.data.knowledgeBaseEnabled = patch.knowledgeBaseEnabled
    if (patch.selectedKnowledgeBaseIds !== undefined) {
      this.data.selectedKnowledgeBaseIds = [...new Set(patch.selectedKnowledgeBaseIds)]
    }
    if (patch.remoteCompanion !== undefined) {
      this.data.remoteCompanion = {
        ...this.data.remoteCompanion,
        ...patch.remoteCompanion
      }
      if (!this.data.remoteCompanion.token) {
        this.data.remoteCompanion.token = randomUUID().replace(/-/g, '')
      }
    }
    if (patch.apiKey !== undefined && patch.apiKey !== '') {
      if (!this.cipher.available()) throw new Error('系统安全存储不可用，无法保存 API Key')
      active.apiKeyEncrypted = this.cipher.encrypt(patch.apiKey)
    }

    this.persist()
    return this.getPublic()
  }

  clearApiKey(): PublicSettings {
    delete this.activeConfiguration().apiKeyEncrypted
    this.persist()
    return this.getPublic()
  }

  createApiConfiguration(name: string): PublicSettings {
    const trimmed = this.validateName(name)
    const defaults = createDefaultSettings()
    const configuration: StoredApiConfiguration = {
      apiProtocol: defaults.apiProtocol,
      baseUrl: defaults.baseUrl,
      id: randomUUID(),
      model: defaults.model,
      name: trimmed
    }
    this.data.apiConfigurations.push(configuration)
    this.data.activeApiConfigurationId = configuration.id
    this.persist()
    return this.getPublic()
  }

  activateApiConfiguration(id: string): PublicSettings {
    this.findConfiguration(id)
    this.data.activeApiConfigurationId = id
    this.persist()
    return this.getPublic()
  }

  moveApiConfiguration(id: string, direction: 'up' | 'down'): PublicSettings {
    const index = this.data.apiConfigurations.findIndex((configuration) => configuration.id === id)
    if (index < 0) throw new Error('配置不存在')
    const nextIndex = direction === 'up' ? index - 1 : index + 1
    if (nextIndex >= 0 && nextIndex < this.data.apiConfigurations.length) {
      const [configuration] = this.data.apiConfigurations.splice(index, 1)
      this.data.apiConfigurations.splice(nextIndex, 0, configuration)
      this.persist()
    }
    return this.getPublic()
  }

  deleteApiConfiguration(id: string): PublicSettings {
    if (this.data.apiConfigurations.length <= 1) throw new Error('至少保留一个 API 配置')
    const index = this.data.apiConfigurations.findIndex((configuration) => configuration.id === id)
    if (index < 0) throw new Error('配置不存在')
    this.data.apiConfigurations.splice(index, 1)
    if (this.data.activeApiConfigurationId === id) {
      this.data.activeApiConfigurationId = this.data.apiConfigurations[Math.min(index, this.data.apiConfigurations.length - 1)].id
    }
    this.persist()
    return this.getPublic()
  }

  createPromptTemplate(name: string): PublicSettings {
    const template: StoredPromptTemplate = { content: '', id: randomUUID(), name: this.validateName(name) }
    this.data.promptTemplates.push(template)
    this.data.activePromptTemplateId = template.id
    this.persist()
    return this.getPublic()
  }

  activatePromptTemplate(id: string): PublicSettings {
    this.findPromptTemplate(id)
    this.data.activePromptTemplateId = id
    this.persist()
    return this.getPublic()
  }

  movePromptTemplate(id: string, direction: 'up' | 'down'): PublicSettings {
    const index = this.data.promptTemplates.findIndex((template) => template.id === id)
    if (index < 0) throw new Error('提示词模板不存在')
    const nextIndex = direction === 'up' ? index - 1 : index + 1
    if (nextIndex >= 0 && nextIndex < this.data.promptTemplates.length) {
      const [template] = this.data.promptTemplates.splice(index, 1)
      this.data.promptTemplates.splice(nextIndex, 0, template)
      this.persist()
    }
    return this.getPublic()
  }

  deletePromptTemplate(id: string): PublicSettings {
    if (this.data.promptTemplates.length <= 1) throw new Error('至少保留一个提示词模板')
    const index = this.data.promptTemplates.findIndex((template) => template.id === id)
    if (index < 0) throw new Error('提示词模板不存在')
    this.data.promptTemplates.splice(index, 1)
    if (this.data.activePromptTemplateId === id) {
      this.data.activePromptTemplateId = this.data.promptTemplates[Math.min(index, this.data.promptTemplates.length - 1)].id
    }
    this.persist()
    return this.getPublic()
  }

  private activeConfiguration(): StoredApiConfiguration {
    return this.findConfiguration(this.data.activeApiConfigurationId)
  }

  private activePromptTemplate(): StoredPromptTemplate {
    return this.findPromptTemplate(this.data.activePromptTemplateId)
  }

  private findPromptTemplate(id: string): StoredPromptTemplate {
    const template = this.data.promptTemplates.find((candidate) => candidate.id === id)
    if (!template) throw new Error('当前提示词模板不存在')
    return template
  }

  private findConfiguration(id: string): StoredApiConfiguration {
    const configuration = this.data.apiConfigurations.find((candidate) => candidate.id === id)
    if (!configuration) throw new Error('当前 API 配置不存在')
    return configuration
  }

  private toPublicConfiguration(configuration: StoredApiConfiguration): ApiConfiguration {
    return {
      apiKeySet: Boolean(configuration.apiKeyEncrypted),
      apiProtocol: configuration.apiProtocol,
      baseUrl: configuration.baseUrl,
      id: configuration.id,
      model: configuration.model,
      name: configuration.name
    }
  }

  private validateName(name: string): string {
    const validation = validateSettingsPatch({ apiConfigName: name })
    if (!validation.ok) throw new Error(validation.message)
    return name.trim()
  }

  private load(): SettingsFile {
    const defaults = defaultFile()
    if (!existsSync(this.filePath)) return defaults
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as LegacySettingsFile & Partial<SettingsFile>
      if (typeof raw.version === 'number' && raw.version >= 2 && Array.isArray(raw.apiConfigurations) && raw.apiConfigurations.length) {
        const configurations = raw.apiConfigurations
          .filter((configuration): configuration is StoredApiConfiguration => Boolean(configuration && typeof configuration === 'object'))
          .map((configuration): StoredApiConfiguration => ({
            apiKeyEncrypted: typeof configuration.apiKeyEncrypted === 'string' ? configuration.apiKeyEncrypted : undefined,
            apiProtocol: configuration.apiProtocol === 'response' ? 'response' : 'chat',
            baseUrl: typeof configuration.baseUrl === 'string' ? normalizeBaseUrl(configuration.baseUrl) : defaults.apiConfigurations[0].baseUrl,
            id: typeof configuration.id === 'string' && configuration.id ? configuration.id : randomUUID(),
            model: typeof configuration.model === 'string' && configuration.model.trim() ? configuration.model : defaults.apiConfigurations[0].model,
            name: typeof configuration.name === 'string' && configuration.name.trim() ? configuration.name.trim().slice(0, 80) : '未命名配置'
          }))
        if (configurations.length) return this.completeFile(raw, configurations, raw.activeApiConfigurationId)
      }

      const legacyConfiguration: StoredApiConfiguration = {
        apiKeyEncrypted: typeof raw.apiKeyEncrypted === 'string' ? raw.apiKeyEncrypted : undefined,
        apiProtocol: raw.apiProtocol === 'response' ? 'response' : 'chat',
        baseUrl: typeof raw.baseUrl === 'string' ? normalizeBaseUrl(raw.baseUrl) : defaults.apiConfigurations[0].baseUrl,
        id: defaults.apiConfigurations[0].id,
        model: typeof raw.model === 'string' && raw.model.trim() ? raw.model : defaults.apiConfigurations[0].model,
        name: '默认配置'
      }
      return this.completeFile(raw, [legacyConfiguration], legacyConfiguration.id)
    } catch {
      return defaults
    }
  }

  private completeFile(
    raw: LegacySettingsFile & Partial<SettingsFile>,
    configurations: StoredApiConfiguration[],
    activeId: unknown
  ): SettingsFile {
    const defaults = defaultFile()
    const prompts = this.normalizePromptTemplates(raw)
    return {
      activeApiConfigurationId: typeof activeId === 'string' && configurations.some((config) => config.id === activeId)
        ? activeId
        : configurations[0].id,
      apiConfigurations: configurations,
      hotkeys: raw.version === undefined || Number(raw.version) <= 2
        ? migrateDefaultHotkeys({ ...defaults.hotkeys, ...(raw.hotkeys ?? {}) })
        : { ...defaults.hotkeys, ...(raw.hotkeys ?? {}) },
      knowledgeBaseEnabled: typeof raw.knowledgeBaseEnabled === 'boolean' ? raw.knowledgeBaseEnabled : defaults.knowledgeBaseEnabled,
      opacity: typeof raw.opacity === 'number' && raw.opacity >= 0.35 && raw.opacity <= 0.95 ? raw.opacity : defaults.opacity,
      activePromptTemplateId: prompts.activeId,
      promptTemplates: prompts.templates,
      remoteCompanion: {
        enabled: typeof raw.remoteCompanion?.enabled === 'boolean' ? raw.remoteCompanion.enabled : defaults.remoteCompanion.enabled,
        ip: typeof raw.remoteCompanion?.ip === 'string' ? raw.remoteCompanion.ip : defaults.remoteCompanion.ip,
        outputTarget: raw.remoteCompanion?.outputTarget === 'remote-only' ? 'remote-only' : 'both',
        port: typeof raw.remoteCompanion?.port === 'number' && raw.remoteCompanion.port > 1024 && raw.remoteCompanion.port < 65535
          ? raw.remoteCompanion.port
          : defaults.remoteCompanion.port,
        token: typeof raw.remoteCompanion?.token === 'string' && raw.remoteCompanion.token
          ? raw.remoteCompanion.token
          : defaults.remoteCompanion.token
      },
      selectedKnowledgeBaseIds: Array.isArray(raw.selectedKnowledgeBaseIds)
        ? raw.selectedKnowledgeBaseIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : defaults.selectedKnowledgeBaseIds,
      version: 4
    }
  }

  private normalizePromptTemplates(raw: LegacySettingsFile & Partial<SettingsFile>): { activeId: string; templates: StoredPromptTemplate[] } {
    const defaults = defaultFile()
    if (Array.isArray(raw.promptTemplates) && raw.promptTemplates.length) {
      const templates = raw.promptTemplates
        .filter((template): template is StoredPromptTemplate => Boolean(template && typeof template === 'object'))
        .map((template) => ({
          content: typeof template.content === 'string' ? template.content.slice(0, 8000) : '',
          id: typeof template.id === 'string' && template.id ? template.id : randomUUID(),
          name: typeof template.name === 'string' && template.name.trim() ? template.name.trim().slice(0, 80) : '未命名提示词'
        }))
      if (templates.length) {
        return {
          activeId: typeof raw.activePromptTemplateId === 'string' && templates.some((template) => template.id === raw.activePromptTemplateId)
            ? raw.activePromptTemplateId
            : templates[0].id,
          templates
        }
      }
    }
    return {
      activeId: defaults.activePromptTemplateId,
      templates: [{
        content: typeof raw.persistentPrompt === 'string' ? raw.persistentPrompt.slice(0, 8000) : '',
        id: defaults.activePromptTemplateId,
        name: '默认提示词'
      }]
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.tmp`
    writeFileSync(temporaryPath, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8')
    renameSync(temporaryPath, this.filePath)
  }

  private persistMigratedFileIfNeeded(): void {
    if (!existsSync(this.filePath)) return
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<SettingsFile>
      if (raw.version !== 4 || !Array.isArray(raw.promptTemplates) || !raw.promptTemplates.length) this.persist()
    } catch {
      // Keep the in-memory defaults for malformed settings files.
    }
  }
}

function migrateDefaultHotkeys(hotkeys: HotkeySettings): HotkeySettings {
  const legacyDefaults: Partial<HotkeySettings> = {
    answer: 'Alt+W',
    capture: 'Alt+Q',
    clear: 'Alt+R',
    scrollDown: 'Shift+Down',
    scrollUp: 'Shift+Up',
    toggle: 'Alt+E'
  }
  const next = createDefaultSettings().hotkeys
  const migrated = { ...hotkeys }
  for (const key of Object.keys(legacyDefaults) as Array<keyof HotkeySettings>) {
    if (hotkeys[key] === legacyDefaults[key]) migrated[key] = next[key]
  }
  return migrated
}
