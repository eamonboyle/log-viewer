import { existsSync } from 'fs'
import { Worker } from 'worker_threads'
import { join } from 'path'
import type { Encoding } from '@shared/types'
import type { LineBoundary } from './sparse-index'
import {
  createInitialChunkState,
  processIndexChunk,
  type IndexChunkState
} from './index-chunk-processor'

interface ChunkResult {
  state: IndexChunkState
  boundaries: LineBoundary[]
  indexedThrough: number
}

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, { resolve: (r: ChunkResult) => void; reject: (e: Error) => void }>()

function useInlineProcessing(): boolean {
  return process.env.VITEST === 'true' || typeof process.versions.electron === 'undefined'
}

function getWorkerPath(): string {
  // Main bundle lives in out/main/; worker is emitted alongside it.
  return join(__dirname, 'workers/index-builder.worker.js')
}

function canUseWorkerThread(): boolean {
  if (useInlineProcessing()) return false
  return existsSync(getWorkerPath())
}

function getWorker(): Worker {
  if (worker) return worker

  worker = new Worker(getWorkerPath())

  worker.on('message', (msg: {
    type: string
    id: number
    state: IndexChunkState
    boundaries: LineBoundary[]
    indexedThrough: number
  }) => {
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
  if (!canUseWorkerThread()) {
    return processIndexChunk(buffer, startOffset, { ...state, anchors: [...state.anchors] }, encodingOverride)
  }

  const id = nextId++
  const w = getWorker()

  return new Promise((resolve, reject) => {
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
}

export function terminateIndexWorker(): void {
  if (worker) {
    void worker.terminate()
    worker = null
  }
  pending.clear()
}

export { createInitialChunkState, type IndexChunkState }
