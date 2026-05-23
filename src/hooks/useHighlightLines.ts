import { useEffect, useRef, useState } from 'react'
import type { HighlightRule, HighlightSegment } from '@shared/types'
import { filterRulesForPath } from '@/lib/glob'

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

function linesSignature(lines: { lineNumber: number; text: string }[]): string {
  return lines.map((l) => `${l.lineNumber}:${l.text.length}:${l.text.slice(0, 32)}`).join('|')
}

export function useHighlightLines(
  lines: { lineNumber: number; text: string }[],
  rules: HighlightRule[],
  filePath?: string
): Map<number, HighlightSegment[]> {
  const [segments, setSegments] = useState<Map<number, HighlightSegment[]>>(new Map())
  const rulesRef = useRef(rules)
  const filePathRef = useRef(filePath)
  const lastSignatureRef = useRef('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  rulesRef.current = rules
  filePathRef.current = filePath

  useEffect(() => {
    const signature = linesSignature(lines)
    if (signature === lastSignatureRef.current) return
    lastSignatureRef.current = signature

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (lines.length === 0) {
      setSegments(new Map())
      return
    }

    debounceRef.current = setTimeout(() => {
      const applicableRules = filterRulesForPath(rulesRef.current, filePathRef.current)
      const id = ++requestId
      const w = getWorker()

      pending.set(id, (results) => {
        setSegments((prev) => {
          const next = new Map(prev)
          for (const r of results) {
            next.set(r.lineNumber, r.segments)
          }
          return next
        })
      })

      w.postMessage({
        id,
        lines,
        rules: applicableRules
      } satisfies HighlightWorkerRequest)
    }, 32)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [lines, rules, filePath])

  return segments
}
