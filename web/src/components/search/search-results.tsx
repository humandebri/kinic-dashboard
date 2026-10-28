// どこで: Searchページの結果表示。
// 何を: ソート/関連語/スニペット表示を行う。
// なぜ: 発見性と精度をUIで補強するため。
import { SearchIcon } from 'lucide-react'

import EmptyState from '@/components/common/empty-state'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { shortenPrincipal } from '@/lib/format'
import { buildSnippet, escapeRegExp, type ParsedResult } from '@/lib/search-utils'
import { cn } from '@/lib/utils'

type SortMode = 'score_desc' | 'score_asc' | 'tag'

type SearchResultsProps = {
  results: ParsedResult[]
  sortMode: SortMode
  queryTokens: string[]
  relatedTerms: string[]
  onSortChange: (value: SortMode) => void
  onQuerySelect: (value: string) => void
  isSearching: boolean
}

const highlightText = (text: string, tokens: string[]) => {
  if (!tokens.length) return text
  const regex = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'gi')
  const tokenSet = new Set(tokens.map((token) => token.toLowerCase()))
  return text.split(regex).map((part, index) =>
    tokenSet.has(part.toLowerCase()) ? (
      <mark key={`${part}-${index}`} className='rounded bg-brand-amber/30 px-0.5 text-foreground'>
        {part}
      </mark>
    ) : (
      part
    )
  )
}

const SORT_OPTIONS: Array<[SortMode, string]> = [
  ['score_desc', 'Best match'],
  ['score_asc', 'Lowest score'],
  ['tag', 'Tag']
]

const SearchResults = ({
  results,
  sortMode,
  queryTokens,
  relatedTerms,
  onSortChange,
  onQuerySelect,
  isSearching
}: SearchResultsProps) => {
  if (isSearching && !results.length) {
    return (
      <div className='grid gap-3'>
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className='h-24 rounded-xl' />
        ))}
      </div>
    )
  }

  if (!results.length) {
    return (
      <EmptyState
        icon={<SearchIcon />}
        title='No results yet'
        description='Run a search across the selected memories to see matching passages.'
      />
    )
  }

  return (
    <div className={cn('space-y-3 transition-opacity', isSearching && 'opacity-60')}>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='text-xs text-muted-foreground'>
          {results.length} result{results.length === 1 ? '' : 's'}
        </div>
        <div className='inline-flex rounded-lg border bg-muted p-0.5 text-xs'>
          {SORT_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              type='button'
              onClick={() => onSortChange(value)}
              aria-pressed={sortMode === value}
              className={cn(
                'rounded-md px-2.5 py-1 transition',
                sortMode === value ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {relatedTerms.length ? (
        <div className='flex flex-wrap items-center gap-1.5 text-xs'>
          <span className='mr-1 text-muted-foreground'>Related</span>
          {relatedTerms.map((term) => (
            <button
              key={term}
              type='button'
              className='rounded-full border bg-card px-2.5 py-0.5 transition hover:border-brand/40 hover:text-brand'
              onClick={() => onQuerySelect(term)}
            >
              {term}
            </button>
          ))}
        </div>
      ) : null}

      {results.map((result, index) => (
        <Card key={`${result.memoryId}-${result.score}-${index}`} className='p-4'>
          <div className='mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground'>
            <span className='inline-flex items-center gap-1.5'>
              <span className='h-1.5 w-10 overflow-hidden rounded-full bg-muted'>
                <span
                  className='block h-full rounded-full bg-brand'
                  style={{ width: `${Math.max(4, Math.min(100, result.score * 100))}%` }}
                />
              </span>
              <span className='font-mono tabular-nums text-foreground'>{result.score.toFixed(4)}</span>
            </span>
            <span className='rounded-full bg-secondary px-2 py-px text-secondary-foreground'>
              {result.tag ?? 'untagged'}
            </span>
            <span className='font-mono' title={result.memoryId}>
              {shortenPrincipal(result.memoryId, 8, 4)}
            </span>
          </div>
          <p className='text-sm leading-relaxed'>{highlightText(buildSnippet(result.sentence, queryTokens), queryTokens)}</p>
        </Card>
      ))}
    </div>
  )
}

export default SearchResults
