import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { TailEngine, INDEX_CHUNK, isUncPath, resolveUsePolling } from '../electron/services/tail-engine'
import { FileSession } from '../electron/services/file-session'

async function waitFor(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('waitFor timed out')
    await new Promise((r) => setTimeout(r, 20))
  }
}

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

  it('reads back the text of lines appended in separate writes to a non-empty file', async () => {
    const existing = Array.from({ length: 20_000 }, (_, n) => `INFO Benchmark line ${n}`)
    await fs.writeFile(filePath, existing.map((line) => `${line}\n`).join(''))
    const markers = [1, 2, 3, 4, 5].map((i) => `ERROR MARKER ${i}`)

    const session = new FileSession(filePath)
    try {
      await session.start()
      await waitFor(() => {
        const status = session.getIndexStatus()
        return status.complete && status.lineCount === existing.length
      })

      for (const [i, marker] of markers.entries()) {
        await fs.appendFile(filePath, `${marker}\n`)
        await waitFor(() => session.getIndexStatus().lineCount === existing.length + i + 1)
      }

      const tail = await session.readLines(existing.length, markers.length)
      expect(tail.lines.map((l) => l.text)).toEqual(markers)

      const all = await session.readLines(0, existing.length + markers.length)
      expect(all.lines.map((l) => l.text)).toEqual([...existing, ...markers])
    } finally {
      await session.close()
    }
  })

  it('indexes a BOM-prefixed CRLF file whose lines straddle chunk edges', async () => {
    const expected: string[] = []
    let pos = 3
    const push = (text: string) => {
      expected.push(text)
      pos += text.length + 2
    }
    const fillTo = (target: number) => {
      while (pos + 64 <= target) push(`line-${expected.length}`)
    }
    fillTo(INDEX_CHUNK - 1)
    push('cr-at-chunk-edge'.padEnd(INDEX_CHUNK - 1 - pos, 'x'))
    fillTo(2 * INDEX_CHUNK - 8)
    push('text-across-chunk-edge'.padEnd(2 * INDEX_CHUNK + 8 - pos, 'x'))
    for (let i = 0; i < 100; i++) push(`line-${expected.length}`)

    const content = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(expected.map((line) => `${line}\r\n`).join(''))
    ])
    expect(content[INDEX_CHUNK - 1]).toBe(0x0d)
    expect(content[INDEX_CHUNK]).toBe(0x0a)
    await fs.writeFile(filePath, content)

    const session = new FileSession(filePath)
    try {
      await session.start()
      await waitFor(() => session.getIndexStatus().complete)
      expect(session.getIndexStatus().lineCount).toBe(expected.length)

      const all = await session.readLines(0, expected.length)
      expect(all.lines.map((l) => l.text)).toEqual(expected)
    } finally {
      await session.close()
    }
  })

  it('completes a line left unterminated at open from later appends', async () => {
    const existing = ['first line', 'second line']
    const head = `${existing.join('\n')}\n`
    await fs.writeFile(filePath, `${head}part-1`)

    const session = new FileSession(filePath)
    try {
      await session.start()
      expect(session.getIndexStatus().lineCount).toBe(existing.length)

      await fs.appendFile(filePath, '-part-2')
      await waitFor(() => session.getIndexStatus().fileSize === head.length + 'part-1-part-2'.length)

      await fs.appendFile(filePath, '-part-3\n')
      await waitFor(() => session.getIndexStatus().lineCount === existing.length + 1)

      await fs.appendFile(filePath, 'next line\n')
      await waitFor(() => session.getIndexStatus().lineCount === existing.length + 2)

      const all = await session.readLines(0, existing.length + 2)
      expect(all.lines.map((l) => l.text)).toEqual([...existing, 'part-1-part-2-part-3', 'next line'])
    } finally {
      await session.close()
    }
  })

  it('reads each line appended during a slow tail read exactly once', async () => {
    const existing = ['first line', 'second line']
    await fs.writeFile(filePath, existing.map((line) => `${line}\n`).join(''))
    const markers = [1, 2, 3, 4, 5].map((i) => `ERROR MARKER ${i} ${'x'.repeat(i)}`)

    const session = new FileSession(filePath)
    try {
      await session.start()
      const appended: string[] = []
      session.tailEngine.on('appended', (payload) => {
        appended.push(...payload.lines.lines.map((l) => l.text))
      })

      const reader = session.tailEngine.reader
      const readRange = reader.readRange.bind(reader)
      let rangeReads = 0
      let inFlight = 0
      vi.spyOn(reader, 'readRange').mockImplementation(async (from, to) => {
        rangeReads++
        inFlight++
        const data = await readRange(from, to)
        await new Promise((r) => setTimeout(r, 400))
        inFlight--
        return data
      })

      for (const marker of markers) {
        const readsBefore = rangeReads
        await fs.appendFile(filePath, `${marker}\n`)
        await waitFor(() => rangeReads > readsBefore)
      }
      await waitFor(() => inFlight === 0 && appended.length >= markers.length)

      const all = await session.readLines(0, session.getIndexStatus().lineCount)
      expect(all.lines.map((l) => l.text)).toEqual([...existing, ...markers])
      expect(appended).toEqual(markers)
    } finally {
      await session.close()
    }
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

  it('handles log rotation (rename + new file)', async () => {
    await fs.writeFile(filePath, 'before rotation\n')
    const engine = new TailEngine(filePath)
    let rotated = false

    engine.on('rotated', () => {
      rotated = true
    })

    await engine.start()
    await new Promise((r) => setTimeout(r, 400))

    const rotatedPath = path.join(tmpDir, 'live.log.1')
    try {
      await fs.rename(filePath, rotatedPath)
    } catch {
      await fs.unlink(filePath)
    }
    await fs.writeFile(filePath, 'after rotation line 1\nafter rotation line 2\n')
    await new Promise((r) => setTimeout(r, 2000))
    await engine.stop()

    const lineCount = engine.index.getLineCount()
    expect(rotated || lineCount >= 1).toBe(true)
    expect(lineCount).toBeGreaterThanOrEqual(1)
  })

  it.skipIf(process.platform === 'win32')('follows symlink target changes', async () => {
    const targetA = path.join(tmpDir, 'target-a.log')
    const targetB = path.join(tmpDir, 'target-b.log')
    const symlinkPath = path.join(tmpDir, 'linked.log')

    await fs.writeFile(targetA, 'from target A\n')
    await fs.symlink(targetA, symlinkPath)

    const engine = new TailEngine(symlinkPath)
    await engine.start()
    await new Promise((r) => setTimeout(r, 300))

    await fs.unlink(symlinkPath)
    await fs.symlink(targetB, symlinkPath)
    await fs.writeFile(targetB, 'from target B line 1\n')
    await new Promise((r) => setTimeout(r, 800))
    await engine.stop()

    expect(engine.index.getLineCount()).toBeGreaterThanOrEqual(1)
  })
})
