import { create } from 'zustand'
import { IPC_INVOKE, IPC_EVENT } from '@shared/ipc'
import type { SearchMatch, SearchOptions, SearchState } from '@shared/types'
import { DEFAULT_SEARCH_OPTIONS } from '@shared/types'
import { useTabStore } from './tabStore'

interface SearchStore {
  isOpen: boolean
  query: string
  options: SearchOptions
  matches: SearchMatch[]
  currentIndex: number
  total: number
  stale: boolean
  searching: boolean
  error: string | null

  open: () => void
  close: () => void
  setQuery: (query: string) => void
  setOptions: (partial: Partial<SearchOptions>) => void
  runSearch: () => Promise<void>
  nextMatch: () => Promise<void>
  prevMatch: () => Promise<void>
  cancelSearch: () => Promise<void>
  markStale: () => void
  getCurrentMatch: () => SearchMatch | null
  getMatchesForLine: (lineNumber: number) => SearchMatch[]
}

export const useSearchStore = create<SearchStore>((set, get) => ({
  isOpen: false,
  query: '',
  options: { ...DEFAULT_SEARCH_OPTIONS },
  matches: [],
  currentIndex: -1,
  total: 0,
  stale: false,
  searching: false,
  error: null,

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
      error: null
    })
  },

  setQuery: (query) => set({ query }),

  setOptions: (partial) => set((s) => ({ options: { ...s.options, ...partial } })),

  runSearch: async () => {
    const tab = useTabStore.getState().getActiveTab()
    if (!tab) return

    const { query, options } = get()
    set({ searching: true, error: null })

    try {
      const state = await window.logViewer.invoke(
        IPC_INVOKE.SEARCH_QUERY,
        tab.sessionId,
        query,
        options
      )
      applySearchState(state)
      if (!state.error) {
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

  cancelSearch: async () => {
    const tab = useTabStore.getState().getActiveTab()
    if (tab) {
      await window.logViewer.invoke(IPC_INVOKE.SEARCH_CANCEL, tab.sessionId)
    }
    set({ matches: [], currentIndex: -1, total: 0, stale: false })
  },

  markStale: () => set({ stale: true }),

  getCurrentMatch: () => {
    const { matches, currentIndex } = get()
    if (currentIndex < 0 || currentIndex >= matches.length) return null
    return matches[currentIndex]
  },

  getMatchesForLine: (lineNumber) => {
    return get().matches.filter((m) => m.lineNumber === lineNumber)
  }
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

  useTabStore.getState().scrollToLine(tab.id, match.lineNumber)
}

export function subscribeSearchStaleEvents(): () => void {
  return window.logViewer.on(IPC_EVENT.SEARCH_STALE, () => {
    if (useSearchStore.getState().total > 0) {
      useSearchStore.getState().markStale()
    }
  })
}
