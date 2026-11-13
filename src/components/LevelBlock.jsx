// Bloom's level blocks: a cream card with a coloured left stripe, like the promo video.
// The level is always written in words, so the colour is extra, never the only signal.
// Colours come from theme.css (--color-remember … --color-evaluate).

const STRIPE = {
  Remember: 'border-l-remember',
  Understand: 'border-l-understand',
  Apply: 'border-l-apply',
  Analyse: 'border-l-analyse',
  Evaluate: 'border-l-evaluate',
}

export const stripeClass = (level) => STRIPE[level] ?? 'border-l-muted'

// A small block: "Q3 · Apply", or just "Apply" when there's no question number.
export function LevelBlock({ level, number, children, className = '', ...props }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border border-line border-l-4 bg-cream px-2 py-0.5 text-sm font-medium text-text ${stripeClass(level)} ${className}`}
      data-level={level}
      {...props}
    >
      {number != null && (
        <>
          <span className="tabular-nums">Q{number}</span>{' '}
          <span aria-hidden="true" className="text-muted">·</span>{' '}
        </>
      )}
      {level || 'No level'}
      {children && <> {children}</>}
    </span>
  )
}
