import { describe, it, expect } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { FileSession } from '../electron/services/file-session'

const INDEX_TIMEOUT_MS = 60_000
const MAX_HEAP_MB = 512

describe('large-file perf smoke', () => {
  it(
    'indexes 1M lines within threshold with bounded memory',
    async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'log-viewer-perf-'))
      const filePath = path.join(tmpDir, 'large.log')

      const line = `${new Date().toISOString()} INFO Benchmark perf line with some padding\n`
      const batchSize = 10_000
      const totalLines = 1_000_000

      let handle: fs.FileHandle | null = null
      try {
        handle = await fs.open(filePath, 'w')
        for (let i = 0; i < totalLines / batchSize; i++) {
          const chunk = line.repeat(batchSize)
          await handle.write(chunk)
        }
        await handle.close()
        handle = null

        const heapBefore = process.memoryUsage().heapUsed
        const start = Date.now()

        const session = new FileSession(filePath)
        await session.start()

        while (Date.now() - start < INDEX_TIMEOUT_MS) {
          const status = session.getIndexStatus()
          if (status.complete && status.lineCount >= totalLines - 1) break
          await new Promise((r) => setTimeout(r, 200))
        }

        const elapsed = Date.now() - start
        const status = session.getIndexStatus()
        const heapAfter = process.memoryUsage().heapUsed
        const heapDeltaMb = (heapAfter - heapBefore) / (1024 * 1024)

        await session.close()

        expect(status.lineCount).toBeGreaterThanOrEqual(totalLines - 1)
        expect(status.complete).toBe(true)
        expect(elapsed).toBeLessThan(INDEX_TIMEOUT_MS)
        expect(heapDeltaMb).toBeLessThan(MAX_HEAP_MB)
      } finally {
        if (handle) await handle.close()
        await fs.rm(tmpDir, { recursive: true, force: true })
      }
    },
    INDEX_TIMEOUT_MS + 10_000
  )
})
