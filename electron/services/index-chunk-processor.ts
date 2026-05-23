import type { Encoding } from '@shared/types'
import type { LineBoundary } from './sparse-index'

const ANCHOR_INTERVAL_LINES = 256
const ANCHOR_INTERVAL_BYTES = 4096

export interface IndexChunkState {
  encoding: Encoding
  bomSkipped: boolean
  eol: 'lf' | 'crlf' | 'mixed'
  lineCount: number
  anchors: { line: number; byteOffset: number }[]
}

export interface IndexChunkResult {
  state: IndexChunkState
  boundaries: LineBoundary[]
  indexedThrough: number
}

export function createInitialChunkState(encodingOverride?: Encoding): IndexChunkState {
  return {
    encoding: encodingOverride ?? 'utf8',
    bomSkipped: encodingOverride !== undefined,
    eol: 'lf',
    lineCount: 0,
    anchors: [{ line: 0, byteOffset: 0 }]
  }
}

export function detectEncodingFromBuffer(buffer: Buffer): { encoding: Encoding; bomSkipped: boolean; skip: number } {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { encoding: 'utf8', bomSkipped: true, skip: 3 }
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { encoding: 'utf16le', bomSkipped: true, skip: 2 }
  }
  return { encoding: 'utf8', bomSkipped: false, skip: 0 }
}

/** Process a file chunk off the main thread */
export function processIndexChunk(
  buffer: Buffer,
  startOffset: number,
  state: IndexChunkState,
  encodingOverride?: Encoding
): IndexChunkResult {
  const boundaries: LineBoundary[] = []
  let offset = startOffset
  let i = 0

  if (!state.bomSkipped && startOffset === 0 && buffer.length > 0 && !encodingOverride) {
    const detected = detectEncodingFromBuffer(buffer)
    state.encoding = detected.encoding
    state.bomSkipped = detected.bomSkipped
    i = detected.skip
    offset += i
  } else if (encodingOverride && startOffset === 0 && !state.bomSkipped) {
    state.encoding = encodingOverride
    state.bomSkipped = true
  }

  let lineStart = offset
  let sawCr = false
  let sawLf = false
  let sawCrLf = false

  while (i < buffer.length) {
    const byte = buffer[i]

    if (byte === 0x0d) {
      sawCr = true
      if (i + 1 < buffer.length && buffer[i + 1] === 0x0a) {
        sawCrLf = true
        const lineEnd = offset + i
        const boundary = addLine(state, lineStart, lineEnd - lineStart, boundaries)
        if (boundary) boundaries.push(boundary)
        i += 2
        lineStart = offset + i
        continue
      }
      const lineEnd = offset + i
      const boundary = addLine(state, lineStart, lineEnd - lineStart, boundaries)
      if (boundary) boundaries.push(boundary)
      i += 1
      lineStart = offset + i
      continue
    }

    if (byte === 0x0a) {
      sawLf = true
      const lineEnd = offset + i
      const boundary = addLine(state, lineStart, lineEnd - lineStart, boundaries)
      if (boundary) boundaries.push(boundary)
      i += 1
      lineStart = offset + i
      continue
    }

    i += 1
  }

  if (sawCrLf) state.eol = state.eol === 'lf' ? 'crlf' : state.eol === 'crlf' ? 'crlf' : 'mixed'
  else if (sawCr && sawLf) state.eol = 'mixed'
  else if (sawCr) state.eol = state.eol === 'crlf' ? 'crlf' : 'mixed'
  else if (sawLf) state.eol = state.eol === 'lf' ? 'lf' : 'mixed'

  return {
    state,
    boundaries,
    indexedThrough: startOffset + buffer.length
  }
}

function addLine(
  state: IndexChunkState,
  byteOffset: number,
  byteLength: number,
  _boundaries: LineBoundary[]
): LineBoundary | undefined {
  const boundary: LineBoundary = {
    lineNumber: state.lineCount,
    byteOffset,
    byteLength
  }
  const lineNum = state.lineCount
  state.lineCount += 1

  const lastAnchor = state.anchors[state.anchors.length - 1]
  const linesSinceAnchor = lineNum - lastAnchor.line
  const bytesSinceAnchor = byteOffset - lastAnchor.byteOffset

  if (linesSinceAnchor >= ANCHOR_INTERVAL_LINES || bytesSinceAnchor >= ANCHOR_INTERVAL_BYTES) {
    state.anchors.push({ line: lineNum, byteOffset })
  }

  return boundary
}
