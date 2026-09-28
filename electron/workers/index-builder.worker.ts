import { parentPort } from 'worker_threads'
import type { Encoding } from '@shared/types'
import {
  packBoundaries,
  processIndexChunk,
  type IndexChunkState,
  type PackedBoundaries
} from '../services/index-chunk-processor'

interface ProcessChunkMessage {
  type: 'processChunk'
  id: number
  buffer: Buffer
  startOffset: number
  state: IndexChunkState
  encodingOverride?: Encoding
}

interface ProcessChunkResult {
  type: 'chunkResult'
  id: number
  state: IndexChunkState
  boundaries: PackedBoundaries
  indexedThrough: number
}

if (parentPort) {
  parentPort.on('message', (msg: ProcessChunkMessage) => {
    if (msg.type !== 'processChunk') return

    const result = processIndexChunk(msg.buffer, msg.startOffset, msg.state, msg.encodingOverride)

    const boundaries = packBoundaries(result.boundaries)
    const response: ProcessChunkResult = {
      type: 'chunkResult',
      id: msg.id,
      state: result.state,
      boundaries,
      indexedThrough: result.indexedThrough
    }

    parentPort!.postMessage(response, [boundaries.buffer])
  })
}
