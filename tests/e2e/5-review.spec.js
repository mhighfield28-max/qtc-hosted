import { test, expect } from '@playwright/test'
import { importSampleSpec, mockServerFunction, uploadSamples, shot } from './helpers.js'

test('Review cards show the question, key, misconceptions, source and check chips', async ({ page }) => {
  await mockServerFunction(page)
  await page.goto('/')
  await importSampleSpec(page)
  await page.getByRole('button', { name: 'Continue to Content' }).click()
  await uploadSamples(page)
  await page.getByRole('button', { name: 'Continue to Generate' }).click()
  await expect(page.getByText('Estimated time 28–37 min against 40 min available.')).toBeVisible()
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await expect(page.getByTestId('generate-progress')).toContainText('Done: 20 of 20 questions written.')
  await page.getByRole('button', { name: 'Continue to Review' }).click()

  const cards = page.getByTestId('question-card')
  await expect(cards).toHaveCount(20)
  const q3 = cards.nth(2)
  await expect(q3.getByRole('heading', { name: 'Question 3' })).toBeVisible()
  await expect(q3).toContainText('Draft')
  await expect(q3).toContainText('A walker heats water in a pressure cooker at 3,000 m.')
  await expect(q3.getByRole('listitem').filter({ hasText: "It rises above the open pan's" })).toContainText('✓ Key')
  await expect(q3).toContainText('Misconception: 100 °C is a fixed property of water')

  const source = q3.getByText('Week 3 slides, p. 12')
  await expect(source).toBeHidden()
  await q3.getByText('Source passage').click()
  await expect(source).toBeVisible()
})
