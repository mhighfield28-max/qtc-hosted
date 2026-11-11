// Cost test: writes the same question set with different models and effort settings, using
// the app's own generation code, and records what each one costs and how it scores on the
// automatic A5 checks. Bloom's accuracy is judged afterwards by a person, from a blind review sheet.
//
//   MCQ_CLAUDE_KEY=... node scripts/cost-test.mjs --modules phy101 --variants all
//
// Modules are folders in cost-test/modules/: a specification.md plus the teaching files
// (.pdf, .docx, .pptx, .txt, .md). Variants are listed in cost-test/variants.json.
// Results go to cost-results/<date-time>/: one JSON file per module and variant, plus summary.md.
// Normally run by the "Cost test" GitHub Action, so the key stays a GitHub secret.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { generateQuestion, emptyUsage, KEY_NAME } from '../server/generate.js'
import { specFromMarkdown, specToMarkdown } from '../src/lib/specification.js'
import { planSlots } from '../src/lib/plan.js'
import { runChecks, runSetChecks, QUESTION_CHECKS } from '../src/lib/checks.js'
import { extractPptx } from '../src/lib/extract.js'
import settings from '../config/settings.json' with { type: 'json' }
import prices from '../config/prices.json' with { type: 'json' }
import allVariants from '../cost-test/variants.json' with { type: 'json' }

const ROOT = new URL('..', import.meta.url).pathname
const PARALLEL = settings.parallelQuestions || 3
const TOKEN_FIELDS = ['inputTokens', 'outputTokens', 'cacheWriteTokens', 'cacheReadTokens']

// ---------- Cost ----------

export function costOf(usage, model, table = prices) {
  const p = table[model]
  if (!p) return null
  // Haiku's 5x rate above 100K prompt tokens isn't applied: one question's prompt is far smaller.
  return (
    ((usage.inputTokens ?? 0) * p.input +
      (usage.outputTokens ?? 0) * p.output +
      (usage.cacheWriteTokens ?? 0) * p.cacheWrite +
      (usage.cacheReadTokens ?? 0) * p.cacheRead) /
    1e6
  )
}

export function sumUsage(list) {
  const total = emptyUsage()
  for (const u of list) for (const f of TOKEN_FIELDS) total[f] += u?.[f] ?? 0
  return total
}

// ---------- Reading a module ----------

async function extractFile(path) {
  const ext = extname(path).toLowerCase()
  const buffer = readFileSync(path)
  if (ext === '.txt' || ext === '.md') return buffer.toString('utf8')
  if (ext === '.docx') {
    const mammoth = (await import('mammoth')).default
    return (await mammoth.extractRawText({ buffer })).value.replace(/\n{3,}/g, '\n\n').trim()
  }
  if (ext === '.pptx') return extractPptx(buffer)
  if (ext === '.pdf') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise
    const pages = []
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent()
      pages.push(`[Page ${n}]\n${content.items.map((i) => i.str + (i.hasEOL ? '\n' : ' ')).join('').trim()}`)
    }
    return pages.join('\n\n')
  }
  return null
}

export async function loadModule(name) {
  const dir = join(ROOT, 'cost-test', 'modules', name)
  const { spec } = specFromMarkdown(readFileSync(join(dir, 'specification.md'), 'utf8'))
  const sources = []
  for (const file of readdirSync(dir).sort()) {
    if (file === 'specification.md' || file.startsWith('.')) continue
    const text = await extractFile(join(dir, file))
    if (text?.trim()) sources.push({ name: file, text })
  }
  if (!sources.length) throw new Error(`Module "${name}" has no readable teaching files.`)
  const houseRules = readFileSync(join(ROOT, 'docs', 'house-rules.md'), 'utf8')
  const specification = specToMarkdown(spec, { houseRules, contentSource: sources.map((s) => s.name).join(', ') })
  return { name, spec, sources, specification, slots: planSlots(spec) }
}

// ---------- Running one module with one variant ----------

