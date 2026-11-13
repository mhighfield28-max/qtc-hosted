export const STEPS = ['Set up', 'Content', 'Generate', 'Review', 'Export']

// A step can be opened if it's earlier than the current one, or every step before it is complete.
export function canOpen(index, current, complete) {
  if (index <= current) return true
  return complete.slice(0, index).every(Boolean)
}

export default function StepBar({ current, complete, onGo, account, hideSteps = false }) {
  return (
    <header className="sticky top-0 z-10 bg-ink text-on-ink shadow-md">
      <div className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 pt-3">
        <p className="font-heading text-lg">Questions That Count</p>
        {account && <AccountBar {...account} />}
      </div>
      <nav aria-label="Steps" className="mx-auto max-w-[960px] px-4 pb-3 pt-2" hidden={hideSteps}>
        <ol className="flex flex-wrap gap-2">
          {STEPS.map((name, i) => {
            const isCurrent = i === current
            const enabled = canOpen(i, current, complete)
            const done = complete[i] && !isCurrent
            return (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => onGo(i)}
                  disabled={!enabled}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${
                    isCurrent
                      ? 'bg-spark font-semibold text-on-spark'
                      : enabled
                        ? 'text-on-ink hover:bg-field'
                        : 'text-on-ink-muted opacity-70'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs ${
                      isCurrent ? 'border-on-spark' : 'border-on-ink-muted'
                    }`}
                  >
                    {done ? '✓' : i + 1}
                  </span>
                  <span>
                    <span className="sr-only">Step {i + 1}: </span>
                    {name}
                    {done && <span className="sr-only"> (complete)</span>}
                    {!enabled && <span className="sr-only"> (finish the earlier steps first)</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>
    </header>
  )
}

// Hosted mode only: who is signed in, questions left, Redeem a code, Admin (owner only) and Sign out.
function AccountBar({ email, questions, isAdmin, onRedeem, onAdmin, onSignOut }) {
  const link = 'rounded-full px-3 py-1 underline hover:bg-field'
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {email && <span className="text-on-ink-muted">{email}</span>}
      {typeof questions === 'number' && (
        <span data-testid="credits" className="rounded-full border border-on-ink-muted px-3 py-0.5">
          {questions.toLocaleString('en-GB')} {questions === 1 ? 'question' : 'questions'} left
        </span>
      )}
      {onRedeem && (
        <button type="button" onClick={onRedeem} className={link}>
          Redeem a code
        </button>
      )}
      {isAdmin && (
        <button type="button" onClick={onAdmin} className={link}>
          Admin
        </button>
      )}
      <button type="button" onClick={onSignOut} className={link}>
        Sign out
      </button>
    </div>
  )
}
