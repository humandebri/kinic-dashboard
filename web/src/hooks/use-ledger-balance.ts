// Where: Client hook for ledger balance.
// What: Loads the principal balance in KINIC.
// Why: Keeps ledger fetch logic out of UI components.
'use client'

import { useEffect, useState } from 'react'
import type { Identity } from '@dfinity/agent'
import { createLedgerActor } from '@/lib/ledger'

type BalanceState = {
  isLoading: boolean
  balanceBase: bigint | null
  balanceKinic: number | null
  error: string | null
  refresh: () => void
}

const KINIC_DECIMALS = 100_000_000

export const useLedgerBalance = (identity: Identity | null): BalanceState => {
  const [state, setState] = useState<BalanceState>({
    isLoading: false,
    balanceBase: null,
    balanceKinic: null,
    error: null,
    refresh: () => {}
  })
  const [refreshIndex, setRefreshIndex] = useState(0)

  const refresh = () => {
    setRefreshIndex((prev) => prev + 1)
  }

  useEffect(() => {
    let isMounted = true

    const loadBalance = async () => {
      if (!identity) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          balanceBase: null,
          balanceKinic: null,
          error: null
        }))
        return
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }))

      try {
        const principal = identity.getPrincipal()
        const actor = await createLedgerActor(identity)
        const balance = await actor.icrc1_balance_of({
          owner: principal,
          subaccount: []
        })

        if (!isMounted) return

        const kinic = Number(balance) / KINIC_DECIMALS
        setState({
          isLoading: false,
          balanceBase: balance,
          balanceKinic: kinic,
          error: null,
          refresh
        })
      } catch (error) {
        if (!isMounted) return

        const message = error instanceof Error ? error.message : 'Failed to load balance'
        setState({
          isLoading: false,
          balanceBase: null,
          balanceKinic: null,
          error: message,
          refresh
        })
      }
    }

    loadBalance()

    return () => {
      isMounted = false
    }
  }, [identity, refreshIndex])

  return { ...state, refresh }
}
