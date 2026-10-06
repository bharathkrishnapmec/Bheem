import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [
    { name: 'chromium', testIgnore: /mobile\.spec/, use: { ...devices['Desktop Chrome'] } },
    { name: 'pixel7', testMatch: /mobile\.spec/, use: { ...devices['Pixel 7 landscape'] } },
    // iPhone 14 viewport/UA/touch emulated in Chromium (WebKit is not installed in CI).
    { name: 'iphone14', testMatch: /mobile\.spec/, use: { ...devices['iPhone 14 landscape'], defaultBrowserType: 'chromium', browserName: 'chromium' } },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
