import { expect, test, type Page } from '@playwright/test';

/* P3: real inputs (keyboard) drive each weapon against live enemies; verifies costs, damage and the token cap. */
type P = { x: number; y: number; hp: number; st: string; weapon: string; ammo: number; prana: number };
type Hooks = {
  scene: string;
  player(): P;
  god(): void;
  killAll(): void;
  spawn(type: string, dx: number): boolean;
  enemyHp(): number[];
  tokens(): { inUse: number; capacity: number };
  score(): number;
  warp(x: number): void;
  hitBoss(n: number): void;
  boss(): { hp: number; phase: number } | null;
  guardHit(n: number): void;
};
const H = <T>(p: Page, fn: string) => p.evaluate((f) => new Function('h', `return ${f}`)((window as unknown as { __BHEEM__: Hooks }).__BHEEM__), fn) as Promise<T>;

async function start(page: Page, errors: string[]): Promise<void> {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __BHEEM__?: Hooks }).__BHEEM__?.scene === 'MainMenu', null, { timeout: 60_000 });
  await page.locator('canvas').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as unknown as { __BHEEM__?: Hooks }).__BHEEM__?.scene === 'Game', null, { timeout: 30_000 });
  await page.waitForTimeout(800);
  await H(page, 'h.god()');
}

test('sword combo, bow charge and staff bolt all work against live enemies', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  await start(page, errors);
  // sword: three taps of J next to a raider
  expect(await H<boolean>(page, "h.spawn('raider', 60)")).toBe(true);
  await page.waitForTimeout(300);
  const before = await H<number[]>(page, 'h.enemyHp()');
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('j');
    await page.waitForTimeout(180);
  }
  await expect.poll(async () => (await H<number[]>(page, 'h.enemyHp()')).reduce((a, b) => a + b, 0), { timeout: 6_000 }).toBeLessThan(before.reduce((a, b) => a + b, 0));
  await H(page, 'h.killAll()');

  // bow: switch once the sword combo has recovered (mid-combo switches are buffered), hold to charge, release -> one arrow spent
  await expect.poll(async () => (await H<P>(page, 'h.player()')).st, { timeout: 10_000 }).toBe('normal');
  await H(page, 'h.clearLoot()'); // raider drops (arrow bundles) would refill ammo mid-check
  await page.keyboard.press('2');
  await expect.poll(async () => (await H<P>(page, 'h.player()')).weapon, { timeout: 3_000 }).toBe('bow');
  const ammo0 = (await H<P>(page, 'h.player()')).ammo;
  await page.keyboard.down('j');
  await page.waitForTimeout(600);
  await page.keyboard.up('j');
  await expect.poll(async () => (await H<P>(page, 'h.player()')).ammo, { timeout: 3_000, intervals: [30] }).toBeLessThan(ammo0);

  // staff: tap -> bolt spends prana
  await page.keyboard.press('3');
  await expect.poll(async () => (await H<P>(page, 'h.player()')).weapon, { timeout: 3_000 }).toBe('staff');
  const pr0 = (await H<P>(page, 'h.player()')).prana;
  await page.keyboard.press('j');
  await expect.poll(async () => (await H<P>(page, 'h.player()')).prana, { timeout: 3_000, intervals: [30] }).toBeLessThan(pr0);
  expect(errors).toEqual([]);
});

test('attack tokens cap simultaneous melee attackers', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  await start(page, errors);
  for (let i = 0; i < 6; i++) await H(page, `h.spawn('raider', ${i % 2 ? 1 : -1} * ${120 + i * 30})`);
  let maxSeen = 0;
  for (let i = 0; i < 40; i++) {
    const t = await H<{ inUse: number; capacity: number }>(page, 'h.tokens()');
    expect(t.capacity).toBe(2);
    maxSeen = Math.max(maxSeen, t.inUse);
    expect(t.inUse).toBeLessThanOrEqual(t.capacity);
    await page.waitForTimeout(100);
  }
  expect(maxSeen).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('Kaalasura walks through phases 1 → 2 → 3 at the v3 thresholds (75/50 %)', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  await start(page, errors);
  await H(page, 'h.killAll()');
  await H(page, 'h.warp(9000)');
  await expect.poll(async () => (await H<{ hp: number; phase: number } | null>(page, 'h.boss()'))?.phase ?? 0, { timeout: 30_000 }).toBe(1);
  const b0 = (await H<{ hp: number; phase: number }>(page, 'h.boss()'))!;
  expect(b0.hp).toBe(3300);
  // chip the boss down in small hits and record the HP fraction at which each phase starts
  const seen: Record<number, number> = {};
  for (let i = 0; i < 500; i++) {
    const b = await H<{ hp: number; phase: number } | null>(page, 'h.boss()');
    if (!b || b.hp <= 0) break;
    if (!(b.phase in seen)) seen[b.phase] = b.hp / 3300;
    if (b.phase === 3) break;
    await H(page, 'h.hitBoss(60)');
    await page.waitForTimeout(80);
  }
  expect(seen[2]).toBeLessThanOrEqual(0.75);
  expect(seen[2]).toBeGreaterThan(0.5);
  expect(seen[3]).toBeLessThanOrEqual(0.5);
  expect(errors).toEqual([]);
});

test('score: kills award the brief point values and show on the HUD', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  await start(page, errors);
  expect(await H<number>(page, 'h.score()')).toBe(0);
  await H(page, "h.spawn('raider', 80)");
  await H(page, "h.spawn('imp', 120)");
  await page.waitForTimeout(300);
  await H(page, 'h.killAll()');
  await expect.poll(() => H<number>(page, 'h.score()'), { timeout: 3_000 }).toBe(40);
  expect(errors).toEqual([]);
});
