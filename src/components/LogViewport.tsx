import { useCallback, useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { IPC_INVOKE } from '@shared/ipc'
import { LogLine } from '@/components/LogLine'
import { useHighlightLines } from '@/hooks/useHighlightLines'
import { useTabStore } from '@/stores/tabStore'
import { getVirtualTotalSize } from '@/lib/utils'

interface LogViewportProps {
  tabId: string
}

const OVERSCAN = 20

export function LogViewport({ tabId }: LogViewportProps) {
  const tab = useTabStore((s) => s.tabs.find((t) => t.id === tabId))
  const cacheLines = useTabStore((s) => s.cacheLines)
  const setFollowPinned = useTabStore((s) => s.setFollowPinned)
  const settings = useTabStore((s) => s.settings)

  const parentRef = useRef<HTMLDivElement>(null)
  const followPinnedRef = useRef(tab?.followPinned ?? true)
  const loadingRef = useRef(new Set<number>())
  const [fetchTick, setFetchTick] = useState(0)

  const fontSize = settings?.fontSize ?? 13
  const fontFamily = settings?.fontFamily ?? 'monospace'
  const rowHeight = Math.round(fontSize * (settings?.lineHeight ?? 1.4))
  const lineCount = tab?.lineCount ?? 0

  followPinnedRef.current = tab?.followPinned ?? true

  const virtualizer = useVirtualizer({
    count: Math.max(lineCount, 1),
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: OVERSCAN,
    getItemKey: (index) => index
  })

  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = getVirtualTotalSize(lineCount, rowHeight)

  const visibleLines = virtualItems
    .map((vi) => {
      const text = tab?.lineCache.get(vi.index)
      return text !== undefined ? { lineNumber: vi.index, text } : null
    })
    .filter((l): l is { lineNumber: number; text: string } => l !== null)

  const highlightSegments = useHighlightLines(visibleLines, settings?.highlightRules ?? [])

  const fetchLines = useCallback(
    async (startLine: number, count: number) => {
      if (!tab) return
      const key = startLine
      if (loadingRef.current.has(key)) return
      loadingRef.current.add(key)

      try {
        const batch = await window.logViewer.invoke(
          IPC_INVOKE.VIEWPORT_READ_LINES,
          tab.sessionId,
          startLine,
          count
        )
        cacheLines(tabId, batch.lines)
        setFetchTick((t) => t + 1)
      } finally {
        loadingRef.current.delete(key)
      }
    },
    [tab, tabId, cacheLines]
  )

  useEffect(() => {
    if (!tab || virtualItems.length === 0) return
    const first = virtualItems[0].index
    const last = virtualItems[virtualItems.length - 1].index
    const missing: number[] = []

    for (let i = first; i <= last; i++) {
      if (!tab.lineCache.has(i)) missing.push(i)
    }

    if (missing.length > 0) {
      const start = missing[0]
      const count = missing[missing.length - 1] - start + 1
      void fetchLines(start, count)
    }
  }, [tab, virtualItems, fetchLines, fetchTick])

  useEffect(() => {
    if (!tab?.followPinned || lineCount === 0) return
    virtualizer.scrollToIndex(lineCount - 1, { align: 'end' })
  }, [tab?.followPinned, lineCount, tab?.lineCache.size, virtualizer])

  const handleScroll = useCallback(() => {
    if (!parentRef.current || !tab) return
    const el = parentRef.current
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < rowHeight * 2

    if (atBottom && !followPinnedRef.current) {
      setFollowPinned(tabId, true)
    } else if (!atBottom && followPinnedRef.current) {
      setFollowPinned(tabId, false)
    }
  }, [tab, tabId, rowHeight, setFollowPinned])

  if (!tab) return null

  return (
    <div
      ref={parentRef}
      className="h-full overflow-auto bg-background"
      onScroll={handleScroll}
    >
      <div style={{ height: totalSize, width: '100%', position: 'relative' }}>
        {virtualItems.map((vi) => {
          const text = tab.lineCache.get(vi.index) ?? ''
          const segments = highlightSegments.get(vi.index) ?? []

          return (
            <div
              key={vi.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vi.start}px)`
              }}
            >
              <LogLine
                lineNumber={vi.index}
                text={text}
                rowHeight={rowHeight}
                fontSize={fontSize}
                fontFamily={fontFamily}
                segments={segments}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
