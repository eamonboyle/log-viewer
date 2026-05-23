import type { HighlightRule, HighlightSegment } from '@shared/types'

interface Request {
  id: number
  lines: { lineNumber: number; text: string }[]
  rules: HighlightRule[]
}

function applyRules(text: string, rules: HighlightRule[]): HighlightSegment[] {
  if (rules.length === 0) return []

  type Match = { start: number; end: number; rule: HighlightRule }
  const matches: Match[] = []

  for (const rule of rules) {
    if (!rule.pattern) continue

    if (rule.isRegex) {
      try {
        const flags = rule.caseSensitive ? 'g' : 'gi'
        const re = new RegExp(rule.pattern, flags)
        let m: RegExpExecArray | null
        while ((m = re.exec(text)) !== null) {
          matches.push({ start: m.index, end: m.index + m[0].length, rule })
          if (m[0].length === 0) re.lastIndex++
        }
      } catch {
        // invalid regex — skip
      }
    } else {
      const search = rule.pattern
      const hay = rule.caseSensitive ? text : text.toLowerCase()
      const needle = rule.caseSensitive ? search : search.toLowerCase()
      let idx = 0
      while ((idx = hay.indexOf(needle, idx)) !== -1) {
        matches.push({ start: idx, end: idx + search.length, rule })
        idx += search.length || 1
      }
    }
  }

  if (matches.length === 0) return []

  matches.sort((a, b) => a.start - b.start || b.end - a.end)

  const merged: Match[] = []
  for (const m of matches) {
    const last = merged[merged.length - 1]
    if (last && m.start < last.end) continue
    merged.push(m)
  }

  return merged.map((m) => ({
    start: m.start,
    end: m.end,
    className: '',
    style: {
      color: m.rule.color,
      backgroundColor: m.rule.background
    }
  }))
}

self.onmessage = (e: MessageEvent<Request>) => {
  const { id, lines, rules } = e.data
  const results = lines.map((line) => ({
    lineNumber: line.lineNumber,
    text: line.text,
    segments: applyRules(line.text, rules)
  }))
  self.postMessage({ id, results })
}

export {}
