// Text extraction from teaching materials, done in the browser.
// PDF via pdf.js, Word (.docx) via mammoth, PowerPoint (.pptx) by reading the slide XML.

import JSZip from 'jszip'

export const MAX_FILES = 20
export const ACCEPT = '.pdf,.docx,.pptx,.txt,.md'

export function fileKind(name) {
  const ext = name.toLowerCase().split('.').pop()
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  if (ext === 'pptx') return 'pptx'
  if (ext === 'txt' || ext === 'md') return 'text'
  if (ext === 'doc' || ext === 'ppt') return 'legacy'
  return 'unsupported'
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function extractPdf(buffer) {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise
  const pages = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    let text = ''
    for (const item of content.items) {
      text += item.str + (item.hasEOL ? '\n' : ' ')
    }
    pages.push(`[Page ${n}]\n${text.replace(/[ \t]+\n/g, '\n').trim()}`)
  }
  return pages.join('\n\n')
}

async function extractDocx(buffer) {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return result.value.replace(/\n{3,}/g, '\n\n').trim()
}

function decodeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
}

// Text of one slide's XML: each <a:p> paragraph on its own line, runs (<a:t>) joined.
export function slideXmlToText(xml) {
  const paragraphs = xml.match(/<a:p>[\s\S]*?<\/a:p>|<a:p [\s\S]*?<\/a:p>/g) ?? []
  return paragraphs
    .map((p) => [...p.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXml(m[1])).join(''))
    .filter((line) => line.trim())
    .join('\n')
}

export async function extractPptx(buffer) {
  const zip = await JSZip.loadAsync(buffer)
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
  const slides = []
  for (const name of slideNames) {
    const n = name.match(/\d+/)[0]
    let text = slideXmlToText(await zip.file(name).async('string'))
    const notes = zip.file(`ppt/notesSlides/notesSlide${n}.xml`)
    if (notes) {
      const notesText = slideXmlToText(await notes.async('string'))
        .split('\n')
        .filter((line) => !/^\d+$/.test(line.trim())) // drop the slide-number placeholder
        .join('\n')
      if (notesText.trim()) text += `\nNotes: ${notesText}`
    }
    slides.push(`[Slide ${n}]\n${text}`)
  }
  return slides.join('\n\n')
}

// Returns the extracted text, or throws an Error with a plain-English message.
export async function extractText(file) {
  const kind = fileKind(file.name)
  if (kind === 'legacy') {
    throw new Error('Old .doc and .ppt files can\'t be read. Save it as .docx or .pptx and upload again.')
  }
  if (kind === 'unsupported') {
    throw new Error('Unsupported file type. Use PDF, Word (.docx), PowerPoint (.pptx) or plain text.')
  }
  const buffer = await file.arrayBuffer()
  let text
  if (kind === 'pdf') text = await extractPdf(buffer)
  else if (kind === 'docx') text = await extractDocx(buffer)
  else if (kind === 'pptx') text = await extractPptx(buffer)
  else text = new TextDecoder().decode(buffer)

  const letters = text.replace(/\[(Page|Slide) \d+\]/g, '').replace(/\s/g, '')
  if (!letters) {
    throw new Error('No text found. If this is a scanned PDF, it needs a text layer first.')
  }
  return text
}
