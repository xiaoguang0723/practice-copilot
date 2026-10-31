import { describe, expect, it } from 'vitest'

import { parseProtectedCaptureLines, pickWindowSource } from '../electron/capture'

describe('parseProtectedCaptureLines', () => {
  it('parses affinity/title/image TSV lines and deduplicates titles', () => {
    const raw = '17\t国考云考试系统\tC:\\tmp\\protected_0.png\n17\t国考云考试系统\tC:\\tmp\\protected_1.png\n17\t另一个窗口\t\n'
    expect(parseProtectedCaptureLines(raw)).toEqual([
      { imageFile: 'C:\\tmp\\protected_0.png', title: '国考云考试系统' },
      { imageFile: '', title: '另一个窗口' }
    ])
  })

  it('ignores blank and malformed lines', () => {
    const raw = '\nnotsplits\n17\t\tC:\\tmp\\a.png\n'
    expect(parseProtectedCaptureLines(raw)).toEqual([])
  })

  it('returns an empty list for empty input', () => {
    expect(parseProtectedCaptureLines('')).toEqual([])
  })
})

describe('pickWindowSource', () => {
  const sources = [
    { id: 'window:1', name: 'VMware Workstation - 国考云' },
    { id: 'window:2', name: 'Claude' }
  ]

  it('matches the first window whose title contains the keyword case-insensitively', () => {
    expect(pickWindowSource(sources, 'vmware')).toEqual(sources[0])
    expect(pickWindowSource(sources, 'CLAUDE')).toEqual(sources[1])
  })

  it('returns undefined when there is no match or the pattern is blank', () => {
    expect(pickWindowSource(sources, '不存在')).toBeUndefined()
    expect(pickWindowSource(sources, '   ')).toBeUndefined()
  })
})
