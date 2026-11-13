import { useRef, useState } from 'react'
import { ACCEPT, MAX_FILES, extractText, formatSize } from '../lib/extract.js'
import { MAX_WORDS, countWords, formatWords, totalWords } from '../lib/words.js'
import { Help, useHelp } from '../components/Help.jsx'
import {
  Card,
  LinkButton,
  Notice,
  PrimaryButton,
  ScreenFooter,
  SecondaryButton,
  inputClass,
} from '../components/ui.jsx'

let nextId = 1

export default function ContentScreen({ files, setFiles, onBack, onNext, canContinue }) {
  const input = useRef(null)
  const [pasted, setPasted] = useState('')
  const [message, setMessage] = useState(null)
  const [dragging, setDragging] = useState(false)
  const words = totalWords(files.filter((f) => f.status === 'ok'))
  const over = words > MAX_WORDS

  const updateFile = (id, patch) => setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)))

  const addFiles = (list) => {
    const incoming = [...list]
    const room = MAX_FILES - files.length
    if (incoming.length > room) {
      setMessage(`You can upload up to ${MAX_FILES} files. ${incoming.length - Math.max(room, 0)} not added.`)
    } else {
      setMessage(null)
    }
    const accepted = incoming.slice(0, Math.max(room, 0)).map((file) => ({
      id: nextId++,
      name: file.name,
      size: file.size,
      status: 'reading',
      text: '',
      error: '',
      file,
    }))
    setFiles((fs) => [...fs, ...accepted])
    for (const entry of accepted) {
      extractText(entry.file)
        .then((text) => updateFile(entry.id, { status: 'ok', text, file: undefined }))
        .catch((error) => updateFile(entry.id, { status: 'error', error: error.message, file: undefined }))
    }
  }

  const addPasted = () => {
    if (!pasted.trim()) return
    if (files.length >= MAX_FILES) {
      setMessage(`You can upload up to ${MAX_FILES} files.`)
      return
    }
    const n = files.filter((f) => f.pasted).length + 1
    setFiles((fs) => [
      ...fs,
      {
        id: nextId++,
        name: `Pasted text ${n}`,
        size: new Blob([pasted]).size,
        status: 'ok',
        text: pasted.trim(),
        error: '',
        pasted: true,
      },
    ])
    setPasted('')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 tabIndex={-1} className="text-3xl">Content</h1>
        <p className="text-muted">The teaching materials the questions will be written from.</p>
      </div>

      <WhatToUpload />

      <Card>
        <h2 className="mb-2 text-xl">Upload files</h2>
        <p className="mb-4 text-sm text-muted">
          PDF, Word (.docx), PowerPoint (.pptx) or plain text. Up to {MAX_FILES} files ({files.length} added) and{' '}
          {formatWords(MAX_WORDS)} words in all.
        </p>
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            addFiles(e.dataTransfer.files)
          }}
          className={`flex flex-col items-center gap-3 rounded-md border-2 border-dashed p-8 text-center ${
            dragging ? 'border-field bg-field-tint' : 'border-line bg-cream'
          }`}
        >
          <p>Drag files here, or</p>
          <SecondaryButton onClick={() => input.current?.click()} disabled={files.length >= MAX_FILES}>
            Choose files
          </SecondaryButton>
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-label="Teaching materials to upload"
            data-testid="content-file-input"
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
        {message && <Notice tone="warn" className="mt-3">{message}</Notice>}

        <WordMeter words={words} />

        {files.length > 0 && (
          <ul className="mt-6 divide-y divide-line rounded-md border border-line" data-testid="file-list">
            {files.map((f) => (
              <FileRow key={f.id} file={f} onRemove={() => setFiles((fs) => fs.filter((x) => x.id !== f.id))} />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-xl">Or paste text</h2>
        <label htmlFor="pasteText" className="mb-1 block font-medium">Teaching text</label>
        <textarea
          id="pasteText"
          rows={6}
          className={inputClass}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
        />
        <SecondaryButton className="mt-3" onClick={addPasted} disabled={!pasted.trim()}>
          Add pasted text
        </SecondaryButton>
      </Card>

      <PrivacyPanel />

      <ScreenFooter
        onBack={onBack}
        primary={
          <div className="flex flex-col items-end gap-1">
            <PrimaryButton onClick={onNext} disabled={!canContinue}>Continue to Generate →</PrimaryButton>
            {!canContinue && (
              <p className="text-sm text-muted">
                {over ? `Remove some material to get under ${formatWords(MAX_WORDS)} words.` : 'Add at least one file that reads OK.'}
              </p>
            )}
          </div>
        }
      />
    </div>
  )
}

function FileRow({ file, onRemove }) {
  const [open, setOpen] = useState(false)
  const words = countWords(file.text)
  return (
    <li className="p-4" data-testid="file-row">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium break-all">{file.name}</p>
          <p className="text-sm text-muted">
            {formatSize(file.size)}
            {file.status === 'ok' && ` · ${words.toLocaleString()} words`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span aria-live="polite" data-testid="file-status">
            {file.status === 'reading' && <span className="text-muted">Reading…</span>}
            {file.status === 'ok' && (
              <span className="font-medium text-pass"><span aria-hidden="true">✓ </span>Read OK</span>
            )}
            {file.status === 'error' && (
              <span className="font-medium text-fail"><span aria-hidden="true">✗ </span>Couldn't read</span>
            )}
          </span>
          {file.status === 'ok' && (
            <LinkButton aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {open ? 'Hide text' : 'Show text'}
            </LinkButton>
          )}
          <LinkButton onClick={onRemove} aria-label={`Remove ${file.name}`}>Remove</LinkButton>
        </div>
      </div>
      {file.status === 'error' && <p className="mt-2 text-sm text-fail">{file.error}</p>}
      {open && (
        <pre
          className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-cream p-3 font-mono text-sm"
          data-testid="extracted-text"
        >
          {file.text}
        </pre>
      )}
    </li>
  )
}

function WhatToUpload() {
  const [copyrightButton, copyrightPanel] = useHelp('copyright')
  return (
    <Card>
      <Help topic="whatToUpload">
        <h2 className="text-xl">What to upload</h2>
      </Help>
      <p className="mt-3">
        Upload what you actually taught. The questions are written only from these materials.
      </p>
      <ul className="mt-2 space-y-1">
        <li>
          <span aria-hidden="true" className="text-pass">✓ </span>
          <strong>Best:</strong> lecture slides (with speaker notes if you have them), teaching notes, handouts, lab or
          seminar sheets
        </li>
        <li>
          <span aria-hidden="true" className="text-pass">✓ </span>
          <strong>Also good:</strong> set readings and lesson plans
        </li>
        <li>
          <span aria-hidden="true" className="text-warn">! </span>
          <strong>Not enough on its own:</strong> a syllabus or module outline. It lists the topics, not what was taught.
        </li>
      </ul>
      <div className="mt-4 flex items-center gap-2 text-sm text-muted">
        <p>Use material you're entitled to use for teaching: your own notes and slides are best.</p>
        {copyrightButton}
      </div>
      {copyrightPanel}
    </Card>
  )
}

// Live count of the words read so far, against the limit for one set.
function WordMeter({ words }) {
  const over = words > MAX_WORDS
  const share = Math.min(words / MAX_WORDS, 1)
  return (
    <div className="mt-6" data-testid="word-meter">
      <Help topic="wordLimit">
        <p className="font-medium" aria-live="polite">
          {formatWords(words)} of {formatWords(MAX_WORDS)} words
          {over && (
            <span className="ml-2 text-fail">
              <span aria-hidden="true">✗ </span>over the limit by {formatWords(words - MAX_WORDS)}
            </span>
          )}
        </p>
      </Help>
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line"
        role="img"
        aria-label={`${Math.round(share * 100)}% of the word limit used`}
      >
        <div className={`h-full ${over ? 'bg-fail' : 'bg-field'}`} style={{ width: `${share * 100}%` }} />
      </div>
      <p className="mt-2 text-sm text-muted">
        For scale: 100 slides with short bullet points ≈ 3,000 to 5,000 words · 10 pages of a document ≈ 5,000 · a journal
        article ≈ 6,000 to 8,000.
      </p>
    </div>
  )
}

function PrivacyPanel() {
  return (
    <section className="rounded-lg border border-field bg-field-tint p-6 sm:p-8" data-testid="privacy-panel">
      <Help topic="privacy">
        <h2 className="text-xl">Your materials stay private</h2>
      </Help>
      <ul className="mt-3 space-y-1.5">
        <li>
          <span aria-hidden="true" className="text-pass">✓ </span>
          Your files are read in your browser. Only their text is sent, encrypted, to write the questions.
        </li>
        <li>
          <span aria-hidden="true" className="text-pass">✓ </span>
          Not stored by Questions That Count. The AI provider deletes them within 30 days.
        </li>
        <li>
          <span aria-hidden="true" className="text-pass">✓ </span>
          Never used to train AI models.
        </li>
        <li>
          <span aria-hidden="true" className="text-warn">! </span>
          <strong>Never upload student data:</strong> names, marks, submissions or feedback.
        </li>
      </ul>
    </section>
  )
}
