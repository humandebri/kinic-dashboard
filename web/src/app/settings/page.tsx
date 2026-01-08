// Where: Settings page to configure app defaults.
// What: Lets users choose a default memory for the header selector.
// Why: Keeps the preferred canister consistent across sessions.
'use client'

import { useEffect, useState } from 'react'

import AppShell from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { useIdentityState } from '@/components/providers/identity-provider'
import { useMemories } from '@/hooks/use-memories'
import { useSelectedMemory } from '@/hooks/use-selected-memory'

const SettingsPage = () => {
  const identityState = useIdentityState()
  const memories = useMemories(identityState.identity, identityState.isReady)
  const { defaultMemoryId, setDefaultMemoryId } = useSelectedMemory()
  const [pendingDefault, setPendingDefault] = useState('')

  useEffect(() => {
    setPendingDefault(defaultMemoryId ?? '')
  }, [defaultMemoryId])

  const handleSave = () => {
    setDefaultMemoryId(pendingDefault || null)
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
                value={pendingDefault}
                onChange={(event) => setPendingDefault(event.target.value)}
                disabled={!identityState.isAuthenticated || memories.isLoading}
              >
                <option value=''>Not set</option>
                {memories.memories.map((memory) =>
                  memory.principalText ? (
                    <option key={memory.principalText} value={memory.principalText}>
                      {memory.principalText}
                    </option>
                  ) : null
                )}
              </select>
              {!identityState.isAuthenticated ? (
                <span className='text-muted-foreground text-xs'>Connect identity to set defaults.</span>
              ) : null}
              {identityState.isAuthenticated && memories.isLoading ? (
                <span className='text-muted-foreground text-xs'>Loading memories…</span>
              ) : null}
            </div>
            <div className='flex items-center gap-2'>
              <Button onClick={handleSave} disabled={!identityState.isAuthenticated}>
                Save
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}

export default SettingsPage
