import { useState } from 'react'
import { LEVELS } from '../lib/distribution.js'
import { EXPORT_FORMATS } from '../lib/specification.js'
import { approvedOnly, buildExport } from '../lib/exporters.js'
import { Card, Notice, PrimaryButton, ScreenFooter, SecondaryButton } from '../components/ui.jsx'
import { Help, HintWithHelp } from '../components/Help.jsx'

const FORMAT_FILES = {
  Canvas: { name: 'Canvas', file: 'QTI .zip' },
  Blackboard: { name: 'Blackboard', file: '.txt, tab-delimited' },
  Brightspace: { name: 'Brightspace (D2L)', file: '.csv' },
  'Moodle GIFT': { name: 'Moodle', file: '.txt, GIFT format' },
}
const EXTENSION = { Canvas: '.zip', Blackboard: '.txt', Brightspace: '.csv', Moodle: '.txt' }

// The platform chosen last time, so a returning lecturer doesn't pick it again. This browser only.
const REMEMBER = 'qtc-export-formats'
function rememberedFormats() {
  try {
    const saved = JSON.parse(localStorage.getItem(REMEMBER) ?? '[]')
    return Array.isArray(saved) ? saved.filter((f) => EXPORT_FORMATS.includes(f)) : []
  } catch {
    return []
  }
}
function remember(formats) {
  try {
    localStorage.setItem(REMEMBER, JSON.stringify(formats))
  } catch {
    // Private windows can refuse storage; the choice just isn't remembered.
  }
}

// Hands a file to the browser's download.
function saveFile(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const IMPORT_HELP = {
  Canvas:
    'In Canvas: Settings → Import Course Content → Content type: QTI .zip file → choose this file → Import. The quiz arrives unpublished, with a question bank.',
  Blackboard: 'In Blackboard: Question pool or test → Upload questions, then upload this .txt file.',
  Brightspace: 'In Brightspace: Quizzes → Question Library → Import → Upload a File, choose this .csv, then Import All.',
  Moodle: 'In Moodle: Question bank → Import → GIFT format, then upload this .txt file.',
}

export default function ExportScreen({ spec, questions, questionSet, onFormats, onBack }) {
  const [formats, setFormatsState] = useState(() => (spec.exportFormats.length ? spec.exportFormats : rememberedFormats()))
  const setFormats = (update) => {
    const next = EXPORT_FORMATS.filter((f) => update(formats).includes(f))
    setFormatsState(next)
    remember(next)
    onFormats?.(next)
  }
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null) // { fileName, files, count } after a download
  const [error, setError] = useState(null)

  const approved = approvedOnly(questions)
  const notApproved = questions.length - approved.length
  const approvedByLevel = Object.fromEntries(LEVELS.map((l) => [l, approved.filter((q) => q.level === l).length]))
  const mismatched = LEVELS.filter((l) => approvedByLevel[l] !== Number(spec.distribution[l]))

  const toggle = (f) => setFormats((fs) => (fs.includes(f) ? fs.filter((x) => x !== f) : [...fs, f]))

  const download = async () => {
    setBusy(true)
    setError(null)
    try {
      const out = await buildExport({ questions, formats, questionSet, moduleName: spec.moduleName })
      saveFile(out.zipped, out.fileName)
      setResult(out)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 tabIndex={-1} className="text-3xl">Export</h1>
        <Help topic="exporting">
          <p className="text-muted">
            Download the approved questions for your LMS, with a review sheet and the specification used.
          </p>
        </Help>
      </div>

      {approved.length === 0 ? (
        <Notice tone="fail" title="Nothing to export yet">
          No questions are approved. Go back to Review and approve the ones you want to use.
        </Notice>
      ) : (
        mismatched.length > 0 && (
          <Notice tone="warn" title="The approved set doesn't match the distribution">
            {mismatched.map((l) => `${l}: ${approvedByLevel[l]} approved, ${spec.distribution[l]} planned`).join('; ')}. You can still
            export, or go back and approve or regenerate questions.
          </Notice>
        )
      )}

      <Card>
        <h2 className="mb-3 text-xl">What will be exported</h2>
        <p className="mb-4" data-testid="export-count">
          <strong>{approved.length}</strong> approved {approved.length === 1 ? 'question' : 'questions'}.
          {notApproved > 0 && (
            <span className="text-muted"> {notApproved} draft, rejected or flagged {notApproved === 1 ? 'question is' : 'questions are'} left out.</span>
          )}
        </p>

        <fieldset>
          <legend className="mb-1 font-medium">Which learning platform do you use?</legend>
          <HintWithHelp topic="platforms" className="mb-3">Choose one or more. Each gets its own import file.</HintWithHelp>
          <div className="grid gap-2 sm:grid-cols-2" id="exportFormats">
            {EXPORT_FORMATS.map((f) => (
              <label
                key={f}
                className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 ${
                  formats.includes(f) ? 'border-field bg-field-tint' : 'border-line'
                }`}
              >
                <input type="checkbox" className="h-5 w-5 accent-field" checked={formats.includes(f)} onChange={() => toggle(f)} />
                <span>
                  <span className="font-medium">{FORMAT_FILES[f].name}</span>{' '}
                  <span className="block text-sm text-muted">{FORMAT_FILES[f].file}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="mt-4 font-medium">Always included</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Review sheet (.docx): every approved question with its key, level, knowledge type, misconceptions and source</li>
          <li>Specification used (.md): the exact instructions the set was generated from</li>
        </ul>
        <p className="mt-4 text-sm text-muted">
          All files download together as one .zip named after the module code and today's date. Your platform won't accept that
          bundle: upload its own import file, which you can download separately once the bundle is built.
        </p>
      </Card>

      {error && <Notice tone="fail" title="Couldn't build the export">{error}</Notice>}

      {result && (
        <Notice tone="pass" title="Downloaded">
          <span data-testid="export-result">
            {result.fileName}, with {result.count} {result.count === 1 ? 'question' : 'questions'}: {result.files.join(', ')}.
          </span>
        </Notice>
      )}

      {result?.lmsFiles.length > 0 && (
        <Card>
          <h2 className="mb-2 text-xl">Import into your LMS</h2>
          <p className="mb-4">Upload the file for your platform below, not the bundle .zip you just downloaded.</p>
          <ul className="space-y-4">
            {result.lmsFiles.map((f) => (
              <li key={f.name}>
                <SecondaryButton onClick={() => saveFile(new Blob([f.content], { type: f.type }), f.name)}>
                  Download {f.lms} file ({EXTENSION[f.lms]})
                </SecondaryButton>
                <p className="mt-1 text-sm text-muted">
                  {f.name}. {IMPORT_HELP[f.lms]}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ScreenFooter
        onBack={onBack}
        primary={
          <div className="flex flex-col items-end gap-1">
            <PrimaryButton onClick={download} disabled={approved.length === 0 || busy || !questionSet || formats.length === 0}>
              {busy ? 'Building…' : 'Download .zip'}
            </PrimaryButton>
            {formats.length === 0 && approved.length > 0 && (
              <p className="text-sm text-muted">Choose your learning platform first.</p>
            )}
          </div>
        }
      />
    </div>
  )
}

