import { defineConfig } from '@playwright/test'

// Browser tests run their own copy of the app on port 5174 with a fake "canary" key,
// so they never use the real key, and can prove the key never reaches the browser.
export const CANARY_KEY = 'sk-ant-CANARY-0000-this-must-never-reach-the-browser'

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5174',
    viewport: { width: 1200, height: 900 },
  },
  webServer: {
    command: 'npx vite --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
    env: { MCQ_CLAUDE_KEY: CANARY_KEY },
  },
})
