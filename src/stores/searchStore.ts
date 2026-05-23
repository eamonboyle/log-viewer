import { create } from 'zustand'
import { IPC_INVOKE, IPC_EVENT } from '@shared/ipc'
import type { SearchMatch, SearchOptions, SearchState, TabSearchSnapshot } from '@shared/types'
import { DEFAULT_SEARCH_OPTIONS } from '@shared/types'
import { useTabStore } from './tabStore'

const EMPTY_SNAPSHOT: TabSearchSnapshot = {
  isOpen: false,
  query: '',
  options: { ...DEFAULT_SEARCH_OPTIONS },
  matches: [],
  currentIndex: -1,
  total: 0,
  stale: false,
  error: null
}

interface SearchStore {
  activeTabId: string | null
  tabStates: Map<string, TabSearchSnapshot>
  isOpen: boolean
  query: string
  options: SearchOptions
  matches: SearchMatch[]
  currentIndex: number
  total: number
  stale: boolean
  searching: boolean
  error: string | null
  showResultsPanel: boolean

  switchTab: (tabId: string | null) => Promise<void>
  open: () => void
  close: () => void
  toggleResultsPanel: () => void
  setQuery: (query: string) => void
  setOptions: (partial: Partial<SearchOptions>) => void
  runSearch: () => Promise<void>
  nextMatch: () => Promise<void>
  prevMatch: () => Promise<void>
  goToMatchIndex: (index: number) => void
  cancelSearch: () => Promise<void>
  markStale: () => void
  getCurrentMatch: () => SearchMatch | null
  getMatchesForLine: (lineNumber: number) => SearchMatch[]
}

function snapshotFromStore(state: SearchStore): TabSearchSnapshot {
  return {
    isOpen: state.isOpen,
    query: state.query,
    options: state.options,
    matches: state.matches,
    currentIndex: state.currentIndex,
    total: state.total,
    stale: state.stale,
    error: state.error
  }
}

function applySnapshot(snapshot: TabSearchSnapshot): Partial<SearchStore> {
  return {
    isOpen: snapshot.isOpen,
    query: snapshot.query,
    options: snapshot.options,
    matches: snapshot.matches,
    currentIndex: snapshot.currentIndex,
    total: snapshot.total,
    stale: snapshot.stale,
    error: snapshot.error,
    searching: false
  }
}

