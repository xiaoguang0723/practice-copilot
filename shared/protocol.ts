export interface HotkeySettings {
  answer: string
  capture: string
  clear: string
  quit: string
  toggle: string
}

export interface PublicSettings {
  apiKeySet: boolean
  baseUrl: string
  hotkeys: HotkeySettings
  model: string
  opacity: number
  persistentPrompt: string
}

export interface SettingsPatch {
  apiKey?: string
  baseUrl?: string
  hotkeys?: Partial<HotkeySettings>
  model?: string
  opacity?: number
  persistentPrompt?: string
}

export type AnswerEvent =
  | { delta: string; requestId: string; type: 'delta' }
  | { requestId: string; type: 'done' }
  | { message: string; requestId: string; type: 'error' }

export interface CaptureResult {
  capturedAt: number
  count: number
  height: number
  width: number
}

export type HotkeyAction =
  | 'answer'
  | 'capture'
  | 'clear'
  | 'move-down'
  | 'move-left'
  | 'move-right'
  | 'move-up'
  | 'pointer-through'
  | 'quit'
  | 'scroll-down'
  | 'scroll-up'
  | 'settings'
  | 'toggle'

export const IPC = {
  ANSWER_CANCEL: 'answer:cancel',
  ANSWER_EVENT: 'answer:event',
  ANSWER_START: 'answer:start',
  APP_QUIT: 'app:quit',
  CAPTURE_PRIMARY: 'capture:primary',
  CAPTURE_CLEAR: 'capture:clear',
  HOTKEY_ACTION: 'hotkeys:action',
  SETTINGS_CLEAR_API_KEY: 'settings:clear-api-key',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
  WINDOW_HIDE: 'window:hide',
  WINDOW_TOGGLE: 'window:toggle'
} as const

export interface PracticeApi {
  answer: {
    cancel(requestId: string): Promise<void>
    onEvent(callback: (event: AnswerEvent) => void): () => void
    start(input: { extraPrompt: string }): Promise<{ requestId: string }>
  }
  app: {
    quit(): Promise<void>
  }
  capture: {
    clear(): Promise<void>
    primary(): Promise<CaptureResult>
  }
  hotkeys: {
    onAction(callback: (action: HotkeyAction) => void): () => void
  }
  settings: {
    clearApiKey(): Promise<PublicSettings>
    get(): Promise<PublicSettings>
    save(patch: SettingsPatch): Promise<PublicSettings>
  }
  window: {
    hide(): Promise<void>
    toggle(): Promise<void>
  }
}

export function createDefaultSettings(): PublicSettings {
  return {
    apiKeySet: false,
    baseUrl: 'https://api.openai.com/v1',
    hotkeys: {
      answer: 'Alt+W',
      capture: 'Alt+Q',
      clear: 'Alt+R',
      quit: 'Alt+X',
      toggle: 'Alt+E'
    },
    model: 'gpt-4.1-mini',
    opacity: 0.88,
    persistentPrompt: ''
  }
}
