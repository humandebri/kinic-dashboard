// Where: Memory creation page entry.
// What: Approves the launcher and deploys a new memory canister.
// Why: Mirrors `cargo run -- --identity --ic create` in the UI.
'use client'

import { useEffect, useMemo, useState } from 'react'
import { Principal } from '@dfinity/principal'
import type { IcrcWallet } from '@dfinity/oisy-wallet-signer/icrc-wallet'
import { Principal as IcrcPrincipal } from '@icp-sdk/core/principal'

import AppShell from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useIdentityState } from '@/components/providers/identity-provider'
import { useSelectedMemory } from '@/hooks/use-selected-memory'
import { APPROVAL_TTL_NS, LAUNCHER_CANISTER_ID, LEDGER_CANISTER_ID } from '@/lib/ic-config'
import {
  approveLauncherSpend,
  createLedgerActorWithAgent,
  transferIcrc1
} from '@/lib/ledger'
import { createLauncherActor, deployMemoryInstance } from '@/lib/launcher'
import { connectOisy, connectPlug, type WalletConnection } from '@/lib/wallets'

type OisyTransferParams = Parameters<IcrcWallet['transfer']>[0]['params']

const formatPrice = (value: bigint | null) => {
  if (value === null) return '--'
  return value.toString()
}

const KINIC_DECIMALS = 100_000_000n
const EXTRA_KINIC_BASE = 300_000n
const MIN_CREATE_BASE = 100_200_000n

