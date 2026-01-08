// Where: Embedding API client for web UI.
// What: Calls /late-chunking and /embedding endpoints.
// Why: Reuses the same embedding flow as the CLI.
import { EMBEDDING_ENDPOINT } from '@/lib/ic-config'

export type LateChunk = {
  embedding: number[]
  sentence: string
}

const joinUrl = (base: string, path: string) => {
  return `${base.replace(/\/$/, '')}${path}`
}

const ensureOk = async (response: Response) => {
  if (response.ok) return response
  const body = await response.text()
  throw new Error(`embedding API request failed with status ${response.status}: ${body}`)
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const parseLateChunks = (value: unknown): LateChunk[] => {
  if (!isRecord(value)) {
    throw new Error('Invalid late-chunking response')
  }

  const chunksValue = value['chunks']
  if (!Array.isArray(chunksValue)) {
    throw new Error('Invalid late-chunking response')
  }

  // Validate shape defensively to avoid runtime surprises.
  return chunksValue.map((chunk) => {
    if (!isRecord(chunk)) {
      throw new Error('Invalid chunk data')
    }

    const embeddingValue = chunk['embedding']
    const sentenceValue = chunk['sentence']

    if (!Array.isArray(embeddingValue) || typeof sentenceValue !== 'string') {
      throw new Error('Invalid chunk data')
    }

    const embedding = embeddingValue.map((item) => {
      if (typeof item !== 'number') {
        throw new Error('Invalid embedding data')
      }
      return item
    })

    return { embedding, sentence: sentenceValue }
  })
}

const parseEmbedding = (value: unknown): number[] => {
  if (!isRecord(value)) {
    throw new Error('Invalid embedding response')
  }

  const embeddingValue = value['embedding']
  if (!Array.isArray(embeddingValue)) {
    throw new Error('Invalid embedding response')
  }

  return embeddingValue.map((item) => {
    if (typeof item !== 'number') {
      throw new Error('Invalid embedding response')
    }
    return item
  })
}

export const lateChunking = async (markdown: string): Promise<LateChunk[]> => {
  const response = await fetch(joinUrl(EMBEDDING_ENDPOINT, '/late-chunking'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown })
  })

  const payload = await ensureOk(response).then((res) => res.json())
  return parseLateChunks(payload)
}

export const fetchEmbedding = async (content: string): Promise<number[]> => {
  const response = await fetch(joinUrl(EMBEDDING_ENDPOINT, '/embedding'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  })

  const payload = await ensureOk(response).then((res) => res.json())
  return parseEmbedding(payload)
}
