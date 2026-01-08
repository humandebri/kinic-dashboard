// Where: Memory detail page entry.
// What: Shows the selected memory ID and exposes admin actions.
// Why: Allows running add_new_user and update_instance from the UI.
'use client'

import { useState } from 'react'
import { Principal } from '@dfinity/principal'

import AppShell from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useIdentityState } from '@/components/providers/identity-provider'
import { useSelectedMemory } from '@/hooks/use-selected-memory'
import { createMemoryActor } from '@/lib/memory'
import { createLauncherActor } from '@/lib/launcher'
import { useCanisterStatus } from '@/hooks/use-canister-status'

type RoleOption = 'admin' | 'writer' | 'reader'

const roleValueMap: Record<RoleOption, number> = {
  admin: 1,
  writer: 2,
  reader: 3
}

const MemoryDetailPage = () => {
  const identityState = useIdentityState()
  const { selectedMemoryId } = useSelectedMemory()
  const memoryId = selectedMemoryId ?? ''
  const canisterStatus = useCanisterStatus(identityState.identity, memoryId)
  const [principalInput, setPrincipalInput] = useState('')
  const [role, setRole] = useState<RoleOption>('writer')
  const [addUserStatus, setAddUserStatus] = useState<string | null>(null)
  const [updateStatus, setUpdateStatus] = useState<string | null>(null)
  const [isAddingUser, setIsAddingUser] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  const canSubmit = identityState.isAuthenticated && memoryId.length > 0

  const handleAddUser = async () => {
    if (!identityState.identity || !memoryId) return

    setIsAddingUser(true)
    setAddUserStatus(null)

    try {
      const actor = await createMemoryActor(identityState.identity, memoryId)
      if (principalInput.trim().toLowerCase() === 'anonymous') {
        throw new Error('anonymous is not allowed')
      }

      const principal = Principal.fromText(principalInput.trim())
      await actor.add_new_user(principal, roleValueMap[role])
      setAddUserStatus('User added.')
      setPrincipalInput('')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add user'
      setAddUserStatus(message)
    } finally {
      setIsAddingUser(false)
    }
  }

  const handleUpdateInstance = async () => {
    if (!identityState.identity || !memoryId) return

    setIsUpdating(true)
    setUpdateStatus(null)

    try {
      const actor = await createLauncherActor(identityState.identity)
      await actor.update_instance(memoryId)
      setUpdateStatus('Update triggered.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update instance'
      setUpdateStatus(message)
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <AppShell pageTitle='Memories' pageSubtitle='Detail' identityState={identityState}>
      <div className='grid gap-6'>
        <Card>
          <CardHeader className='flex flex-col items-start gap-2'>
            <span className='text-lg font-semibold'>Memory</span>
            <span className='text-muted-foreground text-sm'>
              {memoryId ? 'Details are not available yet.' : 'Select a memory from the header.'}
            </span>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='rounded-2xl border border-zinc-200/70 bg-white/70 px-3 py-2 text-sm'>
              <span className='text-muted-foreground'>Memory ID</span>
              <div className='font-mono text-sm text-zinc-900'>{memoryId || '--'}</div>
            </div>
            <div className='rounded-2xl border border-zinc-200/70 bg-white/70 px-3 py-2 text-sm'>
              <span className='text-muted-foreground'>Cycles balance</span>
              <div className='flex items-center justify-between gap-2'>
                <div className='font-mono text-sm text-zinc-900'>
                  {canisterStatus.cycles ? canisterStatus.cycles.toString() : '--'}
                </div>
                <Button
                  variant='ghost'
                  size='sm'
                  className='rounded-full text-xs text-zinc-500'
                  onClick={canisterStatus.refresh}
                  disabled={!canisterStatus.canRefresh}
                >
                  {canisterStatus.isLoading ? 'Refreshing...' : 'Refresh'}
                </Button>
              </div>
              {canisterStatus.error ? (
                <span className='text-rose-500 text-xs'>{canisterStatus.error}</span>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-col items-start gap-2'>
            <span className='text-lg font-semibold'>Access control</span>
            <span className='text-muted-foreground text-sm'>Run add_new_user (update).</span>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex flex-col gap-2'>
              <Input
                value={principalInput}
                onChange={(event) => setPrincipalInput(event.target.value)}
                placeholder='Principal'
              />
              <div className='flex flex-wrap items-center gap-2'>
                <select
                  className='h-9 rounded-md border border-input bg-background px-3 text-sm'
                  value={role}
                  onChange={(event) => setRole(event.target.value as RoleOption)}
                >
                  <option value='admin'>admin</option>
                  <option value='writer'>writer</option>
                  <option value='reader'>reader</option>
                </select>
                <Button
                  className='rounded-full'
                  onClick={handleAddUser}
                  disabled={!canSubmit || isAddingUser || principalInput.trim().length === 0}
                >
                  {isAddingUser ? 'Adding...' : 'Add user'}
                </Button>
              </div>
              {addUserStatus ? <span className='text-sm text-muted-foreground'>{addUserStatus}</span> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-col items-start gap-2'>
            <span className='text-lg font-semibold'>Maintenance</span>
            <span className='text-muted-foreground text-sm'>Run update_instance (update).</span>
          </CardHeader>
          <CardContent className='flex flex-col items-start gap-3'>
            <Button
              className='rounded-full'
              onClick={handleUpdateInstance}
              disabled={!canSubmit || isUpdating}
            >
              {isUpdating ? 'Updating...' : 'Trigger update'}
            </Button>
            {updateStatus ? <span className='text-sm text-muted-foreground'>{updateStatus}</span> : null}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}

export default MemoryDetailPage
