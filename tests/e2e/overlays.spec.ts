import { expect, test, type Page } from '@playwright/test';

type G = { scene: { getIndex(k: string): number; getScene(k: string): { menu?: { index: number } } } };
const H = <T>(page: Page, expr: string) => page.evaluate((e) => new Function('h', `return (${e})`)((window as unknown as { __BHEEM__: unknown }).__BHEEM__) as T, expr);
const scene = (page: Page) => H<string>(page, 'h && h.scene');
const above = (page: Page, k: string) => page.evaluate((key) => { const g = (window as unknown as { __GAME__: G }).__GAME__; return g.scene.getIndex(key) > g.scene.getIndex('UI'); }, k);

test('overlays draw above the HUD and the Toolbox responds to the keyboard', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect.poll(() => scene(page), { timeout: 60_000 }).toBe('MainMenu');
  const c = (await page.locator('canvas').boundingBox())!;
  await page.locator('canvas').click({ position: { x: 0.5 * c.width, y: (330 / 540) * c.height } });
  await expect.poll(() => scene(page)).toBe('CreativeMenu');
  await page.keyboard.press('Enter');
  await expect.poll(() => scene(page)).toBe('Game');
  await page.waitForTimeout(300);

  await page.keyboard.press('Tab');
  await expect.poll(() => scene(page)).toBe('Toolbox');
  expect(await above(page, 'Toolbox')).toBe(true);
  const idx = () => page.evaluate(() => (window as unknown as { __GAME__: G }).__GAME__.scene.getScene('Toolbox').menu?.index ?? -1);
  expect(await idx()).toBe(0);
  await page.keyboard.press('ArrowDown');
  await expect.poll(idx).toBe(1);
  await page.keyboard.press('ArrowUp');
  await expect.poll(idx).toBe(0);
  await page.keyboard.press('Tab');
  await expect.poll(() => scene(page)).toBe('Game');
  await page.waitForTimeout(300);

  await page.keyboard.press('Escape');
  await expect.poll(() => scene(page)).toBe('Pause');
  expect(await above(page, 'Pause')).toBe(true);
  expect(errors).toEqual([]);
});
