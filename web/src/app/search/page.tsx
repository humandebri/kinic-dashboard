// どこで: Searchページの入口。
// なにを: クエリを埋め込み検索し、結果を表示する。
// なぜ: Web UIで検索体験を完結させるため。
'use client'

import { useEffect, useMemo, useState } from 'react'
import { Principal } from '@dfinity/principal'

import AppShell from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MultiSelectComboboxInput } from '@/components/ui/multi-select-combobox-input'
import SearchHistory from '@/components/search/search-history'
import SearchResults from '@/components/search/search-results'
import { useIdentityState } from '@/components/providers/identity-provider'
import { useMemories } from '@/hooks/use-memories'
import { useSelectedMemory } from '@/hooks/use-selected-memory'
import { createMemoryActor } from '@/lib/memory'
import { fetchEmbedding } from '@/lib/embedding'
import { extractRelatedTerms, parseRejectMessage, parseResultText, type ParsedResult } from '@/lib/search-utils'

const HISTORY_KEY = 'kinic.search.history'
const SAVED_KEY = 'kinic.search.saved'
const TARGET_KEY = 'kinic.search.targets'

type SortMode = 'score_desc' | 'score_asc' | 'tag'

const normalizeMemoryId = (value: string) => value.trim()

const SearchPage = () => {
  const identityState = useIdentityState()
  const { selectedMemoryId } = useSelectedMemory()
  const { memories } = useMemories(identityState.identity, identityState.isReady)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ParsedResult[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [errorMessages, setErrorMessages] = useState<{ canisterId: string; message: string }[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedTag, setSelectedTag] = useState('all')
  const [sortMode, setSortMode] = useState<SortMode>('score_desc')
  const [history, setHistory] = useState<string[]>([])
  const [savedQueries, setSavedQueries] = useState<string[]>([])
  const [targetInputs, setTargetInputs] = useState<string[]>([''])
  const [targetMemoryIds, setTargetMemoryIds] = useState<string[]>([])
  const [targetStatus, setTargetStatus] = useState<string | null>(null)

  const hasTargetInput = targetInputs.some((value) => Boolean(normalizeMemoryId(value)))
  const canSearch = Boolean(hasTargetInput && query.trim())
  const queryTokens = useMemo(() => {
    return query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter((token) => token.length >= 2)
  }, [query])

  const validateTargets = (values: string[]) => {
    const trimmed = values.map(normalizeMemoryId).filter(Boolean)
    const unique = Array.from(new Set(trimmed))
    const valid: string[] = []
    let invalidCount = 0

    for (const value of unique) {
      try {
        Principal.fromText(value)
        valid.push(value)
      } catch {
        invalidCount += 1
      }
    }

    return { valid, invalidCount }
  }

  const syncTargets = (values: string[]) => {
    setTargetInputs(values)
    const { valid, invalidCount } = validateTargets(values)
    const limited = valid.slice(0, 10)
    setTargetMemoryIds(limited)
    localStorage.setItem(TARGET_KEY, JSON.stringify(limited))
    if (invalidCount > 0) {
      setTargetStatus('Invalid canister id.')
      return
    }
    if (valid.length > 10) {
      setTargetStatus('Only the first 10 canisters are used.')
      return
    }
    setTargetStatus(null)
  }

  const handleTargetChange = (index: number, value: string) => {
    const nextInputs = [...targetInputs]
    nextInputs[index] = value
    syncTargets(nextInputs)
  }

  const handleTargetSelect = (index: number, values: string[]) => {
    const nextValue = values.length > 0 ? values[values.length - 1] : ''
    handleTargetChange(index, nextValue)
  }

  const addTargetInput = () => {
    syncTargets([...targetInputs, ''])
  }

  const removeTargetInput = (index: number) => {
    const nextInputs = targetInputs.filter((_, current) => current !== index)
    syncTargets(nextInputs.length ? nextInputs : [''])
  }

  const handleSearch = async () => {
    if (!identityState.identity) return

    const { valid, invalidCount } = validateTargets(targetInputs)
    if (invalidCount > 0) {
      setTargetStatus('Invalid canister id.')
    } else {
      setTargetStatus(null)
    }
    if (valid.length === 0) {
      setStatus('Add at least one canister id.')
      return
    }
    const targetIds = valid.slice(0, 10)
    syncTargets(targetIds)

    setIsSearching(true)
    setStatus(null)
    setResults([])
    setErrorMessages([])

    try {
      const trimmedQuery = query.trim()
      const embedding = await fetchEmbedding(trimmedQuery)
      const settled = await Promise.allSettled(
        targetIds.map(async (memoryId) => {
          const actor = await createMemoryActor(identityState.identity, memoryId)
          const rawResults = await actor.search(embedding)
          return { memoryId, rawResults }
        })
      )

      const errors = settled.filter((result) => result.status === 'rejected')
      const successes = settled
        .filter((result): result is PromiseFulfilledResult<{ memoryId: string; rawResults: [number, string][] }> => {
          return result.status === 'fulfilled'
        })
        .flatMap((result) => {
          const { memoryId, rawResults } = result.value
          return rawResults.map((item) => {
            const parsed = parseResultText(item[1])
            return {
              score: item[0],
              rawText: item[1],
              sentence: parsed.sentence,
              tag: parsed.tag,
              memoryId
            }
          })
        })

      const sorted = [...successes].sort((a, b) => b.score - a.score)
      setResults(sorted)
      if (!sorted.length) {
        setStatus('No results found.')
      }
      if (errors.length) {
        const messages = errors.map((result, index) => {
          const reason = result.reason
          const raw = reason instanceof Error ? reason.message : String(reason)
          const parsed = parseRejectMessage(raw) ?? raw
          return { canisterId: targetIds[index] ?? 'unknown', message: parsed }
        })
        setErrorMessages(messages)
        setStatus(`Failed on ${errors.length} canister${errors.length === 1 ? '' : 's'}.`)
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
    const storedTargets = localStorage.getItem(TARGET_KEY)
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
    if (storedTargets) {
      try {
        const parsed = JSON.parse(storedTargets)
        if (Array.isArray(parsed)) {
          const parsedTargets = parsed.filter((item): item is string => typeof item === 'string')
          syncTargets(parsedTargets.length ? parsedTargets : [''])
        }
      } catch {
        // Ignore parse errors.
      }
    }
  }, [])

  useEffect(() => {
    if (!selectedMemoryId) return
    const normalizedSelected = normalizeMemoryId(selectedMemoryId)
    if (!normalizedSelected) return
    const current = targetInputs.map((value) => normalizeMemoryId(value)).filter(Boolean)
    if (current.includes(normalizedSelected)) return
    const next = [normalizedSelected, ...current.filter((value) => value !== normalizedSelected)]
    syncTargets(next)
  }, [selectedMemoryId, targetInputs])

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

  const memoryOptions = useMemo(() => {
    const options = memories
      .map((memory) => memory.principalText)
      .filter((value): value is string => Boolean(value))
    if (selectedMemoryId) {
      options.unshift(selectedMemoryId)
    }
    const merged = [...options, ...targetMemoryIds]
    return Array.from(new Set(merged))
  }, [memories, selectedMemoryId, targetMemoryIds])

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
              <label className='text-sm text-zinc-600'>Targets</label>
              <div className='text-sm'>
                <span className='text-xs text-zinc-500'>Add canister IDs to search.</span>
                <div className='mt-3 flex flex-col gap-3'>
                  <div className='flex flex-col gap-2'>
                    {targetInputs.map((value, index) => (
                      <div key={`target-${index}`} className='flex items-center gap-2'>
                        <MultiSelectComboboxInput
                          values={value ? [value] : []}
                          options={memoryOptions}
                          placeholder='Add canister id'
                          onChange={(values) => handleTargetSelect(index, values)}
                          onInputValueChange={(nextValue) => handleTargetChange(index, nextValue)}
                          showSelections={false}
                          keepInputValueOnSelect
                        />
                        <Button
                          variant='outline'
                          size='sm'
                          className='rounded-full'
                          onClick={() => removeTargetInput(index)}
                          disabled={targetInputs.length === 1}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className='flex items-center gap-2'>
                    <Button variant='outline' size='sm' className='rounded-full' onClick={addTargetInput}>
                      + Add canister
                    </Button>
                    {targetStatus ? <span className='text-muted-foreground text-xs'>{targetStatus}</span> : null}
                  </div>
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
            {errorMessages.length ? (
              <div className='rounded-2xl border border-zinc-200/70 bg-white/70 px-3 py-2 text-xs text-zinc-600'>
                {errorMessages.map((item, index) => (
                  <div key={`${item.canisterId}-${index}`} className='break-words'>
                    <span className='font-mono text-zinc-700'>{item.canisterId}</span>
                    <span className='text-zinc-500'> · </span>
                    <span>{item.message}</span>
                  </div>
                ))}
              </div>
            ) : null}
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
