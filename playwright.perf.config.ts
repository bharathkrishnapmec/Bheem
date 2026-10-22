import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

/* Frame-time / leak probe across gameplay scenarios: `npx playwright test -c playwright.perf.config.ts`. */
export default defineConfig({
  ...base,
  testDir: './tests/perf',
  outputDir: './test-results/perf',
  timeout: 300_000,
  workers: 1,
  projects: [{ name: 'perf', use: { ...devices['Desktop Chrome'], viewport: { width: 960, height: 540 } } }],
});
