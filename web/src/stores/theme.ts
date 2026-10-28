// Where: Global theme store.
// What: Tracks light/dark/system preference and applies it to <html>.
// Why: public/theme-init.js sets the first paint; this keeps it in sync afterwards.
import { create } from 'zustand'

import { readStorage, writeStorage } from '@/lib/storage'

export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'kinic.theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

const resolve = (preference: ThemePreference): 'light' | 'dark' => {
  if (preference === 'system') return media().matches ? 'dark' : 'light'
  return preference
}

const loadPreference = (): ThemePreference => {
  const stored = readStorage(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

type ThemeState = {
  preference: ThemePreference
  resolved: 'light' | 'dark'
  setPreference: (value: ThemePreference) => void
}

export const useThemeStore = create<ThemeState>()((set) => {
  const preference = loadPreference()
  return {
    preference,
    resolved: resolve(preference),
    setPreference: (value) => {
      writeStorage(STORAGE_KEY, value === 'system' ? null : value)
      const resolved = resolve(value)
      document.documentElement.classList.toggle('dark', resolved === 'dark')
      set({ preference: value, resolved })
    }
  }
})

media().addEventListener('change', () => {
  const { preference, setPreference } = useThemeStore.getState()
  if (preference === 'system') setPreference('system')
})
