// Where: Memory detail page (/memories/:id).
// What: Shows canister status, edits name/description, and manages user access.
// Why: Single place for admin actions (change_name, add_new_user, remove_user).
import { Principal } from '@dfinity/principal'
import {
  FileUpIcon,
  LockIcon,
  PencilIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon
} from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'

import ConnectPrompt from '@/components/common/connect-prompt'
import CopyButton from '@/components/common/copy-button'
import EmptyState from '@/components/common/empty-state'
import PageHeader from '@/components/common/page-header'
import Stat from '@/components/common/stat'
import { useIdentityState } from '@/components/providers/identity-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { isRoleOption, roleLabelMap, roleOptionFromValue, roleValueMap, type RoleOption } from '@/lib/access-control'
import {
  errorMessage,
  formatBytes,
  formatCycles,
  formatNatBillions,
  formatNatMillions,
  isInvalidUserError,
  parseNameMeta
} from '@/lib/format'
import { LAUNCHER_CANISTER_ID } from '@/lib/ic-config'
import { changeMemoryName, createMemoryActor, fetchMemoryStatus, fetchMemoryUsers, type StatusForFrontend } from '@/lib/memory'
import { useSelectedMemory } from '@/stores/selected-memory'

type StatusEntry = {
  status: StatusForFrontend | null
  isLoading: boolean
  error: string | null
  access: 'ok' | 'no-access' | 'unknown'
}

type PendingAction = { kind: 'update' | 'remove'; principal: string; role: RoleOption }

const ROLE_OPTIONS: RoleOption[] = ['admin', 'writer', 'reader']

