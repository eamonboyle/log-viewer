import { describe, it, expect } from 'vitest'
import { createInitialChunkState, processIndexChunk } from './index-chunk-processor'

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
})
