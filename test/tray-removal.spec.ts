import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const readProjectFile = (path: string) => readFileSync(join(projectRoot, path), 'utf8')

describe('tray removal', () => {
  it('has no runtime tray implementation or packaged tray asset', () => {
    const mainSource = readProjectFile('electron/main.ts')
    const coordinatorSource = readProjectFile('electron/coordinator.ts')
    const packageJson = JSON.parse(readProjectFile('package.json')) as {
      build: { files: string[] }
    }

    expect(mainSource).not.toContain("from './tray'")
    expect(mainSource).not.toMatch(/\bTray\b/)
    expect(coordinatorSource).not.toContain('destroyTray')
    expect(existsSync(join(projectRoot, 'electron/tray.ts'))).toBe(false)
    expect(existsSync(join(projectRoot, 'build/tray-icon.svg'))).toBe(false)
    expect(packageJson.build.files).not.toContain('build/tray-icon.svg')
  })

  it('documents shortcut-only recovery and exit', () => {
    const readme = readProjectFile('README.md')

    expect(readme).toContain('关闭悬浮窗只会隐藏窗口，应用会继续在后台运行。')
    expect(readme).toContain('中键长按 1 秒重新显示窗口，使用 `Alt+X` 退出应用。')
    expect(readme).not.toContain('隐藏到系统托盘')
  })
})
