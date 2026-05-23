import { create } from 'zustand'
import { useTabStore } from './tabStore'

interface GoToLineStore {
  isOpen: boolean
  lineInput: string
  columnInput: string

  open: () => void
  close: () => void
  setLineInput: (value: string) => void
  setColumnInput: (value: string) => void
  submit: () => void
}

function parseGoToInput(lineInput: string, columnInput: string): { line: number; column?: number } | null {
  const combined = lineInput.includes(':') ? lineInput : columnInput ? `${lineInput}:${columnInput}` : lineInput
  const parts = combined.split(':')
  const line = parseInt(parts[0], 10)
  if (!Number.isFinite(line) || line < 1) return null

  if (parts.length > 1 && parts[1].trim() !== '') {
    const column = parseInt(parts[1], 10)
    if (!Number.isFinite(column) || column < 1) return null
    return { line, column }
  }

  return { line }
}

export const useGoToLineStore = create<GoToLineStore>((set, get) => ({
  isOpen: false,
  lineInput: '',
  columnInput: '',

  open: () => set({ isOpen: true, lineInput: '', columnInput: '' }),

  close: () => set({ isOpen: false, lineInput: '', columnInput: '' }),

  setLineInput: (lineInput) => set({ lineInput }),

  setColumnInput: (columnInput) => set({ columnInput }),

  submit: () => {
    const { lineInput, columnInput, close } = get()
    const parsed = parseGoToInput(lineInput, columnInput)
    if (!parsed) {
      close()
      return
    }

    const tab = useTabStore.getState().getActiveTab()
    if (tab) {
      useTabStore.getState().gotoLine(tab.id, parsed.line, parsed.column)
    }
    close()
  }
}))
