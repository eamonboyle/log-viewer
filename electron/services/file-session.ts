import { randomUUID } from 'crypto'
import type { FileOpenResult, IndexStatus, LineBatch, SearchOptions, SearchState } from '@shared/types'
import { TailEngine } from './tail-engine'
import { SearchService } from './search-service'

export class FileSession {
  readonly id: string
  readonly tailEngine: TailEngine
  readonly searchService: SearchService
  private started = false
  private onSearchStale: ((sessionId: string, fileSize: number) => void) | null = null

  constructor(readonly filePath: string) {
    this.id = randomUUID()
    this.tailEngine = new TailEngine(filePath)
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
}

export class SessionManager {
  private sessions = new Map<string, FileSession>()

  async open(filePath: string): Promise<FileSession> {
    const existing = [...this.sessions.values()].find((s) => s.filePath === filePath)
    if (existing) return existing

    const session = new FileSession(filePath)
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
