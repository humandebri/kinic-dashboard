// Where: Client auth state for Internet Identity.
// What: Provides identity, principal, and auth actions.
// Why: Centralizes II login/logout for dashboard and pages.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { AuthClient } from '@dfinity/auth-client'
import type { Identity } from '@dfinity/agent'

import { DERIVATION_ORIGIN, IDENTITY_PROVIDER_URL, II_SESSION_TTL_NS } from '@/lib/ic-config'

export type IdentityState = {
  isReady: boolean
  isAuthenticated: boolean
  identity: Identity | null
  principalText: string | null
  login: () => Promise<void>
  logout: () => Promise<void>
}

export const useIdentity = (): IdentityState => {
  const [client, setClient] = useState<AuthClient | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [principalText, setPrincipalText] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const init = async () => {
      const authClient = await AuthClient.create()
      const authed = await authClient.isAuthenticated()

      if (!isMounted) return

      setClient(authClient)
      setIsAuthenticated(authed)

      if (authed) {
        const authIdentity = authClient.getIdentity()
        setIdentity(authIdentity)
        setPrincipalText(authIdentity.getPrincipal().toText())
      }

      setIsReady(true)
    }

    init()

    return () => {
      isMounted = false
    }
  }, [])

  const login = useCallback(async () => {
    if (!client) return

    await new Promise<void>((resolve, reject) => {
      client.login({
        identityProvider: IDENTITY_PROVIDER_URL,
        derivationOrigin: DERIVATION_ORIGIN,
        maxTimeToLive: II_SESSION_TTL_NS,
        onSuccess: () => resolve(),
        onError: (error) => reject(error)
      })
    })

    const authIdentity = client.getIdentity()
    setIdentity(authIdentity)
    setPrincipalText(authIdentity.getPrincipal().toText())
    setIsAuthenticated(true)
  }, [client])

  const logout = useCallback(async () => {
    if (!client) return

    await client.logout()
    setIdentity(null)
    setPrincipalText(null)
    setIsAuthenticated(false)
  }, [client])

  return {
    isReady,
    isAuthenticated,
    identity,
    principalText,
    login,
    logout
  }
}
