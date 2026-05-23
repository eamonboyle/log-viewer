import { describe, expect, it } from 'vitest'
import {
  classifyLevel,
  isFilterActive,
  lineMatchesFilter,
  physicalToVirtualIndex,
  DEFAULT_FILTER
} from '../src/lib/logFilter'

describe('logFilter', () => {
  it('classifies common log levels', () => {
    expect(classifyLevel('2024-01-01 INFO started')).toBe('INFO')
    expect(classifyLevel('2024-01-01 WARN low memory')).toBe('WARN')
    expect(classifyLevel('2024-01-01 ERROR boom')).toBe('ERROR')
    expect(classifyLevel('2024-01-01 DEBUG trace')).toBe('DEBUG')
    expect(classifyLevel('plain text')).toBeNull()
  })

  it('treats default filter as inactive', () => {
    expect(isFilterActive(DEFAULT_FILTER)).toBe(false)
  })

  it('filters by selected levels', () => {
    const filter = { levels: ['ERROR', 'WARN'] as const, quickFilter: null }
    expect(isFilterActive(filter)).toBe(true)
    expect(lineMatchesFilter('ERROR something failed', filter)).toBe(true)
    expect(lineMatchesFilter('INFO started', filter)).toBe(false)
    expect(lineMatchesFilter('no level here', filter)).toBe(true)
  })

  it('applies quick filters', () => {
    expect(
      lineMatchesFilter('2024 ERROR failed', { levels: [...DEFAULT_FILTER.levels], quickFilter: 'errors-only' })
    ).toBe(true)
    expect(
      lineMatchesFilter('2024 WARN slow', { levels: [...DEFAULT_FILTER.levels], quickFilter: 'errors-only' })
    ).toBe(false)
    expect(
      lineMatchesFilter('at Microsoft.AspNetCore.Hosting', {
        levels: [...DEFAULT_FILTER.levels],
        quickFilter: 'hide-microsoft'
      })
    ).toBe(false)
  })

  it('maps physical lines to nearest visible virtual index', () => {
    const visible = [10, 20, 30]
    expect(physicalToVirtualIndex(20, visible)).toBe(1)
    expect(physicalToVirtualIndex(25, visible)).toBe(1)
    expect(physicalToVirtualIndex(5, visible)).toBe(0)
    expect(physicalToVirtualIndex(999, visible)).toBe(2)
  })
})
