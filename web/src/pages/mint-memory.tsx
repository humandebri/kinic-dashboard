// Where: Mint memory page (/memories/add).
// What: Optionally funds the II principal from Plug/OISY, then approves the launcher and deploys a memory.
// Why: Mirrors `cargo run -- --identity --ic create` in the UI.
import { Principal } from '@dfinity/principal'
import type { IcrcWallet } from '@dfinity/oisy-wallet-signer/icrc-wallet'
import { Principal as IcrcPrincipal } from '@icp-sdk/core/principal'
import { CheckCircle2Icon, CircleIcon, WalletIcon } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import ConnectPrompt from '@/components/common/connect-prompt'
import PageHeader from '@/components/common/page-header'
import { useBalance } from '@/components/providers/balance-provider'
import { useIdentityState } from '@/components/providers/identity-provider'
import { useMemoriesState } from '@/components/providers/memories-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { errorMessage, formatKinic, shortenPrincipal } from '@/lib/format'
import { APPROVAL_TTL_NS, LAUNCHER_CANISTER_ID, LEDGER_CANISTER_ID } from '@/lib/ic-config'
import { createLauncherActor, deployMemoryInstance } from '@/lib/launcher'
import { approveLauncherSpend, createLedgerActorWithAgent, transferIcrc1 } from '@/lib/ledger'
import { cn } from '@/lib/utils'
import { connectOisy, connectPlug, type WalletConnection } from '@/lib/wallets'
import { useSelectedMemory } from '@/stores/selected-memory'

type OisyTransferParams = Parameters<IcrcWallet['transfer']>[0]['params']

// Launcher price + 0.003 KINIC buffer for ledger fees.
const EXTRA_KINIC_BASE = 300_000n
const MIN_CREATE_BASE = 100_200_000n

const Step = ({
  index,
  title,
  description,
  done,
  children
}: {
  index: number
  title: string
  description: string
  done: boolean
  children: ReactNode
}) => (
  <Card>
    <CardHeader className='flex-row items-start gap-3 space-y-0'>
      <div
        className={cn(
          'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          done ? 'bg-success text-white' : 'bg-secondary text-secondary-foreground'
        )}
      >
        {done ? <CheckCircle2Icon className='size-4' /> : index}
      </div>
      <div className='space-y-1'>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </div>
    </CardHeader>
    <CardContent className='sm:pl-[3.75rem]'>{children}</CardContent>
  </Card>
)

const SummaryRow = ({ label, value, emphasis }: { label: string; value: ReactNode; emphasis?: boolean }) => (
  <div className='flex items-center justify-between gap-3 text-sm'>
    <span className='text-muted-foreground'>{label}</span>
    <span className={cn('font-mono tabular-nums', emphasis && 'font-semibold')}>{value}</span>
  </div>
)

