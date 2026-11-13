import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { importSampleSpec, mockServerFunction, uploadSamples, step } from './helpers.js'

const shot2 = (page, name) => page.screenshot({ path: `evidence/phase-2/${name}.png`, fullPage: true })

async function toGenerate(page) {
  await page.goto('/')
  await importSampleSpec(page)
  await page.getByRole('button', { name: 'Continue to Content' }).click()
  await uploadSamples(page)
  await page.getByRole('button', { name: 'Continue to Generate' }).click()
}

test('Phase 2 item 1: Generate sends the specification as instructions and the content as source material', async ({ page }) => {
  const requests = await mockServerFunction(page)
  await toGenerate(page)
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await expect(page.getByTestId('generate-progress')).toContainText('Done: 20 of 20 questions written.')

  expect(requests).toHaveLength(20)
  const first = requests[0]
  // The whole specification: Part A (house rules) and Part B (this module), as typed in the form
  expect(first.specification).toContain(readFileSync('docs/house-rules.md', 'utf8').trim())
  expect(first.specification).toContain('- Module: Physical Science Foundations (PHY101)')
  expect(first.specification).toContain('| Bubbles in boiling water are air, not water vapour |')
  // The content: every uploaded file, by name, with its extracted text
  expect(first.sources.map((s) => s.name)).toEqual(['week3-notes.pdf', 'week3-handout.docx', 'week3-slides.pptx'])
  expect(first.sources[2].text).toContain('Notes: Ask: why does pasta take longer on Ben Nevis?')
  // One request per question, each with its own slot; every request carries the same specification
  expect(new Set(requests.map((r) => r.slot.id)).size).toBe(20)
  expect(requests.every((r) => r.specification === first.specification)).toBe(true)
  // No key anywhere in what the browser sends
  expect(JSON.stringify(requests)).not.toMatch(/sk-ant|MCQ_CLAUDE_KEY/)
  await shot2(page, '1-generate-progress-done')
})

test('Phase 2 item 1: editing the house rules changes what the AI is told, with no code change', async ({ page }) => {
  const requests = await mockServerFunction(page)
  await page.goto('/')
  await importSampleSpec(page)
  await page.getByRole('button', { name: 'Edit house rules' }).click()
  await page.getByRole('button', { name: 'Edit anyway' }).click()
  const rules = page.getByLabel('House rules (Markdown)', { exact: true })
  await rules.fill((await rules.inputValue()).replace('Use three or four options.', 'Always use four options.'))
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Continue to Content' }).click()
  await uploadSamples(page)
  await page.getByRole('button', { name: 'Continue to Generate' }).click()
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await expect(page.getByTestId('generate-progress')).toContainText('Done')
  expect(requests[0].specification).toContain('Always use four options.')
  expect(requests[0].specification).not.toContain('Use three or four options.')
})

test('Phase 2 item 2: a question the server flags shows as flagged, not as a question', async ({ page }) => {
  await mockServerFunction(page, { flag: ['q05'] })
  await toGenerate(page)
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await expect(page.getByTestId('generate-progress')).toContainText('Done: 19 of 20 questions written. 1 flagged.')
  await expect(page.getByTestId('question-status-list')).toContainText(/Q5.*flagged/)
  await page.getByRole('button', { name: 'Continue to Review' }).click()
  const flagged = page.getByTestId('flagged-card')
  await expect(flagged).toHaveCount(1)
  await expect(flagged).toContainText('Question 5')
  await expect(flagged).toContainText("The AI's reply didn't match the question format, twice")
  await expect(flagged).toContainText('Reason: The reply was not valid JSON.')
  await expect(page.getByTestId('question-card')).toHaveCount(19)
  await shot2(page, '2-flagged-card')
})

test('Phase 2 item 3: A5 checks run on every question and show on its card, with reasons', async ({ page }) => {
  await mockServerFunction(page)
  await toGenerate(page)
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await expect(page.getByTestId('generate-progress')).toContainText('Done')
  await page.getByRole('button', { name: 'Continue to Review' }).click()

  const cards = page.getByTestId('question-card')
  for (let i = 0; i < 20; i++) {
    for (const key of ['tags', 'newCase', 'oneKey', 'optionLength', 'noBannedForms', 'distractorsLinked']) {
      await expect(cards.nth(i).getByTestId(`check-${key}`)).toHaveText(/[✓✗]/)
    }
  }
  // Fixture question 2 has a 43-character option against a 20-character one, and a distractor with no misconception
  const q2 = cards.nth(1)
  await expect(q2.getByTestId('check-optionLength')).toContainText('✗')
  await q2.getByTestId('check-optionLength').hover()
  await expect(
    q2.getByRole('tooltip', { includeHidden: true }).filter({ hasText: 'the longest (43 characters) is more than 1.5× the shortest (20)' }),
  ).toBeVisible()
  await expect(q2.getByTestId('check-distractorsLinked')).toContainText('✗')
  await q2.getByTestId('check-distractorsLinked').focus()
  await expect(q2.getByRole('tooltip', { includeHidden: true }).filter({ hasText: 'Distractor D has no misconception recorded.' })).toBeVisible()
  // Set-level checks
  await expect(page.getByTestId('set-checks')).toContainText('✓ Distribution matches B4: pass')
  await expect(page.getByTestId('set-checks')).toContainText('✓ Total time fits B5: pass')
  await shot2(page, '3-check-chips-with-reasons')
})

test('Phase 2: a server error stops generation with a plain message, and Try again carries on', async ({ page }) => {
  await mockServerFunction(page) // added first, so the error route below gets each request before it
  let calls = 0
  await page.route('**/api/generate', async (route) => {
    calls += 1
    if (calls === 4) return route.fulfill({ status: 502, json: { error: 'The Claude API rejected the key. Check MCQ_CLAUDE_KEY.' } })
    return route.fallback()
  })
  await toGenerate(page)
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await expect(page.getByText('The Claude API rejected the key. Check MCQ_CLAUDE_KEY.')).toBeVisible()
  await expect(step(page, 'Review')).toBeEnabled()
  await page.getByRole('button', { name: /^Try again: write the remaining \d+$/ }).click()
  await expect(page.getByTestId('generate-progress')).toContainText('Done: 20 of 20 questions written.')
})
