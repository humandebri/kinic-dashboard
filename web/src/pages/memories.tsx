// Where: Memories list page.
// What: Shows launcher list_instance results plus saved canisters, with live status per memory.
// Why: Landing page — the quickest way to see and open every memory you can access.
import {
  ArrowUpRightIcon,
  CirclePlusIcon,
  DatabaseIcon,
  LockIcon,
  RefreshCwIcon,
  SparklesIcon
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'

import ConnectPrompt from '@/components/common/connect-prompt'
import CopyButton from '@/components/common/copy-button'
import EmptyState from '@/components/common/empty-state'
import PageHeader from '@/components/common/page-header'
import { useIdentityState } from '@/components/providers/identity-provider'
import { useMemoriesState } from '@/components/providers/memories-provider'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { MemoryInstance, MemoryState } from '@/hooks/use-memories'
import {
  errorMessage,
  formatBytes,
  formatCycles,
  formatNatBillions,
  isInvalidUserError,
  parseNameMeta
} from '@/lib/format'
import { fetchLauncherVersion, updateMemoryInstance } from '@/lib/launcher'
import { fetchMemoryStatus, type StatusForFrontend } from '@/lib/memory'
import { useCustomCanisters } from '@/stores/custom-canisters'
import { useSelectedMemory } from '@/stores/selected-memory'

type StatusEntry = {
  status: StatusForFrontend | null
  isLoading: boolean
  error: string | null
  access: 'ok' | 'no-access' | 'unknown'
  principal: string | null
}

type PermissionEntry = { label: string | null; isLoading: boolean } | undefined

const stateVariant: Record<MemoryState, BadgeProps['variant']> = {
  Running: 'success',
  SettingUp: 'warning',
  Installation: 'warning',
  Creation: 'warning',
  Pending: 'warning',
  Empty: 'outline',
  Custom: 'outline'
}

const stateLabel: Record<MemoryState, string> = {
  Running: 'Running',
  SettingUp: 'Setting up',
  Installation: 'Installing',
  Creation: 'Creating',
  Pending: 'Pending',
  Empty: 'Empty',
  Custom: 'Saved'
}

const MetricCell = ({ label, value, loading }: { label: string; value: string; loading: boolean }) => (
  <div className='min-w-0'>
    <div className='text-[11px] text-muted-foreground'>{label}</div>
    {loading ? (
      <Skeleton className='mt-1 h-4 w-12' />
    ) : (
      <div className='truncate font-mono text-[13px] font-medium tabular-nums'>{value}</div>
    )}
  </div>
)

type MemoryCardProps = {
  memory: MemoryInstance
  entry: StatusEntry | undefined
  permission: PermissionEntry
  latestVersion: string | null
  isUpdating: boolean
  canUpdate: boolean
  onOpen: (id: string) => void
  onUpdate: (id: string) => void
}

const MemoryCard = ({
  memory,
  entry,
  permission,
  latestVersion,
  isUpdating,
  canUpdate,
  onOpen,
  onUpdate
}: MemoryCardProps) => {
  const id = memory.principalText
  const status = entry?.status ?? null
  const loading = Boolean(entry?.isLoading)
  const noAccess = entry?.access === 'no-access'
  const meta = parseNameMeta(status?.name ?? null)
  const isOutdated = Boolean(
    latestVersion && status?.version && status.version.trim().length > 0 && status.version !== latestVersion
  )
  const permissionLabel = permission?.isLoading ? null : permission?.label

  return (
    <Card
      className={
        id
          ? 'group relative flex flex-col transition hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-md'
          : 'flex flex-col opacity-80'
      }
    >
      <div className='flex items-start justify-between gap-3 p-5 pb-3'>
        <div className='min-w-0 space-y-1'>
          <div className='flex items-center gap-2'>
            {loading ? (
              <Skeleton className='h-5 w-32' />
            ) : (
              <h3 className='truncate text-[15px] font-semibold'>
                {id ? (
                  <button
                    type='button'
                    onClick={() => onOpen(id)}
                    className='text-left after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none'
                  >
                    {meta.name || (noAccess ? 'Restricted memory' : 'Untitled memory')}
                  </button>
                ) : (
                  memory.detail || stateLabel[memory.state]
                )}
              </h3>
            )}
          </div>
          {id ? (
            <div className='relative z-10 flex items-center gap-1 text-muted-foreground'>
              <span className='truncate font-mono text-xs'>{id}</span>
              <CopyButton value={id} label='Copy memory ID' />
            </div>
          ) : null}
        </div>
        <div className='flex shrink-0 flex-col items-end gap-1.5'>
          <Badge variant={stateVariant[memory.state]} dot>
            {stateLabel[memory.state]}
          </Badge>
          {permissionLabel ? (
            <Badge variant={permissionLabel === 'no access' ? 'outline' : 'secondary'}>{permissionLabel}</Badge>
          ) : null}
        </div>
      </div>

      <div className='min-h-10 px-5 text-sm text-muted-foreground'>
        {loading ? (
          <Skeleton className='h-4 w-3/4' />
        ) : entry?.error ? (
          <span className='line-clamp-2 text-destructive'>{entry.error}</span>
        ) : noAccess ? (
          <span className='inline-flex items-center gap-1.5'>
            <LockIcon className='size-3.5' /> You don&apos;t have access to this memory&apos;s status.
          </span>
        ) : (
          <span className='line-clamp-2'>{meta.description || (id ? 'No description' : memory.detail)}</span>
        )}
      </div>

      {id ? (
        <div className='mt-4 grid grid-cols-4 gap-3 border-t px-5 py-3.5'>
          <MetricCell label='Cycles' value={formatCycles(status?.cycles ?? null)} loading={loading} />
          <MetricCell
            label='Burn / day'
            value={formatNatBillions(status?.idle_cycles_burned_per_day ?? null)}
            loading={loading}
          />
          <MetricCell label='Size' value={formatBytes(status?.memory_size ?? null)} loading={loading} />
          <MetricCell label='Version' value={status?.version || '—'} loading={loading} />
        </div>
      ) : null}

      {id && isOutdated ? (
        <div className='relative z-10 flex items-center justify-between gap-3 border-t bg-warning/5 px-5 py-2.5 text-xs'>
          <span className='inline-flex items-center gap-1.5 text-warning'>
            <SparklesIcon className='size-3.5' /> Update available ({latestVersion})
          </span>
          <Button size='sm' variant='outline' onClick={() => onUpdate(id)} disabled={!canUpdate || isUpdating}>
            {isUpdating ? 'Updating…' : 'Update'}
          </Button>
        </div>
      ) : null}
    </Card>
  )
}

const MemoriesPage = () => {
  const identityState = useIdentityState()
  const navigate = useNavigate()
  const { isLoading, memories, error, lastUpdated, refresh, memoryPermissions, ensureMemoryPermissions } =
    useMemoriesState()
  const setSelectedMemoryId = useSelectedMemory((state) => state.setSelectedMemoryId)
  const customCanisters = useCustomCanisters((state) => state.customCanisters)
  const [memoryStatus, setMemoryStatus] = useState<Record<string, StatusEntry>>({})
  const [launcherVersion, setLauncherVersion] = useState<string | null>(null)
  const [updateBusy, setUpdateBusy] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!identityState.isReady) return
    fetchLauncherVersion(identityState.identity ?? undefined)
      .then(setLauncherVersion)
      .catch(() => setLauncherVersion(null))
  }, [identityState.identity, identityState.isReady])

  const mergedMemories: MemoryInstance[] = useMemo(() => {
    const owned = new Set(memories.map((memory) => memory.principalText).filter(Boolean))
    return [
      ...memories,
      ...customCanisters
        .filter((id) => !owned.has(id))
        .map((id) => ({ state: 'Custom' as MemoryState, principalText: id, detail: 'Saved manually' }))
    ]
  }, [customCanisters, memories])

  const loadMemoryStatus = useCallback(
    async (memoryId: string, principalText: string) => {
      setMemoryStatus((prev) => ({
        ...prev,
        [memoryId]: { status: null, isLoading: true, error: null, access: 'unknown', principal: principalText }
      }))
      try {
        const status = await fetchMemoryStatus(identityState.identity ?? undefined, memoryId)
        setMemoryStatus((prev) => ({
          ...prev,
          [memoryId]: { status, isLoading: false, error: null, access: 'ok', principal: principalText }
        }))
      } catch (statusError) {
        const message = errorMessage(statusError, 'Failed to load memory status.')
        const invalidUser = isInvalidUserError(message)
        setMemoryStatus((prev) => ({
          ...prev,
          [memoryId]: {
            status: null,
            isLoading: false,
            error: invalidUser ? null : message,
            access: invalidUser ? 'no-access' : 'unknown',
            principal: principalText
          }
        }))
      }
    },
    [identityState.identity]
  )

  useEffect(() => {
    if (!identityState.isAuthenticated || !identityState.principalText) return
    const principalText = identityState.principalText
    const targets = mergedMemories.map((memory) => memory.principalText).filter((v): v is string => Boolean(v))
    targets.forEach((memoryId) => {
      const entry = memoryStatus[memoryId]
      if (!entry || entry.principal !== principalText) {
        void loadMemoryStatus(memoryId, principalText)
      }
    })
    ensureMemoryPermissions(targets)
  }, [
    mergedMemories,
    memoryStatus,
    ensureMemoryPermissions,
    identityState.isAuthenticated,
    identityState.principalText,
    loadMemoryStatus
  ])

  const handleRefresh = () => {
    refresh()
    setMemoryStatus({})
  }

  const handleOpen = (memoryId: string) => {
    setSelectedMemoryId(memoryId)
    navigate(`/memories/${memoryId}`)
  }

  const handleUpdate = async (memoryId: string) => {
    if (!identityState.identity || !identityState.principalText) return
    setUpdateBusy((prev) => ({ ...prev, [memoryId]: true }))
    try {
      await updateMemoryInstance(identityState.identity, memoryId)
      toast.success('Memory updated', { description: memoryId })
      await loadMemoryStatus(memoryId, identityState.principalText)
    } catch (updateError) {
      toast.error('Update failed', { description: errorMessage(updateError, 'Failed to update instance.') })
    } finally {
      setUpdateBusy((prev) => ({ ...prev, [memoryId]: false }))
    }
  }

  const showSkeleton = isLoading && memories.length === 0
  const runningCount = memories.filter((memory) => memory.state === 'Running').length

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Memories'
        description='Verifiable, owned agent memory on the Internet Computer.'
        actions={
          <>
            <Button
              variant='outline'
              onClick={handleRefresh}
              disabled={!identityState.isAuthenticated || isLoading}
            >
              <RefreshCwIcon className={isLoading ? 'animate-spin' : ''} />
              Refresh
            </Button>
            <Button variant='brand' asChild>
              <Link to='/memories/add'>
                <CirclePlusIcon />
                Mint memory
              </Link>
            </Button>
          </>
        }
      />

      {identityState.isReady && !identityState.isAuthenticated ? (
        <ConnectPrompt description='Connect Internet Identity to load the memories you own or can access.' />
      ) : (
        <>
          <div className='flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground'>
            <span>
              <span className='font-medium text-foreground'>{mergedMemories.length}</span> memories
            </span>
            <span>
              <span className='font-medium text-foreground'>{runningCount}</span> running
            </span>
            {customCanisters.length ? (
              <span>
                <span className='font-medium text-foreground'>{customCanisters.length}</span> saved manually
              </span>
            ) : null}
            <span className='ml-auto'>
              {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Not updated yet'}
            </span>
          </div>

          {error ? (
            <div
              role='alert'
              className='rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive'
            >
              {error}
            </div>
          ) : null}

          {showSkeleton ? (
            <div className='grid gap-4 md:grid-cols-2'>
              {Array.from({ length: 4 }).map((_, index) => (
                <Card key={index} className='space-y-4 p-5'>
                  <Skeleton className='h-5 w-40' />
                  <Skeleton className='h-4 w-64' />
                  <Skeleton className='h-10 w-full' />
                </Card>
              ))}
            </div>
          ) : mergedMemories.length === 0 && !error ? (
            <EmptyState
              icon={<DatabaseIcon />}
              title='No memories yet'
              description='Mint your first memory canister, or add an existing canister ID in Settings.'
              action={
                <div className='flex flex-wrap justify-center gap-2'>
                  <Button variant='brand' asChild>
                    <Link to='/memories/add'>Mint memory</Link>
                  </Button>
                  <Button variant='outline' asChild>
                    <Link to='/settings'>
                      Add existing <ArrowUpRightIcon />
                    </Link>
                  </Button>
                </div>
              }
            />
          ) : (
            <div className='grid gap-4 md:grid-cols-2'>
              {mergedMemories.map((memory, index) => {
                const id = memory.principalText
                return (
                  <MemoryCard
                    key={`${memory.state}-${id ?? 'none'}-${index}`}
                    memory={memory}
                    entry={id ? memoryStatus[id] : undefined}
                    permission={id ? memoryPermissions[id] : undefined}
                    latestVersion={launcherVersion}
                    isUpdating={Boolean(id && updateBusy[id])}
                    canUpdate={Boolean(identityState.identity && identityState.isAuthenticated)}
                    onOpen={handleOpen}
                    onUpdate={(memoryId) => void handleUpdate(memoryId)}
                  />
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default MemoriesPage
