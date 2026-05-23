import { useCallback, useEffect, useRef, useState } from 'react'
import { IPC_INVOKE } from '@shared/ipc'
import type { MinimapSample } from '@shared/types'
import { cn } from '@/lib/utils'
import { useTabStore } from '@/stores/tabStore'

interface MinimapProps {
  tabId: string
  scrollTop: number
  clientHeight: number
  scrollHeight: number
  onScrollTo: (scrollTop: number) => void
}

const SAMPLE_COUNT = 200

function scrollTopFromClientY(
  clientY: number,
  rect: DOMRect,
  scrollHeight: number,
  clientHeight: number
): number {
  const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
  const maxScroll = Math.max(0, scrollHeight - clientHeight)
  const centered = ratio * scrollHeight - clientHeight / 2
  return Math.max(0, Math.min(maxScroll, centered))
}

export function Minimap({
  tabId,
  scrollTop,
  clientHeight,
  scrollHeight,
  onScrollTo
}: MinimapProps) {
  const tab = useTabStore((s) => s.tabs.find((t) => t.id === tabId))
  const [samples, setSamples] = useState<MinimapSample[]>([])
  const [dragging, setDragging] = useState(false)
  const minimapRef = useRef<HTMLDivElement>(null)
  const onScrollToRef = useRef(onScrollTo)
  onScrollToRef.current = onScrollTo

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

  const scrollFromClientY = useCallback(
    (clientY: number) => {
      const el = minimapRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      onScrollToRef.current(scrollTopFromClientY(clientY, rect, scrollHeight, clientHeight))
    },
    [scrollHeight, clientHeight]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragging(true)
      scrollFromClientY(e.clientY)
    },
    [scrollFromClientY]
  )

  useEffect(() => {
    if (!dragging) return

    const handleMove = (e: MouseEvent) => {
      scrollFromClientY(e.clientY)
    }

    const handleUp = () => {
      setDragging(false)
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    return () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
  }, [dragging, scrollFromClientY])

  if (!tab || tab.lineCount === 0) return null

  const lineCount = tab.lineCount
  const totalHeight = Math.max(1, scrollHeight)
  const viewportRatioStart = scrollTop / totalHeight
  const viewportRatioEnd = Math.min(1, (scrollTop + clientHeight) / totalHeight)

  return (
    <div
      ref={minimapRef}
      className={cn(
        'relative w-14 shrink-0 select-none border-l border-border bg-card/80',
        dragging ? 'cursor-grabbing' : 'cursor-pointer'
      )}
      onMouseDown={handleMouseDown}
      title="Minimap — click or drag to scroll"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 bottom-0 flex flex-col">
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
