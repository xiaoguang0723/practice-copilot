import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { SettingsStore, type SecretCipher } from '../electron/settings'

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

function createStore() {
  const directory = mkdtempSync(join(tmpdir(), 'practice-copilot-'))
  directories.push(directory)
  const filePath = join(directory, 'settings.json')
  const cipher: SecretCipher = {
    available: () => true,
    decrypt: (encrypted) => Buffer.from(encrypted, 'base64').toString('utf8'),
    encrypt: (plain) => Buffer.from(plain).toString('base64')
  }
  return { filePath, store: new SettingsStore(filePath, cipher) }
}

describe('SettingsStore', () => {
  it('encrypts API keys and never exposes them publicly', () => {
    const { filePath, store } = createStore()

    const publicSettings = store.applyPatch({ apiKey: 'secret-key' })
    const disk = readFileSync(filePath, 'utf8')

    expect(publicSettings.apiKeySet).toBe(true)
    expect(disk).not.toContain('secret-key')
    expect(store.getApiKey()).toBe('secret-key')
  })

  it('keeps a saved key for an empty patch and clears it explicitly', () => {
    const { store } = createStore()
    store.applyPatch({ apiKey: 'secret-key' })

    store.applyPatch({ apiKey: '' })
    expect(store.getApiKey()).toBe('secret-key')

    expect(store.clearApiKey().apiKeySet).toBe(false)
    expect(store.getApiKey()).toBeUndefined()
  })

  it('merges partial hotkeys and reloads persisted settings', () => {
    const { filePath, store } = createStore()
    store.applyPatch({ baseUrl: 'https://example.com/v1/', hotkeys: { capture: 'Ctrl+Q' } })

    const reloaded = new SettingsStore(filePath, {
      available: () => true,
      decrypt: (value) => Buffer.from(value, 'base64').toString('utf8'),
      encrypt: (value) => Buffer.from(value).toString('base64')
    })

    expect(reloaded.getPublic().baseUrl).toBe('https://example.com/v1')
    expect(reloaded.getPublic().hotkeys).toEqual({
      answer: 'Alt+W',
      capture: 'Ctrl+Q',
      quit: 'Alt+X',
      toggle: 'Alt+E'
    })
  })

  it('refuses to store a key when secure storage is unavailable', () => {
    const directory = mkdtempSync(join(tmpdir(), 'practice-copilot-'))
    directories.push(directory)
    const store = new SettingsStore(join(directory, 'settings.json'), {
      available: () => false,
      decrypt: () => '',
      encrypt: () => ''
    })

    expect(() => store.applyPatch({ apiKey: 'secret-key' })).toThrow('安全存储')
  })
})
