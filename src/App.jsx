import { useEffect, useMemo, useRef, useState } from 'react'
import houseRulesFile from '../docs/house-rules.md?raw'
import { MAX_WORDS, totalWords } from './lib/words.js'
import StepBar, { canOpen } from './components/StepBar.jsx'
import SetupScreen from './screens/SetupScreen.jsx'
import ContentScreen from './screens/ContentScreen.jsx'
import GenerateScreen from './screens/GenerateScreen.jsx'
import ReviewScreen from './screens/ReviewScreen.jsx'
import ExportScreen from './screens/ExportScreen.jsx'
import { emptySpec, specToMarkdown, validateSpec } from './lib/specification.js'
import { planSlots } from './lib/plan.js'
import { runChecks } from './lib/checks.js'
import { requestQuestion, runGeneration } from './lib/generation.js'
import { HOSTED, fetchAccount, newSetId } from './lib/hosted.js'
import AccessScreen from './screens/AccessScreen.jsx'
import AdminScreen from './screens/AdminScreen.jsx'
import RedeemPanel from './components/RedeemPanel.jsx'
import { Card } from './components/ui.jsx'

// "Physical Science Foundations (PHY101)" -> "PHY101"
const moduleCode = (name) => (name.match(/\(([^)]+)\)\s*$/)?.[1] ?? name).trim()

