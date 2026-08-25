import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('native module packaging', () => {
  it('keeps better-sqlite3 external to the Electron main bundle', () => {
    const source = readFileSync(join(process.cwd(), 'electron.vite.config.ts'), 'utf8')

    expect(source).toContain("external: ['better-sqlite3', 'uiohook-napi']")
    expect(source).toContain("'uiohook-napi'")
  })
})
