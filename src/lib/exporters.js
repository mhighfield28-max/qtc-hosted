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

// Markdown bold (**NOT**, from house rule A3.3) becomes plain capitals for text-only formats.
const plain = (text) => oneLine(text).replace(/\*\*(.+?)\*\*/g, '$1')

// ---------- Brightspace (CSV) ----------

// Brightspace's Question Library CSV: one block of rows per question, laid out as in D2L's own
// Sample_Question_Import_UTF8.csv. Every field is quoted, because an unquoted comma silently cuts
// the text short. Saved as UTF-8 with a byte-order mark so accented letters survive.
const csvField = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
const csvRow = (...cells) => [...cells, '', '', '', '', ''].slice(0, 5).map(csvField).join(',')

export function toBrightspace(questions, { moduleCode = 'QTC' } = {}) {
  const code = String(moduleCode).replace(/[^\w-]+/g, '') || 'QTC'
  const blocks = questions.map((q) => {
    const n = String(number(q)).padStart(2, '0')
    return [
      csvRow('NewQuestion', 'MC'),
      csvRow('ID', `${code}-Q${n}`),
      csvRow('Title', `Q${n} ${q.level} ${q.outcome}`),
      csvRow('QuestionText', plain(q.stem)),
      csvRow('Points', '1'),
      ...q.options.map((o) => csvRow('Option', o.isKey ? '100' : '0', plain(o.text))),
      csvRow(),
    ].join('\r\n')
  })
  return `\uFEFF${blocks.join('\r\n')}\r\n`
}

// ---------- Canvas (QTI 1.2 .zip) ----------

// Canvas imports a QTI 1.2 package through Settings → Import Course Content → QTI .zip file.
// The layout follows text2qti (Geoffrey Poore's open-source converter, widely used with Canvas):
// imsmanifest.xml, then a folder holding the questions and Canvas's quiz settings (assessment_meta.xml).
// The quiz arrives unpublished, one point per question, answers in the order written.
const html = (text) => `<p>${xml(oneLine(text)).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>`

function canvasItem(q, prefix) {
  const n = String(number(q)).padStart(2, '0')
  const id = `${prefix}_q${n}`
  const choiceId = (o) => `${id}_${o.label.toLowerCase()}`
  const key = q.options.find((o) => o.isKey)
  return `      <item ident="${id}" title="${xml(`Q${n} ${q.level} ${q.outcome}`)}">
        <itemmetadata>
          <qtimetadata>
            <qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>multiple_choice_question</fieldentry></qtimetadatafield>
            <qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>1</fieldentry></qtimetadatafield>
            <qtimetadatafield><fieldlabel>original_answer_ids</fieldlabel><fieldentry>${q.options.map(choiceId).join(',')}</fieldentry></qtimetadatafield>
            <qtimetadatafield><fieldlabel>assessment_question_identifierref</fieldlabel><fieldentry>${id}_ref</fieldentry></qtimetadatafield>
          </qtimetadata>
        </itemmetadata>
        <presentation>
          <material>
            <mattext texttype="text/html">${xml(html(q.stem))}</mattext>
          </material>
          <response_lid ident="response1" rcardinality="Single">
            <render_choice>
${q.options
  .map(
    (o) => `              <response_label ident="${choiceId(o)}">
                <material>
                  <mattext texttype="text/html">${xml(html(o.text))}</mattext>
                </material>
              </response_label>`,
  )
  .join('\n')}
            </render_choice>
          </response_lid>
        </presentation>
        <resprocessing>
          <outcomes>
            <decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/>
          </outcomes>
          <respcondition continue="No">
            <conditionvar>
              <varequal respident="response1">${key ? choiceId(key) : ''}</varequal>
            </conditionvar>
            <setvar action="Set" varname="SCORE">100</setvar>
          </respcondition>
        </resprocessing>
      </item>`
}

