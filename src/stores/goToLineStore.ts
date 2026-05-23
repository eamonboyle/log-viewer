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

export const useGoToLineStore = create<GoToLineStore>((set, get) => ({
  isOpen: false,
  lineInput: '',
  columnInput: '',

  open: () => set({ isOpen: true, lineInput: '', columnInput: '' }),

  close: () => set({ isOpen: false, lineInput: '', columnInput: '' }),

  setLineInput: (lineInput) => set({ lineInput }),

  setColumnInput: (columnInput) => set({ columnInput }),

  submit: () => {
    const { lineInput, close } = get()
    const line = parseInt(lineInput, 10)
    if (!Number.isFinite(line) || line < 1) {
      close()
      return
    }

    const tab = useTabStore.getState().getActiveTab()
    if (tab) {
      useTabStore.getState().gotoLine(tab.id, line)
    }
    close()
  }
}))
