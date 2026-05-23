import { useState } from 'react'
import { Highlighter, Settings, ChevronDown, Columns } from 'lucide-react'
import { IPC_INVOKE } from '@shared/ipc'
import { Switch } from '@/components/ui/switch'
import { HighlightEditor } from '@/components/HighlightEditor'
import { SettingsDialog } from '@/components/SettingsDialog'
import { useTabStore } from '@/stores/tabStore'
import { cn } from '@/lib/utils'

function ToolbarDivider() {
  return <div className="mx-1 h-4 w-px shrink-0 bg-border" />
}

function ToolbarToggle({
  checked,
  disabled,
  label,
  onChange
}: {
  checked: boolean
  disabled?: boolean
  label: string
  onChange: (v: boolean) => void
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-2 select-none',
        disabled && 'pointer-events-none opacity-50'
      )}
    >
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </label>
  )
}

function ToolbarSelect({
  label,
  value,
  options,
  onChange,
  disabled
}: {
  label: string
  value: string
  options: { label: string; value: string }[]
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-0.5',
        disabled && 'pointer-events-none opacity-50'
      )}
    >
      <span className="text-[10px] leading-none text-muted-foreground/70">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="appearance-none rounded border border-border bg-muted px-2 py-0.5 pr-5 text-xs text-foreground outline-none transition-colors hover:border-muted-foreground/50 focus:border-primary focus:ring-0"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  )
}

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

  const setTabWidth = async (val: string) => {
    if (!settings) return
    await window.logViewer.invoke(IPC_INVOKE.SETTINGS_SET, { tabWidth: Number(val) })
    await loadSettings()
  }

  const setEncoding = async (val: string) => {
    if (!settings) return
    await window.logViewer.invoke(IPC_INVOKE.SETTINGS_SET, { encoding: val as import('@shared/types').EncodingOverride })
    await loadSettings()
  }

  const highlightCount = settings?.highlightRules?.length ?? 0

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-card px-3">
      {/* Follow / Wrap */}
      <ToolbarToggle
        checked={tab?.followPinned ?? true}
        disabled={!tab}
        label="Follow"
        onChange={(checked) => {
          if (tab) {
            if (checked) void setFollowPinned(tab.id, true)
            else void useTabStore.getState().setFollow(tab.id, false)
          }
        }}
      />

      <ToolbarToggle
        checked={settings?.wordWrap ?? false}
        disabled={!settings}
        label="Wrap"
        onChange={(checked) => void setWordWrap(checked)}
      />

      <ToolbarDivider />

      {/* Encoding */}
      <ToolbarSelect
        label="Encoding"
        value={settings?.encoding ?? 'auto'}
        disabled={!settings}
        options={[
          { label: 'Auto-detect', value: 'auto' },
          { label: 'UTF-8', value: 'utf8' },
          { label: 'UTF-16 LE', value: 'utf16le' },
          { label: 'Latin-1', value: 'latin1' }
        ]}
        onChange={(v) => void setEncoding(v)}
      />

      {/* Tab width */}
      <ToolbarSelect
        label="Tab width"
        value={String(settings?.tabWidth ?? 4)}
        disabled={!settings}
        options={[
          { label: '2', value: '2' },
          { label: '4', value: '4' },
          { label: '8', value: '8' }
        ]}
        onChange={(v) => void setTabWidth(v)}
      />

      {/* Font size */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] leading-none text-muted-foreground/70">Font size</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className="flex h-5 w-5 items-center justify-center rounded text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            disabled={!settings}
            onClick={() => void adjustFont(-1)}
          >
            −
          </button>
          <span className="min-w-[2rem] text-center text-xs tabular-nums text-foreground">
            {settings?.fontSize ?? 13}px
          </span>
          <button
            type="button"
            className="flex h-5 w-5 items-center justify-center rounded text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            disabled={!settings}
            onClick={() => void adjustFont(1)}
          >
            +
          </button>
        </div>
      </div>

      {/* Columns */}
      {tab?.columnLayout && (
        <>
          <ToolbarDivider />
          <div className="relative">
            <button
              type="button"
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setShowColumns((v) => !v)}
            >
              <Columns className="h-3.5 w-3.5" />
              {tab.columnLayout.columnCount} cols
            </button>
            {showColumns && (
              <div className="absolute left-0 top-full z-30 mt-1 min-w-[10rem] rounded border border-border bg-card p-2 shadow-xl">
                <p className="mb-2 text-xs text-muted-foreground">Toggle column visibility</p>
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: tab.columnLayout.columnCount }, (_, i) => {
                    const hidden = tab.hiddenColumns.includes(i)
                    return (
                      <button
                        key={i}
                        type="button"
                        className={cn(
                          'h-6 min-w-[1.5rem] rounded border px-1.5 text-xs transition-colors',
                          hidden
                            ? 'border-border bg-transparent text-muted-foreground'
                            : 'border-primary bg-primary/10 text-primary'
                        )}
                        onClick={() => toggleColumnVisibility(tab.id, i)}
                      >
                        {i + 1}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {tab && !tab.columnLayout && (
        <>
          <ToolbarDivider />
          <button
            type="button"
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => void detectColumns(tab.id)}
          >
            <Columns className="h-3.5 w-3.5" />
            Detect cols
          </button>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Highlights */}
      <button
        type="button"
        onClick={() => setShowHighlights(true)}
        className="relative flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Highlight rules"
      >
        <Highlighter className="h-3.5 w-3.5" />
        Highlights
        {highlightCount > 0 && (
          <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
            {highlightCount}
          </span>
        )}
      </button>

      {/* Settings */}
      <button
        type="button"
        onClick={() => setShowSettings(true)}
        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Settings"
      >
        <Settings className="h-4 w-4" />
      </button>

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