export function canvasAssessmentXml(questions, { id, title }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/ims_qtiasiv1p2 http://www.imsglobal.org/xsd/ims_qtiasiv1p2p1.xsd">
  <assessment ident="${id}" title="${xml(title)}">
    <qtimetadata>
      <qtimetadatafield><fieldlabel>cc_maxattempts</fieldlabel><fieldentry>1</fieldentry></qtimetadatafield>
    </qtimetadata>
    <section ident="root_section">
${questions.map((q) => canvasItem(q, id)).join('\n')}
    </section>
  </assessment>
</questestinterop>
`
}

export function canvasMetaXml(questions, { id, title, description }) {
  const points = `${questions.length}.0`
  return `<?xml version="1.0" encoding="UTF-8"?>
<quiz identifier="${id}" xmlns="http://canvas.instructure.com/xsd/cccv1p0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://canvas.instructure.com/xsd/cccv1p0 https://canvas.instructure.com/xsd/cccv1p0.xsd">
  <title>${xml(title)}</title>
  <description>${xml(`<p>${xml(description)}</p>`)}</description>
  <shuffle_answers>false</shuffle_answers>
  <scoring_policy>keep_highest</scoring_policy>
  <hide_results></hide_results>
  <quiz_type>assignment</quiz_type>
  <points_possible>${points}</points_possible>
  <require_lockdown_browser>false</require_lockdown_browser>
  <require_lockdown_browser_for_results>false</require_lockdown_browser_for_results>
  <require_lockdown_browser_monitor>false</require_lockdown_browser_monitor>
  <lockdown_browser_monitor_data/>
  <show_correct_answers>false</show_correct_answers>
  <anonymous_submissions>false</anonymous_submissions>
  <could_be_locked>false</could_be_locked>
  <allowed_attempts>1</allowed_attempts>
  <one_question_at_a_time>false</one_question_at_a_time>
  <cant_go_back>false</cant_go_back>
  <available>false</available>
  <one_time_results>false</one_time_results>
  <show_correct_answers_last_attempt>false</show_correct_answers_last_attempt>
  <only_visible_to_overrides>false</only_visible_to_overrides>
  <module_locked>false</module_locked>
  <assignment identifier="${id}_assignment">
    <title>${xml(title)}</title>
    <due_at/>
    <lock_at/>
    <unlock_at/>
    <module_locked>false</module_locked>
    <workflow_state>unpublished</workflow_state>
    <assignment_overrides>
    </assignment_overrides>
    <quiz_identifierref>${id}</quiz_identifierref>
    <allowed_extensions></allowed_extensions>
    <has_group_category>false</has_group_category>
    <points_possible>${points}</points_possible>
    <grading_type>points</grading_type>
    <all_day>false</all_day>
    <submission_types>online_quiz</submission_types>
    <position>1</position>
    <turnitin_enabled>false</turnitin_enabled>
    <vericite_enabled>false</vericite_enabled>
    <peer_review_count>0</peer_review_count>
    <peer_reviews>false</peer_reviews>
    <automatic_peer_reviews>false</automatic_peer_reviews>
    <anonymous_peer_reviews>false</anonymous_peer_reviews>
    <grade_group_students_individually>false</grade_group_students_individually>
    <freeze_on_copy>false</freeze_on_copy>
    <omit_from_final_grade>false</omit_from_final_grade>
    <intra_group_peer_reviews>false</intra_group_peer_reviews>
    <only_visible_to_overrides>false</only_visible_to_overrides>
    <post_to_sis>false</post_to_sis>
    <moderated_grading>false</moderated_grading>
    <grader_count>0</grader_count>
    <grader_comments_visible_to_graders>true</grader_comments_visible_to_graders>
    <anonymous_grading>false</anonymous_grading>
    <graders_anonymous_to_graders>false</graders_anonymous_to_graders>
    <grader_names_visible_to_final_grader>true</grader_names_visible_to_final_grader>
    <anonymous_instructor_annotations>false</anonymous_instructor_annotations>
    <post_policy>
      <post_manually>false</post_manually>
    </post_policy>
  </assignment>
  <assignment_group_identifierref>${id}_assignment-group</assignment_group_identifierref>
  <assignment_overrides>
  </assignment_overrides>
</quiz>
`
}

export function canvasManifestXml({ id, title, date }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${id}_manifest" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:lom="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource" xmlns:imsmd="http://www.imsglobal.org/xsd/imsmd_v1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1 http://www.imsglobal.org/xsd/imscp_v1p1.xsd http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource http://www.imsglobal.org/profile/cc/ccv1p1/LOM/ccv1p1_lomresource_v1p0.xsd http://www.imsglobal.org/xsd/imsmd_v1p2 http://www.imsglobal.org/xsd/imsmd_v1p2p2.xsd">
  <metadata>
    <schema>IMS Content</schema>
    <schemaversion>1.1.3</schemaversion>
    <imsmd:lom>
      <imsmd:general>
        <imsmd:title><imsmd:string>${xml(title)}</imsmd:string></imsmd:title>
      </imsmd:general>
      <imsmd:lifeCycle>
        <imsmd:contribute><imsmd:date><imsmd:dateTime>${date}</imsmd:dateTime></imsmd:date></imsmd:contribute>
      </imsmd:lifeCycle>
    </imsmd:lom>
  </metadata>
  <organizations/>
  <resources>
    <resource identifier="${id}" type="imsqti_xmlv1p2">
      <file href="${id}/${id}.xml"/>
      <dependency identifierref="${id}_dependency"/>
    </resource>
    <resource identifier="${id}_dependency" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="${id}/assessment_meta.xml">
      <file href="${id}/assessment_meta.xml"/>
    </resource>
  </resources>
</manifest>
`
}

