import { existsSync } from 'fs'
import { Worker } from 'worker_threads'
import { join } from 'path'
import type { Encoding } from '@shared/types'
import type { LineBoundary } from './sparse-index'
import {
  createInitialChunkState,
  processIndexChunk,
  unpackBoundaries,
  type IndexChunkState,
  type PackedBoundaries
} from './index-chunk-processor'

interface ChunkResult {
  state: IndexChunkState
  boundaries: LineBoundary[]
  indexedThrough: number
}

interface WorkerChunkResult {
  state: IndexChunkState
  boundaries: PackedBoundaries
  indexedThrough: number
}

let worker: Worker | null = null
let workerAvailable: boolean | undefined
let nextId = 0
const pending = new Map<number, { resolve: (r: WorkerChunkResult) => void; reject: (e: Error) => void }>()

function useInlineProcessing(): boolean {
  return process.env.VITEST === 'true' || typeof process.versions.electron === 'undefined'
}

function getWorkerPath(): string {
  // Main bundle lives in out/main/; worker is emitted alongside it.
  return join(__dirname, 'workers/index-builder.worker.js')
}

function canUseWorkerThread(): boolean {
  if (useInlineProcessing()) return false
  workerAvailable ??= existsSync(getWorkerPath())
  return workerAvailable
}

function getWorker(): Worker {
  if (worker) return worker

  worker = new Worker(getWorkerPath())

  worker.on('message', (msg: WorkerChunkResult & { type: string; id: number }) => {
    if (msg.type !== 'chunkResult') return
    const entry = pending.get(msg.id)
    if (!entry) return
    pending.delete(msg.id)
    entry.resolve({
      state: msg.state,
      boundaries: msg.boundaries,
      indexedThrough: msg.indexedThrough
    })
  })

  worker.on('error', (err) => {
    for (const entry of pending.values()) {
      entry.reject(err)
    }
    pending.clear()
    worker = null
  })

  return worker
}

export async function processIndexChunkInWorker(
  buffer: Buffer,
  startOffset: number,
  state: IndexChunkState,
  encodingOverride?: Encoding
): Promise<ChunkResult> {
  const lastAnchor = state.anchors[state.anchors.length - 1]
  const sent = { ...state, anchors: [lastAnchor] }
  const result = canUseWorkerThread()
    ? await processInWorker(buffer, startOffset, sent, encodingOverride)
    : processIndexChunk(buffer, startOffset, sent, encodingOverride)

  const [, ...newAnchors] = result.state.anchors
  return {
    ...result,
    state: { ...result.state, anchors: [...state.anchors, ...newAnchors] }
  }
}

async function processInWorker(
  buffer: Buffer,
  startOffset: number,
  state: IndexChunkState,
  encodingOverride?: Encoding
): Promise<ChunkResult> {
  const id = nextId++
  const w = getWorker()

  const result = await new Promise<WorkerChunkResult>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.postMessage({
      type: 'processChunk',
      id,
      buffer,
      startOffset,
      state,
      encodingOverride
    })
  })

  return { ...result, boundaries: unpackBoundaries(result.boundaries, state.lineCount) }
}

/** The worker is shared by all sessions, so it stays up while any of them awaits a chunk */
export function terminateIndexWorker(): void {
  if (!worker || pending.size > 0) return
  void worker.terminate()
  worker = null
}

export { createInitialChunkState, type IndexChunkState }
