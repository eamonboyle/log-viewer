import { randomUUID } from 'crypto'
import { app, BrowserWindow } from 'electron'
import { join } from 'path'

export class WindowManager {
  private readonly windows = new Map<string, BrowserWindow>()
  private readonly sessionToWindows = new Map<string, Set<string>>()
  private readonly windowSessions = new Map<string, Set<string>>()
  private onSessionOrphaned: ((sessionId: string) => void) | null = null

  setSessionOrphanHandler(handler: (sessionId: string) => void): void {
    this.onSessionOrphaned = handler
  }

  private notifyIfOrphaned(sessionId: string): void {
    if (!this.hasSessionOwners(sessionId)) {
      this.onSessionOrphaned?.(sessionId)
    }
  }

  createWindow(): BrowserWindow {
    const windowId = randomUUID()
    const win = new BrowserWindow({
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

    win.on('ready-to-show', () => win.show())
    win.on('closed', () => this.removeWindow(windowId))

    this.windows.set(windowId, win)
    this.windowSessions.set(windowId, new Set())

    if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
      void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      void win.loadFile(join(__dirname, '../renderer/index.html'))
    }

    return win
  }

  getWindowId(win: BrowserWindow): string | undefined {
    for (const [id, w] of this.windows) {
      if (w === win) return id
    }
    return undefined
  }

  getWindowIdFromWebContents(webContents: Electron.WebContents): string | undefined {
    const win = BrowserWindow.fromWebContents(webContents)
    return win ? this.getWindowId(win) : undefined
  }

  getFocusedWindow(): BrowserWindow | null {
    return BrowserWindow.getFocusedWindow()
  }

  getFocusedOrFirstWindow(): BrowserWindow | null {
    return this.getFocusedWindow() ?? this.windows.values().next().value ?? null
  }

  registerSession(windowId: string, sessionId: string): void {
    let owners = this.sessionToWindows.get(sessionId)
    if (!owners) {
      owners = new Set()
      this.sessionToWindows.set(sessionId, owners)
    }
    owners.add(windowId)
    this.windowSessions.get(windowId)?.add(sessionId)
  }

  unregisterSession(sessionId: string, windowId?: string): void {
    if (windowId) {
      this.sessionToWindows.get(sessionId)?.delete(windowId)
      this.windowSessions.get(windowId)?.delete(sessionId)
      if (this.sessionToWindows.get(sessionId)?.size === 0) {
        this.sessionToWindows.delete(sessionId)
        this.notifyIfOrphaned(sessionId)
      }
      return
    }

    const owners = this.sessionToWindows.get(sessionId)
    if (owners) {
      for (const wid of owners) {
        this.windowSessions.get(wid)?.delete(sessionId)
      }
    }
    this.sessionToWindows.delete(sessionId)
    this.notifyIfOrphaned(sessionId)
  }

  hasSessionOwners(sessionId: string): boolean {
    const owners = this.sessionToWindows.get(sessionId)
    return owners !== undefined && owners.size > 0
  }

  sendToSessionOwner(sessionId: string, channel: string, ...args: unknown[]): void {
    const windowIds = this.sessionToWindows.get(sessionId)
    if (!windowIds) return
    for (const windowId of windowIds) {
      const win = this.windows.get(windowId)
      if (win && !win.isDestroyed()) {
        win.webContents.send(channel, sessionId, ...args)
      }
    }
  }

  sendToWindow(win: BrowserWindow, channel: string, ...args: unknown[]): void {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  }

  sendToFocusedOrFirst(channel: string, ...args: unknown[]): void {
    const win = this.getFocusedOrFirstWindow()
    if (win) this.sendToWindow(win, channel, ...args)
  }

  getAllWindows(): BrowserWindow[] {
    return [...this.windows.values()].filter((w) => !w.isDestroyed())
  }

  private removeWindow(windowId: string): void {
    const sessions = this.windowSessions.get(windowId)
    if (sessions) {
      for (const sessionId of sessions) {
        this.sessionToWindows.get(sessionId)?.delete(windowId)
        if (this.sessionToWindows.get(sessionId)?.size === 0) {
          this.sessionToWindows.delete(sessionId)
          this.notifyIfOrphaned(sessionId)
        }
      }
    }
    this.windowSessions.delete(windowId)
    this.windows.delete(windowId)
  }
}

export const windowManager = new WindowManager()
