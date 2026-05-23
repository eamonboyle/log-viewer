import fs from 'fs/promises'
import fsSync from 'fs'
import type { LineBatch, LogLine } from '@shared/types'
import { decodeLine, SparseLineIndex } from './sparse-index'

const READ_CHUNK = 64 * 1024

export class RangeReader {
  constructor(
    private readonly filePath: string,
    private readonly index: SparseLineIndex
  ) {}

  async readLines(startLine: number, count: number): Promise<LineBatch> {
    const lineCount = this.index.getLineCount()
    if (lineCount === 0 || count <= 0) {
      return { startLine, lines: [] }
    }

    const clampedStart = Math.max(0, Math.min(startLine, lineCount - 1))
    const clampedCount = Math.min(count, lineCount - clampedStart)
    const lines: LogLine[] = []

    const handle = await fs.open(this.filePath, 'r')

    try {
      for (let lineNum = clampedStart; lineNum < clampedStart + clampedCount; lineNum++) {
        const boundary = this.index.getLineBoundary(lineNum)
        if (!boundary) continue

        const buf = Buffer.alloc(boundary.byteLength)
        await handle.read(buf, 0, boundary.byteLength, boundary.byteOffset)
        lines.push({
          lineNumber: lineNum,
          text: decodeLine(buf, this.index.getEncoding())
        })
      }
    } finally {
      await handle.close()
    }

    return { startLine: clampedStart, lines }
  }

  /** Scan forward from anchor to find line boundaries in a range */
  async scanAndRead(startLine: number, count: number): Promise<LineBatch> {
    return this.readLines(startLine, count)
  }

  async readRange(fromOffset: number, toOffset: number): Promise<Buffer> {
    const length = toOffset - fromOffset
    if (length <= 0) return Buffer.alloc(0)

    const handle = await fs.open(this.filePath, 'r')
    try {
      const buf = Buffer.alloc(length)
      await handle.read(buf, 0, length, fromOffset)
      return buf
    } finally {
      await handle.close()
    }
  }

  async getFileSize(): Promise<number> {
    const stat = await fs.stat(this.filePath)
    return stat.size
  }

  /** Stream initial chunk for indexing */
  async readChunk(fromOffset: number, size = READ_CHUNK): Promise<Buffer> {
    const fileSize = await this.getFileSize()
    if (fromOffset >= fileSize) return Buffer.alloc(0)

    const toRead = Math.min(size, fileSize - fromOffset)
    return this.readRange(fromOffset, fromOffset + toRead)
  }

  /** Check if file is accessible */
  static async checkAccess(filePath: string): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      await fs.access(filePath, fsSync.constants.R_OK)
      return { ok: true }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        return { ok: false, message: 'File not found or has been deleted.' }
      }
      if (code === 'EACCES' || code === 'EPERM') {
        return { ok: false, message: 'Permission denied — cannot read this file.' }
      }
      if (code === 'EBUSY' || code === 'EACCES') {
        return { ok: false, message: 'File is locked by another process.' }
      }
      return { ok: false, message: `Cannot open file: ${(err as Error).message}` }
    }
  }
}