const AddMemoryPage = () => {
  const identityState = useIdentityState()
  const { setSelectedMemoryId } = useSelectedMemory()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState<bigint | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [isLoadingPrice, setIsLoadingPrice] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [wallet, setWallet] = useState<WalletConnection | null>(null)
  const [isConnectingWallet, setIsConnectingWallet] = useState(false)
  const [isTransferring, setIsTransferring] = useState(false)
  const [transferStatus, setTransferStatus] = useState<string | null>(null)
  const [transferHeight, setTransferHeight] = useState<bigint | null>(null)

  const canTransfer =
    Boolean(wallet && price !== null && identityState.isAuthenticated && identityState.principalText) &&
    !isTransferring

  // Add 0.003 KINIC buffer to the launcher price.
  const transferAmount = useMemo(() => {
    if (price === null) return null
    return price + EXTRA_KINIC_BASE
  }, [price])

  const meetsMinimumTransfer = Boolean(transferAmount !== null && transferAmount >= MIN_CREATE_BASE)
  const canCreate = Boolean(
    identityState.isAuthenticated &&
      name.trim() &&
      description.trim() &&
      transferHeight &&
      meetsMinimumTransfer
  )

  const formattedTransferAmount = useMemo(() => {
    if (transferAmount === null) return '--'
    const whole = transferAmount / KINIC_DECIMALS
    const fraction = transferAmount % KINIC_DECIMALS
    const padded = fraction.toString().padStart(8, '0')
    return `${whole}.${padded} KINIC`
  }, [transferAmount])

  useEffect(() => {
    let isMounted = true

    const loadPrice = async () => {
      if (!identityState.isReady) return

      setIsLoadingPrice(true)
      setStatus(null)

      try {
        const actor = await createLauncherActor(identityState.identity ?? undefined)
        const fetchedPrice = await actor.get_price()

        if (!isMounted) return
        setPrice(fetchedPrice)
      } catch (error) {
        if (!isMounted) return
        const message = error instanceof Error ? error.message : 'Failed to load price'
        setStatus(message)
      } finally {
        if (isMounted) setIsLoadingPrice(false)
      }
    }

    loadPrice()

    return () => {
      isMounted = false
    }
  }, [identityState.identity, identityState.isReady])

  const handleConnectPlug = async () => {
    setIsConnectingWallet(true)
    setTransferStatus(null)
    try {
      const connection = await connectPlug()
      setWallet(connection)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Plug connection failed'
      setTransferStatus(message)
    } finally {
      setIsConnectingWallet(false)
    }
  }

  const handleConnectOisy = async () => {
    setIsConnectingWallet(true)
    setTransferStatus(null)
    try {
      const connection = await connectOisy()
      setWallet(connection)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OISY connection failed'
      setTransferStatus(message)
    } finally {
      setIsConnectingWallet(false)
    }
  }

  const handleTransfer = async () => {
    if (!wallet || transferAmount === null || !identityState.principalText) return

    setIsTransferring(true)
    setTransferStatus(null)
    setTransferHeight(null)

    try {
      const emptySubaccount: [] = []
      const emptyMemo: [] = []
      const emptyFee: [] = []
      const createdAtTime: [bigint] = [BigInt(Date.now()) * 1_000_000n]
      // Wallet sends funds to the II principal before approve/deploy.
      const destination = Principal.fromText(identityState.principalText)
      const args = {
        from_subaccount: emptySubaccount,
        to: { owner: destination, subaccount: emptySubaccount },
        amount: transferAmount,
        fee: emptyFee,
        memo: emptyMemo,
        created_at_time: createdAtTime
      }

      if (wallet.kind === 'plug') {
        const actor = createLedgerActorWithAgent(wallet.agent)
        const height = await transferIcrc1(actor, args)
        setTransferHeight(height)
      } else {
        const ledgerSubaccount: [] | [Uint8Array] = wallet.account.subaccount
          ? [wallet.account.subaccount]
          : []
        const fromSubaccount = wallet.account.subaccount ?? undefined
        const ownerPrincipal = IcrcPrincipal.fromText(identityState.principalText)
        const icrcParams = {
          to: {
            owner: ownerPrincipal,
            subaccount: ledgerSubaccount
          },
          amount: transferAmount,
          created_at_time: BigInt(Date.now()) * 1_000_000n,
          from_subaccount: fromSubaccount
        } satisfies OisyTransferParams
        const height = await wallet.wallet.transfer({
          params: icrcParams,
          owner: wallet.account.principal,
          ledgerCanisterId: LEDGER_CANISTER_ID
        })
        setTransferHeight(height)
      }

      setTransferStatus('Transfer completed.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transfer failed'
      setTransferStatus(message)
    } finally {
      setIsTransferring(false)
    }
  }

  const handleCreate = async () => {
    if (!identityState.identity || price === null || transferAmount === null) return

    setIsCreating(true)
    setStatus(null)

    try {
      if (!meetsMinimumTransfer) {
        throw new Error('Minimum transfer is 1.002 KINIC.')
      }
      if (!transferHeight) {
        throw new Error('Please transfer funds before creating the memory.')
      }

      const now = BigInt(Date.now()) * 1_000_000n
      const expiresAt = now + APPROVAL_TTL_NS
      const launcher = Principal.fromText(LAUNCHER_CANISTER_ID)

      await approveLauncherSpend(identityState.identity, launcher, price, expiresAt)
      const memoryId = await deployMemoryInstance(identityState.identity, name.trim(), description.trim())

      setSelectedMemoryId(memoryId)
      setStatus(`Memory created: ${memoryId}`)
      setName('')
      setDescription('')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create memory'
      setStatus(message)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <AppShell pageTitle='Memories' pageSubtitle='Mint Memory' identityState={identityState}>
      <div className='grid gap-6'>
        <Card>
          <CardHeader className='flex flex-col items-start gap-2'>
            <span className='text-lg font-semibold'>Mint Memory</span>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex flex-col gap-2'>
              <label className='text-sm text-zinc-600'>Price</label>
              <div className='rounded-2xl border border-zinc-200/70 bg-white/70 px-3 py-2 text-sm'>
                <div className='flex items-center gap-2'>
                  <span className='font-mono text-sm text-zinc-900'>
                    {isLoadingPrice ? 'Loading…' : formatPrice(price)}
                  </span>
                  <span className='text-muted-foreground text-xs'>base units</span>
                </div>
              </div>
            </div>
            <div className='flex flex-col gap-2'>
              <label className='text-sm text-zinc-600'>Wallet transfer</label>
              <div className='rounded-2xl border border-zinc-200/70 bg-white/70 px-3 py-3 text-sm'>
                <div className='flex flex-wrap items-center gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    className='rounded-full'
                    onClick={handleConnectPlug}
                    disabled={isConnectingWallet}
                  >
                    {wallet?.kind === 'plug' ? 'Plug connected' : 'Connect Plug'}
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    className='rounded-full'
                    onClick={handleConnectOisy}
                    disabled={isConnectingWallet}
                  >
                    {wallet?.kind === 'oisy' ? 'OISY connected' : 'Connect OISY'}
                  </Button>
                </div>
                <div className='mt-2 space-y-1 text-xs text-zinc-600'>
                  <div>From: {wallet ? wallet.account.principal : '--'}</div>
                  <div>To (II): {identityState.principalText ?? '--'}</div>
                  <div>Amount: {formattedTransferAmount}</div>
                </div>
                <div className='mt-3 flex items-center gap-3'>
                  <Button
                    size='sm'
                    className='rounded-full'
                    onClick={handleTransfer}
                    disabled={!canTransfer || transferAmount === null}
                  >
                    {isTransferring ? 'Sending…' : 'Send transfer'}
                  </Button>
                  {transferHeight ? (
                    <span className='text-muted-foreground text-xs'>
                      Block {transferHeight.toString()}
                    </span>
                  ) : null}
                  {transferStatus ? (
                    <span className='text-muted-foreground text-xs'>{transferStatus}</span>
                  ) : null}
                </div>
              </div>
            </div>
            <div className='flex flex-col gap-2'>
              <label className='text-sm text-zinc-600'>Name</label>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder='Memory name' />
            </div>
            <div className='flex flex-col gap-2'>
              <label className='text-sm text-zinc-600'>Description</label>
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder='Short description'
              />
            </div>
            <div className='flex items-center gap-3'>
              <Button className='rounded-full' onClick={handleCreate} disabled={!canCreate || isCreating || price === null}>
                {isCreating ? 'Creating…' : 'Create'}
              </Button>
              {status ? <span className='text-muted-foreground text-sm'>{status}</span> : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}

export default AddMemoryPage
