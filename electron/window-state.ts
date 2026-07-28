export interface Rectangle {
  height: number
  width: number
  x: number
  y: number
}

export function positionInWorkArea(
  workArea: Rectangle,
  width: number,
  height: number,
  margin: number
): Rectangle {
  return {
    height,
    width,
    x: workArea.x + workArea.width - width - margin,
    y: workArea.y + workArea.height - height - margin
  }
}

export function clampBoundsToWorkArea(bounds: Rectangle, workArea: Rectangle): Rectangle {
  const width = Math.min(Math.max(1, bounds.width), workArea.width)
  const height = Math.min(Math.max(1, bounds.height), workArea.height)
  return {
    height,
    width,
    x: Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - width),
    y: Math.min(Math.max(bounds.y, workArea.y), workArea.y + workArea.height - height)
  }
}

export function moveBoundsWithinWorkArea(
  bounds: Rectangle,
  workArea: Rectangle,
  deltaX: number,
  deltaY: number
): Rectangle {
  return clampBoundsToWorkArea({ ...bounds, x: bounds.x + deltaX, y: bounds.y + deltaY }, workArea)
}
