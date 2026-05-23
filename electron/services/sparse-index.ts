const ANCHOR_INTERVAL_LINES = 256
const ANCHOR_INTERVAL_BYTES = 4096

export type Encoding = 'utf8' | 'utf16le' | 'latin1'
export type Eol = 'lf' | 'crlf' | 'mixed'

export interface IndexAnchor {
  line: number
  byteOffset: number
}

export interface LineBoundary {
  lineNumber: number
  byteOffset: number
  byteLength: number
}

export class SparseLineIndex {
  private fileSize = 0
  private lineCount = 0
  private indexedThrough = 0
  private complete = false
  private encoding: Encoding = 'utf8'
  private eol: Eol = 'lf'
  private bomSkipped = false
  private anchors: IndexAnchor[] = [{ line: 0, byteOffset: 0 }]
  private boundaries: LineBoundary[] = []

  getEncoding(): Encoding {
    return this.encoding
  }

  getEol(): Eol {
    return this.eol
  }

  getFileSize(): number {
    return this.fileSize
  }

  getLineCount(): number {
    return this.lineCount
  }

  getIndexedThrough(): number {
    return this.indexedThrough
  }

  isComplete(): boolean {
    return this.complete
  }

  getAnchors(): readonly IndexAnchor[] {
    return this.anchors
  }

  getStatus() {
    return {
      lineCount: this.lineCount,
      indexedThrough: this.indexedThrough,
      complete: this.complete,
      fileSize: this.fileSize
    }
  }

  /** Reset index for truncate or rotation */
  reset(newFileSize = 0): void {
    this.fileSize = newFileSize
    this.lineCount = 0
    this.indexedThrough = 0
    this.complete = newFileSize === 0
    this.bomSkipped = false
    this.anchors = [{ line: 0, byteOffset: 0 }]
    this.boundaries = []
  }

  /** Detect encoding from initial bytes */
  detectEncoding(buffer: Buffer): Encoding {
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      this.encoding = 'utf8'
      this.bomSkipped = true
      return 'utf8'
    }
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
      this.encoding = 'utf16le'
      this.bomSkipped = true
      return 'utf16le'
    }
    this.encoding = 'utf8'
    return 'utf8'
  }

  /** Append new bytes to the index starting at byte offset */
  appendBytes(buffer: Buffer, startOffset: number): LineBoundary[] {
    const newLines: LineBoundary[] = []
    let offset = startOffset
    let i = 0

    if (!this.bomSkipped && startOffset === 0 && buffer.length > 0) {
      this.detectEncoding(buffer)
      if (this.bomSkipped) {
        if (this.encoding === 'utf8') i = 3
        else if (this.encoding === 'utf16le') i = 2
        offset += i
      }
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
          const boundary = this.addLine(lineStart, lineEnd - lineStart)
          if (boundary) newLines.push(boundary)
          i += 2
          lineStart = offset + i
          continue
        }
        const lineEnd = offset + i
        const boundary = this.addLine(lineStart, lineEnd - lineStart)
        if (boundary) newLines.push(boundary)
        i += 1
        lineStart = offset + i
        continue
      }

      if (byte === 0x0a) {
        sawLf = true
        const lineEnd = offset + i
        const boundary = this.addLine(lineStart, lineEnd - lineStart)
        if (boundary) newLines.push(boundary)
        i += 1
        lineStart = offset + i
        continue
      }

      i += 1
    }

    if (sawCrLf) this.eol = this.eol === 'lf' ? 'crlf' : this.eol === 'crlf' ? 'crlf' : 'mixed'
    else if (sawCr && sawLf) this.eol = 'mixed'
    else if (sawCr) this.eol = this.eol === 'crlf' ? 'crlf' : 'mixed'
    else if (sawLf) this.eol = this.eol === 'lf' ? 'lf' : 'mixed'

    this.indexedThrough = startOffset + buffer.length
    return newLines
  }

  /** Mark indexing complete for current file size */
  finalize(fileSize: number, hasPartialLine = false): void {
    this.fileSize = fileSize
    if (hasPartialLine) {
      this.complete = false
    } else {
      this.complete = this.indexedThrough >= fileSize
    }
  }

  setFileSize(size: number): void {
    this.fileSize = size
  }

  /** Apply boundaries produced by the index worker */
  applyBoundariesBatch(boundaries: LineBoundary[]): void {
    for (const boundary of boundaries) {
      this.boundaries.push(boundary)
    }
    if (boundaries.length > 0) {
      this.lineCount = this.boundaries.length
    }
  }

  syncFromWorkerState(state: {
    encoding: Encoding
    eol: Eol
    lineCount: number
    anchors: IndexAnchor[]
    indexedThrough: number
  }): void {
    this.encoding = state.encoding
    this.eol = state.eol
    this.lineCount = state.lineCount
    this.anchors = [...state.anchors]
    this.indexedThrough = state.indexedThrough
    this.bomSkipped = true
  }

  setEncodingOverride(encoding: Encoding): void {
    this.encoding = encoding
    this.bomSkipped = true
  }

  /** Find anchor at or before target line */
  findAnchorForLine(targetLine: number): IndexAnchor {
    let lo = 0
    let hi = this.anchors.length - 1
    let best = this.anchors[0]

    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const anchor = this.anchors[mid]
      if (anchor.line <= targetLine) {
        best = anchor
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }

    return best
  }

  getLineBoundary(lineNumber: number): LineBoundary | undefined {
    return this.boundaries[lineNumber]
  }

  private addLine(byteOffset: number, byteLength: number): LineBoundary | undefined {
    const boundary: LineBoundary = {
      lineNumber: this.lineCount,
      byteOffset,
      byteLength
    }
    this.boundaries.push(boundary)
    const lineNum = this.lineCount
    this.lineCount += 1

    const lastAnchor = this.anchors[this.anchors.length - 1]
    const linesSinceAnchor = lineNum - lastAnchor.line
    const bytesSinceAnchor = byteOffset - lastAnchor.byteOffset

    if (
      linesSinceAnchor >= ANCHOR_INTERVAL_LINES ||
      bytesSinceAnchor >= ANCHOR_INTERVAL_BYTES
    ) {
      this.anchors.push({ line: lineNum, byteOffset })
    }

    return boundary
  }
}

/** Parse buffer into complete lines, returning partial trailing bytes */
export function splitLines(buffer: Buffer): { complete: Buffer[]; partial: Buffer } {
  const complete: Buffer[] = []
  let start = 0

  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 0x0a) {
      complete.push(buffer.subarray(start, i + 1))
      start = i + 1
    } else if (buffer[i] === 0x0d) {
      if (i + 1 < buffer.length && buffer[i + 1] === 0x0a) {
        complete.push(buffer.subarray(start, i + 2))
        start = i + 2
        i += 1
      } else {
        complete.push(buffer.subarray(start, i + 1))
        start = i + 1
      }
    }
  }

  return {
    complete,
    partial: buffer.subarray(start)
  }
}

export function decodeLine(buffer: Buffer, encoding: Encoding): string {
  if (encoding === 'utf16le') {
    return buffer.toString('utf16le').replace(/\r?\n$/, '')
  }
  if (encoding === 'latin1') {
    return buffer.toString('latin1').replace(/\r?\n$/, '')
  }
  return buffer.toString('utf8').replace(/\r?\n$/, '')
}
