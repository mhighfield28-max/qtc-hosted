import { useRef, useState } from 'react'
import { marked } from 'marked'
import {
  LEVELS,
  STUDY_LEVELS,
  QUESTION_COUNTS,
  WEIGHT_LIMIT,
  defaultDistribution,
  distributionTotal,
  estimateMinutes,
  timeFit,
} from '../lib/distribution.js'
import {
  EXPORT_FORMATS,
  houseRulesFromMarkdown,
  isDistributionChanged,
  specFromMarkdown,
  specToMarkdown,
  weightWarning,
} from '../lib/specification.js'
import {
  Card,
  FieldError,
  LinkButton,
  Notice,
  PrimaryButton,
  ScreenFooter,
  SecondaryButton,
  inputClass,
} from '../components/ui.jsx'
import { Help, useHelp } from '../components/Help.jsx'
import { LevelBlock } from '../components/LevelBlock.jsx'

const idFor = (key) => key.replace(/\./g, '-')
const labelClass = 'mb-1 block font-medium'
const hintClass = 'mb-2 text-sm text-muted'

function errProps(errors, key, show) {
  const message = show ? errors[key] : undefined
  return {
    id: idFor(key),
    'aria-invalid': message ? 'true' : undefined,
    'aria-describedby': message ? `${idFor(key)}-error` : undefined,
  }
}

function slug(s) {
  return (s || 'specification').trim().replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'specification'
}

