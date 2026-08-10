import type { CaptureResult } from '../shared/protocol'

export type AppPhase = 'complete' | 'error' | 'idle' | 'streaming'

export interface ConversationTurnView {
  assistantText: string
  id: string
  status: 'complete' | 'error' | 'streaming'
  userText: string
}

export interface AppState {
  answer: string
  capture?: CaptureResult
  currentRequestId?: string
  currentTurnId?: string
  error?: string
  phase: AppPhase
  turns: ConversationTurnView[]
}

export type AppAction =
  | { type: 'capture-clear' }
  | { result: CaptureResult; type: 'capture-success' }
  | { type: 'conversation-clear' }
  | { message: string; type: 'local-error' }
  | { requestId: string; turnId: string; type: 'turn-start'; userText: string }
  | { delta: string; requestId: string; turnId: string; type: 'stream-delta' }
  | { requestId: string; turnId: string; type: 'stream-done' }
  | { message: string; requestId: string; turnId: string; type: 'stream-error' }

export const initialAppState: AppState = { answer: '', phase: 'idle', turns: [] }

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'capture-success':
      return { ...state, capture: action.result, error: undefined }
    case 'capture-clear':
      return { ...state, capture: undefined }
    case 'conversation-clear':
      return initialAppState
    case 'local-error':
      return { ...state, error: action.message, phase: 'error' }
    case 'turn-start':
      return {
        ...state,
        answer: '',
        currentRequestId: action.requestId,
        currentTurnId: action.turnId,
        error: undefined,
        phase: 'streaming',
        turns: [
          ...state.turns,
          { assistantText: '', id: action.turnId, status: 'streaming', userText: action.userText }
        ]
      }
    case 'stream-delta':
      if (action.requestId !== state.currentRequestId || action.turnId !== state.currentTurnId) return state
      return {
        ...state,
        answer: state.answer + action.delta,
        turns: state.turns.map((turn) => turn.id === action.turnId
          ? { ...turn, assistantText: turn.assistantText + action.delta }
          : turn)
      }
    case 'stream-done':
      if (action.requestId !== state.currentRequestId || action.turnId !== state.currentTurnId) return state
      return {
        ...state,
        currentRequestId: undefined,
        currentTurnId: undefined,
        phase: 'complete',
        turns: state.turns.map((turn) => turn.id === action.turnId ? { ...turn, status: 'complete' } : turn)
      }
    case 'stream-error':
      if (action.requestId !== state.currentRequestId || action.turnId !== state.currentTurnId) return state
      return {
        ...state,
        currentRequestId: undefined,
        currentTurnId: undefined,
        error: action.message,
        phase: 'error',
        turns: state.turns.map((turn) => turn.id === action.turnId ? { ...turn, status: 'error' } : turn)
      }
  }
}
