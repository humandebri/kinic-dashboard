// Where: CLI login page for delegations (/cli-login).
// What: Logs into Internet Identity and posts an encrypted delegation to the CLI's loopback server.
// Why: Lets the CLI receive a delegation without server-side storage.
import { CheckCircle2Icon, FingerprintIcon, Loader2Icon, TerminalIcon, XCircleIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'

import KinicMark from '@/components/common/kinic-mark'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const II_ORIGIN = 'https://id.ai'
const II_AUTHORIZE_URL = `${II_ORIGIN}/#authorize`
const DEFAULT_TTL_NS = 86_400_000_000_000n
// Internet Identity caps delegations at 30 days; never ask for more.
const MAX_TTL_NS = 30n * DEFAULT_TTL_NS

type LoginParams = {
  callbackUrl: string
  nonce: string
  sessionPublicKey: Uint8Array
  boxPublicKeyHex: string
  derivationOrigin: string
  maxTimeToLiveNs: bigint
}

type PayloadDelegation = {
  delegation: { pubkey: number[]; expiration: string; targets?: string[] }
  signature: number[]
}

type IIDelegation = {
  delegation: { pubkey: Uint8Array; expiration: bigint; targets?: Array<{ toText: () => string } | string> }
  signature: Uint8Array
}

type IIAuthorizeMessage =
  | { kind: 'authorize-ready' }
  | { kind: 'authorize-client-success'; delegations: IIDelegation[]; userPublicKey: Uint8Array }
  | { kind: 'authorize-client-failure' }

type Phase = 'ready' | 'waiting' | 'saving' | 'done' | 'error'

const HEX_PATTERN = /^(?:[0-9a-fA-F]{2})+$/

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

// Returns null for anything that is not well-formed, even-length hex.
const hexToBytes = (hexValue: string): Uint8Array | null => {
  const clean = hexValue.trim()
  if (!HEX_PATTERN.test(clean)) return null
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = Number.parseInt(clean.slice(i, i + 2), 16)
  }
  return bytes
}

const isValidCallbackUrl = (callbackUrl: string): boolean => {
  try {
    const parsed = new URL(callbackUrl)
    return (
      parsed.protocol === 'http:' &&
      parsed.hostname === '127.0.0.1' &&
      parsed.pathname === '/callback' &&
      !parsed.username &&
      !parsed.password
    )
  } catch {
    return false
  }
}

const parseLoginParams = (searchParams: URLSearchParams): { params: LoginParams | null; error: string | null } => {
  const callbackUrl = searchParams.get('callback')
  const nonce = searchParams.get('nonce')
  const sessionPublicKeyHex = searchParams.get('sessionPublicKey')
  const boxPublicKeyHex = searchParams.get('boxPublicKey')
  const derivationOrigin = searchParams.get('derivationOrigin')
  const maxTimeToLive = searchParams.get('maxTimeToLive')

  if (!callbackUrl || !nonce || !sessionPublicKeyHex || !boxPublicKeyHex || !derivationOrigin) {
    return { params: null, error: 'Missing login parameters. Start the login from the Kinic CLI.' }
  }
  if (!isValidCallbackUrl(callbackUrl)) return { params: null, error: 'Invalid callback URL.' }
  if (derivationOrigin !== window.location.origin) return { params: null, error: 'Derivation origin mismatch.' }
  if (!/^[0-9a-fA-F]{16,128}$/.test(nonce)) return { params: null, error: 'Invalid nonce.' }

  const sessionPublicKey = hexToBytes(sessionPublicKeyHex)
  if (!sessionPublicKey || sessionPublicKey.length < 32 || sessionPublicKey.length > 256) {
    return { params: null, error: 'Invalid session public key.' }
  }
  if (hexToBytes(boxPublicKeyHex)?.length !== 65) return { params: null, error: 'Invalid box public key.' }

  let ttl = DEFAULT_TTL_NS
  if (maxTimeToLive && /^\d{1,20}$/.test(maxTimeToLive)) {
    ttl = BigInt(maxTimeToLive)
  }
  if (ttl <= 0n || ttl > MAX_TTL_NS) ttl = DEFAULT_TTL_NS

  return {
    params: { callbackUrl, nonce, sessionPublicKey, boxPublicKeyHex, derivationOrigin, maxTimeToLiveNs: ttl },
    error: null
  }
}

