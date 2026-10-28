// Where: Global store for manually saved memory canister IDs.
// What: Persists the list in localStorage and shares it across pages.
// Why: Settings, the memory list, and the header switcher all read the same list.
import { create } from 'zustand'

import { readStringArray, writeStorage } from '@/lib/storage'

const STORAGE_KEY = 'kinic.custom-canisters'

type CustomCanistersState = {
  customCanisters: string[]
  addCustomCanister: (value: string) => void
  removeCustomCanister: (value: string) => void
}

const persist = (next: string[]) => writeStorage(STORAGE_KEY, JSON.stringify(next))

export const useCustomCanisters = create<CustomCanistersState>()((set, get) => ({
  customCanisters: readStringArray(STORAGE_KEY),
  addCustomCanister: (value) => {
    const next = [value, ...get().customCanisters.filter((item) => item !== value)]
    persist(next)
    set({ customCanisters: next })
  },
  removeCustomCanister: (value) => {
    const next = get().customCanisters.filter((item) => item !== value)
    persist(next)
    set({ customCanisters: next })
  }
}))
