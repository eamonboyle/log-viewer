import { useCallback, useEffect, useState } from 'react'
import { GoToLineDialog } from '@/components/GoToLineDialog'
import { LogViewport } from '@/components/LogViewport'
import { SearchBar } from '@/components/SearchBar'
import { StatusBar } from '@/components/StatusBar'
import { TabStrip } from '@/components/TabStrip'
import { Toolbar } from '@/components/Toolbar'
import { useKeyboardShortcuts, useMenuShortcuts, useTailEvents } from '@/hooks/useTailEvents'
import { subscribeSearchStaleEvents, useSearchStore } from '@/stores/searchStore'
import { useTabStore } from '@/stores/tabStore'
import { cn } from '@/lib/utils'

export default function App() {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const switchSearchTab = useSearchStore((s) => s.switchTab)
  const openFile = useTabStore((s) => s.openFile)
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

      <main className={cn('relative flex-1 overflow-hidden', dragOver && 'ring-2 ring-inset ring-primary')}>
        <SearchBar />
        <GoToLineDialog />
        {activeTab ? (
          <LogViewport key={activeTab.id} tabId={activeTab.id} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
            <p className="text-lg">Drop a log file here or press Ctrl+O</p>
            {settings && settings.recentFiles.length > 0 && (
              <div className="mt-4 max-w-md">
                <p className="mb-2 text-sm">Recent files:</p>
                <ul className="space-y-1">
                  {settings.recentFiles.slice(0, 5).map((f) => (
                    <li key={f}>
                      <button
                        type="button"
                        className="truncate text-sm text-primary hover:underline"
                        onClick={() => void openFile(f)}
                      >
                        {f}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {dragOver && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/10">
            <span className="rounded-lg bg-card px-6 py-3 text-lg shadow-lg">Drop log file to open</span>
          </div>
        )}
      </main>

      <StatusBar />
    </div>
  )
}
