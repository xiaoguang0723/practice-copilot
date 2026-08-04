function looksLikeMath(value: string): boolean {
  return /\\(?:begin|end|sum|frac|cdot|times|le|ge|in)|[_^]\s*(?:\{|[A-Za-z0-9])/u.test(value)
}

export function normalizeMathDelimiters(value: string): string {
  const normalized = value
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, formula: string) => `\n$$\n${formula}\n$$\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, formula: string) => ` $${formula}$ `)
    .replace(/(^|\n)\$(?!\$)\s*\n([\s\S]*?)\n\s*\$(?!\$)(?=\n|$)/gm, (_match, prefix: string, formula: string) => `${prefix}\n$$\n${formula}\n$$\n`)

  return normalized.replace(/^\[\s*([\s\S]*?)\s*\]$/gm, (match, formula: string) => {
    return looksLikeMath(formula) ? `\n$$\n${formula}\n$$\n` : match
  })
}
