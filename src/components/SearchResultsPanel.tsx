import { useMemo } from 'react'
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

  const previews = useMemo(() => {
    return matches.slice(0, 500).map((match, index) => {
      const text = tab?.lineCache.get(match.lineNumber) ?? '…'
      const preview =
        text.length > 120 ? `${text.slice(0, 117)}…` : text
      return { match, index, preview }
    })
  }, [matches, tab?.lineCache])

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
