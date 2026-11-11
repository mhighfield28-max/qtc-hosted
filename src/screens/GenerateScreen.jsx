import { LEVELS, SECONDS_PER_QUESTION, WEIGHT_LIMIT, estimateMinutes, timeFit } from '../lib/distribution.js'
import { weightWarning } from '../lib/specification.js'
import { MAX_CONTENT_BYTES, contentSize } from '../lib/generation.js'
import { formatSize } from '../lib/extract.js'
import { Card, Notice, PrimaryButton, ScreenFooter, SecondaryButton } from '../components/ui.jsx'

export default function GenerateScreen({ spec, files, questions, run, credits, onGenerate, onStop, onBack, onNext }) {
  const estimate = estimateMinutes(spec.distribution)
  const fit = timeFit(spec.distribution, spec.timeAvailable)
  const readFiles = files.filter((f) => f.status === 'ok')
  const size = contentSize(readFiles.map((f) => ({ name: f.name, text: f.text })))
  const tooBig = size > MAX_CONTENT_BYTES

  const total = run.total ?? Number(spec.questionCount)
  const written = questions.filter((q) => !q.flagged).length
  const flagged = questions.filter((q) => q.flagged).length
  const running = run.status === 'running'
  const finished = questions.length > 0 && !running
  const unfinished = finished && questions.length < total

  return (
    <div className="space-y-6">
      <div>
        <h1 tabIndex={-1} className="text-3xl">Generate</h1>
        <p className="text-muted">Check what will be asked for, then generate.</p>
      </div>

      <Card>
        <h2 className="mb-4 text-xl">What will be asked for</h2>
        <p className="mb-4">
          <strong>{spec.questionCount} questions</strong> for <strong>{spec.moduleName}</strong>, written from{' '}
          {readFiles.length} {readFiles.length === 1 ? 'source' : 'sources'} ({formatSize(size)} of text).
        </p>
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Questions per level and estimated time</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pr-4 font-medium">Level</th>
              <th scope="col" className="py-2 pr-4 font-medium">Questions</th>
              <th scope="col" className="py-2 font-medium">Seconds each</th>
            </tr>
          </thead>
          <tbody>
            {LEVELS.map((l) => (
              <tr key={l} className="border-b border-line">
                <th scope="row" className="py-2 pr-4 font-normal">{l}</th>
                <td className="py-2 pr-4">{spec.distribution[l]}</td>
                <td className="py-2 text-muted">{SECONDS_PER_QUESTION[l].join('–')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4">
          Estimated time <strong>{estimate.min}–{estimate.max} min</strong> against{' '}
          <strong>{spec.timeAvailable} min</strong> available.
        </p>

        <div className="mt-4 space-y-3">
          {typeof credits === 'number' && credits > 0 && (
            <Notice title="Credits">
              A new set uses 1 of your {credits} question {credits === 1 ? 'set' : 'sets'}. You're only charged once the
              first question comes back, and regenerating questions in this set is included.
            </Notice>
          )}
          {credits === 0 && (
            <Notice tone="warn" title="No question sets left">
              You can still finish and regenerate a set you've already started, but a new set needs more credits.
            </Notice>
          )}
          {fit === 'over' && (
            <Notice tone="warn" title="Time doesn't fit">
              Even at the fast end the paper needs {estimate.min} minutes, more than the {spec.timeAvailable} available.
              Reduce the higher-order questions or allow more time.
            </Notice>
          )}
          {fit === 'tight' && (
            <Notice tone="warn" title="Time is tight">
              The paper only fits if students work at the fast end ({estimate.min}–{estimate.max} min against{' '}
              {spec.timeAvailable}).
            </Notice>
          )}
          {weightWarning(spec) && (
            <Notice tone="warn" title="Weight above 30%">
              Multiple choice carries {spec.gradeShare}% of the module grade. The house rules flag anything above{' '}
              {WEIGHT_LIMIT}%.
            </Notice>
          )}
          {tooBig && (
            <Notice tone="fail" title="Too much content">
              The teaching content is {formatSize(size)}; the limit is {formatSize(MAX_CONTENT_BYTES)}. Go back and remove
              some files.
            </Notice>
          )}
        </div>
      </Card>

      {(running || questions.length > 0 || run.status === 'error') && (
        <Card>
          <h2 className="mb-2 text-xl">Progress</h2>
          <p aria-live="polite" data-testid="generate-progress">
            {running && `Writing questions… ${questions.length} of ${total} done.`}
            {run.status === 'done' && `Done: ${written} of ${total} questions written.`}
            {run.status === 'stopped' && `Stopped: ${questions.length} of ${total} questions done.`}
            {run.status === 'error' && `Stopped after ${questions.length} of ${total} questions.`}
            {flagged > 0 && ` ${flagged} flagged.`}
          </p>
          <progress
            className="mt-3 h-2 w-full accent-field"
            max={total}
            value={questions.length}
            aria-label="Generation progress"
          />
          {run.status === 'error' && (
            <Notice tone="fail" title="Generation stopped" className="mt-3">
              {run.error}
            </Notice>
          )}
          {questions.length > 0 && (
            <ol className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4" data-testid="question-status-list">
              {questions.map((q) => (
                <li key={q.id}>
                  {q.flagged ? (
                    <span className="text-fail"><span aria-hidden="true">✗ </span>Q{Number(q.id.slice(1))} flagged</span>
                  ) : (
                    <span className="text-pass"><span aria-hidden="true">✓ </span>Q{Number(q.id.slice(1))} {q.level}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      <ScreenFooter
        onBack={running ? undefined : onBack}
        primary={
          running ? (
            <div className="flex items-center gap-3">
              <SecondaryButton onClick={onStop}>Stop</SecondaryButton>
              <PrimaryButton disabled>Generating…</PrimaryButton>
            </div>
          ) : finished ? (
            <div className="flex flex-wrap justify-end gap-3">
              <SecondaryButton onClick={() => onGenerate({ fresh: true })}>Start again</SecondaryButton>
              {unfinished && (
                <SecondaryButton onClick={() => onGenerate({ fresh: false })}>
                  {run.status === 'error' ? 'Try again: write' : 'Write'} the remaining {total - questions.length}
                </SecondaryButton>
              )}
              <PrimaryButton onClick={onNext}>Continue to Review →</PrimaryButton>
            </div>
          ) : (
            <PrimaryButton onClick={() => onGenerate({ fresh: run.status !== 'error' })} disabled={tooBig}>
              {run.status === 'error' ? 'Try again' : 'Generate'}
            </PrimaryButton>
          )
        }
      />
    </div>
  )
}
