import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { IPC_INVOKE } from '@shared/ipc'
import { CompressedScrollbar } from '@/components/CompressedScrollbar'
import { LogLine } from '@/components/LogLine'
import { Minimap } from '@/components/Minimap'
import { SearchResultsPanel } from '@/components/SearchResultsPanel'
import { useHighlightLines } from '@/hooks/useHighlightLines'
import { mergeHighlightSegments, useSearchHighlightSegments } from '@/hooks/useSearchHighlights'
import { useSearchStore } from '@/stores/searchStore'
import { useTabStore } from '@/stores/tabStore'
import {
  getEffectiveRowHeight,
  getVirtualTotalSize,
  isCompressedScroll
} from '@/lib/utils'

interface LogViewportProps {
  tabId: string
}

const OVERSCAN = 20

export function LogViewport({ tabId }: LogViewportProps) {
  const tab = useTabStore((s) => s.tabs.find((t) => t.id === tabId))
  const cacheLines = useTabStore((s) => s.cacheLines)
  const setFollowPinned = useTabStore((s) => s.setFollowPinned)
  const consumeScrollTarget = useTabStore((s) => s.consumeScrollTarget)
  const scrollToLine = useTabStore((s) => s.scrollToLine)
  const settings = useTabStore((s) => s.settings)

  const searchMatches = useSearchStore((s) => s.matches)
  const getCurrentMatch = useSearchStore((s) => s.getCurrentMatch)

  const parentRef = useRef<HTMLDivElement>(null)
  const followPinnedRef = useRef(tab?.followPinned ?? true)
  const loadingRef = useRef(new Set<number>())
  const heightCacheRef = useRef(new Map<number, number>())
  const [fetchTick, setFetchTick] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [clientHeight, setClientHeight] = useState(0)
  const [highlightColumn, setHighlightColumn] = useState<number | null>(null)
  const [highlightLine, setHighlightLine] = useState<number | null>(null)

  const fontSize = settings?.fontSize ?? 13
  const fontFamily = settings?.fontFamily ?? 'monospace'
  const baseRowHeight = Math.round(fontSize * (settings?.lineHeight ?? 1.4))
  const wordWrap = settings?.wordWrap ?? false
  const tabWidth = settings?.tabWidth ?? 4
  const lineCount = tab?.lineCount ?? 0
  const compressed = isCompressedScroll(lineCount)
  const effectiveRowHeight = getEffectiveRowHeight(lineCount, baseRowHeight)

  followPinnedRef.current = tab?.followPinned ?? true

  const virtualizer = useVirtualizer({
    count: Math.max(lineCount, 1),
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      if (wordWrap) return heightCacheRef.current.get(index) ?? baseRowHeight * 2
      return effectiveRowHeight
    },
    overscan: OVERSCAN,
    getItemKey: (index) => index,
    measureElement: wordWrap
      ? (el) => el.getBoundingClientRect().height
      : undefined
  })

  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = getVirtualTotalSize(lineCount, baseRowHeight)

  const visibleLines = virtualItems
    .map((vi) => {
      const text = tab?.lineCache.get(vi.index)
      return text !== undefined ? { lineNumber: vi.index, text } : null
    })
    .filter((l): l is { lineNumber: number; text: string } => l !== null)

  const highlightSegments = useHighlightLines(visibleLines, settings?.highlightRules ?? [])

  const currentMatch = getCurrentMatch()
  const searchHighlightSegments = useSearchHighlightSegments(
    virtualItems.map((vi) => vi.index),
    searchMatches,
    currentMatch
  )

  useEffect(() => {
    heightCacheRef.current.clear()
    virtualizer.measure()
  }, [wordWrap, fontSize, settings?.lineHeight, virtualizer])

  useEffect(() => {
    const target = consumeScrollTarget(tabId)
    if (target !== null) {
      virtualizer.scrollToIndex(target.line, { align: 'center' })
      setHighlightColumn(target.column)
      setHighlightLine(target.line)
    }
  }, [tab?.scrollTargetLine, tabId, consumeScrollTarget, virtualizer])

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
    setScrollTop(el.scrollTop)
    setClientHeight(el.clientHeight)

    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < effectiveRowHeight * 2

    if (atBottom && !followPinnedRef.current) {
      setFollowPinned(tabId, true)
    } else if (!atBottom && followPinnedRef.current) {
      setFollowPinned(tabId, false)
    }
  }, [tab, tabId, effectiveRowHeight, setFollowPinned])

  useEffect(() => {
    const el = parentRef.current
    if (!el) return
    setClientHeight(el.clientHeight)
    const ro = new ResizeObserver(() => setClientHeight(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const handleMeasuredHeight = useCallback(
    (lineNumber: number, height: number) => {
      const prev = heightCacheRef.current.get(lineNumber)
      if (prev === height) return
      heightCacheRef.current.set(lineNumber, height)
      virtualizer.resizeItem(lineNumber, height)
    },
    [virtualizer]
  )

  const handleScrollbarScroll = useCallback(
    (newScrollTop: number) => {
      if (parentRef.current) {
        parentRef.current.scrollTop = newScrollTop
        handleScroll()
      }
    },
    [handleScroll]
  )

  const handleMinimapJump = useCallback(
    (lineNumber: number) => {
      scrollToLine(tabId, lineNumber)
      setFollowPinned(tabId, false)
    },
    [scrollToLine, setFollowPinned, tabId]
  )

  const showCompressedScrollbar = useMemo(
    () => compressed && clientHeight > 0,
    [compressed, clientHeight]
  )

  if (!tab) return null

  return (
    <div className="flex h-full">
      <div className="relative min-w-0 flex-1">
        <SearchResultsPanel />
        <div
          ref={parentRef}
          className="h-full overflow-auto bg-background"
          onScroll={handleScroll}
        >
          <div style={{ height: totalSize, width: '100%', position: 'relative' }}>
            {virtualItems.map((vi) => {
              const text = tab.lineCache.get(vi.index) ?? ''
              const ruleSegments = highlightSegments.get(vi.index) ?? []
              const searchSegments = searchHighlightSegments.get(vi.index) ?? []
              const segments = mergeHighlightSegments(ruleSegments, searchSegments)
              const isCurrentMatchLine = currentMatch?.lineNumber === vi.index
              const colHighlight =
                highlightLine === vi.index ? highlightColumn : null

              return (
                <div
                  key={vi.key}
                  data-index={vi.index}
                  ref={wordWrap ? virtualizer.measureElement : undefined}
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
                    rowHeight={baseRowHeight}
                    fontSize={fontSize}
                    fontFamily={fontFamily}
                    segments={segments}
                    isCurrentMatchLine={isCurrentMatchLine}
                    wordWrap={wordWrap}
                    tabWidth={tabWidth}
                    highlightColumn={colHighlight}
                    onMeasuredHeight={wordWrap ? handleMeasuredHeight : undefined}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <Minimap
        tabId={tabId}
        scrollTop={scrollTop}
        clientHeight={clientHeight}
        rowHeight={baseRowHeight}
        onScrollToLine={handleMinimapJump}
      />

      {showCompressedScrollbar && (
        <CompressedScrollbar
          scrollTop={scrollTop}
          clientHeight={clientHeight}
          lineCount={lineCount}
          rowHeight={baseRowHeight}
          onScrollTo={handleScrollbarScroll}
        />
      )}
    </div>
  )
}
