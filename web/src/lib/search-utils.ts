// どこで: 検索UIの共通ユーティリティ。
// 何を: 検索結果の解析・スニペット作成・関連語抽出を提供する。
// なぜ: Searchページのロジックを分離して見通しを良くするため。
export type ParsedResult = {
  score: number
  rawText: string
  sentence: string
  tag?: string
  memoryId: string
}

const SNIPPET_LENGTH = 240

export const parseResultText = (rawText: string) => {
  try {
    const parsed = JSON.parse(rawText) as { tag?: unknown; sentence?: unknown }
    if (parsed && typeof parsed === 'object') {
      const sentence = typeof parsed.sentence === 'string' ? parsed.sentence : rawText
      const tag = typeof parsed.tag === 'string' ? parsed.tag : undefined
      return { sentence, tag }
    }
  } catch {
    // Fallback to raw text.
  }
  return { sentence: rawText, tag: undefined }
}

export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const buildSnippet = (sentence: string, tokens: string[]) => {
  if (sentence.length <= SNIPPET_LENGTH) return sentence
  if (!tokens.length) {
    return `${sentence.slice(0, SNIPPET_LENGTH)}…`
  }
  const regex = new RegExp(tokens.map(escapeRegExp).join('|'), 'i')
  const match = sentence.match(regex)
  if (!match || match.index === undefined) {
    return `${sentence.slice(0, SNIPPET_LENGTH)}…`
  }
  const start = Math.max(0, match.index - 80)
  const end = Math.min(sentence.length, start + SNIPPET_LENGTH)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < sentence.length ? '…' : ''
  return `${prefix}${sentence.slice(start, end)}${suffix}`
}

export const extractRelatedTerms = (sentences: string[], exclude: Set<string>) => {
  const counts = new Map<string, number>()
  for (const sentence of sentences) {
    const tokens = sentence.toLowerCase().match(/[a-z0-9_]{3,}/g) ?? []
    for (const token of tokens) {
      if (exclude.has(token)) continue
      counts.set(token, (counts.get(token) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([token]) => token)
}
