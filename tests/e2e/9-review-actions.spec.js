import { test, expect } from '@playwright/test'
import { importSampleSpec, mockServerFunction, uploadSamples } from './helpers.js'

const shot2 = (page, name) => page.screenshot({ path: `evidence/phase-2/${name}.png`, fullPage: true })

async function toReview(page, options) {
  const requests = await mockServerFunction(page, options)
  await page.goto('/')
  await importSampleSpec(page)
  await page.getByRole('button', { name: 'Continue to Content' }).click()
  await uploadSamples(page)
  await page.getByRole('button', { name: 'Continue to Generate' }).click()
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await expect(page.getByTestId('generate-progress')).toContainText('Done')
  await page.getByRole('button', { name: 'Continue to Review' }).click()
  return requests
}

const card = (page, n) => page.locator('[data-testid="question-card"], [data-testid="flagged-card"]').filter({ has: page.getByRole('heading', { name: `Question ${n}`, exact: true }) })

test('Review: no "coming in Phase" notice remains on the review screen', async ({ page }) => {
  await toReview(page)
  await expect(page.getByText(/Coming in Phase/)).toHaveCount(0)
  await expect(page.getByText(/arrive in Phase/)).toHaveCount(0)
})

test('Review: Edit, Save and Cancel work, edited text is kept, and checks re-run on save', async ({ page }) => {
  await toReview(page)
  const q2 = card(page, 2)
  await expect(q2.getByTestId('check-optionLength')).toContainText('✗')
  await expect(q2.getByTestId('check-distractorsLinked')).toContainText('✗')

  // Cancel throws changes away
  await q2.getByRole('button', { name: 'Edit question 2' }).click()
  await q2.getByLabel('Stem').fill('This change should be thrown away')
  await q2.getByRole('button', { name: 'Cancel' }).click()
  await expect(q2).not.toContainText('This change should be thrown away')

  // Save keeps them, and the two failing checks now pass
  await q2.getByRole('button', { name: 'Edit question 2' }).click()
  await q2.getByLabel('Stem').fill('Why does water boil below 100 °C at the top of a high mountain?')
  await q2.getByRole('textbox', { name: 'Option A' }).fill('The air pressure is lower there')
  await q2.getByRole('textbox', { name: 'Option C' }).fill('There is less oxygen in the air')
  await q2.getByRole('textbox', { name: 'Option D' }).fill('The water up there is much purer')
  await q2.getByLabel('Misconception behind option D').fill('Impurities are what make water boil')
  await shot2(page, '4-editing-a-question')
  await q2.getByRole('button', { name: 'Save changes' }).click()

  await expect(q2.getByTestId('question-editor')).toHaveCount(0)
  await expect(q2).toContainText('Why does water boil below 100 °C at the top of a high mountain?')
  await expect(q2).toContainText('Misconception: Impurities are what make water boil')
  await expect(q2.getByTestId('check-optionLength')).toContainText('✓')
  await expect(q2.getByTestId('check-distractorsLinked')).toContainText('✓')

  // Changing the key in the editor moves the key mark
  await q2.getByRole('button', { name: 'Edit question 2' }).click()
  await q2.getByRole('radio').nth(1).check()
  await q2.getByLabel('Misconception behind option A').fill('Lower pressure has no effect')
  await q2.getByRole('button', { name: 'Save changes' }).click()
  await expect(q2.getByRole('listitem').filter({ hasText: 'The air is colder' })).toContainText('✓ Key')

  // An empty stem can't be saved
  await q2.getByRole('button', { name: 'Edit question 2' }).click()
  await q2.getByLabel('Stem').fill('')
  await q2.getByRole('button', { name: 'Save changes' }).click()
  await expect(q2.getByText('Write the stem.')).toBeVisible()
})

