import { describe, it, expect } from 'vitest'
import {
  createInitialChunkState,
  packBoundaries,
  processIndexChunk,
  unpackBoundaries
} from './index-chunk-processor'

describe('index-chunk-processor', () => {
  it('indexes lines from buffer', () => {
    const state = createInitialChunkState()
    const buffer = Buffer.from('line one\nline two\nline three\n')
    const result = processIndexChunk(buffer, 0, state)

    expect(result.boundaries).toHaveLength(3)
    expect(result.state.lineCount).toBe(3)
    expect(result.indexedThrough).toBe(buffer.length)
  })

  it('respects encoding override', () => {
    const state = createInitialChunkState('latin1')
    const buffer = Buffer.from('café\n')
    const result = processIndexChunk(buffer, 0, state, 'latin1')

    expect(result.state.encoding).toBe('latin1')
    expect(result.boundaries).toHaveLength(1)
  })

  it('round-trips boundaries past 4 GiB through the packed transfer format', () => {
    const boundaries = [
      { lineNumber: 7, byteOffset: 5_000_000_000, byteLength: 42 },
      { lineNumber: 8, byteOffset: 5_000_000_044, byteLength: 0 }
    ]
    expect(unpackBoundaries(packBoundaries(boundaries), 7)).toEqual(boundaries)
  })
})
