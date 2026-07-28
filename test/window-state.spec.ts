import { describe, expect, it } from 'vitest'

import { clampBoundsToWorkArea, positionInWorkArea } from '../electron/window-state'

describe('window geometry', () => {
  const workArea = { height: 1040, width: 1920, x: 0, y: 0 }

  it('places the default window 24 pixels from the bottom-right', () => {
    expect(positionInWorkArea(workArea, 460, 620, 24)).toEqual({
      height: 620,
      width: 460,
      x: 1436,
      y: 396
    })
  })

  it('clamps persisted bounds into a changed work area', () => {
    expect(
      clampBoundsToWorkArea(
        { height: 1200, width: 2200, x: -500, y: 900 },
        { height: 1080, width: 1920, x: 100, y: -40 }
      )
    ).toEqual({ height: 1080, width: 1920, x: 100, y: -40 })
  })
})
