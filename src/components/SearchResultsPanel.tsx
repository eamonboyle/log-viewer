import { useMemo, useEffect, useState } from 'react'
import { IPC_INVOKE } from '@shared/ipc'
import { useSearchStore } from '@/stores/searchStore'
import { cn } from '@/lib/utils'
import { useTabStore } from '@/stores/tabStore'

export function SearchResultsPanel() {
  const showResultsPanel = useSearchStore((s) => s.showResultsPanel)
  const matches = useSearchStore((s) => s.matches)
  const currentIndex = useSearchStore((s) => s.currentIndex)
  const query = useSearchStore((s) => s.query)
  const goToMatchIndex = useSearchStore((s) => s.goToMatchIndex)
  const tab = useTabStore((s) => s.getActiveTab())
  const cacheLines = useTabStore((s) => s.cacheLines)
  const [fetchTick, setFetchTick] = useState(0)

  const previewMatches = useMemo(() => matches.slice(0, 500), [matches])

  useEffect(() => {
    if (!showResultsPanel || !tab || previewMatches.length === 0) return

    const missing = previewMatches
      .map((m) => m.lineNumber)
      .filter((lineNumber) => !tab.lineCache.has(lineNumber))

    if (missing.length === 0) return

    const unique = [...new Set(missing)].sort((a, b) => a - b)
    const ranges: { start: number; count: number }[] = []
    let start = unique[0]
    let prev = unique[0]

    for (let i = 1; i <= unique.length; i++) {
      const current = unique[i]
      if (current === prev + 1) {
        prev = current
        continue
      }
      ranges.push({ start, count: prev - start + 1 })
      start = current
      prev = current
    }

    let cancelled = false
    void (async () => {
      for (const range of ranges) {
        if (cancelled) return
        try {
          const batch = await window.logViewer.invoke(
            IPC_INVOKE.VIEWPORT_READ_LINES,
            tab.sessionId,
            range.start,
            range.count
          )
          cacheLines(tab.id, batch.lines)
        } catch {
          break
        }
      }
      if (!cancelled) setFetchTick((t) => t + 1)
    })()

    return () => {
      cancelled = true
    }
  }, [showResultsPanel, tab, previewMatches, cacheLines, fetchTick])

  const previews = useMemo(() => {
    return previewMatches.map((match, index) => {
      const text = tab?.lineCache.get(match.lineNumber) ?? '…'
      const preview = text.length > 120 ? `${text.slice(0, 117)}…` : text
      return { match, index, preview }
    })
  }, [previewMatches, tab?.lineCache, fetchTick])

  if (!showResultsPanel || !query.trim() || matches.length === 0) return null

  return (
    <div className="absolute bottom-0 left-0 z-20 flex max-h-48 w-80 flex-col border border-border bg-card shadow-lg">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <span>{matches.length.toLocaleString()} matches</span>
        <button
          type="button"
          className="hover:text-foreground"
          onClick={() => useSearchStore.setState({ showResultsPanel: false })}
        >
          Hide
        </button>
      </div>
      <ul className="overflow-y-auto text-xs">
        {previews.map(({ match, index, preview }) => (
          <li key={`${match.lineNumber}-${match.column}-${index}`}>
            <button
              type="button"
              className={cn(
                'flex w-full flex-col gap-0.5 px-3 py-1.5 text-left hover:bg-accent/50',
                index === currentIndex && 'bg-accent/60'
              )}
              onClick={() => goToMatchIndex(index)}
            >
              <span className="font-medium tabular-nums text-muted-foreground">
                Line {match.lineNumber + 1}:{match.column + 1}
              </span>
              <span className="truncate font-mono">{preview}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
