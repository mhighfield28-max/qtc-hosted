import { test, expect } from '@playwright/test'
import { importSampleSpec, uploadSamples, shot } from './helpers.js'

test('Item 4: upload shows extracted text for PDF, Word and PowerPoint', async ({ page }) => {
  await page.goto('/')
  await importSampleSpec(page)
  await page.getByRole('button', { name: 'Continue to Content' }).click()
  await expect(page.getByText("Teaching materials only. Don't upload anything that contains student data.")).toBeVisible()
  await uploadSamples(page)

  const rows = page.getByTestId('file-row')
  const expected = {
    'week3-notes.pdf': ['[Page 1]', 'At sea level, atmospheric pressure is 101.3 kPa and pure water boils at 100 °C.'],
    'week3-handout.docx': ['Week 3: Boiling point and pressure', 'A pressure cooker raises the pressure above the water'],
    'week3-slides.pptx': ['[Slide 2]', 'Notes: Ask: why does pasta take longer on Ben Nevis?'],
  }
  for (const [name, snippets] of Object.entries(expected)) {
    const row = rows.filter({ hasText: name })
    await expect(row).toContainText('✓ Read OK')
    await expect(row).toContainText(/\d+(\.\d)? (B|KB|MB)/)
    await row.getByRole('button', { name: 'Show text' }).click()
    for (const s of snippets) await expect(row.getByTestId('extracted-text')).toContainText(s)
  }
  await shot(page, '4a-uploaded-files-with-text')
})

test('Item 4: pasted text, unreadable files, and the 20-file limit', async ({ page }) => {
  await page.goto('/')
  await importSampleSpec(page)
  await page.getByRole('button', { name: 'Continue to Content' }).click()
  await page.getByLabel('Teaching text').fill('Boiling happens when vapour pressure equals external pressure.')
  await page.getByRole('button', { name: 'Add pasted text' }).click()
  await expect(page.getByTestId('file-row').filter({ hasText: 'Pasted text 1' })).toContainText('Read OK')

  await page.getByTestId('content-file-input').setInputFiles({ name: 'old.doc', mimeType: 'application/msword', buffer: Buffer.from('x') })
  const bad = page.getByTestId('file-row').filter({ hasText: 'old.doc' })
  await expect(bad).toContainText("✗ Couldn't read")
  await expect(bad).toContainText('Save it as .docx')

  const many = Array.from({ length: 20 }, (_, i) => ({ name: `n${i}.txt`, mimeType: 'text/plain', buffer: Buffer.from('notes') }))
  await page.getByTestId('content-file-input').setInputFiles(many)
  await expect(page.getByText('You can upload up to 20 files. 2 not added.')).toBeVisible()
  await expect(page.getByTestId('file-row')).toHaveCount(20)
})
