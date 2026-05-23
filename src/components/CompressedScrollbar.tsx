import { useCallback, useRef } from 'react'
import {
  compressScrollPosition,
  decompressScrollPosition,
  getVirtualTotalSize
} from '@/lib/utils'

interface CompressedScrollbarProps {
  scrollTop: number
  clientHeight: number
  lineCount: number
  rowHeight: number
  onScrollTo: (scrollTop: number) => void
}

const MIN_THUMB = 24

export function CompressedScrollbar({
  scrollTop,
  clientHeight,
  lineCount,
  rowHeight,
  onScrollTo
}: CompressedScrollbarProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const totalSize = getVirtualTotalSize(lineCount, rowHeight)
  const trackHeight = clientHeight
  const thumbHeight = Math.max(MIN_THUMB, (clientHeight / totalSize) * trackHeight)
  const maxThumbTop = trackHeight - thumbHeight
  const thumbTop = totalSize <= clientHeight ? 0 : (scrollTop / (totalSize - clientHeight)) * maxThumbTop

  const scrollFromThumb = useCallback(
    (clientY: number) => {
      const track = trackRef.current
      if (!track) return
      const rect = track.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientY - rect.top - thumbHeight / 2) / maxThumbTop))
      const newScrollTop = ratio * (totalSize - clientHeight)
      onScrollTo(newScrollTop)
    },
    [clientHeight, maxThumbTop, onScrollTo, thumbHeight, totalSize]
  )

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true

    const onMove = (ev: MouseEvent) => scrollFromThumb(ev.clientY)
    const onUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    scrollFromThumb(e.clientY)
  }

  const onTrackClick = (e: React.MouseEvent) => {
    if (e.target !== trackRef.current) return
    scrollFromThumb(e.clientY)
  }

  const currentLine = decompressScrollPosition(scrollTop, lineCount, rowHeight)

  return (
    <div
      ref={trackRef}
      className="relative w-3 shrink-0 cursor-pointer border-l border-border bg-muted/30"
      style={{ height: trackHeight }}
      onClick={onTrackClick}
      title={`Line ${currentLine + 1} of ${lineCount.toLocaleString()}`}
    >
      <div
        className="absolute left-0.5 right-0.5 rounded bg-muted-foreground/40 hover:bg-muted-foreground/60"
        style={{ height: thumbHeight, top: thumbTop }}
        onMouseDown={onMouseDown}
      />
    </div>
  )
}

export { compressScrollPosition, decompressScrollPosition }
