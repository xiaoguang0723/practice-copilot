import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import {
  createDefaultSettings,
  type ApiConfiguration,
  type HotkeySettings,
  type PublicSettings,
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
  selectedKnowledgeBaseIds?: string[]
  version?: number
}

interface SettingsFile {
  activeApiConfigurationId: string
  apiConfigurations: StoredApiConfiguration[]
  hotkeys: HotkeySettings
  knowledgeBaseEnabled: boolean
  opacity: number
  persistentPrompt: string
  selectedKnowledgeBaseIds: string[]
  version: 2
}

function defaultFile(): SettingsFile {
  const defaults = createDefaultSettings()
  const configuration = defaults.apiConfigurations[0]
  return {
    activeApiConfigurationId: configuration.id,
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
    persistentPrompt: defaults.persistentPrompt,
    selectedKnowledgeBaseIds: defaults.selectedKnowledgeBaseIds,
    version: 2
  }
}

export class SettingsStore {
  private data: SettingsFile

  constructor(
    private readonly filePath: string,
    private readonly cipher: SecretCipher
  ) {
    this.data = this.load()
  }

  getPublic(): PublicSettings {
    const active = this.activeConfiguration()
    return {
      activeApiConfigurationId: active.id,
      apiConfigurations: this.data.apiConfigurations.map((configuration) => this.toPublicConfiguration(configuration)),
      apiKeySet: Boolean(active.apiKeyEncrypted),
      apiProtocol: active.apiProtocol,
      baseUrl: active.baseUrl,
      hotkeys: { ...this.data.hotkeys },
      knowledgeBaseEnabled: this.data.knowledgeBaseEnabled,
      model: active.model,
      opacity: this.data.opacity,
      persistentPrompt: this.data.persistentPrompt,
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
    if (patch.persistentPrompt !== undefined) this.data.persistentPrompt = patch.persistentPrompt
    if (patch.hotkeys) this.data.hotkeys = { ...this.data.hotkeys, ...patch.hotkeys }
    if (patch.knowledgeBaseEnabled !== undefined) this.data.knowledgeBaseEnabled = patch.knowledgeBaseEnabled
    if (patch.selectedKnowledgeBaseIds !== undefined) {
      this.data.selectedKnowledgeBaseIds = [...new Set(patch.selectedKnowledgeBaseIds)]
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

  private activeConfiguration(): StoredApiConfiguration {
    return this.findConfiguration(this.data.activeApiConfigurationId)
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
      if (raw.version === 2 && Array.isArray(raw.apiConfigurations) && raw.apiConfigurations.length) {
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
    return {
      activeApiConfigurationId: typeof activeId === 'string' && configurations.some((config) => config.id === activeId)
        ? activeId
        : configurations[0].id,
      apiConfigurations: configurations,
      hotkeys: { ...defaults.hotkeys, ...(raw.hotkeys ?? {}) },
      knowledgeBaseEnabled: typeof raw.knowledgeBaseEnabled === 'boolean' ? raw.knowledgeBaseEnabled : defaults.knowledgeBaseEnabled,
      opacity: typeof raw.opacity === 'number' && raw.opacity >= 0.35 && raw.opacity <= 0.95 ? raw.opacity : defaults.opacity,
      persistentPrompt: typeof raw.persistentPrompt === 'string' ? raw.persistentPrompt : defaults.persistentPrompt,
      selectedKnowledgeBaseIds: Array.isArray(raw.selectedKnowledgeBaseIds)
        ? raw.selectedKnowledgeBaseIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : defaults.selectedKnowledgeBaseIds,
      version: 2
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.tmp`
    writeFileSync(temporaryPath, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8')
    renameSync(temporaryPath, this.filePath)
  }
}
