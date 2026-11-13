import { LEVELS, SECONDS_PER_QUESTION, WEIGHT_LIMIT, estimateMinutes, timeFit } from '../lib/distribution.js'
import { weightWarning } from '../lib/specification.js'
import { MAX_WORDS, formatWords, totalWords } from '../lib/words.js'
import { Help } from '../components/Help.jsx'
import { LevelBlock } from '../components/LevelBlock.jsx'
import { Card, Notice, PrimaryButton, ScreenFooter, SecondaryButton } from '../components/ui.jsx'

export default function GenerateScreen({ spec, files, questions, run, credits, setStarted = false, onGenerate, onStop, onBack, onNext }) {
  const estimate = estimateMinutes(spec.distribution)
  const fit = timeFit(spec.distribution, spec.timeAvailable)
  const readFiles = files.filter((f) => f.status === 'ok')
  const words = totalWords(readFiles)
  const tooBig = words > MAX_WORDS

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
        <Help topic="generating" className="mb-4">
          <h2 className="text-xl">What will be asked for</h2>
        </Help>
        <p className="mb-4">
          <strong>{spec.questionCount} questions</strong> for <strong>{spec.moduleName}</strong>, written from{' '}
          {readFiles.length} {readFiles.length === 1 ? 'source' : 'sources'} ({formatWords(words)} words).
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
                <th scope="row" className="py-2 pr-4 font-normal">
                  <LevelBlock level={l} />
                </th>
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
          {typeof credits === 'number' && (
            <Help topic="counting">
              <p className="font-medium">Your questions: {credits.toLocaleString('en-GB')} left</p>
            </Help>
          )}
          {typeof credits === 'number' && !setStarted && credits >= Number(spec.questionCount) && (
            <Notice title="Questions">
              This set uses {spec.questionCount} of your {credits.toLocaleString('en-GB')} questions. Each question is counted
              once, when it's first written. Regenerating a question is included, and a question the AI can't write costs
              nothing.
            </Notice>
          )}
          {typeof credits === 'number' && !setStarted && credits > 0 && credits < Number(spec.questionCount) && (
            <Notice tone="warn" title="Not enough questions left">
              This set needs {spec.questionCount} questions and you have {credits} left. Writing will stop when you run out.
              Use Redeem a code at the top of the page to add more.
            </Notice>
          )}
          {typeof credits === 'number' && setStarted && (
            <Notice title="Questions">
              Questions already written in this set aren't counted again. You have {credits.toLocaleString('en-GB')} left for
              new ones.
            </Notice>
          )}
          {credits === 0 && !setStarted && (
            <Notice tone="warn" title="No questions left">
              Use Redeem a code at the top of the page to add more.
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
              The teaching content is {formatWords(words)} words; the limit for one set is {formatWords(MAX_WORDS)}. Go back
              and remove some material.
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
            <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="question-status-list">
              {questions.map((q) => (
                <li key={q.id}>
                  {q.flagged ? (
                    <LevelBlock level={q.level} number={Number(q.id.slice(1))}>
                      <span className="text-fail">
                        <span aria-hidden="true">✗ </span>flagged
                      </span>
                    </LevelBlock>
                  ) : (
                    <LevelBlock level={q.level} number={Number(q.id.slice(1))}>
                      <span aria-hidden="true" className="text-pass">✓</span>
                    </LevelBlock>
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