const MintMemoryPage = () => {
  const identityState = useIdentityState()
  const balance = useBalance()
  const memories = useMemoriesState()
  const navigate = useNavigate()
  const setSelectedMemoryId = useSelectedMemory((state) => state.setSelectedMemoryId)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState<bigint | null>(null)
  const [priceError, setPriceError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [wallet, setWallet] = useState<WalletConnection | null>(null)
  const [isConnectingWallet, setIsConnectingWallet] = useState(false)
  const [isTransferring, setIsTransferring] = useState(false)
  const [transferHeight, setTransferHeight] = useState<bigint | null>(null)

  const transferAmount = useMemo(() => (price === null ? null : price + EXTRA_KINIC_BASE), [price])
  const hasEnoughBalance = balance.balanceBase !== null && balance.balanceBase >= MIN_CREATE_BASE
  const meetsMinimumTransfer = transferAmount !== null && transferAmount >= MIN_CREATE_BASE
  const funded = Boolean(transferHeight) || hasEnoughBalance
  const canCreate = Boolean(
    identityState.isAuthenticated && name.trim() && description.trim() && funded && meetsMinimumTransfer
  )

  useEffect(() => {
    if (!identityState.isReady) return
    let active = true
    createLauncherActor(identityState.identity ?? undefined)
      .then((actor) => actor.get_price())
      .then((value) => active && setPrice(value))
      .catch((error) => active && setPriceError(errorMessage(error, 'Failed to load price')))
    return () => {
      active = false
    }
  }, [identityState.identity, identityState.isReady])

  const handleConnect = async (kind: 'plug' | 'oisy') => {
    setIsConnectingWallet(true)
    try {
      setWallet(kind === 'plug' ? await connectPlug() : await connectOisy())
    } catch (error) {
      toast.error(`${kind === 'plug' ? 'Plug' : 'OISY'} connection failed`, {
        description: errorMessage(error, 'Connection failed')
      })
    } finally {
      setIsConnectingWallet(false)
    }
  }

  const handleTransfer = async () => {
    if (!wallet || transferAmount === null || !identityState.principalText) return
    setIsTransferring(true)
    setTransferHeight(null)
    try {
      // Wallet sends funds to the II principal before approve/deploy.
      let height: bigint
      if (wallet.kind === 'plug') {
        const actor = createLedgerActorWithAgent(wallet.agent)
        height = await transferIcrc1(actor, {
          from_subaccount: [],
          to: { owner: Principal.fromText(identityState.principalText), subaccount: [] },
          amount: transferAmount,
          fee: [],
          memo: [],
          created_at_time: [BigInt(Date.now()) * 1_000_000n]
        })
      } else {
        const icrcParams = {
          to: { owner: IcrcPrincipal.fromText(identityState.principalText), subaccount: [] },
          amount: transferAmount,
          created_at_time: BigInt(Date.now()) * 1_000_000n,
          from_subaccount: wallet.account.subaccount ?? undefined
        } satisfies OisyTransferParams
        height = await wallet.wallet.transfer({
          params: icrcParams,
          owner: wallet.account.principal,
          ledgerCanisterId: LEDGER_CANISTER_ID
        })
      }
      setTransferHeight(height)
      balance.refresh()
      toast.success('Transfer completed', { description: `Block ${height.toString()}` })
    } catch (error) {
      toast.error('Transfer failed', { description: errorMessage(error, 'Transfer failed') })
    } finally {
      setIsTransferring(false)
    }
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (!identityState.identity || price === null || !canCreate) return
    setIsCreating(true)
    try {
      const expiresAt = BigInt(Date.now()) * 1_000_000n + APPROVAL_TTL_NS
      await approveLauncherSpend(identityState.identity, Principal.fromText(LAUNCHER_CANISTER_ID), price, expiresAt)
      const memoryId = await deployMemoryInstance(identityState.identity, name.trim(), description.trim())
      setSelectedMemoryId(memoryId)
      memories.refresh()
      balance.refresh()
      toast.success('Memory created', { description: memoryId })
      navigate(`/memories/${memoryId}`)
    } catch (error) {
      toast.error('Could not create memory', { description: errorMessage(error, 'Failed to create memory') })
    } finally {
      setIsCreating(false)
    }
  }

  if (identityState.isReady && !identityState.isAuthenticated) {
    return (
      <div className='space-y-6'>
        <PageHeader title='Mint memory' description='Deploy a new memory canister owned by your identity.' />
        <ConnectPrompt description='Connect Internet Identity — the new memory will be owned by that principal.' />
      </div>
    )
  }

  return (
    <div className='space-y-6'>
      <PageHeader title='Mint memory' description='Deploy a new memory canister owned by your identity.' />

      <div className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]'>
        <div className='space-y-4'>
          <Step
            index={1}
            title='Fund your identity'
            description={
              hasEnoughBalance
                ? 'Your balance already covers the mint price — you can skip this step.'
                : 'Send KINIC from Plug or OISY to your Internet Identity principal.'
            }
            done={funded}
          >
            <div className='space-y-4'>
              <div className='flex flex-wrap gap-2'>
                {(['plug', 'oisy'] as const).map((kind) => (
                  <Button
                    key={kind}
                    variant={wallet?.kind === kind ? 'secondary' : 'outline'}
                    onClick={() => void handleConnect(kind)}
                    disabled={isConnectingWallet}
                  >
                    <WalletIcon />
                    {wallet?.kind === kind ? `${kind === 'plug' ? 'Plug' : 'OISY'} connected` : `Connect ${kind === 'plug' ? 'Plug' : 'OISY'}`}
                  </Button>
                ))}
              </div>
              <div className='grid gap-2 rounded-xl border bg-muted/40 p-4'>
                <SummaryRow label='From' value={wallet ? shortenPrincipal(wallet.account.principal, 8, 5) : '—'} />
                <SummaryRow label='To (your II)' value={shortenPrincipal(identityState.principalText, 8, 5)} />
                <SummaryRow
                  label='Amount'
                  value={transferAmount === null ? '—' : `${formatKinic(transferAmount)} KINIC`}
                  emphasis
                />
              </div>
              <div className='flex flex-wrap items-center gap-3'>
                <Button
                  onClick={() => void handleTransfer()}
                  disabled={!wallet || transferAmount === null || isTransferring}
                >
                  {isTransferring ? 'Sending…' : 'Send transfer'}
                </Button>
                {transferHeight ? <Badge variant='success'>Block {transferHeight.toString()}</Badge> : null}
              </div>
            </div>
          </Step>

          <Step index={2} title='Name your memory' description='Shown in the dashboard; you can change it later.' done={false}>
            <form className='grid gap-4' onSubmit={handleCreate}>
              <div className='grid gap-2'>
                <Label htmlFor='mint-name'>Name</Label>
                <Input
                  id='mint-name'
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder='e.g. Research notes'
                  maxLength={120}
                />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='mint-description'>Description</Label>
                <Textarea
                  id='mint-description'
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder='What will this memory hold?'
                  maxLength={500}
                  rows={3}
                />
              </div>
              <div className='flex flex-wrap items-center gap-3'>
                <Button type='submit' variant='brand' disabled={!canCreate || isCreating || price === null}>
                  {isCreating ? 'Creating…' : 'Create memory'}
                </Button>
                {!funded ? (
                  <span className='text-xs text-muted-foreground'>Fund your identity first.</span>
                ) : null}
              </div>
            </form>
          </Step>
        </div>

        <Card className='h-fit lg:sticky lg:top-20'>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-3'>
            <SummaryRow
              label='Mint price'
              value={priceError ? 'Error' : price === null ? 'Loading…' : `${formatKinic(price)} KINIC`}
            />
            <SummaryRow
              label='Your balance'
              value={balance.balanceBase === null ? '—' : `${formatKinic(balance.balanceBase)} KINIC`}
            />
            <div className='flex items-center gap-2 border-t pt-3 text-sm'>
              {funded ? (
                <CheckCircle2Icon className='size-4 text-success' />
              ) : (
                <CircleIcon className='size-4 text-muted-foreground' />
              )}
              <span className={funded ? 'text-foreground' : 'text-muted-foreground'}>
                {funded ? 'Ready to mint' : `Needs at least ${formatKinic(MIN_CREATE_BASE)} KINIC`}
              </span>
            </div>
            {priceError ? <p className='text-xs text-destructive'>{priceError}</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default MintMemoryPage
