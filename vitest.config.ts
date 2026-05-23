import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'shared')
    }
  },
  test: {
    include: ['electron/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000
  }
})
