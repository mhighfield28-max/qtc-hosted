import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { importSampleSpec, shot } from './helpers.js'

const files = (dir) =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]))

test('Item 6: no colour or font is set anywhere except the theme file', () => {
  const offenders = []
  for (const file of files('src')) {
    if (file.endsWith('theme.css')) continue
    const text = readFileSync(file, 'utf8')
    const hits = text.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|font-family:\s*(?!var)["'A-Za-z]|\b(?:bg|text|border)-(?:red|green|blue|gray|slate|zinc|amber|yellow|orange|emerald)-\d{2,3}\b/g)
    if (hits) offenders.push(`${file}: ${hits.join(', ')}`)
  }
  expect(offenders).toEqual([])
})

test('Item 6: the page uses the theme values, and changing the theme restyles everything', async ({ page }) => {
  await page.goto('/')
  const css = (sel, prop) => page.locator(sel).first().evaluate((el, p) => getComputedStyle(el)[p], prop)

  expect(await css('html', 'backgroundColor')).toBe('rgb(245, 242, 236)') // Cream
  expect(await css('header', 'backgroundColor')).toBe('rgb(36, 52, 40)') // Field Ink
  expect(await css('main section', 'backgroundColor')).toBe('rgb(255, 255, 255)')
  expect(await css('main section', 'borderTopColor')).toBe('rgb(227, 223, 212)')
  expect(await css('html', 'color')).toBe('rgb(26, 28, 25)') // Near Black
  expect(await css('h1', 'fontFamily')).toContain('Syne')
  expect(await css('h1', 'fontWeight')).toBe('500')
  expect(await css('html', 'fontFamily')).toContain('Inter')
  expect(await css('html', 'fontSize')).toBe('16px')
  const primary = page.getByRole('button', { name: 'Continue to Content' })
  expect(await primary.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(224, 152, 48)') // Spark
  await expect.poll(() => page.evaluate(() => document.fonts.check('500 16px Syne'))).toBe(true)
  await shot(page, '6a-default-theme')

  // Change the theme tokens only (as editing theme.css would) and everything follows
  await page.addStyleTag({
    content: `:root { --color-ink: #3B2A5C; --color-spark: #2F7DD1; --color-cream: #EEF2F7; --font-heading: Georgia, serif; }`,
  })
  expect(await css('header', 'backgroundColor')).toBe('rgb(59, 42, 92)')
  expect(await css('html', 'backgroundColor')).toBe('rgb(238, 242, 247)')
  expect(await primary.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(47, 125, 209)')
  expect(await css('h1', 'fontFamily')).toContain('Georgia')
  await importSampleSpec(page)
  await shot(page, '6b-changed-theme')
})
