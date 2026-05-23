import { contextBridge, ipcRenderer } from 'electron'
import { IPC_EVENT, IPC_INVOKE, type IpcEventChannel, type IpcInvokeMap } from '@shared/ipc'

const logViewer = {
  invoke<C extends keyof IpcInvokeMap>(
    channel: C,
    ...args: IpcInvokeMap[C]['args']
  ): Promise<IpcInvokeMap[C]['result']> {
    return ipcRenderer.invoke(channel, ...args) as Promise<IpcInvokeMap[C]['result']>
  },

  on<C extends IpcEventChannel>(
    channel: C,
    listener: (sessionId: string, payload: unknown) => void
  ): () => void {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string, payload: unknown) => {
      listener(sessionId, payload)
    }
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },

  onMenu(channel: string, listener: () => void): () => void {
    const handler = () => listener()
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },

  onMenuPath(channel: string, listener: (path: string) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, path: string) => listener(path)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

contextBridge.exposeInMainWorld('logViewer', logViewer)

export type { LogViewerApi } from '@shared/ipc'
