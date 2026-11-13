import { useState } from 'react'
import { joinWaitlist } from '../lib/hosted.js'
import { Card, Notice, SecondaryButton } from '../components/ui.jsx'
import RedeemPanel from '../components/RedeemPanel.jsx'

// Shown to a signed-in user who doesn't have access yet (the private beta).
export default function AccessScreen({ account, onAccount }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const join = async () => {
    setBusy(true)
    setError(null)
    try {
      onAccount(await joinWaitlist())
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 tabIndex={-1} className="text-3xl">Welcome to Questions That Count</h1>
        <p className="text-muted">We're in a private beta while we make sure every question set is right.</p>
      </div>

      <Card>
        <h2 className="mb-2 text-xl">Have an invite code?</h2>
        <p className="mb-4 text-muted">Enter it here to unlock your questions.</p>
        <RedeemPanel id="accessCode" autoFocus onRedeemed={onAccount} />
      </Card>

      <Card>
        <h2 className="mb-2 text-xl">No code yet?</h2>
        {account.waitlisted ? (
          <Notice tone="pass" title="You're on the waiting list">
            We'll email {account.email} as soon as a place opens.
          </Notice>
        ) : (
          <>
            <p className="mb-4 text-muted">
              Join the waiting list and we'll email {account.email} as soon as a place opens.
            </p>
            <SecondaryButton onClick={join} disabled={busy}>
              {busy ? 'Adding you…' : 'Join the waiting list'}
            </SecondaryButton>
          </>
        )}
        {error && (
          <Notice tone="fail" title="That didn't work" className="mt-3">
            {error}
          </Notice>
        )}
      </Card>
    </div>
  )
}
