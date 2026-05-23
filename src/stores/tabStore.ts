import { create } from 'zustand'
import type { StoreApi } from 'zustand'
import { IPC_INVOKE } from '@shared/ipc'
import { useFilterStore } from '@/stores/filterStore'
import type { AppSettings, ColumnLayout, HighlightRule, HighlightedLine, LogLine } from '@shared/types'

export interface TabSession {
  id: string
  sessionId: string
  path: string
  displayName: string
  lineCount: number
  fileSize: number
  followEnabled: boolean
  followPinned: boolean
  hasUnread: boolean
  indexPercent: number
  indexComplete: boolean
  error: string | null
  /** Cached lines keyed by line number */
  lineCache: Map<number, string>
  /** Line to scroll to (0-based); consumed by LogViewport */
  scrollTargetLine: number | null
  /** Column to scroll/highlight (0-based); consumed by LogViewport */
  scrollTargetColumn: number | null
  /** Scroll alignment when scrollTargetLine is set */
  scrollTargetAlign: 'start' | 'center' | 'end' | null
  /** Detected column layout for tab-delimited files */
  columnLayout: ColumnLayout | null
  /** 0-based column indices hidden in display */
  hiddenColumns: number[]
}

interface TabStore {
  tabs: TabSession[]
  activeTabId: string | null
  settings: AppSettings | null

  loadSettings: () => Promise<void>
  openFile: (path: string) => Promise<void>
  openFileInNewTab: (path: string) => Promise<void>
  openFileDialog: () => Promise<void>
  openFileDialogInNewTab: () => Promise<void>
  closeTab: (tabId: string) => Promise<void>
  reorderTabs: (fromIndex: number, toIndex: number) => void
  setActiveTab: (tabId: string) => void
  setFollow: (tabId: string, enabled: boolean) => Promise<void>
  toggleFollow: (tabId: string) => Promise<void>
  setFollowPinned: (tabId: string, pinned: boolean) => void
  appendLines: (sessionId: string, lines: LogLine[]) => void
  updateProgress: (sessionId: string, lineCount: number, percent: number, complete: boolean) => void
  setError: (sessionId: string, message: string) => void
  cacheLines: (tabId: string, lines: LogLine[]) => void
  getLine: (tabId: string, lineNumber: number) => string | undefined
  getActiveTab: () => TabSession | undefined
  updateHighlightRules: (rules: HighlightRule[]) => Promise<void>
  scrollToLine: (tabId: string, lineNumber: number, column?: number, align?: 'start' | 'center' | 'end') => void
  scrollToTail: (tabId: string) => void
  consumeScrollTarget: (tabId: string) => { line: number; column: number | null; align: 'start' | 'center' | 'end' } | null
  gotoLine: (tabId: string, lineOneBased: number, columnOneBased?: number) => void
  detectColumns: (tabId: string) => Promise<void>
  toggleColumnVisibility: (tabId: string, columnIndex: number) => void
  applyTheme: (theme: AppSettings['theme']) => void
  applyTailBatch: (
    sessionId: string,
    lines: LogLine[],
    progress?: { lineCount: number; percent: number; complete: boolean }
  ) => void
}

function makeDisplayName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}

function applyThemeToDocument(theme: AppSettings['theme']): void {
  document.documentElement.dataset.theme = theme
}

async function detectColumnsForTab(tabId: string, sessionId: string, set: StoreApi<TabStore>['setState']): Promise<void> {
  try {
    const layout = await window.logViewer.invoke(IPC_INVOKE.COLUMN_DETECT, sessionId)
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, columnLayout: layout, hiddenColumns: [] } : t
      )
    }))
  } catch {
    // column detection is optional
  }
}

