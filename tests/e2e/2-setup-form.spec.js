import { test, expect } from '@playwright/test'
import { shot } from './helpers.js'

const distValues = async (page) =>
  Promise.all(['Remember', 'Understand', 'Apply', 'Analyse', 'Evaluate'].map((l) => page.locator(`#dist-${l}`).inputValue()))

test('Item 2: validates every required field', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue to Content' }).click()
  const summary = page.getByTestId('error-summary')
  await expect(summary).toBeFocused()
  for (const msg of [
    'Enter the module name and code.',
    'Choose a level of study.',
    'Enter the text of outcome 1.',
    'Choose a target level for outcome 1.',
    'Enter case or example 1, or remove the row.',
    'Enter misconception 1.',
    'Enter misconception 2.',
    'Choose 20, 30 or 40 questions.',
    'Enter the time available in minutes.',
    'Enter the share of the module grade, from 0 to 100%.',
    'Choose at least one export format.',
  ]) {
    await expect(summary.getByRole('link', { name: msg })).toBeVisible()
  }
  await expect(page.getByLabel('Module name and code', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  await shot(page, '2a-validation-errors')

  // Fill everything in; the errors clear one by one
  await page.getByLabel('Module name and code', { exact: true }).fill('Physical Science Foundations (PHY101)')
  await page.getByLabel('Level of study', { exact: true }).selectOption('UG Y1')
  await page.getByLabel('Outcome 1 (LO1)', { exact: true }).fill('Explain why water boils at a lower temperature at altitude')
  await page.locator('#outcomes-0-level').selectOption('Understand')
  await page.getByLabel('Case or example 1', { exact: true }).fill('Cooking pasta at the top of Ben Nevis')
  await page.getByLabel('Misconception 1', { exact: true }).fill('100 °C is a fixed property of water')
  await page.getByLabel('Misconception 2', { exact: true }).fill('Higher means colder')
  await page.getByLabel('Number of questions', { exact: true }).selectOption('20')
  await page.getByLabel('Time available (minutes)', { exact: true }).fill('40')
  await page.getByLabel('Share of module grade (%)', { exact: true }).fill('20')
  await page.getByLabel('Moodle GIFT', { exact: true }).check()
  await expect(summary).toHaveCount(0)
  await page.getByRole('button', { name: 'Continue to Content' }).click()
  await expect(page.getByRole('heading', { name: 'Content', level: 1 })).toBeVisible()
})

test('Item 2: at least two misconceptions; can add and remove rows', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Remove misconception 1' })).toBeDisabled()
  await page.getByRole('button', { name: '+ Add a misconception' }).click()
  await expect(page.getByLabel('Misconception 3', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Remove misconception 3' }).click()
  await expect(page.getByLabel('Misconception 3', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '+ Add an outcome' }).click()
  await expect(page.getByLabel('Outcome 2 (LO2)', { exact: true })).toBeVisible()
})

test('Item 2: pre-fills the distribution from level of study', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Number of questions', { exact: true }).selectOption('20')
  await page.getByLabel('Level of study', { exact: true }).selectOption('UG Y1')
  expect(await distValues(page)).toEqual(['3', '5', '7', '4', '1'])
  await page.getByLabel('Level of study', { exact: true }).selectOption('UG Y3')
  expect(await distValues(page)).toEqual(['1', '3', '6', '6', '4'])
  await page.getByLabel('Level of study', { exact: true }).selectOption("Master's")
  expect(await distValues(page)).toEqual(['1', '2', '5', '7', '5'])
  await page.getByLabel('Number of questions', { exact: true }).selectOption('40')
  expect(await distValues(page)).toEqual(['2', '4', '10', '14', '10'])
  await expect(page.getByTestId('distribution-total')).toContainText('40 of 40')
  await page.getByLabel('Number of questions', { exact: true }).selectOption('20')
  await page.getByLabel('Level of study', { exact: true }).selectOption('UG Y1')

  // Changing it: total must match, and a reason box appears
  await expect(page.getByLabel('Why have you changed the default?', { exact: true })).toHaveCount(0)
  await page.locator('#dist-Remember').fill('5')
  await expect(page.getByTestId('distribution-total')).toContainText("22 of 20 ✗ doesn't match")
  await expect(page.getByLabel('Why have you changed the default?', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Continue to Content' }).click()
  await expect(page.getByTestId('error-summary')).toContainText('The distribution totals 22; it must total 20.')
  await expect(page.getByTestId('error-summary')).toContainText('You changed the default distribution. Give the reason.')

  // Live time estimate and weight warning
  await page.locator('#dist-Remember').fill('3')
  await page.getByLabel('Time available (minutes)', { exact: true }).fill('30')
  await expect(page.getByTestId('time-estimate')).toContainText('28–37 min ! fits only if students work fast')
  await page.getByLabel('Time available (minutes)', { exact: true }).fill('25')
  await expect(page.getByTestId('time-estimate')).toContainText("doesn't fit")
  await page.getByLabel('Time available (minutes)', { exact: true }).fill('40')
  await expect(page.getByTestId('time-estimate')).toContainText('✓ fits')
  await page.getByLabel('Share of module grade (%)', { exact: true }).fill('35')
  await expect(page.getByText('This puts 35% of the module grade on multiple choice')).toBeVisible()
  await page.locator('#dist-Remember').fill('5')
  await shot(page, '2b-distribution-and-warnings')
})

test('Item 2: house rules are shown read-only with a warning before editing', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Show the house rules').click()
  await expect(page.getByTestId('house-rules')).toContainText('A5. Checks to run on every question')
  await page.getByRole('button', { name: 'Edit house rules' }).click()
  await expect(page.getByText('Only change a rule if you can say why.')).toBeVisible()
  await shot(page, '2c-house-rules-warning')
  await page.getByRole('button', { name: 'Edit anyway' }).click()
  await expect(page.getByLabel('House rules (Markdown)', { exact: true })).toBeVisible()
})
