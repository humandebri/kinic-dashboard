// Where: Global memories + permission cache provider.
// What: Shares launcher memories and permission labels across routes.
// Why: Avoids re-fetching header data on each page transition.
'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'

import { useIdentityState } from '@/components/providers/identity-provider'
import { type MemoryInstance, useMemories } from '@/hooks/use-memories'
import { roleLabelMap } from '@/lib/access-control'
import { fetchMemoryUsers } from '@/lib/memory'

type MemoryPermissionEntry = {
  label: string | null
  isLoading: boolean
  error: string | null
  principal: string | null
}

type MemoriesContextValue = {
  isLoading: boolean
  memories: MemoryInstance[]
  error: string | null
  lastUpdated: Date | null
  refresh: () => void
  memoryPermissions: Record<string, MemoryPermissionEntry>
  ensureMemoryPermissions: (memoryIds: string[]) => void
}

const MemoriesContext = createContext<MemoriesContextValue | null>(null)

export const MemoriesProvider = ({ children }: { children: ReactNode }) => {
  const identityState = useIdentityState()
  const memoriesState = useMemories(identityState.identity, identityState.isReady)
  const [memoryPermissions, setMemoryPermissions] = useState<Record<string, MemoryPermissionEntry>>({})
  const lastPrincipalRef = useRef<string | null>(null)

  useEffect(() => {
    const principalText = identityState.isAuthenticated ? identityState.principalText : null
    if (principalText === lastPrincipalRef.current) return
    lastPrincipalRef.current = principalText
    setMemoryPermissions({})
  }, [identityState.isAuthenticated, identityState.principalText])

  const loadMemoryPermission = useCallback(
    async (memoryId: string, principalText: string) => {
      setMemoryPermissions((prev) => ({
        ...prev,
        [memoryId]: { label: null, isLoading: true, error: null, principal: principalText }
      }))

      try {
        const users = await fetchMemoryUsers(identityState.identity ?? undefined, memoryId)
        const matched = users.find(([userText]) => userText === principalText)
        const label = matched ? roleLabelMap[matched[1]] ?? 'unknown' : 'no access'
        setMemoryPermissions((prev) => ({
          ...prev,
          [memoryId]: { label, isLoading: false, error: null, principal: principalText }
        }))
      } catch (permissionError) {
        const message =
          permissionError instanceof Error ? permissionError.message : 'Failed to load permission.'
        const isInvalidUser =
          message.includes('Invalid user') || message.includes('IC0406') || message.includes('invalid user')
        setMemoryPermissions((prev) => ({
          ...prev,
          [memoryId]: {
            label: isInvalidUser ? 'no access' : 'unknown',
            isLoading: false,
            error: message,
            principal: principalText
          }
        }))
      }
    },
    [identityState.identity]
  )

  const ensureMemoryPermissions = useCallback(
    (memoryIds: string[]) => {
      if (!identityState.isAuthenticated || !identityState.principalText) return
      const principalText = identityState.principalText

      memoryIds.forEach((memoryId) => {
        const entry = memoryPermissions[memoryId]
        const shouldLoad = !entry || entry.principal !== principalText
        if (!shouldLoad || entry?.isLoading) return
        void loadMemoryPermission(memoryId, principalText)
      })
    },
    [identityState.isAuthenticated, identityState.principalText, loadMemoryPermission, memoryPermissions]
  )

  const value = useMemo(
    () => ({
      isLoading: memoriesState.isLoading,
      memories: memoriesState.memories,
      error: memoriesState.error,
      lastUpdated: memoriesState.lastUpdated,
      refresh: memoriesState.refresh,
      memoryPermissions,
      ensureMemoryPermissions
    }),
    [
      memoriesState.isLoading,
      memoriesState.memories,
      memoriesState.error,
      memoriesState.lastUpdated,
      memoriesState.refresh,
      memoryPermissions,
      ensureMemoryPermissions
    ]
  )

  return <MemoriesContext.Provider value={value}>{children}</MemoriesContext.Provider>
}

export const useMemoriesState = (): MemoriesContextValue => {
  const context = useContext(MemoriesContext)
  if (!context) {
    throw new Error('MemoriesProvider is missing')
  }
  return context
}
