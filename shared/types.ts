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

export interface AppSettings {
  fontFamily: string
  fontSize: number
  lineHeight: number
  highlightRules: HighlightRule[]
  recentFiles: string[]
}

export const DEFAULT_SETTINGS: AppSettings = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: 13,
  lineHeight: 1.4,
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
