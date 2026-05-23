import { randomUUID } from 'crypto'
import type {
  FileOpenResult,
  IndexStatus,
  LineBatch,
  MinimapSample,
  SearchOptions,
  SearchState
} from '@shared/types'
import { TailEngine, type TailEngineOptions } from './tail-engine'
import { SearchService } from './search-service'

export interface FileSessionOptions extends TailEngineOptions {}

export class FileSession {
  readonly id: string
  readonly tailEngine: TailEngine
  readonly searchService: SearchService
  private started = false
  private onSearchStale: ((sessionId: string, fileSize: number) => void) | null = null

  constructor(
    readonly filePath: string,
    options: FileSessionOptions = {}
  ) {
    this.id = randomUUID()
    this.tailEngine = new TailEngine(filePath, options)
    this.searchService = new SearchService()

    this.tailEngine.on('appended', () => {
      const fileSize = this.tailEngine.index.getStatus().fileSize
      if (this.searchService.updateFileSize(fileSize)) {
        this.onSearchStale?.(this.id, fileSize)
      }
    })
  }

  setSearchStaleHandler(handler: (sessionId: string, fileSize: number) => void): void {
    this.onSearchStale = handler
  }

  get displayName(): string {
    const parts = this.filePath.replace(/\\/g, '/').split('/')
    return parts[parts.length - 1] || this.filePath
  }

  async start(): Promise<FileOpenResult> {
    if (!this.started) {
      await this.tailEngine.start()
      this.started = true
    }

    const status = this.getIndexStatus()
    return {
      sessionId: this.id,
      path: this.filePath,
      lineCount: status.lineCount,
      fileSize: status.fileSize
    }
  }

  async close(): Promise<void> {
    this.searchService.cancel()
    await this.tailEngine.stop()
  }

  setFollow(enabled: boolean): void {
    this.tailEngine.setFollow(enabled)
  }

  isFollowEnabled(): boolean {
    return this.tailEngine.isFollowEnabled()
  }

  async readLines(startLine: number, count: number): Promise<LineBatch> {
    return this.tailEngine.reader.readLines(startLine, count)
  }

  getIndexStatus(): IndexStatus {
    return this.tailEngine.index.getStatus()
  }

  async searchQuery(query: string, options: SearchOptions): Promise<SearchState> {
    const { fileSize } = this.getIndexStatus()
    return this.searchService.query(this.filePath, query, options, fileSize)
  }

  searchNext(): SearchState | null {
    return this.searchService.next()
  }

  searchPrev(): SearchState | null {
    return this.searchService.prev()
  }

  searchCancel(): void {
    this.searchService.cancel()
  }

  getSearchState(): SearchState | null {
    return this.searchService.getState()
  }

  async getMinimapSamples(maxSamples: number): Promise<MinimapSample[]> {
    const lineCount = this.getIndexStatus().lineCount
    if (lineCount === 0) return []

    const step = Math.max(1, Math.floor(lineCount / maxSamples))
    const samples: MinimapSample[] = []

    for (let line = 0; line < lineCount; line += step) {
      const batch = await this.readLines(line, 1)
      const text = batch.lines[0]?.text ?? ''
      samples.push({
        lineNumber: line,
        kind: classifyMinimapLine(text)
      })
    }

    return samples
  }
}

function classifyMinimapLine(text: string): MinimapSample['kind'] {
  const upper = text.toUpperCase()
  if (upper.includes('ERROR')) return 'error'
  if (upper.includes('WARN')) return 'warn'
  return 'normal'
}

export class SessionManager {
  private sessions = new Map<string, FileSession>()

  async open(filePath: string, options: FileSessionOptions = {}): Promise<FileSession> {
    const existing = [...this.sessions.values()].find((s) => s.filePath === filePath)
    if (existing) return existing

    const session = new FileSession(filePath, options)
    await session.start()
    this.sessions.set(session.id, session)
    return session
  }

  get(sessionId: string): FileSession | undefined {
    return this.sessions.get(sessionId)
  }

  async close(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (session) {
      await session.close()
      this.sessions.delete(sessionId)
    }
  }

  async closeAll(): Promise<void> {
    for (const session of this.sessions.values()) {
      await session.close()
    }
    this.sessions.clear()
  }

  list(): FileSession[] {
    return [...this.sessions.values()]
  }
}
