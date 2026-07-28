import { describe, expect, it } from 'vitest'

import { moveBoundsWithinWorkArea } from '../electron/window-state'

describe('moveBoundsWithinWorkArea', () => {
  it('moves by the requested offset while keeping the window in the work area', () => {
    const workArea = { height: 600, width: 800, x: 0, y: 0 }

    expect(moveBoundsWithinWorkArea({ height: 300, width: 400, x: 200, y: 100 }, workArea, 24, -24)).toEqual({
      height: 300,
      width: 400,
      x: 224,
      y: 76
    })
    expect(moveBoundsWithinWorkArea({ height: 300, width: 400, x: 390, y: 290 }, workArea, 24, 24)).toEqual({
      height: 300,
      width: 400,
      x: 400,
      y: 300
    })
  })
})
