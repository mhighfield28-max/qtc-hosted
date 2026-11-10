import { test, expect } from '@playwright/test'
import { CANARY_KEY } from '../../playwright.config.js'
import { importSampleSpec, uploadSamples } from './helpers.js'

// This test server was started with MCQ_CLAUDE_KEY set to a fake "canary" key (playwright.config.js).
// No stand-in here: the browser talks to the real local server function.

test('The key never reaches the browser, but the server function does use it', async ({ page }) => {
  const seen = []
  page.on('response', async (response) => {
    try {
      seen.push({ url: response.url(), text: await response.text(), headers: JSON.stringify(response.headers()) })
    } catch {}
  })

  await page.goto('/')
  await importSampleSpec(page)
  await page.getByRole('button', { name: 'Continue to Content' }).click()
  await uploadSamples(page)
  await page.getByRole('button', { name: 'Continue to Generate' }).click()
  await page.getByRole('button', { name: 'Generate', exact: true }).click()

  // The server function sent the canary key to Claude, which rejected it: proof the server holds and uses it
  await expect(page.getByText('The Claude API rejected the key. Check MCQ_CLAUDE_KEY.')).toBeVisible({ timeout: 30000 })

  // ...and nothing the browser received contains it: not the page, scripts, styles or API replies
  const scripts = seen.filter((r) => /\.(js|jsx|mjs)(\?|$)/.test(r.url) || r.url.includes('/src/'))
  expect(scripts.length).toBeGreaterThan(5)
  for (const r of seen) {
    expect(r.text, r.url).not.toContain(CANARY_KEY)
    expect(r.text, r.url).not.toContain('sk-ant-CANARY')
    expect(r.headers, r.url).not.toContain('CANARY')
  }
  const pageSource = await page.content()
  expect(pageSource).not.toContain('CANARY')
})
