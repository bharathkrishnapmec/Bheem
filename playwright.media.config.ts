import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

/* Records the README gameplay clips and screenshots: `npm run media`. */
export default defineConfig({
  ...base,
  testDir: './tests/media',
  outputDir: './test-results/media',
  timeout: 240_000,
  workers: 1,
  projects: [
    {
      name: 'media',
      use: { ...devices['Desktop Chrome'], viewport: { width: 960, height: 540 }, deviceScaleFactor: 1, video: { mode: 'on', size: { width: 960, height: 540 } } },
    },
  ],
});
