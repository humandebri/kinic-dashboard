// Where: Client hook for memory selection persistence.
// What: Stores selected memory ID in localStorage.
// Why: Keeps header dropdown selection across pages.
'use client'

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'kinic:selected-memory-id'
const DEFAULT_STORAGE_KEY = 'kinic:default-memory-id'

export const useSelectedMemory = () => {
  const [selectedMemoryId, setSelectedMemoryIdState] = useState<string | null>(null)
  const [defaultMemoryId, setDefaultMemoryIdState] = useState<string | null>(null)

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    const storedDefault = window.localStorage.getItem(DEFAULT_STORAGE_KEY)
    if (storedDefault) {
      setDefaultMemoryIdState(storedDefault)
    }
    if (stored) {
      setSelectedMemoryIdState(stored)
    } else if (storedDefault) {
      setSelectedMemoryIdState(storedDefault)
    }
  }, [])

  const setSelectedMemoryId = useCallback((value: string | null) => {
    if (!value) {
      window.localStorage.removeItem(STORAGE_KEY)
      setSelectedMemoryIdState(null)
      return
    }

    window.localStorage.setItem(STORAGE_KEY, value)
    setSelectedMemoryIdState(value)
  }, [])

  const setDefaultMemoryId = useCallback((value: string | null) => {
    if (!value) {
      window.localStorage.removeItem(DEFAULT_STORAGE_KEY)
      setDefaultMemoryIdState(null)
      return
    }

    window.localStorage.setItem(DEFAULT_STORAGE_KEY, value)
    setDefaultMemoryIdState(value)
  }, [])

  return { selectedMemoryId, setSelectedMemoryId, defaultMemoryId, setDefaultMemoryId }
}
