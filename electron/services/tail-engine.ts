import { EventEmitter } from 'events'
import chokidar, { type FSWatcher } from 'chokidar'
import type {
  FileErrorPayload,
  FileRotatedPayload,
  IndexProgressPayload,
  TailAppendedPayload
} from '@shared/types'
import { decodeLine, splitLines, SparseLineIndex } from './sparse-index'
import { RangeReader } from './range-reader'

const BATCH_MS = 16
const AWAIT_WRITE_FINISH_MS = 50
const INDEX_CHUNK = 256 * 1024

export interface TailEngineEvents {
  appended: (payload: TailAppendedPayload) => void
  progress: (payload: IndexProgressPayload) => void
  rotated: (payload: FileRotatedPayload) => void
  error: (payload: FileErrorPayload) => void
}

export class TailEngine extends EventEmitter {
  private watcher: FSWatcher | null = null
  private readOffset = 0
  private partialBuffer = Buffer.alloc(0)
  private batchTimer: ReturnType<typeof setTimeout> | null = null
  private pendingLines: { fromLine: number; texts: string[] } | null = null
  private destroyed = false
  private followEnabled = true

  readonly index: SparseLineIndex
  readonly reader: RangeReader

  constructor(readonly filePath: string) {
    super()
    this.index = new SparseLineIndex()
    this.reader = new RangeReader(filePath, this.index)
  }

  isFollowEnabled(): boolean {
    return this.followEnabled
  }

  setFollow(enabled: boolean): void {
    this.followEnabled = enabled
  }

  async start(): Promise<void> {
    const access = await RangeReader.checkAccess(this.filePath)
    if (!access.ok) {
      this.emit('error', { message: access.message })
      return
    }

    await this.initialIndex()
    await this.startWatch()
    await this.readNewBytes()
  }

  async stop(): Promise<void> {
    this.destroyed = true
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }
    await this.watcher?.close()
    this.watcher = null
  }

  private async initialIndex(): Promise<void> {
    const fileSize = await this.reader.getFileSize()
    this.index.setFileSize(fileSize)
    this.readOffset = 0
    this.partialBuffer = Buffer.alloc(0)

    while (this.readOffset < fileSize && !this.destroyed) {
      const chunk = await this.reader.readRange(this.readOffset, Math.min(this.readOffset + INDEX_CHUNK, fileSize))
      if (chunk.length === 0) break

      if (this.readOffset === 0) {
        this.index.detectEncoding(chunk)
      }

      this.processIncomingBytes(chunk, false)
      this.emitProgress(false)
    }

    this.index.finalize(fileSize, this.partialBuffer.length > 0)
    this.emitProgress(true)
  }

  private processIncomingBytes(data: Buffer, emitLines: boolean): void {
    const combined = Buffer.concat([this.partialBuffer, data])
    const baseOffset = this.readOffset - this.partialBuffer.length
    const { complete, partial } = splitLines(combined)

    this.partialBuffer = Buffer.from(partial)
    this.readOffset = baseOffset + combined.length - partial.length

    const fromLine = this.index.getLineCount()
    const texts: string[] = []
    let lineOffset = baseOffset

    for (const lineBuf of complete) {
      this.index.appendBytes(lineBuf, lineOffset)
      texts.push(decodeLine(lineBuf, this.index.getEncoding()))
      lineOffset += lineBuf.length
    }

    if (emitLines && texts.length > 0) {
      this.queueAppend(fromLine, texts)
    }
  }

  private async startWatch(): Promise<void> {
    this.watcher = chokidar.watch(this.filePath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: AWAIT_WRITE_FINISH_MS,
        pollInterval: 20
      },
      usePolling: process.platform === 'win32'
    })

    this.watcher.on('change', () => {
      void this.readNewBytes()
    })

    this.watcher.on('unlink', () => {
      void this.handleRotation()
    })

    this.watcher.on('error', (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      this.emit('error', { message: `Watch error: ${message}` })
    })
  }

  private async readNewBytes(): Promise<void> {
    if (this.destroyed) return

    try {
      const fileSize = await this.reader.getFileSize()

      if (fileSize < this.readOffset - this.partialBuffer.length) {
        await this.handleTruncate(fileSize)
        return
      }

      this.index.setFileSize(fileSize)

      if (fileSize <= this.readOffset) return

      const newData = await this.reader.readRange(this.readOffset, fileSize)
      if (newData.length === 0) return

      this.processIncomingBytes(newData, true)
      this.index.finalize(fileSize, this.partialBuffer.length > 0)
      this.emitProgress(this.index.isComplete())
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        await this.handleRotation()
      } else {
        this.emit('error', { message: (err as Error).message })
      }
    }
  }

  private async handleTruncate(newSize: number): Promise<void> {
    this.readOffset = 0
    this.partialBuffer = Buffer.alloc(0)
    this.index.reset(newSize)
    this.index.setFileSize(newSize)
    await this.initialIndex()
    this.emit('rotated', { preservedScroll: false })
  }

  private async handleRotation(): Promise<void> {
    await this.watcher?.close()
    this.watcher = null
    await new Promise((r) => setTimeout(r, 150))

    const access = await RangeReader.checkAccess(this.filePath)
    if (!access.ok) {
      this.emit('error', { message: access.message })
      return
    }

    this.readOffset = 0
    this.partialBuffer = Buffer.alloc(0)
    this.index.reset()
    await this.startWatch()
    await this.initialIndex()
    this.emit('rotated', { preservedScroll: false })
    await this.readNewBytes()
  }

  private queueAppend(fromLine: number, texts: string[]): void {
    if (!this.pendingLines) {
      this.pendingLines = { fromLine, texts: [...texts] }
    } else {
      this.pendingLines.texts.push(...texts)
    }

    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.flushBatch(), BATCH_MS)
    }
  }

  private flushBatch(): void {
    this.batchTimer = null
    if (!this.pendingLines) return

    const { fromLine, texts } = this.pendingLines
    this.pendingLines = null

    const lines = texts.map((text, i) => ({
      lineNumber: fromLine + i,
      text
    }))

    this.emit('appended', {
      fromLine,
      lineCount: texts.length,
      lines: { startLine: fromLine, lines }
    })
  }

  private emitProgress(complete: boolean): void {
    const { lineCount, indexedThrough, fileSize } = this.index.getStatus()
    const percent = fileSize > 0 ? Math.min(100, (indexedThrough / fileSize) * 100) : 100

    this.emit('progress', {
      percent,
      lineCount,
      indexedThrough,
      complete: complete && this.index.isComplete()
    })
  }

  emit<K extends keyof TailEngineEvents>(event: K, ...args: Parameters<TailEngineEvents[K]>): boolean {
    return super.emit(event, ...args)
  }

  on<K extends keyof TailEngineEvents>(event: K, listener: TailEngineEvents[K]): this {
    return super.on(event, listener)
  }
}
