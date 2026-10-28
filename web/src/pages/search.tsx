// どこで: Search & Ask ページ。
// なにを: 選択したメモリーを埋め込み検索し、結果表示とGeminiによる引用付き回答を行う。
// なぜ: Web UIで検索体験を完結させるため。
import { Principal } from '@dfinity/principal'
import {
  ArrowUpIcon,
  BookmarkIcon,
  CheckIcon,
  Loader2Icon,
  MessageSquareTextIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import ConnectPrompt from '@/components/common/connect-prompt'
import EmptyState from '@/components/common/empty-state'
import PageHeader from '@/components/common/page-header'
import { useIdentityState } from '@/components/providers/identity-provider'
import SearchResults from '@/components/search/search-results'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useMemoryOptions } from '@/hooks/use-memory-options'
import { fetchEmbedding } from '@/lib/embedding'
import { errorMessage, shortenPrincipal } from '@/lib/format'
import { createMemoryActor } from '@/lib/memory'
import { extractRelatedTerms, parseRejectMessage, parseResultText, type ParsedResult } from '@/lib/search-utils'
import { readStringArray, writeStorage } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { useSelectedMemory } from '@/stores/selected-memory'

const SAVED_KEY = 'kinic.search.saved'
const TARGET_KEY = 'kinic.search.targets'
const MAX_TARGETS = 10
const MAX_ANSWER_SOURCES = 40

type SortMode = 'score_desc' | 'score_asc' | 'tag'
type Tab = 'ask' | 'search'
type SearchFailure = { canisterId: string; message: string }
type SearchOutcome = { results: ParsedResult[]; failures: SearchFailure[] }
type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: ParsedResult[]
  isError?: boolean
}

