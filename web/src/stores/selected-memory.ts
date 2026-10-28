// Where: Global selected/default memory store.
// What: Persists the active memory and the default memory in localStorage.
// Why: The header switcher, sidebar, and pages must agree without page reloads.
import { create } from 'zustand'

import { readStorage, writeStorage } from '@/lib/storage'

const STORAGE_KEY = 'kinic:selected-memory-id'
const DEFAULT_STORAGE_KEY = 'kinic:default-memory-id'

type SelectedMemoryState = {
  selectedMemoryId: string | null
  defaultMemoryId: string | null
  setSelectedMemoryId: (value: string | null) => void
  setDefaultMemoryId: (value: string | null) => void
}

export const useSelectedMemory = create<SelectedMemoryState>()((set) => {
  const defaultMemoryId = readStorage(DEFAULT_STORAGE_KEY)
  return {
    selectedMemoryId: readStorage(STORAGE_KEY) ?? defaultMemoryId,
    defaultMemoryId,
    setSelectedMemoryId: (value) => {
      writeStorage(STORAGE_KEY, value || null)
      set({ selectedMemoryId: value || null })
    },
    setDefaultMemoryId: (value) => {
      writeStorage(DEFAULT_STORAGE_KEY, value || null)
      set({ defaultMemoryId: value || null })
    }
  }
})
