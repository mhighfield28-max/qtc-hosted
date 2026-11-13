import { useState } from 'react'
import { redeemCode } from '../lib/hosted.js'
import { Notice, PrimaryButton } from './ui.jsx'

// Enter a code (a beta code now; a Payhip purchase key later) to add questions to the account.
export default function RedeemPanel({ onRedeemed, autoFocus = false, id = 'redeemCode' }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null) // { tone, text }

  const submit = async (event) => {
    event.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    setMessage(null)
    try {
      const account = await redeemCode(code)
      setCode('')
      setMessage({ tone: 'pass', text: `Code accepted. You now have ${account.questions} questions.` })
      onRedeemed?.(account)
    } catch (error) {
      setMessage({ tone: 'fail', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor={id} className="block font-medium">
        Your code
      </label>
      <div className="flex flex-wrap gap-3">
        <input
          id={id}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="QTC-XXXX-XXXX"
          autoComplete="off"
          autoFocus={autoFocus}
          className="min-w-0 flex-1 rounded-md border border-muted bg-card px-3 py-2 font-mono uppercase tracking-wide"
        />
        <PrimaryButton type="submit" disabled={busy || !code.trim()}>
          {busy ? 'Checking…' : 'Redeem'}
        </PrimaryButton>
      </div>
      {message && (
        <Notice tone={message.tone} title={message.tone === 'pass' ? 'Done' : "That didn't work"}>
          {message.text}
        </Notice>
      )}
    </form>
  )
}