const RoleSelect = ({
  value,
  onChange,
  disabled,
  className
}: {
  value: RoleOption
  onChange: (value: RoleOption) => void
  disabled?: boolean
  className?: string
}) => (
  <Select value={value} onValueChange={(next) => isRoleOption(next) && onChange(next)} disabled={disabled}>
    <SelectTrigger className={className ?? 'h-9 w-28'}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {ROLE_OPTIONS.map((role) => (
        <SelectItem key={role} value={role} className='capitalize'>
          {role}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
)

const MemoryDetailPage = () => {
  const identityState = useIdentityState()
  const params = useParams()
  const memoryId = (params.id ?? '').trim()
  const setSelectedMemoryId = useSelectedMemory((state) => state.setSelectedMemoryId)
  const selfPrincipal = identityState.principalText

  const [statusEntry, setStatusEntry] = useState<StatusEntry>({
    status: null,
    isLoading: false,
    error: null,
    access: 'unknown'
  })
  const [users, setUsers] = useState<Array<[string, number]>>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [roleSelections, setRoleSelections] = useState<Record<string, RoleOption>>({})
  const [busyUser, setBusyUser] = useState<string | null>(null)

  const [newPrincipal, setNewPrincipal] = useState('')
  const [newRole, setNewRole] = useState<RoleOption>('writer')
  const [isAdding, setIsAdding] = useState(false)

  const [pending, setPending] = useState<PendingAction | null>(null)
  const [confirmInput, setConfirmInput] = useState('')

  const [editOpen, setEditOpen] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [descriptionInput, setDescriptionInput] = useState('')
  const [isSavingName, setIsSavingName] = useState(false)

  const isValidId = (() => {
    try {
      Principal.fromText(memoryId)
      return true
    } catch {
      return false
    }
  })()

  useEffect(() => {
    if (isValidId) setSelectedMemoryId(memoryId)
  }, [isValidId, memoryId, setSelectedMemoryId])

  const loadStatus = useCallback(async () => {
    if (!memoryId || !identityState.identity) return
    setStatusEntry((prev) => ({ ...prev, isLoading: true, error: null }))
    try {
      const status = await fetchMemoryStatus(identityState.identity, memoryId)
      setStatusEntry({ status, isLoading: false, error: null, access: 'ok' })
    } catch (error) {
      const message = errorMessage(error, 'Failed to load memory status.')
      const invalidUser = isInvalidUserError(message)
      setStatusEntry({
        status: null,
        isLoading: false,
        error: invalidUser ? null : message,
        access: invalidUser ? 'no-access' : 'unknown'
      })
    }
  }, [identityState.identity, memoryId])

  const loadUsers = useCallback(async () => {
    if (!memoryId || !identityState.identity) return
    setUsersLoading(true)
    try {
      const nextUsers = await fetchMemoryUsers(identityState.identity, memoryId)
      setUsers(nextUsers)
      setRoleSelections(Object.fromEntries(nextUsers.map(([text, role]) => [text, roleOptionFromValue(role)])))
      setUsersError(null)
    } catch (error) {
      setUsers([])
      setUsersError(errorMessage(error, 'Failed to load users.'))
    } finally {
      setUsersLoading(false)
    }
  }, [identityState.identity, memoryId])

  useEffect(() => {
    if (!isValidId || !identityState.isAuthenticated) return
    void loadStatus()
    void loadUsers()
  }, [identityState.isAuthenticated, isValidId, loadStatus, loadUsers])

  const meta = parseNameMeta(statusEntry.status?.name ?? null)
  const myRole = users.find(([text]) => text === selfPrincipal)?.[1]
  const isAdmin = myRole === roleValueMap.admin
  const canManage = identityState.isAuthenticated && isAdmin

  const openEdit = () => {
    setNameInput(meta.name ?? '')
    setDescriptionInput(meta.description ?? '')
    setEditOpen(true)
  }

  const handleSaveName = async (event: FormEvent) => {
    event.preventDefault()
    if (!identityState.identity) return
    setIsSavingName(true)
    try {
      const payload = JSON.stringify({ name: nameInput.trim(), description: descriptionInput.trim() })
      await changeMemoryName(identityState.identity, memoryId, payload)
      toast.success('Details updated')
      setEditOpen(false)
      await loadStatus()
    } catch (error) {
      toast.error('Could not update details', { description: errorMessage(error, 'Failed to update name.') })
    } finally {
      setIsSavingName(false)
    }
  }

  const handleAddUser = async (event: FormEvent) => {
    event.preventDefault()
    if (!identityState.identity) return
    let principal: Principal
    try {
      principal = Principal.fromText(newPrincipal.trim())
    } catch {
      toast.error('Invalid principal')
      return
    }
    setIsAdding(true)
    try {
      const actor = await createMemoryActor(identityState.identity, memoryId)
      await actor.add_new_user(principal, roleValueMap[newRole])
      toast.success('Access granted', { description: `${newRole} · ${principal.toText()}` })
      setNewPrincipal('')
      await loadUsers()
    } catch (error) {
      toast.error('Could not grant access', { description: errorMessage(error, 'Failed to update access.') })
    } finally {
      setIsAdding(false)
    }
  }

  const runPending = async () => {
    if (!pending || !identityState.identity) return
    const { kind, principal: principalText, role } = pending
    setPending(null)
    setBusyUser(principalText)
    try {
      const actor = await createMemoryActor(identityState.identity, memoryId)
      const principal = Principal.fromText(principalText)
      if (kind === 'update') {
        await actor.add_new_user(principal, roleValueMap[role])
        toast.success('Role updated', { description: `${role} · ${principalText}` })
      } else {
        await actor.remove_user(principal)
        toast.success('Access removed', { description: principalText })
      }
      await loadUsers()
    } catch (error) {
      toast.error(kind === 'update' ? 'Could not update role' : 'Could not remove user', {
        description: errorMessage(error, 'Request failed.')
      })
    } finally {
      setBusyUser(null)
    }
  }

  const confirmKeyword = pending && pending.principal === selfPrincipal ? (pending.kind === 'remove' ? 'delete' : 'change') : null

  if (!isValidId) {
    return (
      <EmptyState
        className='mt-6'
        icon={<SearchIcon />}
        title='Invalid memory ID'
        description='Check the canister ID in the URL, or pick a memory from the list.'
        action={
          <Button asChild variant='outline'>
            <Link to='/memories'>Back to memories</Link>
          </Button>
        }
      />
    )
  }

  if (identityState.isReady && !identityState.isAuthenticated) {
    return (
      <div className='space-y-6'>
        <PageHeader eyebrow='Memory' title={memoryId} />
        <ConnectPrompt description='Connect Internet Identity to view this memory.' />
      </div>
    )
  }

  const status = statusEntry.status

  return (
    <div className='space-y-6'>
      <PageHeader
        eyebrow={
          <Link to='/memories' className='hover:text-foreground'>
            Memories
          </Link>
        }
        title={
          statusEntry.isLoading && !status ? (
            <Skeleton className='h-8 w-56' />
          ) : (
            meta.name || (statusEntry.access === 'no-access' ? 'Restricted memory' : 'Untitled memory')
          )
        }
        description={
          <span className='flex flex-col gap-1'>
            {meta.description ? <span>{meta.description}</span> : null}
            <span className='inline-flex items-center gap-1'>
              <span className='break-all font-mono text-xs'>{memoryId}</span>
              <CopyButton value={memoryId} label='Copy memory ID' />
            </span>
          </span>
        }
        actions={
          <>
            <Button variant='outline' onClick={() => void loadStatus()} disabled={statusEntry.isLoading}>
              <RefreshCwIcon className={statusEntry.isLoading ? 'animate-spin' : ''} />
              <span className='sr-only sm:not-sr-only'>Refresh</span>
            </Button>
            <Button variant='outline' asChild>
              <Link to='/insert'>
                <FileUpIcon /> Insert
              </Link>
            </Button>
            <Button variant='outline' asChild>
              <Link to='/search'>
                <SearchIcon /> Search
              </Link>
            </Button>
            <Button onClick={openEdit} disabled={!status}>
              <PencilIcon /> Edit details
            </Button>
          </>
        }
      />

      {statusEntry.error ? (
        <div role='alert' className='rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive'>
          {statusEntry.error}
        </div>
      ) : null}

      {statusEntry.access === 'no-access' ? (
        <EmptyState
          icon={<LockIcon />}
          title='No access'
          description='Your principal is not a user of this memory. Ask an admin to grant you a role.'
        />
      ) : (
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5'>
          {(
            [
              ['Version', status?.version || '—'],
              ['Cycles', formatCycles(status?.cycles ?? null)],
              ['Burn / day', formatNatBillions(status?.idle_cycles_burned_per_day ?? null)],
              ['Freezing threshold', formatNatMillions(status?.freezing_threshold ?? null)],
              ['Memory size', formatBytes(status?.memory_size ?? null)]
            ] as const
          ).map(([label, value]) =>
            statusEntry.isLoading && !status ? (
              <Skeleton key={label} className='h-[74px] rounded-xl' />
            ) : (
              <Stat key={label} label={label} value={value} />
            )
          )}
        </div>
      )}

      <Card>
        <CardHeader className='flex-row items-start justify-between gap-4 space-y-0'>
          <div className='space-y-1'>
            <CardTitle className='flex items-center gap-2'>
              <UsersIcon className='size-4 text-muted-foreground' /> Access
            </CardTitle>
            <CardDescription>
              {canManage
                ? 'Grant, change, or revoke roles for this memory.'
                : 'Only admins can change access.'}
            </CardDescription>
          </div>
          {myRole ? (
            <Badge variant='brand'>
              <ShieldCheckIcon className='size-3' /> You: {roleLabelMap[myRole] ?? 'unknown'}
            </Badge>
          ) : null}
        </CardHeader>
        <CardContent className='space-y-5'>
          {canManage ? (
            <form className='flex flex-col gap-2 sm:flex-row' onSubmit={handleAddUser}>
              <Label htmlFor='new-principal' className='sr-only'>
                Principal
              </Label>
              <Input
                id='new-principal'
                value={newPrincipal}
                onChange={(event) => setNewPrincipal(event.target.value)}
                placeholder='Principal to grant access'
                className='font-mono text-[13px]'
                autoComplete='off'
                spellCheck={false}
              />
              <div className='flex gap-2'>
                <RoleSelect value={newRole} onChange={setNewRole} />
                <Button type='submit' disabled={isAdding || !newPrincipal.trim()}>
                  <UserPlusIcon />
                  {isAdding ? 'Adding…' : 'Add'}
                </Button>
              </div>
            </form>
          ) : null}

          {usersError ? <p className='text-sm text-destructive'>{usersError}</p> : null}

          <div className='divide-y rounded-xl border'>
            {usersLoading && users.length === 0 ? (
              Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className='flex items-center justify-between gap-3 px-4 py-3'>
                  <Skeleton className='h-4 w-64' />
                  <Skeleton className='h-6 w-16' />
                </div>
              ))
            ) : users.length === 0 ? (
              <div className='px-4 py-6 text-center text-sm text-muted-foreground'>No users recorded.</div>
            ) : (
              users.map(([principalText, roleValue]) => {
                const isLauncher = principalText === LAUNCHER_CANISTER_ID
                const isSelf = principalText === selfPrincipal
                const currentRole = roleOptionFromValue(roleValue)
                const selectedRole = roleSelections[principalText] ?? currentRole
                const changed = selectedRole !== currentRole
                const busy = busyUser === principalText
                return (
                  <div
                    key={principalText}
                    className='flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between'
                  >
                    <div className='flex min-w-0 items-center gap-2'>
                      <span className='min-w-0 break-all font-mono text-xs'>{principalText}</span>
                      <CopyButton value={principalText} />
                      {isLauncher ? <Badge variant='outline'>launcher</Badge> : null}
                      {isSelf ? <Badge variant='brand'>you</Badge> : null}
                    </div>
                    <div className='flex shrink-0 items-center gap-2'>
                      {canManage && !isLauncher ? (
                        <>
                          <RoleSelect
                            value={selectedRole}
                            onChange={(role) => setRoleSelections((prev) => ({ ...prev, [principalText]: role }))}
                            disabled={busy}
                            className='h-8 w-28 text-xs'
                          />
                          {changed ? (
                            <Button
                              size='sm'
                              onClick={() => setPending({ kind: 'update', principal: principalText, role: selectedRole })}
                              disabled={busy}
                            >
                              Save
                            </Button>
                          ) : null}
                          <Button
                            size='icon-sm'
                            variant='ghost'
                            className='text-muted-foreground hover:text-destructive'
                            onClick={() => setPending({ kind: 'remove', principal: principalText, role: currentRole })}
                            disabled={busy}
                            aria-label='Remove user'
                          >
                            <Trash2Icon />
                          </Button>
                        </>
                      ) : (
                        <Badge variant='secondary' className='capitalize'>
                          {isLauncher ? 'system' : roleLabelMap[roleValue] ?? 'unknown'}
                        </Badge>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={(open) => !isSavingName && setEditOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit details</DialogTitle>
            <DialogDescription>Name and description are stored on the memory canister.</DialogDescription>
          </DialogHeader>
          <form className='grid gap-4' onSubmit={handleSaveName}>
            <div className='grid gap-2'>
              <Label htmlFor='memory-name'>Name</Label>
              <Input
                id='memory-name'
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
                maxLength={120}
                disabled={isSavingName}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='memory-description'>Description</Label>
              <Textarea
                id='memory-description'
                value={descriptionInput}
                onChange={(event) => setDescriptionInput(event.target.value)}
                maxLength={500}
                rows={3}
                disabled={isSavingName}
              />
            </div>
            <DialogFooter>
              <Button type='button' variant='outline' onClick={() => setEditOpen(false)} disabled={isSavingName}>
                Cancel
              </Button>
              <Button type='submit' disabled={isSavingName || !nameInput.trim()}>
                {isSavingName ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null)
            setConfirmInput('')
          }
        }}
      >
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>{pending?.kind === 'remove' ? 'Remove access?' : 'Change role?'}</DialogTitle>
            <DialogDescription>
              {pending?.kind === 'remove'
                ? 'This principal will lose all access to the memory.'
                : `This principal will become ${pending?.role}.`}
            </DialogDescription>
          </DialogHeader>
          <div className='break-all rounded-lg border bg-muted px-3 py-2 font-mono text-xs'>{pending?.principal}</div>
          {confirmKeyword ? (
            <div className='grid gap-2'>
              <Label htmlFor='confirm-keyword' className='font-normal text-muted-foreground'>
                This is your own principal. Type <span className='font-semibold text-foreground'>{confirmKeyword}</span>{' '}
                to confirm.
              </Label>
              <Input
                id='confirm-keyword'
                value={confirmInput}
                onChange={(event) => setConfirmInput(event.target.value)}
                autoComplete='off'
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => {
                setPending(null)
                setConfirmInput('')
              }}
            >
              Cancel
            </Button>
            <Button
              variant={pending?.kind === 'remove' ? 'destructive' : 'default'}
              onClick={() => {
                setConfirmInput('')
                void runPending()
              }}
              disabled={Boolean(confirmKeyword) && confirmInput.trim() !== confirmKeyword}
            >
              {pending?.kind === 'remove' ? 'Remove' : 'Change role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default MemoryDetailPage
