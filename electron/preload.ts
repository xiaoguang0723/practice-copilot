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
    clear: () => ipcRenderer.invoke(IPC.CAPTURE_CLEAR),
    primary: () => ipcRenderer.invoke(IPC.CAPTURE_PRIMARY)
  },
  conversation: {
    clear: () => ipcRenderer.invoke(IPC.CONVERSATION_CLEAR)
  },
  hotkeys: {
    onAction: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, action: HotkeyAction) => callback(action)
      ipcRenderer.on(IPC.HOTKEY_ACTION, listener)
      return () => ipcRenderer.removeListener(IPC.HOTKEY_ACTION, listener)
    }
  },
  knowledge: {
    create: (name) => ipcRenderer.invoke(IPC.KNOWLEDGE_CREATE, name),
    delete: (id) => ipcRenderer.invoke(IPC.KNOWLEDGE_DELETE, id),
    deleteDocument: (id) => ipcRenderer.invoke(IPC.KNOWLEDGE_DOCUMENT_DELETE, id),
    importDocument: (input) => ipcRenderer.invoke(IPC.KNOWLEDGE_DOCUMENT_IMPORT, input),
    list: () => ipcRenderer.invoke(IPC.KNOWLEDGE_LIST),
    listDocuments: (id) => ipcRenderer.invoke(IPC.KNOWLEDGE_DOCUMENT_LIST, id),
    rename: (id, name) => ipcRenderer.invoke(IPC.KNOWLEDGE_RENAME, id, name),
    updateDocument: (id, content) => ipcRenderer.invoke(IPC.KNOWLEDGE_DOCUMENT_UPDATE, id, content)
  },
  settings: {
    clearApiKey: () => ipcRenderer.invoke(IPC.SETTINGS_CLEAR_API_KEY),
    get: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
    save: (patch) => ipcRenderer.invoke(IPC.SETTINGS_SAVE, patch)
  },
  window: {
    hide: () => ipcRenderer.invoke(IPC.WINDOW_HIDE),
    setOpacity: (opacity) => ipcRenderer.invoke(IPC.WINDOW_SET_OPACITY, opacity),
    toggle: () => ipcRenderer.invoke(IPC.WINDOW_TOGGLE)
  }
}

contextBridge.exposeInMainWorld('practice', api)
