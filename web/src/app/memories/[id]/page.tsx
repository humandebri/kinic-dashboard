// Where: Memory detail page entry.
// What: Shows the selected memory ID and exposes admin actions.
// Why: Allows running add_new_user and update_instance from the UI.
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Principal } from '@dfinity/principal'
import { useParams } from 'next/navigation'

import AppShell from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useIdentityState } from '@/components/providers/identity-provider'
import { useSelectedMemory } from '@/hooks/use-selected-memory'
import { createMemoryActor, fetchMemoryCycles, fetchMemoryVersion } from '@/lib/memory'
import {
  fetchSharedMemories,
  registerSharedMemory,
  updateMemoryInstanceWithOption
} from '@/lib/launcher'

type RoleOption = 'admin' | 'writer' | 'reader'

const roleValueMap: Record<RoleOption, number> = {
  admin: 1,
  writer: 2,
  reader: 3
}

const MemoryDetailPage = () => {
  const identityState = useIdentityState()
  const { selectedMemoryId } = useSelectedMemory()
  const params = useParams()
  const routeId = params?.id
  const routeMemoryId = Array.isArray(routeId) ? routeId[0] : routeId
  const memoryId = (routeMemoryId ?? selectedMemoryId ?? '').trim()
  const [principalInput, setPrincipalInput] = useState('')
  const [role, setRole] = useState<RoleOption>('writer')
  const [addUserStatus, setAddUserStatus] = useState<string | null>(null)
  const [updateStatus, setUpdateStatus] = useState<string | null>(null)
  const [isAddingUser, setIsAddingUser] = useState(false)
  const [isUpdatingWithOption, setIsUpdatingWithOption] = useState(false)
  const [launcherCycles, setLauncherCycles] = useState<bigint | null>(null)
  const [launcherMetaStatus, setLauncherMetaStatus] = useState<string | null>(null)
  const [isLoadingLauncherMeta, setIsLoadingLauncherMeta] = useState(false)
  const [instanceVersion, setInstanceVersion] = useState<string | null>(null)
  const [versionError, setVersionError] = useState<string | null>(null)
  const [sharedMemories, setSharedMemories] = useState<string[]>([])
  const [sharedError, setSharedError] = useState<string | null>(null)
  const [isRegisteringShared, setIsRegisteringShared] = useState(false)
  const [sharedStatus, setSharedStatus] = useState<string | null>(null)

  const canSubmit = identityState.isAuthenticated && memoryId.length > 0

  const isSharedMemory = useMemo(() => {
    return memoryId.length > 0 && sharedMemories.includes(memoryId)
  }, [memoryId, sharedMemories])

  const loadLauncherMeta = useCallback(async () => {
    if (!memoryId) return
    setIsLoadingLauncherMeta(true)
    setLauncherMetaStatus(null)
    setVersionError(null)
    setSharedError(null)

    fetchMemoryCycles(identityState.identity ?? undefined, memoryId)
      .then((value) => {
        setLauncherCycles(value)
      })
      .catch(() => {
        setLauncherCycles(null)
        setLauncherMetaStatus('Failed to load launcher cycles.')
      })
      .finally(() => {
        setIsLoadingLauncherMeta(false)
      })

    fetchMemoryVersion(identityState.identity ?? undefined, memoryId)
      .then((value) => {
        setInstanceVersion(value)
      })
      .catch(() => {
        setInstanceVersion(null)
        setVersionError('Failed to load version.')
      })

    fetchSharedMemories(identityState.identity ?? undefined)
      .then((value) => {
        setSharedMemories(value.map((principal) => principal.toText()))
      })
      .catch(() => {
        setSharedMemories([])
        setSharedError('Failed to load shared memories.')
      })
  }, [identityState.identity, memoryId])

  useEffect(() => {
    if (!memoryId) {
      console.info('[memories] missing memoryId', {
        routeMemoryId,
        selectedMemoryId
      })
      return
    }
    console.info('[memories] loadLauncherMeta', {
      memoryId,
      routeMemoryId,
      selectedMemoryId
    })
    loadLauncherMeta()
  }, [loadLauncherMeta, memoryId, routeMemoryId, selectedMemoryId])

  const handleAddUser = async () => {
    if (!identityState.identity || !memoryId) return

    setIsAddingUser(true)
    setAddUserStatus(null)

    try {
      console.info('[memories] add_new_user', {
        memoryId,
        role,
        principalInput: principalInput.trim()
      })
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

  const handleUpdateInstanceWithOption = async () => {
    if (!identityState.identity || !memoryId) return

    setIsUpdatingWithOption(true)
    setUpdateStatus(null)

    try {
      console.info('[memories] update_instance_with_option', {
        memoryId,
        option: false
      })
      await updateMemoryInstanceWithOption(identityState.identity, memoryId, false)
      setUpdateStatus('Update triggered.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update instance'
      setUpdateStatus(message)
    } finally {
      setIsUpdatingWithOption(false)
    }
  }

  const handleRegisterShared = async () => {
    if (!identityState.identity || !memoryId) return

    setIsRegisteringShared(true)
    setSharedStatus(null)

    try {
      console.info('[memories] register_shared_memory', {
        memoryId
      })
      const principal = Principal.fromText(memoryId)
      await registerSharedMemory(identityState.identity, principal)
      setSharedStatus('Shared memory registered.')
      loadLauncherMeta()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to register shared memory'
      setSharedStatus(message)
    } finally {
      setIsRegisteringShared(false)
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
              <span className='text-muted-foreground'>Launcher cycles</span>
              <div className='flex items-center justify-between gap-2'>
                <div className='font-mono text-sm text-zinc-900'>
                  {launcherCycles !== null ? launcherCycles.toString() : '--'}
                </div>
                <Button
                  variant='ghost'
                  size='sm'
                  className='rounded-full text-xs text-zinc-500'
                  onClick={loadLauncherMeta}
                  disabled={!memoryId || isLoadingLauncherMeta}
                >
                  {isLoadingLauncherMeta ? 'Refreshing...' : 'Refresh'}
                </Button>
              </div>
              {launcherMetaStatus ? (
                <span className='text-rose-500 text-xs'>{launcherMetaStatus}</span>
              ) : null}
            </div>
            <div className='rounded-2xl border border-zinc-200/70 bg-white/70 px-3 py-2 text-sm'>
              <span className='text-muted-foreground'>Version</span>
              <div className='font-mono text-sm text-zinc-900'>{instanceVersion ?? '--'}</div>
              {versionError ? <span className='text-rose-500 text-xs'>{versionError}</span> : null}
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
                  onChange={(event) => {
                    const nextRole = event.target.value
                    if (nextRole === 'admin' || nextRole === 'writer' || nextRole === 'reader') {
                      setRole(nextRole)
                    }
                  }}
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
            <span className='text-muted-foreground text-sm'>Run update_instance_with_option (update).</span>
          </CardHeader>
          <CardContent className='flex flex-col items-start gap-3'>
            <Button
              variant='outline'
              className='rounded-full'
              onClick={handleUpdateInstanceWithOption}
              disabled={!canSubmit || isUpdatingWithOption}
            >
              {isUpdatingWithOption ? 'Updating...' : 'Trigger update (option)'}
            </Button>
            {updateStatus ? <span className='text-sm text-muted-foreground'>{updateStatus}</span> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='flex flex-col items-start gap-2'>
            <span className='text-lg font-semibold'>Shared memory</span>
            <span className='text-muted-foreground text-sm'>Register or list shared memories.</span>
          </CardHeader>
          <CardContent className='flex flex-col items-start gap-3'>
            <div className='text-xs text-zinc-600'>
              {sharedMemories.length
                ? `${sharedMemories.length} shared memory item(s)`
                : 'No shared memories registered.'}
            </div>
            {sharedError ? <span className='text-xs text-rose-500'>{sharedError}</span> : null}
            {memoryId ? (
              <div className='text-xs text-zinc-600'>
                Current memory: {isSharedMemory ? 'registered' : 'not registered'}
              </div>
            ) : null}
            <Button
              className='rounded-full'
              onClick={handleRegisterShared}
              disabled
            >
              Register current memory (disabled)
            </Button>
            {sharedStatus ? <span className='text-sm text-muted-foreground'>{sharedStatus}</span> : null}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}

export default MemoryDetailPage
