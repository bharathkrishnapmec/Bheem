import { expect, test, type Page } from '@playwright/test';

const H = <T>(page: Page, fn: string) => page.evaluate(`(() => { const h = window.__BHEEM__; return ${fn}; })()`) as Promise<T>;
const scene = (page: Page) => H<string>(page, 'h && h.scene');
const local = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('bheem.lb.local.v1') ?? '{}') as Record<string, { value: number; practice?: boolean }[]>);

async function openBruteTrial(page: Page, url = '/') {
  await page.goto(url);
  await expect.poll(() => scene(page), { timeout: 60_000 }).toBe('MainMenu');
  const c = (await page.locator('canvas').boundingBox())!;
  const click = (gx: number, gy: number) => page.locator('canvas').click({ position: { x: (gx / 960) * c.width, y: (gy / 540) * c.height } });
  await click(414, 382);
  await expect.poll(() => scene(page)).toBe('Trials');
  await page.screenshot({ path: 'test-results/trials-select.png' });
  await click(480, 292);
  await expect.poll(() => scene(page)).toBe('Game');
  await expect.poll(() => H<string>(page, 'h.creative().bossStage'), { timeout: 8_000 }).toBe('fight');
  expect(await H<number>(page, 'h.boss().max')).toBe(900);
}

async function killBoss(page: Page) {
  const until = Date.now() + 60_000;
  while (Date.now() < until && ((await H<{ hp: number } | null>(page, 'h.boss()'))?.hp ?? 0) > 0) {
    await H(page, 'h.hitBoss(60)');
    await page.waitForTimeout(40);
  }
  await expect.poll(() => scene(page), { timeout: 20_000 }).toBe('TrialResult');
}

test('trials: Brute from the menu, toolbox locked, death ends the attempt, retry restarts', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openBruteTrial(page);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  expect(await scene(page)).toBe('Game');
  await H(page, 'h.killPlayer()');
  await expect.poll(() => scene(page), { timeout: 10_000 }).toBe('TrialResult');
  await page.screenshot({ path: 'test-results/trial-failed.png' });
  expect(await local(page)).toEqual({});
  const c = (await page.locator('canvas').boundingBox())!;
  await page.locator('canvas').click({ position: { x: 0.5 * c.width, y: (304 / 540) * c.height } });
  await expect.poll(() => H<string>(page, 'h.creative().bossStage'), { timeout: 8_000 }).toBe('fight');
  expect(errors).toEqual([]);
});

test('trials: clean win records a ranked local best; ?debug run is practice only', async ({ page }) => {
  test.setTimeout(200_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openBruteTrial(page);
  await killBoss(page);
  await page.screenshot({ path: 'test-results/trial-cleared.png' });
  await expect.poll(async () => (await local(page))['trial_brute|all']?.length ?? 0).toBe(1);
  expect((await local(page))['trial_brute|all']![0]!.practice).toBeUndefined();
  await openBruteTrial(page, '/?debug=1');
  await killBoss(page);
  await expect.poll(async () => (await local(page))['trial_brute|all']?.length ?? 0).toBe(2);
  expect((await local(page))['trial_brute|all']!.some((r) => r.practice)).toBe(true);
  expect(errors).toEqual([]);
});
