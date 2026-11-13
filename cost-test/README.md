# Cost test

Writes the same question set with several models and effort settings, using the app's own generation code, and records cost, time and the automatic A5 checks for each. Bloom's accuracy is then judged by a person from a blind review sheet.

## Run it

1. Once only: in GitHub, Settings → Secrets and variables → Actions → New repository secret. Name `MCQ_CLAUDE_KEY`, value a Claude API key (ideally one with its own spend limit).
2. Actions tab → **Cost test** → **Run workflow**. Leave the defaults to compare every setting on the PHY101 sample.
3. When it finishes, the run page shows a summary table. Full results are saved to a branch called `cost-results-<run number>`.

## Add a module

Make a folder in `cost-test/modules/` with a `specification.md` (a Part B exported from the app with Download specification) and the teaching files (.pdf, .docx, .pptx, .txt or .md). Then type its folder name in the "modules" box when you run the test, for example `phy101,holderness`.

## Settings compared

See `variants.json`. Prices are in `config/prices.json`.
