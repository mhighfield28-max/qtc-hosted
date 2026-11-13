import { useId, useState } from 'react'
import HELP from '../content/helpText.js'

// "?" help: a small round button that opens a short explanation underneath, and closes it again.
// The words all live in src/content/helpText.js, so they can be edited in one place.
//
// Two ways to use it:
//   <Help topic="cases"><h2>…</h2></Help>          wraps a heading or label: button beside it, text below
//   const [button, panel] = useHelp('cases')       when the button and the text must go in different places

function Body({ body }) {
  return (body ?? []).map((part, i) =>
    typeof part === 'string' ? (
      <p key={i} className="mt-1.5 first:mt-0">{part}</p>
    ) : (
      <ul key={i} className="mt-1.5 list-disc space-y-0.5 pl-5">
        {part.list.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    ),
  )
}

export function useHelp(topic) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const help = HELP[topic]
  if (!help) throw new Error(`No help text for "${topic}" in helpText.js`)

  const button = (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={id}
      aria-label={`Help: ${help.title}`}
      title={open ? 'Hide help' : 'Help'}
      onClick={() => setOpen((o) => !o)}
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm font-semibold leading-none ${
        open ? 'border-field bg-field text-on-ink' : 'border-field bg-card text-field hover:bg-field-tint'
      }`}
      data-help={topic}
    >
      <span aria-hidden="true">?</span>
    </button>
  )

  const panel = (
    <div
      id={id}
      hidden={!open}
      role="note"
      className="mt-2 rounded-md border-l-4 border-field bg-field-tint p-3 text-sm font-normal text-text"
      data-testid={`help-${topic}`}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      <p className="font-semibold">{help.title}</p>
      <div className="mt-1">
        <Body body={help.body} />
      </div>
    </div>
  )

  return [button, panel]
}

export function Help({ topic, children, className = '' }) {
  const [button, panel] = useHelp(topic)
  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        {children}
        {button}
      </div>
      {panel}
    </div>
  )
}
