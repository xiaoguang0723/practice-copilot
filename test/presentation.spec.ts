import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const readProjectFile = (path: string) => readFileSync(join(projectRoot, path), 'utf8')

function cssRule(styles: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return styles.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
}

describe('answer presentation', () => {
  it('wraps long code lines within the answer width', () => {
    const styles = readProjectFile('src/styles.css')
    const preRule = cssRule(styles, '.markdown-answer pre')
    const codeRule = cssRule(styles, '.markdown-answer pre code')

    expect(preRule).toContain('max-width: 100%')
    expect(preRule).toContain('overflow-x: hidden')
    expect(codeRule).toContain('white-space: pre-wrap')
    expect(codeRule).toContain('overflow-wrap: anywhere')
  })

  it('keeps the remote mobile status row readable on narrow screens', () => {
    const styles = readProjectFile('electron/remote-server.ts')
    const panelStateRule = cssRule(styles, '.panel-state')
    const panelStateItemRule = cssRule(styles, '.panel-state span')
    const headerRule = cssRule(styles, 'header')

    expect(headerRule).toContain('display: grid')
    expect(headerRule).toContain('grid-template-columns: minmax(0, auto) minmax(0, 1fr) auto')
    expect(panelStateRule).toContain('grid-column: 1 / -1')
    expect(panelStateRule).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))')
    expect(panelStateRule).toContain('white-space: normal')
    expect(panelStateItemRule).toContain('overflow-wrap: anywhere')
    expect(panelStateItemRule).toContain('text-overflow: clip')
  })

  it('wraps remote code blocks instead of requiring horizontal scrolling', () => {
    const styles = readProjectFile('electron/remote-server.ts')
    const preRule = cssRule(styles, '.markdown-content pre')
    const codeRule = cssRule(styles, '.markdown-content pre code')

    expect(preRule).toContain('max-width: 100%')
    expect(preRule).toContain('overflow-x: hidden')
    expect(preRule).toContain('white-space: pre-wrap')
    expect(preRule).toContain('overflow-wrap: anywhere')
    expect(codeRule).toContain('white-space: pre-wrap')
    expect(codeRule).toContain('overflow-wrap: anywhere')
  })

  it('documents non-activating display and answer scrolling shortcuts', () => {
    const readme = readProjectFile('README.md')

    expect(readme).toContain('按住左键滚动滚轮')
    expect(readme).toContain('`Alt+D` | 启用或关闭鼠标穿透')
    expect(readme).toContain('显示时不会主动抢占当前前台窗口')
    expect(readme).toContain('中键长按 1 秒')
  })
})
