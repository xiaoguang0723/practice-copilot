import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

const modulePath = join(process.cwd(), 'electron', 'window-interaction.ts')

async function loadInteraction() {
  const moduleExists = existsSync(modulePath)
  expect(moduleExists).toBe(true)
  if (!moduleExists) return undefined
  return vi.importActual<{
    setPointerThrough(window: TestWindow, enabled: boolean): void
    showWithoutActivation(window: TestWindow, interactive?: boolean): void
  }>('../electron/window-interaction')
}

interface TestWindow {
  blur(): void
  setFocusable(focusable: boolean): void
  setIgnoreMouseEvents(ignore: boolean, options: { forward: boolean }): void
  setSkipTaskbar(skip: boolean): void
  showInactive(): void
}

function createWindow(): TestWindow {
  return {
    blur: vi.fn(),
    setFocusable: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    setSkipTaskbar: vi.fn(),
    showInactive: vi.fn()
  }
}

describe('showWithoutActivation', () => {
  it('shows the overlay without activating it', async () => {
    const interaction = await loadInteraction()
    if (!interaction) return
    const window = createWindow()

    interaction.showWithoutActivation(window)

    expect(window.setFocusable).toHaveBeenCalledWith(true)
    expect(window.setSkipTaskbar).toHaveBeenCalledWith(true)
    expect(window.showInactive).toHaveBeenCalledOnce()
    expect(window).not.toHaveProperty('show')
  })

  it('keeps a pointer-through overlay non-focusable when shown', async () => {
    const interaction = await loadInteraction()
    if (!interaction) return
    const window = createWindow()

    interaction.showWithoutActivation(window, false)

    expect(window.setFocusable).toHaveBeenCalledWith(false)
    expect(window.showInactive).toHaveBeenCalledOnce()
  })

  it('enables and disables pointer-through mode', async () => {
    const interaction = await loadInteraction()
    if (!interaction) return
    const window = createWindow()

    interaction.setPointerThrough(window, true)
    expect(window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true })
    expect(window.setFocusable).toHaveBeenLastCalledWith(false)
    expect(window.blur).toHaveBeenCalledOnce()

    interaction.setPointerThrough(window, false)
    expect(window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true })
    expect(window.setFocusable).toHaveBeenLastCalledWith(true)
    expect(window.blur).toHaveBeenCalledOnce()
  })
})
