import { useMemo, useState } from 'react'
import { Search, Calendar, ChevronRight, ChevronDown } from 'lucide-react'
import { useTabStore } from '@/stores/tabStore'
import { useSearchStore } from '@/stores/searchStore'
import { cn } from '@/lib/utils'

const LEVEL_REGEX = /\b(ERROR|FATAL|CRITICAL|WARN(?:ING)?|INFO|DEBUG|TRACE|VERBOSE)\b/i

type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG'

function classifyLevel(line: string): LogLevel | null {
  const m = LEVEL_REGEX.exec(line)
  if (!m) return null
  const l = m[1].toUpperCase()
  if (l === 'ERROR' || l === 'FATAL' || l === 'CRITICAL') return 'ERROR'
  if (l === 'WARN' || l === 'WARNING') return 'WARN'
  if (l === 'INFO') return 'INFO'
  return 'DEBUG'
}

const LEVEL_META: Record<LogLevel, { label: string; dotClass: string; textClass: string; bgClass: string }> = {
  INFO: {
    label: 'INFO',
    dotClass: 'bg-[var(--color-level-info)]',
    textClass: 'text-[var(--color-level-info)]',
    bgClass: 'bg-[var(--color-level-info-bg)]'
  },
  WARN: {
    label: 'WARN',
    dotClass: 'bg-[var(--color-level-warn)]',
    textClass: 'text-[var(--color-level-warn)]',
    bgClass: 'bg-[var(--color-level-warn-bg)]'
  },
  ERROR: {
    label: 'ERROR',
    dotClass: 'bg-[var(--color-level-error)]',
    textClass: 'text-[var(--color-level-error)]',
    bgClass: 'bg-[var(--color-level-error-bg)]'
  },
  DEBUG: {
    label: 'DEBUG',
    dotClass: 'bg-[var(--color-level-debug)]',
    textClass: 'text-[var(--color-level-debug)]',
    bgClass: 'bg-[var(--color-level-debug-bg)]'
  }
}

interface FilterState {
  levels: Set<LogLevel>
}

function SectionHeader({
  label,
  expanded,
  onToggle
}: {
  label: string
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-1 py-1.5 text-left"
      onClick={onToggle}
    >
      {expanded ? (
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      ) : (
        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
      )}
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
    </button>
  )
}

export function FilterSidebar() {
  const tab = useTabStore((s) => s.getActiveTab())
  const setQuery = useSearchStore((s) => s.setQuery)
  const runSearch = useSearchStore((s) => s.runSearch)
  const openSearch = useSearchStore((s) => s.open)

  const [filter, setFilter] = useState<FilterState>({
    levels: new Set(['INFO', 'WARN', 'ERROR', 'DEBUG'])
  })
  const [levelsExpanded, setLevelsExpanded] = useState(true)
  const [timeExpanded, setTimeExpanded] = useState(true)
  const [quickExpanded, setQuickExpanded] = useState(true)
  const [activeQuickFilter, setActiveQuickFilter] = useState<string | null>(null)

  const levelCounts = useMemo(() => {
    const counts: Record<LogLevel, number> = { INFO: 0, WARN: 0, ERROR: 0, DEBUG: 0 }
    if (!tab) return counts
    for (const [, text] of tab.lineCache) {
      const level = classifyLevel(text)
      if (level) counts[level]++
    }
    return counts
  }, [tab, tab?.lineCache.size])

  const totalCached = useMemo(() => {
    if (!tab) return 0
    return (Object.values(levelCounts) as number[]).reduce((a, b) => a + b, 0)
  }, [levelCounts, tab])

  const toggleLevel = (level: LogLevel) => {
    const next = new Set(filter.levels)
    if (next.has(level)) {
      if (next.size === 1) return
      next.delete(level)
    } else {
      next.add(level)
    }
    setFilter({ ...filter, levels: next })
  }

  const applyQuickFilter = (term: string | null) => {
    const next = term === activeQuickFilter ? null : term
    setActiveQuickFilter(next)
    if (next) {
      setQuery(next)
      void runSearch()
      openSearch()
    }
  }

  const quickFilters = [
    { label: 'Errors only', term: 'ERROR' },
    { label: 'Warnings only', term: 'WARN' },
    { label: 'Hide Microsoft logs', term: '-Microsoft.' }
  ]

  return (
    <div className="flex h-full w-48 shrink-0 flex-col border-r border-border bg-card text-xs">
      {/* Sidebar header */}
      <div className="border-b border-border px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Filters
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1">
        {/* Levels section */}
        <SectionHeader
          label="Levels"
          expanded={levelsExpanded}
          onToggle={() => setLevelsExpanded((v) => !v)}
        />
        {levelsExpanded && (
          <div className="mb-2 space-y-0.5 pl-1">
            {(['INFO', 'WARN', 'ERROR', 'DEBUG'] as LogLevel[]).map((level) => {
              const meta = LEVEL_META[level]
              const count = levelCounts[level]
              const active = filter.levels.has(level)
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => toggleLevel(level)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1 text-left transition-colors',
                    active ? 'text-foreground' : 'text-muted-foreground opacity-50',
                    'hover:bg-accent'
                  )}
                >
                  <div className={cn('h-2 w-2 shrink-0 rounded-sm', meta.dotClass)} />
                  <span className="flex-1 font-medium">{meta.label}</span>
                  {count > 0 && (
                    <span
                      className={cn(
                        'rounded px-1 py-px text-[10px] tabular-nums',
                        meta.textClass,
                        meta.bgClass
                      )}
                    >
                      {count.toLocaleString()}
                    </span>
                  )}
                </button>
              )
            })}
            {totalCached > 0 && (
              <p className="px-2 pt-1 text-[10px] text-muted-foreground/60">
                ~{totalCached.toLocaleString()} indexed
              </p>
            )}
          </div>
        )}

        <div className="my-2 border-t border-border" />

        {/* Time range section */}
        <SectionHeader
          label="Time range"
          expanded={timeExpanded}
          onToggle={() => setTimeExpanded((v) => !v)}
        />
        {timeExpanded && (
          <div className="mb-2 pl-1">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 text-left">All time</span>
            </button>
          </div>
        )}

        <div className="my-2 border-t border-border" />

        {/* Quick filters */}
        <SectionHeader
          label="Quick filters"
          expanded={quickExpanded}
          onToggle={() => setQuickExpanded((v) => !v)}
        />
        {quickExpanded && (
          <div className="mb-2 space-y-0.5 pl-1">
            {quickFilters.map(({ label, term }) => {
              const isActive = activeQuickFilter === term
              return (
                <button
                  key={term}
                  type="button"
                  onClick={() => applyQuickFilter(term)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1 text-left transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <div
                    className={cn(
                      'h-3.5 w-3.5 shrink-0 rounded border transition-colors',
                      isActive ? 'border-primary bg-primary' : 'border-border'
                    )}
                  >
                    {isActive && (
                      <svg viewBox="0 0 12 12" className="h-full w-full p-0.5 text-white">
                        <path
                          d="M2 6l3 3 5-5"
                          stroke="currentColor"
                          strokeWidth="2"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>
                  {label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Bottom: search shortcut hint */}
      <div className="border-t border-border px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
          <Search className="h-3 w-3" />
          <span>Ctrl+F to search</span>
        </div>
      </div>
    </div>
  )
}
