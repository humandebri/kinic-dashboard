// Where: Global identity context provider.
// What: Supplies a single Internet Identity state across the app.
// Why: Avoids duplicate auth initialization on each page.
'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'

import { useIdentity, type IdentityState } from '@/hooks/use-identity'

const IdentityContext = createContext<IdentityState | null>(null)

export const IdentityProvider = ({ children }: { children: ReactNode }) => {
  const identityState = useIdentity()
  const value = useMemo(() => identityState, [identityState])

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>
}

export const useIdentityState = (): IdentityState => {
  const context = useContext(IdentityContext)
  if (!context) {
    throw new Error('IdentityProvider is missing')
  }
  return context
}
