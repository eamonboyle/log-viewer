import { useEffect } from 'react'
import { IPC_EVENT } from '@shared/ipc'
import type { TailAppendedPayload, IndexProgressPayload, FileErrorPayload } from '@shared/types'
import { useGoToLineStore } from '@/stores/goToLineStore'
import { useSearchStore } from '@/stores/searchStore'
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
      }),
      window.logViewer.on(IPC_EVENT.FILE_ROTATED, (sessionId) => {
        const tab = useTabStore.getState().tabs.find((t) => t.sessionId === sessionId)
        if (tab && useSearchStore.getState().total > 0) {
          useSearchStore.getState().markStale()
        }
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
  const openSearch = useSearchStore((s) => s.open)
  const openGoToLine = useGoToLineStore((s) => s.open)

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
      window.logViewer.onMenu('menu:find', () => openSearch()),
      window.logViewer.onMenu('menu:goto-line', () => openGoToLine()),
      window.logViewer.onMenuPath('menu:open-path', (path) => void openFile(path))
    ]
    return () => unsubs.forEach((u) => u())
  }, [openFileDialog, closeTab, toggleFollow, setFollowPinned, activeTabId, openFile, openSearch, openGoToLine])
}

export function useKeyboardShortcuts(): void {
  const openFileDialog = useTabStore((s) => s.openFileDialog)
  const closeTab = useTabStore((s) => s.closeTab)
  const toggleFollow = useTabStore((s) => s.toggleFollow)
  const setFollowPinned = useTabStore((s) => s.setFollowPinned)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const openSearch = useSearchStore((s) => s.open)
  const closeSearch = useSearchStore((s) => s.close)
  const isSearchOpen = useSearchStore((s) => s.isOpen)
  const nextMatch = useSearchStore((s) => s.nextMatch)
  const prevMatch = useSearchStore((s) => s.prevMatch)
  const openGoToLine = useGoToLineStore((s) => s.open)
  const closeGoToLine = useGoToLineStore((s) => s.close)
  const isGoToLineOpen = useGoToLineStore((s) => s.isOpen)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault()
        openSearch()
        return
      }
      if (e.ctrlKey && e.key === 'g') {
        e.preventDefault()
        openGoToLine()
        return
      }
      if (e.key === 'F3') {
        e.preventDefault()
        if (e.shiftKey) void prevMatch()
        else void nextMatch()
        return
      }
      if (e.key === 'Escape') {
        if (isSearchOpen) {
          e.preventDefault()
          closeSearch()
          return
        }
        if (isGoToLineOpen) {
          e.preventDefault()
          closeGoToLine()
          return
        }
      }

      if (inInput) return

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
  }, [
    openFileDialog,
    closeTab,
    toggleFollow,
    setFollowPinned,
    activeTabId,
    openSearch,
    closeSearch,
    isSearchOpen,
    nextMatch,
    prevMatch,
    openGoToLine,
    closeGoToLine,
    isGoToLineOpen
  ])
}