const normalizeDelegations = (delegations: IIDelegation[]): PayloadDelegation[] =>
  delegations.map((entry) => ({
    delegation: {
      pubkey: Array.from(entry.delegation.pubkey),
      expiration: entry.delegation.expiration.toString(),
      targets: entry.delegation.targets?.map((target) => (typeof target === 'string' ? target : target.toText()))
    },
    signature: Array.from(entry.signature)
  }))

const findExpiration = (delegations: PayloadDelegation[]): string => {
  if (delegations.length === 0) return '0'
  return delegations
    .map((item) => BigInt(item.delegation.expiration))
    .reduce((min, value) => (value < min ? value : min))
    .toString()
}

const encryptPayload = async (payload: Record<string, unknown>, boxPublicKeyHex: string) => {
  const publicKeyBytes = hexToBytes(boxPublicKeyHex)
  if (!publicKeyBytes || publicKeyBytes.length !== 65) throw new Error('Invalid box public key')

  const importedKey = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(publicKeyBytes).buffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )
  const ephemeralKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey'])
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: importedKey },
    ephemeralKeyPair.privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  )
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new TextEncoder().encode(JSON.stringify(payload))
  )
  const ephemeralPublicKey = await crypto.subtle.exportKey('raw', ephemeralKeyPair.publicKey)

  return {
    ciphertextHex: bytesToHex(new Uint8Array(ciphertext)),
    ivHex: bytesToHex(iv),
    ephemeralPublicKeyHex: bytesToHex(new Uint8Array(ephemeralPublicKey))
  }
}

