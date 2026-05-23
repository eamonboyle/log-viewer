import { create } from 'zustand'
import {
  ALL_LEVELS,
  DEFAULT_FILTER,
  type LogFilterState,
  type LogLevel,
  type QuickFilter
} from '@/lib/logFilter'

export interface LineFilterIndex {
  visibleLines: number[] | null
  isScanning: boolean
  scanProgress: number
}

const DEFAULT_INDEX: LineFilterIndex = {
  visibleLines: null,
  isScanning: false,
  scanProgress: 0
}

interface FilterStore {
  byTabId: Record<string, LogFilterState>
  indexByTabId: Record<string, LineFilterIndex>

  getFilter: (tabId: string) => LogFilterState
  getIndex: (tabId: string) => LineFilterIndex
  toggleLevel: (tabId: string, level: LogLevel) => void
  setQuickFilter: (tabId: string, quickFilter: QuickFilter) => void
  setIndex: (tabId: string, index: LineFilterIndex) => void
  clearTab: (tabId: string) => void
}

export const useFilterStore = create<FilterStore>((set, get) => ({
  byTabId: {},
  indexByTabId: {},

  getFilter: (tabId) => get().byTabId[tabId] ?? DEFAULT_FILTER,

  getIndex: (tabId) => get().indexByTabId[tabId] ?? DEFAULT_INDEX,

  toggleLevel: (tabId, level) => {
    const current = get().getFilter(tabId)
    const levels = new Set(current.levels)
    if (levels.has(level)) {
      if (levels.size === 1) return
      levels.delete(level)
    } else {
      levels.add(level)
    }

    set((s) => ({
      byTabId: {
        ...s.byTabId,
        [tabId]: {
          levels: ALL_LEVELS.filter((l) => levels.has(l)),
          quickFilter: null
        }
      }
    }))
  },

  setQuickFilter: (tabId, quickFilter) => {
    const current = get().getFilter(tabId)
    const next = current.quickFilter === quickFilter ? null : quickFilter
    set((s) => ({
      byTabId: {
        ...s.byTabId,
        [tabId]: {
          ...current,
          quickFilter: next
        }
      }
    }))
  },

  setIndex: (tabId, index) => {
    set((s) => ({
      indexByTabId: {
        ...s.indexByTabId,
        [tabId]: index
      }
    }))
  },

  clearTab: (tabId) => {
    set((s) => {
      const { [tabId]: _filter, ...byTabId } = s.byTabId
      const { [tabId]: _index, ...indexByTabId } = s.indexByTabId
      return { byTabId, indexByTabId }
    })
  }
}))
