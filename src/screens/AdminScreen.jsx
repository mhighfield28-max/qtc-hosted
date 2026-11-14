import { useCallback, useEffect, useState } from 'react'
import { fetchCodes, fetchUsage, makeCodes } from '../lib/hosted.js'
import { Card, Notice, PrimaryButton, SecondaryButton } from '../components/ui.jsx'

// The owner's page: who's using the beta, what it really costs, the waiting list and beta codes.
// Opened at #admin; only the emails in ADMIN_EMAILS get data back.

const money = (n) => (n == null ? '–' : `$${n.toFixed(n < 1 ? 3 : 2)}`)
const date = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '–')

async function copy(text, setNote) {
  try {
    await navigator.clipboard.writeText(text)
    setNote('Copied.')
  } catch {
    setNote('Copy failed: select the text and copy it instead.')
  }
}

export default function AdminScreen({ onClose }) {
  const [usage, setUsage] = useState(null)
  const [codes, setCodes] = useState([])
  const [error, setError] = useState(null)
  const [count, setCount] = useState(5)
  const [fresh, setFresh] = useState([])
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    setError(null)
    try {
      const [u, c] = await Promise.all([fetchUsage(), fetchCodes()])
      setUsage(u)
      setCodes(c.codes)
    } catch (e) {
      setError(e.message)
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const create = async () => {
    setError(null)
    try {
      const { codes: made } = await makeCodes(count)
      setFresh(made.map((c) => c.code))
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  const t = usage?.totals
  const tiles = t
    ? [
        ['Testers with access', t.users],
        ['On the waiting list', t.waitlisted],
        ['Sets started', t.sets],
        ['Questions written', t.questionsCharged],
        ['Real cost so far', money(t.cost)],
        ['Cost per question', money(t.costPerQuestion)],
      ]
    : []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 tabIndex={-1} className="text-3xl">Admin</h1>
          <p className="text-muted">Beta usage, real costs, the waiting list and invite codes. Only you can see this page.</p>
        </div>
        <div className="flex gap-3">
          <SecondaryButton onClick={load}>Refresh</SecondaryButton>
          <SecondaryButton onClick={onClose}>Back to the app</SecondaryButton>
        </div>
      </div>

      {error && <Notice tone="fail" title="Couldn't load">{error}</Notice>}

      {t && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tiles.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-line bg-card p-4">
              <p className="text-sm text-muted">{label}</p>
              <p className="font-heading text-2xl tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      )}

      <Card>
        <h2 className="mb-1 text-xl">Testers</h2>
        <p className="mb-4 text-sm text-muted">
          Questions written counts each question once; regenerations are the extra writes. Cost is the real Claude cost from
          the tokens used, at the prices in config/prices.json.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm tabular-nums">
            <thead>
              <tr className="border-b border-line">
                {['Email', 'Access', 'Questions left', 'Sets', 'Questions written', 'Regenerations', 'Cost', 'Per question', 'Last active', 'Papers a year', 'Country', 'Subject'].map((h) => (
                  <th key={h} scope="col" className="whitespace-nowrap py-2 pr-4 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(usage?.users ?? []).map((u) => (
                <tr key={u.email} className="border-b border-line">
                  <td className="py-2 pr-4">{u.email}</td>
                  <td className="py-2 pr-4">{u.access ? 'Yes' : u.waitlisted ? 'Waiting' : 'No'}</td>
                  <td className="py-2 pr-4">{u.questionsLeft}</td>
                  <td className="py-2 pr-4">{u.sets}</td>
                  <td className="py-2 pr-4">{u.questionsCharged}</td>
                  <td className="py-2 pr-4">{u.regenerations}</td>
                  <td className="py-2 pr-4">{money(u.cost)}</td>
                  <td className="py-2 pr-4">{money(u.costPerQuestion)}</td>
                  <td className="py-2 pr-4">{date(u.lastActive)}</td>
                  <td className="py-2 pr-4">{u.papersPerYear || '–'}</td>
                  <td className="py-2 pr-4">{u.country || '–'}</td>
                  <td className="py-2 pr-4">{u.subject || '–'}</td>
                </tr>
              ))}
              {usage && !usage.users.length && (
                <tr>
                  <td colSpan={12} className="py-3 text-muted">No one has signed in yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-xl">Waiting list</h2>
        {usage?.waitlist.length ? (
          <>
            <ul className="mb-4 space-y-1">
              {usage.waitlist.map((w) => (
                <li key={w.email}>
                  {w.email} <span className="text-sm text-muted">since {date(w.since)}</span>
                  {(w.papersPerYear || w.country || w.subject) && (
                    <span className="text-sm text-muted">
                      {' · '}
                      {[w.papersPerYear && `${w.papersPerYear} papers a year`, w.country, w.subject].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <SecondaryButton onClick={() => copy(usage.waitlist.map((w) => w.email).join(', '), setNote)}>
              Copy all emails
            </SecondaryButton>
          </>
        ) : (
          <p className="text-muted">No one is waiting.</p>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 text-xl">Invite codes and pack purchases</h2>
        <p className="mb-4 text-sm text-muted">
          Each invite code works once and adds {codes.find((c) => c.kind === 'beta')?.questions ?? 200} questions. Send one to
          each tester. Payhip pack keys appear here once they've been redeemed, with the last four characters of the key.
        </p>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="codeCount" className="block font-medium">How many</label>
            <input
              id="codeCount"
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="w-24 rounded-md border border-muted bg-card px-3 py-2"
            />
          </div>
          <PrimaryButton onClick={create}>Make codes</PrimaryButton>
        </div>
        {fresh.length > 0 && (
          <div className="mb-4 space-y-2">
            <p className="font-medium">New codes</p>
            <pre className="whitespace-pre-wrap rounded-md bg-field-tint p-3 font-mono">{fresh.join('\n')}</pre>
            <SecondaryButton onClick={() => copy(fresh.join('\n'), setNote)}>Copy new codes</SecondaryButton>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                {['Code', 'Type', 'Questions', 'Made', 'Used'].map((h) => (
                  <th key={h} scope="col" className="py-2 pr-4 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.code} className="border-b border-line">
                  <td className="py-2 pr-4 font-mono">{c.code}</td>
                  <td className="py-2 pr-4">{c.kind === 'payhip' ? 'Pack purchase' : 'Invite'}</td>
                  <td className="py-2 pr-4">{c.questions}</td>
                  <td className="py-2 pr-4">{date(c.createdAt)}</td>
                  <td className="py-2 pr-4">{c.used ? `Yes, ${date(c.redeemedAt)}` : 'Not yet'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {note && <p role="status" className="mt-3 text-sm text-muted">{note}</p>}
      </Card>
    </div>
  )
}