// Builds the QTI .zip Canvas imports. id must be letters, numbers and underscores.
export async function toCanvas(questions, { id, title, description, date }) {
  const zip = new JSZip()
  zip.file('imsmanifest.xml', canvasManifestXml({ id, title, date }))
  zip.file(`${id}/${id}.xml`, canvasAssessmentXml(questions, { id, title }))
  zip.file(`${id}/assessment_meta.xml`, canvasMetaXml(questions, { id, title, description }))
  return zip.generateAsync({ type: 'uint8array' })
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

// Builds the zip. formats: which LMS files to include ('Canvas', 'Blackboard', 'Brightspace', 'Moodle GIFT').
// The review sheet and the specification are always included.
// output: 'blob' in the browser; tests in Node use 'uint8array'.
export async function buildExport({ questions, formats, questionSet, moduleName, exportedAt = new Date(), output = 'blob' }) {
  const approved = approvedOnly(questions)
  if (!approved.length) throw new Error('Approve at least one question before exporting.')
  const code = safeName(questionSet.moduleCode)
  const base = `${code}_${isoDate(exportedAt)}`
  // The LMS import files are also returned on their own: Moodle and Blackboard only accept
  // the .txt itself, so uploading the .zip is rejected ("application/zip does not match text/plain").
  // Canvas is the exception: it imports a QTI .zip, which sits inside the bundle and also downloads on its own.
  const lmsFiles = []
  const date = isoDate(exportedAt)
  if (formats.includes('Canvas')) {
    const id = `qtc_${code.replace(/[^A-Za-z0-9]/g, '_')}_${date.replace(/-/g, '')}`
    const title = `${moduleName || questionSet.moduleCode}: questions (${formatDate(exportedAt)})`
    const description = `${approved.length} questions written with Questions That Count and reviewed before export.`
    lmsFiles.push({
      lms: 'Canvas',
      name: `${base}_canvas-qti.zip`,
      type: 'application/zip',
      content: await toCanvas(approved, { id, title, description, date }),
    })
  }
  if (formats.includes('Blackboard')) lmsFiles.push({ lms: 'Blackboard', name: `${base}_blackboard.txt`, type: 'text/plain', content: toBlackboard(approved) })
  if (formats.includes('Brightspace')) {
    lmsFiles.push({ lms: 'Brightspace', name: `${base}_brightspace.csv`, type: 'text/csv', content: toBrightspace(approved, { moduleCode: questionSet.moduleCode }) })
  }
  if (formats.includes('Moodle GIFT')) lmsFiles.push({ lms: 'Moodle', name: `${base}_moodle-gift.txt`, type: 'text/plain', content: toGift(approved) })
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
