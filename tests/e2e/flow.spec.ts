import { expect, test, type Page } from '@playwright/test';

/* Drives the whole campaign through test hooks: 4 districts → boss → victory, plus death → retry. */
type Hooks = {
  scene: string;
  warp(x: number): void;
  god(): void;
  killAll(): void;
  breakBanner(): boolean;
  hitBoss(n: number): void;
  killPlayer(): void;
  states(): Record<string, string>;
  boss(): { hp: number; phase: number } | null;
};
const hooks = (p: Page) => ({
  run: <T>(fn: (h: Hooks, a: number) => T, a = 0) =>
    p.evaluate(([src, arg]) => new Function('h', 'a', `return (${src})(h, a)`)((window as unknown as { __BHEEM__: Hooks }).__BHEEM__, arg), [fn.toString(), a] as const) as Promise<T>,
  scene: () => p.evaluate(() => (window as unknown as { __BHEEM__?: Hooks }).__BHEEM__?.scene),
});

async function startGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __BHEEM__?: Hooks }).__BHEEM__?.scene === 'MainMenu', null, { timeout: 60_000 });
  await page.locator('canvas').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as unknown as { __BHEEM__?: Hooks }).__BHEEM__?.scene === 'Game', null, { timeout: 30_000 });
  await page.waitForTimeout(1000);
}

test('liberate all four districts, defeat Kaalasura, reach victory', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await startGame(page);
  const h = hooks(page);
  const route: [string, number, number][] = [
    ['gate', 580, 2150],
    ['market', 2740, 4540],
    ['temple', 5120, 6720],
    ['hall', 7540, 8380],
  ];
  for (const [id, x0, x1] of route) {
    await h.run((hk, x) => hk.warp(x), x0);
    let st = '';
    for (let i = 0; i < 60 && st !== 'bannerVulnerable'; i++) {
      await page.waitForTimeout(500);
      if (i % 4 === 3) await h.run((hk, x) => hk.warp(x), Math.min(x1, x0 + ((i + 1) / 4) * 300));
      await h.run((hk) => (hk.god(), hk.killAll()));
      st = (await h.run((hk) => hk.states()))[id]!;
    }
    expect(st, `${id} banner should become vulnerable`).toBe('bannerVulnerable');
    await h.run((hk) => hk.breakBanner());
    await page.waitForTimeout(1500);
    expect((await h.run((hk) => hk.states()))[id]).toBe('liberated');
  }
  await h.run((hk, x) => hk.warp(x), 8950);
  await page.waitForTimeout(5000);
  expect(await h.run((hk) => hk.boss())).toMatchObject({ hp: 3300, phase: 1 });
  for (let i = 0; i < 240; i++) {
    await h.run((hk) => (hk.god(), hk.hitBoss(250)));
    await page.waitForTimeout(150);
    const b = await h.run((hk) => hk.boss());
    if (!b || b.hp <= 0) break;
  }
  await page.waitForFunction(() => (window as unknown as { __BHEEM__?: Hooks }).__BHEEM__?.scene === 'Victory', null, { timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('death → game over → retry from checkpoint', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startGame(page);
  const h = hooks(page);
  await h.run((hk) => hk.killPlayer());
  await page.waitForFunction(() => (window as unknown as { __BHEEM__?: Hooks }).__BHEEM__?.scene === 'GameOver', null, { timeout: 15_000 });
  await page.waitForTimeout(800);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as unknown as { __BHEEM__?: Hooks }).__BHEEM__?.scene === 'Game', null, { timeout: 15_000 });
  expect(errors).toEqual([]);
});
