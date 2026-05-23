import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { SparseLineIndex, splitLines, decodeLine } from './sparse-index'

describe('SparseLineIndex', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'log-viewer-test-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('indexes LF line endings', () => {
    const index = new SparseLineIndex()
    const content = Buffer.from('line1\nline2\nline3\n')
    index.appendBytes(content, 0)
    index.finalize(content.length)
    expect(index.getLineCount()).toBe(3)
    expect(index.getEol()).toBe('lf')
  })

  it('indexes CRLF line endings', () => {
    const index = new SparseLineIndex()
    const content = Buffer.from('line1\r\nline2\r\nline3\r\n')
    index.appendBytes(content, 0)
    index.finalize(content.length)
    expect(index.getLineCount()).toBe(3)
    expect(index.getEol()).toBe('crlf')
  })

  it('detects UTF-8 BOM', () => {
    const index = new SparseLineIndex()
    const content = Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from('hello\n')])
    index.detectEncoding(content)
    expect(index.getEncoding()).toBe('utf8')
    index.appendBytes(content, 0)
    index.finalize(content.length)
    const boundary = index.getLineBoundary(0)
    expect(boundary).toBeDefined()
    expect(decodeLine(Buffer.from('hello\n'), 'utf8')).toBe('hello')
  })

  it('appends incrementally', () => {
    const index = new SparseLineIndex()
    index.appendBytes(Buffer.from('first\n'), 0)
    index.appendBytes(Buffer.from('second\n'), 6)
    index.finalize(13)
    expect(index.getLineCount()).toBe(2)
    expect(index.getLineBoundary(1)?.byteOffset).toBe(6)
  })

  it('handles truncate reset', () => {
    const index = new SparseLineIndex()
    index.appendBytes(Buffer.from('a\nb\nc\n'), 0)
    expect(index.getLineCount()).toBe(3)
    index.reset(0)
    expect(index.getLineCount()).toBe(0)
    expect(index.getAnchors()).toEqual([{ line: 0, byteOffset: 0 }])
  })

  it('splitLines handles partial trailing bytes', () => {
    const buf = Buffer.from('complete\npartial')
    const { complete, partial } = splitLines(buf)
    expect(complete).toHaveLength(1)
    expect(partial.toString()).toBe('partial')
  })
})

describe('SparseLineIndex file integration', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'log-viewer-test-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('indexes a file with mixed append', async () => {
    const filePath = path.join(tmpDir, 'test.log')
    await fs.writeFile(filePath, 'initial\n')
    const index = new SparseLineIndex()
    let offset = 0

    let data = await fs.readFile(filePath)
    index.appendBytes(data, offset)
    offset = data.length

    await fs.appendFile(filePath, 'appended\n')
    data = await fs.readFile(filePath)
    const newPart = data.subarray(offset)
    index.appendBytes(newPart, offset)
    index.finalize(data.length)

    expect(index.getLineCount()).toBe(2)
  })
})
