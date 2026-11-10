import { expect } from '@playwright/test'
import { SAMPLE_QUESTIONS } from '../fixtures/sampleQuestions.js'

export const SAMPLES = new URL('../../samples/', import.meta.url).pathname
export const shot = (page, name) => page.screenshot({ path: `evidence/phase-1/${name}.png`, fullPage: true })

export async function importSampleSpec(page) {
  await page.getByTestId('import-spec-input').setInputFiles(`${SAMPLES}sample-specification.md`)
  await expect(page.getByText('Imported "sample-specification.md"')).toBeVisible()
}

export async function uploadSamples(page) {
  await page.getByTestId('content-file-input').setInputFiles([
    `${SAMPLES}week3-notes.pdf`,
    `${SAMPLES}week3-handout.docx`,
    `${SAMPLES}week3-slides.pptx`,
  ])
  await expect(page.getByTestId('file-status').filter({ hasText: 'Read OK' })).toHaveCount(3)
}

export const step = (page, name) => page.getByRole('navigation', { name: 'Steps' }).getByRole('button', { name: new RegExp(name) })

// Stands in for the server function, so browser tests don't spend money.
// Returns a fixture question for each slot; slots listed in `flag` come back flagged.
// Every request body is kept in `requests` so tests can inspect what was sent.
export async function mockServerFunction(page, { flag = [], delayMs = 50 } = {}) {
  const requests = []
  await page.route('**/api/generate', async (route) => {
    const body = route.request().postDataJSON()
    requests.push(body)
    await new Promise((r) => setTimeout(r, delayMs))
    const { slot } = body
    if (flag.includes(slot.id)) {
      return route.fulfill({
        json: { flagged: { id: slot.id, level: slot.level, outcome: slot.outcome.code, reason: 'The reply was not valid JSON.', attempts: [] } },
      })
    }
    const fixture = structuredClone(SAMPLE_QUESTIONS[(slot.number - 1) % SAMPLE_QUESTIONS.length])
    const question = { ...fixture, id: slot.id, level: slot.level, outcome: slot.outcome.code, checks: {} }
    delete question.checks
    return route.fulfill({ json: { question, attempts: 1 } })
  })
  return requests
}
