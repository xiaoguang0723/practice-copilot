import { describe, expect, it } from 'vitest'

import { appReducer, initialAppState } from '../src/state'

describe('appReducer', () => {
  it('tracks capture and starts a conversation turn', () => {
    const captured = appReducer(initialAppState, {
      result: { capturedAt: 10, count: 1, height: 1080, width: 1920 },
      type: 'capture-success'
    })
    const streaming = appReducer(
      { ...captured, answer: '旧回答' },
      { requestId: 'request-1', turnId: 'turn-1', type: 'turn-start', userText: '继续解释' }
    )

    expect(streaming.capture?.capturedAt).toBe(10)
    expect(streaming.answer).toBe('')
    expect(streaming.phase).toBe('streaming')
    expect(streaming.turns[0].userText).toBe('继续解释')
  })

  it('appends only matching deltas and preserves capture after errors', () => {
    const state = {
      ...initialAppState,
      capture: { capturedAt: 10, count: 1, height: 1080, width: 1920 },
      currentRequestId: 'request-1',
      currentTurnId: 'turn-1',
      phase: 'streaming' as const,
      turns: [{ assistantText: '', id: 'turn-1', status: 'streaming' as const, userText: '问题' }]
    }
    const ignored = appReducer(state, { delta: '错', requestId: 'request-2', turnId: 'turn-1', type: 'stream-delta' })
    const appended = appReducer(ignored, {
      delta: '答案',
      requestId: 'request-1',
      turnId: 'turn-1',
      type: 'stream-delta'
    })
    const failed = appReducer(appended, {
      message: '网络错误',
      requestId: 'request-1',
      turnId: 'turn-1',
      type: 'stream-error'
    })

    expect(failed.answer).toBe('答案')
    expect(failed.capture).toEqual(state.capture)
    expect(failed.error).toBe('网络错误')
  })
})
