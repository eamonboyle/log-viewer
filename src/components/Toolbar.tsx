import { useState } from 'react'
import { IPC_INVOKE } from '@shared/ipc'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { HighlightEditor } from '@/components/HighlightEditor'
import { SettingsDialog } from '@/components/SettingsDialog'
import { useTabStore } from '@/stores/tabStore'

export function Toolbar() {
  const tab = useTabStore((s) => s.getActiveTab())
  const setFollowPinned = useTabStore((s) => s.setFollowPinned)
  const settings = useTabStore((s) => s.settings)
  const loadSettings = useTabStore((s) => s.loadSettings)
  const updateHighlightRules = useTabStore((s) => s.updateHighlightRules)
  const detectColumns = useTabStore((s) => s.detectColumns)
  const toggleColumnVisibility = useTabStore((s) => s.toggleColumnVisibility)
  const [showHighlights, setShowHighlights] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showColumns, setShowColumns] = useState(false)

  const adjustFont = async (delta: number) => {
    if (!settings) return
    const fontSize = Math.max(10, Math.min(24, settings.fontSize + delta))
    await window.logViewer.invoke(IPC_INVOKE.SETTINGS_SET, { fontSize })
    await loadSettings()
  }

  const setWordWrap = async (wordWrap: boolean) => {
    if (!settings) return
    await window.logViewer.invoke(IPC_INVOKE.SETTINGS_SET, { wordWrap })
    await loadSettings()
  }

  return (
    <div className="flex h-10 shrink-0 items-center gap-4 border-b border-border bg-card px-3">
      <div className="flex items-center gap-2">
        <Switch
          checked={tab?.followPinned ?? true}
          disabled={!tab}
          onCheckedChange={(checked) => {
            if (tab) {
              if (checked) void setFollowPinned(tab.id, true)
              else void useTabStore.getState().setFollow(tab.id, false)
            }
          }}
        />
        <span className="text-sm text-muted-foreground">Follow</span>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={settings?.wordWrap ?? false}
          disabled={!settings}
          onCheckedChange={(checked) => void setWordWrap(checked)}
        />
        <span className="text-sm text-muted-foreground">Wrap</span>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" disabled={!settings} onClick={() => void adjustFont(-1)}>
          Font −
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">{settings?.fontSize ?? 13}px</span>
        <Button variant="ghost" size="sm" disabled={!settings} onClick={() => void adjustFont(1)}>
          Font +
        </Button>
      </div>

      {tab?.columnLayout && (
        <div className="relative">
          <Button variant="ghost" size="sm" onClick={() => setShowColumns((v) => !v)}>
            Columns ({tab.columnLayout.columnCount})
          </Button>
          {showColumns && (
            <div className="absolute left-0 top-full z-30 mt-1 min-w-[10rem] rounded border border-border bg-card p-2 shadow-lg">
              <p className="mb-2 text-xs text-muted-foreground">
                Tab-delimited — toggle visibility
              </p>
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: tab.columnLayout.columnCount }, (_, i) => {
                  const hidden = tab.hiddenColumns.includes(i)
                  return (
                    <Button
                      key={i}
                      variant={hidden ? 'outline' : 'default'}
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => toggleColumnVisibility(tab.id, i)}
                    >
                      {i + 1}
                    </Button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {tab && !tab.columnLayout && (
        <Button variant="ghost" size="sm" onClick={() => void detectColumns(tab.id)}>
          Detect Columns
        </Button>
      )}

      <Button variant="ghost" size="sm" onClick={() => setShowHighlights(true)}>
        Highlights
      </Button>

      <Button variant="ghost" size="sm" onClick={() => setShowSettings(true)}>
        Settings
      </Button>

      {showHighlights && settings && (
        <HighlightEditor
          rules={settings.highlightRules}
          onSave={(rules) => {
            void updateHighlightRules(rules)
            setShowHighlights(false)
          }}
          onClose={() => setShowHighlights(false)}
        />
      )}

      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  )
}
