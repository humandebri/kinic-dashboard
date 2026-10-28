// Where: Browser storage helpers.
// What: localStorage access that never throws (private mode, blocked storage).
// Why: Preferences are conveniences; the app must keep working without them.
export const readStorage = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export const writeStorage = (key: string, value: string | null) => {
  try {
    if (value === null) {
      window.localStorage.removeItem(key)
    } else {
      window.localStorage.setItem(key, value)
    }
  } catch {
    // Ignore quota / access errors.
  }
}

export const readStringArray = (key: string): string[] => {
  const raw = readStorage(key)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}
