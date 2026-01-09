// Where: Settings page to configure app defaults.
// What: Lets users choose a default memory for the header selector.
// Why: Keeps the preferred canister consistent across sessions.
'use client'

import { useEffect, useMemo, useState } from 'react'
import { ShieldAlertIcon } from 'lucide-react'
import { Principal } from '@dfinity/principal'

import AppShell from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useIdentityState } from '@/components/providers/identity-provider'
import { useMemories } from '@/hooks/use-memories'
import { useSelectedMemory } from '@/hooks/use-selected-memory'
import { II_SESSION_TTL_NS } from '@/lib/ic-config'

const CUSTOM_CANISTERS_KEY = 'kinic.custom-canisters'
const SESSION_TTL_KEY = 'kinic.ii-session-ttl-ns'
const SESSION_TTL_OPTIONS = [
  { label: '15 minutes', value: '900000000000' },
  { label: '1 hour', value: '3600000000000' },
  { label: '12 hours', value: '43200000000000' },
  { label: '1 day', value: '86400000000000' },
  { label: '7 days', value: '604800000000000' }
]

const SettingsPage = () => {
  const identityState = useIdentityState()
  const memories = useMemories(identityState.identity, identityState.isReady)
  const { defaultMemoryId, setDefaultMemoryId } = useSelectedMemory()
  const [customCanisters, setCustomCanisters] = useState<string[]>([])
  const [newCanister, setNewCanister] = useState('')
  const [customStatus, setCustomStatus] = useState<string | null>(null)
  const [sessionTtl, setSessionTtl] = useState(II_SESSION_TTL_NS.toString())

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
    const stored = localStorage.getItem(SESSION_TTL_KEY)
    if (!stored) return
    if (/^\d+$/.test(stored)) {
      setSessionTtl(stored)
    }
  }, [])

  const ownedCanisters = useMemo(() => {
    return new Set(
      memories.memories
        .map((memory) => memory.principalText)
        .filter((value): value is string => Boolean(value))
    )
  }, [memories.memories])

  const memoryOptions = useMemo(() => {
    const merged = [...customCanisters, ...ownedCanisters]
    return Array.from(new Set(merged))
  }, [customCanisters, ownedCanisters])

  const persistCustomCanisters = (next: string[]) => {
    setCustomCanisters(next)
    localStorage.setItem(CUSTOM_CANISTERS_KEY, JSON.stringify(next))
  }

  const handleAddCustom = () => {
    const trimmed = newCanister.trim()
    if (!trimmed) return
    try {
      Principal.fromText(trimmed)
    } catch {
      setCustomStatus('Invalid canister id.')
      return
    }
    const next = [trimmed, ...customCanisters.filter((value) => value !== trimmed)]
    persistCustomCanisters(next)
    setNewCanister('')
    setCustomStatus(null)
  }

  const handleRemoveCustom = (value: string) => {
    const next = customCanisters.filter((item) => item !== value)
    persistCustomCanisters(next)
  }

  const handleSessionTtlChange = (value: string) => {
    setSessionTtl(value)
    localStorage.setItem(SESSION_TTL_KEY, value)
  }

  const handleDefaultChange = (value: string) => {
    setDefaultMemoryId(value || null)
  }

  return (
    <AppShell pageTitle='Settings' identityState={identityState}>
      <div className='grid gap-6'>
        <Card>
          <CardHeader className='flex flex-col items-start gap-2'>
            <span className='text-lg font-semibold'>Default memory</span>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex flex-col gap-2'>
              <label className='text-sm text-zinc-600'>Default memory</label>
              <select
                className='h-10 rounded-2xl border border-zinc-200/70 bg-white/80 px-3 text-sm text-zinc-700 outline-none'
                value={defaultMemoryId ?? ''}
                onChange={(event) => handleDefaultChange(event.target.value)}
                disabled={!identityState.isAuthenticated || memories.isLoading}
              >
                <option value=''>Not set</option>
                {memoryOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              {!identityState.isAuthenticated ? (
                <span className='text-muted-foreground text-xs'>Connect identity to set defaults.</span>
              ) : null}
              {identityState.isAuthenticated && memories.isLoading ? (
                <span className='text-muted-foreground text-xs'>Loading memories…</span>
              ) : null}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='flex flex-col items-start gap-2'>
            <span className='text-lg font-semibold'>Session TTL</span>
            <span className='text-muted-foreground text-sm'>Controls Internet Identity delegation lifetime.</span>
          </CardHeader>
          <CardContent className='space-y-2'>
            <label className='text-sm text-zinc-600'>Session duration</label>
            <Select value={sessionTtl} onValueChange={handleSessionTtlChange}>
              <SelectTrigger className='w-[16rem]'>
                <SelectValue placeholder='Select TTL' />
              </SelectTrigger>
              <SelectContent>
                {SESSION_TTL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className='text-muted-foreground text-xs'>
              Applies next time you sign in.
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='flex flex-col items-start gap-2'>
            <span className='text-lg font-semibold'>Add memory</span>
            <span className='text-muted-foreground text-sm'>Store canister ids for quick access.</span>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex flex-col gap-2'>
              <label className='text-sm text-zinc-600'>Canister id</label>
              <div className='flex items-center gap-2'>
                <Input
                  value={newCanister}
                  onChange={(event) => setNewCanister(event.target.value)}
                  placeholder='aaaaa-aa'
                />
                <Button variant='outline' onClick={handleAddCustom} disabled={!newCanister.trim()}>
                  Add
                </Button>
              </div>
              {customStatus ? <span className='text-muted-foreground text-xs'>{customStatus}</span> : null}
            </div>
            <div className='flex flex-col gap-2 text-sm'>
              {customCanisters.length ? (
                customCanisters.map((canisterId) => {
                  const isOwner = identityState.isAuthenticated && ownedCanisters.has(canisterId)
                  return (
                    <div
                      key={canisterId}
                      className='flex items-center justify-between rounded-2xl border border-zinc-200/70 bg-white/70 px-3 py-2'
                    >
                      <div className='flex items-center gap-2'>
                        <span className='font-mono text-xs text-zinc-700'>{canisterId}</span>
                        {identityState.isAuthenticated && !isOwner ? (
                          <span className='inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700'>
                            <ShieldAlertIcon className='size-3' />
                            NOT AUTHORIZED
                          </span>
                        ) : null}
                      </div>
                      <Button variant='ghost' size='sm' onClick={() => handleRemoveCustom(canisterId)}>
                        Remove
                      </Button>
                    </div>
                  )
                })
              ) : (
                <span className='text-muted-foreground text-xs'>No canisters saved yet.</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}

export default SettingsPage
