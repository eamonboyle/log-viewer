import type {
  FileOpenResult,
  FileErrorPayload,
  FileRotatedPayload,
  IndexProgressPayload,
  IndexStatus,
  LineBatch,
  TailAppendedPayload
} from './types'

/** Renderer → Main invoke channels */
export const IPC_INVOKE = {
  FILE_OPEN: 'file:open',
  FILE_CLOSE: 'file:close',
  TAIL_SET_FOLLOW: 'tail:setFollow',
  VIEWPORT_READ_LINES: 'viewport:readLines',
  INDEX_GET_STATUS: 'index:getStatus',
  DIALOG_OPEN_FILE: 'dialog:openFile',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set'
} as const

/** Main → Renderer push channels */
export const IPC_EVENT = {
  TAIL_APPENDED: 'tail:appended',
  INDEX_PROGRESS: 'index:progress',
  FILE_ROTATED: 'file:rotated',
  FILE_ERROR: 'file:error'
} as const

export type IpcInvokeChannel = (typeof IPC_INVOKE)[keyof typeof IPC_INVOKE]
export type IpcEventChannel = (typeof IPC_EVENT)[keyof typeof IPC_EVENT]

export interface IpcInvokeMap {
  [IPC_INVOKE.FILE_OPEN]: {
    args: [path: string]
    result: FileOpenResult
  }
  [IPC_INVOKE.FILE_CLOSE]: {
    args: [sessionId: string]
    result: void
  }
  [IPC_INVOKE.TAIL_SET_FOLLOW]: {
    args: [sessionId: string, enabled: boolean]
    result: void
  }
  [IPC_INVOKE.VIEWPORT_READ_LINES]: {
    args: [sessionId: string, startLine: number, count: number]
    result: LineBatch
  }
  [IPC_INVOKE.INDEX_GET_STATUS]: {
    args: [sessionId: string]
    result: IndexStatus
  }
  [IPC_INVOKE.DIALOG_OPEN_FILE]: {
    args: []
    result: string | null
  }
  [IPC_INVOKE.SETTINGS_GET]: {
    args: []
    result: import('./types').AppSettings
  }
  [IPC_INVOKE.SETTINGS_SET]: {
    args: [partial: Partial<import('./types').AppSettings>]
    result: import('./types').AppSettings
  }
}

export interface IpcEventMap {
  [IPC_EVENT.TAIL_APPENDED]: {
    sessionId: string
    payload: TailAppendedPayload
  }
  [IPC_EVENT.INDEX_PROGRESS]: {
    sessionId: string
    payload: IndexProgressPayload
  }
  [IPC_EVENT.FILE_ROTATED]: {
    sessionId: string
    payload: FileRotatedPayload
  }
  [IPC_EVENT.FILE_ERROR]: {
    sessionId: string
    payload: FileErrorPayload
  }
}

export type IpcEventPayload<C extends IpcEventChannel> = IpcEventMap[C]['payload']

export interface LogViewerApi {
  invoke<C extends keyof IpcInvokeMap>(
    channel: C,
    ...args: IpcInvokeMap[C]['args']
  ): Promise<IpcInvokeMap[C]['result']>

  on<C extends IpcEventChannel>(
    channel: C,
    listener: (sessionId: string, payload: IpcEventMap[C]['payload']) => void
  ): () => void

  onMenu(channel: string, listener: () => void): () => void
  onMenuPath(channel: string, listener: (path: string) => void): () => void
}

declare global {
  interface Window {
    logViewer: LogViewerApi
  }
}

export {}
