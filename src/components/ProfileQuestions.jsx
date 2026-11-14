import { useState } from 'react'
import { saveProfile } from '../lib/hosted.js'
import { LinkButton, Notice, SecondaryButton, inputClass } from './ui.jsx'

// Three optional questions, asked once, so the packs can be sized from real answers.
// Saving or skipping records it on the account, so it isn't asked again.
const PAPERS = [
  ['1-2', '1 or 2'],
  ['3-5', '3 to 5'],
  ['6-10', '6 to 10'],
  ['10+', 'More than 10'],
]

export default function ProfileQuestions({ onSaved, idPrefix = 'profile' }) {
  const [papers, setPapers] = useState('')
  const [country, setCountry] = useState('')
  const [subject, setSubject] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const send = async (answers) => {
    setBusy(true)
    setError(null)
    try {
      onSaved(await saveProfile(answers))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const id = (name) => `${idPrefix}-${name}`
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        send({ papersPerYear: papers, country, subject })
      }}
      className="space-y-4"
      data-testid="profile-questions"
    >
      <fieldset>
        <legend className="mb-2 font-medium">
          Roughly how many multiple choice papers or quizzes do you write a year?
        </legend>
        <div className="flex flex-wrap gap-2">
          {PAPERS.map(([value, label]) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 ${
                papers === value ? 'border-field bg-field-tint' : 'border-line'
              }`}
            >
              <input
                type="radio"
                name={id('papers')}
                value={value}
                checked={papers === value}
                onChange={() => setPapers(value)}
                className="h-4 w-4 accent-field"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={id('country')} className="mb-1 block font-medium">Country</label>
          <input id={id('country')} className={inputClass} value={country} maxLength={60} onChange={(e) => setCountry(e.target.value)} />
        </div>
        <div>
          <label htmlFor={id('subject')} className="mb-1 block font-medium">Subject you teach</label>
          <input id={id('subject')} className={inputClass} value={subject} maxLength={80} onChange={(e) => setSubject(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <SecondaryButton type="submit" disabled={busy || (!papers && !country.trim() && !subject.trim())}>
          {busy ? 'Saving…' : 'Save answers'}
        </SecondaryButton>
        <LinkButton onClick={() => send({ skip: true })} disabled={busy}>
          Skip
        </LinkButton>
      </div>
      {error && (
        <Notice tone="fail" title="That didn't save">
          {error}
        </Notice>
      )}
    </form>
  )
}
