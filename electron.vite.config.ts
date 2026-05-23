import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared')
      }
    },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main/index.ts'),
          'workers/index-builder.worker': resolve(__dirname, 'electron/workers/index-builder.worker.ts')
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
