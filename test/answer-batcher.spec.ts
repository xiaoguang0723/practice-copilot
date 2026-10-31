import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AnswerEvent } from '../shared/protocol'
import { AnswerEventBatcher } from '../electron/answer-batcher'

const delta = (text: string, requestId = 'r1'): AnswerEvent => ({ delta: text, requestId, turnId: 't1', type: 'delta' })

describe('AnswerEventBatcher', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('emits the first delta immediately and coalesces the rest', () => {
    const emit = vi.fn()
    const batcher = new AnswerEventBatcher(emit, 40)
    batcher.push(delta('He'))
    expect(emit).toHaveBeenCalledTimes(1)
    batcher.push(delta('l'))
    batcher.push(delta('lo'))
    expect(emit).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(40)
    expect(emit).toHaveBeenCalledTimes(2)
    expect(emit).toHaveBeenLastCalledWith(delta('llo'))
  })

  it('flushes buffered text before done to preserve order', () => {
    const emit = vi.fn()
    const batcher = new AnswerEventBatcher(emit, 40)
    batcher.push(delta('a'))
    batcher.push(delta('b'))
    batcher.push({ requestId: 'r1', turnId: 't1', type: 'done' })
    expect(emit.mock.calls.map(([event]) => (event as AnswerEvent).type)).toEqual(['delta', 'delta', 'done'])
    expect((emit.mock.calls[1][0] as { delta: string }).delta).toBe('b')
  })

  it('does not merge deltas from different requests', () => {
    const emit = vi.fn()
    const batcher = new AnswerEventBatcher(emit, 40)
    batcher.push(delta('x', 'r1'))
    batcher.push(delta('y', 'r1'))
    batcher.push(delta('z', 'r2'))
    expect(emit.mock.calls.map(([event]) => (event as { delta: string }).delta)).toEqual(['x', 'y', 'z'])
  })
})
