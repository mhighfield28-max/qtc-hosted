import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Authenticator } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import './index.css'
import App from './App.jsx'
import { HOSTED } from './lib/hosted.js'
import hostedSettings from '../config/hosted.json'

// Shown above the sign-in and sign-up forms.
function SignInHeader() {
  return (
    <div className="px-6 pb-2 pt-8 text-center">
      <p className="font-heading text-2xl text-ink">Questions That Count</p>
      <p className="mt-2 text-muted">Bloom's-aligned multiple choice questions, written from your own teaching.</p>
      {hostedSettings.trialCredits > 0 && (
        <p className="mt-1 text-sm text-muted">
          New accounts get {hostedSettings.trialCredits} free question {hostedSettings.trialCredits === 1 ? 'set' : 'sets'}.
        </p>
      )}
    </div>
  )
}

// Hosted mode: nothing shows until the user signs in. On a laptop with no backend, straight in.
function Root() {
  if (!HOSTED) return <App />
  return (
    <Authenticator loginMechanisms={['email']} components={{ Header: SignInHeader }}>
      {({ signOut, user }) => <App user={user} signOut={signOut} />}
    </Authenticator>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