const STOP_WORDS = ['the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'into', 'your', 'about', 'was', 'are']

const isValidPrincipal = (value: string) => {
  try {
    Principal.fromText(value)
    return true
  } catch {
    return false
  }
}

const parseCitationOrder = (content: string) => {
  const seen = new Set<number>()
  const ordered: number[] = []
  for (const match of content.matchAll(/\[(\d+)\]/g)) {
    const indexValue = Number(match[1])
    if (Number.isNaN(indexValue) || indexValue <= 0 || seen.has(indexValue)) continue
    seen.add(indexValue)
    ordered.push(indexValue)
  }
  return ordered
}

const remapCitations = (content: string, order: number[]) => {
  if (order.length === 0) return content.replace(/\[\d+\]/g, '').replace(/[ \t]{2,}/g, ' ').trim()
  const map = new Map(order.map((oldIndex, newIndex) => [oldIndex, newIndex + 1]))
  return content
    .replace(/\[(\d+)\]/g, (_, raw) => {
      const mapped = map.get(Number(raw))
      return mapped ? `[${mapped}]` : ''
    })
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

const MessageBody = ({ message }: { message: ChatMessage }) => {
  if (message.role !== 'assistant' || !message.sources?.length) {
    return <div className='whitespace-pre-line break-words'>{message.content}</div>
  }
  const count = message.sources.length
  const parts = message.content.split(/(\[\d+\])/g)
  return (
    <div className='whitespace-pre-line break-words'>
      {parts.map((part, index) => {
        const match = /^\[(\d+)\]$/.exec(part)
        const n = match ? Number(match[1]) : NaN
        if (!match || n < 1 || n > count) return <span key={index}>{part}</span>
        return (
          <a
            key={index}
            href={`#${message.id}-source-${n}`}
            className='mx-0.5 inline-flex h-4 min-w-4 -translate-y-0.5 items-center justify-center rounded bg-brand/10 px-1 align-middle text-[10px] font-semibold text-brand no-underline hover:bg-brand/20'
          >
            {n}
          </a>
        )
      })}
    </div>
  )
}

const SearchPage = () => {
  const identityState = useIdentityState()
  const selectedMemoryId = useSelectedMemory((state) => state.selectedMemoryId)
  const memoryOptions = useMemoryOptions()
  const [tab, setTab] = useState<Tab>('ask')
  const [targets, setTargets] = useState<string[]>(() => readStringArray(TARGET_KEY).filter(isValidPrincipal))
  const [extraTarget, setExtraTarget] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ParsedResult[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [errorMessages, setErrorMessages] = useState<SearchFailure[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [sortMode, setSortMode] = useState<SortMode>('score_desc')
  const [savedQueries, setSavedQueries] = useState<string[]>(() => readStringArray(SAVED_KEY))
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isAnswering, setIsAnswering] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const updateTargets = useCallback((next: string[]) => {
    const unique = Array.from(new Set(next)).slice(0, MAX_TARGETS)
    setTargets(unique)
    writeStorage(TARGET_KEY, JSON.stringify(unique))
  }, [])

  // Default to the active memory once on mount (not after the user clears the selection).
  const defaultedRef = useRef(false)
  useEffect(() => {
    if (defaultedRef.current) return
    defaultedRef.current = true
    if (targets.length === 0 && selectedMemoryId) updateTargets([selectedMemoryId])
  }, [selectedMemoryId, targets.length, updateTargets])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chatMessages.length, isAnswering])

  const sourceChips = useMemo(() => Array.from(new Set([...memoryOptions, ...targets])), [memoryOptions, targets])

  const toggleTarget = (id: string) => {
    if (targets.includes(id)) {
      updateTargets(targets.filter((item) => item !== id))
      return
    }
    if (targets.length >= MAX_TARGETS) {
      toast.warning(`Up to ${MAX_TARGETS} memories can be searched at once.`)
      return
    }
    updateTargets([...targets, id])
  }

  const handleAddExtra = (event: FormEvent) => {
    event.preventDefault()
    const value = extraTarget.trim()
    if (!value) return
    if (!isValidPrincipal(value)) {
      toast.error('Invalid canister ID')
      return
    }
    if (!targets.includes(value)) toggleTarget(value)
    setExtraTarget('')
  }

  const queryTokens = useMemo(
    () =>
      query
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter((token) => token.length >= 2),
    [query]
  )

  const applyTagFilter = useCallback(
    (items: ParsedResult[]) => {
      if (selectedTags.length === 0) return items
      const tagSet = new Set(selectedTags)
      return items.filter((item) => tagSet.has(item.tag ?? 'untagged'))
    },
    [selectedTags]
  )

  const runSearch = useCallback(
    async (rawQuery: string): Promise<SearchOutcome> => {
      const empty: SearchOutcome = { results: [], failures: [] }
      const identity = identityState.identity
      if (!identity) return empty
      if (targets.length === 0) {
        setStatus('Select at least one memory.')
        return empty
      }
      const trimmedQuery = rawQuery.trim()
      if (!trimmedQuery) return empty

      setIsSearching(true)
      setStatus(null)
      setErrorMessages([])

      try {
        const embedding = await fetchEmbedding(trimmedQuery)
        const settled = await Promise.allSettled(
          targets.map(async (memoryId) => {
            const actor = await createMemoryActor(identity, memoryId)
            return actor.search(embedding)
          })
        )

        const found: ParsedResult[] = []
        const failures: SearchFailure[] = []
        settled.forEach((result, index) => {
          const memoryId = targets[index]
          if (result.status === 'fulfilled') {
            for (const [score, rawText] of result.value) {
              const parsed = parseResultText(rawText)
              found.push({ score, rawText, sentence: parsed.sentence, tag: parsed.tag, memoryId })
            }
          } else {
            const raw = errorMessage(result.reason, String(result.reason))
            failures.push({ canisterId: memoryId, message: parseRejectMessage(raw) ?? raw })
          }
        })

        const sorted = found.sort((a, b) => b.score - a.score)
        setResults(sorted)
        setErrorMessages(failures)
        if (failures.length) {
          setStatus(`Failed on ${failures.length} memor${failures.length === 1 ? 'y' : 'ies'}.`)
        } else if (!sorted.length) {
          setStatus('No results found.')
        }
        return { results: sorted, failures }
      } catch (error) {
        const message = errorMessage(error, 'Search failed')
        setStatus(message)
        return { results: [], failures: [{ canisterId: 'embedding', message }] }
      } finally {
        setIsSearching(false)
      }
    },
    [identityState.identity, targets]
  )

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault()
    void runSearch(query)
  }

  const requestAnswer = async (question: string, sources: ParsedResult[]) => {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        sources: sources.map((source) => ({
          memoryId: source.memoryId,
          sentence: source.sentence,
          tag: source.tag ?? null
        }))
      })
    })
    const payload: unknown = await response.json().catch(() => null)
    const field = (key: string) =>
      payload && typeof payload === 'object' && typeof Reflect.get(payload, key) === 'string'
        ? (Reflect.get(payload, key) as string)
        : null
    if (!response.ok) throw new Error(field('error') ?? `Answer service failed (${response.status})`)
    const answer = field('answer')
    if (!answer) throw new Error('Invalid response from answer service')
    return answer
  }

  const handleAsk = async (event?: FormEvent) => {
    event?.preventDefault()
    const question = chatInput.trim()
    if (!question || isAnswering) return
    if (targets.length === 0) {
      toast.warning('Select at least one memory to ask.')
      return
    }
    setIsAnswering(true)
    setQuery(question)
    setChatInput('')
    setChatMessages((prev) => [...prev, { id: `${Date.now()}-user`, role: 'user', content: question }])

    try {
      // Keep only non-empty sentences so citation numbers line up with what the Worker receives.
      const outcome = await runSearch(question)
      const found = applyTagFilter(outcome.results)
        .filter((result) => result.sentence.trim())
        .slice(0, MAX_ANSWER_SOURCES)
      if (found.length === 0) {
        const allFailed = outcome.failures.length > 0 && outcome.results.length === 0
        setChatMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-assistant`,
            role: 'assistant',
            isError: allFailed,
            content: allFailed
              ? `Search failed: ${outcome.failures.map((item) => item.message).join(' · ')}`
              : selectedTags.length > 0
                ? 'No results found for the selected tags.'
                : 'I could not find anything relevant in the selected memories.'
          }
        ])
        return
      }
      const answer = await requestAnswer(question, found)
      const order = parseCitationOrder(answer)
      const cited = order.map((index) => found[index - 1]).filter((source): source is ParsedResult => Boolean(source))
      setChatMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-assistant`, role: 'assistant', content: remapCitations(answer, order), sources: cited }
      ])
    } catch (error) {
      setChatMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-assistant`, role: 'assistant', content: errorMessage(error, 'Failed to answer'), isError: true }
      ])
    } finally {
      setIsAnswering(false)
    }
  }

  const tags = useMemo(
    () => Array.from(new Set(results.map((result) => result.tag ?? 'untagged'))).sort((a, b) => a.localeCompare(b)),
    [results]
  )

  const filteredResults = useMemo(() => {
    const filtered = applyTagFilter(results)
    if (sortMode === 'score_asc') return [...filtered].sort((a, b) => a.score - b.score)
    if (sortMode === 'tag') return [...filtered].sort((a, b) => (a.tag ?? '').localeCompare(b.tag ?? ''))
    return [...filtered].sort((a, b) => b.score - a.score)
  }, [applyTagFilter, results, sortMode])

  const relatedTerms = useMemo(() => {
    const exclude = new Set([...queryTokens, ...STOP_WORDS])
    return extractRelatedTerms(
      filteredResults.map((result) => result.sentence),
      exclude
    )
  }, [filteredResults, queryTokens])

  const handleSaveQuery = () => {
    const trimmed = query.trim()
    if (!trimmed) return
    const next = [trimmed, ...savedQueries.filter((item) => item !== trimmed)].slice(0, 8)
    setSavedQueries(next)
    writeStorage(SAVED_KEY, JSON.stringify(next))
    toast.success('Query saved')
  }

  const removeSavedQuery = (value: string) => {
    const next = savedQueries.filter((item) => item !== value)
    setSavedQueries(next)
    writeStorage(SAVED_KEY, JSON.stringify(next))
  }

  if (identityState.isReady && !identityState.isAuthenticated) {
    return (
      <div className='space-y-6'>
        <PageHeader title='Search & Ask' description='Semantic search and cited answers across your memories.' />
        <ConnectPrompt />
      </div>
    )
  }

  return (
    <div className='space-y-5'>
      <PageHeader title='Search & Ask' description='Semantic search and cited answers across your memories.' />

      <Card>
        <CardContent className='space-y-3 p-4 sm:p-5'>
          <div className='flex items-center justify-between gap-2'>
            <div className='text-sm font-medium'>
              Sources{' '}
              <span className='font-normal text-muted-foreground'>
                · {targets.length}/{MAX_TARGETS} selected
              </span>
            </div>
            {targets.length ? (
              <Button variant='ghost' size='sm' onClick={() => updateTargets([])}>
                Clear
              </Button>
            ) : null}
          </div>
          <div className='flex flex-wrap gap-2'>
            {sourceChips.map((id) => {
              const active = targets.includes(id)
              return (
                <button
                  key={id}
                  type='button'
                  onClick={() => toggleTarget(id)}
                  aria-pressed={active}
                  title={id}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 font-mono text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active
                      ? 'border-brand/40 bg-brand/10 text-foreground'
                      : 'text-muted-foreground hover:border-foreground/20 hover:text-foreground'
                  )}
                >
                  {active ? <CheckIcon className='size-3.5 text-brand' /> : <PlusIcon className='size-3.5' />}
                  {shortenPrincipal(id, 11, 5)}
                </button>
              )
            })}
            <form onSubmit={handleAddExtra} className='flex items-center gap-1'>
              <Input
                value={extraTarget}
                onChange={(event) => setExtraTarget(event.target.value)}
                placeholder='Add canister ID'
                className='h-8 w-44 rounded-full font-mono text-xs'
                aria-label='Add canister ID'
                spellCheck={false}
              />
            </form>
          </div>
          {tags.length ? (
            <div className='flex flex-wrap items-center gap-2 border-t pt-3'>
              <span className='text-xs text-muted-foreground'>Tags</span>
              {tags.map((tag) => {
                const active = selectedTags.includes(tag)
                return (
                  <button
                    key={tag}
                    type='button'
                    aria-pressed={active}
                    onClick={() =>
                      setSelectedTags((prev) => (active ? prev.filter((item) => item !== tag) : [...prev, tag]))
                    }
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 text-xs transition',
                      active ? 'border-foreground bg-foreground text-background' : 'hover:bg-accent'
                    )}
                  >
                    {tag}
                  </button>
                )
              })}
              {selectedTags.length ? (
                <button type='button' className='text-xs text-muted-foreground hover:underline' onClick={() => setSelectedTags([])}>
                  Reset
                </button>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div role='tablist' aria-label='Mode' className='inline-flex rounded-lg border bg-muted p-1'>
        {(
          [
            ['ask', 'Ask', <MessageSquareTextIcon key='a' className='size-4' />],
            ['search', 'Search', <SearchIcon key='s' className='size-4' />]
          ] as const
        ).map(([value, label, icon]) => (
          <button
            key={value}
            role='tab'
            type='button'
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition',
              tab === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {icon}
            {label}
            {value === 'search' && results.length ? (
              <Badge variant='secondary' className='px-1.5 py-0'>
                {filteredResults.length}
              </Badge>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'ask' ? (
        <Card className='flex min-h-[520px] flex-col overflow-hidden'>
          <div className='flex-1 space-y-5 overflow-y-auto p-4 sm:p-6'>
            {chatMessages.length === 0 ? (
              <EmptyState
                className='border-none py-16'
                icon={<SparklesIcon />}
                title='Ask your memories'
                description='Questions are answered only from the selected sources, with numbered citations.'
              />
            ) : (
              chatMessages.map((message) =>
                message.role === 'user' ? (
                  <div key={message.id} className='flex justify-end'>
                    <div className='max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground'>
                      {message.content}
                    </div>
                  </div>
                ) : (
                  <div key={message.id} className='flex gap-3'>
                    <div className='mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand'>
                      <SparklesIcon className='size-3.5' />
                    </div>
                    <div className='min-w-0 flex-1 space-y-3 text-sm leading-relaxed'>
                      <div className={message.isError ? 'text-destructive' : undefined}>
                        <MessageBody message={message} />
                      </div>
                      {message.sources?.length ? (
                        <div className='grid gap-2'>
                          {message.sources.map((source, index) => (
                            <div
                              key={`${source.memoryId}-${index}`}
                              id={`${message.id}-source-${index + 1}`}
                              className='scroll-mt-20 rounded-lg border bg-muted/40 px-3 py-2 target:border-brand target:bg-brand/5'
                            >
                              <div className='mb-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground'>
                                <span className='inline-flex h-4 min-w-4 items-center justify-center rounded bg-brand/10 px-1 font-semibold text-brand'>
                                  {index + 1}
                                </span>
                                <span className='font-mono'>{shortenPrincipal(source.memoryId, 8, 4)}</span>
                                <span>·</span>
                                <span>{source.tag ?? 'untagged'}</span>
                              </div>
                              <div className='text-xs text-foreground/90'>{source.sentence}</div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              )
            )}
            {isAnswering ? (
              <div className='flex items-center gap-3 text-sm text-muted-foreground'>
                <Loader2Icon className='size-4 animate-spin text-brand' />
                {isSearching ? 'Searching memories…' : 'Writing answer…'}
              </div>
            ) : null}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={(event) => void handleAsk(event)} className='border-t bg-card p-3 sm:p-4'>
            <div className='relative'>
              <Textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    void handleAsk()
                  }
                }}
                placeholder={targets.length ? 'Ask about your sources…' : 'Select a source above first'}
                rows={2}
                maxLength={2000}
                className='min-h-[56px] resize-none pr-12'
              />
              <Button
                type='submit'
                size='icon-sm'
                variant='brand'
                className='absolute bottom-2 right-2 rounded-full'
                disabled={!chatInput.trim() || isAnswering || targets.length === 0}
                aria-label='Send question'
              >
                <ArrowUpIcon />
              </Button>
            </div>
            <div className='mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground'>
              <span>Enter to send · Shift+Enter for newline</span>
              {chatMessages.length ? (
                <button type='button' className='inline-flex items-center gap-1 hover:text-foreground' onClick={() => setChatMessages([])}>
                  <Trash2Icon className='size-3' /> Clear chat
                </button>
              ) : null}
            </div>
          </form>
        </Card>
      ) : (
        <div className='space-y-4'>
          <form onSubmit={handleSearchSubmit} className='flex gap-2'>
            <div className='relative flex-1'>
              <SearchIcon className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder='Search query'
                className='h-10 pl-9'
              />
            </div>
            <Button type='submit' className='h-10' disabled={!query.trim() || isSearching || targets.length === 0}>
              {isSearching ? <Loader2Icon className='animate-spin' /> : null}
              Search
            </Button>
            <Button
              type='button'
              variant='outline'
              size='icon'
              className='size-10'
              onClick={handleSaveQuery}
              disabled={!query.trim()}
              aria-label='Save query'
              title='Save query'
            >
              <BookmarkIcon />
            </Button>
          </form>

          {savedQueries.length ? (
            <div className='flex flex-wrap items-center gap-2 text-xs'>
              <span className='text-muted-foreground'>Saved</span>
              {savedQueries.map((item) => (
                <span key={item} className='inline-flex items-center rounded-full border bg-card'>
                  <button type='button' className='py-1 pl-2.5 pr-1 hover:text-brand' onClick={() => setQuery(item)}>
                    {item}
                  </button>
                  <button
                    type='button'
                    className='rounded-full p-1 text-muted-foreground hover:text-foreground'
                    onClick={() => removeSavedQuery(item)}
                    aria-label={`Remove saved query ${item}`}
                  >
                    <XIcon className='size-3' />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          {status ? <p className='text-sm text-muted-foreground'>{status}</p> : null}
          {errorMessages.length ? (
            <div className='space-y-1 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs'>
              {errorMessages.map((item) => (
                <div key={item.canisterId} className='break-words'>
                  <span className='font-mono'>{item.canisterId}</span>
                  <span className='text-muted-foreground'> · </span>
                  <span className='text-destructive'>{item.message}</span>
                </div>
              ))}
            </div>
          ) : null}

          <SearchResults
            results={filteredResults}
            sortMode={sortMode}
            queryTokens={queryTokens}
            relatedTerms={relatedTerms}
            onSortChange={setSortMode}
            onQuerySelect={setQuery}
            isSearching={isSearching}
          />
        </div>
      )}
    </div>
  )
}

export default SearchPage