async function createTabFromPath(
  path: string,
  set: StoreApi<TabStore>['setState']
): Promise<void> {
  const result = await window.logViewer.invoke(IPC_INVOKE.FILE_OPEN, path)
  const tab: TabSession = {
    id: crypto.randomUUID(),
    sessionId: result.sessionId,
    path: result.path,
    displayName: makeDisplayName(result.path),
    lineCount: result.lineCount,
    fileSize: result.fileSize,
    followEnabled: true,
    followPinned: true,
    hasUnread: false,
    indexPercent: 0,
    indexComplete: false,
    error: null,
    lineCache: new Map(),
    scrollTargetLine: result.lineCount > 0 ? result.lineCount - 1 : null,
    scrollTargetColumn: null,
    scrollTargetAlign: result.lineCount > 0 ? 'end' : null,
    columnLayout: null,
    hiddenColumns: []
  }

  set((s) => ({
    tabs: [...s.tabs, tab],
    activeTabId: tab.id
  }))

  await window.logViewer.invoke(IPC_INVOKE.TAIL_SET_FOLLOW, result.sessionId, true)
  void detectColumnsForTab(tab.id, result.sessionId, set)
}

export const useTabStore = create<TabStore>((set, get) => ({
  tabs: [],
  activeTabId: null,
  settings: null,

  loadSettings: async () => {
    const settings = await window.logViewer.invoke(IPC_INVOKE.SETTINGS_GET)
    applyThemeToDocument(settings.theme)
    set({ settings })
  },

  openFile: async (path: string) => {
    const existing = get().tabs.find((t) => t.path === path)
    if (existing) {
      set({ activeTabId: existing.id })
      if (existing.followPinned) get().scrollToTail(existing.id)
      return
    }

    await createTabFromPath(path, set)
    await get().loadSettings()
  },

  openFileInNewTab: async (path: string) => {
    await createTabFromPath(path, set)
    await get().loadSettings()
  },

  openFileDialog: async () => {
    const path = await window.logViewer.invoke(IPC_INVOKE.DIALOG_OPEN_FILE)
    if (path) await get().openFile(path)
  },

  openFileDialogInNewTab: async () => {
    const path = await window.logViewer.invoke(IPC_INVOKE.DIALOG_OPEN_FILE)
    if (path) await get().openFileInNewTab(path)
  },

  closeTab: async (tabId: string) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (tab) {
      await window.logViewer.invoke(IPC_INVOKE.FILE_CLOSE, tab.sessionId)
    }

    useFilterStore.getState().clearTab(tabId)

    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== tabId)
      const activeTabId =
        s.activeTabId === tabId ? (tabs.length > 0 ? tabs[tabs.length - 1].id : null) : s.activeTabId
      return { tabs, activeTabId }
    })
  },

  reorderTabs: (fromIndex, toIndex) => {
    set((s) => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return s
      if (fromIndex >= s.tabs.length || toIndex >= s.tabs.length) return s
      const tabs = [...s.tabs]
      const [moved] = tabs.splice(fromIndex, 1)
      tabs.splice(toIndex, 0, moved)
      return { tabs }
    })
  },

  setActiveTab: (tabId: string) => set({ activeTabId: tabId }),

  setFollow: async (tabId: string, enabled: boolean) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab) return

    await window.logViewer.invoke(IPC_INVOKE.TAIL_SET_FOLLOW, tab.sessionId, enabled)
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, followEnabled: enabled, followPinned: enabled, hasUnread: enabled ? false : t.hasUnread } : t
      )
    }))

    if (enabled) {
      get().scrollToTail(tabId)
    }
  },

  toggleFollow: async (tabId: string) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab) return
    await get().setFollow(tabId, !tab.followEnabled)
  },

  setFollowPinned: (tabId: string, pinned: boolean) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t
        return {
          ...t,
          followPinned: pinned,
          followEnabled: pinned ? true : t.followEnabled,
          hasUnread: pinned ? false : t.hasUnread
        }
      })
    }))

    const tab = get().tabs.find((t) => t.id === tabId)
    if (tab && pinned) {
      void window.logViewer.invoke(IPC_INVOKE.TAIL_SET_FOLLOW, tab.sessionId, true)
      get().scrollToTail(tabId)
    }
  },

  appendLines: (sessionId: string, lines: LogLine[]) => {
    if (lines.length === 0) return
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.sessionId !== sessionId) return t
        const lineCache = new Map(t.lineCache)
        for (const line of lines) {
          lineCache.set(line.lineNumber, line.text)
        }
        const newLineCount = Math.max(t.lineCount, ...lines.map((l) => l.lineNumber + 1))
        const hasUnread = !t.followPinned && lines.length > 0
        return { ...t, lineCache, lineCount: newLineCount, hasUnread: hasUnread || t.hasUnread }
      })
    }))
  },

  /** Apply tail append + index progress in one store update to avoid double-render flicker */
  applyTailBatch: (
    sessionId: string,
    lines: LogLine[],
    progress?: { lineCount: number; percent: number; complete: boolean }
  ) => {
    if (lines.length === 0 && !progress) return
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.sessionId !== sessionId) return t
        let lineCache = t.lineCache
        if (lines.length > 0) {
          lineCache = new Map(t.lineCache)
          for (const line of lines) {
            lineCache.set(line.lineNumber, line.text)
          }
        }
        const appendedLineCount =
          lines.length > 0 ? Math.max(t.lineCount, ...lines.map((l) => l.lineNumber + 1)) : t.lineCount
        const lineCount = progress ? Math.max(appendedLineCount, progress.lineCount) : appendedLineCount
        const hasUnread = !t.followPinned && lines.length > 0
        return {
          ...t,
          lineCache,
          lineCount,
          hasUnread: hasUnread || t.hasUnread,
          ...(progress
            ? {
                indexPercent: progress.percent,
                indexComplete: progress.complete
              }
            : {})
        }
      })
    }))
  },

  updateProgress: (sessionId: string, lineCount: number, percent: number, complete: boolean) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.sessionId === sessionId
          ? { ...t, lineCount: Math.max(t.lineCount, lineCount), indexPercent: percent, indexComplete: complete }
          : t
      )
    }))
  },

  setError: (sessionId: string, message: string) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.sessionId === sessionId ? { ...t, error: message } : t))
    }))
  },

  cacheLines: (tabId: string, lines: LogLine[]) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t
        const lineCache = new Map(t.lineCache)
        for (const line of lines) {
          lineCache.set(line.lineNumber, line.text)
        }
        return { ...t, lineCache }
      })
    }))
  },

  getLine: (tabId: string, lineNumber: number) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    return tab?.lineCache.get(lineNumber)
  },

  getActiveTab: () => {
    const { tabs, activeTabId } = get()
    return tabs.find((t) => t.id === activeTabId)
  },

  updateHighlightRules: async (rules: HighlightRule[]) => {
    const settings = await window.logViewer.invoke(IPC_INVOKE.SETTINGS_SET, { highlightRules: rules })
    set({ settings })
  },

  scrollToLine: (tabId, lineNumber, column, align = 'center') => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? { ...t, scrollTargetLine: lineNumber, scrollTargetColumn: column ?? null, scrollTargetAlign: align }
          : t
      )
    }))
  },

  scrollToTail: (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab || tab.lineCount <= 0) return
    get().scrollToLine(tabId, tab.lineCount - 1, undefined, 'end')
  },

  consumeScrollTarget: (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    const line = tab?.scrollTargetLine ?? null
    const column = tab?.scrollTargetColumn ?? null
    const align = tab?.scrollTargetAlign ?? 'center'
    if (line !== null) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tabId
            ? { ...t, scrollTargetLine: null, scrollTargetColumn: null, scrollTargetAlign: null }
            : t
        )
      }))
    }
    return line !== null ? { line, column, align } : null
  },

  gotoLine: (tabId, lineOneBased, columnOneBased) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab) return

    const lineNumber = Math.max(0, Math.min(lineOneBased - 1, Math.max(tab.lineCount - 1, 0)))
    const column = columnOneBased !== undefined ? Math.max(0, columnOneBased - 1) : undefined
    const atTail = lineNumber >= tab.lineCount - 1

    if (!atTail && tab.followPinned) {
      get().setFollowPinned(tabId, false)
    }

    get().scrollToLine(tabId, lineNumber, column)
  },

  detectColumns: async (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab) return
    await detectColumnsForTab(tabId, tab.sessionId, set)
  },

  toggleColumnVisibility: (tabId, columnIndex) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t
        const hidden = new Set(t.hiddenColumns)
        if (hidden.has(columnIndex)) hidden.delete(columnIndex)
        else hidden.add(columnIndex)
        return { ...t, hiddenColumns: [...hidden].sort((a, b) => a - b) }
      })
    }))
  },

  applyTheme: (theme) => {
    applyThemeToDocument(theme)
  }
}))

export type { HighlightedLine }
