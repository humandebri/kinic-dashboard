// どこで: Searchページの入口。
// なにを: クエリを埋め込み検索し、結果を表示する。
// なぜ: Web UIで検索体験を完結させるため。
'use client'

import { useEffect, useMemo, useState } from 'react'

import AppShell from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import SearchHistory from '@/components/search/search-history'
import SearchResults from '@/components/search/search-results'
import { useIdentityState } from '@/components/providers/identity-provider'
import { useSelectedMemory } from '@/hooks/use-selected-memory'
import { createMemoryActor } from '@/lib/memory'
import { fetchEmbedding } from '@/lib/embedding'
import { extractRelatedTerms, parseResultText, type ParsedResult } from '@/lib/search-utils'

const HISTORY_KEY = 'kinic.search.history'
const SAVED_KEY = 'kinic.search.saved'

type SortMode = 'score_desc' | 'score_asc' | 'tag'

const SearchPage = () => {
  const identityState = useIdentityState()
  const { selectedMemoryId } = useSelectedMemory()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ParsedResult[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [selectedTag, setSelectedTag] = useState('all')
  const [sortMode, setSortMode] = useState<SortMode>('score_desc')
  const [history, setHistory] = useState<string[]>([])
  const [savedQueries, setSavedQueries] = useState<string[]>([])

  const canSearch = Boolean(identityState.isAuthenticated && selectedMemoryId && query.trim())
  const queryTokens = useMemo(() => {
    return query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter((token) => token.length >= 2)
  }, [query])

  const handleSearch = async () => {
    if (!identityState.identity || !selectedMemoryId) return

    setIsSearching(true)
    setStatus(null)
    setResults([])

    try {
      const trimmedQuery = query.trim()
      const embedding = await fetchEmbedding(trimmedQuery)
      const actor = await createMemoryActor(identityState.identity, selectedMemoryId)
      const rawResults = await actor.search(embedding)
      const sorted = [...rawResults].sort((a, b) => b[0] - a[0])
      const formatted = sorted.map((item) => {
        const parsed = parseResultText(item[1])
        return {
          score: item[0],
          rawText: item[1],
          sentence: parsed.sentence,
          tag: parsed.tag
        }
      })
      setResults(formatted)
      if (!formatted.length) {
        setStatus('No results found.')
      }

      if (trimmedQuery) {
        const nextHistory = [trimmedQuery, ...history.filter((item) => item !== trimmedQuery)].slice(0, 8)
        setHistory(nextHistory)
        localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed'
      setStatus(message)
    } finally {
      setIsSearching(false)
    }
  }

  useEffect(() => {
    const storedHistory = localStorage.getItem(HISTORY_KEY)
    const storedSaved = localStorage.getItem(SAVED_KEY)
    if (storedHistory) {
      try {
        const parsed = JSON.parse(storedHistory)
        if (Array.isArray(parsed)) {
          setHistory(parsed.filter((item): item is string => typeof item === 'string'))
        }
      } catch {
        // Ignore parse errors.
      }
    }
    if (storedSaved) {
      try {
        const parsed = JSON.parse(storedSaved)
        if (Array.isArray(parsed)) {
          setSavedQueries(parsed.filter((item): item is string => typeof item === 'string'))
        }
      } catch {
        // Ignore parse errors.
      }
    }
  }, [])

  const tags = useMemo(() => {
    const tagSet = new Set(results.map((result) => result.tag).filter(Boolean) as string[])
    return ['all', ...Array.from(tagSet).sort((a, b) => a.localeCompare(b))]
  }, [results])

  const filteredResults = useMemo(() => {
    const filtered = selectedTag === 'all'
      ? results
      : results.filter((result) => result.tag === selectedTag)

    if (sortMode === 'score_asc') {
      return [...filtered].sort((a, b) => a.score - b.score)
    }
    if (sortMode === 'tag') {
      return [...filtered].sort((a, b) => (a.tag ?? '').localeCompare(b.tag ?? ''))
    }
    return [...filtered].sort((a, b) => b.score - a.score)
  }, [results, selectedTag, sortMode])

  const relatedTerms = useMemo(() => {
    const exclude = new Set([
      ...queryTokens,
      'the',
      'and',
      'for',
      'with',
      'that',
      'this',
      'from',
      'have',
      'into',
      'your',
      'about',
      'was',
      'are'
    ])
    return extractRelatedTerms(filteredResults.map((result) => result.sentence), exclude)
  }, [filteredResults, queryTokens])

  const handleSaveQuery = () => {
    const trimmed = query.trim()
    if (!trimmed) return
    const nextSaved = [trimmed, ...savedQueries.filter((item) => item !== trimmed)].slice(0, 8)
    setSavedQueries(nextSaved)
    localStorage.setItem(SAVED_KEY, JSON.stringify(nextSaved))
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
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && canSearch) {
                    event.preventDefault()
                    handleSearch()
                  }
                }}
                placeholder='Search query'
              />
            </div>
            <div className='flex items-center gap-3'>
              <Button className='rounded-full' onClick={handleSearch} disabled={!canSearch || isSearching}>
                {isSearching ? 'Searching…' : 'Search'}
              </Button>
              <Button
                variant='outline'
                size='sm'
                className='rounded-full'
                onClick={handleSaveQuery}
                disabled={!query.trim()}
              >
                Save query
              </Button>
              {status ? <span className='text-muted-foreground text-sm'>{status}</span> : null}
            </div>
            <SearchHistory
              history={history}
              savedQueries={savedQueries}
              onSelect={(value) => setQuery(value)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-col items-start gap-2'>
            <span className='text-lg font-semibold'>Results</span>
            <span className='text-muted-foreground text-sm'>
              Filter by tag, sort results, and review matched snippets.
            </span>
          </CardHeader>
          <CardContent className='space-y-3'>
            <SearchResults
              results={filteredResults}
              tags={tags}
              selectedTag={selectedTag}
              sortMode={sortMode}
              queryTokens={queryTokens}
              relatedTerms={relatedTerms}
              onTagChange={setSelectedTag}
              onSortChange={setSortMode}
              onQuerySelect={setQuery}
            />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}

export default SearchPage
