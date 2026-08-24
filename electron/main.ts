import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  safeStorage,
  screen,
  type Rectangle
} from 'electron'

import { IPC, type HotkeyAction, type SettingsPatch } from '../shared/protocol'
import { validateSettingsPatch } from '../shared/validation'
import { capturePrimaryDisplay } from './capture'
import { AppCoordinator } from './coordinator'
import { registerHotkeys } from './hotkeys'
import { streamVisionAnswer } from './llm/client'
import { extractVisionSearchQuery } from './llm/client'
import { KnowledgeBaseStore } from './knowledge-base'
import { SettingsStore, type SecretCipher } from './settings'
import { showWithoutActivation } from './window-interaction'
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
  let quitting = false

  const primaryWorkArea = screen.getPrimaryDisplay().workArea
  const initialBounds = loadBounds(boundsFile, primaryWorkArea)
  const window = new BrowserWindow({
    ...initialBounds,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    frame: false,
    focusable: false,
    hasShadow: false,
    minHeight: 440,
    minWidth: 380,
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
      showWithoutActivation(window)
    }
  }

  const coordinator = new AppCoordinator({
    capture: capturePrimaryDisplay,
    emitAnswer: (event) => window.webContents.send(IPC.ANSWER_EVENT, event),
    quit: () => {
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
    unregisterHotkeys: () => globalShortcut.unregisterAll()
  })

  const handleAction = (action: HotkeyAction) => {
    if (action === 'quit') coordinator.shutdown()
    else if (action === 'toggle') toggleWindow()
    else if (action === 'clear') {
      coordinator.clearCaptures()
      window.webContents.send(IPC.HOTKEY_ACTION, action)
    } else if (
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

  const initialRegistration = registerHotkeys(
    globalShortcut,
    settings.getPublic().hotkeys,
    settings.getPublic().hotkeys,
    handleAction
  )
  if (!initialRegistration.ok) console.error(initialRegistration.message)

  ipcMain.handle(IPC.SETTINGS_GET, () => settings.getPublic())
  ipcMain.handle(IPC.KNOWLEDGE_LIST, () => knowledge.listKnowledgeBases())
  ipcMain.handle(IPC.KNOWLEDGE_CREATE, (_event, name: unknown) => knowledge.createKnowledgeBase(String(name ?? '')))
  ipcMain.handle(IPC.KNOWLEDGE_RENAME, (_event, id: unknown, name: unknown) => knowledge.renameKnowledgeBase(String(id ?? ''), String(name ?? '')))
  ipcMain.handle(IPC.KNOWLEDGE_DELETE, (_event, id: unknown) => knowledge.deleteKnowledgeBase(String(id ?? '')))
  ipcMain.handle(IPC.KNOWLEDGE_DOCUMENT_LIST, (_event, id: unknown) => knowledge.listDocuments(String(id ?? '')))
  ipcMain.handle(IPC.KNOWLEDGE_DOCUMENT_DELETE, (_event, id: unknown) => knowledge.deleteDocument(String(id ?? '')))
  ipcMain.handle(IPC.KNOWLEDGE_DOCUMENT_UPDATE, (_event, id: unknown, content: unknown) => knowledge.updateDocument(String(id ?? ''), String(content ?? '')))
  ipcMain.handle(IPC.KNOWLEDGE_DOCUMENT_IMPORT, (_event, input: { content?: unknown; knowledgeBaseId?: unknown; name?: unknown }) => knowledge.importDocument({ content: String(input?.content ?? ''), knowledgeBaseId: String(input?.knowledgeBaseId ?? ''), name: String(input?.name ?? '') }))
  ipcMain.handle(IPC.SETTINGS_CLEAR_API_KEY, () => settings.clearApiKey())
  ipcMain.handle(IPC.SETTINGS_SAVE, (_event, patch: SettingsPatch) => {
    const validation = validateSettingsPatch(patch)
    if (!validation.ok) throw new Error(validation.message)
    const previous = settings.getPublic().hotkeys
    const next = { ...previous, ...(patch.hotkeys ?? {}) }
    if (patch.hotkeys) {
      const result = registerHotkeys(globalShortcut, next, previous, handleAction)
      if (!result.ok) throw new Error(result.message)
    }
    try {
      const saved = settings.applyPatch(patch)
      if (patch.opacity !== undefined) window.setOpacity(saved.opacity)
      return saved
    } catch (error) {
      if (patch.hotkeys) registerHotkeys(globalShortcut, previous, previous, handleAction)
      throw error
    }
  })
  ipcMain.handle(IPC.CAPTURE_PRIMARY, () => coordinator.capturePrimary())
  ipcMain.handle(IPC.CAPTURE_CLEAR, () => coordinator.clearCaptures())
  ipcMain.handle(IPC.ANSWER_START, (_event, input: { text?: unknown }) => {
    if (typeof input?.text !== 'string' || input.text.length > 8000) {
      throw new Error('输入内容无效')
    }
    const current = settings.getPublic()
    const apiKey = settings.getApiKey()
    if (!apiKey) throw new Error('请先在设置中保存 API Key')
    return coordinator.startAnswer({
      apiKey,
      apiProtocol: current.apiProtocol,
      baseUrl: current.baseUrl,
      userText: input.text,
      knowledgeBaseEnabled: current.knowledgeBaseEnabled,
      model: current.model,
      persistentPrompt: current.persistentPrompt,
      selectedKnowledgeBaseIds: current.selectedKnowledgeBaseIds
    })
  })
  ipcMain.handle(IPC.CONVERSATION_CLEAR, () => coordinator.clearConversation())
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
    showWithoutActivation(window)
  })
  app.on('before-quit', (event) => {
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
