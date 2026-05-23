import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron'
import { join } from 'path'
import type ElectronStore from 'electron-store'
import { IPC_EVENT, IPC_INVOKE } from '@shared/ipc'
import { DEFAULT_SETTINGS, type AppSettings, type SearchOptions } from '@shared/types'
import { SessionManager } from '../services/file-session'

const isDev = !app.isPackaged

let store: ElectronStore<{ settings: AppSettings }>

async function initStore(): Promise<void> {
  const Store = (await import('electron-store')).default
  store = new Store({ defaults: { settings: DEFAULT_SETTINGS } })
}

let mainWindow: BrowserWindow | null = null
const sessionManager = new SessionManager()

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
}

function wireSessionEvents(sessionId: string): void {
  const session = sessionManager.get(sessionId)
  if (!session) return

  const { tailEngine } = session

  tailEngine.on('appended', (payload) => {
    mainWindow?.webContents.send(IPC_EVENT.TAIL_APPENDED, sessionId, payload)
  })

  tailEngine.on('progress', (payload) => {
    mainWindow?.webContents.send(IPC_EVENT.INDEX_PROGRESS, sessionId, payload)
  })

  tailEngine.on('rotated', (payload) => {
    mainWindow?.webContents.send(IPC_EVENT.FILE_ROTATED, sessionId, payload)
  })

  tailEngine.on('error', (payload) => {
    mainWindow?.webContents.send(IPC_EVENT.FILE_ERROR, sessionId, payload)
  })

  session.setSearchStaleHandler((sid, fileSize) => {
    mainWindow?.webContents.send(IPC_EVENT.SEARCH_STALE, sid, { fileSize })
  })
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_INVOKE.FILE_OPEN, async (_e, filePath: string) => {
    const session = await sessionManager.open(filePath)
    wireSessionEvents(session.id)
    addRecentFile(filePath)
    return session.start()
  })

  ipcMain.handle(IPC_INVOKE.FILE_CLOSE, async (_e, sessionId: string) => {
    await sessionManager.close(sessionId)
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

  ipcMain.handle(IPC_INVOKE.DIALOG_OPEN_FILE, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [
        { name: 'Log Files', extensions: ['log', 'txt', 'out'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC_INVOKE.SETTINGS_GET, () => getSettings())

  ipcMain.handle(IPC_INVOKE.SETTINGS_SET, (_e, partial: Partial<AppSettings>) => saveSettings(partial))

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
          click: () => mainWindow?.webContents.send('menu:open-file')
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => mainWindow?.webContents.send('menu:close-tab')
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
          click: () => mainWindow?.webContents.send('menu:find')
        },
        {
          label: 'Go to Line…',
          accelerator: 'CmdOrCtrl+G',
          click: () => mainWindow?.webContents.send('menu:goto-line')
        },
        { type: 'separator' },
        {
          label: 'Toggle Follow',
          accelerator: 'F5',
          click: () => mainWindow?.webContents.send('menu:toggle-follow')
        },
        {
          label: 'Jump to End',
          accelerator: 'End',
          click: () => mainWindow?.webContents.send('menu:jump-end')
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

export function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    show: false,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

export async function bootstrap(): Promise<void> {
  await initStore()
  registerIpcHandlers()
  buildMenu()
  createWindow()
}

export { sessionManager }
