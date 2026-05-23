export type Encoding = 'utf8' | 'utf16le' | 'latin1'
export type Eol = 'lf' | 'crlf' | 'mixed'

export interface IndexAnchor {
  line: number
  byteOffset: number
}

export interface SparseIndexSnapshot {
  fileSize: number
  lineCount: number
  indexedThrough: number
  complete: boolean
  encoding: Encoding
  eol: Eol
  anchors: IndexAnchor[]
}

export interface LogLine {
  lineNumber: number
  text: string
}

export interface LineBatch {
  startLine: number
  lines: LogLine[]
}

export interface HighlightRule {
  id: string
  pattern: string
  isRegex: boolean
  caseSensitive: boolean
  color: string
  background?: string
}

export interface HighlightSegment {
  start: number
  end: number
  className: string
  style?: { color?: string; backgroundColor?: string }
}

export interface HighlightedLine {
  lineNumber: number
  text: string
  segments: HighlightSegment[]
}

export interface TailAppendedPayload {
  fromLine: number
  lineCount: number
  lines: LineBatch
}

export interface IndexProgressPayload {
  percent: number
  lineCount: number
  indexedThrough: number
  complete: boolean
}

export interface FileRotatedPayload {
  preservedScroll: boolean
}

export interface FileErrorPayload {
  message: string
}

export interface IndexStatus {
  lineCount: number
  indexedThrough: number
  complete: boolean
  fileSize: number
}

export interface FileOpenResult {
  sessionId: string
  path: string
  lineCount: number
  fileSize: number
}

export type EncodingOverride = Encoding | 'auto'

export interface AppSettings {
  fontFamily: string
  fontSize: number
  lineHeight: number
  highlightRules: HighlightRule[]
  recentFiles: string[]
  wordWrap: boolean
  tabWidth: number
  encoding: EncodingOverride
  /** Force chokidar polling (auto-enabled for UNC paths) */
  usePolling: boolean | 'auto'
  pollIntervalMs: number
}

export interface TabSearchSnapshot {
  isOpen: boolean
  query: string
  options: SearchOptions
  matches: SearchMatch[]
  currentIndex: number
  total: number
  stale: boolean
  error: string | null
}

export interface MinimapSample {
  lineNumber: number
  kind: 'normal' | 'warn' | 'error'
}

export interface SettingsExportPayload {
  version: 1
  settings: AppSettings
  exportedAt: string
}

export interface SearchOptions {
  caseSensitive: boolean
  isRegex: boolean
  wholeWord: boolean
}

export interface SearchMatch {
  /** 0-based line number */
  lineNumber: number
  /** 0-based column (character offset in line) */
  column: number
  /** Match length in characters */
  length: number
}

export interface SearchState {
  query: string
  options: SearchOptions
  matches: SearchMatch[]
  /** Index into matches array; -1 when no matches */
  currentIndex: number
  total: number
  /** True when file grew since last search */
  stale: boolean
  /** File size at time of search */
  fileSizeAtSearch: number
  /** Set when search fails (e.g. ripgrep unavailable) */
  error?: string | null
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  caseSensitive: false,
  isRegex: false,
  wholeWord: false
}

export const DEFAULT_SETTINGS: AppSettings = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: 13,
  lineHeight: 1.4,
  wordWrap: false,
  tabWidth: 4,
  encoding: 'auto',
  usePolling: 'auto',
  pollIntervalMs: 100,
  highlightRules: [
    {
      id: 'error',
      pattern: 'ERROR',
      isRegex: false,
      caseSensitive: false,
      color: '#f87171'
    },
    {
      id: 'warn',
      pattern: 'WARN',
      isRegex: false,
      caseSensitive: false,
      color: '#fbbf24'
    }
  ],
  recentFiles: []
}
