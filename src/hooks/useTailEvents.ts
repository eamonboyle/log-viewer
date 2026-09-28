import { useEffect } from 'react'
import { IPC_EVENT, type LogViewerApi } from '@shared/ipc'
import { useGoToLineStore } from '@/stores/goToLineStore'
import { useSearchStore } from '@/stores/searchStore'
import { useTabStore, type TailBatch } from '@/stores/tabStore'

/** Subscribe to tail IPC events and coalesce them into one store update per session per animation frame */
export function attachTailEvents(bus: Pick<LogViewerApi, 'on'>): () => void {
  let pending = new Map<string, TailBatch>()
  let rafId: number | null = null

  const flush = () => {
    rafId = null
    const batches = pending
    pending = new Map()
    const applyTailBatch = useTabStore.getState().applyTailBatch
    for (const [sessionId, batch] of batches) {
      applyTailBatch(sessionId, batch)
    }
  }

  const scheduleFlush = () => {
    if (rafId !== null) return
    rafId = requestAnimationFrame(flush)
  }

  const pendingFor = (sessionId: string): TailBatch => {
    const existing = pending.get(sessionId)
    if (existing) return existing
    const created: TailBatch = { reset: false, lines: [] }
    pending.set(sessionId, created)
    return created
  }

  const unsubs = [
    bus.on(IPC_EVENT.TAIL_APPENDED, (sessionId, payload) => {
      const batch = pendingFor(sessionId)
      batch.lines = batch.lines.concat(payload.lines.lines)
      scheduleFlush()
    }),
    bus.on(IPC_EVENT.INDEX_PROGRESS, (sessionId, payload) => {
      const batch = pendingFor(sessionId)
      batch.progress = { lineCount: payload.lineCount, percent: payload.percent, complete: payload.complete }
      scheduleFlush()
    }),
    bus.on(IPC_EVENT.FILE_ERROR, (sessionId, payload) => {
      useTabStore.getState().setError(sessionId, payload.message)
    }),
    bus.on(IPC_EVENT.FILE_ROTATED, (sessionId) => {
      // Lines and progress queued before the rotation are numbered by the old file; drop them
      pending.set(sessionId, { reset: true, lines: [] })
      scheduleFlush()
      const tab = useTabStore.getState().tabs.find((t) => t.sessionId === sessionId)
      if (tab && useSearchStore.getState().total > 0) {
        useSearchStore.getState().markStale()
      }
    })
  ]

  return () => {
    unsubs.forEach((u) => u())
    if (rafId !== null) cancelAnimationFrame(rafId)
  }
}

export function useTailEvents(): void {
  useEffect(() => attachTailEvents(window.logViewer), [])
}

export function useMenuShortcuts(): void {
  const openFileDialog = useTabStore((s) => s.openFileDialog)
  const openFileDialogInNewTab = useTabStore((s) => s.openFileDialogInNewTab)
  const closeTab = useTabStore((s) => s.closeTab)
  const toggleFollow = useTabStore((s) => s.toggleFollow)
  const setFollowPinned = useTabStore((s) => s.setFollowPinned)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const openFile = useTabStore((s) => s.openFile)
  const openFileInNewTab = useTabStore((s) => s.openFileInNewTab)
  const openSearch = useSearchStore((s) => s.open)
  const openGoToLine = useGoToLineStore((s) => s.open)

  useEffect(() => {
    const unsubs = [
      window.logViewer.onMenu('menu:open-file', () => void openFileDialog()),
      window.logViewer.onMenu('menu:open-file-new-tab', () => void openFileDialogInNewTab()),
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
      window.logViewer.onMenuPath('menu:open-path', (path) => void openFile(path)),
      window.logViewer.onMenuPath('menu:open-path-new-tab', (path) => void openFileInNewTab(path))
    ]
    return () => unsubs.forEach((u) => u())
  }, [
    openFileDialog,
    openFileDialogInNewTab,
    closeTab,
    toggleFollow,
    setFollowPinned,
    activeTabId,
    openFile,
    openFileInNewTab,
    openSearch,
    openGoToLine
  ])
}

export function useKeyboardShortcuts(): void {
  const openFileDialog = useTabStore((s) => s.openFileDialog)
  const openFileDialogInNewTab = useTabStore((s) => s.openFileDialogInNewTab)
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
        if (e.shiftKey) void openFileDialogInNewTab()
        else void openFileDialog()
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
    openFileDialogInNewTab,
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
