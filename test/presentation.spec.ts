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

  it('documents non-activating display and answer scrolling shortcuts', () => {
    const readme = readProjectFile('README.md')

    expect(readme).toContain('`Alt+↑` / `Alt+↓`')
    expect(readme).toContain('显示时不会主动抢占当前前台窗口')
    expect(readme).toContain('`Alt+E` | 显示或隐藏悬浮窗')
  })
})
