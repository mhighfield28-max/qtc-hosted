// Export converters (build brief, section 5). Each one takes questions in the section 7 shape
// and returns a file's contents; generation never knows about export formats (rule 5).
// Only approved questions are ever passed in (rule 4): see approvedOnly().

import JSZip from 'jszip'
import { LEVELS } from './distribution.js'

export const approvedOnly = (questions) => questions.filter((q) => !q.flagged && q.status === 'approved')

const number = (q) => Number(q.id.slice(1))
const oneLine = (text) => String(text ?? '').replace(/\s+/g, ' ').trim()

// ---------- Moodle GIFT ----------

// GIFT gives ~ = # { } : a special meaning, so each is escaped with a backslash (and so is the backslash).
export const escapeGift = (text) => oneLine(text).replace(/[\\~=#{}:]/g, (c) => `\\${c}`)

// One block per question, blank line between. [markdown] so a **BOLD NEGATIVE** (A3.3) shows in bold.
export function toGift(questions) {
  const blocks = questions.map((q) => {
    const options = q.options.map((o) => `\t${o.isKey ? '=' : '~'}${escapeGift(o.text)}`)
    return [
      `// Question ${number(q)}: ${q.level}, ${q.knowledgeType}, ${q.outcome}`,
      `::Q${String(number(q)).padStart(2, '0')}::[markdown]${escapeGift(q.stem)} {`,
      ...options,
      '}',
    ].join('\n')
  })
  return `${blocks.join('\n\n')}\n`
}

// ---------- Blackboard ----------

// Blackboard's tab-delimited upload: MC, question, then each answer followed by correct/incorrect.
// Tabs and line breaks inside the text would break the format, so they become spaces.
export function toBlackboard(questions) {
  const lines = questions.map((q) =>
    ['MC', oneLine(q.stem), ...q.options.flatMap((o) => [oneLine(o.text), o.isKey ? 'correct' : 'incorrect'])].join('\t'),
  )
  return `${lines.join('\n')}\n`
}

// ---------- Review sheet (.docx) ----------

const xml = (text) =>
  String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const run = (text, { bold, italic, size, color } = {}) =>
  `<w:r><w:rPr>${bold ? '<w:b/>' : ''}${italic ? '<w:i/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}${
    size ? `<w:sz w:val="${size}"/>` : ''
  }</w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`
const para = (runs, { indent, after = 120, keepNext } = {}) =>
  `<w:p><w:pPr>${keepNext ? '<w:keepNext/>' : ''}<w:spacing w:after="${after}"/>${indent ? `<w:ind w:left="${indent}"/>` : ''}</w:pPr>${[]
    .concat(runs)
    .join('')}</w:p>`

export function reviewSheetXml(questions, { moduleName, moduleCode, generatedAt, exportedAt }) {
  const counts = LEVELS.map((l) => `${l} ${questions.filter((q) => q.level === l).length}`).join(' · ')
  const body = [
    para(run(`Review sheet: ${moduleName}`, { bold: true, size: 36 }), { after: 200 }),
    para(run(`Module code ${moduleCode}. Questions generated ${formatDate(generatedAt)}; exported ${formatDate(exportedAt)}.`)),
    para(run(`${questions.length} approved ${questions.length === 1 ? 'question' : 'questions'}: ${counts}.`)),
    para(run('For moderation and external examiners. Each distractor shows the misconception it was built from.', { italic: true }), { after: 360 }),
  ]
  for (const q of questions) {
    body.push(
      para(run(`Question ${number(q)}`, { bold: true, size: 28 }), { keepNext: true, after: 60 }),
      para(run(`Level: ${q.level} · Knowledge type: ${q.knowledgeType} · Outcome: ${q.outcome}`, { color: '6B6F68' }), { keepNext: true }),
      para(run(q.stem), { keepNext: true }),
    )
    for (const o of q.options) {
      body.push(
        para([run(`${o.label}. `, { bold: true }), run(o.text), o.isKey ? run('   ✓ KEY', { bold: true, color: '1E6B2E' }) : ''], {
          indent: 360,
          after: o.isKey ? 80 : 0,
          keepNext: true,
        }),
      )
      if (!o.isKey) body.push(para(run(`Misconception: ${o.misconception || 'none recorded'}`, { italic: true, color: '6B6F68' }), { indent: 720, after: 80 }))
    }
    body.push(para([run('Source: ', { bold: true }), run(q.sourcePassage)], { after: 360 }))
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`
const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`

export async function toReviewSheet(questions, info) {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', CONTENT_TYPES)
  zip.file('_rels/.rels', ROOT_RELS)
  zip.file('word/_rels/document.xml.rels', DOC_RELS)
  zip.file('word/styles.xml', STYLES)
  zip.file('word/document.xml', reviewSheetXml(questions, info))
  return zip.generateAsync({ type: 'uint8array' })
}

// ---------- The bundle ----------

// "2026-10-20" in local time
export const isoDate = (d) => {
  const date = new Date(d)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const formatDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const safeName = (s) => String(s).replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'questions'

// Builds the zip. formats: which LMS files to include ('Moodle GIFT', 'Blackboard').
// The review sheet and the specification are always included.
// output: 'blob' in the browser; tests in Node use 'uint8array'.
export async function buildExport({ questions, formats, questionSet, moduleName, exportedAt = new Date(), output = 'blob' }) {
  const approved = approvedOnly(questions)
  if (!approved.length) throw new Error('Approve at least one question before exporting.')
  const code = safeName(questionSet.moduleCode)
  const base = `${code}_${isoDate(exportedAt)}`
  // The LMS import files are also returned on their own: Moodle and Blackboard only accept
  // the .txt itself, so uploading the .zip is rejected ("application/zip does not match text/plain").
  const lmsFiles = []
  if (formats.includes('Moodle GIFT')) lmsFiles.push({ lms: 'Moodle', name: `${base}_moodle-gift.txt`, content: toGift(approved) })
  if (formats.includes('Blackboard')) lmsFiles.push({ lms: 'Blackboard', name: `${base}_blackboard.txt`, content: toBlackboard(approved) })
  const files = [...lmsFiles]
  files.push({
    name: `${base}_review-sheet.docx`,
    content: await toReviewSheet(approved, { moduleName, moduleCode: questionSet.moduleCode, generatedAt: questionSet.generatedAt, exportedAt }),
  })
  files.push({ name: `${base}_specification.md`, content: questionSet.specification })

  const zip = new JSZip()
  for (const f of files) zip.file(f.name, f.content)
  const zipped = await zip.generateAsync({ type: output, mimeType: 'application/zip' })
  return { fileName: `${base}.zip`, files: files.map((f) => f.name), lmsFiles, zipped, count: approved.length }
}
