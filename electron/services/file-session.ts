import { randomUUID } from 'crypto'
import type { FileOpenResult, IndexStatus, LineBatch } from '@shared/types'
import { TailEngine } from './tail-engine'

export class FileSession {
  readonly id: string
  readonly tailEngine: TailEngine
  private started = false

  constructor(readonly filePath: string) {
    this.id = randomUUID()
    this.tailEngine = new TailEngine(filePath)
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
