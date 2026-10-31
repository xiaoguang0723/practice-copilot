export interface HotkeySettings {
  answer: string
  audioToggle: string
  capture: string
  clear: string
  ghostMode: string
  pointerThrough: string
  promptTemplateNext: string
  quit: string
  remoteOutputToggle: string
  scrollDown: string
  scrollUp: string
  toggle: string
}

export interface AudioStateEvent {
  error?: string
  listening: boolean
  speaking: boolean
  transcribing: boolean
  transcript: string
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
  sttModel: string
}

export interface PromptTemplate {
  content: string
  id: string
  name: string
}

export interface RemotePanelState {
  apiConfigurationName: string
  audioListening?: boolean
  audioSpeaking?: boolean
  audioTranscribing?: boolean
  captureCount: number
  liveTranscript?: string
  promptTemplateName: string
}

export interface PublicSettings {
  activeApiConfigurationId: string
  activePromptTemplateId: string
  apiConfigurations: ApiConfiguration[]
  apiKeySet: boolean
  apiProtocol: 'chat' | 'response'
  baseUrl: string
  hotkeys: HotkeySettings
  knowledgeBaseEnabled: boolean
  model: string
  opacity: number
  persistentPrompt: string
  promptTemplates: PromptTemplate[]
  remoteCompanion: RemoteCompanionSettings
  selectedKnowledgeBaseIds: string[]
  sttApiKeySet: boolean
  sttBaseUrl: string
  sttModel: string
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
  promptTemplateName?: string
  remoteCompanion?: Partial<RemoteCompanionSettings>
  selectedKnowledgeBaseIds?: string[]
  sttApiKey?: string
  sttBaseUrl?: string
  sttModel?: string
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
  | 'audio-toggle'
  | 'capture'
  | 'clear'
  | 'configuration-next'
  | 'ghost-mode'
  | 'move-down'
  | 'move-left'
  | 'move-right'
  | 'move-up'
  | 'pointer-through'
  | 'prompt-template-next'
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
  AUDIO_CLEAR: 'audio:clear',
  AUDIO_GET_STATE: 'audio:get-state',
  AUDIO_SPEAKING: 'audio:speaking',
  AUDIO_STATE: 'audio:state',
  AUDIO_TOGGLE: 'audio:toggle',
  AUDIO_TRANSCRIBE: 'audio:transcribe',
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
  SETTINGS_PROMPT_TEMPLATE_ACTIVATE: 'settings:prompt-template-activate',
  SETTINGS_PROMPT_TEMPLATE_CREATE: 'settings:prompt-template-create',
  SETTINGS_PROMPT_TEMPLATE_DELETE: 'settings:prompt-template-delete',
  SETTINGS_PROMPT_TEMPLATE_MOVE: 'settings:prompt-template-move',
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
  audio: {
    clear(): Promise<AudioStateEvent>
    getState(): Promise<AudioStateEvent>
    onState(callback: (state: AudioStateEvent) => void): () => void
    setSpeaking(speaking: boolean): Promise<void>
    toggle(enabled?: boolean): Promise<AudioStateEvent>
    transcribe(wavBase64: string): Promise<AudioStateEvent>
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
      availableIps?: Array<{ address: string; name: string }>
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
    activatePromptTemplate(id: string): Promise<PublicSettings>
    createPromptTemplate(name: string): Promise<PublicSettings>
    deletePromptTemplate(id: string): Promise<PublicSettings>
    movePromptTemplate(id: string, direction: 'up' | 'down'): Promise<PublicSettings>
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
    name: '默认配置',
    sttModel: 'gpt-4o-mini-transcribe'
  }
  return {
    activeApiConfigurationId: defaultConfiguration.id,
    activePromptTemplateId: 'default-prompt',
    apiConfigurations: [defaultConfiguration],
    apiKeySet: false,
    apiProtocol: 'chat',
    baseUrl: 'https://api.openai.com/v1',
    hotkeys: {
      answer: 'MouseRightDoubleClick',
      audioToggle: 'Alt+S',
      capture: 'MouseLeftDoubleClick',
      clear: 'MouseMiddleDoubleClick',
      ghostMode: 'Alt+M',
      pointerThrough: 'Alt+D',
      promptTemplateNext: 'MouseRightLongPress',
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
    promptTemplates: [{ content: '', id: 'default-prompt', name: '默认提示词' }],
    remoteCompanion: {
      enabled: false,
      outputTarget: 'both',
      port: 5188,
      token: ''
    },
    selectedKnowledgeBaseIds: [],
    sttApiKeySet: false,
    sttBaseUrl: 'https://api.chatanywhere.tech/v1',
    sttModel: 'gpt-4o-mini-transcribe'
  }
}
