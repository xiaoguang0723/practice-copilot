export interface HotkeySettings {
  answer: string
  capture: string
  clear: string
  ghostMode: string
  pointerThrough: string
  quit: string
  remoteOutputToggle: string
  scrollDown: string
  scrollUp: string
  toggle: string
}

export interface RemoteCompanionSettings {
  enabled: boolean
  ip?: string
  outputTarget: 'both' | 'remote-only'
  port: number
  token: string
}

export interface ApiConfiguration {
  apiKeySet: boolean
  apiProtocol: 'chat' | 'response'
  baseUrl: string
  id: string
  model: string
  name: string
}

export interface PublicSettings {
  activeApiConfigurationId: string
  apiConfigurations: ApiConfiguration[]
  apiKeySet: boolean
  apiProtocol: 'chat' | 'response'
  baseUrl: string
  hotkeys: HotkeySettings
  knowledgeBaseEnabled: boolean
  model: string
  opacity: number
  persistentPrompt: string
  remoteCompanion: RemoteCompanionSettings
  selectedKnowledgeBaseIds: string[]
}

export interface SettingsPatch {
  apiConfigName?: string
  apiKey?: string
  apiProtocol?: 'chat' | 'response'
  baseUrl?: string
  hotkeys?: Partial<HotkeySettings>
  knowledgeBaseEnabled?: boolean
  model?: string
  opacity?: number
  persistentPrompt?: string
  remoteCompanion?: Partial<RemoteCompanionSettings>
  selectedKnowledgeBaseIds?: string[]
}

export type AnswerEvent =
  | { delta: string; requestId: string; turnId: string; type: 'delta' }
  | { requestId: string; turnId: string; type: 'done' }
  | { message: string; requestId: string; turnId: string; type: 'error' }

export interface CaptureResult {
  capturedAt: number
  count: number
  height: number
  width: number
}
export interface KnowledgeBaseSummary { createdAt: number; id: string; name: string; updatedAt: number }
export interface KnowledgeDocument { content: string; createdAt: number; id: string; knowledgeBaseId: string; name: string; updatedAt: number }

export type HotkeyAction =
  | 'answer'
  | 'capture'
  | 'clear'
  | 'configuration-next'
  | 'ghost-mode'
  | 'move-down'
  | 'move-left'
  | 'move-right'
  | 'move-up'
  | 'pointer-through'
  | 'quit'
  | 'remote-output-toggle'
  | 'scroll-down'
  | 'scroll-up'
  | 'settings'
  | 'toggle'

export const IPC = {
  ANSWER_CANCEL: 'answer:cancel',
  ANSWER_EVENT: 'answer:event',
  ANSWER_START: 'answer:start',
  CONVERSATION_CLEAR: 'conversation:clear',
  APP_QUIT: 'app:quit',
  CAPTURE_PRIMARY: 'capture:primary',
  HOTKEY_ACTION: 'hotkeys:action',
  HOTKEY_RECORD: 'hotkeys:record',
  KNOWLEDGE_CREATE: 'knowledge:create', KNOWLEDGE_DELETE: 'knowledge:delete', KNOWLEDGE_DOCUMENT_DELETE: 'knowledge:document-delete',
  KNOWLEDGE_DOCUMENT_IMPORT: 'knowledge:document-import', KNOWLEDGE_DOCUMENT_LIST: 'knowledge:document-list', KNOWLEDGE_DOCUMENT_UPDATE: 'knowledge:document-update',
  KNOWLEDGE_LIST: 'knowledge:list', KNOWLEDGE_RENAME: 'knowledge:rename',
  REMOTE_STATUS: 'remote:status',
  SETTINGS_CLEAR_API_KEY: 'settings:clear-api-key',
  SETTINGS_CONFIGURATION_ACTIVATE: 'settings:configuration-activate',
  SETTINGS_CONFIGURATION_CREATE: 'settings:configuration-create',
  SETTINGS_CONFIGURATION_DELETE: 'settings:configuration-delete',
  SETTINGS_CONFIGURATION_MOVE: 'settings:configuration-move',
  SETTINGS_COPY_API_KEY: 'settings:copy-api-key',
  SETTINGS_CHANGED: 'settings:changed',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
  WINDOW_HIDE: 'window:hide',
  WINDOW_SET_OPACITY: 'window:set-opacity',
  WINDOW_TOGGLE: 'window:toggle'
} as const