export async function runVariant(mod, variantId, variant, { apiKey, client, log = console.log } = {}) {
  const overrides = { model: variant.model, effort: variant.effort }
  const queue = [...mod.slots]
  const stems = []
  const results = []
  const started = Date.now()

  async function worker() {
    while (queue.length) {
      const slot = queue.shift()
      const t0 = Date.now()
      const entry = { id: slot.id, number: slot.number, targetLevel: slot.level, outcome: slot.outcome.code }
      try {
        const res = await generateQuestion(
          { specification: mod.specification, sources: mod.sources, slot, total: mod.slots.length, previousStems: [...stems] },
          { apiKey, client, overrides },
        )
        entry.usage = res.usage
        if (res.question) {
          stems.push(res.question.stem)
          const { checks, reasons } = runChecks(res.question, mod.spec)
          Object.assign(entry, { question: res.question, checks, reasons, attempts: res.attempts })
        } else {
          entry.flagged = res.flagged.reason
        }
      } catch (error) {
        entry.error = error.message
        entry.usage = error.usage ?? emptyUsage()
      }
      entry.seconds = (Date.now() - t0) / 1000
      results.push(entry)
      log(`  ${variantId} ${slot.id} ${entry.question ? 'ok' : entry.flagged ? 'flagged' : 'error'} (${entry.seconds.toFixed(0)}s)`)
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker))
  results.sort((a, b) => a.number - b.number)

  const usage = sumUsage(results.map((r) => r.usage))
  const written = results.filter((r) => r.question)
  const checkPasses = Object.fromEntries(
    QUESTION_CHECKS.map((c) => [c.key, written.filter((r) => r.checks[c.key]).length]),
  )
  const setChecks = runSetChecks(written.map((r) => r.question), mod.spec)
  return {
    module: mod.name,
    variant: variantId,
    label: variant.label,
    model: variant.model,
    effort: variant.effort,
    questions: mod.slots.length,
    written: written.length,
    flagged: results.filter((r) => r.flagged).length,
    errors: results.filter((r) => r.error).length,
    allChecksPassed: written.filter((r) => Object.values(r.checks).every(Boolean)).length,
    checkPasses,
    distributionOk: setChecks.distribution.ok,
    usage,
    cost: costOf(usage, variant.model),
    minutes: (Date.now() - started) / 60000,
    results,
  }
}

// ---------- Summary ----------

const money = (n) => (n == null ? 'n/a' : `$${n.toFixed(2)}`)

export function summaryMarkdown(runs, when) {
  const lines = [
    `# Cost test, ${when}`,
    '',
    'Cost uses config/prices.json. "All checks" counts questions that passed every automatic A5 check; Bloom\'s accuracy still needs a person (blind review).',
    '',
  ]
  for (const mod of [...new Set(runs.map((r) => r.module))]) {
    lines.push(`## ${mod}`, '', '| Setting | Cost per set | Written | Flagged | Errors | All checks | Output tokens | Minutes |', '| --- | --- | --- | --- | --- | --- | --- | --- |')
    for (const r of runs.filter((x) => x.module === mod)) {
      lines.push(
        `| ${r.label} | ${money(r.cost)} | ${r.written}/${r.questions} | ${r.flagged} | ${r.errors} | ${r.allChecksPassed}/${r.written} | ${r.usage.outputTokens.toLocaleString('en-GB')} | ${r.minutes.toFixed(1)} |`,
      )
    }
    lines.push('')
  }
  const errored = runs.flatMap((r) => r.results.filter((x) => x.error).map((x) => `- ${r.module} / ${r.variant} / ${x.id}: ${x.error}`))
  if (errored.length) lines.push('## Errors', '', ...[...new Set(errored)].slice(0, 30), '')
  return lines.join('\n')
}

// ---------- Command line ----------

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}

async function main() {
  const apiKey = process.env[KEY_NAME]
  if (!apiKey) throw new Error(`Set ${KEY_NAME} (a GitHub secret when run as an Action).`)
  const moduleNames = arg('modules', 'phy101').split(',').map((s) => s.trim()).filter(Boolean)
  const wanted = arg('variants', 'all')
  const variantIds = wanted === 'all' ? Object.keys(allVariants).filter((k) => !k.startsWith('_')) : wanted.split(',').map((s) => s.trim())
  for (const v of variantIds) if (!allVariants[v]) throw new Error(`Unknown variant "${v}". See cost-test/variants.json.`)

  const when = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const outDir = join(ROOT, 'cost-results', when.replace(/[: ]/g, '-'))
  mkdirSync(outDir, { recursive: true })

  const runs = []
  for (const name of moduleNames) {
    const mod = await loadModule(name)
    console.log(`Module ${name}: ${mod.slots.length} questions from ${mod.sources.length} files`)
    for (const id of variantIds) {
      const run = await runVariant(mod, id, allVariants[id], { apiKey })
      writeFileSync(join(outDir, `${name}--${id}.json`), JSON.stringify(run, null, 2))
      console.log(`  ${id}: ${money(run.cost)}, ${run.written}/${run.questions} written, ${run.minutes.toFixed(1)} min`)
      runs.push(run)
    }
  }
  const summary = summaryMarkdown(runs, when)
  writeFileSync(join(outDir, 'summary.md'), summary)
  console.log(`\n${summary}\nResults in ${outDir}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message)
    process.exit(1)
  })
}
