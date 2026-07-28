import type { CaptureResult } from '../shared/protocol'

export type AppPhase = 'captured' | 'complete' | 'error' | 'idle' | 'streaming'

export interface AppState {
  answer: string
  capture?: CaptureResult
  currentRequestId?: string
  error?: string
  phase: AppPhase
}

export type AppAction =
  | { type: 'capture-clear' }
  | { result: CaptureResult; type: 'capture-success' }
  | { message: string; type: 'local-error' }
  | { requestId: string; type: 'stream-start' }
  | { delta: string; requestId: string; type: 'stream-delta' }
  | { requestId: string; type: 'stream-done' }
  | { message: string; requestId: string; type: 'stream-error' }

export const initialAppState: AppState = { answer: '', phase: 'idle' }

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'capture-success':
      return { ...state, capture: action.result, error: undefined, phase: 'captured' }
    case 'capture-clear':
      return { ...state, capture: undefined, error: undefined, phase: 'idle' }
    case 'local-error':
      return { ...state, error: action.message, phase: 'error' }
    case 'stream-start':
      return {
        ...state,
        answer: '',
        currentRequestId: action.requestId,
        error: undefined,
        phase: 'streaming'
      }
    case 'stream-delta':
      return action.requestId === state.currentRequestId
        ? { ...state, answer: state.answer + action.delta }
        : state
    case 'stream-done':
      return action.requestId === state.currentRequestId
        ? { ...state, currentRequestId: undefined, phase: 'complete' }
        : state
    case 'stream-error':
      return action.requestId === state.currentRequestId
        ? {
            ...state,
            currentRequestId: undefined,
            error: action.message,
            phase: 'error'
          }
        : state
  }
}
