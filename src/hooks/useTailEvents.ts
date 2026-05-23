import { useEffect, useRef } from 'react'
import { IPC_EVENT } from '@shared/ipc'
import type { TailAppendedPayload, IndexProgressPayload, FileErrorPayload } from '@shared/types'
import { useGoToLineStore } from '@/stores/goToLineStore'
import { useSearchStore } from '@/stores/searchStore'
import { useTabStore } from '@/stores/tabStore'

type PendingTail = {
  lines: TailAppendedPayload['lines']['lines']
  progress?: IndexProgressPayload
}

/** Coalesce tail IPC events into one store update per animation frame */
function useBatchedTailUpdates(): {
  queueAppend: (sessionId: string, payload: TailAppendedPayload) => void
  queueProgress: (sessionId: string, payload: IndexProgressPayload) => void
} {
  const pendingRef = useRef<Map<string, PendingTail>>(new Map())
  const rafRef = useRef<number | null>(null)

  const flush = useRef(() => {
    rafRef.current = null
    const pending = pendingRef.current
    pendingRef.current = new Map()
    const applyTailBatch = useTabStore.getState().applyTailBatch

    for (const [sessionId, batch] of pending) {
      applyTailBatch(
        sessionId,
        batch.lines,
        batch.progress
          ? {
              lineCount: batch.progress.lineCount,
              percent: batch.progress.percent,
              complete: batch.progress.complete
            }
          : undefined
      )
    }
  })

  const scheduleFlush = useRef(() => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(flush.current)
  })

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    },
    []
  )

  return {
    queueAppend: (sessionId, payload) => {
      const map = pendingRef.current
      const existing = map.get(sessionId) ?? { lines: [] }
      existing.lines = existing.lines.concat(payload.lines.lines)
      map.set(sessionId, existing)
      scheduleFlush.current()
    },
    queueProgress: (sessionId, payload) => {
      const map = pendingRef.current
      const existing = map.get(sessionId) ?? { lines: [] }
      existing.progress = payload
      map.set(sessionId, existing)
      scheduleFlush.current()
    }
  }
}

export function useTailEvents(): void {
  const setError = useTabStore((s) => s.setError)
  const { queueAppend, queueProgress } = useBatchedTailUpdates()

  useEffect(() => {
    const unsubs = [
      window.logViewer.on(IPC_EVENT.TAIL_APPENDED, (sessionId, payload) => {
        queueAppend(sessionId, payload as TailAppendedPayload)
      }),
      window.logViewer.on(IPC_EVENT.INDEX_PROGRESS, (sessionId, payload) => {
        queueProgress(sessionId, payload as IndexProgressPayload)
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
  }, [queueAppend, queueProgress, setError])
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
