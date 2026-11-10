import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import JSZip from 'jszip'
import { importSampleSpec, mockServerFunction, uploadSamples } from './helpers.js'

const shot3 = (page, name) => page.screenshot({ path: `evidence/phase-3/${name}.png`, fullPage: true })

async function toReview(page) {
  await mockServerFunction(page)
  await page.goto('/')
  await importSampleSpec(page)
  await page.getByRole('button', { name: 'Continue to Content' }).click()
  await uploadSamples(page)
  await page.getByRole('button', { name: 'Continue to Generate' }).click()
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await expect(page.getByTestId('generate-progress')).toContainText('Done')
  await page.getByRole('button', { name: 'Continue to Review' }).click()
}

test('Export is blocked until a question is approved', async ({ page }) => {
  await toReview(page)
  await page.getByRole('button', { name: 'Continue to Export' }).click()
  await expect(page.getByText('Nothing to export yet')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download .zip' })).toBeDisabled()
  await expect(page.getByText(/Coming in Phase/)).toHaveCount(0)
})

test('All four files download in one zip, approved questions only, with a distribution warning', async ({ page }) => {
  await toReview(page)
  for (const n of [1, 4, 7]) await page.getByRole('button', { name: `Approve question ${n}`, exact: true }).click()
  await page.getByRole('button', { name: 'Continue to Export' }).click()
  await expect(page.getByTestId('export-count')).toContainText('3 approved questions. 17 draft, rejected or flagged questions are left out.')
  await expect(page.getByText("The approved set doesn't match the distribution")).toBeVisible()
  await shot3(page, '1-export-screen')

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download .zip' }).click()])
  const today = new Date()
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  expect(download.suggestedFilename()).toBe(`PHY101_${date}.zip`)
  const path = `evidence/phase-3/${download.suggestedFilename()}`
  await download.saveAs(path)
  await expect(page.getByTestId('export-result')).toContainText(`PHY101_${date}.zip, with 3 questions`)
  await shot3(page, '2-downloaded')

  const zip = await JSZip.loadAsync(readFileSync(path))
  const names = Object.keys(zip.files).sort()
  expect(names).toEqual([
    `PHY101_${date}_blackboard.txt`, `PHY101_${date}_moodle-gift.txt`,
    `PHY101_${date}_review-sheet.docx`, `PHY101_${date}_specification.md`,
  ])
  const gift = await zip.file(`PHY101_${date}_moodle-gift.txt`).async('string')
  expect(gift.match(/^::Q\d+::/gm)).toEqual(['::Q01::', '::Q04::', '::Q07::'])
  const bb = await zip.file(`PHY101_${date}_blackboard.txt`).async('string')
  expect(bb.trim().split('\n')).toHaveLength(3)
  const spec = await zip.file(`PHY101_${date}_specification.md`).async('string')
  expect(spec).toContain('- Module: Physical Science Foundations (PHY101)')

  // Moodle rejects a .zip, so the GIFT .txt can be downloaded on its own, matching the copy in the zip.
  await expect(page.getByText('Upload the .txt file below, not the .zip.')).toBeVisible()
  const [txt] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Moodle file (.txt)' }).click()])
  expect(txt.suggestedFilename()).toBe(`PHY101_${date}_moodle-gift.txt`)
  const txtPath = `evidence/phase-3/${txt.suggestedFilename()}`
  await txt.saveAs(txtPath)
  expect(readFileSync(txtPath, 'utf8')).toBe(gift)
  await shot3(page, '3-separate-lms-files')
})
