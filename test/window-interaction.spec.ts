import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

const modulePath = join(process.cwd(), 'electron', 'window-interaction.ts')

async function loadInteraction() {
  const moduleExists = existsSync(modulePath)
  expect(moduleExists).toBe(true)
  if (!moduleExists) return undefined
  return vi.importActual<{
    setPointerThrough(window: {
      blur(): void
      setFocusable(focusable: boolean): void
      setIgnoreMouseEvents(ignore: boolean, options: { forward: boolean }): void
    }, enabled: boolean): void
  }>('../electron/window-interaction')
}

describe('setPointerThrough', () => {
  it('makes the window mouse-transparent and unfocusable when enabled', async () => {
    const interaction = await loadInteraction()
    if (!interaction) return

    const window = {
      blur: vi.fn(),
      setFocusable: vi.fn(),
      setIgnoreMouseEvents: vi.fn()
    }

    interaction.setPointerThrough(window, true)

    expect(window.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true })
    expect(window.setFocusable).toHaveBeenCalledWith(false)
    expect(window.blur).toHaveBeenCalledOnce()
  })

  it('restores mouse interaction and focusability when disabled', async () => {
    const interaction = await loadInteraction()
    if (!interaction) return

    const window = {
      blur: vi.fn(),
      setFocusable: vi.fn(),
      setIgnoreMouseEvents: vi.fn()
    }

    interaction.setPointerThrough(window, false)

    expect(window.setIgnoreMouseEvents).toHaveBeenCalledWith(false, { forward: true })
    expect(window.setFocusable).toHaveBeenCalledWith(true)
    expect(window.blur).not.toHaveBeenCalled()
  })
})
