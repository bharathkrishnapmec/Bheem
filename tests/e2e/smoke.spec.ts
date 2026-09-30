import { expect, test } from '@playwright/test';

type Hooks = { scene: string; player?: () => { x: number; y: number; hp: number; st: string } };

test('boot → menu → start → move → attack with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __BHEEM__?: Hooks }).__BHEEM__?.scene === 'MainMenu', null, { timeout: 60_000 });
  await page.locator('canvas').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as unknown as { __BHEEM__?: Hooks }).__BHEEM__?.scene === 'Game', null, { timeout: 30_000 });
  await page.waitForTimeout(800);
  const x0 = await page.evaluate(() => (window as unknown as { __BHEEM__: Hooks }).__BHEEM__.player!().x);
  await page.keyboard.down('D');
  await page.waitForTimeout(900);
  await page.keyboard.up('D');
  const x1 = await page.evaluate(() => (window as unknown as { __BHEEM__: Hooks }).__BHEEM__.player!().x);
  expect(x1).toBeGreaterThan(x0 + 50);
  await page.keyboard.press('Space');
  await page.keyboard.press('J');
  await page.waitForTimeout(150);
  const st = await page.evaluate(() => (window as unknown as { __BHEEM__: Hooks }).__BHEEM__.player!().st);
  expect(st).toBe('attack');
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => (window as unknown as { __BHEEM__?: Hooks }).__BHEEM__?.scene === 'Pause');
  expect(errors).toEqual([]);
});
