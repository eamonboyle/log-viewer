import { useMemo } from 'react'
import type { HighlightSegment, SearchMatch } from '@shared/types'

const SEARCH_MATCH_STYLE = { backgroundColor: 'rgba(250, 204, 21, 0.35)' }
const SEARCH_CURRENT_STYLE = { backgroundColor: 'rgba(249, 115, 22, 0.55)' }

export function buildSearchSegments(
  lineNumber: number,
  matches: SearchMatch[],
  currentMatch: SearchMatch | null
): HighlightSegment[] {
  const lineMatches = matches.filter((m) => m.lineNumber === lineNumber)
  if (lineMatches.length === 0) return []

  return lineMatches.map((m) => {
    const isCurrent =
      currentMatch !== null &&
      currentMatch.lineNumber === m.lineNumber &&
      currentMatch.column === m.column &&
      currentMatch.length === m.length

    return {
      start: m.column,
      end: m.column + m.length,
      className: isCurrent ? 'search-current' : 'search-match',
      style: isCurrent ? SEARCH_CURRENT_STYLE : SEARCH_MATCH_STYLE
    }
  })
}

export function mergeHighlightSegments(
  ruleSegments: HighlightSegment[],
  searchSegments: HighlightSegment[]
): HighlightSegment[] {
  if (searchSegments.length === 0) return ruleSegments
  if (ruleSegments.length === 0) return searchSegments

  const combined = [...ruleSegments, ...searchSegments]
  combined.sort((a, b) => a.start - b.start || b.end - a.end)

  const merged: HighlightSegment[] = []
  for (const seg of combined) {
    const last = merged[merged.length - 1]
    if (last && seg.start < last.end) {
      if (seg.className.includes('search')) {
        merged[merged.length - 1] = seg
      }
      continue
    }
    merged.push(seg)
  }

  return merged
}

export function useSearchHighlightSegments(
  visibleLineNumbers: number[],
  matches: SearchMatch[],
  currentMatch: SearchMatch | null
): Map<number, HighlightSegment[]> {
  return useMemo(() => {
    const map = new Map<number, HighlightSegment[]>()
    for (const lineNumber of visibleLineNumbers) {
      const segs = buildSearchSegments(lineNumber, matches, currentMatch)
      if (segs.length > 0) map.set(lineNumber, segs)
    }
    return map
  }, [visibleLineNumbers, matches, currentMatch])
}
