// Where: Insert page.
// What: Loads PDF/Markdown/pasted text, chunks it via the embedding API, and inserts into a memory canister.
// Why: Provides a full insert workflow in the web UI (parsing stays client-side).
import { CheckCircle2Icon, FileTextIcon, FileUpIcon, Loader2Icon, XCircleIcon, XIcon } from 'lucide-react'
import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import ConnectPrompt from '@/components/common/connect-prompt'
import PageHeader from '@/components/common/page-header'
import { useIdentityState } from '@/components/providers/identity-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useMemoryOptions } from '@/hooks/use-memory-options'
import { lateChunking, type LateChunk } from '@/lib/embedding'
import { errorMessage } from '@/lib/format'
import { createMemoryActor } from '@/lib/memory'
import { cn } from '@/lib/utils'
import { useInsertStore } from '@/stores/insert'
import { useSelectedMemory } from '@/stores/selected-memory'

const MAX_SEGMENT_CHARS = 20_000
const MAX_TOTAL_CHARS = 300_000
const MAX_FILE_BYTES = 50 * 1024 * 1024
const UI_YIELD_INTERVAL = 5

const isPdfFile = (file: File) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

const isMarkdownFile = (file: File) => {
  const name = file.name.toLowerCase()
  return file.type === 'text/markdown' || name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.txt')
}

const yieldToUI = () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))

