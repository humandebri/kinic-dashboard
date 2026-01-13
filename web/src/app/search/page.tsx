// どこで: Searchページの入口。
// なにを: クエリを埋め込み検索し、結果を表示する。
// なぜ: Web UIで検索体験を完結させるため。
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { XIcon } from 'lucide-react'
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

const SAVED_KEY = 'kinic.search.saved'
const TARGET_KEY = 'kinic.search.targets'

type SortMode = 'score_desc' | 'score_asc' | 'tag'
type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: ParsedResult[]
}

type MessagePart =
  | { kind: 'text'; value: string }
  | { kind: 'citation'; value: string; index: number }

const normalizeMemoryId = (value: string) => value.trim()
const parseCitationOrder = (content: string) => {
  const matches = content.matchAll(/\[(\d+)\]/g)
  const seen = new Set<number>()
  const ordered: number[] = []
  for (const match of matches) {
    const indexValue = Number(match[1])
    if (Number.isNaN(indexValue) || indexValue <= 0) continue
    if (seen.has(indexValue)) continue
    seen.add(indexValue)
    ordered.push(indexValue)
  }
  return ordered
}

const remapCitations = (content: string, order: number[]) => {
  if (order.length === 0) {
    return content.replace(/\[\d+\]/g, '').replace(/\s{2,}/g, ' ').trim()
  }
  const map = new Map<number, number>()
  order.forEach((oldIndex, newIndex) => {
    map.set(oldIndex, newIndex + 1)
  })
  return content.replace(/\[(\d+)\]/g, (match, raw) => {
    const oldIndex = Number(raw)
    const mapped = map.get(oldIndex)
    if (!mapped) return ''
    return `[${mapped}]`
  }).replace(/\s{2,}/g, ' ').trim()
}

