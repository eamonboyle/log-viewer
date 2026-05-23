import { describe, it, expect } from 'vitest'
import { detectColumnLayout } from './column-detector'

describe('column-detector', () => {
  it('detects tab-delimited layout', () => {
    const lines = [
      { lineNumber: 0, text: '2024-01-01\tINFO\tHello world' },
      { lineNumber: 1, text: '2024-01-02\tWARN\tSomething happened' },
      { lineNumber: 2, text: '2024-01-03\tERROR\tFailure occurred' }
    ]

    const layout = detectColumnLayout(lines)
    expect(layout).not.toBeNull()
    expect(layout?.delimiter).toBe('tab')
    expect(layout?.columnCount).toBe(3)
  })

  it('returns null for unstructured lines', () => {
    const lines = [
      { lineNumber: 0, text: 'plain log line without delimiters' },
      { lineNumber: 1, text: 'another unstructured entry' }
    ]

    expect(detectColumnLayout(lines)).toBeNull()
  })
})
