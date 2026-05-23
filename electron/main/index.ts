import { app, BrowserWindow } from 'electron'
import { bootstrap, sessionManager } from './ipc-handlers'

app.whenReady().then(() => {
  void bootstrap()
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
  const wins = BrowserWindow.getAllWindows()
  wins[0]?.webContents.send('menu:open-path', filePath)
})
