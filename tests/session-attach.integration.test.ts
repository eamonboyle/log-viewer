import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { SessionManager } from '../electron/services/file-session'

describe('attaching to an existing session', () => {
  let tmpDir: string
  let filePath: string
  let manager: SessionManager

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'log-viewer-attach-'))
    filePath = path.join(tmpDir, 'shared.log')
    await fs.writeFile(filePath, Array.from({ length: 20 }, (_, i) => `line ${i + 1}\n`).join(''))
    manager = new SessionManager()
  })

  afterEach(async () => {
    await manager.closeAll()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('reports the completed index to a caller that opens an already indexed file', async () => {
    const first = await manager.open(filePath)
    const deadline = Date.now() + 5000
    while (!first.getIndexStatus().complete && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20))
    }
    expect(first.getIndexStatus().complete).toBe(true)

    const attached = await manager.open(filePath)
    expect(attached).toBe(first)

    await expect(attached.start()).resolves.toMatchObject({
      indexPercent: 100,
      indexComplete: true
    })
  })
})
