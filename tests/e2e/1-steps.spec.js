import { test, expect } from '@playwright/test'
import { importSampleSpec, mockServerFunction, uploadSamples, shot, step } from './helpers.js'

test('Item 1: all five steps visible; back and forward work', async ({ page }) => {
  await mockServerFunction(page)
  await page.goto('/')
  for (const name of ['Set up', 'Content', 'Generate', 'Review', 'Export']) {
    await expect(step(page, name)).toBeVisible()
  }
  // Forward is blocked until the current step is complete
  await expect(step(page, 'Set up')).toHaveAttribute('aria-current', 'step')
  for (const name of ['Content', 'Generate', 'Review', 'Export']) await expect(step(page, name)).toBeDisabled()
  await shot(page, '1a-step-bar-start')

  await page.getByRole('button', { name: 'Continue to Content' }).click()
  await expect(page.getByRole('heading', { name: 'Set up', level: 1 })).toBeVisible() // still on step 1

  // Complete each step and move forward
  await importSampleSpec(page)
  await page.getByRole('button', { name: 'Continue to Content' }).click()
  await expect(page.getByRole('heading', { name: 'Content', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue to Generate' })).toBeDisabled()
  await uploadSamples(page)
  await page.getByRole('button', { name: 'Continue to Generate' }).click()
  await expect(page.getByRole('heading', { name: 'Generate', level: 1 })).toBeVisible()
  await expect(step(page, 'Review')).toBeDisabled()
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await page.getByRole('button', { name: 'Continue to Review' }).click()
  await expect(page.getByRole('heading', { name: 'Review', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Continue to Export' }).click()
  await expect(page.getByRole('heading', { name: 'Export', level: 1 })).toBeVisible()
  await shot(page, '1b-step-bar-at-export')

  // Back buttons, one step at a time
  for (const name of ['Review', 'Generate', 'Content', 'Set up']) {
    await page.getByRole('button', { name: '← Back' }).click()
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()
  }

  // Step bar jumps both ways once steps are complete, and work is kept
  await step(page, 'Review').click()
  await expect(page.getByTestId('question-card')).toHaveCount(20)
  await step(page, 'Content').click()
  await expect(page.getByTestId('file-row')).toHaveCount(3)
  await step(page, 'Set up').click()
  await expect(page.getByLabel('Module name and code')).toHaveValue('Physical Science Foundations (PHY101)')

  // Breaking an earlier step blocks going forward again
  await page.getByLabel('Module name and code').fill('')
  await expect(step(page, 'Content')).toBeDisabled()
})

test('Item 1: the step bar works by keyboard', async ({ page }) => {
  await page.goto('/')
  await importSampleSpec(page)
  await page.keyboard.press('Tab') // skip link
  await page.keyboard.press('Tab') // Set up
  await page.keyboard.press('Tab') // Content
  await expect(step(page, 'Content')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Content', level: 1 })).toBeFocused()
})
