// Where: Insert page entry.
// What: Uploads PDF/Markdown, chunks client-side, and inserts into memory canister.
// Why: Provides a full insert workflow in the web UI.
'use client'

import { useEffect, useMemo, useState } from 'react'
import { ShieldAlertIcon, XIcon } from 'lucide-react'

import AppShell from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useIdentityState } from '@/components/providers/identity-provider'
import { useMemories } from '@/hooks/use-memories'
import { useSelectedMemory } from '@/hooks/use-selected-memory'
import { createMemoryActor } from '@/lib/memory'
import { lateChunking } from '@/lib/embedding'
import { extractTextFromPdfPages } from '@/lib/pdf'

type UploadKind = 'pdf' | 'markdown' | 'text'

const MAX_SEGMENT_CHARS = 20_000
const MAX_TOTAL_CHARS = 300_000
const UI_YIELD_INTERVAL = 5
const PREVIEW_LIMIT = 600
type InsertPhase = 'idle' | 'chunking' | 'inserting' | 'done' | 'error'

const isPdfFile = (file: File) => {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

const isMarkdownFile = (file: File) => {
  const name = file.name.toLowerCase()
  return (
    file.type === 'text/markdown' ||
    name.endsWith('.md') ||
    name.endsWith('.markdown')
  )
}

const InsertPage = () => {
  const identityState = useIdentityState()
  const memories = useMemories(identityState.identity, identityState.isReady)
  const { selectedMemoryId } = useSelectedMemory()
  const [fileName, setFileName] = useState<string | null>(null)
  const [uploadKind, setUploadKind] = useState<UploadKind | null>(null)
  const [markdown, setMarkdown] = useState('')
  const [sourceSegments, setSourceSegments] = useState<string[]>([])
  const [pasteText, setPasteText] = useState('')
  const [isPasteMode, setIsPasteMode] = useState(false)
  const [tag, setTag] = useState('')
  const [isReading, setIsReading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [previewDraft, setPreviewDraft] = useState('')
  const [showTransferPanel, setShowTransferPanel] = useState(false)
  const [insertPhase, setInsertPhase] = useState<InsertPhase>('idle')
  const [status, setStatus] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ total: number; done: number } | null>(null)

  const isOwner = useMemo(() => {
    if (!selectedMemoryId) return false
    return memories.memories.some((memory) => memory.principalText === selectedMemoryId)
  }, [memories.memories, selectedMemoryId])

  useEffect(() => {
    setIsCompleted(false)
  }, [selectedMemoryId])

  const isWithinLimit = markdown.length <= MAX_TOTAL_CHARS
  const canSubmit = Boolean(
    identityState.isAuthenticated &&
      selectedMemoryId &&
      isOwner &&
      markdown.trim() &&
      tag.trim() &&
      isWithinLimit
  )

  const previewText = useMemo(() => {
    if (!markdown) return ''
    return markdown.length > PREVIEW_LIMIT ? `${markdown.slice(0, PREVIEW_LIMIT)}…` : markdown
  }, [markdown])

  const canExpandPreview = markdown.length > PREVIEW_LIMIT
  const previewCountLabel = `${markdown.length.toLocaleString()} / ${MAX_TOTAL_CHARS.toLocaleString()} chars`

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setStatus(null)
    setIsReading(true)
    setProgress(null)
    setIsCompleted(false)
    setIsPreviewOpen(false)
    setPreviewDraft('')
    setPasteText('')
    setIsPasteMode(false)

    try {
      // Parse locally to satisfy the "client-side processing" requirement.
      if (isPdfFile(file)) {
        setUploadKind('pdf')
        const pages = await extractTextFromPdfPages(file)
        const joined = pages.join('\n\n')
        setSourceSegments(pages)
        setMarkdown(joined)
        setPasteText('')
        setIsPasteMode(false)
        if (joined.length > MAX_TOTAL_CHARS) {
          setStatus(`Input is too large (${joined.length} chars). Limit is ${MAX_TOTAL_CHARS}.`)
        }
      } else if (isMarkdownFile(file)) {
        setUploadKind('markdown')
        const text = await file.text()
        setSourceSegments([text])
        setMarkdown(text)
        setPasteText('')
        setIsPasteMode(false)
        if (text.length > MAX_TOTAL_CHARS) {
          setStatus(`Input is too large (${text.length} chars). Limit is ${MAX_TOTAL_CHARS}.`)
        }
      } else {
        throw new Error('Only PDF or Markdown files are supported.')
      }

      setFileName(file.name)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read file'
      setStatus(message)
      setMarkdown('')
      setSourceSegments([])
      setFileName(null)
      setUploadKind(null)
      setPasteText('')
      setIsPasteMode(false)
    } finally {
      setIsReading(false)
    }
  }

  const handleOpenPreview = () => {
    if (!markdown) return
    setPreviewDraft(markdown)
    setIsPreviewOpen(true)
  }

  const handleOpenPaste = () => {
    setIsPasteMode(true)
    setPreviewDraft(pasteText || '')
    setIsPreviewOpen(true)
  }

  const handleApplyPreview = () => {
    const nextValue = previewDraft
    if (isPasteMode) {
      setPasteText(nextValue)
      setUploadKind(nextValue ? 'text' : uploadKind)
      setFileName(null)
      setIsPasteMode(false)
    }
    setMarkdown(nextValue)
    setSourceSegments([nextValue])
    setIsCompleted(false)
    if (nextValue.length > MAX_TOTAL_CHARS) {
      setStatus(`Input is too large (${nextValue.length} chars). Limit is ${MAX_TOTAL_CHARS}.`)
    } else {
      setStatus(null)
    }
    setIsPreviewOpen(false)
  }

  const handleInsert = async () => {
    if (!identityState.identity || !selectedMemoryId) return

    const yieldToUI = () =>
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve())
      })

    setIsSubmitting(true)
    setStatus(null)
    setProgress(null)
    setShowTransferPanel(true)
    setInsertPhase('chunking')

    try {
      const rawSegments = sourceSegments.length ? sourceSegments : [markdown]
      const segments = rawSegments.flatMap((segment) => {
        if (segment.length <= MAX_SEGMENT_CHARS) return [segment]
        const slices: string[] = []
        for (let i = 0; i < segment.length; i += MAX_SEGMENT_CHARS) {
          slices.push(segment.slice(i, i + MAX_SEGMENT_CHARS))
        }
        return slices
      }).filter((segment) => segment.trim().length > 0)

      if (segments.length === 0) {
        throw new Error('No text found to insert.')
      }

      let chunks: Awaited<ReturnType<typeof lateChunking>> = []
      let segmentIndex = 0
      for (const segment of segments) {
        segmentIndex += 1
        setStatus(`Chunking ${segmentIndex}/${segments.length}...`)
        const nextChunks = await lateChunking(segment)
        chunks = [...chunks, ...nextChunks]
        await yieldToUI()
      }

      if (chunks.length === 0) {
        throw new Error('No chunks generated.')
      }
      setInsertPhase('inserting')
      setProgress({ total: chunks.length, done: 0 })

      const actor = await createMemoryActor(identityState.identity, selectedMemoryId)

      let done = 0
      for (const chunk of chunks) {
        const payload = JSON.stringify({ tag: tag.trim(), sentence: chunk.sentence })
        await actor.insert(chunk.embedding, payload)
        done += 1
        setProgress({ total: chunks.length, done })
        if (done % UI_YIELD_INTERVAL === 0) {
          await yieldToUI()
        }
      }

      setStatus('Insert completed.')
      setIsCompleted(true)
      setInsertPhase('done')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Insert failed'
      setStatus(message)
      setInsertPhase('error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AppShell pageTitle='Insert' identityState={identityState}>
      <div className='grid gap-6'>
        <Card>
          <CardHeader className='flex flex-col items-start gap-2'>
            <span className='text-lg font-semibold'>Insert</span>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex flex-col gap-2'>
              <label className='text-sm text-zinc-600'>Memory</label>
              <div className='rounded-2xl border border-zinc-200/70 bg-white/70 px-3 py-2 text-sm'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='text-muted-foreground'>Selected</span>
                  <span className='font-mono text-sm text-zinc-900'>{selectedMemoryId ?? '--'}</span>
                  {selectedMemoryId && identityState.isAuthenticated && !isOwner ? (
                    <span className='inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700'>
                      <ShieldAlertIcon className='size-3' />
                      NOT AUTHORIZED
                    </span>
                  ) : null}
                </div>
                {selectedMemoryId && identityState.isAuthenticated && !isOwner ? (
                  <div className='mt-2 text-xs text-amber-700'>
                    You are not authorized for this canister. Insert is disabled.
                  </div>
                ) : null}
              </div>
            </div>
            <div className='grid gap-4 md:grid-cols-2'>
              <div className='flex flex-col gap-2'>
                <div className='flex items-center gap-2'>
                  <label className='inline-flex'>
                    <span className='inline-flex items-center rounded-full border border-zinc-200/70 bg-white/70 px-3 py-2 text-xs font-medium text-zinc-700'>
                      Choose file
                    </span>
                    <input
                      type='file'
                      accept='.pdf,.md,.markdown'
                      onChange={handleFileChange}
                      className='sr-only'
                    />
                  </label>
                  <span className='text-muted-foreground text-xs'>
                    {fileName ? `${fileName} (${uploadKind ?? 'unknown'})` : 'No file selected'}
                  </span>
                </div>
                <span className='text-muted-foreground text-xs'>PDF or Markdown only.</span>
              </div>
              <div className='flex flex-col gap-2'>
                <div className='flex items-center gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    className='rounded-full'
                    onClick={handleOpenPaste}
                  >
                    Paste text
                  </Button>
                  {pasteText ? (
                    <span className='text-xs text-zinc-500'>
                      {pasteText.length.toLocaleString()} chars
                    </span>
                  ) : (
                    <span className='text-xs text-zinc-500'>No text pasted</span>
                  )}
                </div>
                <span className='text-muted-foreground text-xs'>Paste plain text or Markdown.</span>
              </div>
            </div>
            <div className='flex flex-col gap-2'>
              <label className='text-sm text-zinc-600'>Tag</label>
              <Input
                value={tag}
                onChange={(event) => {
                  setTag(event.target.value)
                  setIsCompleted(false)
                }}
                placeholder='e.g. roadmap_2025'
              />
            </div>
            <div className='flex flex-col gap-2'>
              <label className='text-sm text-zinc-600'>Preview</label>
              <textarea
                className='min-h-[160px] rounded-2xl border border-zinc-200/70 bg-white/70 p-3 text-sm text-zinc-900'
                value={isReading ? 'Reading file…' : previewText}
                readOnly
              />
              {canExpandPreview ? (
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className='w-fit rounded-full'
                  onClick={handleOpenPreview}
                >
                  Read more
                </Button>
              ) : null}
              <span className='text-muted-foreground text-xs'>{previewCountLabel}</span>
            </div>
            <div className='flex items-center gap-3'>
              <Button
                className='rounded-full'
                onClick={handleInsert}
                disabled={!canSubmit || isSubmitting || isReading || isCompleted}
              >
                {isSubmitting ? 'Inserting…' : 'Insert'}
              </Button>
              {progress ? (
                <span className='text-muted-foreground text-sm'>
                  {progress.done}/{progress.total} chunks
                </span>
              ) : null}
              {status ? <span className='text-muted-foreground text-sm'>{status}</span> : null}
            </div>
          </CardContent>
        </Card>
      </div>
      {showTransferPanel && (isSubmitting || status || progress) ? (
        <div className='fixed bottom-6 right-6 z-50 w-80 max-w-[calc(100vw-3rem)]'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between'>
              <span className='text-sm font-semibold'>Insert queue</span>
              {(insertPhase === 'done' || insertPhase === 'error') ? (
                <Button
                  variant='ghost'
                  size='icon'
                  className='h-7 w-7 rounded-full'
                  onClick={() => setShowTransferPanel(false)}
                >
                  <XIcon className='h-4 w-4' />
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='text-xs text-zinc-600'>
                {status ?? (isSubmitting ? 'Working...' : 'Idle')}
              </div>
              {progress ? (
                <div className='space-y-2'>
                  <div className='text-xs text-zinc-600'>
                    {progress.done}/{progress.total} chunks
                  </div>
                  <div className='h-2 w-full overflow-hidden rounded-full bg-zinc-100'>
                    <div
                      className='h-full bg-zinc-900 transition-all'
                      style={{
                        width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%`
                      }}
                    />
                  </div>
                </div>
              ) : null}
              {insertPhase === 'done' ? (
                <div className='text-xs text-emerald-600'>Insert completed.</div>
              ) : null}
              {insertPhase === 'error' ? (
                <div className='text-xs text-rose-600'>Insert failed.</div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}
      {isPreviewOpen ? (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in-0 duration-200'
          role='presentation'
        >
          <div
            className='w-[95vw] max-w-4xl rounded-2xl bg-white p-6 shadow-xl animate-in fade-in-0 zoom-in-95 duration-200'
            onClick={(event) => event.stopPropagation()}
          >
            <div className='flex items-center justify-between'>
              <span className='text-lg font-semibold text-zinc-900'>Edit preview</span>
              <Button
                variant='ghost'
                size='icon'
                className='h-8 w-8 rounded-full'
                onClick={() => setIsPreviewOpen(false)}
              >
                <XIcon className='h-4 w-4' />
              </Button>
            </div>
            <div className='mt-4 space-y-2'>
              <textarea
                className='h-[70vh] w-full resize-none rounded-2xl border border-zinc-200/70 bg-white/70 p-3 pr-4 text-sm text-zinc-900 box-border overflow-y-auto'
                value={previewDraft}
                onChange={(event) => setPreviewDraft(event.target.value)}
              />
              <div className='flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500'>
                <span>
                  {previewDraft.length.toLocaleString()} / {MAX_TOTAL_CHARS.toLocaleString()} chars
                </span>
                <div className='flex items-center gap-2'>
                  <Button
                    variant='outline'
                    className='rounded-full'
                    onClick={() => setIsPreviewOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className='rounded-full'
                    onClick={handleApplyPreview}
                    disabled={previewDraft.length > MAX_TOTAL_CHARS}
                  >
                    Apply
                  </Button>
                </div>
              </div>
              {previewDraft.length > MAX_TOTAL_CHARS ? (
                <div className='text-xs text-rose-600'>
                  Input is too large. Please shorten to {MAX_TOTAL_CHARS.toLocaleString()} chars.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  )
}

export default InsertPage
