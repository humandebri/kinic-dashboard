'use client'

// Where: Main dashboard shell for the Kinic web UI.
// What: Renders dashboard content inside the shared app shell.
// Why: Keeps the dashboard layout consistent across pages.
import { RefreshCwIcon } from 'lucide-react'
import Link from 'next/link'

import TransactionDatatable from '@/components/shadcn-studio/blocks/datatable-transaction'
import AppShell from '@/components/layout/app-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

import { transactionData } from '@/data/dashboard-transactions'
import { useIdentityState } from '@/components/providers/identity-provider'
import { useMemories } from '@/hooks/use-memories'
import { useSelectedMemory } from '@/hooks/use-selected-memory'

const DashboardShell = () => {
  const identityState = useIdentityState()
  const memories = useMemories(identityState.identity, identityState.isReady)
  const { setSelectedMemoryId } = useSelectedMemory()

  return (
    <AppShell pageTitle='Dashboard' identityState={identityState} showFooter>
      <div className='grid gap-6'>
        <Card>
          <CardHeader className='flex flex-col items-start gap-2'>
            <div className='flex items-center gap-2'>
              <span className='text-lg font-semibold'>Memories</span>
              <Button
                variant='ghost'
                size='icon'
                className='text-muted-foreground size-8 rounded-full'
                onClick={memories.refresh}
                disabled={!identityState.isAuthenticated || memories.isLoading}
              >
                <RefreshCwIcon className={memories.isLoading ? 'animate-spin' : ''} />
                <span className='sr-only'>Reload memories</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className='space-y-3'>
            {!identityState.isAuthenticated ? (
              <span className='text-muted-foreground text-sm'>Connect identity to load memories.</span>
            ) : null}
            {identityState.isAuthenticated && memories.error ? (
              <span className='text-rose-500 text-sm'>{memories.error}</span>
            ) : null}
            {identityState.isAuthenticated && !memories.error && memories.memories.length === 0 ? (
              <span className='text-muted-foreground text-sm'>No memories yet.</span>
            ) : null}
            {identityState.isAuthenticated && memories.memories.length ? (
              <div className='space-y-2'>
                {memories.memories.slice(0, 5).map((memory, index) => (
                  <div
                    key={`${memory.state}-${memory.principalText ?? 'none'}-${index}`}
                    className='flex items-center justify-between gap-3 rounded-2xl border border-zinc-200/70 bg-white/70 px-3 py-2 text-sm'
                  >
                    <span className='font-medium'>
                      {memory.principalText ? (
                        <Link
                          href={`/memories/${memory.principalText}`}
                          className='underline decoration-dotted underline-offset-4'
                          onClick={() => setSelectedMemoryId(memory.principalText)}
                        >
                          {memory.principalText}
                        </Link>
                      ) : (
                        '--'
                      )}
                    </span>
                    <Badge className='rounded-full border border-zinc-200/70 bg-zinc-50 text-zinc-700'>
                      {memory.state}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-col items-start gap-2'>
            <div className='flex items-center gap-2'>
              <span className='text-lg font-semibold'>Recent activity</span>
              <Button variant='ghost' size='sm' className='rounded-full text-xs text-zinc-500'>
                View all
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <TransactionDatatable data={transactionData} />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}

export default DashboardShell
