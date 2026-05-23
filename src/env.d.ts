/// <reference types="vite/client" />

interface Window {
  logViewer: import('@shared/ipc').LogViewerApi & {
    onMenu(channel: string, listener: () => void): () => void
    onMenuPath(channel: string, listener: (path: string) => void): () => void
  }
}

export {}
