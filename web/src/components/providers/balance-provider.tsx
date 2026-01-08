// Where: Global balance context provider for app-wide header usage.
// What: Fetches and caches the ledger balance once for all routes.
// Why: Prevents re-fetching on every page navigation.
'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'

import { useIdentityState } from '@/components/providers/identity-provider'
import { useLedgerBalance } from '@/hooks/use-ledger-balance'

type BalanceContextValue = {
  balanceText: string
  balanceBase: bigint | null
  balanceKinic: number | null
  isLoading: boolean
  refresh: () => void
}

const BalanceContext = createContext<BalanceContextValue | null>(null)

export const BalanceProvider = ({ children }: { children: ReactNode }) => {
  const identityState = useIdentityState()
  const balance = useLedgerBalance(identityState.identity ?? null)
  const balanceValue =
    balance.balanceKinic !== null ? Number(balance.balanceKinic.toFixed(4)) : undefined
  const balanceText = `${balanceValue ?? '--'} KINIC`

  const value = useMemo(
    () => ({
      balanceText,
      balanceBase: balance.balanceBase,
      balanceKinic: balance.balanceKinic,
      isLoading: balance.isLoading,
      refresh: balance.refresh
    }),
    [balanceText, balance.balanceBase, balance.balanceKinic, balance.isLoading, balance.refresh]
  )

  return <BalanceContext.Provider value={value}>{children}</BalanceContext.Provider>
}

export const useBalance = (): BalanceContextValue => {
  const context = useContext(BalanceContext)
  if (!context) {
    throw new Error('BalanceProvider is missing')
  }
  return context
}