const InsertPage = () => {
  const identityState = useIdentityState()
  const memoryOptions = useMemoryOptions()
  const { selectedMemoryId, setSelectedMemoryId } = useSelectedMemory()
  const store = useInsertStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const isBusy = store.phase === 'chunking' || store.phase === 'inserting'
  const targetId = isBusy ? store.targetMemoryId : selectedMemoryId
  const overLimit = store.content.length > MAX_TOTAL_CHARS
  const canSubmit = Boolean(
    identityState.isAuthenticated &&
      selectedMemoryId &&
      store.content.trim() &&
      store.tag.trim() &&
      !overLimit &&
      store.phase !== 'done'
  )

  const loadFile = async (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      toast.error('File is too large', { description: 'Maximum file size is 50 MB.' })
      return
    }
    store.set({ isReading: true, status: null, progress: null, phase: 'idle' })
    try {
      // Parse locally — the file never leaves the browser; only text goes to the embedding API.
      if (isPdfFile(file)) {
        const { extractTextFromPdfPages } = await import('@/lib/pdf')
        const pages = await extractTextFromPdfPages(file)
        store.set({ uploadKind: 'pdf', sourceSegments: pages, content: pages.join('\n\n'), fileName: file.name })
      } else if (isMarkdownFile(file)) {
        const text = await file.text()
        store.set({ uploadKind: 'markdown', sourceSegments: [text], content: text, fileName: file.name })
      } else {
        throw new Error('Only PDF, Markdown, or plain-text files are supported.')
      }
    } catch (error) {
      toast.error('Could not read file', { description: errorMessage(error, 'Failed to read file') })
    } finally {
      store.set({ isReading: false })
    }
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void loadFile(file)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) void loadFile(file)
  }

  const handleContentChange = (value: string) => {
    // Manual edits replace per-page PDF segments with the edited text.
    store.set({
      content: value,
      sourceSegments: [value],
      uploadKind: store.fileName ? store.uploadKind : value ? 'text' : null,
      phase: store.phase === 'done' || store.phase === 'error' ? 'idle' : store.phase
    })
  }

  const clearContent = () => {
    store.set({ content: '', sourceSegments: [], fileName: null, uploadKind: null, phase: 'idle', status: null, progress: null })
  }

  const handleInsert = async () => {
    if (!identityState.identity || !selectedMemoryId || !canSubmit) return
    const memoryId = selectedMemoryId
    const tag = store.tag.trim()
    const { sourceSegments, content } = useInsertStore.getState()
    store.set({ phase: 'chunking', status: null, progress: null, targetMemoryId: memoryId })

    try {
      const segments = (sourceSegments.length ? sourceSegments : [content])
        .flatMap((segment) => {
          if (segment.length <= MAX_SEGMENT_CHARS) return [segment]
          const slices: string[] = []
          for (let i = 0; i < segment.length; i += MAX_SEGMENT_CHARS) {
            slices.push(segment.slice(i, i + MAX_SEGMENT_CHARS))
          }
          return slices
        })
        .filter((segment) => segment.trim().length > 0)

      if (segments.length === 0) throw new Error('No text found to insert.')

      const chunks: LateChunk[] = []
      for (const [index, segment] of segments.entries()) {
        store.set({ status: `Chunking segment ${index + 1} of ${segments.length}` })
        chunks.push(...(await lateChunking(segment)))
        await yieldToUI()
      }
      if (chunks.length === 0) throw new Error('No chunks generated.')

      store.set({ phase: 'inserting', status: 'Writing to memory', progress: { total: chunks.length, done: 0 } })
      const actor = await createMemoryActor(identityState.identity, memoryId)

      let done = 0
      for (const chunk of chunks) {
        await actor.insert(chunk.embedding, JSON.stringify({ tag, sentence: chunk.sentence }))
        done += 1
        store.set({ progress: { total: chunks.length, done } })
        if (done % UI_YIELD_INTERVAL === 0) await yieldToUI()
      }

      store.set({ phase: 'done', status: `Inserted ${chunks.length} chunks` })
      toast.success('Insert completed', { description: `${chunks.length} chunks tagged “${tag}”` })
    } catch (error) {
      const message = errorMessage(error, 'Insert failed')
      store.set({ phase: 'error', status: message })
      toast.error('Insert failed', { description: message })
    }
  }

  if (identityState.isReady && !identityState.isAuthenticated) {
    return (
      <div className='space-y-6'>
        <PageHeader title='Insert' description='Add documents to a memory.' />
        <ConnectPrompt />
      </div>
    )
  }

  const percent = store.progress ? Math.round((store.progress.done / Math.max(store.progress.total, 1)) * 100) : 0

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Insert'
        description='Add PDF, Markdown, or plain text. Files are parsed in your browser, chunked, embedded, and written to the memory canister.'
      />

      <div className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]'>
        <Card>
          <CardHeader>
            <CardTitle>Content</CardTitle>
            <CardDescription>Drop a file or type / paste text below. You can edit the text before inserting.</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div
              role='button'
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  fileInputRef.current?.click()
                }
              }}
              onDragOver={(event) => {
                event.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isDragging ? 'border-brand bg-brand/5' : 'hover:border-foreground/20 hover:bg-muted/50'
              )}
            >
              {store.isReading ? (
                <Loader2Icon className='size-6 animate-spin text-muted-foreground' />
              ) : (
                <FileUpIcon className='size-6 text-muted-foreground' />
              )}
              <div className='text-sm font-medium'>
                {store.isReading ? 'Reading file…' : 'Drop a file here, or click to browse'}
              </div>
              <div className='text-xs text-muted-foreground'>PDF, Markdown, or .txt · up to 50 MB</div>
              <input
                ref={fileInputRef}
                type='file'
                accept='.pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain'
                onChange={handleFileChange}
                className='sr-only'
                tabIndex={-1}
              />
            </div>

            {store.fileName ? (
              <div className='flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm'>
                <FileTextIcon className='size-4 shrink-0 text-muted-foreground' />
                <span className='min-w-0 truncate'>{store.fileName}</span>
                <span className='text-xs uppercase text-muted-foreground'>{store.uploadKind}</span>
                <Button
                  variant='ghost'
                  size='icon-sm'
                  className='ml-auto'
                  onClick={clearContent}
                  disabled={isBusy}
                  aria-label='Clear content'
                >
                  <XIcon />
                </Button>
              </div>
            ) : null}

            <div className='grid gap-2'>
              <div className='flex items-center justify-between'>
                <Label htmlFor='insert-content'>Text</Label>
                <span className={cn('text-xs tabular-nums', overLimit ? 'text-destructive' : 'text-muted-foreground')}>
                  {store.content.length.toLocaleString()} / {MAX_TOTAL_CHARS.toLocaleString()}
                </span>
              </div>
              <Textarea
                id='insert-content'
                value={store.content}
                onChange={(event) => handleContentChange(event.target.value)}
                placeholder='Paste text or Markdown…'
                className='min-h-[280px] font-mono text-[13px] leading-relaxed'
                disabled={isBusy || store.isReading}
                aria-invalid={overLimit}
              />
              {overLimit ? (
                <p className='text-xs text-destructive'>
                  Too long — shorten to {MAX_TOTAL_CHARS.toLocaleString()} characters or split into several inserts.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className='space-y-4 lg:sticky lg:top-20 lg:h-fit'>
          <Card>
            <CardHeader>
              <CardTitle>Destination</CardTitle>
            </CardHeader>
            <CardContent className='grid gap-4'>
              <div className='grid gap-2'>
                <Label>Memory</Label>
                {memoryOptions.length ? (
                  <Select
                    value={selectedMemoryId ?? ''}
                    onValueChange={(value) => {
                      setSelectedMemoryId(value || null)
                      if (store.phase === 'done') store.set({ phase: 'idle' })
                    }}
                    disabled={isBusy}
                  >
                    <SelectTrigger className='font-mono text-xs'>
                      <SelectValue placeholder='Select a memory' />
                    </SelectTrigger>
                    <SelectContent>
                      {memoryOptions.map((id) => (
                        <SelectItem key={id} value={id} className='font-mono text-xs'>
                          {id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className='text-sm text-muted-foreground'>
                    No memories yet.{' '}
                    <Link to='/memories/add' className='font-medium text-brand hover:underline'>
                      Mint one
                    </Link>
                    .
                  </p>
                )}
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='insert-tag'>Tag</Label>
                <Input
                  id='insert-tag'
                  value={store.tag}
                  onChange={(event) =>
                    store.set({ tag: event.target.value, phase: store.phase === 'done' ? 'idle' : store.phase })
                  }
                  placeholder='e.g. roadmap_2025'
                  disabled={isBusy}
                />
                <p className='text-xs text-muted-foreground'>Used to filter search results later.</p>
              </div>
              <Button variant='brand' onClick={() => void handleInsert()} disabled={!canSubmit || isBusy || store.isReading}>
                {isBusy ? <Loader2Icon className='animate-spin' /> : null}
                {isBusy ? 'Inserting…' : 'Insert into memory'}
              </Button>
            </CardContent>
          </Card>

          {store.phase !== 'idle' ? (
            <Card aria-live='polite'>
              <CardContent className='space-y-3 p-5 sm:p-5'>
                <div className='flex items-center gap-2 text-sm font-medium'>
                  {store.phase === 'done' ? (
                    <CheckCircle2Icon className='size-4 text-success' />
                  ) : store.phase === 'error' ? (
                    <XCircleIcon className='size-4 text-destructive' />
                  ) : (
                    <Loader2Icon className='size-4 animate-spin text-brand' />
                  )}
                  {store.phase === 'chunking'
                    ? 'Chunking'
                    : store.phase === 'inserting'
                      ? 'Inserting'
                      : store.phase === 'done'
                        ? 'Completed'
                        : 'Failed'}
                </div>
                {store.progress ? (
                  <div className='space-y-1.5'>
                    <div className='h-2 overflow-hidden rounded-full bg-muted'>
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          store.phase === 'error' ? 'bg-destructive' : 'bg-brand'
                        )}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <div className='flex justify-between text-xs tabular-nums text-muted-foreground'>
                      <span>
                        {store.progress.done} / {store.progress.total} chunks
                      </span>
                      <span>{percent}%</span>
                    </div>
                  </div>
                ) : null}
                {store.status ? (
                  <p className={cn('text-xs', store.phase === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
                    {store.status}
                  </p>
                ) : null}
                {targetId ? <p className='break-all font-mono text-[11px] text-muted-foreground'>→ {targetId}</p> : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default InsertPage