export interface PracticeApi {
  answer: {
    cancel(requestId: string): Promise<void>
    onEvent(callback: (event: AnswerEvent) => void): () => void
    start(input: { text: string }): Promise<{ requestId: string; turnId: string }>
  }
  app: {
    quit(): Promise<void>
  }
  capture: {
    primary(): Promise<CaptureResult>
  }
  conversation: {
    clear(): Promise<void>
  }
  hotkeys: {
    onAction(callback: (action: HotkeyAction) => void): () => void
    record(): Promise<string>
  }
  knowledge: {
    create(name: string): Promise<KnowledgeBaseSummary>
    delete(id: string): Promise<void>
    deleteDocument(id: string): Promise<void>
    importDocument(input: { content: string; knowledgeBaseId: string; name: string }): Promise<KnowledgeDocument>
    list(): Promise<KnowledgeBaseSummary[]>
    listDocuments(knowledgeBaseId: string): Promise<KnowledgeDocument[]>
    rename(id: string, name: string): Promise<KnowledgeBaseSummary>
    updateDocument(id: string, content: string): Promise<KnowledgeDocument>
  }
  remote: {
    getStatus(): Promise<{
      active: boolean
      clientCount: number
      ip: string
      outputTarget: 'both' | 'remote-only'
      port: number
      qrDataUrl: string
      url: string
    }>
  }
  settings: {
    activateApiConfiguration(id: string): Promise<PublicSettings>
    clearApiKey(): Promise<PublicSettings>
    copyApiKey(): Promise<void>
    createApiConfiguration(name: string): Promise<PublicSettings>
    deleteApiConfiguration(id: string): Promise<PublicSettings>
    get(): Promise<PublicSettings>
    moveApiConfiguration(id: string, direction: 'up' | 'down'): Promise<PublicSettings>
    onChange(callback: (settings: PublicSettings) => void): () => void
    save(patch: SettingsPatch): Promise<PublicSettings>
  }
  window: {
    hide(): Promise<void>
    setOpacity(opacity: number): Promise<void>
    toggle(): Promise<void>
  }
}

export function createDefaultSettings(): PublicSettings {
  const defaultConfiguration: ApiConfiguration = {
    apiKeySet: false,
    apiProtocol: 'chat',
    baseUrl: 'https://api.openai.com/v1',
    id: 'default',
    model: 'gpt-4.1-mini',
    name: '默认配置'
  }
  return {
    activeApiConfigurationId: defaultConfiguration.id,
    apiConfigurations: [defaultConfiguration],
    apiKeySet: false,
    apiProtocol: 'chat',
    baseUrl: 'https://api.openai.com/v1',
    hotkeys: {
      answer: 'MouseRightDoubleClick',
      capture: 'MouseLeftDoubleClick',
      clear: 'MouseMiddleDoubleClick',
      ghostMode: 'Alt+M',
      pointerThrough: 'Alt+D',
      quit: 'Alt+X',
      remoteOutputToggle: 'Alt+R',
      scrollDown: 'MouseLeftHold+WheelDown',
      scrollUp: 'MouseLeftHold+WheelUp',
      toggle: 'MouseMiddleLongPress'
    },
    knowledgeBaseEnabled: false,
    model: 'gpt-4.1-mini',
    opacity: 0.88,
    persistentPrompt: '',
    remoteCompanion: {
      enabled: false,
      outputTarget: 'both',
      port: 5188,
      token: ''
    },
    selectedKnowledgeBaseIds: []
  }
}
