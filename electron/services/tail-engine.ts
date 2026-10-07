import { EventEmitter } from 'events'
import chokidar, { type FSWatcher } from 'chokidar'
import type { Encoding, EncodingOverride } from '@shared/types'
import type {
  FileErrorPayload,
  FileRotatedPayload,
  IndexProgressPayload,
  TailAppendedPayload
} from '@shared/types'
import { decodeLine, splitLines, SparseLineIndex } from './sparse-index'
import { RangeReader } from './range-reader'
import {
  createInitialChunkState,
  processIndexChunkInWorker,
  terminateIndexWorker,
  type IndexChunkState
} from './index-builder-client'

const BATCH_MS = 16
const AWAIT_WRITE_FINISH_MS = 50
export const INDEX_CHUNK = 256 * 1024

export interface TailEngineOptions {
  encodingOverride?: EncodingOverride
  usePolling?: boolean | 'auto'
  pollIntervalMs?: number
}

export interface TailEngineEvents {
  appended: (payload: TailAppendedPayload) => void
  progress: (payload: IndexProgressPayload) => void
  rotated: (payload: FileRotatedPayload) => void
  error: (payload: FileErrorPayload) => void
}

export function isUncPath(filePath: string): boolean {
  return filePath.startsWith('\\\\') || filePath.startsWith('//')
}

export function resolveUsePolling(filePath: string, setting: boolean | 'auto'): boolean {
  if (setting === true) return true
  if (setting === false) return false
  return isUncPath(filePath) || process.platform === 'win32'
}

/** Index just past the last line terminator; a final CR is held back because its LF may start the next chunk */
function lastLineEnd(buffer: Buffer): number {
  for (let i = buffer.length - 1; i >= 0; i--) {
    if (buffer[i] === 0x0a) return i + 1
    if (buffer[i] === 0x0d && i < buffer.length - 1) return i + 1
  }
  return 0
}

export class TailEngine extends EventEmitter {
  private watcher: FSWatcher | null = null
  /** Byte offset through which tail reads have been applied */
  private tailByteOffset = 0
  private partialBuffer = Buffer.alloc(0)
  private batchTimer: ReturnType<typeof setTimeout> | null = null
  private pendingLines: { fromLine: number; texts: string[] } | null = null
  private destroyed = false
  private followEnabled = true
  private indexing = false
  /** The one tail read allowed at a time; changes that arrive during it coalesce into one follow-up read */
  private tailRead: Promise<void> | null = null
  private tailReadAgain = false
  private workerState: IndexChunkState | null = null

  readonly index: SparseLineIndex
  readonly reader: RangeReader

  constructor(
    readonly filePath: string,
    private readonly options: TailEngineOptions = {}
  ) {
    super()
    this.index = new SparseLineIndex()
    this.reader = new RangeReader(filePath, this.index)

    const override = options.encodingOverride
    if (override && override !== 'auto') {
      this.index.setEncodingOverride(override)
    }
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

    await this.startWatch()
    await this.runBackgroundIndex()
  }