export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function SetupScreen({
  spec,
  setSpec,
  errors,
  showErrors,
  setShowErrors,
  houseRules,
  houseRulesFromFile,
  setHouseRules,
  contentSource,
  onNext,
}) {
  const [importMessage, setImportMessage] = useState(null)
  const [pendingRules, setPendingRules] = useState(null) // Part A from an imported file, waiting for a yes or no
  const fileInput = useRef(null)
  const summaryRef = useRef(null)

  const update = (patch) => setSpec((s) => ({ ...s, ...patch }))
  const show = showErrors
  const err = (key) => (show ? errors[key] : undefined)

  // Changing level of study or question count refills the default distribution.
  const setStudyLevel = (studyLevel) =>
    update({
      studyLevel,
      distribution: spec.questionCount ? defaultDistribution(studyLevel, Number(spec.questionCount)) : spec.distribution,
      distributionReason: '',
    })
  const setQuestionCount = (value) => {
    const questionCount = value ? Number(value) : ''
    update({
      questionCount,
      distribution:
        spec.studyLevel && questionCount ? defaultDistribution(spec.studyLevel, questionCount) : spec.distribution,
      distributionReason: '',
    })
  }

  const updateRow = (field, i, patch) =>
    setSpec((s) => ({
      ...s,
      [field]: s[field].map((row, j) => (j === i ? (typeof row === 'string' ? patch : { ...row, ...patch }) : row)),
    }))
  const addRow = (field, blank) => setSpec((s) => ({ ...s, [field]: [...s[field], blank] }))
  const removeRow = (field, i) => setSpec((s) => ({ ...s, [field]: s[field].filter((_, j) => j !== i) }))

  const handleNext = () => {
    if (Object.keys(errors).length) {
      setShowErrors(true)
      setTimeout(() => summaryRef.current?.focus(), 0)
      return
    }
    onNext()
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPendingRules(null)
    try {
      const text = await file.text()
      const { spec: imported, warnings } = specFromMarkdown(text)
      const rules = houseRulesFromMarkdown(text)
      setSpec(imported)
      setShowErrors(true)
      let partA
      if (!rules) partA = "The file has no Part A, so the house rules weren't changed."
      else if (rules.trim() === houseRules.trim()) partA = 'Part A matches the house rules in use.'
      else {
        partA = ''
        setPendingRules(rules)
      }
      setImportMessage({ tone: 'pass', text: `Imported "${file.name}". ${partA}`.trim(), warnings })
    } catch (error) {
      setImportMessage({ tone: 'fail', text: error.message, warnings: [] })
    }
  }

  const handleDownload = () => {
    const rulesEdited = houseRules !== houseRulesFromFile
    downloadText(
      `${slug(spec.moduleName)}-specification.md`,
      specToMarkdown(spec, { houseRules, contentSource }) +
        (rulesEdited ? '\n<!-- Part A was edited from the house-rules.md file for this set. -->\n' : ''),
    )
  }

  const total = distributionTotal(spec.distribution)
  const estimate = estimateMinutes(spec.distribution)
  const fit = timeFit(spec.distribution, spec.timeAvailable)
  const changed = isDistributionChanged(spec)
  const errorList = Object.entries(errors)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 tabIndex={-1} className="text-3xl">Set up</h1>
          <Help topic="specParts">
            <p className="text-muted">Fill in Part B: about your module. Part A, the house rules, is ready-made.</p>
          </Help>
        </div>
        <div className="flex flex-wrap gap-2">
          <SecondaryButton
            onClick={() => fileInput.current?.click()}
            title="Part A: house rules, the same for every module. Part B: your module."
          >
            Import specification (Part A and B)
          </SecondaryButton>
          <SecondaryButton
            onClick={handleDownload}
            title="Part A: house rules, the same for every module. Part B: your module."
          >
            Download specification (Part A and B)
          </SecondaryButton>
          <input
            ref={fileInput}
            type="file"
            accept=".md,.txt,text/markdown,text/plain"
            className="sr-only"
            tabIndex={-1}
            aria-label="Specification file to import"
            data-testid="import-spec-input"
            onChange={handleImport}
          />
        </div>
      </div>

      {importMessage && (
        <Notice tone={importMessage.tone} title={importMessage.tone === 'pass' ? 'Imported' : 'Import failed'}>
          {importMessage.text}
          {importMessage.tone === 'pass' && ' Check the form below; anything missing is marked.'}
          {importMessage.warnings.map((w) => (
            <span key={w} className="block">{w}</span>
          ))}
        </Notice>
      )}

      {pendingRules && (
        <Notice tone="warn" title="Different house rules">
          {pendingRules.trim() === houseRulesFromFile.trim()
            ? "The file uses the standard house rules (Part A), but you've edited them on this page. Which do you want for this set?"
            : 'The file has its own house rules (Part A), edited from the standard ones. Use them for this set?'}
          <span className="mt-3 flex flex-wrap gap-2">
            <SecondaryButton
              onClick={() => {
                setHouseRules(pendingRules)
                setPendingRules(null)
                setImportMessage((m) => m && { ...m, text: `${m.text} House rules taken from the file.` })
              }}
            >
              {pendingRules.trim() === houseRulesFromFile.trim() ? 'Use the standard rules' : "Use the file's house rules"}
            </SecondaryButton>
            <SecondaryButton
              onClick={() => {
                setPendingRules(null)
                setImportMessage((m) => m && { ...m, text: `${m.text} House rules kept as they were.` })
              }}
            >
              {pendingRules.trim() === houseRulesFromFile.trim() ? 'Keep my edited rules' : 'Keep the current ones'}
            </SecondaryButton>
          </span>
        </Notice>
      )}

      {show && errorList.length > 0 && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="rounded-md border-2 border-fail bg-fail-tint p-4"
          data-testid="error-summary"
        >
          <h2 className="text-lg text-fail">
            <span aria-hidden="true">✗ </span>
            {errorList.length} {errorList.length === 1 ? 'thing needs' : 'things need'} fixing before you continue
          </h2>
          <ul className="mt-2 list-disc pl-6">
            {errorList.map(([key, message]) => (
              <li key={key}>
                <a href={`#${idFor(key)}`}>{message}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <HouseRules houseRules={houseRules} houseRulesFromFile={houseRulesFromFile} setHouseRules={setHouseRules} />

      {/* B1 */}
      <Card>
        <h2 className="mb-4 text-xl">B1. Module and outcomes</h2>
        <div className="space-y-5">
          <div>
            <Help topic="moduleName">
              <label htmlFor="moduleName" className={labelClass}>Module name and code</label>
            </Help>
            <input
              {...errProps(errors, 'moduleName', show)}
              className={inputClass}
              value={spec.moduleName}
              onChange={(e) => update({ moduleName: e.target.value })}
            />
            <FieldError id="moduleName-error" message={err('moduleName')} />
          </div>

          <div>
            <Help topic="studyLevel">
              <label htmlFor="studyLevel" className={labelClass}>Level of study</label>
            </Help>
            <p className={hintClass} id="studyLevel-hint">Fills the default distribution.</p>
            <select
              {...errProps(errors, 'studyLevel', show)}
              className={`${inputClass} sm:w-64`}
              value={spec.studyLevel}
              onChange={(e) => setStudyLevel(e.target.value)}
            >
              <option value="">Choose…</option>
              {STUDY_LEVELS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <FieldError id="studyLevel-error" message={err('studyLevel')} />
          </div>

          <fieldset>
            <legend className={labelClass}>Learning outcomes</legend>
            <HintWithHelp topic="outcomes">At least one. Give each the Bloom's level it targets.</HintWithHelp>
            <FieldError id="outcomes-error" message={err('outcomes')} />
            <div className="space-y-3">
              {spec.outcomes.map((o, i) => (
                <div key={i} className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
                  <div className="w-full">
                    <label htmlFor={idFor(`outcomes.${i}.text`)} className="text-sm text-muted">
                      Outcome {i + 1} (LO{i + 1})
                    </label>
                    <input
                      {...errProps(errors, `outcomes.${i}.text`, show)}
                      className={inputClass}
                      value={o.text}
                      onChange={(e) => updateRow('outcomes', i, { text: e.target.value })}
                    />
                    <FieldError id={`outcomes-${i}-text-error`} message={err(`outcomes.${i}.text`)} />
                  </div>
                  <div className="sm:w-44">
                    <label htmlFor={idFor(`outcomes.${i}.level`)} className="text-sm text-muted">
                      Target level
                    </label>
                    <select
                      {...errProps(errors, `outcomes.${i}.level`, show)}
                      className={inputClass}
                      value={o.level}
                      onChange={(e) => updateRow('outcomes', i, { level: e.target.value })}
                    >
                      <option value="">Choose…</option>
                      {LEVELS.map((l) => (
                        <option key={l}>{l}</option>
                      ))}
                    </select>
                    <FieldError id={`outcomes-${i}-level-error`} message={err(`outcomes.${i}.level`)} />
                  </div>
                  <RemoveButton
                    label={`Remove outcome ${i + 1}`}
                    disabled={spec.outcomes.length <= 1}
                    onClick={() => removeRow('outcomes', i)}
                  />
                </div>
              ))}
            </div>
            <LinkButton className="mt-3" onClick={() => addRow('outcomes', { text: '', level: '' })}>
              + Add an outcome
            </LinkButton>
          </fieldset>
        </div>
      </Card>

      {/* B2 */}
      <Card>
        <h2 className="mb-4 text-xl">B2. What was taught</h2>
        <fieldset>
          <legend className={labelClass}>Cases and examples used in teaching</legend>
          <HintWithHelp topic="cases">
            The worked examples and case studies students have already seen. Apply, Analyse and Evaluate questions will use
            new ones instead. At least one.
          </HintWithHelp>
          <FieldError id="cases-error" message={err('cases')} />
          <div className="space-y-3">
            {spec.cases.map((c, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-full">
                  <label htmlFor={idFor(`cases.${i}`)} className="sr-only">Case or example {i + 1}</label>
                  <input
                    {...errProps(errors, `cases.${i}`, show)}
                    className={inputClass}
                    placeholder={`Case or example ${i + 1}`}
                    value={c}
                    onChange={(e) => updateRow('cases', i, e.target.value)}
                  />
                  <FieldError id={`cases-${i}-error`} message={err(`cases.${i}`)} />
                </div>
                <RemoveButton
                  label={`Remove case ${i + 1}`}
                  disabled={spec.cases.length <= 1}
                  onClick={() => removeRow('cases', i)}
                />
              </div>
            ))}
          </div>
          <LinkButton className="mt-3" onClick={() => addRow('cases', '')}>
            + Add a case or example
          </LinkButton>
        </fieldset>
      </Card>

      {/* B3 */}
      <Card>
        <h2 className="mb-4 text-xl">B3. What students get wrong</h2>
        <fieldset>
          <legend className={labelClass}>Misconceptions</legend>
          <HintWithHelp topic="misconceptions">
            Wrong answers are built from these. At least two. Think of the errors you correct every year in marking.
          </HintWithHelp>
          <FieldError id="misconceptions-error" message={err('misconceptions')} />
          <div className="space-y-3">
            {spec.misconceptions.map((m, i) => (
              <div key={i} className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
                <div className="w-full">
                  <label htmlFor={idFor(`misconceptions.${i}.text`)} className="text-sm text-muted">
                    Misconception {i + 1}
                  </label>
                  <input
                    {...errProps(errors, `misconceptions.${i}.text`, show)}
                    className={inputClass}
                    value={m.text}
                    onChange={(e) => updateRow('misconceptions', i, { text: e.target.value })}
                  />
                  <FieldError id={`misconceptions-${i}-text-error`} message={err(`misconceptions.${i}.text`)} />
                </div>
                <RemoveButton
                  label={`Remove misconception ${i + 1}`}
                  disabled={spec.misconceptions.length <= 2}
                  onClick={() => removeRow('misconceptions', i)}
                />
              </div>
            ))}
          </div>
          <LinkButton className="mt-3" onClick={() => addRow('misconceptions', { text: '' })}>
            + Add a misconception
          </LinkButton>
        </fieldset>
      </Card>

      {/* B4 */}
      <Card>
        <h2 className="mb-4 text-xl">B4. Number of questions and distribution</h2>
        <div className="space-y-5">
          <div>
            <Help topic="questionCount">
              <label htmlFor="questionCount" className={labelClass}>Number of questions</label>
            </Help>
            <select
              {...errProps(errors, 'questionCount', show)}
              className={`${inputClass} sm:w-40`}
              value={spec.questionCount}
              onChange={(e) => setQuestionCount(e.target.value)}
            >
              <option value="">Choose…</option>
              {QUESTION_COUNTS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <FieldError id="questionCount-error" message={err('questionCount')} />
          </div>

          <fieldset>
            <legend className={labelClass}>Distribution across levels</legend>
            <HintWithHelp topic="distribution">
              {spec.studyLevel && spec.questionCount
                ? `Pre-filled with the default for ${spec.studyLevel}. Must total ${spec.questionCount}.`
                : 'Choose a level of study and number of questions to fill in the default.'}
            </HintWithHelp>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5" id="distribution" tabIndex={-1}>
              {LEVELS.map((level) => (
                <div key={level}>
                  <label htmlFor={`dist-${level}`} className="mb-1 block">
                    <LevelBlock level={level} />
                  </label>
                  <input
                    id={`dist-${level}`}
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    aria-invalid={err('distribution') ? 'true' : undefined}
                    aria-describedby={err('distribution') ? 'distribution-error' : undefined}
                    className={inputClass}
                    value={spec.distribution[level]}
                    onChange={(e) =>
                      update({
                        distribution: {
                          ...spec.distribution,
                          [level]: e.target.value === '' ? '' : Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 text-sm" data-testid="distribution-total">
              Total: <strong>{total}</strong>
              {spec.questionCount ? ` of ${spec.questionCount}` : ''}
              {spec.questionCount && (
                <>
                  {' '}
                  <StatusWord ok={total === Number(spec.questionCount)} />
                </>
              )}
            </p>
            <FieldError id="distribution-error" message={err('distribution')} />

            {changed && (
              <div className="mt-4">
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor="distributionReason" className={labelClass}>
                    Why have you changed the default?
                  </label>
                  <LinkButton
                    className="text-sm"
                    onClick={() =>
                      update({
                        distribution: defaultDistribution(spec.studyLevel, Number(spec.questionCount)),
                        distributionReason: '',
                      })
                    }
                  >
                    Reset to default
                  </LinkButton>
                </div>
                <textarea
                  {...errProps(errors, 'distributionReason', show)}
                  rows={2}
                  className={inputClass}
                  value={spec.distributionReason}
                  onChange={(e) => update({ distributionReason: e.target.value })}
                />
                <FieldError id="distributionReason-error" message={err('distributionReason')} />
              </div>
            )}
          </fieldset>
        </div>
      </Card>

      {/* B5 */}
      <Card>
        <h2 className="mb-4 text-xl">B5. Timing and weight</h2>
        <div className="space-y-5">
          <div>
            <Help topic="timeAvailable">
              <label htmlFor="timeAvailable" className={labelClass}>Time available (minutes)</label>
            </Help>
            <div className="flex flex-wrap items-center gap-4">
              <input
                {...errProps(errors, 'timeAvailable', show)}
                type="number"
                min="1"
                className={`${inputClass} w-32`}
                value={spec.timeAvailable}
                onChange={(e) => update({ timeAvailable: e.target.value })}
              />
              <p className="text-sm" aria-live="polite" data-testid="time-estimate">
                {total > 0 ? (
                  <>
                    Estimated paper length: <strong>{estimate.min}–{estimate.max} min</strong>{' '}
                    {fit === 'fits' && <span className="text-pass"><span aria-hidden="true">✓ </span>fits</span>}
                    {fit === 'tight' && (
                      <span className="text-warn"><span aria-hidden="true">! </span>fits only if students work fast</span>
                    )}
                    {fit === 'over' && (
                      <span className="text-fail"><span aria-hidden="true">✗ </span>doesn't fit</span>
                    )}
                  </>
                ) : (
                  <span className="text-muted">The estimate appears once the distribution is filled in.</span>
                )}
              </p>
            </div>
            <FieldError id="timeAvailable-error" message={err('timeAvailable')} />
          </div>

          <div>
            <Help topic="gradeShare">
              <label htmlFor="gradeShare" className={labelClass}>Share of module grade (%)</label>
            </Help>
            <input
              {...errProps(errors, 'gradeShare', show)}
              type="number"
              min="0"
              max="100"
              className={`${inputClass} w-32`}
              value={spec.gradeShare}
              onChange={(e) => update({ gradeShare: e.target.value })}
            />
            <FieldError id="gradeShare-error" message={err('gradeShare')} />
            {weightWarning(spec) && (
              <Notice tone="warn" className="mt-3">
                This puts {spec.gradeShare}% of the module grade on multiple choice. The house rules flag anything above{' '}
                {WEIGHT_LIMIT}%: multiple choice should never be the only assessment in a module.
              </Notice>
            )}
          </div>
        </div>
      </Card>

      {/* B6 */}
      <Card>
        <h2 className="mb-4 text-xl">B6. Output</h2>
        <fieldset>
          <legend className={labelClass}>Export formats</legend>
          <HintWithHelp topic="exportFormats">Which files you want at the end. You can change this when you export.</HintWithHelp>
          <div className="flex flex-wrap gap-6" id="exportFormats" tabIndex={-1}>
            {EXPORT_FORMATS.map((f) => (
              <label key={f} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-field"
                  checked={spec.exportFormats.includes(f)}
                  onChange={(e) =>
                    update({
                      exportFormats: e.target.checked
                        ? EXPORT_FORMATS.filter((x) => x === f || spec.exportFormats.includes(x))
                        : spec.exportFormats.filter((x) => x !== f),
                    })
                  }
                />
                {f}
              </label>
            ))}
          </div>
          <FieldError id="exportFormats-error" message={err('exportFormats')} />
        </fieldset>
      </Card>

      <ScreenFooter primary={<PrimaryButton onClick={handleNext}>Continue to Content →</PrimaryButton>} />
    </div>
  )
}

// A hint line under a legend, with a "?" beside it. (A legend has to stay the fieldset's first child,
// so the help button goes on the hint line instead.)
function HintWithHelp({ topic, children }) {
  const [button, panel] = useHelp(topic)
  return (
    <div className="mb-2">
      <div className="flex items-start gap-2">
        <p className="text-sm text-muted">{children}</p>
        {button}
      </div>
      {panel}
    </div>
  )
}

function StatusWord({ ok }) {
  return ok ? (
    <span className="text-pass"><span aria-hidden="true">✓ </span>correct</span>
  ) : (
    <span className="text-fail"><span aria-hidden="true">✗ </span>doesn't match</span>
  )
}

function RemoveButton({ label, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="mt-6 shrink-0 rounded-md border border-line px-3 py-2 text-muted hover:border-fail hover:text-fail disabled:opacity-40"
      {...props}
    >
      <span aria-hidden="true">✕</span>
    </button>
  )
}

function HouseRules({ houseRules, houseRulesFromFile, setHouseRules }) {
  const [mode, setMode] = useState('view') // view | confirm | edit
  const edited = houseRules !== houseRulesFromFile
  const [helpButton, helpPanel] = useHelp('houseRules')

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xl">
            Part A: House rules{' '}
            <span className="text-base text-muted">{edited ? '(edited for this set)' : '(the same for every module)'}</span>
          </h2>
          {helpButton}
        </div>
        {mode === 'view' && <LinkButton onClick={() => setMode('confirm')}>Edit house rules</LinkButton>}
      </div>
      {helpPanel}

      {mode === 'confirm' && (
        <div className="mb-4 space-y-3">
          <Notice tone="warn">Only change a rule if you can say why.</Notice>
          <div className="flex gap-2">
            <SecondaryButton onClick={() => setMode('edit')}>Edit anyway</SecondaryButton>
            <SecondaryButton onClick={() => setMode('view')}>Cancel</SecondaryButton>
          </div>
        </div>
      )}

      {mode === 'edit' ? (
        <div className="space-y-3">
          <label htmlFor="houseRulesText" className="block font-medium">House rules (Markdown)</label>
          <textarea
            id="houseRulesText"
            rows={16}
            className={`${inputClass} font-mono text-sm`}
            value={houseRules}
            onChange={(e) => setHouseRules(e.target.value)}
          />
          <div className="flex gap-2">
            <SecondaryButton onClick={() => setMode('view')}>Done</SecondaryButton>
            <SecondaryButton disabled={!edited} onClick={() => setHouseRules(houseRulesFromFile)}>
              Restore the original
            </SecondaryButton>
          </div>
        </div>
      ) : (
        <details>
          <summary className="cursor-pointer text-field">Show the house rules</summary>
          <div
            className="prose-rules mt-3 max-h-[28rem] overflow-y-auto rounded-md border border-line bg-cream p-4"
            data-testid="house-rules"
            dangerouslySetInnerHTML={{ __html: marked.parse(houseRules) }}
          />
        </details>
      )}
    </Card>
  )
}
