import { useState } from 'react'
import { IPC_INVOKE } from '@shared/ipc'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { HighlightEditor } from '@/components/HighlightEditor'
import { useTabStore } from '@/stores/tabStore'

export function Toolbar() {
  const tab = useTabStore((s) => s.getActiveTab())
  const toggleFollow = useTabStore((s) => s.toggleFollow)
  const setFollowPinned = useTabStore((s) => s.setFollowPinned)
  const settings = useTabStore((s) => s.settings)
  const updateHighlightRules = useTabStore((s) => s.updateHighlightRules)
  const [showHighlights, setShowHighlights] = useState(false)

  const adjustFont = async (delta: number) => {
    if (!settings) return
    const fontSize = Math.max(10, Math.min(24, settings.fontSize + delta))
    await window.logViewer.invoke(IPC_INVOKE.SETTINGS_SET, { fontSize })
    await useTabStore.getState().loadSettings()
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
    </div>
  )
}
