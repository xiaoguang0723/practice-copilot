import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
    store.applyPatch({
      apiProtocol: 'response',
      baseUrl: 'https://example.com/v1/',
      hotkeys: { capture: 'Ctrl+Q' },
      opacity: 0.65
    })

    const reloaded = new SettingsStore(filePath, {
      available: () => true,
      decrypt: (value) => Buffer.from(value, 'base64').toString('utf8'),
      encrypt: (value) => Buffer.from(value).toString('base64')
    })

    expect(reloaded.getPublic().apiProtocol).toBe('response')
    expect(reloaded.getPublic().baseUrl).toBe('https://example.com/v1')
    expect(reloaded.getPublic().hotkeys).toEqual({
      answer: 'MouseRightDoubleClick',
      capture: 'Ctrl+Q',
      clear: 'MouseMiddleDoubleClick',
      pointerThrough: 'Alt+D',
      quit: 'Alt+X',
      scrollDown: 'MouseLeftHold+WheelDown',
      scrollUp: 'MouseLeftHold+WheelUp',
      toggle: 'MouseMiddleLongPress'
    })
    expect(reloaded.getPublic().opacity).toBe(0.65)
  })

  it('keeps knowledge retrieval disabled until the user explicitly enables selected libraries', () => {
    const { filePath, store } = createStore()

    expect(store.getPublic().knowledgeBaseEnabled).toBe(false)
    expect(store.getPublic().selectedKnowledgeBaseIds).toEqual([])

    store.applyPatch({
      knowledgeBaseEnabled: true,
      selectedKnowledgeBaseIds: ['library-a', 'library-b']
    })

    const reloaded = new SettingsStore(filePath, {
      available: () => true,
      decrypt: (value) => Buffer.from(value, 'base64').toString('utf8'),
      encrypt: (value) => Buffer.from(value).toString('base64')
    })
    expect(reloaded.getPublic()).toMatchObject({
      knowledgeBaseEnabled: true,
      selectedKnowledgeBaseIds: ['library-a', 'library-b']
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

  it('migrates a legacy single API configuration into a named default configuration', () => {
    const directory = mkdtempSync(join(tmpdir(), 'practice-copilot-'))
    directories.push(directory)
    const filePath = join(directory, 'settings.json')
    writeFileSync(filePath, JSON.stringify({
      apiKeyEncrypted: Buffer.from('legacy-key').toString('base64'),
      apiProtocol: 'response',
      baseUrl: 'https://legacy.example.com/v1',
      hotkeys: {},
      knowledgeBaseEnabled: false,
      model: 'legacy-model',
      opacity: 0.88,
      persistentPrompt: '',
      selectedKnowledgeBaseIds: [],
      version: 1
    }), 'utf8')

    const { store } = createStoreFrom(filePath)

    expect(store.getPublic().apiConfigurations).toEqual([
      expect.objectContaining({
        apiKeySet: true,
        apiProtocol: 'response',
        baseUrl: 'https://legacy.example.com/v1',
        model: 'legacy-model',
        name: '默认配置'
      })
    ])
    expect(store.getApiKey()).toBe('legacy-key')
  })

  it('migrates old built-in hotkeys while preserving customized hotkeys', () => {
    const directory = mkdtempSync(join(tmpdir(), 'practice-copilot-'))
    directories.push(directory)
    const filePath = join(directory, 'settings.json')
    writeFileSync(filePath, JSON.stringify({
      hotkeys: {
        answer: 'Alt+W',
        capture: 'Ctrl+Q',
        clear: 'Alt+R',
        pointerThrough: 'Alt+D',
        quit: 'Alt+X',
        scrollDown: 'Shift+Down',
        scrollUp: 'Shift+Up',
        toggle: 'Alt+E'
      },
      version: 2,
      apiConfigurations: [{ id: 'one', name: '主线路', apiProtocol: 'chat', baseUrl: 'https://example.com/v1', model: 'model' }],
      activeApiConfigurationId: 'one'
    }), 'utf8')

    const { store } = createStoreFrom(filePath)
    expect(store.getPublic().hotkeys).toEqual({
      answer: 'MouseRightDoubleClick',
      capture: 'Ctrl+Q',
      clear: 'MouseMiddleDoubleClick',
      pointerThrough: 'Alt+D',
      quit: 'Alt+X',
      scrollDown: 'MouseLeftHold+WheelDown',
      scrollUp: 'MouseLeftHold+WheelUp',
      toggle: 'MouseMiddleLongPress'
    })
  })

  it('migrates legacy single-profile hotkeys to the new mouse defaults', () => {
    const directory = mkdtempSync(join(tmpdir(), 'practice-copilot-'))
    directories.push(directory)
    const filePath = join(directory, 'settings.json')
    writeFileSync(filePath, JSON.stringify({
      answer: 'Alt+W',
      capture: 'Alt+Q',
      clear: 'Alt+R',
      hotkeys: {
        answer: 'Alt+W',
        capture: 'Alt+Q',
        clear: 'Alt+R',
        pointerThrough: 'Alt+D',
        quit: 'Alt+X',
        scrollDown: 'Shift+Down',
        scrollUp: 'Shift+Up',
        toggle: 'Alt+E'
      },
      version: 1
    }), 'utf8')

    const { store } = createStoreFrom(filePath)
    expect(store.getPublic().hotkeys.capture).toBe('MouseLeftDoubleClick')
    expect(store.getPublic().hotkeys.toggle).toBe('MouseMiddleLongPress')
  })

  it('preserves a user choice that matches a legacy default after migration', () => {
    const { filePath, store } = createStore()
    store.applyPatch({ hotkeys: { answer: 'Alt+W' } })

    const reloaded = new SettingsStore(filePath, testCipher())
    expect(reloaded.getPublic().hotkeys.answer).toBe('Alt+W')
  })

  it('creates, reorders, activates, and persists named API configurations', () => {
    const { filePath, store } = createStore()
    store.applyPatch({ apiKey: 'first-key', apiConfigName: '主线路' })
    const afterCreate = store.createApiConfiguration('备用线路')
    const created = afterCreate.apiConfigurations.find((config) => config.name === '备用线路')
    expect(created).toBeDefined()
    expect(afterCreate.activeApiConfigurationId).toBe(created?.id)

    store.applyPatch({ apiKey: 'second-key', model: 'fallback-model' })
    const afterMove = store.moveApiConfiguration(created!.id, 'up')
    expect(afterMove.apiConfigurations.map((config) => config.name)).toEqual(['备用线路', '主线路'])

    const primary = afterMove.apiConfigurations.find((config) => config.name === '主线路')!
    store.activateApiConfiguration(primary.id)
    expect(store.getApiKey()).toBe('first-key')
    expect(store.getPublic().model).toBe('gpt-4.1-mini')

    const reloaded = new SettingsStore(filePath, testCipher())
    expect(reloaded.getPublic().apiConfigurations.map((config) => config.name)).toEqual(['备用线路', '主线路'])
    expect(reloaded.getPublic().activeApiConfigurationId).toBe(primary.id)
  })

  it('selects a neighboring configuration when deleting the active one and refuses to delete the last one', () => {
    const { store } = createStore()
    const second = store.createApiConfiguration('备用线路')
    const secondId = second.activeApiConfigurationId

    const afterDelete = store.deleteApiConfiguration(secondId)
    expect(afterDelete.apiConfigurations).toHaveLength(1)
    expect(afterDelete.activeApiConfigurationId).not.toBe(secondId)
    expect(() => store.deleteApiConfiguration(afterDelete.activeApiConfigurationId)).toThrow('至少保留一个')
  })
})

function testCipher(): SecretCipher {
  return {
    available: () => true,
    decrypt: (encrypted) => Buffer.from(encrypted, 'base64').toString('utf8'),
    encrypt: (plain) => Buffer.from(plain).toString('base64')
  }
}

function createStoreFrom(filePath: string) {
  return { filePath, store: new SettingsStore(filePath, testCipher()) }
}
