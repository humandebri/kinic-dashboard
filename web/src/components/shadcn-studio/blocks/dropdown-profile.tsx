// Where: Dashboard header profile menu.
// What: Account dropdown with common profile actions.
// Why: Matches the reference shell navigation pattern.
'use client'

import type { ReactNode } from 'react'

import {
  UserIcon,
  SettingsIcon,
  CreditCardIcon,
  LogOutIcon
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
  statusLabel?: string
  onDisconnect?: () => void
}

const ProfileDropdown = ({
  trigger,
  defaultOpen,
  align = 'end',
  name = 'Guest',
  subtitle = 'Not connected',
  statusLabel = 'offline',
  onDisconnect
}: Props) => {
  const mounted = useMounted()

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
            <span className='text-muted-foreground text-base'>{subtitle}</span>
            <span className='text-muted-foreground text-xs'>Status: {statusLabel}</span>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem className='px-4 py-2.5 text-base'>
            <UserIcon className='text-foreground size-5' />
            <span>My account</span>
          </DropdownMenuItem>
          <DropdownMenuItem className='px-4 py-2.5 text-base'>
            <SettingsIcon className='text-foreground size-5' />
            <span>Settings</span>
          </DropdownMenuItem>
          <DropdownMenuItem className='px-4 py-2.5 text-base'>
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