export default function App({ user, signOut }) {
  const [step, setStep] = useState(0)
  const [spec, setSpec] = useState(emptySpec)
  const [showErrors, setShowErrors] = useState(false)
  const [houseRules, setHouseRules] = useState(houseRulesFile)
  const [files, setFiles] = useState([])
  const [questions, setQuestions] = useState([])
  const [questionSet, setQuestionSet] = useState(null) // { specification, moduleCode, generatedAt }
  const [run, setRun] = useState({ status: 'idle' }) // idle | running | done | stopped | error
  const abortRef = useRef(null)
  const mainRef = useRef(null)
  // Hosted only: { email, questions, access, waitlisted, isAdmin, mode }
  const [account, setAccount] = useState(null)
  const [accountError, setAccountError] = useState(null)
  const [showRedeem, setShowRedeem] = useState(false)
  const [view, setView] = useState(() => (typeof location !== 'undefined' && location.hash === '#admin' ? 'admin' : 'app'))

  // Hosted mode: load the account once signed in.
  useEffect(() => {
    if (!HOSTED || !user) return
    fetchAccount()
      .then(setAccount)
      .catch((e) => setAccountError(e.message))
  }, [user])
  const noteCredits = (result) => {
    if (typeof result?.questions === 'number') setAccount((a) => ({ ...a, questions: result.questions }))
  }

  // The admin page lives at #admin, so the owner can bookmark it.
  useEffect(() => {
    const onHash = () => setView(location.hash === '#admin' ? 'admin' : 'app')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const closeAdmin = () => {
    history.replaceState(null, '', location.pathname)
    setView('app')
  }

  const errors = useMemo(() => validateSpec(spec), [spec])
  const complete = [
    Object.keys(errors).length === 0,
    files.some((f) => f.status === 'ok') && totalWords(files.filter((f) => f.status === 'ok')) <= MAX_WORDS,
    questions.length > 0 && run.status !== 'running',
    questions.length > 0 && run.status !== 'running',
    false,
  ]

  const contentSource = files
    .filter((f) => f.status === 'ok')
    .map((f) => f.name)
    .join(', ')

  // Writes the whole set (fresh), or carries on with the questions not yet written (resume).
  const startGeneration = async ({ fresh }) => {
    const slots = planSlots(spec)
    let info = questionSet
    let done = new Set(questions.map((q) => q.id))
    if (fresh || !info) {
      info = {
        setId: newSetId(),
        specification: specToMarkdown(spec, { houseRules, contentSource }),
        moduleCode: moduleCode(spec.moduleName),
        generatedAt: new Date().toISOString(),
      }
      setQuestionSet(info)
      setQuestions([])
      done = new Set()
    }
    const remaining = slots.filter((slot) => !done.has(slot.id))
    const controller = new AbortController()
    abortRef.current = controller
    setRun({ status: 'running', total: slots.length })
    try {
      await runGeneration({
        setId: info.setId,
        specification: info.specification,
        sources: files.filter((f) => f.status === 'ok').map((f) => ({ name: f.name, text: f.text })),
        slots: remaining,
        total: slots.length,
        existingStems: fresh ? [] : questions.filter((q) => !q.flagged).map((q) => q.stem),
        signal: controller.signal,
        onResult: (slot, result) => {
          noteCredits(result)
          const entry = result.question
            ? { ...result.question, checks: runChecks(result.question, spec).checks }
            : { id: slot.id, status: 'draft', level: slot.level, outcome: slot.outcome.code, flagged: result.flagged }
          setQuestions((qs) => [...qs.filter((q) => q.id !== entry.id), entry].sort((a, b) => a.id.localeCompare(b.id)))
        },
      })
      setRun({ status: controller.signal.aborted ? 'stopped' : 'done', total: slots.length })
    } catch (error) {
      setRun({ status: 'error', total: slots.length, error: error.message })
    }
  }

  const stopGeneration = () => abortRef.current?.abort()

  // Review: replace one question with an edited copy, or change its status. Checks re-run every time.
  const updateQuestion = (id, changes) => {
    setQuestions((qs) =>
      qs.map((q) => {
        if (q.id !== id) return q
        const next = { ...q, ...changes }
        return { ...next, checks: runChecks(next, spec).checks }
      }),
    )
  }

  // Review: write one question again, with the reviewer's optional note. Throws a plain-English error.
  const regenerateQuestion = async (id, note) => {
    const slot = planSlots(spec).find((s) => s.id === id)
    if (!slot || !questionSet) throw new Error("This question isn't in the current plan. Generate the set again.")
    const old = questions.find((q) => q.id === id)
    const result = await requestQuestion({
      setId: questionSet.setId,
      specification: questionSet.specification,
      sources: files.filter((f) => f.status === 'ok').map((f) => ({ name: f.name, text: f.text })),
      slot,
      total: planSlots(spec).length,
      previousStems: questions.filter((q) => q.id !== id && !q.flagged).map((q) => q.stem),
      replacing: old?.flagged ? undefined : old?.stem,
      note: note?.trim() || undefined,
    })
    noteCredits(result)
    const entry = result.question
      ? { ...result.question, checks: runChecks(result.question, spec).checks }
      : { id, status: 'draft', level: slot.level, outcome: slot.outcome.code, flagged: result.flagged }
    setQuestions((qs) => qs.map((q) => (q.id === id ? entry : q)))
    return entry
  }

  const go = (i) => {
    if (canOpen(i, step, complete)) setStep(i)
  }

  // Move focus to the new screen's heading so keyboard and screen-reader users land in the right place.
  const previousStep = useRef(step)
  useEffect(() => {
    if (previousStep.current === step) return
    previousStep.current = step
    window.scrollTo(0, 0)
    mainRef.current?.querySelector('h1')?.focus()
  }, [step])

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-card focus:p-2"
      >
        Skip to content
      </a>
      <StepBar
        current={step}
        complete={complete}
        onGo={go}
        hideSteps={HOSTED && (view === 'admin' || (account && !account.access))}
        account={
          HOSTED
            ? {
                email: account?.email ?? user?.signInDetails?.loginId,
                questions: account?.access ? account?.questions : undefined,
                isAdmin: account?.isAdmin,
                onRedeem: account?.access ? () => setShowRedeem((v) => !v) : undefined,
                onAdmin: () => {
                  location.hash = 'admin'
                },
                onSignOut: signOut,
              }
            : null
        }
      />
      <main id="main" ref={mainRef} className="mx-auto max-w-[960px] px-4 py-8 [&_h1]:outline-none" tabIndex={-1}>
        {HOSTED && accountError && (
          <Card className="mb-6">
            <p>Couldn't load your account: {accountError} Refresh the page to try again.</p>
          </Card>
        )}
        {HOSTED && showRedeem && account?.access && view === 'app' && (
          <Card className="mb-6">
            <h2 className="mb-3 text-xl">Redeem a code</h2>
            <RedeemPanel
              onRedeemed={(a) => {
                setAccount(a)
              }}
            />
          </Card>
        )}
        {HOSTED && view === 'admin' && account?.isAdmin && <AdminScreen onClose={closeAdmin} />}
        {HOSTED && account && !account.access && view === 'app' && <AccessScreen account={account} onAccount={setAccount} />}
        {(!HOSTED || (account?.access && view === 'app')) && <>
        {step === 0 && (
          <SetupScreen
            spec={spec}
            setSpec={setSpec}
            errors={errors}
            showErrors={showErrors}
            setShowErrors={setShowErrors}
            houseRules={houseRules}
            houseRulesFromFile={houseRulesFile}
            setHouseRules={setHouseRules}
            contentSource={contentSource}
            onNext={() => go(1)}
          />
        )}
        {step === 1 && (
          <ContentScreen
            files={files}
            setFiles={setFiles}
            canContinue={complete[1]}
            onBack={() => go(0)}
            onNext={() => go(2)}
          />
        )}
        {step === 2 && (
          <GenerateScreen
            spec={spec}
            files={files}
            questions={questions}
            run={run}
            credits={HOSTED ? account?.questions : undefined}
            setStarted={questions.length > 0}
            onGenerate={startGeneration}
            onStop={stopGeneration}
            onBack={() => go(1)}
            onNext={() => go(3)}
          />
        )}
        {step === 3 && (
          <ReviewScreen
            questions={questions}
            spec={spec}
            questionSet={questionSet}
            onUpdate={updateQuestion}
            onRegenerate={regenerateQuestion}
            onBack={() => go(2)}
            onNext={() => go(4)}
          />
        )}
        {step === 4 && (
          <ExportScreen
            spec={spec}
            questions={questions}
            questionSet={questionSet}
            onFormats={(exportFormats) => setSpec((s) => ({ ...s, exportFormats }))}
            onBack={() => go(3)}
          />
        )}
        </>}
      </main>
    </>
  )
}
