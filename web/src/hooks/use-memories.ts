// Where: Client hook for Launcher list_instance.
// What: Loads memory instances and normalizes their state for UI.
// Why: Keeps canister fetch logic out of page components.
'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Identity } from '@dfinity/agent'
import type { Principal } from '@dfinity/principal'

import { createLauncherActor, type LauncherState } from '@/lib/launcher'

export type MemoryState = 'Empty' | 'Pending' | 'Creation' | 'Installation' | 'SettingUp' | 'Running'

export type MemoryInstance = {
  state: MemoryState
  principalText: string | null
  detail: string | null
}

type MemoriesState = {
  isLoading: boolean
  memories: MemoryInstance[]
  error: string | null
  lastUpdated: Date | null
}

const toPrincipalText = (principal: Principal | null): string | null => {
  return principal ? principal.toText() : null
}

const normalizeState = (state: LauncherState): MemoryInstance => {
  if ('Empty' in state) {
    return { state: 'Empty', principalText: null, detail: state.Empty }
  }

  if ('Pending' in state) {
    return { state: 'Pending', principalText: null, detail: state.Pending }
  }

  if ('Creation' in state) {
    return { state: 'Creation', principalText: null, detail: state.Creation }
  }

  if ('Installation' in state) {
    const [principal, detail] = state.Installation
    return { state: 'Installation', principalText: toPrincipalText(principal), detail }
  }

  if ('SettingUp' in state) {
    return {
      state: 'SettingUp',
      principalText: toPrincipalText(state.SettingUp),
      detail: null
    }
  }

  return {
    state: 'Running',
    principalText: toPrincipalText(state.Running),
    detail: null
  }
}

export const useMemories = (identity: Identity | null, isReady: boolean) => {
  const [state, setState] = useState<MemoriesState>({
    isLoading: false,
    memories: [],
    error: null,
    lastUpdated: null
  })
  const [refreshIndex, setRefreshIndex] = useState(0)

  const refresh = useCallback(() => {
    setRefreshIndex((prev) => prev + 1)
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadMemories = async () => {
      if (!isReady) {
        setState((prev) => ({ ...prev, isLoading: false }))
        return
      }

      if (!identity) {
        setState({ isLoading: false, memories: [], error: null, lastUpdated: null })
        return
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }))

      try {
        const actor = await createLauncherActor(identity)
        const instances = await actor.list_instance()

        if (!isMounted) return

        setState({
          isLoading: false,
          memories: instances.map(normalizeState),
          error: null,
          lastUpdated: new Date()
        })
      } catch (error) {
        if (!isMounted) return

        const message = error instanceof Error ? error.message : 'Failed to load memories'
        setState({ isLoading: false, memories: [], error: message, lastUpdated: null })
      }
    }

    loadMemories()

    return () => {
      isMounted = false
    }
  }, [identity, isReady, refreshIndex])

  return { ...state, refresh }
}
