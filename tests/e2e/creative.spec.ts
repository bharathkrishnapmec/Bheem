import { expect, test, type Page } from '@playwright/test';

const H = <T>(page: Page, fn: string) => page.evaluate(`(() => { const h = window.__BHEEM__; return ${fn}; })()`) as Promise<T>;
const scene = (page: Page) => H<string>(page, 'h && h.scene');

async function openSandbox(page: Page) {
  await page.goto('/');
  await expect.poll(() => scene(page), { timeout: 60_000 }).toBe('MainMenu');
  const c = (await page.locator('canvas').boundingBox())!;
  await page.locator('canvas').click({ position: { x: (480 / 960) * c.width, y: (330 / 540) * c.height } });
  await expect.poll(() => scene(page)).toBe('CreativeMenu');
  await page.keyboard.press('Enter');
  await expect.poll(() => scene(page)).toBe('Game');
}

test('creative: max loadout, no Story save, cap-aware spawn queue, quick reset < 500 ms', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await openSandbox(page);
  const c = await H<{ mode: string; upgrades: Record<string, number>; rally: number }>(page, 'h.creative()');
  expect(c.mode).toBe('creative');
  expect(c.upgrades).toEqual({ might: 3, vitality: 3, quiver: 2, prana: 3, rally: 3 });
  expect(c.rally).toBe(100);
  for (let i = 0; i < 15; i++) await H(page, "h.tool('spawn','imp')");
  await expect.poll(() => H<number>(page, 'h.creative().alive')).toBe(12);
  expect(await H<number>(page, 'h.creative().queue')).toBe(3);
  await page.waitForTimeout(200);
  const ms = await page.evaluate(() => {
    const t = performance.now();
    (window as unknown as { __BHEEM__: { creativeReset: () => void } }).__BHEEM__.creativeReset();
    return performance.now() - t;
  });
  expect(ms).toBeLessThan(500);
  expect(await H<number>(page, 'h.creative().alive')).toBe(0);
  expect(await H<number>(page, 'h.creative().queue')).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('bheem.save.v1')?.includes('"progress":{') ?? false)).toBe(false);
  expect(errors).toEqual([]);
});

test('creative: Toolbox + Boss Select by keyboard, phase-2 Kaalasura, result panel, rematch', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await openSandbox(page);
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await expect.poll(() => scene(page)).toBe('Toolbox');
  await page.keyboard.press('Enter'); // God Mode ON
  await page.keyboard.press('Tab');
  await expect.poll(() => scene(page)).toBe('Game');
  await page.waitForTimeout(300);
  await page.keyboard.press('b');
  await expect.poll(() => scene(page)).toBe('BossSelect');
  // Boss Select rows (960x540 game space): Start phase at y=336, FIGHT! at y=492. Clicks are frame-rate independent.
  const c = (await page.locator('canvas').boundingBox())!;
  const click = (gy: number) => page.locator('canvas').click({ position: { x: 0.5 * c.width, y: (gy / 540) * c.height } });
  await click(336);
  await page.waitForTimeout(200);
  await click(492);
  await expect.poll(() => H<string>(page, 'h.creative().bossStage'), { timeout: 5_000 }).toBe('fight');
  // Game-clock latency from scene start to the fight going live (brief: < 1 s).
  expect(await H<number>(page, 'h.creative().fightStartMs')).toBeLessThan(1000);
  expect(await H<number>(page, 'h.boss().phase')).toBe(2);
  for (let i = 0; i < 400 && ((await H<{ hp: number } | null>(page, 'h.boss()'))?.hp ?? 0) > 0; i++) {
    await H(page, 'h.hitBoss(150)');
    await page.waitForTimeout(60);
  }
  await expect.poll(() => scene(page), { timeout: 15_000 }).toBe('CreativeResult');
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await expect.poll(() => H<string>(page, 'h.creative().bossStage'), { timeout: 5_000 }).toBe('fight');
  expect((await H<{ hp: number }>(page, 'h.boss()')).hp).toBe(2475);
  expect(errors).toEqual([]);
});

test('creative: Nishachara from Boss Select, Lava Forge, clones in phase 2, result panel', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await openSandbox(page);
  await page.waitForTimeout(300);
  await H(page, 'h.god()');
  await page.keyboard.press('b');
  await expect.poll(() => scene(page)).toBe('BossSelect');
  // Third of four registry cards (centre at 598,170 in 960x540 game space): first click selects, second fights.
  const c = (await page.locator('canvas').boundingBox())!;
  const card = () => page.locator('canvas').click({ position: { x: (598 / 960) * c.width, y: (170 / 540) * c.height } });
  await card();
  await page.waitForTimeout(200);
  await card();
  await expect.poll(() => H<string>(page, 'h.creative().bossStage'), { timeout: 8_000 }).toBe('fight');
  expect((await H<{ id: string }>(page, 'h.arena()')).id).toBe('lava_forge');
  expect(await H<number>(page, 'h.boss().max')).toBe(2600);
  await H(page, 'h.god()');
  for (let i = 0; i < 200 && (await H<number>(page, 'h.boss().phase')) < 2; i++) {
    await H(page, 'h.hitBoss(60)');
    await page.waitForTimeout(30);
  }
  await expect.poll(() => H<number>(page, 'h.boss().clones'), { timeout: 10_000 }).toBeGreaterThan(0);
  // Thousand Shadows windows are invulnerable, so keep hitting by wall clock rather than by count.
  const until = Date.now() + 150_000;
  while (Date.now() < until && ((await H<{ hp: number } | null>(page, 'h.boss()'))?.hp ?? 0) > 0) {
    await H(page, 'h.hitBoss(150)');
    await page.waitForTimeout(40);
  }
  await expect.poll(() => scene(page), { timeout: 20_000 }).toBe('CreativeResult');
  expect(errors).toEqual([]);
});

test('creative: Brute Champion from Boss Select, Berserk at 50 %, Imps on every third attack, result panel', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await openSandbox(page);
  await page.waitForTimeout(300);
  await H(page, 'h.god()');
  await page.keyboard.press('b');
  await expect.poll(() => scene(page)).toBe('BossSelect');
  const c = (await page.locator('canvas').boundingBox())!;
  const card = () => page.locator('canvas').click({ position: { x: (837 / 960) * c.width, y: (170 / 540) * c.height } });
  await card();
  await page.waitForTimeout(200);
  await card();
  await expect.poll(() => H<string>(page, 'h.creative().bossStage'), { timeout: 8_000 }).toBe('fight');
  expect(await H<number>(page, 'h.boss().max')).toBe(900);
  await H(page, 'h.god()');
  for (let i = 0; i < 100 && (await H<number>(page, 'h.boss().phase')) < 2; i++) {
    await H(page, 'h.hitBoss(40)');
    await page.waitForTimeout(30);
  }
  await expect.poll(() => H<boolean>(page, 'h.boss().berserk')).toBe(true);
  await expect.poll(() => H<number>(page, 'h.boss().imps'), { timeout: 40_000 }).toBeGreaterThan(0);
  const until = Date.now() + 60_000;
  while (Date.now() < until && ((await H<{ hp: number } | null>(page, 'h.boss()'))?.hp ?? 0) > 0) {
    await H(page, 'h.hitBoss(60)');
    await page.waitForTimeout(40);
  }
  await expect.poll(() => scene(page), { timeout: 20_000 }).toBe('CreativeResult');
  expect(errors).toEqual([]);
});
