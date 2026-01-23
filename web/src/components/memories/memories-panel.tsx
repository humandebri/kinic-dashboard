// Where: Memories list panel for the Kinic UI.
// What: Displays launcher list_instance output with status and IDs.
// Why: Provides the first real data view after dashboard wiring.
'use client'

import { RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import type { IdentityState } from '@/hooks/use-identity'
import { useMemoriesState } from '@/components/providers/memories-provider'
import { type MemoryInstance, type MemoryState } from '@/hooks/use-memories'
import { useSelectedMemory } from '@/hooks/use-selected-memory'
import { fetchMemoryStatus, type StatusForFrontend } from '@/lib/memory'
import { fetchLauncherVersion, updateMemoryInstance } from '@/lib/launcher'

const CUSTOM_CANISTERS_KEY = 'kinic.custom-canisters'

const renderSkeletonRows = () => {
  return Array.from({ length: 3 }).map((_, index) => (
    <TableRow key={`skeleton-${index}`}>
      {Array.from({ length: 10 }).map((_, cellIndex) => (
        <TableCell key={`skeleton-${index}-${cellIndex}`}>
          <Skeleton className={cellIndex === 0 ? 'h-4 w-48' : 'h-4 w-20'} />
        </TableCell>
      ))}
    </TableRow>
  ))
}

const parseNameMeta = (rawName: string | null) => {
  if (!rawName) return { name: null, description: null }
  const trimmed = rawName.trim()
  if (!trimmed.startsWith('{')) return { name: rawName, description: null }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (typeof parsed === 'object' && parsed !== null) {
      const nameValue = Reflect.get(parsed, 'name')
      const descriptionValue = Reflect.get(parsed, 'description')
      const name = typeof nameValue === 'string' ? nameValue : null
      const description = typeof descriptionValue === 'string' ? descriptionValue : null
      if (name || description) {
        return { name: name ?? rawName, description }
      }
    }
  } catch {
    // Fall back to raw name.
  }
  return { name: rawName, description: null }
}

const renderMemoryRow = (
  memory: MemoryInstance,
  index: number,
  onSelect: (id: string) => void,
  statusEntry: {
    status: StatusForFrontend | null
    isLoading: boolean
    error: string | null
    access: 'ok' | 'no-access' | 'unknown'
  } | null,
  formatCycles: (value: bigint | null) => string,
  formatNat: (value: bigint | null) => string,
  formatNatBillions: (value: bigint | null) => string,
  formatNatMillions: (value: bigint | null) => string,
  formatNatAuto: (value: bigint | null) => string,
  latestVersion: string | null,
  isUpdateEnabled: boolean,
  isUpdating: boolean,
  onUpdate: (memoryId: string) => void,
  permission: {
    label: string | null
    isLoading: boolean
    error: string | null
    principal: string | null
  } | null,
  isAuthenticated: boolean
) => {
  const principalText = memory.principalText ?? '--'
  const permissionLabel = permission?.label ?? (isAuthenticated ? 'unknown' : 'not connected')
  const status = statusEntry?.status ?? null
  const statusError = statusEntry?.error ?? null
  const showStatusError = Boolean(statusError) && !statusEntry?.isLoading
  const statusFallback = showStatusError ? null : status
  const accessLabel = statusEntry?.access === 'no-access' ? 'no access' : null
  const nameMeta = parseNameMeta(status?.name ?? null)
  const memoryId = memory.principalText ?? null
  const hasVersion = Boolean(status?.version && latestVersion)
  const isOutdated = Boolean(
    memoryId &&
      latestVersion &&
      status?.version &&
      status.version.trim().length > 0 &&
      status.version !== latestVersion
  )

  return (
    <TableRow key={`${memory.state}-${principalText}-${index}`}>
      <TableCell className='font-medium'>
        {principalText !== '--' ? (
          <div className='flex flex-col gap-1'>
            <Link
              href={`/memories/${principalText}`}
              className='font-mono text-sm text-blue-600 hover:text-blue-700'
              onClick={() => onSelect(principalText)}
            >
              {principalText}
            </Link>
          </div>
        ) : (
          principalText
        )}
      </TableCell>
      <TableCell>
        {permission?.isLoading ? (
          <span className='text-xs text-zinc-500'>...</span>
        ) : (
          <Badge className='rounded-full border border-slate-200 bg-slate-50 text-slate-700'>
            {permissionLabel}
          </Badge>
        )}
      </TableCell>
      <TableCell className='font-mono text-xs text-zinc-700'>
        {statusEntry?.isLoading ? (
          '...'
        ) : showStatusError ? (
          <span className='text-rose-500'>{statusError}</span>
        ) : accessLabel ? (
          <span className='text-zinc-400'>{accessLabel}</span>
        ) : (
          nameMeta.name ?? '--'
        )}
      </TableCell>
      <TableCell className='font-mono text-xs text-zinc-700'>
        {statusEntry?.isLoading ? '...' : nameMeta.description ?? '--'}
      </TableCell>
      <TableCell className='font-mono text-xs text-zinc-700'>
        {statusEntry?.isLoading ? '...' : statusFallback?.version ?? '--'}
      </TableCell>
      <TableCell className='font-mono text-xs text-zinc-700'>
        {statusEntry?.isLoading ? '...' : formatCycles(statusFallback?.cycles ?? null)}
      </TableCell>
      <TableCell className='font-mono text-xs text-zinc-700'>
        {statusEntry?.isLoading
          ? '...'
          : formatNatBillions(statusFallback?.idle_cycles_burned_per_day ?? null)}
      </TableCell>
      <TableCell className='font-mono text-xs text-zinc-700'>
        {statusEntry?.isLoading ? '...' : formatNatMillions(statusFallback?.freezing_threshold ?? null)}
      </TableCell>
      <TableCell className='font-mono text-xs text-zinc-700'>
        {statusEntry?.isLoading ? '...' : formatNatAuto(statusFallback?.memory_size ?? null)}
      </TableCell>
      <TableCell className='font-mono text-xs text-zinc-700'>
        {statusEntry?.isLoading ? (
          '...'
        ) : showStatusError || accessLabel ? (
          '--'
        ) : isOutdated && memoryId ? (
          <Button
            variant='outline'
            size='sm'
            className='h-7 rounded-full px-2 text-xs'
            onClick={() => onUpdate(memoryId)}
            disabled={!isUpdateEnabled || isUpdating}
          >
            {isUpdating ? 'Updating...' : 'Update'}
          </Button>
        ) : hasVersion ? (
          <span className='text-zinc-500'>Latest</span>
        ) : (
          '--'
        )}
      </TableCell>
    </TableRow>
  )
}

