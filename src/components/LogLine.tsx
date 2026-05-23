import { memo } from 'react'
import type { HighlightSegment } from '@shared/types'
import { cn } from '@/lib/utils'

interface LogLineProps {
  lineNumber: number
  text: string
  rowHeight: number
  fontSize: number
  fontFamily: string
  segments?: HighlightSegment[]
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
  segments = []
}: LogLineProps) {
  return (
    <div
      className="flex w-full items-start border-b border-border/30 px-2 hover:bg-accent/30"
      style={{ height: rowHeight, fontSize, fontFamily, lineHeight: `${rowHeight}px` }}
    >
      <span className="mr-3 w-16 shrink-0 select-none text-right text-muted-foreground tabular-nums">
        {lineNumber + 1}
      </span>
      <span className={cn('min-w-0 flex-1 truncate whitespace-pre')}>
        {segments.length > 0 ? renderSegments(text, segments) : text || ' '}
      </span>
    </div>
  )
})