  async stop(): Promise<void> {
    this.destroyed = true
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }
    await this.watcher?.close()
    this.watcher = null
    terminateIndexWorker()
  }

  private encodingOverrideValue(): Encoding | undefined {
    const o = this.options.encodingOverride
    return o && o !== 'auto' ? o : undefined
  }

  private async runBackgroundIndex(): Promise<void> {
    if (this.indexing) return
    this.indexing = true

    const fileSize = await this.reader.getFileSize()
    this.index.setFileSize(fileSize)
    this.tailByteOffset = 0
    this.partialBuffer = Buffer.alloc(0)

    this.workerState = createInitialChunkState(this.encodingOverrideValue())

    try {
      while (this.tailByteOffset < fileSize && !this.destroyed) {
        const chunk = await this.reader.readRange(
          this.tailByteOffset,
          Math.min(this.tailByteOffset + INDEX_CHUNK, fileSize)
        )
        if (chunk.length === 0) break

        const combined = Buffer.concat([this.partialBuffer, chunk])
        const baseOffset = this.tailByteOffset - this.partialBuffer.length
        const end = lastLineEnd(combined)

        if (end > 0) {
          const result = await processIndexChunkInWorker(
            combined.subarray(0, end),
            baseOffset,
            this.workerState,
            this.encodingOverrideValue()
          )

          this.workerState = result.state
          this.index.applyBoundariesBatch(result.boundaries)
          this.index.syncFromWorkerState({
            ...result.state,
            indexedThrough: result.indexedThrough
          })
        }

        this.partialBuffer = Buffer.from(combined.subarray(end))
        this.tailByteOffset += chunk.length

        this.emitProgress(false)
        await new Promise((r) => setImmediate(r))
      }

      this.index.finalize(fileSize, this.partialBuffer.length > 0)
      this.emitProgress(true)
    } catch (err) {
      this.emit('error', { message: (err as Error).message })
      return
    } finally {
      this.indexing = false
    }

    await this.readNewBytes()
  }

  private processIncomingBytes(data: Buffer, emitLines: boolean): void {
    const combined = Buffer.concat([this.partialBuffer, data])
    const baseOffset = this.tailByteOffset - this.partialBuffer.length
    const { complete, partial } = splitLines(combined)

    this.partialBuffer = Buffer.from(partial)
    this.tailByteOffset = baseOffset + combined.length

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
    const usePolling = resolveUsePolling(this.filePath, this.options.usePolling ?? 'auto')
    const pollInterval = this.options.pollIntervalMs ?? 100

    this.watcher = chokidar.watch(this.filePath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: AWAIT_WRITE_FINISH_MS,
        pollInterval: 20
      },
      usePolling,
      interval: pollInterval
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

  private readNewBytes(): Promise<void> {
    if (this.tailRead) {
      this.tailReadAgain = true
      return this.tailRead
    }
    this.tailRead = this.drainTailReads()
    return this.tailRead
  }

  private async drainTailReads(): Promise<void> {
    try {
      do {
        this.tailReadAgain = false
        await this.readNewBytesOnce()
      } while (this.tailReadAgain)
    } finally {
      this.tailRead = null
    }
  }

  private async readNewBytesOnce(): Promise<void> {
    if (this.destroyed || this.indexing) return

    try {
      const fileSize = await this.reader.getFileSize()

      if (fileSize < this.tailByteOffset - this.partialBuffer.length) {
        await this.handleTruncate(fileSize)
        return
      }

      this.index.setFileSize(fileSize)

      if (fileSize <= this.tailByteOffset) return

      const newData = await this.reader.readRange(this.tailByteOffset, fileSize)
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
    this.tailByteOffset = 0
    this.partialBuffer = Buffer.alloc(0)
    this.index.reset(newSize)
    this.index.setFileSize(newSize)
    this.workerState = createInitialChunkState(this.encodingOverrideValue())
    void this.runBackgroundIndex()
    this.emit('rotated', { preservedScroll: false })
  }

  private async handleRotation(): Promise<void> {
    await this.watcher?.close()
    this.watcher = null

    let access = await RangeReader.checkAccess(this.filePath)
    for (let attempt = 0; !access.ok && attempt < 8; attempt++) {
      await new Promise((r) => setTimeout(r, 150))
      access = await RangeReader.checkAccess(this.filePath)
    }

    if (!access.ok) {
      this.emit('error', { message: access.message })
      return
    }

    this.tailByteOffset = 0
    this.partialBuffer = Buffer.alloc(0)
    this.index.reset()
    this.workerState = createInitialChunkState(this.encodingOverrideValue())
    await this.startWatch()
    void this.runBackgroundIndex()
    this.emit('rotated', { preservedScroll: false })
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

  getProgress(): IndexProgressPayload {
    const { lineCount, indexedThrough, fileSize, complete } = this.index.getStatus()
    const percent = fileSize > 0 ? Math.min(100, (indexedThrough / fileSize) * 100) : 100
    return { percent, lineCount, indexedThrough, complete }
  }

  private emitProgress(complete: boolean): void {
    const progress = this.getProgress()
    this.emit('progress', { ...progress, complete: complete && progress.complete })
  }

  emit<K extends keyof TailEngineEvents>(event: K, ...args: Parameters<TailEngineEvents[K]>): boolean {
    return super.emit(event, ...args)
  }

  on<K extends keyof TailEngineEvents>(event: K, listener: TailEngineEvents[K]): this {
    return super.on(event, listener)
  }
}
