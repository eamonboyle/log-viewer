import { useTabStore } from '@/stores/tabStore'
import { formatBytes, formatLineCount } from '@/lib/utils'
import { cn } from '@/lib/utils'

function Dot() {
  return <span className="text-border">·</span>
}

export function StatusBar() {
  const tab = useTabStore((s) => s.getActiveTab())

  if (!tab) {
    return (
      <div className="flex h-6 shrink-0 items-center border-t border-border bg-card px-3 text-[11px] text-muted-foreground/60">
        No file open — Ctrl+O to open
      </div>
    )
  }

  return (
    <div className="flex h-6 shrink-0 items-center gap-2 border-t border-border bg-card px-3 text-[11px] text-muted-foreground">
      {/* File path */}
      <span className="max-w-[35%] truncate opacity-70" title={tab.path}>
        {tab.path}
      </span>

      <Dot />
      <span className="tabular-nums">{formatLineCount(tab.lineCount)} lines</span>
      <Dot />
      <span className="tabular-nums">{formatBytes(tab.fileSize)}</span>

      {!tab.indexComplete && (
        <>
          <Dot />
          <span className="text-amber-400/80">Indexing {tab.indexPercent.toFixed(0)}%</span>
        </>
      )}

      {/* Live / paused status */}
      <div className="ml-auto flex items-center">
        {tab.followPinned ? (
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live
          </span>
        ) : tab.hasUnread ? (
          <span className={cn('flex items-center gap-1.5 text-emerald-400/70')}>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" />
            New lines
          </span>
        ) : (
          <span className="opacity-50">Paused</span>
        )}
      </div>

      {tab.error && (
        <span className="ml-2 max-w-[30%] truncate text-destructive" title={tab.error}>
          {tab.error}
        </span>
      )}
    </div>
  )
}