test('Review: Approve and Reject work, the status chip updates, and a reject reason is stored', async ({ page }) => {
  await toReview(page)
  const q1 = card(page, 1)
  const q2 = card(page, 2)
  const q3 = card(page, 3)

  // Approve a question that passes every check
  await q1.getByRole('button', { name: 'Approve question 1' }).click()
  await expect(q1.getByTestId('status-chip')).toHaveText('✓ Approved')
  await expect(page.getByTestId('approved-count')).toHaveText('1 of 20 approved')

  // Approving one that fails checks asks first; Cancel leaves it as a draft
  await q2.getByRole('button', { name: 'Approve question 2' }).click()
  await expect(q2.getByTestId('confirm-approve')).toContainText('fails 2 checks: Options, Distractors')
  await q2.getByRole('button', { name: 'Cancel' }).click()
  await expect(q2.getByTestId('status-chip')).toHaveText('○ Draft')

  // Reject with a reason
  await q3.getByRole('button', { name: 'Reject question 3' }).click()
  await q3.getByLabel(/Reason for rejecting question 3/).fill('Too close to the worked example in week 3')
  await q3.getByRole('button', { name: 'Confirm reject' }).click()
  await expect(q3.getByTestId('status-chip')).toHaveText('✗ Rejected')
  await expect(q3.getByTestId('reject-reason')).toHaveText('Rejected. Reason: Too close to the worked example in week 3')
  await shot2(page, '5-approved-and-rejected')

  // Back to draft, then approve; the reason is cleared
  await q3.getByRole('button', { name: 'Set question 3 back to draft' }).click()
  await expect(q3.getByTestId('status-chip')).toHaveText('○ Draft')
  await expect(q3.getByTestId('reject-reason')).toHaveCount(0)

  // Editing an approved question sends it back to draft
  await q1.getByRole('button', { name: 'Edit question 1' }).click()
  await expect(q1.getByText('Saving changes sets this question back to Draft')).toBeVisible()
  await q1.getByLabel('Stem').fill('At sea level, what is the boiling point of pure water?')
  await q1.getByRole('button', { name: 'Save changes' }).click()
  await expect(q1.getByTestId('status-chip')).toHaveText('○ Draft')
  await expect(page.getByTestId('approved-count')).toHaveText('0 of 20 approved')
})

test('Review: approved questions reach Export, and draft or rejected ones don\'t', async ({ page }) => {
  await toReview(page)
  await card(page, 1).getByRole('button', { name: 'Approve question 1' }).click()
  await card(page, 4).getByRole('button', { name: 'Approve question 4' }).click()
  await card(page, 5).getByRole('button', { name: 'Reject question 5' }).click()
  await card(page, 5).getByRole('button', { name: 'Confirm reject' }).click()
  await page.getByRole('button', { name: 'Continue to Export' }).click()
  await expect(page.getByTestId('export-count')).toContainText('2 approved questions. 18 draft, rejected or flagged questions are left out.')
})

test('Review: Regenerate replaces one question only, using the note, including a flagged one', async ({ page }) => {
  const requests = await toReview(page, { flag: ['q05'] })
  // Regenerate requests carry a note or replace a stem; give them a recognisable new question
  await page.route('**/api/generate', async (route) => {
    const body = route.request().postDataJSON()
    if (!('replacing' in body) && !('note' in body)) return route.fallback()
    requests.push(body)
    return route.fulfill({
      json: {
        question: {
          id: body.slot.id, status: 'draft', level: body.slot.level, knowledgeType: 'Factual', outcome: body.slot.outcome.code,
          stem: `Regenerated stem for ${body.slot.id}`,
          options: [
            { label: 'A', text: 'First answer', isKey: true },
            { label: 'B', text: 'Second answr', isKey: false, misconception: 'A misconception' },
            { label: 'C', text: 'Third answer', isKey: false, misconception: 'Another one' },
          ],
          sourcePassage: 'week3-notes.pdf', checks: {}, rejectReason: null,
        },
      },
    })
  })

  const q1 = card(page, 1)
  const q2Stem = await card(page, 2).locator('p.text-lg').textContent()
  await q1.getByRole('button', { name: 'Regenerate question 1' }).click()
  await q1.getByLabel('Note for the AI (optional)').fill('make it harder')
  await q1.getByRole('button', { name: 'Regenerate question 1' }).click()
  await expect(q1).toContainText('Regenerated stem for q01')
  await expect(q1.getByTestId('regenerate-panel')).toHaveCount(0)

  const sent = requests.at(-1)
  expect(sent.slot.id).toBe('q01')
  expect(sent.note).toBe('make it harder')
  expect(sent.replacing).toBe('At sea-level atmospheric pressure, what is the boiling point of pure water?')
  expect(sent.previousStems).toHaveLength(18) // the other written questions, not this one or the flagged one
  await expect(card(page, 2).locator('p.text-lg')).toHaveText(q2Stem) // neighbours untouched
  await expect(page.getByTestId('question-card')).toHaveCount(19)

  // The flagged question can be regenerated too, and becomes a normal card
  const q5 = card(page, 5)
  await q5.getByRole('button', { name: 'Regenerate question 5' }).click()
  await q5.getByLabel('Note for the AI (optional)').fill('try again')
  await q5.getByRole('button', { name: 'Regenerate question 5' }).click()
  await expect(page.getByTestId('flagged-card')).toHaveCount(0)
  await expect(page.getByTestId('question-card')).toHaveCount(20)
  await expect(card(page, 5)).toContainText('Regenerated stem for q05')
  await shot2(page, '6-regenerated')
})

