import { useEffect, useRef, useState } from 'react'
import { QUESTION_CHECKS, runChecks, runSetChecks } from '../lib/checks.js'
import { LEVELS, KNOWLEDGE_TYPES, SECONDS_PER_QUESTION } from '../lib/distribution.js'
import { LABELS } from '../lib/questionShape.js'
import { Card, FieldError, Notice, PrimaryButton, ScreenFooter, SecondaryButton, inputClass } from '../components/ui.jsx'
import { Help } from '../components/Help.jsx'
import { LevelBlock } from '../components/LevelBlock.jsx'

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'flagged', label: 'Flagged' },
]

const failsChecks = (q) => q.flagged || QUESTION_CHECKS.some((c) => q.checks?.[c.key] !== true)
const numberOf = (q) => Number(q.id.slice(1))

export default function ReviewScreen({ questions, spec, questionSet, onUpdate, onRegenerate, onBack, onNext }) {
  const [levelFilter, setLevelFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [failedOnly, setFailedOnly] = useState(false)

  const shown = questions.filter(
    (q) =>
      (levelFilter === 'all' || q.level === levelFilter) &&
      (statusFilter === 'all' || (statusFilter === 'flagged' ? q.flagged : !q.flagged && q.status === statusFilter)) &&
      (!failedOnly || failsChecks(q)),
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 tabIndex={-1} className="text-3xl">Review</h1>
        <Help topic="reviewing">
          <p className="text-muted">
            Edit, approve or reject each question. Only questions you approve are exported, and each one is approved on its
            own.
          </p>
        </Help>
      </div>

      {questionSet && (
        <p className="text-sm text-muted">
          {questionSet.moduleCode} · generated {new Date(questionSet.generatedAt).toLocaleString('en-GB')}
        </p>
      )}

      <SummaryBar questions={questions} spec={spec} />

      <Card className="!py-4">
        <h2 className="sr-only">Filters</h2>
        <div className="flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Level</span>
            <select className={inputClass} value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
              <option value="all">All levels</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Status</span>
            <select className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {STATUS_FILTERS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2">
            <input type="checkbox" className="h-5 w-5 accent-field" checked={failedOnly} onChange={(e) => setFailedOnly(e.target.checked)} />
            Failed checks only
          </label>
          <p className="ml-auto pb-2 text-sm text-muted" aria-live="polite" data-testid="filter-count">
            Showing {shown.length} of {questions.length}
          </p>
        </div>
      </Card>

      {shown.length === 0 && <p className="text-muted">No questions match these filters.</p>}

      {shown.map((q) =>
        q.flagged ? (
          <FlaggedCard key={q.id} question={q} number={numberOf(q)} onRegenerate={onRegenerate} />
        ) : (
          <QuestionCard
            key={q.id}
            question={q}
            number={numberOf(q)}
            spec={spec}
            onUpdate={onUpdate}
            onRegenerate={onRegenerate}
          />
        ),
      )}

      <ScreenFooter onBack={onBack} primary={<PrimaryButton onClick={onNext}>Continue to Export →</PrimaryButton>} />
    </div>
  )
}

// ---------- Across the set ----------

function SummaryBar({ questions, spec }) {
  const setChecks = runSetChecks(questions, spec)
  const written = questions.filter((q) => !q.flagged)
  const approved = written.filter((q) => q.status === 'approved')
  const approvedByLevel = Object.fromEntries(LEVELS.map((l) => [l, approved.filter((q) => q.level === l).length]))
  const keys = Object.fromEntries(LABELS.map((l) => [l, 0]))
  for (const q of written) {
    const key = q.options?.find((o) => o.isKey)
    if (key && key.label in keys) keys[key.label] += 1
  }
  const approvedSeconds = approved.reduce((sum, q) => sum + (SECONDS_PER_QUESTION[q.level]?.[1] ?? 0), 0)

  return (
    <Card data-testid="set-checks">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Help topic="summary">
          <h2 className="text-xl">Summary</h2>
        </Help>
        <p className="text-lg" data-testid="approved-count">
          <strong>{approved.length}</strong> of {questions.length} approved
        </p>
      </div>

      <table className="mt-3 w-full border-collapse text-left text-sm">
        <caption className="sr-only">Questions per level: approved, written and planned</caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="py-1 pr-3 font-medium">Level</th>
            {LEVELS.map((l) => (
              <th key={l} scope="col" className="py-1 pr-3 font-medium">
                <LevelBlock level={l} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-line">
            <th scope="row" className="py-1 pr-3 font-normal">Approved / planned</th>
            {LEVELS.map((l) => (
              <td key={l} className="py-1 pr-3" data-testid={`level-count-${l}`}>
                {approvedByLevel[l]} / {spec.distribution[l]}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" className="py-1 pr-3 font-normal text-muted">Written</th>
            {LEVELS.map((l) => (
              <td key={l} className="py-1 pr-3 text-muted">{setChecks.counts[l]}</td>
            ))}
          </tr>
        </tbody>
      </table>

      <ul className="mt-3 space-y-1 text-sm">
        <li>
          <SetCheck ok={setChecks.distribution.ok} label="Distribution matches B4" detail={setChecks.distribution.detail} />
        </li>
        <li>
          <SetCheck ok={setChecks.time.ok} label="Total time fits B5" detail={setChecks.time.detail} />
        </li>
        <li className="text-muted">
          Approved questions so far: up to {Math.ceil(approvedSeconds / 60)} min of {spec.timeAvailable} min available.
        </li>
        <li data-testid="key-balance">
          Key positions:{' '}
          {LABELS.map((l, i) => (
            <span key={l}>
              {i > 0 && ' · '}
              <strong>{l}</strong> {keys[l]}
            </span>
          ))}
        </li>
      </ul>
    </Card>
  )
}

const STATUS = {
  draft: { word: 'Draft', icon: '○', className: 'border-muted text-muted' },
  approved: { word: 'Approved', icon: '✓', className: 'border-pass text-pass' },
  rejected: { word: 'Rejected', icon: '✗', className: 'border-fail text-fail' },
}

function SetCheck({ ok, label, detail }) {
  return (
    <span>
      <span className={`font-medium ${ok ? 'text-pass' : 'text-fail'}`}>
        <span aria-hidden="true">{ok ? '✓ ' : '✗ '}</span>
        {label}: {ok ? 'pass' : 'fail'}
      </span>
      <span className="text-muted"> · {detail}</span>
    </span>
  )
}

// ---------- One question ----------

function FlaggedCard({ question: q, number, onRegenerate }) {
  return (
    <Card data-testid="flagged-card" className="border-2 border-fail">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-xl">Question {number}</h2>
        <LevelBlock level={q.level} />
        <Tag subtle>{q.outcome}</Tag>
        <span className="ml-auto rounded-full border border-fail px-3 py-0.5 text-sm font-medium text-fail">
          <span aria-hidden="true">✗ </span>Flagged
        </span>
      </div>
      <p>
        The AI's reply didn't match the question format, twice, so this question wasn't written.{' '}
        <span className="text-muted">Reason: {q.flagged.reason}</span>
      </p>
      <RegenerateControl number={number} onRegenerate={(note) => onRegenerate(q.id, note)} />
    </Card>
  )
}

export function QuestionCard({ question: q, number, spec, onUpdate, onRegenerate }) {
  const [mode, setMode] = useState('view') // view | edit | reject | confirmApprove
  const actionsRef = useRef(null)
  const status = STATUS[q.status] ?? STATUS.draft
  const { reasons } = runChecks(q, spec)
  const failed = QUESTION_CHECKS.filter((c) => q.checks?.[c.key] !== true)

  // After a panel closes, put keyboard focus back on the card's buttons.
  const close = () => {
    setMode('view')
    requestAnimationFrame(() => actionsRef.current?.querySelector('button')?.focus())
  }

  const approve = () => {
    if (failed.length && mode !== 'confirmApprove') return setMode('confirmApprove')
    onUpdate(q.id, { status: 'approved', rejectReason: null })
    close()
  }

  return (
    <Card
      data-testid="question-card"
      data-status={q.status}
      aria-labelledby={`${q.id}-title`}
      className={q.status === 'approved' ? 'border-2 !border-pass' : q.status === 'rejected' ? 'opacity-90' : ''}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 id={`${q.id}-title`} className="mr-2 text-xl">Question {number}</h2>
        <LevelBlock level={q.level} />
        <Tag>{q.knowledgeType}</Tag>
        {q.outcome && <Tag subtle>{q.outcome}</Tag>}
        <span
          className={`ml-auto rounded-full border px-3 py-0.5 text-sm font-medium ${status.className}`}
          data-testid="status-chip"
        >
          <span aria-hidden="true">{status.icon} </span>
          {status.word}
        </span>
      </div>

      {mode === 'edit' ? (
        <QuestionEditor question={q} spec={spec} onCancel={close} onSave={(edited) => { onUpdate(q.id, edited); close() }} />
      ) : (
        <>
          <p className="mb-4 text-lg">{q.stem}</p>

          <ol className="space-y-3">
            {q.options.map((o) => (
              <li
                key={o.label}
                className={`rounded-md border p-3 ${o.isKey ? 'border-2 border-pass bg-pass-tint' : 'border-line'}`}
              >
                <div className="flex gap-3">
                  <span className="font-semibold">{o.label}.</span>
                  <span className="flex-1">{o.text}</span>
                  {o.isKey && (
                    <span className="font-semibold text-pass">
                      <span aria-hidden="true">✓ </span>Key
                    </span>
                  )}
                </div>
                {!o.isKey && (
                  <p className="mt-1 pl-7 text-sm text-muted">
                    {o.misconception ? (
                      <>Misconception: {o.misconception}</>
                    ) : (
                      <span className="text-fail"><span aria-hidden="true">✗ </span>No misconception linked</span>
                    )}
                  </p>
                )}
              </li>
            ))}
          </ol>

          <details className="mt-4">
            <summary className="cursor-pointer text-field">Source passage</summary>
            <blockquote className="mt-2 border-l-4 border-line pl-4 text-muted">{q.sourcePassage}</blockquote>
          </details>
        </>
      )}

      <div className="mt-4">
        <h3 className="sr-only">Checks</h3>
        <ul className="flex flex-wrap gap-2" aria-label="Checks">
          {QUESTION_CHECKS.map((c) => (
            <CheckChip key={c.key} check={c} ok={q.checks?.[c.key] === true} reason={reasons[c.key]} />
          ))}
        </ul>
      </div>

      {q.status === 'rejected' && (
        <p className="mt-4 text-sm" data-testid="reject-reason">
          <span className="font-medium">Rejected.</span>{' '}
          {q.rejectReason ? <>Reason: {q.rejectReason}</> : <span className="text-muted">No reason given.</span>}
        </p>
      )}

      {mode === 'reject' && (
        <RejectPanel
          number={number}
          onCancel={close}
          onConfirm={(reason) => {
            onUpdate(q.id, { status: 'rejected', rejectReason: reason.trim() || null })
            close()
          }}
        />
      )}

      {mode === 'confirmApprove' && (
        <div className="mt-4 space-y-3 rounded-md border border-warn bg-warn-tint p-4" data-testid="confirm-approve">
          <p>
            <span className="font-semibold text-warn"><span aria-hidden="true">! </span>Warning: </span>
            This question fails {failed.length === 1 ? 'a check' : `${failed.length} checks`}:{' '}
            {failed.map((c) => c.label).join(', ')}. Approve it anyway?
          </p>
          <div className="flex flex-wrap gap-3">
            <SecondaryButton onClick={approve} autoFocus>Approve anyway</SecondaryButton>
            <SecondaryButton onClick={close}>Cancel</SecondaryButton>
          </div>
        </div>
      )}

      {mode === 'view' && (
        <div ref={actionsRef} className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          {q.status !== 'approved' && (
            <SecondaryButton onClick={approve} aria-label={`Approve question ${number}`}>
              <span aria-hidden="true">✓ </span>Approve
            </SecondaryButton>
          )}
          {q.status !== 'rejected' && (
            <SecondaryButton onClick={() => setMode('reject')} aria-label={`Reject question ${number}`}>
              <span aria-hidden="true">✗ </span>Reject
            </SecondaryButton>
          )}
          {q.status !== 'draft' && (
            <SecondaryButton onClick={() => onUpdate(q.id, { status: 'draft', rejectReason: null })} aria-label={`Set question ${number} back to draft`}>
              Back to draft
            </SecondaryButton>
          )}
          <SecondaryButton onClick={() => setMode('edit')} aria-label={`Edit question ${number}`}>
            Edit
          </SecondaryButton>
        </div>
      )}

      {mode === 'view' && <RegenerateControl number={number} onRegenerate={(note) => onRegenerate(q.id, note)} />}
    </Card>
  )
}

function RejectPanel({ number, onCancel, onConfirm }) {
  const [reason, setReason] = useState('')
  return (
    <div className="mt-4 space-y-3 rounded-md border border-fail bg-fail-tint p-4" data-testid="reject-panel">
      <label className="block">
        <span className="mb-1 block font-medium">Reason for rejecting question {number} (optional, kept for the record)</span>
        <textarea className={inputClass} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </label>
      <div className="flex flex-wrap gap-3">
        <SecondaryButton onClick={() => onConfirm(reason)}>Confirm reject</SecondaryButton>
        <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
      </div>
    </div>
  )
}

// Regenerate one question, with an optional note for the AI. Used on normal and flagged cards.
function RegenerateControl({ number, onRegenerate }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      await onRegenerate(note)
      // A successful regenerate replaces the whole question, and this control with it.
      if (mounted.current) {
        setOpen(false)
        setNote('')
      }
    } catch (e) {
      if (mounted.current) setError(e.message)
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className="mt-3">
        <SecondaryButton onClick={() => setOpen(true)} aria-label={`Regenerate question ${number}`}>
          ↻ Regenerate
        </SecondaryButton>
      </div>
    )
  }
  return (
    <div className="mt-4 space-y-3 rounded-md border border-field bg-field-tint p-4" data-testid="regenerate-panel">
      <label className="block">
        <span className="mb-1 block font-medium">Note for the AI (optional)</span>
        <input
          className={inputClass}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. make it harder, use a different case"
          disabled={busy}
          autoFocus
        />
      </label>
      <p className="text-sm text-muted">The new question replaces this one and starts as a draft.</p>
      {error && <Notice tone="fail" title="Couldn't regenerate">{error}</Notice>}
      <div className="flex flex-wrap gap-3">
        <SecondaryButton onClick={run} disabled={busy}>
          {busy ? 'Writing a new question…' : `Regenerate question ${number}`}
        </SecondaryButton>
        <SecondaryButton onClick={() => setOpen(false)} disabled={busy}>Cancel</SecondaryButton>
      </div>
    </div>
  )
}

// ---------- Editing ----------

function QuestionEditor({ question: q, spec, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => structuredClone({
    stem: q.stem,
    level: q.level,
    knowledgeType: q.knowledgeType,
    outcome: q.outcome,
    options: q.options,
    sourcePassage: q.sourcePassage,
  }))
  const [showErrors, setShowErrors] = useState(false)
  const set = (changes) => setDraft((d) => ({ ...d, ...changes }))
  const setOption = (i, changes) => set({ options: draft.options.map((o, j) => (j === i ? { ...o, ...changes } : o)) })
  const setKey = (i) => set({ options: draft.options.map((o, j) => ({ ...o, isKey: j === i })) })

  const outcomes = spec.outcomes.map((o, i) => ({ code: `LO${i + 1}`, text: o.text }))
  const misconceptions = spec.misconceptions.map((m) => m.text).filter((t) => t.trim())
  const listId = `${q.id}-misconceptions`
  const field = (name) => `${q.id}-edit-${name}`

  const errors = {}
  if (!draft.stem.trim()) errors.stem = 'Write the stem.'
  draft.options.forEach((o, i) => {
    if (!o.text.trim()) errors[`option${i}`] = `Write the text for option ${LABELS[i]}.`
  })

  const save = () => {
    if (Object.keys(errors).length) return setShowErrors(true)
    const options = draft.options.map((o, i) => {
      const option = { label: LABELS[i], text: o.text.trim(), isKey: o.isKey }
      if (!o.isKey) option.misconception = (o.misconception ?? '').trim()
      return option
    })
    onSave({
      ...draft,
      stem: draft.stem.trim(),
      sourcePassage: draft.sourcePassage.trim(),
      options,
      // An edited question has to be approved again; a rejected one stays rejected.
      status: q.status === 'approved' ? 'draft' : q.status,
    })
  }

  return (
    <div className="space-y-4" data-testid="question-editor">
      {q.status === 'approved' && (
        <Notice tone="info">Saving changes sets this question back to Draft, so you approve the edited version.</Notice>
      )}

      <label className="block" htmlFor={field('stem')}>
        <span className="mb-1 block font-medium">Stem</span>
      </label>
      <textarea
        id={field('stem')}
        className={inputClass}
        rows={3}
        value={draft.stem}
        onChange={(e) => set({ stem: e.target.value })}
        aria-invalid={showErrors && !!errors.stem}
        aria-describedby={field('stem-error')}
        autoFocus
      />
      {showErrors && <FieldError id={field('stem-error')} message={errors.stem} />}

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block font-medium">Level</span>
          <select className={inputClass} value={draft.level} onChange={(e) => set({ level: e.target.value })}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Knowledge type</span>
          <select className={inputClass} value={draft.knowledgeType} onChange={(e) => set({ knowledgeType: e.target.value })}>
            {KNOWLEDGE_TYPES.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Learning outcome</span>
          <select className={inputClass} value={draft.outcome} onChange={(e) => set({ outcome: e.target.value })}>
            {!outcomes.some((o) => o.code === draft.outcome) && <option value={draft.outcome}>{draft.outcome}</option>}
            {outcomes.map((o) => (
              <option key={o.code} value={o.code}>{o.code}: {o.text}</option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="space-y-3">
        <legend className="mb-2 font-medium">Options (choose the key)</legend>
        <datalist id={listId}>
          {misconceptions.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        {draft.options.map((o, i) => (
          <div key={i} className={`space-y-2 rounded-md border p-3 ${o.isKey ? 'border-2 border-pass bg-pass-tint' : 'border-line'}`}>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex-1" htmlFor={field(`option${i}`)}>
                <span className="mb-1 block text-sm font-medium">Option {LABELS[i]}</span>
                <input
                  id={field(`option${i}`)}
                  className={inputClass}
                  value={o.text}
                  onChange={(e) => setOption(i, { text: e.target.value })}
                  aria-invalid={showErrors && !!errors[`option${i}`]}
                  aria-describedby={field(`option${i}-error`)}
                />
              </label>
              <label className="flex items-center gap-2 pt-5">
                <input type="radio" name={field('key')} className="h-5 w-5 accent-pass" checked={o.isKey} onChange={() => setKey(i)} />
                Key
              </label>
              {draft.options.length > 3 && (
                <button
                  type="button"
                  className="pt-5 text-sm text-fail underline hover:no-underline"
                  onClick={() => set({ options: draft.options.filter((_, j) => j !== i) })}
                  aria-label={`Remove option ${LABELS[i]}`}
                >
                  Remove
                </button>
              )}
            </div>
            {showErrors && <FieldError id={field(`option${i}-error`)} message={errors[`option${i}`]} />}
            {!o.isKey && (
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Misconception behind option {LABELS[i]}</span>
                <input
                  className={inputClass}
                  list={listId}
                  value={o.misconception ?? ''}
                  onChange={(e) => setOption(i, { misconception: e.target.value })}
                  placeholder="Pick one from B3, or describe the error"
                />
              </label>
            )}
          </div>
        ))}
        {draft.options.length < 4 && (
          <SecondaryButton onClick={() => set({ options: [...draft.options, { text: '', isKey: false, misconception: '' }] })}>
            + Add option
          </SecondaryButton>
        )}
      </fieldset>

      <label className="block">
        <span className="mb-1 block font-medium">Source passage</span>
        <textarea className={inputClass} rows={3} value={draft.sourcePassage} onChange={(e) => set({ sourcePassage: e.target.value })} />
      </label>

      <div className="flex flex-wrap gap-3">
        <SecondaryButton onClick={save}>Save changes</SecondaryButton>
        <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
      </div>
    </div>
  )
}

function Tag({ children, subtle }) {
  return (
    <span
      className={`rounded-full px-3 py-0.5 text-sm font-medium ${
        subtle ? 'border border-field text-field' : 'bg-field text-on-ink'
      }`}
    >
      {children}
    </span>
  )
}

// A pass/fail chip. Hover or keyboard focus shows why; screen readers get the reason too.
function CheckChip({ check, ok, reason: failReason }) {
  const reason = ok ? check.pass : failReason ?? 'This check failed.'
  return (
    <li className="group relative">
      <span
        tabIndex={0}
        aria-label={`${check.label}: ${ok ? 'pass' : 'fail'}. ${reason}`}
        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium ${
          ok ? 'border-pass bg-pass-tint text-pass' : 'border-fail bg-fail-tint text-fail'
        }`}
        data-testid={`check-${check.key}`}
      >
        <span aria-hidden="true">{ok ? '✓' : '✗'}</span>
        {check.label}
        <span className="sr-only">{ok ? ' pass' : ' fail'}</span>
      </span>
      <span
        role="tooltip"
        aria-hidden="true"
        className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-64 rounded-md bg-ink p-2 text-sm text-on-ink shadow-lg group-hover:block group-focus-within:block"
      >
        <strong>{ok ? 'Pass' : 'Fail'}:</strong> {reason}
      </span>
    </li>
  )
}
