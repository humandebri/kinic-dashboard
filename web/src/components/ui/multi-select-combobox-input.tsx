// どこで: 複数選択できるコンボボックス入力。
// 何を: 候補の検索と複数選択、自由入力をまとめて提供する。
// なぜ: canister などのIDを手早く追加できるUIにするため。
'use client'

import { ChevronDownIcon } from 'lucide-react'
import { type KeyboardEvent, useId, useMemo, useState } from 'react'

import { cn } from '@/lib/utils'

export type MultiSelectComboboxInputProps = {
  values: string[]
  options: readonly string[]
  placeholder: string
  onChange: (values: string[]) => void
  emptyMessage?: string
  showSelections?: boolean
  id?: string
}

export const MultiSelectComboboxInput = ({
  values,
  options,
  placeholder,
  onChange,
  emptyMessage = 'No matching options',
  showSelections = true,
  id
}: MultiSelectComboboxInputProps) => {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const listboxId = useId()

  const filteredOptions = useMemo(() => {
    const query = inputValue.trim().toLowerCase()
    if (!query) return options
    return options.filter((option) => option.toLowerCase().includes(query))
  }, [inputValue, options])

  const toggleValue = (next: string) => {
    const trimmed = next.trim()
    if (!trimmed) return
    onChange(
      values.includes(trimmed)
        ? values.filter((value) => value !== trimmed)
        : [...values, trimmed]
    )
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      const nativeEvent = event.nativeEvent
      const isComposing = nativeEvent.isComposing || nativeEvent.keyCode === 229
      if (isComposing) return
      const trimmed = inputValue.trim()
      if (trimmed.length > 0) {
        toggleValue(trimmed)
        setInputValue('')
      }
      setOpen(false)
    }
    if (event.key === 'Escape') {
      event.stopPropagation()
      setOpen(false)
    }
  }

  const handleSelect = (option: string) => {
    toggleValue(option)
    setOpen(true)
  }

  const handleClearAll = () => {
    if (values.length === 0) return
    onChange([])
    setInputValue('')
    setOpen(false)
  }

  return (
    <div className='relative w-full'>
      <div
        className='relative rounded-2xl border border-zinc-200/70 bg-white/70 px-2 py-2'
        aria-controls={listboxId}
        aria-expanded={open}
        id={id}
      >
        <input
          className={cn(
            'h-6 w-full rounded-full bg-white/70 px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none',
            values.length > 0 ? 'text-zinc-900' : 'text-zinc-700'
          )}
          placeholder={placeholder}
          value={inputValue}
          onChange={(event) => {
            setInputValue(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
        />
        <ChevronDownIcon className='pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400' />
      </div>
      {showSelections && values.length > 0 ? (
        <div className='mt-2 flex flex-wrap items-center gap-2'>
          <div className='flex flex-wrap gap-2'>
            {values.map((chip) => (
              <button
                key={chip}
                type='button'
                className='rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700'
                onClick={() => toggleValue(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
          <button
            type='button'
            className='text-xs font-semibold text-red-500 hover:text-red-600'
            onClick={handleClearAll}
          >
            すべて削除
          </button>
        </div>
      ) : null}
      {open ? (
        <div className='absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg'>
          <div
            id={listboxId}
            className='max-h-60 overflow-y-auto text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            onMouseDown={(event) => event.preventDefault()}
          >
            {filteredOptions.length === 0 ? (
              <div className='px-3 py-2 text-xs text-zinc-500'>{emptyMessage}</div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option}
                  type='button'
                  className={cn(
                    'flex w-full items-center px-3 py-2 text-left text-sm text-zinc-700',
                    values.includes(option) ? 'bg-zinc-100 text-zinc-900' : 'hover:bg-zinc-100'
                  )}
                  onClick={() => handleSelect(option)}
                >
                  {option}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
