import { useEffect, useState } from 'react'
import { IPC_INVOKE } from '@shared/ipc'
import type { MinimapSample } from '@shared/types'
import { cn, decompressScrollPosition } from '@/lib/utils'
import { useTabStore } from '@/stores/tabStore'

interface MinimapProps {
  tabId: string
  scrollTop: number
  clientHeight: number
  rowHeight: number
  onScrollToLine: (lineNumber: number) => void
}

const SAMPLE_COUNT = 200

export function Minimap({ tabId, scrollTop, clientHeight, rowHeight, onScrollToLine }: MinimapProps) {
  const tab = useTabStore((s) => s.tabs.find((t) => t.id === tabId))
  const [samples, setSamples] = useState<MinimapSample[]>([])

  useEffect(() => {
    if (!tab) return
    let cancelled = false

    void window.logViewer
      .invoke(IPC_INVOKE.MINIMAP_SAMPLES, tab.sessionId, SAMPLE_COUNT)
      .then((result) => {
        if (!cancelled) setSamples(result)
      })

    return () => {
      cancelled = true
    }
  }, [tab?.sessionId, tab?.lineCount, tab?.indexComplete])

  if (!tab || tab.lineCount === 0) return null

  const lineCount = tab.lineCount
  const viewportStart = decompressScrollPosition(scrollTop, lineCount, rowHeight)
  const viewportEnd = decompressScrollPosition(scrollTop + clientHeight, lineCount, rowHeight)
  const viewportRatioStart = viewportStart / lineCount
  const viewportRatioEnd = Math.min(1, viewportEnd / lineCount)

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientY - rect.top) / rect.height
    const line = Math.floor(ratio * lineCount)
    onScrollToLine(Math.max(0, Math.min(line, lineCount - 1)))
  }

  return (
    <div
      className="relative w-14 shrink-0 cursor-pointer border-l border-border bg-card/80"
      onClick={handleClick}
      title="Minimap — click to jump"
    >
      <div className="absolute inset-x-0 top-0 bottom-0 flex flex-col">
        {samples.map((sample) => {
          const top = (sample.lineNumber / lineCount) * 100
          return (
            <div
              key={sample.lineNumber}
              className={cn(
                'absolute left-0 right-0 h-px',
                sample.kind === 'error' && 'bg-red-500/80',
                sample.kind === 'warn' && 'bg-amber-400/80',
                sample.kind === 'normal' && 'bg-muted-foreground/15'
              )}
              style={{ top: `${top}%` }}
            />
          )
        })}
      </div>
      <div
        className="pointer-events-none absolute inset-x-0 border border-primary/50 bg-primary/10"
        style={{
          top: `${viewportRatioStart * 100}%`,
          height: `${Math.max(2, (viewportRatioEnd - viewportRatioStart) * 100)}%`
        }}
      />
    </div>
  )
}
