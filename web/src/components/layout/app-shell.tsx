// Where: Shared shell layout for Kinic pages.
// What: Renders sidebar, header controls, and footer around page content.
// Why: Keeps navigation and identity controls consistent across pages.
'use client'

import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type ReactNode
} from 'react'
import { GithubIcon, RefreshCwIcon, TwitterIcon, UserIcon } from 'lucide-react'
import { Principal } from '@dfinity/principal'
import { useRouter } from 'next/navigation'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger
} from '@/components/ui/sidebar'

import ProfileDropdown from '@/components/shadcn-studio/blocks/dropdown-profile'
import { primarySection, pageSections } from '@/data/dashboard-nav'
import { useBalance } from '@/components/providers/balance-provider'
import { useMemoriesState } from '@/components/providers/memories-provider'
import type { IdentityState } from '@/hooks/use-identity'
import { createLedgerActor, transferIcrc1 } from '@/lib/ledger'
import { useMounted } from '@/hooks/use-mounted'
import { useSelectedMemory } from '@/hooks/use-selected-memory'

type AppShellProps = {
  pageTitle: string
  pageSubtitle?: string
  identityState: IdentityState
  showFooter?: boolean
  fullWidth?: boolean
  children: ReactNode
}

const KINIC_DECIMALS = 100_000_000n
const CUSTOM_CANISTERS_KEY = 'kinic.custom-canisters'

const shortenPrincipal = (principalText: string | null): string => {
  if (!principalText) return 'Not connected'
  if (principalText.length <= 10) return principalText
  return `${principalText.slice(0, 6)}...${principalText.slice(-4)}`
}

const formatKinicInput = (baseAmount: bigint): string => {
  const whole = baseAmount / KINIC_DECIMALS
  const fraction = baseAmount % KINIC_DECIMALS
  const padded = fraction.toString().padStart(8, '0')
  const trimmed = padded.replace(/0+$/, '')
  return trimmed ? `${whole}.${trimmed}` : `${whole}`
}

const parseKinicInput = (rawValue: string): { value: bigint | null; error?: string } => {
  const trimmed = rawValue.trim()
  if (!trimmed) {
    return { value: null, error: 'Amount is required.' }
  }

  const parts = trimmed.split('.')
  if (parts.length > 2) {
    return { value: null, error: 'Invalid amount format.' }
  }

  const [wholePart, fractionPart = ''] = parts
  if (!/^\d+$/.test(wholePart) || (fractionPart && !/^\d+$/.test(fractionPart))) {
    return { value: null, error: 'Amount must be numeric.' }
  }
  if (fractionPart.length > 8) {
    return { value: null, error: 'Amount precision is too high.' }
  }

  const whole = BigInt(wholePart || '0')
  const fraction = BigInt(fractionPart.padEnd(8, '0') || '0')
  return { value: whole * KINIC_DECIMALS + fraction }
}

