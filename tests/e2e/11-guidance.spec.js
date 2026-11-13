import { readFileSync, writeFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { importSampleSpec, mockServerFunction, step, uploadSamples } from './helpers.js'

const shotLaunch = (page, name) => page.screenshot({ path: `evidence/launch/${name}.png`, fullPage: true })

test('Guidance: every "?" opens its help and closes it again', async ({ page }) => {
  await page.goto('/')
  const casesHelp = page.getByRole('button', { name: 'Help: Why list cases and examples?' })
  await expect(page.getByTestId('help-cases')).toBeHidden()
  await casesHelp.click()
  await expect(casesHelp).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByTestId('help-cases')).toContainText('Apply, Analyse and Evaluate questions must not')
  await page.getByRole('button', { name: 'Help: What are Part A and Part B?' }).click()
  await expect(page.getByTestId('help-specParts')).toContainText('Part A: house rules, the same for every module.')
  await shotLaunch(page, 'g1-setup-help-open')
  await casesHelp.click()
  await expect(page.getByTestId('help-cases')).toBeHidden()

  // Every help button on the Set up screen has text behind it
  const buttons = page.locator('[data-help]')
  expect(await buttons.count()).toBeGreaterThanOrEqual(11)
})

test('Guidance: import and download name both parts, with the tooltip', async ({ page }) => {
  await page.goto('/')
  const download = page.getByRole('button', { name: 'Download specification (Part A and B)' })
  await expect(download).toHaveAttribute('title', 'Part A: house rules, the same for every module. Part B: your module.')
  await expect(page.getByRole('button', { name: 'Import specification (Part A and B)' })).toBeVisible()
})

test('Guidance: importing a file with edited house rules asks before replacing them', async ({ page }) => {
  await page.goto('/')
  await importSampleSpec(page)
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download specification (Part A and B)' }).click(),
  ])
  const saved = 'evidence/launch/spec-with-rules.md'
  await file.saveAs(saved)
  const edited = readFileSync(saved, 'utf8').replace('3. Single best answer only.', '3. Single best answer only. EDITED RULE.')
  writeFileSync(saved, edited)

  await page.getByTestId('import-spec-input').setInputFiles(saved)
  await expect(page.getByText('The file has its own house rules (Part A)')).toBeVisible()
  await shotLaunch(page, 'g2-import-part-a-question')
  await page.getByRole('button', { name: "Use the file's house rules" }).click()
  await expect(page.getByText('House rules taken from the file.')).toBeVisible()
  await expect(page.getByRole('heading', { name: /Part A: House rules/ })).toContainText('(edited for this set)')
  await page.getByText('Show the house rules').click()
  await expect(page.getByTestId('house-rules')).toContainText('EDITED RULE.')

  // Same file again: rules already match, so no question
  await page.getByTestId('import-spec-input').setInputFiles(saved)
  await expect(page.getByText('Part A matches the house rules in use.')).toBeVisible()
  await expect(page.getByText('The file has its own house rules (Part A)')).toHaveCount(0)
})

test('Guidance: Content explains what to upload, counts words and says what happens to the files', async ({ page }) => {
  await page.goto('/')
  await importSampleSpec(page)
  await page.getByRole('button', { name: 'Continue to Content' }).click()
  await expect(page.getByText('Not enough on its own:', { exact: true })).toBeVisible()
  await expect(page.getByText("Use material you're entitled to use for teaching")).toBeVisible()
  await expect(page.getByTestId('privacy-panel')).toContainText('Never used to train AI models.')
  await expect(page.getByTestId('word-meter')).toContainText('0 of 25,000 words')
  await uploadSamples(page)
  await expect(page.getByTestId('word-meter')).toContainText(/^[1-9][\d,]* of 25,000 words/)
  await page.getByRole('button', { name: /Help: Why 25,000 words/ }).click()
  await expect(page.getByTestId('help-wordLimit')).toContainText('A journal article')
  await shotLaunch(page, 'g3-content-guidance')

  // Over the limit: the meter says so and Continue is blocked
  await page.getByLabel('Teaching text', { exact: true }).fill('word '.repeat(25_001))
  await page.getByRole('button', { name: 'Add pasted text' }).click()
  await expect(page.getByTestId('word-meter')).toContainText('over the limit by')
  await expect(page.getByRole('button', { name: 'Continue to Generate' })).toBeDisabled()
  await expect(page.getByText('Remove some material to get under 25,000 words.')).toBeVisible()
  await shotLaunch(page, 'g4-content-over-limit')
  await page.getByRole('button', { name: 'Remove Pasted text 1' }).click()
  await expect(page.getByRole('button', { name: 'Continue to Generate' })).toBeEnabled()
})

test("Guidance: Bloom's level blocks on Generate and Review", async ({ page }) => {
  await mockServerFunction(page, { flag: ['q05'] })
  await page.goto('/')
  await importSampleSpec(page)
  await page.getByRole('button', { name: 'Continue to Content' }).click()
  await uploadSamples(page)
  await page.getByRole('button', { name: 'Continue to Generate' }).click()
  await expect(page.locator('table [data-level="Evaluate"]')).toBeVisible()
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await expect(page.getByTestId('generate-progress')).toContainText('Done')
  const list = page.getByTestId('question-status-list')
  await expect(list.locator('[data-level]')).toHaveCount(20)
  await expect(list).toContainText('Q1 · Remember')
  await shotLaunch(page, 'g5-generate-level-blocks')
  await step(page, 'Review').click()
  await expect(page.getByTestId('set-checks').locator('[data-level]')).toHaveCount(5)
  await shotLaunch(page, 'g6-review-level-blocks')
})
