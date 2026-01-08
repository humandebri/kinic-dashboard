// どこで: Searchページの履歴/保存クエリ表示。
// 何を: 過去の検索と保存済み検索のボタンを描画する。
// なぜ: 再検索の導線を短くするため。
import type { MouseEventHandler } from 'react'

type SearchHistoryProps = {
  history: string[]
  savedQueries: string[]
  onSelect: (value: string) => void
}

const SearchHistory = ({ history, savedQueries, onSelect }: SearchHistoryProps) => {
  if (!history.length && !savedQueries.length) return null

  const handleClick = (value: string): MouseEventHandler<HTMLButtonElement> => {
    return () => onSelect(value)
  }

  return (
    <div className='space-y-2 pt-2'>
      {history.length ? (
        <div className='flex flex-wrap items-center gap-2 text-xs'>
          <span className='text-muted-foreground'>History</span>
          {history.map((item) => (
            <button
              key={`history-${item}`}
              type='button'
              className='rounded-full border border-zinc-200 px-2 py-1 text-xs text-zinc-700'
              onClick={handleClick(item)}
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
      {savedQueries.length ? (
        <div className='flex flex-wrap items-center gap-2 text-xs'>
          <span className='text-muted-foreground'>Saved</span>
          {savedQueries.map((item) => (
            <button
              key={`saved-${item}`}
              type='button'
              className='rounded-full border border-zinc-200 px-2 py-1 text-xs text-zinc-700'
              onClick={handleClick(item)}
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default SearchHistory
