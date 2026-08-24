import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

const modulePath = join(process.cwd(), 'electron', 'window-interaction.ts')

async function loadInteraction() {
  const moduleExists = existsSync(modulePath)
  expect(moduleExists).toBe(true)
  if (!moduleExists) return undefined
  return vi.importActual<{
    showWithoutActivation(window: TestWindow): void
  }>('../electron/window-interaction')
}

interface TestWindow {
  setFocusable(focusable: boolean): void
  setSkipTaskbar(skip: boolean): void
  showInactive(): void
}

function createWindow(): TestWindow {
  return {
    setFocusable: vi.fn(),
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
})
