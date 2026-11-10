// Small shared building blocks. All colours come from theme.css via Tailwind classes.

export function Card({ children, className = '', ...props }) {
  return (
    <section className={`rounded-lg border border-line bg-card p-6 sm:p-8 ${className}`} {...props}>
      {children}
    </section>
  )
}

export function PrimaryButton({ children, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`rounded-md bg-spark px-5 py-2.5 font-semibold text-on-spark hover:brightness-95 disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({ children, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`rounded-md border border-field bg-card px-4 py-2 font-medium text-field hover:bg-field-tint disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function LinkButton({ children, className = '', ...props }) {
  return (
    <button type="button" className={`text-field underline hover:no-underline ${className}`} {...props}>
      {children}
    </button>
  )
}

// Bottom-of-screen navigation: Back on the left, the screen's one primary button bottom right.
export function ScreenFooter({ onBack, primary }) {
  return (
    <div className="mt-8 flex items-center justify-between gap-4">
      <div>{onBack && <SecondaryButton onClick={onBack}>← Back</SecondaryButton>}</div>
      <div>{primary}</div>
    </div>
  )
}

const ICONS = { pass: '✓', fail: '✗', warn: '!', info: 'i' }
const WORDS = { pass: 'Pass', fail: 'Fail', warn: 'Warning', info: 'Note' }
const TONES = {
  pass: 'bg-pass-tint text-pass border-pass',
  fail: 'bg-fail-tint text-fail border-fail',
  warn: 'bg-warn-tint text-warn border-warn',
  info: 'bg-field-tint text-field border-field',
}

// A message that never relies on colour alone: icon + word + text.
export function Notice({ tone = 'info', title, children, className = '' }) {
  return (
    <div role={tone === 'fail' ? 'alert' : 'status'} className={`flex gap-3 rounded-md border-l-4 p-3 ${TONES[tone]} ${className}`}>
      <span aria-hidden="true" className="font-bold">{ICONS[tone]}</span>
      <div>
        <span className="font-semibold">{title ?? WORDS[tone]}: </span>
        <span className="text-text">{children}</span>
      </div>
    </div>
  )
}

export function StatusIcon({ ok }) {
  return (
    <span className={ok ? 'text-pass' : 'text-fail'}>
      <span aria-hidden="true">{ok ? '✓ ' : '✗ '}</span>
      {ok ? 'Pass' : 'Fail'}
    </span>
  )
}

export function FieldError({ id, message }) {
  if (!message) return null
  return (
    <p id={id} className="mt-1 text-sm font-medium text-fail">
      <span aria-hidden="true">✗ </span>
      {message}
    </p>
  )
}

export const inputClass =
  'w-full rounded-md border border-muted bg-card px-3 py-2 text-text aria-[invalid=true]:border-2 aria-[invalid=true]:border-fail'
