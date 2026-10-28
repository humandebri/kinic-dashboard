// Where: Shared layout route for every dashboard page.
// What: Sidebar navigation, header controls (memory switcher, balance, theme, account), and page outlet.
// Why: Stays mounted across client-side navigation so header state is never refetched.
import {
  BrainCircuitIcon,
  ChevronsUpDownIcon,
  CirclePlusIcon,
  DatabaseIcon,
  FileUpIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  RefreshCwIcon,
  SearchIcon,
  SendIcon,
  SettingsIcon,
  SunIcon,
  WalletIcon
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'

import CopyButton from '@/components/common/copy-button'
import KinicMark from '@/components/common/kinic-mark'
import { useBalance } from '@/components/providers/balance-provider'
import { useIdentityState } from '@/components/providers/identity-provider'
import { useMemoriesState } from '@/components/providers/memories-provider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar
} from '@/components/ui/sidebar'
import SendDialog from '@/components/wallet/send-dialog'
import { useMemoryOptions } from '@/hooks/use-memory-options'
import { shortenPrincipal } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSelectedMemory } from '@/stores/selected-memory'
import { useThemeStore, type ThemePreference } from '@/stores/theme'

type NavItem = {
  label: string
  to: string | null
  icon: ReactNode
  badge?: string | null
  match: (pathname: string) => boolean
}

const NavGroup = ({ label, items }: { label: string; items: NavItem[] }) => {
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.label}>
              {item.to ? (
                <SidebarMenuButton asChild isActive={item.match(pathname)} tooltip={item.label}>
                  <Link to={item.to} onClick={() => isMobile && setOpenMobile(false)}>
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton aria-disabled className='cursor-not-allowed opacity-50' tooltip={item.label}>
                  {item.icon}
                  <span>{item.label}</span>
                </SidebarMenuButton>
              )}
              {item.badge ? <SidebarMenuBadge>{item.badge}</SidebarMenuBadge> : null}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

