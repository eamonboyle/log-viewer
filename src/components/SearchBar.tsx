import { useCallback, useEffect, useRef } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
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
      }, 250)
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

  const matchLabel = error
    ? 'Search failed'
    : total === 0
      ? query.trim()
        ? 'No matches'
        : ''
      : stale
        ? `${currentIndex + 1} of ${total} (stale)`
        : `${currentIndex + 1} of ${total}`

  return (
    <div className="absolute right-3 top-3 z-20 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find in file…"
        className="w-56 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        spellCheck={false}
      />

      <span
        className={cn(
          'min-w-[5.5rem] text-xs tabular-nums',
          error || (total === 0 && query.trim()) ? 'text-destructive' : 'text-muted-foreground',
          stale && !error && 'text-yellow-500'
        )}
        title={error ?? undefined}
      >
        {searching ? 'Searching…' : matchLabel}
      </span>

      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        disabled={total === 0 || searching}
        onClick={() => void prevMatch()}
        title="Previous match (Shift+Enter)"
      >
        <ChevronUp className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        disabled={total === 0 || searching}
        onClick={() => void nextMatch()}
        title="Next match (Enter)"
      >
        <ChevronDown className="h-4 w-4" />
      </Button>

      <div className="mx-1 h-5 w-px bg-border" />

      <label className="flex items-center gap-1 text-xs text-muted-foreground" title="Case sensitive">
        <Switch
          checked={options.caseSensitive}
          onCheckedChange={(checked) => {
            setOptions({ caseSensitive: checked })
            if (query.trim()) void runSearch()
          }}
        />
        Aa
      </label>
      <label className="flex items-center gap-1 text-xs text-muted-foreground" title="Regex">
        <Switch
          checked={options.isRegex}
          onCheckedChange={(checked) => {
            setOptions({ isRegex: checked })
            if (query.trim()) void runSearch()
          }}
        />
        .*
      </label>
      <label className="flex items-center gap-1 text-xs text-muted-foreground" title="Whole word">
        <Switch
          checked={options.wholeWord}
          onCheckedChange={(checked) => {
            setOptions({ wholeWord: checked })
            if (query.trim()) void runSearch()
          }}
        />
        W
      </label>

      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={close} title="Close (Esc)">
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
