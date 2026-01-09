// Where: Dashboard header profile menu.
// What: Account dropdown with common profile actions.
// Why: Matches the reference shell navigation pattern.
'use client'

import { type ReactNode, type MouseEvent, useEffect, useState } from 'react'

import {
  UserIcon,
  SettingsIcon,
  CreditCardIcon,
  LogOutIcon,
  CopyIcon
} from 'lucide-react'

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useMounted } from '@/hooks/use-mounted'

type Props = {
  trigger: ReactNode
  defaultOpen?: boolean
  align?: 'start' | 'center' | 'end'
  name?: string
  subtitle?: string
  principalId?: string
  statusLabel?: string
  onDisconnect?: () => void
}

const ProfileDropdown = ({
  trigger,
  defaultOpen,
  align = 'end',
  name = 'Guest',
  subtitle = 'Not connected',
  principalId,
  statusLabel = 'offline',
  onDisconnect
}: Props) => {
  const mounted = useMounted()
  const [copied, setCopied] = useState(false)

  const handleCopy = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!principalId) return
    void navigator.clipboard.writeText(principalId)
    setCopied(true)
  }

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => {
      setCopied(false)
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [copied])

  if (!mounted) {
    // Skip Radix dropdown markup on SSR to prevent hydration ID mismatches.
    return <>{trigger}</>
  }

  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent className='w-80' align={align || 'end'}>
        <DropdownMenuLabel className='flex items-center gap-4 px-4 py-2.5 font-normal'>
          <div className='relative'>
            <Avatar className='size-10'>
              <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-1.png' alt='John Doe' />
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            <span className='ring-card absolute right-0 bottom-0 block size-2 rounded-full bg-green-600 ring-2' />
          </div>
          <div className='flex flex-1 flex-col items-start'>
            <span className='text-foreground text-lg font-semibold'>{name}</span>
            <div className='flex items-center gap-2'>
              <span className='text-muted-foreground text-base'>{subtitle}</span>
              {principalId ? (
                <button
                  type='button'
                  onClick={handleCopy}
                  className='rounded-full p-1 text-zinc-400 transition hover:text-zinc-700'
                  aria-label='Copy principal ID'
                >
                  <CopyIcon className='size-4' />
                </button>
              ) : null}
              {copied ? <span className='text-xs text-zinc-500'>Copied</span> : null}
            </div>
            <span className='text-muted-foreground text-xs'>Status: {statusLabel}</span>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem className='px-4 py-2.5 text-base' disabled>
            <UserIcon className='text-foreground size-5' />
            <span>My account</span>
          </DropdownMenuItem>
          <DropdownMenuItem className='px-4 py-2.5 text-base' asChild>
            <a href='/settings' className='flex items-center gap-2'>
              <SettingsIcon className='text-foreground size-5' />
              <span>Settings</span>
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem className='px-4 py-2.5 text-base' disabled>
            <CreditCardIcon className='text-foreground size-5' />
            <span>Billing</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuItem
          className='px-4 py-2.5 text-base text-red-600 focus:text-red-600'
          onClick={onDisconnect}
        >
          <LogOutIcon className='size-5' />
          <span>Disconnect</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ProfileDropdown
