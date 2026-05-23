import { useMemo, useState } from 'react'
import { Search, Calendar, ChevronRight, ChevronDown } from 'lucide-react'
import { ALL_LEVELS, classifyLevel, type LogLevel, type QuickFilter } from '@/lib/logFilter'
import { useFilterStore } from '@/stores/filterStore'
import { useTabStore } from '@/stores/tabStore'
import { cn } from '@/lib/utils'

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

const QUICK_FILTERS: { label: string; id: QuickFilter }[] = [
  { label: 'Errors only', id: 'errors-only' },
  { label: 'Warnings only', id: 'warnings-only' },
  { label: 'Hide Microsoft logs', id: 'hide-microsoft' }
]

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
  const filter = useFilterStore((s) => (tab ? s.getFilter(tab.id) : null))
  const filterIndex = useFilterStore((s) => (tab ? s.getIndex(tab.id) : null))
  const toggleLevel = useFilterStore((s) => s.toggleLevel)
  const setQuickFilter = useFilterStore((s) => s.setQuickFilter)

  const [levelsExpanded, setLevelsExpanded] = useState(true)
  const [timeExpanded, setTimeExpanded] = useState(true)
  const [quickExpanded, setQuickExpanded] = useState(true)

  const activeLevels = useMemo(() => {
    if (!filter) return new Set(ALL_LEVELS)
    if (filter.quickFilter === 'errors-only') return new Set<LogLevel>(['ERROR'])
    if (filter.quickFilter === 'warnings-only') return new Set<LogLevel>(['WARN'])
    return new Set(filter.levels)
  }, [filter])

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
    return (Object.values(levelCounts) as number[]).reduce((a, b) => a + b, 0)
  }, [levelCounts])

  if (!tab || !filter) {
    return (
      <div className="flex h-full w-48 shrink-0 flex-col border-r border-border bg-card text-xs">
        <div className="border-b border-border px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Filters
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-48 shrink-0 flex-col border-r border-border bg-card text-xs">
      <div className="border-b border-border px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Filters
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1">
        <SectionHeader
          label="Levels"
          expanded={levelsExpanded}
          onToggle={() => setLevelsExpanded((v) => !v)}
        />
        {levelsExpanded && (
          <div className="mb-2 space-y-0.5 pl-1">
            {ALL_LEVELS.map((level) => {
              const meta = LEVEL_META[level]
              const count = levelCounts[level]
              const active = activeLevels.has(level)
              const presetLocked =
                filter.quickFilter === 'errors-only' || filter.quickFilter === 'warnings-only'
              return (
                <button
                  key={level}
                  type="button"
                  disabled={presetLocked}
                  onClick={() => toggleLevel(tab.id, level)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1 text-left transition-colors',
                    active ? 'text-foreground' : 'text-muted-foreground opacity-50',
                    presetLocked ? 'cursor-default opacity-70' : 'hover:bg-accent'
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
            {filterIndex?.isScanning ? (
              <p className="px-2 pt-1 text-[10px] text-amber-400/80">
                Filtering… {(filterIndex.scanProgress * 100).toFixed(0)}%
              </p>
            ) : filterIndex?.visibleLines ? (
              <p className="px-2 pt-1 text-[10px] text-muted-foreground/60">
                {filterIndex.visibleLines.length.toLocaleString()} matching lines
              </p>
            ) : totalCached > 0 ? (
              <p className="px-2 pt-1 text-[10px] text-muted-foreground/60">
                ~{totalCached.toLocaleString()} indexed in view
              </p>
            ) : null}
          </div>
        )}

        <div className="my-2 border-t border-border" />

        <SectionHeader
          label="Time range"
          expanded={timeExpanded}
          onToggle={() => setTimeExpanded((v) => !v)}
        />
        {timeExpanded && (
          <div className="mb-2 pl-1">
            <button
              type="button"
              disabled
              className="flex w-full cursor-default items-center gap-2 rounded px-2 py-1 text-muted-foreground/60"
              title="Time range filtering coming soon"
            >
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 text-left">All time</span>
            </button>
          </div>
        )}

        <div className="my-2 border-t border-border" />

        <SectionHeader
          label="Quick filters"
          expanded={quickExpanded}
          onToggle={() => setQuickExpanded((v) => !v)}
        />
        {quickExpanded && (
          <div className="mb-2 space-y-0.5 pl-1">
            {QUICK_FILTERS.map(({ label, id }) => {
              const isActive = filter.quickFilter === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setQuickFilter(tab.id, id)}
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

      <div className="border-t border-border px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
          <Search className="h-3 w-3" />
          <span>Ctrl+F to search</span>
        </div>
      </div>
    </div>
  )
}
