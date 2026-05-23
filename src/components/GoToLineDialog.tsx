import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useGoToLineStore } from '@/stores/goToLineStore'
import { useTabStore } from '@/stores/tabStore'

export function GoToLineDialog() {
  const isOpen = useGoToLineStore((s) => s.isOpen)
  const lineInput = useGoToLineStore((s) => s.lineInput)
  const setLineInput = useGoToLineStore((s) => s.setLineInput)
  const submit = useGoToLineStore((s) => s.submit)
  const close = useGoToLineStore((s) => s.close)
  const tab = useTabStore((s) => s.getActiveTab())

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  const maxLine = tab?.lineCount ?? 1

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
        <span className="text-sm text-muted-foreground">Go to line:</span>
        <input
          ref={inputRef}
          type="number"
          min={1}
          max={maxLine}
          value={lineInput}
          onChange={(e) => setLineInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`1–${maxLine}`}
          className="w-24 bg-transparent text-sm outline-none tabular-nums"
        />
        <Button size="sm" onClick={submit}>
          Go
        </Button>
        <Button variant="ghost" size="sm" onClick={close}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
