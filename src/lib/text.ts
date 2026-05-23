/** Expand tab characters to spaces for display */
export function expandTabs(text: string, tabWidth: number): string {
  if (!text.includes('\t')) return text

  let result = ''
  let col = 0

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\t') {
      const spaces = tabWidth - (col % tabWidth)
      result += ' '.repeat(spaces)
      col += spaces
    } else {
      result += ch
      col += 1
    }
  }

  return result
}

/** Estimate wrapped row count for a line (monospace) */
export function estimateWrappedRows(text: string, charsPerRow: number): number {
  if (charsPerRow <= 0) return 1
  const lines = text.split('\n')
  let rows = 0
  for (const line of lines) {
    rows += Math.max(1, Math.ceil(line.length / charsPerRow))
  }
  return rows
}

/** Filter tab-delimited columns by hiding selected indices */
export function filterHiddenColumns(
  text: string,
  delimiter: 'tab' | 'comma' | 'pipe',
  hiddenColumns: number[]
): string {
  if (hiddenColumns.length === 0) return text
  const char = delimiter === 'tab' ? '\t' : delimiter === 'comma' ? ',' : '|'
  const parts = text.split(char)
  const hidden = new Set(hiddenColumns)
  return parts.filter((_, i) => !hidden.has(i)).join(char)
}

export function classifyLineKind(text: string): 'normal' | 'warn' | 'error' {
  const upper = text.toUpperCase()
  if (upper.includes('ERROR')) return 'error'
  if (upper.includes('WARN')) return 'warn'
  return 'normal'
}
