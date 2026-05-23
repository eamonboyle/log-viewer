import { create } from 'zustand'
import { IPC_INVOKE } from '@shared/ipc'
import type { AppSettings, HighlightRule, HighlightedLine, LogLine } from '@shared/types'

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
}

interface TabStore {
  tabs: TabSession[]
  activeTabId: string | null
  settings: AppSettings | null

  loadSettings: () => Promise<void>
  openFile: (path: string) => Promise<void>
  openFileDialog: () => Promise<void>
  closeTab: (tabId: string) => Promise<void>
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
}

function makeDisplayName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}

export const useTabStore = create<TabStore>((set, get) => ({
  tabs: [],
  activeTabId: null,
  settings: null,

  loadSettings: async () => {
    const settings = await window.logViewer.invoke(IPC_INVOKE.SETTINGS_GET)
    set({ settings })
  },

  openFile: async (path: string) => {
    const existing = get().tabs.find((t) => t.path === path)
    if (existing) {
      set({ activeTabId: existing.id })
      return
    }

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
      lineCache: new Map()
    }

    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: tab.id
    }))

    await window.logViewer.invoke(IPC_INVOKE.TAIL_SET_FOLLOW, result.sessionId, true)
  },

  openFileDialog: async () => {
    const path = await window.logViewer.invoke(IPC_INVOKE.DIALOG_OPEN_FILE)
    if (path) await get().openFile(path)
  },

  closeTab: async (tabId: string) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (tab) {
      await window.logViewer.invoke(IPC_INVOKE.FILE_CLOSE, tab.sessionId)
    }

    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== tabId)
      const activeTabId =
        s.activeTabId === tabId ? (tabs.length > 0 ? tabs[tabs.length - 1].id : null) : s.activeTabId
      return { tabs, activeTabId }
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
    }
  },

  appendLines: (sessionId: string, lines: LogLine[]) => {
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
  }
}))

export type { HighlightedLine }
