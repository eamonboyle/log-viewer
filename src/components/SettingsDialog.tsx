import { useState } from 'react'
import { IPC_INVOKE } from '@shared/ipc'
import type { AppSettings, EncodingOverride, SettingsExportPayload, ThemeMode } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useTabStore } from '@/stores/tabStore'

interface SettingsDialogProps {
  onClose: () => void
}

export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const settings = useTabStore((s) => s.settings)
  const loadSettings = useTabStore((s) => s.loadSettings)
  const applyTheme = useTabStore((s) => s.applyTheme)
  const [local, setLocal] = useState<AppSettings | null>(settings)
  const [message, setMessage] = useState<string | null>(null)

  if (!local) return null

  const save = async (partial: Partial<AppSettings>) => {
    const next = { ...local, ...partial }
    setLocal(next)
    await window.logViewer.invoke(IPC_INVOKE.SETTINGS_SET, partial)
    if (partial.theme) applyTheme(partial.theme)
    await loadSettings()
    setMessage('Saved — reopen files to apply encoding/polling changes.')
  }

  const handleExport = async () => {
    const payload = await window.logViewer.invoke(IPC_INVOKE.SETTINGS_EXPORT)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `log-viewer-settings-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMessage('Settings exported.')
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const payload = JSON.parse(text) as SettingsExportPayload
        await window.logViewer.invoke(IPC_INVOKE.SETTINGS_IMPORT, payload)
        await loadSettings()
        const updated = await window.logViewer.invoke(IPC_INVOKE.SETTINGS_GET)
        setLocal(updated)
        applyTheme(updated.theme)
        setMessage('Settings imported.')
      } catch {
        setMessage('Import failed — invalid JSON.')
      }
    }
    input.click()
  }

  const handleClearRecent = async () => {
    await window.logViewer.invoke(IPC_INVOKE.SETTINGS_CLEAR_RECENT)
    await loadSettings()
    setMessage('Recent files cleared.')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">Settings</h2>

        <div className="space-y-4 text-sm">
          <label className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Light theme</span>
            <Switch
              checked={local.theme === 'light'}
              onCheckedChange={(checked) => void save({ theme: (checked ? 'light' : 'dark') as ThemeMode })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Encoding</span>
            <select
              className="rounded border border-border bg-background px-2 py-1"
              value={local.encoding}
              onChange={(e) => void save({ encoding: e.target.value as EncodingOverride })}
            >
              <option value="auto">Auto-detect</option>
              <option value="utf8">UTF-8</option>
              <option value="latin1">Latin-1</option>
              <option value="utf16le">UTF-16 LE</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Tab width (spaces)</span>
            <input
              type="number"
              min={2}
              max={16}
              className="rounded border border-border bg-background px-2 py-1"
              value={local.tabWidth}
              onChange={(e) => void save({ tabWidth: parseInt(e.target.value, 10) || 4 })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">File watch polling</span>
            <select
              className="rounded border border-border bg-background px-2 py-1"
              value={String(local.usePolling)}
              onChange={(e) => {
                const v = e.target.value
                void save({
                  usePolling: v === 'auto' ? 'auto' : v === 'true'
                })
              }}
            >
              <option value="auto">Auto (UNC + Windows)</option>
              <option value="true">Always poll</option>
              <option value="false">Native events</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Poll interval (ms)</span>
            <input
              type="number"
              min={50}
              max={5000}
              step={50}
              className="rounded border border-border bg-background px-2 py-1"
              value={local.pollIntervalMs}
              onChange={(e) => void save({ pollIntervalMs: parseInt(e.target.value, 10) || 100 })}
            />
          </label>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => void handleExport()}>
              Export prefs
            </Button>
            <Button variant="outline" size="sm" onClick={handleImport}>
              Import prefs
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleClearRecent()}>
              Clear recent files
            </Button>
          </div>

          {message && <p className="text-xs text-muted-foreground">{message}</p>}
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}