const AppShell = ({
  pageTitle,
  pageSubtitle,
  identityState,
  showFooter = false,
  fullWidth = false,
  children
}: AppShellProps) => {
  const mounted = useMounted()
  const balance = useBalance()
  const { memories, memoryPermissions, ensureMemoryPermissions } = useMemoriesState()
  const { selectedMemoryId, setSelectedMemoryId } = useSelectedMemory()
  const router = useRouter()
  const [customCanisters, setCustomCanisters] = useState<string[]>([])
  const [sendModalOpen, setSendModalOpen] = useState(false)
  const [toAddress, setToAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [sendSuccess, setSendSuccess] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(CUSTOM_CANISTERS_KEY)
    if (!stored) return
    try {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        setCustomCanisters(parsed.filter((item): item is string => typeof item === 'string'))
      }
    } catch {
      // Ignore invalid stored data.
    }
  }, [])

  const memoryOptionIds = useMemo(() => {
    const merged = new Set<string>()
    for (const item of customCanisters) merged.add(item)
    if (selectedMemoryId) merged.add(selectedMemoryId)
    for (const memory of memories) {
      if (memory.principalText) merged.add(memory.principalText)
    }
    return Array.from(merged)
  }, [customCanisters, selectedMemoryId, memories])

  const memoryOptions = useMemo(() => {
    return memoryOptionIds.map((id) => {
      const permission = memoryPermissions[id]
      const permissionLabel = identityState.isAuthenticated
        ? permission?.isLoading
          ? '...'
          : permission?.label ?? 'unknown'
        : 'not connected'
      return {
        id,
        label: `${id} (${permissionLabel})`
      }
    })
  }, [memoryOptionIds, memoryPermissions, identityState.isAuthenticated])
  const [sendLoading, setSendLoading] = useState(false)
  const memoryCount = identityState.isAuthenticated ? String(memoryOptions.length) : '0'
  const isSendDisabled = sendLoading || !identityState.isAuthenticated
  const sendAmountDisplay = useMemo(() => {
    if (balance.balanceBase === null) return '--'
    return formatKinicInput(balance.balanceBase)
  }, [balance.balanceBase])

  useEffect(() => {
    ensureMemoryPermissions(memoryOptionIds)
  }, [memoryOptionIds, ensureMemoryPermissions])

  const openSendModal = () => {
    setSendModalOpen(true)
    setSendError(null)
    setSendSuccess(null)
  }

  const handleBalanceRefreshClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    balance.refresh()
  }

  const handleBalanceRefreshPointerDown = (event: MouseEvent) => {
    event.stopPropagation()
  }

  const handleBalanceRefreshKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    if (balance.isLoading) return
    balance.refresh()
  }

  useEffect(() => {
    if (!sendModalOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSendModalOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sendModalOpen])

  const handleMaxAmount = () => {
    if (balance.balanceBase === null) return
    setAmount(formatKinicInput(balance.balanceBase))
  }

  const handleSendSubmit = async () => {
    if (!identityState.identity) {
      setSendError('Connect identity to send.')
      return
    }

    let destination: Principal
    try {
      destination = Principal.fromText(toAddress.trim())
    } catch {
      setSendError('Invalid destination principal.')
      return
    }

    const parsed = parseKinicInput(amount)
    if (!parsed.value) {
      setSendError(parsed.error ?? 'Invalid amount.')
      return
    }

    setSendLoading(true)
    setSendError(null)
    setSendSuccess(null)

    try {
      const emptySubaccount: [] = []
      const emptyMemo: [] = []
      const emptyFee: [] = []
      const createdAtTime: [bigint] = [BigInt(Date.now()) * 1_000_000n]
      const actor = await createLedgerActor(identityState.identity)
      const height = await transferIcrc1(actor, {
        from_subaccount: emptySubaccount,
        to: { owner: destination, subaccount: emptySubaccount },
        amount: parsed.value,
        fee: emptyFee,
        memo: emptyMemo,
        created_at_time: createdAtTime
      })
      setSendSuccess(`Transfer submitted (block ${height.toString()}).`)
      balance.refresh()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transfer failed.'
      setSendError(message)
    } finally {
      setSendLoading(false)
    }
  }

  return (
    <div className='flex min-h-dvh w-full'>
      <SidebarProvider>
        <Sidebar>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {primarySection.items.map((item) => (
                    <SidebarMenuItem key={item.label}>
                      <SidebarMenuButton asChild>
                        <a href={item.href}>
                          {item.icon}
                          <span>{item.label}</span>
                        </a>
                      </SidebarMenuButton>
                      {item.badge ? (
                        <SidebarMenuBadge className='bg-primary/10 rounded-full'>
                          {item.badge}
                        </SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            {pageSections.map((section) => (
              <SidebarGroup key={section.label ?? 'section'}>
                {section.label ? <SidebarGroupLabel>{section.label}</SidebarGroupLabel> : null}
                <SidebarGroupContent>
                  <SidebarMenu>
                    {section.items.map((item) => {
                      const isMemoryDetail = item.label === 'Memory Detail'
                      const isMemoriesList = item.label === 'Memories'
                      const href =
                        isMemoryDetail && selectedMemoryId
                          ? `/memories/${selectedMemoryId}`
                          : item.href
                      const isDisabled = Boolean(
                        item.disabled || href === '#' || (isMemoryDetail && !selectedMemoryId)
                      )
                      const badge = isMemoriesList ? memoryCount : item.badge

                      return (
                        <SidebarMenuItem key={item.label}>
                          {isDisabled ? (
                            <SidebarMenuButton aria-disabled className='cursor-not-allowed'>
                              {item.icon}
                              <span>{item.label}</span>
                            </SidebarMenuButton>
                          ) : (
                            <SidebarMenuButton asChild>
                              <a href={href}>
                                {item.icon}
                                <span>{item.label}</span>
                              </a>
                            </SidebarMenuButton>
                          )}
                          {badge ? (
                            <SidebarMenuBadge className='bg-primary/10 rounded-full'>
                              {badge}
                            </SidebarMenuBadge>
                          ) : null}
                        </SidebarMenuItem>
                      )
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>
        </Sidebar>
        <div className='flex flex-1 flex-col'>
          <header className='bg-card sticky top-0 z-50 border-b'>
            <div className='mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-2 sm:px-6'>
              <div className='flex items-center gap-4'>
                <SidebarTrigger className='[&_svg]:!size-5' />
                <Separator orientation='vertical' className='hidden !h-4 sm:block' />
                <Breadcrumb className='hidden sm:block'>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink href='/'>Home</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      {pageSubtitle ? (
                        <BreadcrumbLink href='#'>{pageTitle}</BreadcrumbLink>
                      ) : (
                        <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
                      )}
                    </BreadcrumbItem>
                    {pageSubtitle ? (
                      <>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                          <BreadcrumbPage>{pageSubtitle}</BreadcrumbPage>
                        </BreadcrumbItem>
                      </>
                    ) : null}
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
              <div className='flex items-center gap-1.5'>
                {identityState.isAuthenticated ? (
                  <div className='flex items-center gap-2 rounded-full border border-zinc-200/70 bg-white/80 px-3 text-xs text-zinc-600 shadow-sm backdrop-blur'>
                    <Select
                      value={selectedMemoryId ?? ''}
                      onValueChange={(value) => {
                        const nextId = value || null
                        setSelectedMemoryId(nextId)
                        if (nextId) {
                          router.push(`/memories/${nextId}`)
                        } else {
                          router.push('/memories')
                        }
                      }}
                      disabled={!memoryOptions.length}
                    >
                      <SelectTrigger className='h-7 w-[320px] border-none bg-transparent px-0 shadow-none focus:ring-0'>
                        <SelectValue placeholder={memories.isLoading ? 'Loading…' : 'Select'} />
                      </SelectTrigger>
                      <SelectContent>
                        {memoryOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                {identityState.isAuthenticated ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type='button'
                        className='flex items-center gap-1.5 rounded-full border border-zinc-200/70 bg-white/80 px-3 text-sm text-zinc-700 shadow-sm backdrop-blur transition hover:bg-zinc-100/80'
                      >
                        <span className='font-medium'>{balance.balanceText}</span>
                        <Button
                          asChild
                          variant='ghost'
                          size='icon'
                          className='size-7 rounded-full text-zinc-500'
                        >
                          <span
                            role='button'
                            tabIndex={0}
                            aria-disabled={balance.isLoading}
                            onClick={balance.isLoading ? undefined : handleBalanceRefreshClick}
                            onPointerDown={handleBalanceRefreshPointerDown}
                            onKeyDown={handleBalanceRefreshKeyDown}
                          >
                            <RefreshCwIcon className={balance.isLoading ? 'animate-spin' : ''} />
                            <span className='sr-only'>Reload balance</span>
                          </span>
                        </Button>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end' sideOffset={8}>
                      <DropdownMenuItem onClick={openSendModal}>Send</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
                {identityState.isAuthenticated ? null : (
                  <Button size='sm' onClick={identityState.login} disabled={!identityState.isReady}>
                    Connect Identity
                  </Button>
                )}
                <ProfileDropdown
                  name={identityState.isAuthenticated ? 'Connected' : 'Guest'}
                  subtitle={shortenPrincipal(identityState.principalText)}
                  principalId={identityState.principalText ?? undefined}
                  statusLabel={identityState.isAuthenticated ? 'online' : 'offline'}
                  onDisconnect={identityState.logout}
                  trigger={
                    <Button
                      variant='ghost'
                      size='icon'
                      className='size-7 rounded-full border border-zinc-200/70 bg-white/80 text-zinc-700 shadow-sm backdrop-blur'
                    >
                      <UserIcon />
                    </Button>
                  }
                />
              </div>
            </div>
          </header>
          <main
            className={
              fullWidth
                ? 'mx-auto w-full flex-1 px-3 py-4 sm:px-4'
                : 'mx-auto w-full max-w-7xl flex-1 px-3 py-4 sm:px-4'
            }
          >
            {children}
          </main>
          {showFooter && mounted ? (
            <footer>
              <div className='text-muted-foreground mx-auto flex size-full max-w-7xl items-center justify-between gap-3 px-4 py-3 max-sm:flex-col sm:gap-6 sm:px-6'>
                <p className='text-sm text-balance max-sm:text-center'>
                  {`(c)${new Date().getFullYear()}`}{' '}
                  <a href='#' className='text-primary'>
                    Kinic
                  </a>
                  , Personal memory workspace
                </p>
                <div className='flex items-center gap-5'>
                  <a href='#' aria-label='Twitter'>
                    <TwitterIcon className='size-4' />
                  </a>
                  <a href='#' aria-label='GitHub'>
                    <GithubIcon className='size-4' />
                  </a>
                </div>
              </div>
            </footer>
          ) : null}
          {sendModalOpen ? (
            <div
              className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4'
              onClick={() => setSendModalOpen(false)}
              role='presentation'
            >
              <div
                className='w-96 max-w-full rounded-2xl bg-white p-6 shadow-xl'
                onClick={(event) => event.stopPropagation()}
              >
                <div className='flex items-center justify-between'>
                  <h2 className='text-lg font-semibold text-zinc-900'>Send KINIC</h2>
                </div>
                <div className='mt-4 space-y-4'>
                  <div className='space-y-2'>
                    <label className='text-sm text-zinc-600'>To Address</label>
                    <Input
                      value={toAddress}
                      onChange={(event) => setToAddress(event.target.value)}
                      placeholder='Principal'
                    />
                  </div>
                  <div className='space-y-2'>
                    <label className='text-sm text-zinc-600'>Amount (KINIC)</label>
                    <div className='flex items-center gap-2'>
                      <Input
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        placeholder={sendAmountDisplay}
                      />
                      <Button
                        variant='outline'
                        size='sm'
                        className='rounded-full'
                        onClick={handleMaxAmount}
                        disabled={balance.balanceBase === null}
                      >
                        Max
                      </Button>
                    </div>
                  </div>
                  {sendError ? (
                    <div className='rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600'>
                      {sendError}
                    </div>
                  ) : null}
                  {sendSuccess ? (
                    <div className='rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-600'>
                      {sendSuccess}
                    </div>
                  ) : null}
                  <div className='flex items-center justify-end gap-2'>
                    <Button
                      variant='outline'
                      onClick={() => setSendModalOpen(false)}
                      disabled={sendLoading}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleSendSubmit} disabled={isSendDisabled}>
                      {sendLoading ? 'Sending...' : 'Send'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </SidebarProvider>
    </div>
  )
}

export default AppShell
