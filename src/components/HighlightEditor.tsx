import { useState } from 'react'
import type { HighlightRule } from '@shared/types'
import { Button } from '@/components/ui/button'

interface HighlightEditorProps {
  rules: HighlightRule[]
  onSave: (rules: HighlightRule[]) => void
  onClose: () => void
}

export function HighlightEditor({ rules, onSave, onClose }: HighlightEditorProps) {
  const [localRules, setLocalRules] = useState<HighlightRule[]>(rules)

  const addRule = () => {
    setLocalRules([
      ...localRules,
      {
        id: crypto.randomUUID(),
        pattern: '',
        isRegex: false,
        caseSensitive: false,
        color: '#60a5fa'
      }
    ])
  }

  const updateRule = (id: string, patch: Partial<HighlightRule>) => {
    setLocalRules(localRules.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const removeRule = (id: string) => {
    setLocalRules(localRules.filter((r) => r.id !== id))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-4 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">Highlight Rules</h2>

        <div className="max-h-80 space-y-3 overflow-y-auto">
          {localRules.map((rule) => (
            <div key={rule.id} className="flex flex-wrap items-center gap-2 rounded border border-border p-2">
              <input
                className="min-w-[80px] flex-1 rounded border border-input bg-background px-2 py-1 text-sm"
                value={rule.filePattern ?? ''}
                placeholder="File glob (optional)"
                onChange={(e) => updateRule(rule.id, { filePattern: e.target.value || undefined })}
              />
              <input
                className="min-w-[120px] flex-1 rounded border border-input bg-background px-2 py-1 text-sm"
                value={rule.pattern}
                placeholder="Pattern"
                onChange={(e) => updateRule(rule.id, { pattern: e.target.value })}
              />
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={rule.isRegex}
                  onChange={(e) => updateRule(rule.id, { isRegex: e.target.checked })}
                />
                Regex
              </label>
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={rule.caseSensitive}
                  onChange={(e) => updateRule(rule.id, { caseSensitive: e.target.checked })}
                />
                Case
              </label>
              <input
                type="color"
                value={rule.color}
                className="h-8 w-10 cursor-pointer"
                onChange={(e) => updateRule(rule.id, { color: e.target.value })}
              />
              <Button variant="ghost" size="sm" onClick={() => removeRule(rule.id)}>
                Remove
              </Button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-between">
          <Button variant="outline" size="sm" onClick={addRule}>
            Add Rule
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => onSave(localRules)}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
