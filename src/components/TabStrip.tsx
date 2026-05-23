import { X, FolderOpen } from 'lucide-react'
import { useTabStore } from '@/stores/tabStore'
import { cn } from '@/lib/utils'
import { useCallback, useState } from 'react'

export function TabStrip() {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const setActiveTab = useTabStore((s) => s.setActiveTab)
  const closeTab = useTabStore((s) => s.closeTab)
  const openFileDialog = useTabStore((s) => s.openFileDialog)
  const reorderTabs = useTabStore((s) => s.reorderTabs)

  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index)
  }, [])

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault()
      if (dragIndex === null || dragIndex === index) return
      reorderTabs(dragIndex, index)
      setDragIndex(index)
    },
    [dragIndex, reorderTabs]
  )

  const handleDragEnd = useCallback(() => {
    setDragIndex(null)
  }, [])

  return (
    <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-border bg-card">
      <div className="flex min-w-0 flex-1 items-stretch gap-px px-1 pt-1">
        {tabs.map((tab, index) => {
          const duplicates = tabs.filter((t) => t.path === tab.path)
          const dupIndex = duplicates.findIndex((t) => t.id === tab.id)
          const duplicateSuffix = duplicates.length > 1 ? ` (${dupIndex + 1})` : ''
          const isActive = activeTabId === tab.id

          return (
            <button
              key={tab.id}
              type="button"
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              onClick={() => setActiveTab(tab.id)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  void closeTab(tab.id)
                }
              }}
              className={cn(
                'group relative flex max-w-[220px] items-center gap-1.5 rounded-t px-3 text-xs transition-colors',
                isActive
                  ? 'bg-background text-foreground'
                  : 'text-muted-foreground hover:bg-background/50 hover:text-foreground',
                dragIndex === index && 'opacity-60'
              )}
              title={tab.path}
            >
              {isActive && (
                <span className="absolute inset-x-0 top-0 h-px bg-primary" />
              )}
              <span className="max-w-[160px] truncate font-medium">
                {tab.displayName}
                {duplicateSuffix && (
                  <span className="ml-1 font-normal opacity-60">{duplicateSuffix}</span>
                )}
              </span>
              {(tab.hasUnread || tab.followPinned) && (
                <span
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    tab.hasUnread ? 'bg-emerald-400' : 'bg-emerald-500/60'
                  )}
                  title={tab.hasUnread ? 'New lines' : 'Live'}
                />
              )}
              <span
                role="button"
                tabIndex={0}
                className="ml-auto shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-70 hover:!opacity-100"
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
          )
        })}
      </div>

      <div className="flex shrink-0 items-center px-2">
        <button
          type="button"
          onClick={() => void openFileDialog()}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Open file (Ctrl+O)"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Open
        </button>
      </div>
    </div>
  )
}