const SearchPage = () => {
  const identityState = useIdentityState()
  const { selectedMemoryId } = useSelectedMemory()
  const { memories } = useMemories(identityState.identity, identityState.isReady)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ParsedResult[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [errorMessages, setErrorMessages] = useState<{ canisterId: string; message: string }[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [sortMode, setSortMode] = useState<SortMode>('score_desc')
  const [savedQueries, setSavedQueries] = useState<string[]>([])
  const [targetInputs, setTargetInputs] = useState<string[]>([''])
  const [targetMemoryIds, setTargetMemoryIds] = useState<string[]>([])
  const [targetStatus, setTargetStatus] = useState<string | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isAnswering, setIsAnswering] = useState(false)

  const hasTargetInput = targetInputs.some((value) => Boolean(normalizeMemoryId(value)))
  const canSearch = Boolean(hasTargetInput && query.trim())
  const queryTokens = useMemo(() => {
    return query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter((token) => token.length >= 2)
  }, [query])

  const validateTargets = useCallback((values: string[]) => {
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
  }, [])

  const syncTargets = useCallback((values: string[]) => {
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
  }, [validateTargets])

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

  const extractAnswer = (payload: unknown) => {
    if (!payload || typeof payload !== 'object') return null
    const answer = Reflect.get(payload, 'answer')
    return typeof answer === 'string' ? answer : null
  }

  const requestAnswer = useCallback(async (question: string, sources: ParsedResult[]) => {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        question,
        sources: sources.map((source) => ({
          memoryId: source.memoryId,
          sentence: source.sentence,
          tag: source.tag ?? null,
          score: source.score
        }))
      })
    })

    if (!response.ok) {
      const message = await response.text()
      throw new Error(message || 'Failed to generate answer')
    }

    const payload: unknown = await response.json()
    const answer = extractAnswer(payload)
    if (!answer) {
      throw new Error('Invalid response from answer service')
    }
    return answer
  }, [])

  const runSearch = useCallback(async (nextQuery?: string) => {
    const identity = identityState.identity
    if (!identity) {
      setStatus('Connect identity to search.')
      return []
    }

    const { valid, invalidCount } = validateTargets(targetInputs)
    if (invalidCount > 0) {
      setTargetStatus('Invalid canister id.')
    } else {
      setTargetStatus(null)
    }
    if (valid.length === 0) {
      setStatus('Add at least one canister id.')
      return []
    }
    const targetIds = valid.slice(0, 10)
    syncTargets(targetIds)

    setIsSearching(true)
    setStatus(null)
    setResults([])
    setErrorMessages([])

    try {
      const trimmedQuery = (nextQuery ?? query).trim()
      const embedding = await fetchEmbedding(trimmedQuery)
      const settled = await Promise.allSettled(
        targetIds.map(async (memoryId) => {
          const actor = await createMemoryActor(identity, memoryId)
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

      return sorted
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed'
      setStatus(message)
      return []
    } finally {
      setIsSearching(false)
    }
  }, [identityState.identity, query, syncTargets, targetInputs, validateTargets])

  const handleSearch = async () => {
    await runSearch()
  }

  useEffect(() => {
    const storedSaved = localStorage.getItem(SAVED_KEY)
    const storedTargets = localStorage.getItem(TARGET_KEY)
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
  }, [syncTargets])

  useEffect(() => {
    if (!selectedMemoryId) return
    const normalizedSelected = normalizeMemoryId(selectedMemoryId)
    if (!normalizedSelected) return
    const current = targetInputs.map((value) => normalizeMemoryId(value)).filter(Boolean)
    if (current.includes(normalizedSelected)) return
    const next = [normalizedSelected, ...current.filter((value) => value !== normalizedSelected)]
    syncTargets(next)
  }, [selectedMemoryId, targetInputs, syncTargets])

  const tags = useMemo(() => {
    const tagSet = new Set(results.map((result) => result.tag ?? 'untagged'))
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b))
  }, [results])

  const applyTagFilter = useCallback((items: ParsedResult[]) => {
    if (selectedTags.length === 0) return items
    const tagSet = new Set(selectedTags)
    return items.filter((item) => tagSet.has(item.tag ?? 'untagged'))
  }, [selectedTags])

  const filteredResults = useMemo(() => {
    const filtered = applyTagFilter(results)

    if (sortMode === 'score_asc') {
      return [...filtered].sort((a, b) => a.score - b.score)
    }
    if (sortMode === 'tag') {
      return [...filtered].sort((a, b) => (a.tag ?? '').localeCompare(b.tag ?? ''))
    }
    return [...filtered].sort((a, b) => b.score - a.score)
  }, [applyTagFilter, results, sortMode])

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

  const handleChatSubmit = useCallback(async () => {
    const trimmed = chatInput.trim()
    if (!trimmed || isAnswering) return
    if (!hasTargetInput) {
      setStatus('Add at least one canister id.')
      return
    }
    setIsAnswering(true)
    setQuery(trimmed)
    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      content: trimmed
    }
    setChatMessages((prev) => [...prev, userMessage])
    setChatInput('')

    try {
      const searchResults = await runSearch(trimmed)
      const filteredForAnswer = applyTagFilter(searchResults)
      if (selectedTags.length > 0 && filteredForAnswer.length === 0) {
        setStatus('No results for selected tags.')
        setChatMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-assistant`,
            role: 'assistant',
            content: 'No results found for the selected tags.'
          }
        ])
        return
      }
      const answer = await requestAnswer(trimmed, filteredForAnswer)
      const citationOrder = parseCitationOrder(answer)
      const remappedAnswer = remapCitations(answer, citationOrder)
      const citedSources = citationOrder
        .map((index) => filteredForAnswer[index - 1])
        .filter((source): source is ParsedResult => Boolean(source))
      const assistantMessage: ChatMessage = {
        id: `${Date.now()}-assistant`,
        role: 'assistant',
        content: remappedAnswer,
        sources: citedSources
      }
      setChatMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to answer'
      const assistantMessage: ChatMessage = {
        id: `${Date.now()}-assistant`,
        role: 'assistant',
        content: message
      }
      setChatMessages((prev) => [...prev, assistantMessage])
    } finally {
      setIsAnswering(false)
    }
  }, [applyTagFilter, chatInput, hasTargetInput, isAnswering, requestAnswer, runSearch, selectedTags.length])

  const parseMessageParts = useCallback((content: string): MessagePart[] => {
    const parts: MessagePart[] = []
    const pattern = /\[(\d+)\]/g
    let lastIndex = 0

    for (const match of content.matchAll(pattern)) {
      if (match.index === undefined) continue
      const start = match.index
      const end = start + match[0].length
      if (start > lastIndex) {
        parts.push({ kind: 'text', value: content.slice(lastIndex, start) })
      }
      const indexValue = Number(match[1])
      if (!Number.isNaN(indexValue)) {
        parts.push({ kind: 'citation', value: match[0], index: indexValue })
      } else {
        parts.push({ kind: 'text', value: match[0] })
      }
      lastIndex = end
    }

    if (lastIndex < content.length) {
      parts.push({ kind: 'text', value: content.slice(lastIndex) })
    }

    return parts
  }, [])

  const renderMessageContent = useCallback(
    (message: ChatMessage) => {
      if (message.role !== 'assistant') {
        return <div className='whitespace-pre-line break-words'>{message.content}</div>
      }

      const sourceCount = message.sources ? message.sources.length : 0
      const parts = parseMessageParts(message.content)
      return (
        <div className='whitespace-pre-line break-words'>
          {parts.map((part, index) => {
            if (part.kind === 'text') {
              return <span key={`${message.id}-text-${index}`}>{part.value}</span>
            }
            const targetId = `${message.id}-source-${part.index}`
            if (part.index >= 1 && part.index <= sourceCount) {
              return (
                <a
                  key={`${message.id}-cite-${index}`}
                  href={`#${targetId}`}
                  className='font-semibold text-zinc-900 underline decoration-dotted underline-offset-2'
                >
                  {part.value}
                </a>
              )
            }
            return <span key={`${message.id}-cite-${index}`}>{part.value}</span>
          })}
        </div>
      )
    },
    [parseMessageParts]
  )

  return (
    <AppShell pageTitle='Search' identityState={identityState} fullWidth>
      <div className='grid w-full max-w-none items-stretch gap-6 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,560px)_minmax(0,1fr)]'>
        <div className='grid h-full min-w-0 gap-6'>
          <Card className='min-w-0'>
            <CardHeader className='flex flex-col items-start gap-2'>
              <span className='text-lg font-semibold'>Sources & search</span>
            </CardHeader>
            <CardContent className='min-w-0 space-y-4'>
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
                          size='icon'
                          className='h-9 w-9 rounded-full'
                          onClick={() => removeTargetInput(index)}
                          disabled={targetInputs.length === 1}
                          aria-label='Remove target'
                        >
                          <XIcon className='h-4 w-4' />
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
                <label className='text-sm text-zinc-600'>Search</label>
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
              <div className='flex flex-col gap-2'>
                <label className='text-sm text-zinc-600'>Tags</label>
                <MultiSelectComboboxInput
                  values={selectedTags}
                  options={tags}
                  placeholder='Filter by tag'
                  onChange={setSelectedTags}
                  emptyMessage='No matching tags'
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
              history={[]}
              savedQueries={savedQueries}
              onSelect={(value) => setQuery(value)}
            />
            </CardContent>
          </Card>

          <Card className='min-w-0'>
            <CardHeader className='flex flex-col items-start gap-2'>
              <span className='text-lg font-semibold'>Results</span>
              <span className='text-muted-foreground text-sm'>
                Sort results and review matched snippets.
              </span>
            </CardHeader>
            <CardContent className='min-w-0 space-y-3'>
            <SearchResults
              results={filteredResults}
              sortMode={sortMode}
              queryTokens={queryTokens}
              relatedTerms={relatedTerms}
              onSortChange={setSortMode}
              onQuerySelect={setQuery}
            />
            </CardContent>
          </Card>
        </div>

        <Card className='flex h-full min-w-0 flex-col'>
          <CardHeader className='flex flex-col items-start gap-2'>
            <span className='text-lg font-semibold'>Ask</span>
          </CardHeader>
          <CardContent className='flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-auto'>
            <div className='flex flex-col gap-3'>
              {chatMessages.length === 0 ? (
                <div className='rounded-2xl border border-dashed border-zinc-200/80 bg-white/70 px-4 py-6 text-sm text-zinc-500'>
                  Start with a question to generate a draft answer from your sources.
                </div>
              ) : (
                chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`break-words rounded-2xl px-4 py-3 text-sm ${
                      message.role === 'user'
                        ? 'bg-zinc-900 text-white'
                        : 'border border-zinc-200/70 bg-white/80 text-zinc-900'
                    }`}
                  >
                    {renderMessageContent(message)}
                    {message.role === 'assistant' && message.sources && message.sources.length > 0 ? (
                      <div className='mt-3 border-t border-zinc-200/70 pt-3 text-xs text-zinc-600'>
                        <div className='text-[10px] font-semibold uppercase tracking-wide text-zinc-500'>
                          Sources
                        </div>
                        <div className='mt-2 flex flex-col gap-2'>
                          {message.sources.map((source, index) => (
                            <div
                              key={`${source.memoryId}-${index}`}
                              id={`${message.id}-source-${index + 1}`}
                              className='rounded-xl bg-zinc-50 px-3 py-2'
                            >
                              <div className='flex flex-wrap items-center gap-2 text-[10px] text-zinc-500'>
                                <span className='font-semibold'>[{index + 1}]</span>
                                <span className='font-mono'>{source.memoryId}</span>
                                <span className='text-zinc-400'>:</span>
                                <span className='font-mono'>{source.tag ?? 'untagged'}</span>
                              </div>
                              <div className='break-words text-xs text-zinc-700'>{source.sentence}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
            <div className='flex w-full flex-col gap-2'>
              <label className='text-sm text-zinc-600'>Question</label>
              <textarea
                className='min-h-[96px] w-full resize-none rounded-2xl border border-zinc-200/70 bg-white/70 p-3 text-sm text-zinc-900'
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    handleChatSubmit()
                  }
                }}
                placeholder='Ask about your sources'
              />
              <div className='flex w-full items-center gap-3'>
                <Button
                  className='rounded-full'
                  onClick={handleChatSubmit}
                  disabled={!chatInput.trim() || isAnswering || isSearching || !hasTargetInput}
                >
                  {isAnswering ? 'Answering…' : 'Send'}
                </Button>
                {!hasTargetInput ? (
                  <span className='text-xs text-zinc-500'>Add at least one target first.</span>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}

export default SearchPage
