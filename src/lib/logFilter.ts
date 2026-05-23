export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG'

export type QuickFilter = 'errors-only' | 'warnings-only' | 'hide-microsoft'

export interface LogFilterState {
  levels: LogLevel[]
  quickFilter: QuickFilter | null
}

export const ALL_LEVELS: LogLevel[] = ['INFO', 'WARN', 'ERROR', 'DEBUG']

export const DEFAULT_FILTER: LogFilterState = {
  levels: [...ALL_LEVELS],
  quickFilter: null
}

const LEVEL_REGEX = /\b(ERROR|FATAL|CRITICAL|WARN(?:ING)?|INFO|DEBUG|TRACE|VERBOSE)\b/i

const MICROSOFT_LOG_PATTERN = /Microsoft\./i

export function classifyLevel(line: string): LogLevel | null {
  const m = LEVEL_REGEX.exec(line)
  if (!m) return null
  const token = m[1].toUpperCase()
  if (token === 'ERROR' || token === 'FATAL' || token === 'CRITICAL') return 'ERROR'
  if (token === 'WARN' || token === 'WARNING') return 'WARN'
  if (token === 'INFO') return 'INFO'
  return 'DEBUG'
}

export function isFilterActive(filter: LogFilterState): boolean {
  if (filter.quickFilter !== null) return true
  return filter.levels.length < ALL_LEVELS.length
}

export function lineMatchesFilter(text: string, filter: LogFilterState): boolean {
  if (filter.quickFilter === 'hide-microsoft' && MICROSOFT_LOG_PATTERN.test(text)) {
    return false
  }

  if (filter.quickFilter === 'errors-only') {
    return classifyLevel(text) === 'ERROR'
  }

  if (filter.quickFilter === 'warnings-only') {
    return classifyLevel(text) === 'WARN'
  }

  const level = classifyLevel(text)
  if (level === null) return true
  return filter.levels.includes(level)
}

export function physicalToVirtualIndex(physicalLine: number, visibleLines: number[]): number {
  if (visibleLines.length === 0) return 0

  const exact = visibleLines.indexOf(physicalLine)
  if (exact >= 0) return exact

  if (physicalLine <= visibleLines[0]) return 0
  if (physicalLine >= visibleLines[visibleLines.length - 1]) {
    return visibleLines.length - 1
  }

  let lo = 0
  let hi = visibleLines.length - 1
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (visibleLines[mid] <= physicalLine) lo = mid
    else hi = mid - 1
  }
  return lo
}
