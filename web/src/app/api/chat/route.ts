// どこで: Chat APIルート。
// なにを: Geminiに問い合わせて引用付きの回答を生成する。
// なぜ: クライアントにAPIキーを露出せず、NotebookLM風の回答を作るため。
import { NextResponse } from 'next/server'

type SourceSnippet = {
  memoryId: string
  sentence: string
  tag?: string | null
  score?: number
}

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent'

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const buildPrompt = (question: string, sources: SourceSnippet[]) => {
  const citations = sources
    .map((source, index) => {
      const parts = [
        `[#${index + 1}]`,
        `memoryId=${source.memoryId}`,
        source.tag ? `tag=${source.tag}` : null,
        `sentence=${source.sentence}`
      ].filter(Boolean)
      return parts.join(' ')
    })
    .join('\n')

  return [
    'You are a research assistant.',
    'Answer the question using only the provided sources.',
    'Always include citations like [1] in the answer.',
    'If the sources are insufficient, say: "I do not have enough sources to answer this question."',
    '',
    `Question: ${question}`,
    '',
    'Sources:',
    citations,
    '',
    'Return format:',
    'Answer: <short paragraph with citations like [1]>',
    'Citations:',
    '[1] <short citation sentence>',
    '[2] <short citation sentence>'
  ].join('\n')
}

const extractText = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') return ''
  const candidates = Reflect.get(payload, 'candidates')
  if (!Array.isArray(candidates) || candidates.length === 0) return ''
  const first = candidates[0]
  if (!first || typeof first !== 'object') return ''
  const content = Reflect.get(first, 'content')
  if (!content || typeof content !== 'object') return ''
  const parts = Reflect.get(content, 'parts')
  if (!Array.isArray(parts) || parts.length === 0) return ''
  const texts = parts.map((part) => {
    if (!part || typeof part !== 'object') return ''
    const text = Reflect.get(part, 'text')
    return typeof text === 'string' ? text : ''
  })
  return texts.join('')
}

export const POST = async (request: Request) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing GEMINI_API_KEY' }, { status: 500 })
    }

    const body: unknown = await request.json()
    if (!isRecord(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const rawQuestion = body.question
    const question = typeof rawQuestion === 'string' ? rawQuestion.trim() : ''
    const rawSources = body.sources
    const sources = Array.isArray(rawSources) ? rawSources : []

    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 })
    }

    if (sources.length === 0) {
      return NextResponse.json({
        answer: 'I do not have enough sources to answer this question.'
      })
    }

    const normalizedSources = sources.filter((source): source is SourceSnippet => {
      return (
        source &&
        typeof source === 'object' &&
        typeof source.memoryId === 'string' &&
        typeof source.sentence === 'string'
      )
    })

    if (normalizedSources.length === 0) {
      return NextResponse.json({
        answer: 'I do not have enough sources to answer this question.'
      })
    }

    const prompt = buildPrompt(question, normalizedSources)
    const response = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ]
      })
    })

    if (!response.ok) {
      const text = await response.text()
      return NextResponse.json({ error: text }, { status: 500 })
    }

    const payload: unknown = await response.json()
    const answer = extractText(payload)
    return NextResponse.json({ answer })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gemini request failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
