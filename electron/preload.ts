import { contextBridge, ipcRenderer } from 'electron'

import {
  IPC,
  type AnswerEvent,
  type HotkeyAction,
  type PracticeApi
} from '../shared/protocol'

const api: PracticeApi = {
  answer: {
    cancel: (requestId) => ipcRenderer.invoke(IPC.ANSWER_CANCEL, requestId),
    onEvent: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: AnswerEvent) => callback(payload)
      ipcRenderer.on(IPC.ANSWER_EVENT, listener)
      return () => ipcRenderer.removeListener(IPC.ANSWER_EVENT, listener)
    },
    start: (input) => ipcRenderer.invoke(IPC.ANSWER_START, input)
  },
  app: {
    quit: () => ipcRenderer.invoke(IPC.APP_QUIT)
  },
  capture: {
    primary: () => ipcRenderer.invoke(IPC.CAPTURE_PRIMARY)
  },
  hotkeys: {
    onAction: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, action: HotkeyAction) => callback(action)
      ipcRenderer.on(IPC.HOTKEY_ACTION, listener)
      return () => ipcRenderer.removeListener(IPC.HOTKEY_ACTION, listener)
    }
  },
  settings: {
    clearApiKey: () => ipcRenderer.invoke(IPC.SETTINGS_CLEAR_API_KEY),
    get: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
    save: (patch) => ipcRenderer.invoke(IPC.SETTINGS_SAVE, patch)
  },
  window: {
    hide: () => ipcRenderer.invoke(IPC.WINDOW_HIDE),
    toggle: () => ipcRenderer.invoke(IPC.WINDOW_TOGGLE)
  }
}

contextBridge.exposeInMainWorld('practice', api)

