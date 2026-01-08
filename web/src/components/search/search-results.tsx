// どこで: Searchページの結果表示。
// 何を: フィルタ/ソート/関連語/スニペット表示を行う。
// なぜ: 発見性と精度をUIで補強するため。
import { buildSnippet, escapeRegExp } from '@/lib/search-utils'
import type { ParsedResult } from '@/lib/search-utils'

type SearchResultsProps = {
  results: ParsedResult[]
  tags: string[]
  selectedTag: string
  sortMode: 'score_desc' | 'score_asc' | 'tag'
  queryTokens: string[]
  relatedTerms: string[]
  onTagChange: (value: string) => void
  onSortChange: (value: 'score_desc' | 'score_asc' | 'tag') => void
  onQuerySelect: (value: string) => void
}

const highlightText = (text: string, tokens: string[]) => {
  if (!tokens.length) return text
  const regex = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'gi')
  const parts = text.split(regex)
  const tokenSet = new Set(tokens.map((token) => token.toLowerCase()))
  return parts.map((part, index) =>
    tokenSet.has(part.toLowerCase()) ? (
      <mark key={`${part}-${index}`} className='rounded bg-yellow-200/70 px-0.5'>
        {part}
      </mark>
    ) : (
      part
    )
  )
}

const SearchResults = ({
  results,
  tags,
  selectedTag,
  sortMode,
  queryTokens,
  relatedTerms,
  onTagChange,
  onSortChange,
  onQuerySelect
}: SearchResultsProps) => {
  if (!results.length) {
    return <span className='text-muted-foreground text-sm'>No results yet.</span>
  }

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center gap-2 text-xs text-zinc-600'>
        <label className='flex items-center gap-2'>
          <span>Tag</span>
          <select
            className='rounded-full border border-zinc-200 bg-white px-2 py-1 text-xs'
            value={selectedTag}
            onChange={(event) => onTagChange(event.target.value)}
          >
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
        <label className='flex items-center gap-2'>
          <span>Sort</span>
          <select
            className='rounded-full border border-zinc-200 bg-white px-2 py-1 text-xs'
            value={sortMode}
            onChange={(event) => onSortChange(event.target.value as typeof sortMode)}
          >
            <option value='score_desc'>Score (high)</option>
            <option value='score_asc'>Score (low)</option>
            <option value='tag'>Tag</option>
          </select>
        </label>
      </div>
      {relatedTerms.length ? (
        <div className='flex flex-wrap items-center gap-2 text-xs'>
          <span className='text-muted-foreground'>Related</span>
          {relatedTerms.map((term) => (
            <button
              key={term}
              type='button'
              className='rounded-full border border-zinc-200 px-2 py-1 text-xs text-zinc-700'
              onClick={() => onQuerySelect(term)}
            >
              {term}
            </button>
          ))}
        </div>
      ) : null}
      {results.map((result, index) => {
        const snippet = buildSnippet(result.sentence, queryTokens)
        return (
          <div
            key={`${result.score}-${index}`}
            className='rounded-2xl border border-zinc-200/70 bg-white/70 px-3 py-2 text-sm'
          >
            <div className='text-muted-foreground text-xs'>Score</div>
            <div className='font-mono text-sm text-zinc-900'>{result.score.toFixed(4)}</div>
            <div className='mt-2 flex items-center gap-2 text-xs text-zinc-500'>
              <span>Tag</span>
              <span className='rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700'>
                {result.tag ?? 'untagged'}
              </span>
            </div>
            <div className='mt-2 text-muted-foreground text-xs'>Snippet</div>
            <div className='text-sm text-zinc-900'>{highlightText(snippet, queryTokens)}</div>
          </div>
        )
      })}
    </div>
  )
}

export default SearchResults
