import type {
  AppSettings,
  FileOpenResult,
  FileErrorPayload,
  FileRotatedPayload,
  IndexProgressPayload,
  IndexStatus,
  LineBatch,
  MinimapSample,
  SearchOptions,
  SearchState,
  SettingsExportPayload,
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
  SETTINGS_SET: 'settings:set',
  SEARCH_QUERY: 'search:query',
  SEARCH_NEXT: 'search:next',
  SEARCH_PREV: 'search:prev',
  SEARCH_CANCEL: 'search:cancel',
  SEARCH_GET_STATE: 'search:getState',
  SETTINGS_EXPORT: 'settings:export',
  SETTINGS_IMPORT: 'settings:import',
  MINIMAP_SAMPLES: 'minimap:samples',
  SETTINGS_CLEAR_RECENT: 'settings:clearRecent',
  COLUMN_DETECT: 'column:detect'
} as const

/** Main → Renderer push channels */
export const IPC_EVENT = {
  TAIL_APPENDED: 'tail:appended',
  INDEX_PROGRESS: 'index:progress',
  FILE_ROTATED: 'file:rotated',
  FILE_ERROR: 'file:error',
  SEARCH_STALE: 'search:stale'
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
  [IPC_INVOKE.SEARCH_QUERY]: {
    args: [sessionId: string, query: string, options: SearchOptions]
    result: SearchState
  }
  [IPC_INVOKE.SEARCH_NEXT]: {
    args: [sessionId: string]
    result: SearchState | null
  }
  [IPC_INVOKE.SEARCH_PREV]: {
    args: [sessionId: string]
    result: SearchState | null
  }
  [IPC_INVOKE.SEARCH_CANCEL]: {
    args: [sessionId: string]
    result: void
  }
  [IPC_INVOKE.SEARCH_GET_STATE]: {
    args: [sessionId: string]
    result: SearchState | null
  }
  [IPC_INVOKE.SETTINGS_EXPORT]: {
    args: []
    result: SettingsExportPayload
  }
  [IPC_INVOKE.SETTINGS_IMPORT]: {
    args: [payload: SettingsExportPayload]
    result: AppSettings
  }
  [IPC_INVOKE.MINIMAP_SAMPLES]: {
    args: [sessionId: string, maxSamples: number]
    result: MinimapSample[]
  }
  [IPC_INVOKE.SETTINGS_CLEAR_RECENT]: {
    args: []
    result: AppSettings
  }
  [IPC_INVOKE.COLUMN_DETECT]: {
    args: [sessionId: string]
    result: import('./types').ColumnLayout | null
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
  [IPC_EVENT.SEARCH_STALE]: {
    sessionId: string
    payload: { fileSize: number }
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
  getPathForFile(file: File): string
}

declare global {
  interface Window {
    logViewer: LogViewerApi
  }
}

export {}
