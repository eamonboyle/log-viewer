import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTabStore } from '@/stores/tabStore'
import { cn } from '@/lib/utils'

export function TabStrip() {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const setActiveTab = useTabStore((s) => s.setActiveTab)
  const closeTab = useTabStore((s) => s.closeTab)
  const openFileDialog = useTabStore((s) => s.openFileDialog)

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-card px-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => setActiveTab(tab.id)}
          onAuxClick={(e) => {
            if (e.button === 1) {
              e.preventDefault()
              void closeTab(tab.id)
            }
          }}
          className={cn(
            'group flex max-w-none items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
            activeTabId === tab.id
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
          )}
          title={tab.path}
        >
          <span className="max-w-[240px] truncate">{tab.displayName}</span>
          {tab.hasUnread && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" title="New lines" />
          )}
          {tab.followPinned && activeTabId === tab.id && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500/50" title="Live" />
          )}
          <span
            role="button"
            tabIndex={0}
            className="ml-1 rounded p-0.5 opacity-0 hover:bg-background/50 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation()
              void closeTab(tab.id)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.stopPropagation()
                void closeTab(tab.id)
              }
            }}
          >
            <X className="h-3 w-3" />
          </span>
        </button>
      ))}
      <Button variant="ghost" size="sm" className="ml-auto shrink-0" onClick={() => void openFileDialog()}>
        + Open
      </Button>
    </div>
  )
}
