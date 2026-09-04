import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  clipboard,
  globalShortcut,
  ipcMain,
  safeStorage,
  screen,
  type Rectangle
} from 'electron'

import { IPC, type HotkeyAction, type RemotePanelState, type SettingsPatch } from '../shared/protocol'
import { validateSettingsPatch } from '../shared/validation'
import { capturePrimaryDisplay } from './capture'
import { AppCoordinator } from './coordinator'
import { registerHotkeys } from './hotkeys'
import { streamVisionAnswer } from './llm/client'
import { extractVisionSearchQuery } from './llm/client'
import { KnowledgeBaseStore } from './knowledge-base'
import { RemoteCompanionServer } from './remote-server'
import { SettingsStore, type SecretCipher } from './settings'
import { setPointerThrough, showWithoutActivation } from './window-interaction'
import { MouseHotkeyManager } from './mouse-hotkeys'
import { clampBoundsToWorkArea, moveBoundsWithinWorkArea, positionInWorkArea } from './window-state'

const DEFAULT_WIDTH = 460
const DEFAULT_HEIGHT = 620
const WINDOW_MARGIN = 24
const WINDOW_MOVE_STEP = 24

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  void bootstrap()
}

async function bootstrap(): Promise<void> {
  await app.whenReady()

  const settingsFile = join(app.getPath('userData'), 'settings.json')
  const boundsFile = join(app.getPath('userData'), 'window-bounds.json')
  const cipher: SecretCipher = {
    available: () => safeStorage.isEncryptionAvailable(),
    decrypt: (encrypted) => safeStorage.decryptString(Buffer.from(encrypted, 'base64')),
    encrypt: (plain) => safeStorage.encryptString(plain).toString('base64')
  }
  const settings = new SettingsStore(settingsFile, cipher)
  const knowledge = new KnowledgeBaseStore(join(app.getPath('userData'), 'knowledge-base'))
  const remoteServer = new RemoteCompanionServer()
  let quitting = false
  let pointerThrough = false
  let ghostMode = false
  let captureCount = 0
  const mouseHotkeys = new MouseHotkeyManager()

  const getRemotePanelState = (): RemotePanelState => {
    const current = settings.getPublic()
    return {
      apiConfigurationName: current.apiConfigurations.find((configuration) => configuration.id === current.activeApiConfigurationId)?.name ?? '未命名配置',
      captureCount,
      promptTemplateName: current.promptTemplates.find((template) => template.id === current.activePromptTemplateId)?.name ?? '默认提示词'
    }
  }
  remoteServer.setPanelState(getRemotePanelState())

  if (settings.getPublic().remoteCompanion.enabled) {
    void remoteServer.start(
      settings.getPublic().remoteCompanion.port,
      settings.getPublic().remoteCompanion.token,
      settings.getPublic().remoteCompanion.outputTarget,
      settings.getPublic().remoteCompanion.ip
    ).catch(console.error)
  }

  const primaryWorkArea = screen.getPrimaryDisplay().workArea
  const initialBounds = loadBounds(boundsFile, primaryWorkArea)
  const window = new BrowserWindow({
    ...initialBounds,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    frame: false,
    focusable: false,
    hasShadow: false,
    minHeight: 40,
    minWidth: 80,
    resizable: true,
    show: false,
    skipTaskbar: true,
    transparent: true,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, '../preload/preload.cjs'),
      sandbox: true
    }
  })
  window.setAlwaysOnTop(true, 'screen-saver')
  window.setContentProtection(true)
  window.setOpacity(settings.getPublic().opacity)
  window.setSkipTaskbar(true)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.once('ready-to-show', () => showWithoutActivation(window))

  const hideWindow = () => {
    window.hide()
  }

  const saveBounds = () => {
    if (!window.isDestroyed() && !window.isMinimized()) {
      writeFileSync(boundsFile, JSON.stringify(window.getBounds()), 'utf8')
    }
  }
  window.on('move', saveBounds)
  window.on('resize', saveBounds)
  window.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      hideWindow()
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  const toggleWindow = () => {
    if (window.isVisible()) {
      hideWindow()
    } else {
      showWithoutActivation(window, !pointerThrough)
    }
  }

  const coordinator = new AppCoordinator({
    capture: capturePrimaryDisplay,
    emitAnswer: (event) => {
      const current = settings.getPublic()
      if (!current.remoteCompanion.enabled || current.remoteCompanion.outputTarget !== 'remote-only') {
        window.webContents.send(IPC.ANSWER_EVENT, event)
      }
      remoteServer.broadcast(event.type, event)
    },
    quit: () => {
      remoteServer.stop()
      knowledge.close()
      quitting = true
      app.quit()
    },
    retrieve: async (input, signal) => {
      const query = await extractVisionSearchQuery(input, signal)
      const matches = knowledge.search(input.selectedKnowledgeBaseIds ?? [], query)
      return matches.length ? matches.map((match) => `来源：${match.knowledgeBaseName} / ${match.documentName}\n${match.content}`).join('\n\n---\n\n') : undefined
    },
    stream: streamVisionAnswer,
    summarize: async (input, signal) => streamVisionAnswer(input, () => undefined, signal),
    unregisterHotkeys: () => {
      globalShortcut.unregisterAll()
      mouseHotkeys.unregisterAll()
    }
  })

  const publishSettings = (current = settings.getPublic()) => {
    window.webContents.send(IPC.SETTINGS_CHANGED, current)
    remoteServer.setPanelState({
      apiConfigurationName: current.apiConfigurations.find((configuration) => configuration.id === current.activeApiConfigurationId)?.name ?? '未命名配置',
      captureCount,
      promptTemplateName: current.promptTemplates.find((template) => template.id === current.activePromptTemplateId)?.name ?? '默认提示词'
    })
    return current
  }

  const clearConversation = () => {
    coordinator.clearConversation()
    captureCount = 0
    remoteServer.broadcast('clear', {})
    remoteServer.setPanelState(getRemotePanelState())
  }

  const activateApiConfiguration = (id: string) => {
    const current = settings.activateApiConfiguration(id)
    clearConversation()
    return publishSettings(current)
  }

  const activatePromptTemplate = (id: string) => {
    const current = settings.activatePromptTemplate(id)
    clearConversation()
    return publishSettings(current)
  }

  const activateNextApiConfiguration = () => {
    const current = settings.getPublic()
    const index = current.apiConfigurations.findIndex((configuration) => configuration.id === current.activeApiConfigurationId)
    const next = current.apiConfigurations[(index + 1) % current.apiConfigurations.length]
    return activateApiConfiguration(next.id)
  }

  const handleAction = (action: HotkeyAction) => {
    if (action === 'quit') coordinator.shutdown()
    else if (action === 'toggle') toggleWindow()
    else if (action === 'configuration-next') activateNextApiConfiguration()
    else if (action === 'prompt-template-next') activateNextPromptTemplate()
    else if (action === 'pointer-through') {
      pointerThrough = !pointerThrough
      setPointerThrough(window, pointerThrough)
      if (!pointerThrough && ghostMode) {
        ghostMode = false
      }
      window.webContents.send(IPC.HOTKEY_ACTION, action)
    }
    else if (action === 'ghost-mode') {
      if (pointerThrough) {
        ghostMode = !ghostMode
        window.webContents.send(IPC.HOTKEY_ACTION, action)
      }
    }
    else if (action === 'remote-output-toggle') {
      const current = settings.getPublic()
      const nextTarget = current.remoteCompanion.outputTarget === 'remote-only' ? 'both' : 'remote-only'
      remoteServer.setOutputTarget(nextTarget)
      const updated = settings.applyPatch({
        remoteCompanion: { outputTarget: nextTarget }
      })
      if (nextTarget === 'remote-only') {
        hideWindow()
      } else {
        showWithoutActivation(window, !pointerThrough)
      }
      publishSettings(updated)
      window.webContents.send(IPC.HOTKEY_ACTION, action)
    }
    else if (action === 'scroll-up' || action === 'scroll-down') {
      window.webContents.send(IPC.HOTKEY_ACTION, action)
      remoteServer.broadcast('scroll', {
        direction: action === 'scroll-up' ? 'up' : 'down',
        delta: action === 'scroll-up' ? -260 : 260
      })
    }
    else if (
      action === 'move-up' ||
      action === 'move-down' ||
      action === 'move-left' ||
      action === 'move-right'
    ) {
      const delta = movementDelta(action)
      const workArea = screen.getDisplayMatching(window.getBounds()).workArea
      window.setBounds(moveBoundsWithinWorkArea(window.getBounds(), workArea, delta.x, delta.y))
    }
    else window.webContents.send(IPC.HOTKEY_ACTION, action)
  }

  const activateNextPromptTemplate = () => {
    const current = settings.getPublic()
    const index = current.promptTemplates.findIndex((template) => template.id === current.activePromptTemplateId)
    const next = current.promptTemplates[(index + 1) % current.promptTemplates.length]
    return activatePromptTemplate(next.id)
  }

  const initialRegistration = registerHotkeys(
    globalShortcut,
    settings.getPublic().hotkeys,
    settings.getPublic().hotkeys,
    handleAction,
    mouseHotkeys
  )
  if (!initialRegistration.ok) console.error(initialRegistration.message)

  ipcMain.handle(IPC.SETTINGS_GET, () => settings.getPublic())
  ipcMain.handle(IPC.SETTINGS_CONFIGURATION_ACTIVATE, (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('配置无效')
    return activateApiConfiguration(id)
  })
  ipcMain.handle(IPC.SETTINGS_CONFIGURATION_CREATE, (_event, name: unknown) => {
    const current = settings.createApiConfiguration(String(name ?? ''))
    clearConversation()
    return publishSettings(current)
  })
  ipcMain.handle(IPC.SETTINGS_CONFIGURATION_DELETE, (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('配置无效')
    const current = settings.deleteApiConfiguration(id)
    clearConversation()
    return publishSettings(current)
  })
  ipcMain.handle(IPC.SETTINGS_CONFIGURATION_MOVE, (_event, id: unknown, direction: unknown) => {
    if (typeof id !== 'string' || (direction !== 'up' && direction !== 'down')) throw new Error('配置排序无效')
    return publishSettings(settings.moveApiConfiguration(id, direction))
  })
  ipcMain.handle(IPC.SETTINGS_PROMPT_TEMPLATE_ACTIVATE, (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('提示词模板无效')
    return activatePromptTemplate(id)
  })
  ipcMain.handle(IPC.SETTINGS_PROMPT_TEMPLATE_CREATE, (_event, name: unknown) => {
    const current = settings.createPromptTemplate(String(name ?? ''))
    clearConversation()
    return publishSettings(current)
  })
  ipcMain.handle(IPC.SETTINGS_PROMPT_TEMPLATE_DELETE, (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('提示词模板无效')
    const current = settings.deletePromptTemplate(id)
    clearConversation()
    return publishSettings(current)
  })
  ipcMain.handle(IPC.SETTINGS_PROMPT_TEMPLATE_MOVE, (_event, id: unknown, direction: unknown) => {
    if (typeof id !== 'string' || (direction !== 'up' && direction !== 'down')) throw new Error('提示词模板排序无效')
    return publishSettings(settings.movePromptTemplate(id, direction))
  })
  ipcMain.handle(IPC.KNOWLEDGE_LIST, () => knowledge.listKnowledgeBases())
  ipcMain.handle(IPC.KNOWLEDGE_CREATE, (_event, name: unknown) => knowledge.createKnowledgeBase(String(name ?? '')))
  ipcMain.handle(IPC.KNOWLEDGE_RENAME, (_event, id: unknown, name: unknown) => knowledge.renameKnowledgeBase(String(id ?? ''), String(name ?? '')))
  ipcMain.handle(IPC.KNOWLEDGE_DELETE, (_event, id: unknown) => knowledge.deleteKnowledgeBase(String(id ?? '')))
  ipcMain.handle(IPC.KNOWLEDGE_DOCUMENT_LIST, (_event, id: unknown) => knowledge.listDocuments(String(id ?? '')))
  ipcMain.handle(IPC.KNOWLEDGE_DOCUMENT_DELETE, (_event, id: unknown) => knowledge.deleteDocument(String(id ?? '')))
  ipcMain.handle(IPC.KNOWLEDGE_DOCUMENT_UPDATE, (_event, id: unknown, content: unknown) => knowledge.updateDocument(String(id ?? ''), String(content ?? '')))
  ipcMain.handle(IPC.KNOWLEDGE_DOCUMENT_IMPORT, (_event, input: { content?: unknown; knowledgeBaseId?: unknown; name?: unknown }) => knowledge.importDocument({ content: String(input?.content ?? ''), knowledgeBaseId: String(input?.knowledgeBaseId ?? ''), name: String(input?.name ?? '') }))
  ipcMain.handle(IPC.SETTINGS_CLEAR_API_KEY, () => settings.clearApiKey())
  ipcMain.handle(IPC.SETTINGS_COPY_API_KEY, () => {
    const apiKey = settings.getApiKey()
    if (!apiKey) throw new Error('当前配置没有已保存的 API Key')
    clipboard.writeText(apiKey)
  })
  ipcMain.handle(IPC.REMOTE_STATUS, () => remoteServer.getStatus())
  ipcMain.handle(IPC.SETTINGS_SAVE, (_event, patch: SettingsPatch) => {
    const validation = validateSettingsPatch(patch)
    if (!validation.ok) throw new Error(validation.message)
    const previous = settings.getPublic().hotkeys
    const next = { ...previous, ...(patch.hotkeys ?? {}) }
    if (patch.hotkeys) {
      const result = registerHotkeys(globalShortcut, next, previous, handleAction, mouseHotkeys)
      if (!result.ok) throw new Error(result.message)
    }
    try {
      const saved = settings.applyPatch(patch)
      if (patch.opacity !== undefined) window.setOpacity(saved.opacity)
      if (patch.remoteCompanion !== undefined) {
        if (saved.remoteCompanion.enabled) {
          void remoteServer.start(
            saved.remoteCompanion.port,
            saved.remoteCompanion.token,
            saved.remoteCompanion.outputTarget,
            saved.remoteCompanion.ip
          ).catch(console.error)
        } else {
          remoteServer.stop()
        }
      }
      remoteServer.setPanelState(getRemotePanelState())
      return saved
    } catch (error) {
      if (patch.hotkeys) registerHotkeys(globalShortcut, previous, previous, handleAction, mouseHotkeys)
      throw error
    }
  })
  ipcMain.handle(IPC.CAPTURE_PRIMARY, async () => {
    const result = await coordinator.capturePrimary()
    captureCount = result.count
    remoteServer.setPanelState(getRemotePanelState())
    return result
  })
  ipcMain.handle(IPC.ANSWER_START, (_event, input: { text?: unknown }) => {
    if (typeof input?.text !== 'string' || input.text.length > 8000) {
      throw new Error('输入内容无效')
    }
    const current = settings.getPublic()
    const apiKey = settings.getApiKey()
    if (!apiKey) throw new Error('请先在设置中保存 API Key')
    const result = coordinator.startAnswer({
      apiKey,
      apiProtocol: current.apiProtocol,
      baseUrl: current.baseUrl,
      userText: input.text,
      knowledgeBaseEnabled: current.knowledgeBaseEnabled,
      model: current.model,
      persistentPrompt: current.persistentPrompt,
      selectedKnowledgeBaseIds: current.selectedKnowledgeBaseIds
    })
    captureCount = 0
    remoteServer.setPanelState(getRemotePanelState())
    remoteServer.broadcast('turn-start', {
      turnId: result.turnId,
      userText: input.text
    })
    return result
  })
  ipcMain.handle(IPC.HOTKEY_RECORD, () => mouseHotkeys.record())
  ipcMain.handle(IPC.CONVERSATION_CLEAR, () => {
    clearConversation()
  })
  ipcMain.handle(IPC.ANSWER_CANCEL, (_event, requestId: unknown) => {
    if (typeof requestId === 'string') coordinator.cancelAnswer(requestId)
  })
  ipcMain.handle(IPC.WINDOW_HIDE, hideWindow)
  ipcMain.handle(IPC.WINDOW_SET_OPACITY, (_event, opacity: unknown) => {
    if (typeof opacity !== 'number') throw new Error('透明度无效')
    const validation = validateSettingsPatch({ opacity })
    if (!validation.ok) throw new Error(validation.message)
    window.setOpacity(opacity)
  })
  ipcMain.handle(IPC.WINDOW_TOGGLE, toggleWindow)
  ipcMain.handle(IPC.APP_QUIT, () => coordinator.shutdown())

  app.on('second-instance', () => {
    showWithoutActivation(window, !pointerThrough)
  })
  app.on('before-quit', (event) => {
    remoteServer.stop()
    if (!quitting) {
      event.preventDefault()
      coordinator.shutdown()
    }
  })
  app.on('window-all-closed', () => undefined)
  screen.on('display-metrics-changed', () => {
    const workArea = screen.getDisplayMatching(window.getBounds()).workArea
    window.setBounds(clampBoundsToWorkArea(window.getBounds(), workArea))
  })
}

function movementDelta(action: Extract<HotkeyAction, `move-${string}`>): { x: number; y: number } {
  if (action === 'move-up') return { x: 0, y: -WINDOW_MOVE_STEP }
  if (action === 'move-down') return { x: 0, y: WINDOW_MOVE_STEP }
  if (action === 'move-left') return { x: -WINDOW_MOVE_STEP, y: 0 }
  return { x: WINDOW_MOVE_STEP, y: 0 }
}

function loadBounds(filePath: string, workArea: Rectangle): Rectangle {
  const fallback = positionInWorkArea(workArea, DEFAULT_WIDTH, DEFAULT_HEIGHT, WINDOW_MARGIN)
  if (!existsSync(filePath)) return fallback
  try {
    const bounds = JSON.parse(readFileSync(filePath, 'utf8')) as Rectangle
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return fallback
    return clampBoundsToWorkArea(bounds, workArea)
  } catch {
    return fallback
  }
}