const MemoriesPanel = ({ identityState }: { identityState: IdentityState }) => {
  const { isLoading, memories, error, lastUpdated, refresh, memoryPermissions, ensureMemoryPermissions } =
    useMemoriesState()
  const { setSelectedMemoryId } = useSelectedMemory()
  const [customCanisters, setCustomCanisters] = useState<string[]>([])
  const [memoryStatus, setMemoryStatus] = useState<
    Record<
      string,
      {
        status: StatusForFrontend | null
        isLoading: boolean
        error: string | null
        access: 'ok' | 'no-access' | 'unknown'
        principal: string | null
      }
    >
  >({})
  const [launcherVersion, setLauncherVersion] = useState<string | null>(null)
  const [launcherError, setLauncherError] = useState<string | null>(null)
  const [updateBusy, setUpdateBusy] = useState<Record<string, boolean>>({})

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

  useEffect(() => {
    if (!identityState.isReady) return
    fetchLauncherVersion(identityState.identity ?? undefined)
      .then((version) => {
        setLauncherVersion(version)
        setLauncherError(null)
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : 'Failed to load launcher version.'
        setLauncherVersion(null)
        setLauncherError(message)
      })
  }, [identityState.identity, identityState.isReady])

  const lastUpdatedLabel = lastUpdated ? lastUpdated.toLocaleTimeString() : 'Not updated yet'
  const showAuthNotice = identityState.isReady && !identityState.isAuthenticated
  const showEmpty = !isLoading && !error && memories.length === 0 && customCanisters.length === 0 && !showAuthNotice
  const ownedSet = useMemo(() => {
    return new Set(
      memories
        .map((memory) => memory.principalText)
        .filter((value): value is string => Boolean(value))
    )
  }, [memories])
  const mergedMemories: MemoryInstance[] = useMemo(() => {
    return [
      ...memories,
      ...customCanisters
        .filter((id) => !ownedSet.has(id))
        .map((id) => ({ state: 'Custom' as MemoryState, principalText: id, detail: 'Saved manually' }))
    ]
  }, [customCanisters, memories, ownedSet])

  const formatCycles = (value: bigint | null) => {
    if (value === null) return '--'
    const trillion = 1_000_000_000_000n
    const units = Number(value) / Number(trillion)
    return `${units.toFixed(2)}T`
  }

  const formatNat = (value: bigint | null) => {
    if (value === null) return '--'
    return value.toString()
  }

  const formatScaled = (value: bigint | null, unit: string, scale: bigint, fractionDigits: number) => {
    if (value === null) return '--'
    const whole = value / scale
    const fraction = value % scale
    if (fraction === 0n) return `${whole.toString()}${unit}`
    const pad = fraction.toString().padStart(fractionDigits, '0')
    const trimmed = pad.slice(0, 2)
    return `${whole.toString()}.${trimmed}${unit}`
  }

  const formatNatBillions = (value: bigint | null) => {
    return formatScaled(value, 'B', 1_000_000_000n, 9)
  }

  const formatNatMillions = (value: bigint | null) => {
    return formatScaled(value, 'M', 1_000_000n, 6)
  }

  const formatNatAuto = (value: bigint | null) => {
    if (value === null) return '--'
    const abs = value < 0n ? -value : value
    if (abs >= 1_000_000_000n) return formatScaled(value, 'B', 1_000_000_000n, 9)
    if (abs >= 1_000_000n) return formatScaled(value, 'M', 1_000_000n, 6)
    if (abs >= 1_000n) return formatScaled(value, 'K', 1_000n, 3)
    return value.toString()
  }

  const loadMemoryStatus = useCallback(async (memoryId: string, principalText: string) => {
    setMemoryStatus((prev) => ({
      ...prev,
      [memoryId]: {
        status: null,
        isLoading: true,
        error: null,
        access: 'unknown',
        principal: principalText
      }
    }))
    try {
      const status = await fetchMemoryStatus(identityState.identity ?? undefined, memoryId)
      setMemoryStatus((prev) => ({
        ...prev,
        [memoryId]: {
          status,
          isLoading: false,
          error: null,
          access: 'ok',
          principal: principalText
        }
      }))
    } catch (statusError) {
      const message =
        statusError instanceof Error ? statusError.message : 'Failed to load memory status.'
      const isInvalidUser =
        message.includes('Invalid user') || message.includes('IC0406') || message.includes('invalid user')
      setMemoryStatus((prev) => ({
        ...prev,
        [memoryId]: {
          status: null,
          isLoading: false,
          error: isInvalidUser ? null : message,
          access: isInvalidUser ? 'no-access' : 'unknown',
          principal: principalText
        }
      }))
    }
  }, [identityState.identity])

  const handleUpdateInstance = async (memoryId: string) => {
    if (!identityState.identity || !identityState.principalText) return
    setUpdateBusy((prev) => ({ ...prev, [memoryId]: true }))
    try {
      await updateMemoryInstance(identityState.identity, memoryId)
      await loadMemoryStatus(memoryId, identityState.principalText)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to update instance.'
      setMemoryStatus((prev) => ({
        ...prev,
        [memoryId]: {
          status: prev[memoryId]?.status ?? null,
          isLoading: false,
          error: message,
          access: prev[memoryId]?.access ?? 'unknown',
          principal: identityState.principalText
        }
      }))
    } finally {
      setUpdateBusy((prev) => ({ ...prev, [memoryId]: false }))
    }
  }

  useEffect(() => {
    if (!identityState.isAuthenticated || !identityState.identity || !identityState.principalText) {
      return
    }
    const principalText = identityState.principalText
    const targets = mergedMemories
      .map((memory) => memory.principalText)
      .filter((value): value is string => Boolean(value))
    targets.forEach((memoryId) => {
      const entry = memoryStatus[memoryId]
      if (!entry || entry.principal !== principalText) {
        loadMemoryStatus(memoryId, principalText)
      }
    })
    ensureMemoryPermissions(targets)
  }, [
    mergedMemories,
    memoryStatus,
    ensureMemoryPermissions,
    identityState.identity,
    identityState.isAuthenticated,
    identityState.principalText,
    loadMemoryStatus
  ])

  return (
    <div className='flex flex-col gap-6'>
      <Card className='border-dashed'>
        <CardHeader className='flex flex-col gap-4'>
          <div className='flex flex-wrap items-center justify-between gap-4'>
            <div className='flex flex-col gap-1'>
              <CardTitle className='text-2xl'>Memory instances</CardTitle>
              <CardDescription>Fetch Memory IDs from Launcher list_instance.</CardDescription>
            </div>
            <div className='flex items-center gap-2'>
              <Button
                variant='secondary'
                size='sm'
                className='gap-2 rounded-full'
                onClick={refresh}
                disabled={!identityState.isAuthenticated || isLoading}
              >
                <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
          <div className='text-muted-foreground text-xs'>Last updated: {lastUpdatedLabel}</div>
        </CardHeader>
        <CardContent className='space-y-4'>
          <Separator />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Memory ID</TableHead>
                <TableHead>Permission</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Cycles</TableHead>
                <TableHead>Idle/day</TableHead>
                <TableHead>Freezing</TableHead>
                <TableHead>Mem size</TableHead>
                <TableHead>Update</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && memories.length === 0 ? renderSkeletonRows() : null}
              {error ? (
                <TableRow>
                  <TableCell colSpan={10} className='text-rose-500'>
                    {error}
                  </TableCell>
                </TableRow>
              ) : null}
              {showEmpty ? (
                <TableRow>
                  <TableCell colSpan={10} className='text-muted-foreground'>
                    No memories yet.
                  </TableCell>
                </TableRow>
              ) : null}
              {!isLoading && !error && mergedMemories.length
                ? mergedMemories.map((memory, index) =>
                    renderMemoryRow(
                      memory,
                      index,
                      setSelectedMemoryId,
                      memory.principalText ? memoryStatus[memory.principalText] ?? null : null,
                      formatCycles,
                      formatNat,
                      formatNatBillions,
                      formatNatMillions,
                      formatNatAuto,
                      launcherVersion,
                      Boolean(identityState.identity && identityState.isAuthenticated),
                      Boolean(memory.principalText && updateBusy[memory.principalText]),
                      handleUpdateInstance,
                      memory.principalText ? memoryPermissions[memory.principalText] ?? null : null,
                      identityState.isAuthenticated
                    )
                  )
                : null}
            </TableBody>
          </Table>
          {launcherError ? (
            <div className='text-xs text-rose-500'>{launcherError}</div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

export default MemoriesPanel
