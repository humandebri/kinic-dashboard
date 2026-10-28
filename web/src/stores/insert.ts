// Where: Insert page state store.
// What: Holds the loaded content and insert progress outside the page component.
// Why: A long insert keeps running (and stays visible) if the user navigates away and back.
import { create } from 'zustand'

export type UploadKind = 'pdf' | 'markdown' | 'text'
export type InsertPhase = 'idle' | 'chunking' | 'inserting' | 'done' | 'error'

type Progress = { total: number; done: number } | null

type InsertState = {
  fileName: string | null
  uploadKind: UploadKind | null
  content: string
  sourceSegments: string[]
  tag: string
  isReading: boolean
  phase: InsertPhase
  status: string | null
  progress: Progress
  targetMemoryId: string | null
  set: (partial: Partial<Omit<InsertState, 'set' | 'reset'>>) => void
  reset: () => void
}

const initial = {
  fileName: null,
  uploadKind: null,
  content: '',
  sourceSegments: [],
  tag: '',
  isReading: false,
  phase: 'idle' as InsertPhase,
  status: null,
  progress: null,
  targetMemoryId: null
}

export const useInsertStore = create<InsertState>()((set) => ({
  ...initial,
  set: (partial) => set(partial),
  reset: () => set({ ...initial })
}))
