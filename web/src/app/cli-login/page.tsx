// Where: CLI login page for delegations.
// What: Logs into Internet Identity and posts encrypted delegations to localhost.
// Why: Lets the CLI receive a delegation without server-side storage.
'use client'

import { Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'

const II_ORIGIN = 'https://id.ai'
const II_AUTHORIZE_URL = `${II_ORIGIN}/#authorize`

type LoginParams = {
  callbackUrl: string
  nonce: string
  sessionPublicKeyHex: string
  boxPublicKeyHex: string
  derivationOrigin: string
  maxTimeToLiveNs: bigint
}

type PayloadDelegation = {
  delegation: {
    pubkey: number[]
    expiration: string
    targets?: string[]
  }
  signature: number[]
}

type IIAuthorizeMessage =
  | { kind: 'authorize-ready' }
  | {
      kind: 'authorize-client-success'
      delegations: Array<{
        delegation: {
          pubkey: Uint8Array
          expiration: bigint
          targets?: Array<{ toText: () => string } | string>
        }
        signature: Uint8Array
      }>
      userPublicKey: Uint8Array
    }
  | { kind: 'authorize-client-failure' }

const bytesToHex = (bytes: Uint8Array): string => {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

const hexToBytes = (hexValue: string): Uint8Array => {
  const clean = hexValue.trim()
  if (clean.length % 2 !== 0) {
    return new Uint8Array()
  }
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = Number.parseInt(clean.slice(i, i + 2), 16)
  }
  return bytes
}

const parseLoginParams = (searchParams: URLSearchParams): LoginParams | null => {
  const callbackUrl = searchParams.get('callback')
  const nonce = searchParams.get('nonce')
  const sessionPublicKeyHex = searchParams.get('sessionPublicKey')
  const boxPublicKeyHex = searchParams.get('boxPublicKey')
  const derivationOrigin = searchParams.get('derivationOrigin')
  const maxTimeToLive = searchParams.get('maxTimeToLive')

  if (!callbackUrl || !nonce || !sessionPublicKeyHex || !boxPublicKeyHex || !derivationOrigin) {
    return null
  }

  let ttl = 86_400_000_000_000n
  if (maxTimeToLive) {
    try {
      ttl = BigInt(maxTimeToLive)
    } catch {
      ttl = 86_400_000_000_000n
    }
  }

  return {
    callbackUrl,
    nonce,
    sessionPublicKeyHex,
    boxPublicKeyHex,
    derivationOrigin,
    maxTimeToLiveNs: ttl
  }
}

const isValidCallbackUrl = (callbackUrl: string): boolean => {
  try {
    const parsed = new URL(callbackUrl)
    return parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1' && parsed.pathname === '/callback'
  } catch {
    return false
  }
}

const normalizeDelegations = (
  delegations: Array<{
    delegation: {
      pubkey: Uint8Array
      expiration: bigint
      targets?: Array<{ toText: () => string } | string>
    }
    signature: Uint8Array
  }>
): PayloadDelegation[] => {
  return delegations.map((entry) => {
    const targets = entry.delegation.targets?.map((target) =>
      typeof target === 'string' ? target : target.toText()
    )
    return {
      delegation: {
        pubkey: Array.from(entry.delegation.pubkey),
        expiration: entry.delegation.expiration.toString(),
        targets
      },
      signature: Array.from(entry.signature)
    }
  })
}

const findExpiration = (delegations: PayloadDelegation[]): string => {
  if (delegations.length === 0) return '0'
  let min = BigInt(delegations[0].delegation.expiration)
  for (const delegation of delegations) {
    const value = BigInt(delegation.delegation.expiration)
    if (value < min) {
      min = value
    }
  }
  return min.toString()
}

const encryptPayload = async (
  payload: Record<string, unknown>,
  boxPublicKeyHex: string
): Promise<{ ciphertextHex: string; ivHex: string; ephemeralPublicKeyHex: string }> => {
  const publicKeyBytes = hexToBytes(boxPublicKeyHex)
  if (publicKeyBytes.length !== 65) {
    throw new Error('Invalid box public key')
  }

  const publicKeyBuffer = Uint8Array.from(publicKeyBytes).buffer
  const importedKey = await crypto.subtle.importKey(
    'raw',
    publicKeyBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )

  const ephemeralKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  )

  const aesKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: importedKey },
    ephemeralKeyPair.privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  )

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, payloadBytes)
  const ephemeralPublicKey = await crypto.subtle.exportKey('raw', ephemeralKeyPair.publicKey)

  return {
    ciphertextHex: bytesToHex(new Uint8Array(ciphertext)),
    ivHex: bytesToHex(iv),
    ephemeralPublicKeyHex: bytesToHex(new Uint8Array(ephemeralPublicKey))
  }
}