const AppSidebar = () => {
  const identityState = useIdentityState()
  const selectedMemoryId = useSelectedMemory((state) => state.selectedMemoryId)
  const memoryOptions = useMemoryOptions()

  const workspace: NavItem[] = [
    {
      label: 'Memories',
      to: '/memories',
      icon: <DatabaseIcon />,
      badge: identityState.isAuthenticated ? String(memoryOptions.length) : null,
      match: (path) => path === '/memories'
    },
    { label: 'Search & Ask', to: '/search', icon: <SearchIcon />, match: (path) => path.startsWith('/search') },
    { label: 'Insert', to: '/insert', icon: <FileUpIcon />, match: (path) => path.startsWith('/insert') }
  ]
  const memory: NavItem[] = [
    {
      label: 'Memory detail',
      to: selectedMemoryId ? `/memories/${selectedMemoryId}` : null,
      icon: <BrainCircuitIcon />,
      match: (path) => /^\/memories\/(?!add$)[^/]+$/.test(path)
    },
    { label: 'Mint memory', to: '/memories/add', icon: <CirclePlusIcon />, match: (path) => path === '/memories/add' },
    { label: 'Settings', to: '/settings', icon: <SettingsIcon />, match: (path) => path.startsWith('/settings') }
  ]

  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size='lg' asChild>
              <Link to='/memories'>
                <div className='flex aspect-square size-8 items-center justify-center rounded-lg bg-brand-navy'>
                  <KinicMark className='size-5' />
                </div>
                <div className='grid flex-1 text-left leading-tight'>
                  <span className='truncate text-sm font-semibold'>Kinic</span>
                  <span className='truncate text-xs text-muted-foreground'>Memory dashboard</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavGroup label='Workspace' items={workspace} />
        <NavGroup label='Manage' items={memory} />
      </SidebarContent>
      <SidebarFooter>
        <AccountMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

const AccountMenu = () => {
  const identityState = useIdentityState()
  const { isMobile } = useSidebar()

  if (!identityState.isAuthenticated) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size='lg'
            onClick={() => void identityState.login()}
            disabled={!identityState.isReady}
            className='justify-center bg-brand text-brand-foreground hover:bg-brand/90 hover:text-brand-foreground group-data-[collapsible=icon]:!p-2'
            tooltip='Connect identity'
          >
            <WalletIcon />
            <span>Connect identity</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size='lg' className='data-[state=open]:bg-sidebar-accent' tooltip='Account'>
              <div className='flex aspect-square size-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-pink to-brand-orange text-xs font-semibold text-white'>
                {identityState.principalText?.slice(0, 2).toUpperCase()}
              </div>
              <div className='grid flex-1 text-left leading-tight'>
                <span className='truncate text-sm font-medium'>Internet Identity</span>
                <span className='truncate font-mono text-xs text-muted-foreground'>
                  {shortenPrincipal(identityState.principalText)}
                </span>
              </div>
              <ChevronsUpDownIcon className='ml-auto size-4' />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className='w-72 rounded-xl'
            side={isMobile ? 'bottom' : 'right'}
            align='end'
            sideOffset={8}
          >
            <DropdownMenuLabel className='font-normal'>
              <div className='text-xs text-muted-foreground'>Principal</div>
              <div className='mt-1 flex items-start gap-1'>
                <span className='break-all font-mono text-xs'>{identityState.principalText}</span>
                {identityState.principalText ? <CopyButton value={identityState.principalText} /> : null}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to='/settings'>
                <SettingsIcon />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              className='text-destructive focus:text-destructive'
              onClick={() => void identityState.logout()}
            >
              <LogOutIcon />
              Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

const MemorySwitcher = () => {
  const navigate = useNavigate()
  const identityState = useIdentityState()
  const { isLoading, memoryPermissions, ensureMemoryPermissions } = useMemoriesState()
  const { selectedMemoryId, setSelectedMemoryId } = useSelectedMemory()
  const memoryOptions = useMemoryOptions()

  useEffect(() => {
    ensureMemoryPermissions(memoryOptions)
  }, [memoryOptions, ensureMemoryPermissions])

  if (!identityState.isAuthenticated) return null

  return (
    <Select
      value={selectedMemoryId ?? ''}
      onValueChange={(value) => {
        setSelectedMemoryId(value || null)
        navigate(value ? `/memories/${value}` : '/memories')
      }}
      disabled={!memoryOptions.length}
    >
      <SelectTrigger className='h-9 w-auto min-w-0 max-w-[min(22rem,50vw)] gap-2 rounded-lg bg-card text-left'>
        <DatabaseIcon className='size-4 shrink-0 text-muted-foreground' />
        <span className='min-w-0 truncate font-mono text-xs'>
          <SelectValue placeholder={isLoading ? 'Loading memories…' : 'Select a memory'} />
        </span>
      </SelectTrigger>
      <SelectContent align='start' className='max-w-[calc(100vw-2rem)]'>
        {memoryOptions.map((id) => {
          const permission = memoryPermissions[id]
          const label = permission?.isLoading ? '…' : permission?.label ?? 'unknown'
          return (
            <SelectItem key={id} value={id} className='font-mono text-xs'>
              <span className='flex items-center gap-2'>
                <span className='truncate'>{id}</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-px font-sans text-[10px] font-medium',
                    label === 'admin' || label === 'writer'
                      ? 'bg-success/10 text-success'
                      : label === 'reader'
                        ? 'bg-secondary text-secondary-foreground'
                        : 'bg-muted text-muted-foreground'
                  )}
                >
                  {label}
                </span>
              </span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}

const BalanceMenu = () => {
  const identityState = useIdentityState()
  const balance = useBalance()
  const [sendOpen, setSendOpen] = useState(false)

  if (!identityState.isAuthenticated) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='outline' className='h-9 gap-2 rounded-lg px-3 tabular-nums'>
            <span className='size-2 rounded-full bg-brand' aria-hidden />
            <span className='font-mono text-xs font-medium sm:text-sm'>{balance.balanceText}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' sideOffset={8} className='w-48 rounded-xl'>
          <DropdownMenuItem onClick={() => setSendOpen(true)}>
            <SendIcon />
            Send KINIC
          </DropdownMenuItem>
          <DropdownMenuItem onClick={balance.refresh} disabled={balance.isLoading}>
            <RefreshCwIcon className={balance.isLoading ? 'animate-spin' : ''} />
            Refresh balance
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SendDialog open={sendOpen} onOpenChange={setSendOpen} />
    </>
  )
}

const ThemeMenu = () => {
  const { preference, resolved, setPreference } = useThemeStore()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon' aria-label='Change theme'>
          {resolved === 'dark' ? <MoonIcon /> : <SunIcon />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='rounded-xl'>
        <DropdownMenuRadioGroup value={preference} onValueChange={(value) => setPreference(value as ThemePreference)}>
          <DropdownMenuRadioItem value='light'>
            <SunIcon className='mr-2 size-4' /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value='dark'>
            <MoonIcon className='mr-2 size-4' /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value='system'>
            <MonitorIcon className='mr-2 size-4' /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const AppShell = () => {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className='min-w-0'>
        <div className='brand-stripe h-0.5 w-full' aria-hidden />
        <header className='sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-4'>
          <SidebarTrigger className='-ml-1' />
          <div className='mx-1 hidden h-5 w-px bg-border sm:block' aria-hidden />
          <MemorySwitcher />
          <div className='ml-auto flex items-center gap-1.5'>
            <BalanceMenu />
            <ThemeMenu />
          </div>
        </header>
        <main className='mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8'>
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default AppShell
