import { resolve } from 'path'
import { build, defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { existsSync } from 'fs'

const workerEntry = resolve(__dirname, 'electron/workers/index-builder.worker.ts')
const workerOut = resolve(__dirname, 'out/main/workers/index-builder.worker.js')

function ensureIndexWorkerInDev(): Plugin {
  return {
    name: 'ensure-index-worker-dev',
    apply: 'serve',
    async configureServer() {
      if (existsSync(workerOut)) return
      await build({
        configFile: false,
        plugins: [externalizeDepsPlugin()],
        build: {
          outDir: resolve(__dirname, 'out/main/workers'),
          emptyOutDir: false,
          lib: {
            entry: workerEntry,
            formats: ['cjs'],
            fileName: () => 'index-builder.worker.js'
          },
          rollupOptions: {
            external: ['worker_threads', 'fs', 'path', 'crypto']
          }
        }
      })
    }
  }
}

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared')
      }
    },
    plugins: [externalizeDepsPlugin(), ensureIndexWorkerInDev()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main/index.ts'),
          'workers/index-builder.worker': workerEntry
        },
        output: {
          entryFileNames: (chunk) =>
            chunk.name === 'workers/index-builder.worker'
              ? 'workers/index-builder.worker.js'
              : '[name].js'
        }
      }
    }
  },
  preload: {
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared')
      }
    },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: 'src',
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/index.html')
      }
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'shared')
      }
    },
    plugins: [react(), tailwindcss()],
    worker: {
      format: 'es'
    }
  }
})
