import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import {
  createDefaultSettings,
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

interface SettingsFile {
  apiKeyEncrypted?: string
  apiProtocol: 'chat' | 'response'
  baseUrl: string
  hotkeys: HotkeySettings
  knowledgeBaseEnabled: boolean
  model: string
  opacity: number
  persistentPrompt: string
  selectedKnowledgeBaseIds: string[]
  version: 1
}

function defaultFile(): SettingsFile {
  const defaults = createDefaultSettings()
  return {
    apiProtocol: defaults.apiProtocol,
    baseUrl: defaults.baseUrl,
    hotkeys: { ...defaults.hotkeys },
    knowledgeBaseEnabled: defaults.knowledgeBaseEnabled,
    model: defaults.model,
    opacity: defaults.opacity,
    persistentPrompt: defaults.persistentPrompt,
    selectedKnowledgeBaseIds: defaults.selectedKnowledgeBaseIds,
    version: 1
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
    return {
      apiKeySet: Boolean(this.data.apiKeyEncrypted),
      apiProtocol: this.data.apiProtocol,
      baseUrl: this.data.baseUrl,
      hotkeys: { ...this.data.hotkeys },
      knowledgeBaseEnabled: this.data.knowledgeBaseEnabled,
      model: this.data.model,
      opacity: this.data.opacity,
      persistentPrompt: this.data.persistentPrompt,
      selectedKnowledgeBaseIds: [...this.data.selectedKnowledgeBaseIds]
    }
  }

  getApiKey(): string | undefined {
    if (!this.data.apiKeyEncrypted || !this.cipher.available()) return undefined
    try {
      return this.cipher.decrypt(this.data.apiKeyEncrypted)
    } catch {
      return undefined
    }
  }

  applyPatch(patch: SettingsPatch): PublicSettings {
    const validation = validateSettingsPatch(patch)
    if (!validation.ok) throw new Error(validation.message)

    if (patch.apiProtocol !== undefined) this.data.apiProtocol = patch.apiProtocol
    if (patch.baseUrl !== undefined) this.data.baseUrl = normalizeBaseUrl(patch.baseUrl)
    if (patch.model !== undefined) this.data.model = patch.model.trim()
    if (patch.opacity !== undefined) this.data.opacity = patch.opacity
    if (patch.persistentPrompt !== undefined) this.data.persistentPrompt = patch.persistentPrompt
    if (patch.hotkeys) this.data.hotkeys = { ...this.data.hotkeys, ...patch.hotkeys }
    if (patch.knowledgeBaseEnabled !== undefined) this.data.knowledgeBaseEnabled = patch.knowledgeBaseEnabled
    if (patch.selectedKnowledgeBaseIds !== undefined) {
      this.data.selectedKnowledgeBaseIds = [...new Set(patch.selectedKnowledgeBaseIds)]
    }
    if (patch.apiKey !== undefined && patch.apiKey !== '') {
      if (!this.cipher.available()) throw new Error('系统安全存储不可用，无法保存 API Key')
      this.data.apiKeyEncrypted = this.cipher.encrypt(patch.apiKey)
    }

    this.persist()
    return this.getPublic()
  }

  clearApiKey(): PublicSettings {
    delete this.data.apiKeyEncrypted
    this.persist()
    return this.getPublic()
  }

  private load(): SettingsFile {
    const defaults = defaultFile()
    if (!existsSync(this.filePath)) return defaults
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<SettingsFile>
      return {
        apiKeyEncrypted: raw.apiKeyEncrypted,
        apiProtocol: raw.apiProtocol === 'chat' || raw.apiProtocol === 'response' ? raw.apiProtocol : defaults.apiProtocol,
        baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : defaults.baseUrl,
        hotkeys: { ...defaults.hotkeys, ...(raw.hotkeys ?? {}) },
        knowledgeBaseEnabled:
          typeof raw.knowledgeBaseEnabled === 'boolean'
            ? raw.knowledgeBaseEnabled
            : defaults.knowledgeBaseEnabled,
        model: typeof raw.model === 'string' ? raw.model : defaults.model,
        opacity:
          typeof raw.opacity === 'number' && raw.opacity >= 0.35 && raw.opacity <= 0.95
            ? raw.opacity
            : defaults.opacity,
        persistentPrompt:
          typeof raw.persistentPrompt === 'string' ? raw.persistentPrompt : defaults.persistentPrompt,
        selectedKnowledgeBaseIds: Array.isArray(raw.selectedKnowledgeBaseIds)
          ? raw.selectedKnowledgeBaseIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
          : defaults.selectedKnowledgeBaseIds,
        version: 1
      }
    } catch {
      return defaults
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.tmp`
    writeFileSync(temporaryPath, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8')
    renameSync(temporaryPath, this.filePath)
  }
}
