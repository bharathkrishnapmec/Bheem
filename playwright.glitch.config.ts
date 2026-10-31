import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

/* Adversarial invariant sweep across modes/arenas: `npm run glitch`. */
export default defineConfig({
  ...base,
  testDir: './tests/glitch',
  outputDir: './test-results/glitch',
  timeout: 300_000,
  workers: 1,
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 960, height: 540 } } },
    { name: 'pixel7', use: { ...devices['Pixel 7'], viewport: { width: 915, height: 412 }, isMobile: true, hasTouch: true } },
  ],
});
