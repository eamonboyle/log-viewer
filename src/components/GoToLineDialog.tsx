import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useGoToLineStore } from '@/stores/goToLineStore'
import { useTabStore } from '@/stores/tabStore'

export function GoToLineDialog() {
  const isOpen = useGoToLineStore((s) => s.isOpen)
  const lineInput = useGoToLineStore((s) => s.lineInput)
  const columnInput = useGoToLineStore((s) => s.columnInput)
  const setLineInput = useGoToLineStore((s) => s.setLineInput)
  const setColumnInput = useGoToLineStore((s) => s.setColumnInput)
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
        <span className="text-sm text-muted-foreground">Go to:</span>
        <input
          ref={inputRef}
          type="text"
          value={lineInput}
          onChange={(e) => setLineInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`line or line:col (1–${maxLine})`}
          className="w-40 bg-transparent text-sm outline-none tabular-nums"
          spellCheck={false}
        />
        <span className="text-sm text-muted-foreground">:</span>
        <input
          type="text"
          value={columnInput}
          onChange={(e) => setColumnInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="col"
          className="w-16 bg-transparent text-sm outline-none tabular-nums"
          spellCheck={false}
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
