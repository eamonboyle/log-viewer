import { useCallback, useEffect, useState } from 'react'
import { GoToLineDialog } from '@/components/GoToLineDialog'
import { LogViewport } from '@/components/LogViewport'
import { FilterSidebar } from '@/components/FilterSidebar'
import { SearchBar } from '@/components/SearchBar'
import { StatusBar } from '@/components/StatusBar'
import { TabStrip } from '@/components/TabStrip'
import { Toolbar } from '@/components/Toolbar'
import { useKeyboardShortcuts, useMenuShortcuts, useTailEvents } from '@/hooks/useTailEvents'
import { subscribeSearchStaleEvents, useSearchStore } from '@/stores/searchStore'
import { useTabStore } from '@/stores/tabStore'
import { cn } from '@/lib/utils'
import { FolderOpen } from 'lucide-react'

export default function App() {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const switchSearchTab = useSearchStore((s) => s.switchTab)
  const openFile = useTabStore((s) => s.openFile)
  const openFileDialog = useTabStore((s) => s.openFileDialog)
  const loadSettings = useTabStore((s) => s.loadSettings)
  const settings = useTabStore((s) => s.settings)
  const [dragOver, setDragOver] = useState(false)

  useTailEvents()
  useMenuShortcuts()
  useKeyboardShortcuts()

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  useEffect(() => subscribeSearchStaleEvents(), [])

  useEffect(() => {
    void switchSearchTab(activeTabId)
  }, [activeTabId, switchSearchTab])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0] as (File & { path?: string }) | undefined
      if (file?.path) void openFile(file.path)
    },
    [openFile]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => setDragOver(false), [])

  const activeTab = tabs.find((t) => t.id === activeTabId)

  return (
    <div
      className="flex h-screen flex-col bg-background text-foreground"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <TabStrip />
      <Toolbar />

      <main
        className={cn(
          'relative flex min-h-0 flex-1 overflow-hidden',
          dragOver && 'ring-2 ring-inset ring-primary'
        )}
      >
        <SearchBar />
        <GoToLineDialog />

        {activeTab ? (
          <div className="flex h-full min-h-0 w-full min-w-0 flex-1">
            <FilterSidebar />
            <LogViewport key={activeTab.id} tabId={activeTab.id} />
          </div>
        ) : (
          <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-xl border border-border bg-card p-6">
                <FolderOpen className="h-10 w-10 text-muted-foreground/40" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">No file open</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Drop a log file here or press{' '}
                  <kbd className="rounded border border-border bg-muted px-1 py-px font-mono text-[10px]">
                    Ctrl+O
                  </kbd>
                </p>
              </div>
            </div>

            {settings && settings.recentFiles.length > 0 && (
              <div className="mt-4 w-full max-w-sm">
                <p className="mb-2 text-center text-[10px] uppercase tracking-widest text-muted-foreground/60">
                  Recent files
                </p>
                <div className="rounded-lg border border-border bg-card overflow-hidden">
                  {settings.recentFiles.slice(0, 5).map((f, i) => (
                    <button
                      key={f}
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-accent',
                        i > 0 && 'border-t border-border'
                      )}
                      onClick={() => void openFile(f)}
                    >
                      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                      <span className="truncate text-muted-foreground hover:text-foreground transition-colors">
                        {f}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tabs.length === 0 && (
              <button
                type="button"
                onClick={() => void openFileDialog()}
                className="mt-2 rounded-lg border border-border bg-card px-4 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Browse files…
              </button>
            )}
          </div>
        )}

        {dragOver && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/5 backdrop-blur-sm">
            <div className="rounded-xl border border-primary/30 bg-card px-8 py-4 shadow-xl">
              <p className="text-sm font-medium text-primary">Drop log file to open</p>
            </div>
          </div>
        )}
      </main>

      <StatusBar />
    </div>
  )
}
