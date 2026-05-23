import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron'
import { basename } from 'path'
import type ElectronStore from 'electron-store'
import { IPC_EVENT, IPC_INVOKE } from '@shared/ipc'
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type SearchOptions,
  type SettingsExportPayload
} from '@shared/types'
import { SessionManager } from '../services/file-session'
import { detectColumnLayout } from '../services/column-detector'
import { windowManager } from './window-manager'

let store: ElectronStore<{ settings: AppSettings }>

async function initStore(): Promise<void> {
  const Store = (await import('electron-store')).default
  store = new Store({ defaults: { settings: DEFAULT_SETTINGS } })
}

const sessionManager = new SessionManager()
let checkForUpdatesFn: (() => void) | null = null

export function setCheckForUpdates(fn: () => void): void {
  checkForUpdatesFn = fn
}

function getSettings(): AppSettings {
  return store.get('settings', DEFAULT_SETTINGS)
}

function saveSettings(partial: Partial<AppSettings>): AppSettings {
  const current = getSettings()
  const next = { ...current, ...partial }
  store.set('settings', next)
  return next
}

function addRecentFile(filePath: string): void {
  const settings = getSettings()
  const recent = [filePath, ...settings.recentFiles.filter((f) => f !== filePath)].slice(0, 10)
  saveSettings({ recentFiles: recent })
  refreshMenu()
}

function clearRecentFiles(): void {
  saveSettings({ recentFiles: [] })
  refreshMenu()
}

function formatRecentLabel(filePath: string): string {
  const name = basename(filePath)
  if (filePath.length <= 72) return filePath
  return `${name} — …${filePath.slice(-56)}`
}

function buildRecentSubmenu(): Electron.MenuItemConstructorOptions[] {
  const recent = getSettings().recentFiles
  if (recent.length === 0) {
    return [{ label: 'No Recent Files', enabled: false }]
  }
  return recent.map((filePath) => ({
    label: formatRecentLabel(filePath),
    submenu: [
      {
        label: 'Open in Tab',
        click: () => windowManager.sendToFocusedOrFirst('menu:open-path-new-tab', filePath)
      },
      {
        label: 'Open in New Window',
        click: () => {
          const win = windowManager.createWindow()
          windowManager.sendToWindow(win, 'menu:open-path', filePath)
        }
      }
    ]
  }))
}

function wireSessionEvents(sessionId: string): void {
  const session = sessionManager.get(sessionId)
  if (!session) return

  const { tailEngine } = session

  tailEngine.on('appended', (payload) => {
    windowManager.sendToSessionOwner(sessionId, IPC_EVENT.TAIL_APPENDED, payload)
  })

  tailEngine.on('progress', (payload) => {
    windowManager.sendToSessionOwner(sessionId, IPC_EVENT.INDEX_PROGRESS, payload)
  })

  tailEngine.on('rotated', (payload) => {
    windowManager.sendToSessionOwner(sessionId, IPC_EVENT.FILE_ROTATED, payload)
  })

  tailEngine.on('error', (payload) => {
    windowManager.sendToSessionOwner(sessionId, IPC_EVENT.FILE_ERROR, payload)
  })

  session.setSearchStaleHandler((sid, fileSize) => {
    windowManager.sendToSessionOwner(sid, IPC_EVENT.SEARCH_STALE, { fileSize })
  })
}