const CliLoginContent = () => {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState('Ready to connect Internet Identity.')
  const [error, setError] = useState<string | null>(null)
  const [principal, setPrincipal] = useState<string | null>(null)
  const [isOpening, setIsOpening] = useState(false)

  const params = useMemo(() => {
    return parseLoginParams(new URLSearchParams(searchParams.toString()))
  }, [searchParams])

  const openAuthWindow = () => {
    if (!params) {
      setError('Missing login parameters.')
      return
    }

    if (!isValidCallbackUrl(params.callbackUrl)) {
      setError('Invalid callback URL.')
      return
    }

    if (params.derivationOrigin !== window.location.origin) {
      setError('Derivation origin mismatch.')
      return
    }

    const sessionPublicKeyBytes = hexToBytes(params.sessionPublicKeyHex)
    if (sessionPublicKeyBytes.length === 0) {
      setError('Invalid session public key.')
      return
    }

    if (hexToBytes(params.boxPublicKeyHex).length !== 65) {
      setError('Invalid box public key.')
      return
    }

    const authWindow = window.open(II_AUTHORIZE_URL, 'kinic-ii', 'width=480,height=720')
    if (!authWindow) {
      setError('Popup blocked. Please allow popups and retry.')
      return
    }

    setIsOpening(true)
    setStatus('Waiting for authentication...')
    setError(null)

    const handleMessage = async (event: MessageEvent<IIAuthorizeMessage>) => {
      if (event.origin !== II_ORIGIN) {
        return
      }

      if (!event.data || !event.data.kind) {
        return
      }

      if (event.data.kind === 'authorize-ready') {
        const sessionPublicKey = sessionPublicKeyBytes
        authWindow.postMessage(
          {
            kind: 'authorize-client',
            sessionPublicKey,
            maxTimeToLive: params.maxTimeToLiveNs,
            derivationOrigin: params.derivationOrigin
          },
          II_ORIGIN
        )
        return
      }

      if (event.data.kind === 'authorize-client-failure') {
        setStatus('Login failed. Please retry.')
        setIsOpening(false)
        window.removeEventListener('message', handleMessage)
        return
      }

      if (event.data.kind === 'authorize-client-success') {
        try {
          setStatus('Saving delegation...')
          const normalizedDelegations = normalizeDelegations(event.data.delegations)
          const payload = {
            delegations: normalizedDelegations,
            userPublicKey: Array.from(event.data.userPublicKey),
            sessionPublicKey: Array.from(hexToBytes(params.sessionPublicKeyHex)),
            expirationNs: findExpiration(normalizedDelegations),
            derivationOrigin: params.derivationOrigin
          }

          const encrypted = await encryptPayload(payload, params.boxPublicKeyHex)

          const response = await fetch(params.callbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nonce: params.nonce,
              ephemeralPublicKeyHex: encrypted.ephemeralPublicKeyHex,
              ivHex: encrypted.ivHex,
              ciphertextHex: encrypted.ciphertextHex
            })
          })

          if (!response.ok) {
            throw new Error('Callback failed.')
          }

          const data = await response.json()
          const principalValue =
            typeof data === 'object' &&
            data !== null &&
            'principal' in data &&
            typeof data.principal === 'string'
              ? data.principal
              : null
          setStatus('Done. You can close this tab.')
          setPrincipal(principalValue)
          window.removeEventListener('message', handleMessage)
        } catch (requestError) {
          const message = requestError instanceof Error ? requestError.message : 'Callback failed.'
          setError(message)
          setStatus('Login failed. Please retry.')
          window.removeEventListener('message', handleMessage)
          setIsOpening(false)
        }
      }
    }

    window.addEventListener('message', handleMessage)
  }

  return (
    <main className='mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-6 py-16'>
      <section className='space-y-3'>
        <h1 className='text-3xl font-semibold'>Kinic CLI Login</h1>
        <p className='text-sm text-zinc-600'>{status}</p>
        {principal ? <p className='text-sm text-zinc-600'>Principal: {principal}</p> : null}
        {error ? <p className='text-sm text-red-600'>{error}</p> : null}
      </section>
      <button
        type='button'
        className='w-fit rounded-full border border-zinc-300 px-4 py-2 text-sm transition hover:bg-zinc-50 disabled:opacity-60'
        onClick={openAuthWindow}
        disabled={isOpening}
      >
        {isOpening ? 'Opening...' : 'Open Internet Identity'}
      </button>
    </main>
  )
}

const CliLoginPage = () => {
  return (
    <Suspense fallback={<div className='px-6 py-16 text-sm text-zinc-600'>Loading...</div>}>
      <CliLoginContent />
    </Suspense>
  )
}

export default CliLoginPage
