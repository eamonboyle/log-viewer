import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { IPC_EVENT, type IpcEventChannel, type LogViewerApi } from '../shared/ipc'
import { TailEngine } from '../electron/services/tail-engine'
import { attachTailEvents } from '../src/hooks/useTailEvents'
import { createTabSession, useTabStore } from '../src/stores/tabStore'

const SESSION_ID = 'session-under-test'
// TailEngine flushes tail:appended on a 16 ms timer after the index already reports the new lines
const BATCH_SETTLE_MS = 60

type Listener = (sessionId: string, payload: unknown) => void

/** Mirrors the three tailEngine -> IPC forwards in electron/main/ipc-handlers.ts wireSessionEvents */
function bridgeEngine(engine: TailEngine): Pick<LogViewerApi, 'on'> {
  const listeners = new Map<IpcEventChannel, Set<Listener>>()
  const forward = (channel: IpcEventChannel) => (payload: unknown) => {
    for (const listener of listeners.get(channel) ?? []) listener(SESSION_ID, payload)
  }
  engine.on('appended', forward(IPC_EVENT.TAIL_APPENDED))
  engine.on('progress', forward(IPC_EVENT.INDEX_PROGRESS))
  engine.on('rotated', forward(IPC_EVENT.FILE_ROTATED))

  return {
    on: (channel, listener) => {
      const set = listeners.get(channel) ?? new Set<Listener>()
      set.add(listener as Listener)
      listeners.set(channel, set)
      return () => {
        set.delete(listener as Listener)
      }
    }
  }
}

const frames = new Map<number, (time: number) => void>()
let nextFrameId = 1

function runFrame(): void {
  const queued = [...frames.values()]
  frames.clear()
  for (const callback of queued) callback(performance.now())
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    expect(Date.now() < deadline, `timed out waiting for ${label}`).toBe(true)
    await delay(20)
  }
}

function numbered(prefix: string, from: number, to: number): string {
  const lines: string[] = []
  for (let n = from; n <= to; n++) lines.push(`${prefix} ${n}`)
  return lines.join('\n') + '\n'
}

function tab() {
  return useTabStore.getState().tabs[0]
}

describe('tail truncate through the renderer batch queue', () => {
  let tmpDir: string
  let filePath: string
  let engine: TailEngine
  let detach: () => void

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'log-viewer-truncate-'))
    filePath = path.join(tmpDir, 'live.log')
    await fs.writeFile(filePath, '')

    frames.clear()
    vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => {
      const id = nextFrameId++
      frames.set(id, callback)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      frames.delete(id)
    })

    useTabStore.setState({
      tabs: [createTabSession({ sessionId: SESSION_ID, path: filePath, lineCount: 0, fileSize: 0 })],
      activeTabId: null
    })

    engine = new TailEngine(filePath)
    detach = attachTailEvents(bridgeEngine(engine))
    await engine.start()
  })

  afterEach(async () => {
    detach()
    await engine.stop()
    vi.unstubAllGlobals()
    useTabStore.setState({ tabs: [], activeTabId: null })
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('resets line count and cache after truncation even with pre-truncation appends still queued', async () => {
    await fs.appendFile(filePath, numbered('fixture line', 1, 120))
    await waitFor(() => engine.index.getLineCount() === 120, 'engine to index 120 lines')
    await delay(BATCH_SETTLE_MS)
    runFrame()
    expect(tab().lineCount).toBe(120)

    await fs.appendFile(filePath, numbered('fixture line', 121, 140))
    await waitFor(() => engine.index.getLineCount() === 140, 'engine to index 140 lines')
    await delay(BATCH_SETTLE_MS)

    await fs.writeFile(filePath, numbered('rewritten line', 1, 10))
    await waitFor(
      () => engine.index.getLineCount() === 10 && engine.index.isComplete(),
      'engine to re-index the truncated file'
    )
    await delay(BATCH_SETTLE_MS)
    runFrame()

    expect(tab().lineCount).toBe(10)
    expect([...tab().lineCache.keys()].filter((line) => line >= 10)).toEqual([])
    expect([...tab().lineCache.values()].filter((text) => text.startsWith('fixture'))).toEqual([])

    await fs.appendFile(filePath, numbered('grown line', 1, 5))
    await waitFor(() => engine.index.getLineCount() === 15, 'engine to index the 5 appended lines')
    await delay(BATCH_SETTLE_MS)
    runFrame()

    expect(tab().lineCount).toBe(15)
    expect(tab().lineCache.get(10)).toBe('grown line 1')
  })
})