function registerSessionForEvent(event: Electron.IpcMainInvokeEvent, sessionId: string): void {
  const windowId = windowManager.getWindowIdFromWebContents(event.sender)
  if (windowId) {
    windowManager.registerSession(windowId, sessionId)
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_INVOKE.FILE_OPEN, async (event, filePath: string) => {
    const settings = getSettings()
    const session = await sessionManager.open(filePath, {
      encodingOverride: settings.encoding,
      usePolling: settings.usePolling,
      pollIntervalMs: settings.pollIntervalMs
    })
    registerSessionForEvent(event, session.id)
    wireSessionEvents(session.id)
    addRecentFile(filePath)
    return session.start()
  })

  ipcMain.handle(IPC_INVOKE.FILE_CLOSE, async (event, sessionId: string) => {
    const windowId = windowManager.getWindowIdFromWebContents(event.sender)
    windowManager.unregisterSession(sessionId, windowId)
    if (!windowManager.hasSessionOwners(sessionId)) {
      await sessionManager.close(sessionId)
    }
  })

  ipcMain.handle(IPC_INVOKE.TAIL_SET_FOLLOW, (_e, sessionId: string, enabled: boolean) => {
    sessionManager.get(sessionId)?.setFollow(enabled)
  })

  ipcMain.handle(IPC_INVOKE.VIEWPORT_READ_LINES, async (_e, sessionId: string, startLine: number, count: number) => {
    const session = sessionManager.get(sessionId)
    if (!session) throw new Error('Session not found')
    return session.readLines(startLine, count)
  })

  ipcMain.handle(IPC_INVOKE.INDEX_GET_STATUS, (_e, sessionId: string) => {
    const session = sessionManager.get(sessionId)
    if (!session) throw new Error('Session not found')
    return session.getIndexStatus()
  })

  ipcMain.handle(IPC_INVOKE.DIALOG_OPEN_FILE, async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      properties: ['openFile'],
      filters: [
        { name: 'Log Files', extensions: ['log', 'txt', 'out'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC_INVOKE.SETTINGS_GET, () => getSettings())

  ipcMain.handle(IPC_INVOKE.SETTINGS_SET, (_e, partial: Partial<AppSettings>) => saveSettings(partial))

  ipcMain.handle(IPC_INVOKE.SETTINGS_CLEAR_RECENT, () => {
    clearRecentFiles()
    return getSettings()
  })

  ipcMain.handle(
    IPC_INVOKE.SEARCH_QUERY,
    async (_e, sessionId: string, query: string, options: SearchOptions) => {
      const session = sessionManager.get(sessionId)
      if (!session) throw new Error('Session not found')
      return session.searchQuery(query, options)
    }
  )

  ipcMain.handle(IPC_INVOKE.SEARCH_NEXT, (_e, sessionId: string) => {
    const session = sessionManager.get(sessionId)
    if (!session) throw new Error('Session not found')
    return session.searchNext()
  })

  ipcMain.handle(IPC_INVOKE.SEARCH_PREV, (_e, sessionId: string) => {
    const session = sessionManager.get(sessionId)
    if (!session) throw new Error('Session not found')
    return session.searchPrev()
  })

  ipcMain.handle(IPC_INVOKE.SEARCH_CANCEL, (_e, sessionId: string) => {
    sessionManager.get(sessionId)?.searchCancel()
  })

  ipcMain.handle(IPC_INVOKE.SEARCH_GET_STATE, (_e, sessionId: string) => {
    return sessionManager.get(sessionId)?.getSearchState() ?? null
  })

  ipcMain.handle(IPC_INVOKE.SETTINGS_EXPORT, () => {
    const payload: SettingsExportPayload = {
      version: 1,
      settings: getSettings(),
      exportedAt: new Date().toISOString()
    }
    return payload
  })

  ipcMain.handle(IPC_INVOKE.SETTINGS_IMPORT, (_e, payload: SettingsExportPayload) => {
    if (!payload?.settings) throw new Error('Invalid settings payload')
    const merged = { ...DEFAULT_SETTINGS, ...payload.settings }
    store.set('settings', merged)
    refreshMenu()
    return merged
  })

  ipcMain.handle(IPC_INVOKE.MINIMAP_SAMPLES, async (_e, sessionId: string, maxSamples: number) => {
    const session = sessionManager.get(sessionId)
    if (!session) throw new Error('Session not found')
    return session.getMinimapSamples(maxSamples)
  })

  ipcMain.handle(IPC_INVOKE.COLUMN_DETECT, async (_e, sessionId: string) => {
    const session = sessionManager.get(sessionId)
    if (!session) throw new Error('Session not found')
    const lines = await session.readLines(0, 20)
    return detectColumnLayout(lines.lines)
  })
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: () => windowManager.sendToFocusedOrFirst('menu:open-file')
        },
        {
          label: 'Open in New Tab…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => windowManager.sendToFocusedOrFirst('menu:open-file-new-tab')
        },
        {
          label: 'Open in New Window',
          click: () => {
            windowManager.createWindow()
          }
        },
        {
          label: 'Open Recent',
          submenu: buildRecentSubmenu()
        },
        {
          label: 'Clear Recent Files',
          enabled: getSettings().recentFiles.length > 0,
          click: () => clearRecentFiles()
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => windowManager.sendToFocusedOrFirst('menu:close-tab')
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Find…',
          accelerator: 'CmdOrCtrl+F',
          click: () => windowManager.sendToFocusedOrFirst('menu:find')
        },
        {
          label: 'Go to Line…',
          accelerator: 'CmdOrCtrl+G',
          click: () => windowManager.sendToFocusedOrFirst('menu:goto-line')
        },
        { type: 'separator' },
        {
          label: 'Toggle Follow',
          accelerator: 'F5',
          click: () => windowManager.sendToFocusedOrFirst('menu:toggle-follow')
        },
        {
          label: 'Jump to End',
          accelerator: 'End',
          click: () => windowManager.sendToFocusedOrFirst('menu:jump-end')
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates…',
          click: () => checkForUpdatesFn?.()
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

export function refreshMenu(): void {
  buildMenu()
}

export function createWindow(): BrowserWindow {
  return windowManager.createWindow()
}

export async function bootstrap(): Promise<void> {
  await initStore()
  windowManager.setSessionOrphanHandler((sessionId) => {
    void sessionManager.close(sessionId)
  })
  registerIpcHandlers()
  buildMenu()
  createWindow()
}

export { sessionManager }
