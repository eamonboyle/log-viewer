import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { SearchService } from './search-service'
import { DEFAULT_SEARCH_OPTIONS } from '@shared/types'

describe('SearchService', () => {
  let tmpDir: string
  let filePath: string
  let service: SearchService

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'log-viewer-search-'))
    filePath = path.join(tmpDir, 'test.log')
    await fs.writeFile(
      filePath,
      'INFO starting\nWARN something bad\nERROR critical failure\nINFO done\n'
    )
    service = new SearchService()
  })

  afterEach(async () => {
    service.cancel()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('finds literal matches case-insensitively', async () => {
    const state = await service.query(filePath, 'error', DEFAULT_SEARCH_OPTIONS, 100)
    expect(state.total).toBe(1)
    expect(state.matches[0].lineNumber).toBe(2)
    expect(state.currentIndex).toBe(0)
  })

  it('finds multiple matches', async () => {
    const state = await service.query(filePath, 'INFO', { ...DEFAULT_SEARCH_OPTIONS, caseSensitive: true }, 100)
    expect(state.total).toBe(2)
    expect(state.matches.map((m) => m.lineNumber)).toEqual([0, 3])
  })

  it('respects case sensitivity', async () => {
    const state = await service.query(filePath, 'info', { ...DEFAULT_SEARCH_OPTIONS, caseSensitive: true }, 100)
    expect(state.total).toBe(0)
    expect(state.currentIndex).toBe(-1)
  })

  it('supports whole word matching', async () => {
    await fs.writeFile(filePath, 'warn warning warned\n')
    const state = await service.query(
      filePath,
      'warn',
      { ...DEFAULT_SEARCH_OPTIONS, wholeWord: true },
      100
    )
    expect(state.total).toBe(1)
    expect(state.matches[0].column).toBe(0)
  })

  it('supports regex patterns', async () => {
    const state = await service.query(
      filePath,
      'WARN|ERROR',
      { ...DEFAULT_SEARCH_OPTIONS, isRegex: true },
      100
    )
    expect(state.total).toBe(2)
  })

  it('returns empty state for empty query', async () => {
    const state = await service.query(filePath, '', DEFAULT_SEARCH_OPTIONS, 100)
    expect(state.total).toBe(0)
    expect(service.getState()).toBeNull()
  })

  it('navigates next and prev cyclically', async () => {
    await service.query(filePath, 'INFO', { ...DEFAULT_SEARCH_OPTIONS, caseSensitive: true }, 100)

    const first = service.next()!
    expect(first.currentIndex).toBe(1)

    const wrap = service.next()!
    expect(wrap.currentIndex).toBe(0)

    const back = service.prev()!
    expect(back.currentIndex).toBe(1)
  })

  it('cancels active search', async () => {
    await service.query(filePath, 'INFO', DEFAULT_SEARCH_OPTIONS, 100)
    service.cancel()
    expect(service.getState()).toBeNull()
  })

  it('marks search stale on file growth', async () => {
    await service.query(filePath, 'INFO', DEFAULT_SEARCH_OPTIONS, 100)
    const becameStale = service.updateFileSize(200)
    expect(becameStale).toBe(true)
    expect(service.getState()?.stale).toBe(true)
  })

  it('invalid regex returns no matches without throwing', async () => {
    const state = await service.query(
      filePath,
      '[invalid',
      { ...DEFAULT_SEARCH_OPTIONS, isRegex: true },
      100
    )
    expect(state.total).toBe(0)
  })
})
