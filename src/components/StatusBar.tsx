import { Badge } from '@/components/ui/badge'
import { useTabStore } from '@/stores/tabStore'
import { formatBytes, formatLineCount } from '@/lib/utils'

export function StatusBar() {
  const tab = useTabStore((s) => s.getActiveTab())

  if (!tab) {
    return (
      <div className="flex h-7 shrink-0 items-center border-t border-border bg-card px-3 text-xs text-muted-foreground">
        No file open — Ctrl+O to open a log file
      </div>
    )
  }

  return (
    <div className="flex h-7 shrink-0 items-center gap-3 border-t border-border bg-card px-3 text-xs text-muted-foreground">
      <span className="truncate max-w-[40%]" title={tab.path}>
        {tab.path}
      </span>
      <span className="shrink-0">{formatBytes(tab.fileSize)}</span>
      <span className="shrink-0">{formatLineCount(tab.lineCount)} lines</span>
      {!tab.indexComplete && (
        <span className="shrink-0 text-amber-400">Indexing {tab.indexPercent.toFixed(0)}%</span>
      )}
      {tab.followPinned ? (
        <Badge variant="live" className="shrink-0">
          ● Live
        </Badge>
      ) : tab.hasUnread ? (
        <Badge variant="secondary" className="shrink-0 text-emerald-400">
          New lines
        </Badge>
      ) : (
        <span className="shrink-0">Paused</span>
      )}
      {tab.error && <span className="truncate text-red-400">{tab.error}</span>}
    </div>
  )
}
