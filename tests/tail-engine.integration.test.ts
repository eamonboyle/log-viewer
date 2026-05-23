import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { TailEngine, isUncPath, resolveUsePolling } from '../electron/services/tail-engine'

describe('tail-engine helpers', () => {
  it('detects UNC paths', () => {
    expect(isUncPath('\\\\server\\share\\file.log')).toBe(true)
    expect(isUncPath('C:\\local\\file.log')).toBe(false)
  })

  it('resolves polling for UNC in auto mode', () => {
    expect(resolveUsePolling('\\\\server\\share\\f.log', 'auto')).toBe(true)
    expect(resolveUsePolling('/local/f.log', false)).toBe(false)
  })
})

describe('TailEngine integration', () => {
  let tmpDir: string
  let filePath: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'log-viewer-tail-'))
    filePath = path.join(tmpDir, 'live.log')
    await fs.writeFile(filePath, '')
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('appends lines at high rate without manual refresh', async () => {
    const engine = new TailEngine(filePath)
    const appended: string[] = []

    engine.on('appended', (payload) => {
      for (const line of payload.lines.lines) {
        appended.push(line.text)
      }
    })

    await engine.start()

    const totalLines = 200
    for (let i = 0; i < totalLines; i++) {
      await fs.appendFile(filePath, `line-${i}\n`)
    }

    await new Promise((r) => setTimeout(r, 400))
    await engine.stop()

    expect(appended.length).toBeGreaterThanOrEqual(totalLines - 1)
    expect(appended[0]).toBe('line-0')
    expect(appended[appended.length - 1]).toMatch(/^line-/)
  })

  it('never emits stale refresh prompts — only tail:appended events', async () => {
    const engine = new TailEngine(filePath)
    const events: string[] = []

    engine.on('appended', () => events.push('appended'))
    engine.on('error', (e) => events.push(`error:${e.message}`))

    await engine.start()
    await fs.appendFile(filePath, 'new content\n')
    await new Promise((r) => setTimeout(r, 300))
    await engine.stop()

    expect(events.some((e) => e.includes('refresh'))).toBe(false)
    expect(events.some((e) => e.includes('modified'))).toBe(false)
    expect(events).toContain('appended')
  })

  it('handles truncate silently', async () => {
    await fs.writeFile(filePath, 'old line 1\nold line 2\n')
    const engine = new TailEngine(filePath)
    let rotated = false

    engine.on('rotated', () => {
      rotated = true
    })

    await engine.start()
    await new Promise((r) => setTimeout(r, 200))

    await fs.writeFile(filePath, 'new after truncate\n')
    await new Promise((r) => setTimeout(r, 800))
    await engine.stop()

    expect(engine.index.getLineCount()).toBeGreaterThanOrEqual(1)
    expect(rotated).toBe(true)
  })
})