export const useSearchStore = create<SearchStore>((set, get) => ({
  activeTabId: null,
  tabStates: new Map(),
  isOpen: false,
  query: '',
  options: { ...DEFAULT_SEARCH_OPTIONS },
  matches: [],
  currentIndex: -1,
  total: 0,
  stale: false,
  searching: false,
  error: null,
  showResultsPanel: false,

  switchTab: async (tabId) => {
    const prevId = get().activeTabId
    if (prevId) {
      const nextStates = new Map(get().tabStates)
      nextStates.set(prevId, snapshotFromStore(get()))
      set({ tabStates: nextStates })
    }

    if (!tabId) {
      set({ activeTabId: null, ...applySnapshot(EMPTY_SNAPSHOT) })
      return
    }

    let snapshot = get().tabStates.get(tabId)
    const tab = useTabStore.getState().tabs.find((t) => t.id === tabId)
    if (tab) {
      try {
        const remote = await window.logViewer.invoke(IPC_INVOKE.SEARCH_GET_STATE, tab.sessionId)
        if (remote && remote.query) {
          snapshot = {
            isOpen: snapshot?.isOpen ?? false,
            query: remote.query,
            options: remote.options,
            matches: remote.matches,
            currentIndex: remote.currentIndex,
            total: remote.total,
            stale: remote.stale,
            error: remote.error ?? null
          }
        }
      } catch {
        // keep local snapshot
      }
    }

    set({
      activeTabId: tabId,
      ...applySnapshot(snapshot ?? EMPTY_SNAPSHOT)
    })
  },

  open: () => set({ isOpen: true }),

  close: () => {
    const tab = useTabStore.getState().getActiveTab()
    if (tab) {
      void window.logViewer.invoke(IPC_INVOKE.SEARCH_CANCEL, tab.sessionId)
    }
    set({
      isOpen: false,
      query: '',
      matches: [],
      currentIndex: -1,
      total: 0,
      stale: false,
      searching: false,
      error: null,
      showResultsPanel: false
    })
  },

  toggleResultsPanel: () => set((s) => ({ showResultsPanel: !s.showResultsPanel })),

  setQuery: (query) => set({ query }),

  setOptions: (partial) => set((s) => ({ options: { ...s.options, ...partial } })),

  runSearch: async () => {
    const tab = useTabStore.getState().getActiveTab()
    if (!tab) return

    const { query, options } = get()
    set({ searching: true, error: null, stale: false })

    try {
      const state = await window.logViewer.invoke(
        IPC_INVOKE.SEARCH_QUERY,
        tab.sessionId,
        query,
        options
      )
      applySearchState(state)
      if (!state.error && state.currentIndex >= 0) {
        scrollToCurrentMatch(state)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ error: message, matches: [], currentIndex: -1, total: 0, stale: false })
    } finally {
      set({ searching: false })
    }
  },

  nextMatch: async () => {
    const tab = useTabStore.getState().getActiveTab()
    if (!tab || get().total === 0) return

    if (get().stale) {
      await get().runSearch()
      return
    }

    const state = await window.logViewer.invoke(IPC_INVOKE.SEARCH_NEXT, tab.sessionId)
    if (state) {
      applySearchState(state)
      scrollToCurrentMatch(state)
    }
  },

  prevMatch: async () => {
    const tab = useTabStore.getState().getActiveTab()
    if (!tab || get().total === 0) return

    if (get().stale) {
      await get().runSearch()
      return
    }

    const state = await window.logViewer.invoke(IPC_INVOKE.SEARCH_PREV, tab.sessionId)
    if (state) {
      applySearchState(state)
      scrollToCurrentMatch(state)
    }
  },

  goToMatchIndex: (index) => {
    const { matches } = get()
    if (index < 0 || index >= matches.length) return
    set({ currentIndex: index })
    scrollToCurrentMatch({
      ...get(),
      matches,
      currentIndex: index,
      total: matches.length,
      stale: get().stale,
      fileSizeAtSearch: 0,
      query: get().query,
      options: get().options
    })
  },

  cancelSearch: async () => {
    const tab = useTabStore.getState().getActiveTab()
    if (tab) {
      await window.logViewer.invoke(IPC_INVOKE.SEARCH_CANCEL, tab.sessionId)
    }
    set({ matches: [], currentIndex: -1, total: 0, stale: false })
  },

  markStale: () => {
    const { query, total } = get()
    set({ stale: true })
    if (query.trim() && total > 0) {
      void get().runSearch()
    }
  },

  getCurrentMatch: () => {
    const { matches, currentIndex } = get()
    if (currentIndex < 0 || currentIndex >= matches.length) return null
    return matches[currentIndex]
  },

  getMatchesForLine: (lineNumber) => get().matches.filter((m) => m.lineNumber === lineNumber)
}))

function applySearchState(state: SearchState): void {
  useSearchStore.setState({
    query: state.query,
    options: state.options,
    matches: state.matches,
    currentIndex: state.currentIndex,
    total: state.total,
    stale: state.stale,
    error: state.error ?? null
  })
}

function scrollToCurrentMatch(state: SearchState): void {
  if (state.currentIndex < 0 || state.currentIndex >= state.matches.length) return
  const match = state.matches[state.currentIndex]
  const tab = useTabStore.getState().getActiveTab()
  if (!tab) return

  const atTail = match.lineNumber >= tab.lineCount - 1
  if (!atTail && tab.followPinned) {
    useTabStore.getState().setFollowPinned(tab.id, false)
  }

  useTabStore.getState().scrollToLine(tab.id, match.lineNumber, match.column)
}

export function subscribeSearchStaleEvents(): () => void {
  return window.logViewer.on(IPC_EVENT.SEARCH_STALE, (sessionId) => {
    const tab = useTabStore.getState().tabs.find((t) => t.sessionId === sessionId)
    if (tab && tab.id === useSearchStore.getState().activeTabId) {
      useSearchStore.getState().markStale()
    }
  })
}
