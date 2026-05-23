import { useState } from 'react'
import { IPC_INVOKE } from '@shared/ipc'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { HighlightEditor } from '@/components/HighlightEditor'
import { SettingsDialog } from '@/components/SettingsDialog'
import { useTabStore } from '@/stores/tabStore'

export function Toolbar() {
  const tab = useTabStore((s) => s.getActiveTab())
  const toggleFollow = useTabStore((s) => s.toggleFollow)
  const setFollowPinned = useTabStore((s) => s.setFollowPinned)
  const settings = useTabStore((s) => s.settings)
  const loadSettings = useTabStore((s) => s.loadSettings)
  const updateHighlightRules = useTabStore((s) => s.updateHighlightRules)
  const [showHighlights, setShowHighlights] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

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
              else void toggleFollow(tab.id)
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
