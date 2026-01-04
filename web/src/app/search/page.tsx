// Where: Search page entry.
// What: Runs embedding + memory search and displays scored results.
// Why: Provides a complete search flow in the web UI.
'use client'

import { useState } from 'react'

import AppShell from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useIdentityState } from '@/components/providers/identity-provider'
import { useSelectedMemory } from '@/hooks/use-selected-memory'
import { createMemoryActor } from '@/lib/memory'
import { fetchEmbedding } from '@/lib/embedding'

type SearchResult = {
  score: number
  text: string
}

const SearchPage = () => {
  const identityState = useIdentityState()
  const { selectedMemoryId } = useSelectedMemory()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  const canSearch = Boolean(identityState.isAuthenticated && selectedMemoryId && query.trim())

  const handleSearch = async () => {
    if (!identityState.identity || !selectedMemoryId) return

    setIsSearching(true)
    setStatus(null)
    setResults([])

    try {
      // Embedding first, then query the memory canister.
      const embedding = await fetchEmbedding(query.trim())
      const actor = await createMemoryActor(identityState.identity, selectedMemoryId)
      const rawResults = await actor.search(embedding)
      const sorted = [...rawResults].sort((a, b) => b[0] - a[0])
      const formatted = sorted.map((item) => ({ score: item[0], text: item[1] }))
      setResults(formatted)
      if (!formatted.length) {
        setStatus('No results found.')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed'
      setStatus(message)
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <AppShell pageTitle='Search' identityState={identityState}>
      <div className='grid gap-6'>
        <Card>
          <CardHeader className='flex flex-col items-start gap-2'>
            <span className='text-lg font-semibold'>Search</span>
            <span className='text-muted-foreground text-sm'>
              Generate an embedding for the query and search the selected memory.
            </span>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex flex-col gap-2'>
              <label className='text-sm text-zinc-600'>Memory</label>
              <div className='rounded-2xl border border-zinc-200/70 bg-white/70 px-3 py-2 text-sm'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='text-muted-foreground'>Selected</span>
                  <span className='font-mono text-sm text-zinc-900'>{selectedMemoryId ?? '--'}</span>
                </div>
              </div>
            </div>
            <div className='flex flex-col gap-2'>
              <label className='text-sm text-zinc-600'>Query</label>
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder='Search query'
              />
            </div>
            <div className='flex items-center gap-3'>
              <Button className='rounded-full' onClick={handleSearch} disabled={!canSearch || isSearching}>
                {isSearching ? 'Searching…' : 'Search'}
              </Button>
              {status ? <span className='text-muted-foreground text-sm'>{status}</span> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-col items-start gap-2'>
            <span className='text-lg font-semibold'>Results</span>
            <span className='text-muted-foreground text-sm'>Scores with matched text.</span>
          </CardHeader>
          <CardContent className='space-y-3'>
            {results.length ? (
              <div className='space-y-3'>
                {results.map((result, index) => (
                  <div
                    key={`${result.score}-${index}`}
                    className='rounded-2xl border border-zinc-200/70 bg-white/70 px-3 py-2 text-sm'
                  >
                    <div className='text-muted-foreground text-xs'>Score</div>
                    <div className='font-mono text-sm text-zinc-900'>{result.score.toFixed(4)}</div>
                    <div className='mt-2 text-muted-foreground text-xs'>Text</div>
                    <div className='text-sm text-zinc-900'>{result.text}</div>
                  </div>
                ))}
              </div>
            ) : (
              <span className='text-muted-foreground text-sm'>No results yet.</span>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}

export default SearchPage
