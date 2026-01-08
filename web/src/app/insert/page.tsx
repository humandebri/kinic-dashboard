// Where: Insert page entry.
// What: Uploads PDF/Markdown, chunks client-side, and inserts into memory canister.
// Why: Provides a full insert workflow in the web UI.
'use client'

import { useMemo, useState } from 'react'

import AppShell from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useIdentityState } from '@/components/providers/identity-provider'
import { useSelectedMemory } from '@/hooks/use-selected-memory'
import { createMemoryActor } from '@/lib/memory'
import { lateChunking } from '@/lib/embedding'
import { extractTextFromPdf } from '@/lib/pdf'

type UploadKind = 'pdf' | 'markdown'

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
  const { selectedMemoryId } = useSelectedMemory()
  const [fileName, setFileName] = useState<string | null>(null)
  const [uploadKind, setUploadKind] = useState<UploadKind | null>(null)
  const [markdown, setMarkdown] = useState('')
  const [tag, setTag] = useState('')
  const [isReading, setIsReading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ total: number; done: number } | null>(null)

  const canSubmit = Boolean(
    identityState.isAuthenticated && selectedMemoryId && markdown.trim() && tag.trim()
  )

  const previewText = useMemo(() => {
    if (!markdown) return ''
    return markdown.length > 600 ? `${markdown.slice(0, 600)}…` : markdown
  }, [markdown])

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setStatus(null)
    setIsReading(true)
    setProgress(null)

    try {
      // Parse locally to satisfy the "client-side processing" requirement.
      if (isPdfFile(file)) {
        setUploadKind('pdf')
        const text = await extractTextFromPdf(file)
        setMarkdown(text)
      } else if (isMarkdownFile(file)) {
        setUploadKind('markdown')
        const text = await file.text()
        setMarkdown(text)
      } else {
        throw new Error('Only PDF or Markdown files are supported.')
      }

      setFileName(file.name)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read file'
      setStatus(message)
      setMarkdown('')
      setFileName(null)
      setUploadKind(null)
    } finally {
      setIsReading(false)
    }
  }

  const handleInsert = async () => {
    if (!identityState.identity || !selectedMemoryId) return

    setIsSubmitting(true)
    setStatus(null)
    setProgress(null)

    try {
      // Late-chunking provides per-chunk embeddings so we can insert directly.
      const chunks = await lateChunking(markdown)
      setProgress({ total: chunks.length, done: 0 })

      const actor = await createMemoryActor(identityState.identity, selectedMemoryId)

      let done = 0
      for (const chunk of chunks) {
        const payload = JSON.stringify({ tag: tag.trim(), sentence: chunk.sentence })
        await actor.insert(chunk.embedding, payload)
        done += 1
        setProgress({ total: chunks.length, done })
      }

      setStatus('Insert completed.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Insert failed'
      setStatus(message)
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
                </div>
              </div>
            </div>
            <div className='flex flex-col gap-2'>
              <label className='text-sm text-zinc-600'>File</label>
              <label className='flex items-center gap-3 rounded-2xl border border-zinc-200/70 bg-white/70 px-3 py-2 text-sm text-zinc-700'>
                <span className='text-xs font-medium text-zinc-700'>
                  Choose file
                </span>
                <span className='text-muted-foreground text-xs'>
                  {fileName ? `${fileName} (${uploadKind ?? 'unknown'})` : 'No file selected'}
                </span>
                <input
                  type='file'
                  accept='.pdf,.md,.markdown'
                  onChange={handleFileChange}
                  className='sr-only'
                />
              </label>
              <span className='text-muted-foreground text-xs'>PDF or Markdown only.</span>
            </div>
            <div className='flex flex-col gap-2'>
              <label className='text-sm text-zinc-600'>Tag</label>
              <Input
                value={tag}
                onChange={(event) => setTag(event.target.value)}
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
            </div>
            <div className='flex items-center gap-3'>
              <Button
                className='rounded-full'
                onClick={handleInsert}
                disabled={!canSubmit || isSubmitting || isReading}
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
    </AppShell>
  )
}

export default InsertPage
