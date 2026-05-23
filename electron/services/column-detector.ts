import type { LogLine } from '@shared/types'

export type Delimiter = 'tab' | 'comma' | 'pipe'

export interface ColumnLayout {
  delimiter: Delimiter
  columnCount: number
}

const SAMPLE_LINES = 20
const MIN_COLUMNS = 2

function countDelimiter(line: string, delimiter: string): number {
  if (delimiter === '\t') {
    return (line.match(/\t/g) ?? []).length
  }
  return (line.match(new RegExp(`\\${delimiter}`, 'g')) ?? []).length
}

function detectDelimiter(lines: string[]): Delimiter | null {
  const candidates: { delimiter: Delimiter; char: string }[] = [
    { delimiter: 'tab', char: '\t' },
    { delimiter: 'comma', char: ',' },
    { delimiter: 'pipe', char: '|' }
  ]

  let best: { delimiter: Delimiter; score: number; columns: number } | null = null

  for (const { delimiter, char } of candidates) {
    const counts = lines.map((line) => countDelimiter(line, char)).filter((c) => c >= MIN_COLUMNS - 1)
    if (counts.length < Math.min(3, lines.length)) continue

    const avg = counts.reduce((a, b) => a + b, 0) / counts.length
    const variance =
      counts.reduce((sum, c) => sum + (c - avg) ** 2, 0) / counts.length

    if (variance > 2) continue

    const columns = Math.round(avg) + 1
    const score = counts.length * 10 - variance

    if (!best || score > best.score) {
      best = { delimiter, score, columns }
    }
  }

  return best?.delimiter ?? null
}

export function detectColumnLayout(lines: LogLine[]): ColumnLayout | null {
  const sample = lines
    .slice(0, SAMPLE_LINES)
    .map((l) => l.text.trim())
    .filter((t) => t.length > 0)

  if (sample.length === 0) return null

  const delimiter = detectDelimiter(sample)
  if (!delimiter) return null

  const char = delimiter === 'tab' ? '\t' : delimiter === 'comma' ? ',' : '|'
  const columnCounts = sample.map((line) => line.split(char).length)
  const columnCount = Math.max(...columnCounts)

  if (columnCount < MIN_COLUMNS) return null

  return { delimiter, columnCount }
}

export function splitLineColumns(text: string, delimiter: Delimiter): string[] {
  const char = delimiter === 'tab' ? '\t' : delimiter === 'comma' ? ',' : '|'
  return text.split(char)
}
