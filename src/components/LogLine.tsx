import { memo, useEffect, useRef } from 'react'
import type { HighlightSegment } from '@shared/types'
import { expandTabs } from '@/lib/text'
import { cn } from '@/lib/utils'

interface LogLineProps {
  lineNumber: number
  text: string
  rowHeight: number
  fontSize: number
  fontFamily: string
  segments?: HighlightSegment[]
  isCurrentMatchLine?: boolean
  wordWrap?: boolean
  tabWidth?: number
  highlightColumn?: number | null
  onMeasuredHeight?: (lineNumber: number, height: number) => void
}

function renderSegments(text: string, segments: HighlightSegment[]): React.ReactNode {
  if (!segments.length) return text

  const parts: React.ReactNode[] = []
  let last = 0

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.start > last) {
      parts.push(<span key={`t-${i}`}>{text.slice(last, seg.start)}</span>)
    }
    parts.push(
      <span key={`h-${i}`} style={seg.style}>
        {text.slice(seg.start, seg.end)}
      </span>
    )
    last = seg.end
  }

  if (last < text.length) {
    parts.push(<span key="tail">{text.slice(last)}</span>)
  }

  return parts
}

export const LogLine = memo(function LogLine({
  lineNumber,
  text,
  rowHeight,
  fontSize,
  fontFamily,
  segments = [],
  isCurrentMatchLine = false,
  wordWrap = false,
  tabWidth = 4,
  highlightColumn = null,
  onMeasuredHeight
}: LogLineProps) {
  const ref = useRef<HTMLDivElement>(null)
  const displayText = expandTabs(text, tabWidth)

  useEffect(() => {
    if (!wordWrap || !onMeasuredHeight || !ref.current) return
    const height = ref.current.getBoundingClientRect().height
    if (height > 0) onMeasuredHeight(lineNumber, height)
  }, [displayText, wordWrap, lineNumber, onMeasuredHeight, rowHeight])

  const columnMarker =
    highlightColumn !== null && highlightColumn >= 0 && highlightColumn < displayText.length ? (
      <span
        className="pointer-events-none absolute bg-primary/20"
        style={{
          left: `${64 + highlightColumn * (fontSize * 0.6)}px`,
          width: `${fontSize * 0.6}px`,
          top: 0,
          bottom: 0
        }}
      />
    ) : null

  return (
    <div
      ref={ref}
      className={cn(
        'relative flex w-full items-start border-b border-border/30 px-2 hover:bg-accent/30',
        isCurrentMatchLine && 'bg-accent/50'
      )}
      style={{
        minHeight: rowHeight,
        fontSize,
        fontFamily,
        lineHeight: wordWrap ? 1.4 : `${rowHeight}px`
      }}
    >
      {columnMarker}
      <span className="mr-3 w-16 shrink-0 select-none text-right text-muted-foreground tabular-nums">
        {lineNumber + 1}
      </span>
      <span
        className={cn(
          'min-w-0 flex-1',
          wordWrap ? 'whitespace-pre-wrap break-all' : 'truncate whitespace-pre'
        )}
      >
        {segments.length > 0 ? renderSegments(displayText, segments) : displayText || ' '}
      </span>
    </div>
  )
})