const CliLoginPage = () => {
  const [searchParams] = useSearchParams()
  const [phase, setPhase] = useState<Phase>('ready')
  const [error, setError] = useState<string | null>(null)
  const [principal, setPrincipal] = useState<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  const { params, error: paramsError } = useMemo(() => parseLoginParams(searchParams), [searchParams])

  useEffect(() => () => cleanupRef.current?.(), [])

  const openAuthWindow = () => {
    if (!params) return
    cleanupRef.current?.()

    const authWindow = window.open(II_AUTHORIZE_URL, 'kinic-ii', 'width=480,height=720')
    if (!authWindow) {
      setError('Popup blocked. Allow popups for this site and retry.')
      setPhase('error')
      return
    }

    setPhase('waiting')
    setError(null)
    let finished = false

    const finish = () => {
      finished = true
      window.removeEventListener('message', handleMessage)
      window.clearInterval(closedPoll)
      cleanupRef.current = null
    }

    const fail = (message: string) => {
      finish()
      setError(message)
      setPhase('error')
    }

    const handleMessage = async (event: MessageEvent<IIAuthorizeMessage>) => {
      // Only trust messages from the II window this page opened.
      if (event.origin !== II_ORIGIN || event.source !== authWindow || finished) return
      const data = event.data
      if (!data || typeof data !== 'object' || !('kind' in data)) return

      if (data.kind === 'authorize-ready') {
        authWindow.postMessage(
          {
            kind: 'authorize-client',
            sessionPublicKey: params.sessionPublicKey,
            maxTimeToLive: params.maxTimeToLiveNs,
            derivationOrigin: params.derivationOrigin
          },
          II_ORIGIN
        )
        return
      }

      if (data.kind === 'authorize-client-failure') {
        fail('Internet Identity reported a login failure. Please retry.')
        return
      }

      if (data.kind === 'authorize-client-success') {
        finish()
        setPhase('saving')
        try {
          const delegations = normalizeDelegations(data.delegations)
          const encrypted = await encryptPayload(
            {
              delegations,
              userPublicKey: Array.from(data.userPublicKey),
              sessionPublicKey: Array.from(params.sessionPublicKey),
              expirationNs: findExpiration(delegations),
              derivationOrigin: params.derivationOrigin
            },
            params.boxPublicKeyHex
          )

          const response = await fetch(params.callbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nonce: params.nonce, ...encrypted })
          })
          if (!response.ok) throw new Error(`The CLI rejected the delegation (HTTP ${response.status}).`)

          const result: unknown = await response.json().catch(() => null)
          const principalValue =
            result && typeof result === 'object' && typeof Reflect.get(result, 'principal') === 'string'
              ? (Reflect.get(result, 'principal') as string)
              : null
          setPrincipal(principalValue)
          setPhase('done')
        } catch (requestError) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Could not reach the CLI. Make sure `kinic login` is still running.'
          )
          setPhase('error')
        }
      }
    }

    const closedPoll = window.setInterval(() => {
      if (authWindow.closed && !finished) fail('The Internet Identity window was closed before login completed.')
    }, 500)

    window.addEventListener('message', handleMessage)
    cleanupRef.current = finish
  }

  const effectiveError = paramsError ?? error
  const busy = phase === 'waiting' || phase === 'saving'

  return (
    <div className='flex min-h-dvh items-center justify-center bg-background px-4 py-12'>
      <div className='w-full max-w-md space-y-6'>
        <div className='flex items-center justify-center gap-3'>
          <div className='flex size-10 items-center justify-center rounded-xl bg-brand-navy'>
            <KinicMark className='size-6' />
          </div>
          <div className='text-lg font-semibold'>Kinic CLI</div>
        </div>
        <Card className='overflow-hidden'>
          <div className='brand-stripe h-1' aria-hidden />
          <CardContent className='space-y-6 p-6 pt-6 sm:p-8 sm:pt-8'>
            <div className='flex flex-col items-center gap-3 text-center'>
              <div
                className={
                  phase === 'done'
                    ? 'text-success'
                    : effectiveError
                      ? 'text-destructive'
                      : 'text-muted-foreground'
                }
              >
                {phase === 'done' ? (
                  <CheckCircle2Icon className='size-10' />
                ) : effectiveError ? (
                  <XCircleIcon className='size-10' />
                ) : busy ? (
                  <Loader2Icon className='size-10 animate-spin text-brand' />
                ) : (
                  <TerminalIcon className='size-10' />
                )}
              </div>
              <h1 className='text-xl font-semibold tracking-tight'>
                {phase === 'done'
                  ? 'You’re signed in'
                  : phase === 'saving'
                    ? 'Sending to the CLI…'
                    : phase === 'waiting'
                      ? 'Waiting for Internet Identity…'
                      : 'Sign in to the Kinic CLI'}
              </h1>
              <p className='text-sm text-muted-foreground'>
                {phase === 'done'
                  ? 'The delegation was delivered to your terminal. You can close this tab.'
                  : 'Authenticate with Internet Identity. The delegation is encrypted and sent only to the CLI running on this computer.'}
              </p>
            </div>

            {principal ? (
              <div className='rounded-lg border bg-muted/50 px-3 py-2 text-center'>
                <div className='text-xs text-muted-foreground'>Principal</div>
                <div className='break-all font-mono text-xs'>{principal}</div>
              </div>
            ) : null}

            {effectiveError ? (
              <div role='alert' className='rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive'>
                {effectiveError}
              </div>
            ) : null}

            {phase !== 'done' ? (
              <Button
                variant='brand'
                size='lg'
                className='w-full'
                onClick={openAuthWindow}
                disabled={!params || phase === 'saving'}
              >
                <FingerprintIcon />
                {phase === 'waiting' ? 'Reopen Internet Identity' : phase === 'error' ? 'Try again' : 'Continue with Internet Identity'}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default CliLoginPage
