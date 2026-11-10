import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { SAMPLES, importSampleSpec, shot } from './helpers.js'

test('Item 3: import a specification file', async ({ page }) => {
  await page.goto('/')
  await importSampleSpec(page)
  await expect(page.getByLabel('Module name and code')).toHaveValue('Physical Science Foundations (PHY101)')
  await expect(page.getByLabel('Level of study')).toHaveValue('UG Y1')
  await expect(page.getByLabel('Outcome 3 (LO3)', { exact: true })).toHaveValue('Interpret a phase diagram to identify the state of a substance')
  await expect(page.locator('#outcomes-2-level')).toHaveValue('Analyse')
  await expect(page.locator('#cases-2')).toHaveValue('Phase diagram of water from the Week 3 slides')
  await expect(page.getByLabel('Misconception 3', { exact: true })).toHaveValue('Bubbles in boiling water are air, not water vapour')
  await expect(page.getByLabel('Time available (minutes)')).toHaveValue('40')
  await expect(page.getByLabel('Blackboard')).toBeChecked()
  await expect(page.getByTestId('error-summary')).toHaveCount(0)
  await shot(page, '3a-imported-spec')
})

test('Item 3: download a specification, then import it again', async ({ page, browser }) => {
  await page.goto('/')
  await importSampleSpec(page)
  // Make a change so the round trip is meaningful
  await page.locator('#dist-Remember').fill('2')
  await page.locator('#dist-Apply').fill('8')
  await page.getByLabel('Why have you changed the default?').fill('More practice applying the gas laws')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download specification' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('Physical-Science-Foundations-PHY101-specification.md')
  const saved = 'evidence/phase-1/downloaded-specification.md'
  await download.saveAs(saved)
  const text = readFileSync(saved, 'utf8')
  expect(text).toContain('# Questions That Count — House rules (Part A)')
  expect(text).toContain('- My distribution: Remember 2, Understand 5, Apply 8, Analyse 4, Evaluate 1. Reason: More practice applying the gas laws')

  // Fresh page: import what was downloaded
  const fresh = await browser.newPage()
  await fresh.goto('/')
  await fresh.getByTestId('import-spec-input').setInputFiles(saved)
  await expect(fresh.getByLabel('Module name and code')).toHaveValue('Physical Science Foundations (PHY101)')
  await expect(fresh.locator('#dist-Apply')).toHaveValue('8')
  await expect(fresh.getByLabel('Why have you changed the default?')).toHaveValue('More practice applying the gas laws')
  await fresh.getByRole('button', { name: 'Continue to Content' }).click()
  await expect(fresh.getByRole('heading', { name: 'Content', level: 1 })).toBeVisible()
})

test('Item 3: importing the blank template flags what is missing; a non-spec file is refused', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('import-spec-input').setInputFiles(new URL('../../docs/part-b-template.md', import.meta.url).pathname)
  await expect(page.getByTestId('error-summary')).toContainText('Enter the module name and code.')
  await page.getByTestId('import-spec-input').setInputFiles({ name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Notes\n- eggs') })
  await expect(page.getByText("This file doesn't look like a specification")).toBeVisible()
})
