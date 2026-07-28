import { desktopCapturer, screen } from 'electron'

export interface CapturedScreen {
  capturedAt: number
  dataUrl: string
  height: number
  width: number
}

export async function capturePrimaryDisplay(): Promise<CapturedScreen> {
  const display = screen.getPrimaryDisplay()
  const width = Math.round(display.size.width * display.scaleFactor)
  const height = Math.round(display.size.height * display.scaleFactor)
  const sources = await desktopCapturer.getSources({
    thumbnailSize: { height, width },
    types: ['screen']
  })
  const source = sources.find((candidate) => candidate.display_id === String(display.id)) ?? sources[0]
  if (!source || source.thumbnail.isEmpty()) throw new Error('无法捕获主屏幕')

  const jpeg = source.thumbnail.toJPEG(85)
  return {
    capturedAt: Date.now(),
    dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
    height: source.thumbnail.getSize().height,
    width: source.thumbnail.getSize().width
  }
}
