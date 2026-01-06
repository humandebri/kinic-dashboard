// Where: Client PDF helpers for insert flow.
// What: Extracts text from a PDF using pdfjs-dist.
// Why: Keeps PDF parsing logic out of page components.
'use client'

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { TextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api'

const PDF_WORKER_SRC =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.js'

type TextContentItem = TextItem | TextMarkedContent

const isTextItem = (item: TextContentItem): item is TextItem => {
  return 'str' in item
}

const ensureWorker = () => {
  if (GlobalWorkerOptions.workerSrc !== PDF_WORKER_SRC) {
    GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC
  }
}

export const extractTextFromPdf = async (file: File): Promise<string> => {
  ensureWorker()

  const data = await file.arrayBuffer()
  // pdf.js parses locally in the browser, no server roundtrip.
  const pdf = await getDocument({ data }).promise

  const pages = Array.from({ length: pdf.numPages }, (_, index) => index + 1)
  const chunks: string[] = []

  for (const pageNumber of pages) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()

    const pageText = content.items
      .filter(isTextItem)
      .map((item) => item.str)
      .join(' ')

    chunks.push(pageText)
  }

  return chunks.join('\n\n')
}
