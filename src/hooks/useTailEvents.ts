import { useEffect } from 'react'
import { IPC_EVENT } from '@shared/ipc'
import type { TailAppendedPayload, IndexProgressPayload, FileErrorPayload } from '@shared/types'
import { useTabStore } from '@/stores/tabStore'

export function useTailEvents(): void {
  const appendLines = useTabStore((s) => s.appendLines)
  const updateProgress = useTabStore((s) => s.updateProgress)
  const setError = useTabStore((s) => s.setError)

  useEffect(() => {
    const unsubs = [
      window.logViewer.on(IPC_EVENT.TAIL_APPENDED, (sessionId, payload) => {
        const p = payload as TailAppendedPayload
        appendLines(sessionId, p.lines.lines)
      }),
      window.logViewer.on(IPC_EVENT.INDEX_PROGRESS, (sessionId, payload) => {
        const p = payload as IndexProgressPayload
        updateProgress(sessionId, p.lineCount, p.percent, p.complete)
      }),
      window.logViewer.on(IPC_EVENT.FILE_ERROR, (sessionId, payload) => {
        const p = payload as FileErrorPayload
        setError(sessionId, p.message)
      })
    ]

    return () => unsubs.forEach((u) => u())
  }, [appendLines, updateProgress, setError])
}

export function useMenuShortcuts(): void {
  const openFileDialog = useTabStore((s) => s.openFileDialog)
  const closeTab = useTabStore((s) => s.closeTab)
  const toggleFollow = useTabStore((s) => s.toggleFollow)
  const setFollowPinned = useTabStore((s) => s.setFollowPinned)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const openFile = useTabStore((s) => s.openFile)

  useEffect(() => {
    const unsubs = [
      window.logViewer.onMenu('menu:open-file', () => void openFileDialog()),
      window.logViewer.onMenu('menu:close-tab', () => {
        if (activeTabId) void closeTab(activeTabId)
      }),
      window.logViewer.onMenu('menu:toggle-follow', () => {
        if (activeTabId) void toggleFollow(activeTabId)
      }),
      window.logViewer.onMenu('menu:jump-end', () => {
        if (activeTabId) setFollowPinned(activeTabId, true)
      }),
      window.logViewer.onMenuPath('menu:open-path', (path) => void openFile(path))
    ]
    return () => unsubs.forEach((u) => u())
  }, [openFileDialog, closeTab, toggleFollow, setFollowPinned, activeTabId, openFile])
}

export function useKeyboardShortcuts(): void {
  const openFileDialog = useTabStore((s) => s.openFileDialog)
  const closeTab = useTabStore((s) => s.closeTab)
  const toggleFollow = useTabStore((s) => s.toggleFollow)
  const setFollowPinned = useTabStore((s) => s.setFollowPinned)
  const activeTabId = useTabStore((s) => s.activeTabId)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault()
        void openFileDialog()
      }
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault()
        if (activeTabId) void closeTab(activeTabId)
      }
      if (e.key === 'F5') {
        e.preventDefault()
        if (activeTabId) void toggleFollow(activeTabId)
      }
      if (e.key === 'End') {
        e.preventDefault()
        if (activeTabId) setFollowPinned(activeTabId, true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openFileDialog, closeTab, toggleFollow, setFollowPinned, activeTabId])
}
