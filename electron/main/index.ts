import { app, BrowserWindow } from 'electron'
import { bootstrap, sessionManager } from './ipc-handlers'
import { setCheckForUpdates } from './ipc-handlers'
import { windowManager } from './window-manager'

let pendingOpenFile: string | null = null

async function initAutoUpdater(): Promise<void> {
  if (!app.isPackaged) {
    setCheckForUpdates(() => {
      const win = windowManager.getFocusedOrFirstWindow()
      if (win) {
        void import('electron').then(({ dialog }) =>
          dialog.showMessageBox(win, {
            type: 'info',
            title: 'Updates',
            message: 'Updates are checked automatically in packaged builds only.'
          })
        )
      }
    })
    return
  }

  try {
    const { autoUpdater } = await import('electron-updater')
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false

    autoUpdater.on('update-available', () => {
      const win = windowManager.getFocusedOrFirstWindow()
      if (win) {
        void import('electron').then(({ dialog }) =>
          dialog.showMessageBox(win, {
            type: 'info',
            title: 'Update Available',
            message: 'A new version is available. Download from GitHub Releases or wait for a future auto-install build.'
          })
        )
      }
    })

    autoUpdater.on('update-not-available', () => {
      const win = windowManager.getFocusedOrFirstWindow()
      if (win) {
        void import('electron').then(({ dialog }) =>
          dialog.showMessageBox(win, {
            type: 'info',
            title: 'No Updates',
            message: 'You are running the latest version.'
          })
        )
      }
    })

    autoUpdater.on('error', (err) => {
      console.error('Auto-updater error:', err)
    })

    setCheckForUpdates(() => {
      void autoUpdater.checkForUpdates()
    })
  } catch (err) {
    console.error('Failed to init auto-updater:', err)
    setCheckForUpdates(() => {})
  }
}

app.whenReady().then(() => {
  void bootstrap().then(() => {
    void initAutoUpdater()
    if (pendingOpenFile) {
      const win = windowManager.getFocusedOrFirstWindow()
      win?.webContents.send('menu:open-path', pendingOpenFile)
      pendingOpenFile = null
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void bootstrap()
  }
})

app.on('before-quit', () => {
  void sessionManager.closeAll()
})

app.on('open-file', (event, filePath) => {
  event.preventDefault()
  const win = windowManager.getFocusedOrFirstWindow()
  if (win && !win.webContents.isLoading()) {
    win.webContents.send('menu:open-path', filePath)
  } else {
    pendingOpenFile = filePath
    if (BrowserWindow.getAllWindows().length === 0) {
      void bootstrap()
    }
  }
})
