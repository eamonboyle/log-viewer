import { useEffect, useRef } from 'react'
import { IPC_INVOKE } from '@shared/ipc'
import { isFilterActive, lineMatchesFilter, type LogFilterState } from '@/lib/logFilter'
import { useFilterStore } from '@/stores/filterStore'
import { useTabStore } from '@/stores/tabStore'

const SCAN_BATCH = 4000

async function scanRange(
  sessionId: string,
  start: number,
  end: number,
  filter: LogFilterState,
  onProgress?: (visibleLines: number[], scannedThrough: number, total: number) => void
): Promise<number[]> {
  const visibleLines: number[] = []
  const total = Math.max(end - start, 1)

  for (let offset = start; offset < end; offset += SCAN_BATCH) {
    const count = Math.min(SCAN_BATCH, end - offset)
    const batch = await window.logViewer.invoke(
      IPC_INVOKE.VIEWPORT_READ_LINES,
      sessionId,
      offset,
      count
    )

    for (const line of batch.lines) {
      if (lineMatchesFilter(line.text, filter)) {
        visibleLines.push(line.lineNumber)
      }
    }

    onProgress?.(visibleLines, offset + count - start, total)
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }

  return visibleLines
}

export function useLineFilterIndex(tabId: string | undefined): void {
  const tab = useTabStore((s) => (tabId ? s.tabs.find((t) => t.id === tabId) : undefined))
  const levels = useFilterStore((s) => (tabId ? s.getFilter(tabId).levels : null))
  const quickFilter = useFilterStore((s) => (tabId ? s.getFilter(tabId).quickFilter : null))
  const setIndex = useFilterStore((s) => s.setIndex)
  const getFilter = useFilterStore((s) => s.getFilter)
  const getIndex = useFilterStore((s) => s.getIndex)

  const scanRef = useRef(0)
  const scannedLineCountRef = useRef(0)
  const filterKey = levels ? `${levels.join(',')}|${quickFilter ?? ''}` : ''

  useEffect(() => {
    if (!tabId || !tab || levels === null) return

    const filter = getFilter(tabId)
    scannedLineCountRef.current = 0

    if (!isFilterActive(filter)) {
      setIndex(tabId, { visibleLines: null, isScanning: false, scanProgress: 1 })
      scannedLineCountRef.current = tab.lineCount
      return
    }

    const scanId = ++scanRef.current
    let cancelled = false
    const lineCount = tab.lineCount

    setIndex(tabId, { visibleLines: [], isScanning: true, scanProgress: 0 })

    void (async () => {
      try {
        const visibleLines = await scanRange(
          tab.sessionId,
          0,
          lineCount,
          filter,
          (partial, scannedThrough, total) => {
            if (cancelled || scanRef.current !== scanId) return
            setIndex(tabId, {
              visibleLines: [...partial],
              isScanning: true,
              scanProgress: Math.min(1, scannedThrough / total)
            })
          }
        )

        if (cancelled || scanRef.current !== scanId) return

        scannedLineCountRef.current = lineCount
        setIndex(tabId, {
          visibleLines,
          isScanning: false,
          scanProgress: 1
        })
      } catch {
        if (cancelled || scanRef.current !== scanId) return
        setIndex(tabId, { visibleLines: [], isScanning: false, scanProgress: 0 })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [tabId, tab?.sessionId, filterKey, getFilter, setIndex, levels, tab])

  useEffect(() => {
    if (!tabId || !tab || levels === null) return

    const filter = getFilter(tabId)
    if (!isFilterActive(filter)) return

    const index = getIndex(tabId)
    if (index.isScanning || index.visibleLines === null) return

    const from = scannedLineCountRef.current
    const to = tab.lineCount
    if (to <= from) return

    const scanId = ++scanRef.current
    let cancelled = false

    void (async () => {
      try {
        const appended = await scanRange(tab.sessionId, from, to, filter)
        if (cancelled || scanRef.current !== scanId) return

        scannedLineCountRef.current = to
        const current = getIndex(tabId).visibleLines ?? []
        setIndex(tabId, {
          visibleLines: [...current, ...appended],
          isScanning: false,
          scanProgress: 1
        })
      } catch {
        // keep existing index on tail scan failure
      }
    })()

    return () => {
      cancelled = true
    }
  }, [tabId, tab?.lineCount, tab?.sessionId, filterKey, getFilter, getIndex, setIndex, levels, tab])
}
