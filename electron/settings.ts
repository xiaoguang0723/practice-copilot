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
  baseUrl: string
  hotkeys: HotkeySettings
  model: string
  persistentPrompt: string
  version: 1
}

function defaultFile(): SettingsFile {
  const defaults = createDefaultSettings()
  return {
    baseUrl: defaults.baseUrl,
    hotkeys: { ...defaults.hotkeys },
    model: defaults.model,
    persistentPrompt: defaults.persistentPrompt,
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
      baseUrl: this.data.baseUrl,
      hotkeys: { ...this.data.hotkeys },
      model: this.data.model,
      persistentPrompt: this.data.persistentPrompt
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

    if (patch.baseUrl !== undefined) this.data.baseUrl = normalizeBaseUrl(patch.baseUrl)
    if (patch.model !== undefined) this.data.model = patch.model.trim()
    if (patch.persistentPrompt !== undefined) this.data.persistentPrompt = patch.persistentPrompt
    if (patch.hotkeys) this.data.hotkeys = { ...this.data.hotkeys, ...patch.hotkeys }
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
        baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : defaults.baseUrl,
        hotkeys: { ...defaults.hotkeys, ...(raw.hotkeys ?? {}) },
        model: typeof raw.model === 'string' ? raw.model : defaults.model,
        persistentPrompt:
          typeof raw.persistentPrompt === 'string' ? raw.persistentPrompt : defaults.persistentPrompt,
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