test('Review: a regenerate error shows on the card and leaves the question as it was', async ({ page }) => {
  await toReview(page)
  await page.route('**/api/generate', (route) =>
    route.fulfill({ status: 429, json: { error: 'The Claude API is busy (rate limit). Wait a minute and try again.' } }),
  )
  const q1 = card(page, 1)
  const stem = await q1.locator('p.text-lg').textContent()
  await q1.getByRole('button', { name: 'Regenerate question 1' }).click()
  await q1.getByRole('button', { name: 'Regenerate question 1' }).click()
  await expect(q1).toContainText("Couldn't regenerate: The Claude API is busy (rate limit).")
  await expect(q1.locator('p.text-lg')).toHaveText(stem)
})

test('Review: summary bar, filters and key-position balance update live', async ({ page }) => {
  await toReview(page)
  const summary = page.getByTestId('set-checks')
  await expect(summary).toContainText('0 of 20 approved')
  await expect(page.getByTestId('key-balance')).toHaveText(/Key positions: A \d+ · B \d+ · C \d+ · D \d+/)
  const keyText = await page.getByTestId('key-balance').textContent()

  await card(page, 1).getByRole('button', { name: 'Approve question 1' }).click()
  await expect(page.getByTestId('level-count-Remember')).toHaveText(/^1 \/ \d+$/)

  // Moving question 2's key changes the balance
  const q2 = card(page, 2)
  await q2.getByRole('button', { name: 'Edit question 2' }).click()
  await q2.getByRole('radio').nth(3).check()
  await q2.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByTestId('key-balance')).not.toHaveText(keyText)

  // Filters
  await page.getByLabel('Status').selectOption('approved')
  await expect(page.getByTestId('question-card')).toHaveCount(1)
  await expect(page.getByTestId('filter-count')).toHaveText('Showing 1 of 20')
  await page.getByLabel('Status').selectOption('all')
  await page.getByLabel('Failed checks only').check()
  const failing = await page.getByTestId('question-card').count()
  expect(failing).toBeGreaterThan(0)
  expect(failing).toBeLessThan(20)
  for (let i = 0; i < failing; i++) {
    await expect(page.getByTestId('question-card').nth(i).getByText('✗').first()).toBeVisible()
  }
  await page.getByLabel('Failed checks only').uncheck()
  await page.getByRole('combobox', { name: /^Level/ }).selectOption('Apply')
  const applyCount = await page.getByTestId('question-card').count()
  await expect(page.getByTestId('filter-count')).toHaveText(`Showing ${applyCount} of 20`)
  for (let i = 0; i < applyCount; i++) {
    await expect(page.getByTestId('question-card').nth(i)).toContainText('Apply')
  }
  await shot2(page, '7-filters-and-summary')
})

test('Review: there is no "Approve all" button', async ({ page }) => {
  await toReview(page)
  await expect(page.getByRole('button', { name: /approve all/i })).toHaveCount(0)
})
