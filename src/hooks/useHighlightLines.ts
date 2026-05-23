import { useCallback, useEffect, useRef, useState } from 'react'
import type { HighlightRule, HighlightSegment } from '@shared/types'

interface HighlightWorkerRequest {
  id: number
  lines: { lineNumber: number; text: string }[]
  rules: HighlightRule[]
}

interface HighlightWorkerResponse {
  id: number
  results: { lineNumber: number; text: string; segments: HighlightSegment[] }[]
}

let worker: Worker | null = null
let requestId = 0
const pending = new Map<number, (results: HighlightWorkerResponse['results']) => void>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../../workers/highlight.worker.ts', import.meta.url), {
      type: 'module'
    })
    worker.onmessage = (e: MessageEvent<HighlightWorkerResponse>) => {
      const cb = pending.get(e.data.id)
      if (cb) {
        pending.delete(e.data.id)
        cb(e.data.results)
      }
    }
  }
  return worker
}

export function useHighlightLines(
  lines: { lineNumber: number; text: string }[],
  rules: HighlightRule[]
): Map<number, HighlightSegment[]> {
  const [segments, setSegments] = useState<Map<number, HighlightSegment[]>>(new Map())
  const rulesRef = useRef(rules)
  rulesRef.current = rules

  const highlight = useCallback(async () => {
    if (lines.length === 0) {
      setSegments(new Map())
      return
    }

    const id = ++requestId
    const w = getWorker()

    return new Promise<void>((resolve) => {
      pending.set(id, (results) => {
        const map = new Map<number, HighlightSegment[]>()
        for (const r of results) {
          map.set(r.lineNumber, r.segments)
        }
        setSegments(map)
        resolve()
      })

      w.postMessage({
        id,
        lines,
        rules: rulesRef.current
      } satisfies HighlightWorkerRequest)
    })
  }, [lines, rules])

  useEffect(() => {
    void highlight()
  }, [highlight])

  return segments
}
