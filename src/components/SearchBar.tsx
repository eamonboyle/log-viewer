import { useCallback, useEffect, useRef } from 'react'
import { Search, ChevronDown, ChevronUp, X, List } from 'lucide-react'
import { useSearchStore } from '@/stores/searchStore'
import { cn } from '@/lib/utils'

export function SearchBar() {
  const isOpen = useSearchStore((s) => s.isOpen)
  const query = useSearchStore((s) => s.query)
  const options = useSearchStore((s) => s.options)
  const total = useSearchStore((s) => s.total)
  const currentIndex = useSearchStore((s) => s.currentIndex)
  const stale = useSearchStore((s) => s.stale)
  const searching = useSearchStore((s) => s.searching)
  const error = useSearchStore((s) => s.error)
  const setQuery = useSearchStore((s) => s.setQuery)
  const setOptions = useSearchStore((s) => s.setOptions)
  const runSearch = useSearchStore((s) => s.runSearch)
  const nextMatch = useSearchStore((s) => s.nextMatch)
  const prevMatch = useSearchStore((s) => s.prevMatch)
  const close = useSearchStore((s) => s.close)
  const toggleResultsPanel = useSearchStore((s) => s.toggleResultsPanel)
  const showResultsPanel = useSearchStore((s) => s.showResultsPanel)

  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isOpen])

  const scheduleSearch = useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        if (value.trim()) {
          void runSearch()
        }
      }, 300)
    },
    [runSearch]
  )

  const handleQueryChange = (value: string) => {
    setQuery(value)
    scheduleSearch(value)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) {
        void prevMatch()
      } else {
        void nextMatch()
      }
    }
  }

  if (!isOpen) return null

  const hasQuery = query.trim().length > 0
  const noResults = hasQuery && total === 0 && !searching

  const matchLabel = error
    ? 'error'
    : total === 0
      ? hasQuery
        ? 'no matches'
        : ''
      : stale
        ? `${currentIndex + 1}/${total} ·`
        : `${currentIndex + 1}/${total}`

  return (
    <div className="absolute right-3 top-3 z-20 flex items-center rounded-lg border border-border bg-card shadow-2xl shadow-black/30">
      {/* Search icon + input */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Find in file…"
          className="w-48 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          spellCheck={false}
        />
      </div>

      {/* Match count */}
      <span
        className={cn(
          'min-w-[4.5rem] shrink-0 text-center text-xs tabular-nums',
          error || noResults ? 'text-destructive' : stale ? 'text-amber-400' : 'text-muted-foreground'
        )}
        title={error ?? undefined}
      >
        {searching ? '…' : matchLabel}
      </span>

      <div className="h-5 w-px bg-border" />

      {/* Navigation */}
      <div className="flex items-center">
        <button
          type="button"
          className="p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
          disabled={total === 0 || searching}
          onClick={() => void prevMatch()}
          title="Previous (Shift+Enter)"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
          disabled={total === 0 || searching}
          onClick={() => void nextMatch()}
          title="Next (Enter)"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="h-5 w-px bg-border" />

      {/* Options: Aa / .* / W */}
      <div className="flex items-center gap-px px-1">
        {[
          { key: 'caseSensitive' as const, label: 'Aa', title: 'Case sensitive' },
          { key: 'isRegex' as const, label: '.*', title: 'Regular expression' },
          { key: 'wholeWord' as const, label: 'W', title: 'Whole word' }
        ].map(({ key, label, title }) => (
          <button
            key={key}
            type="button"
            title={title}
            onClick={() => {
              setOptions({ [key]: !options[key] })
              if (query.trim()) void runSearch()
            }}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded text-xs font-medium transition-colors',
              options[key]
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="h-5 w-px bg-border" />

      {/* Results list toggle */}
      <button
        type="button"
        className={cn(
          'mx-1 rounded p-1.5 transition-colors',
          showResultsPanel
            ? 'text-primary'
            : 'text-muted-foreground hover:text-foreground',
          total === 0 && 'opacity-30 pointer-events-none'
        )}
        disabled={total === 0}
        onClick={toggleResultsPanel}
        title="Results list"
      >
        <List className="h-3.5 w-3.5" />
      </button>

      {/* Close */}
      <button
        type="button"
        className="mr-1 rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground"
        onClick={close}
        title="Close (Esc)"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
