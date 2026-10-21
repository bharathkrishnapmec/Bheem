import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = 'docs/media';
const H = <T>(page: Page, fn: string) => page.evaluate(`(() => { const h = window.__BHEEM__; return ${fn}; })()`) as Promise<T>;
const scene = (page: Page) => H<string>(page, 'h && h.scene');
const t0 = { v: 0 };
const marks: Record<string, number> = {};
const mark = (name: string) => (marks[name] = (Date.now() - t0.v) / 1000);

test.beforeEach(() => {
  t0.v = Date.now();
  mkdirSync(OUT, { recursive: true });
});
// eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixtures argument
test.afterEach(({}, info) => {
  mkdirSync(info.outputDir, { recursive: true });
  writeFileSync(`${info.outputDir}/marks.json`, JSON.stringify({ clip: info.title, ...marks }));
  for (const k of Object.keys(marks)) delete marks[k];
});

async function click(page: Page, gx: number, gy: number) {
  const c = (await page.locator('canvas').boundingBox())!;
  await page.locator('canvas').click({ position: { x: (gx / 960) * c.width, y: (gy / 540) * c.height } });
}
async function menu(page: Page) {
  await page.goto('/');
  await expect.poll(() => scene(page), { timeout: 60_000 }).toBe('MainMenu');
  await page.waitForTimeout(800);
}
async function story(page: Page) {
  await menu(page);
  await page.screenshot({ path: `${OUT}/main-menu.png` });
  await page.locator('canvas').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('Enter');
  await expect.poll(() => scene(page), { timeout: 30_000 }).toBe('Game');
  await page.waitForTimeout(1200);
}
async function tap(page: Page, key: string, ms = 90) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}
/** Real keyboard combat: walk, sword combos, jumps and dashes. */
async function brawl(page: Page, ms: number, dir: 'd' | 'a' = 'd', every?: () => Promise<unknown>) {
  const until = Date.now() + ms;
  let i = 0;
  while (Date.now() < until) {
    await page.keyboard.down(i % 5 === 4 ? (dir === 'd' ? 'a' : 'd') : dir);
    await page.waitForTimeout(220);
    await page.keyboard.up(dir);
    await page.keyboard.up(dir === 'd' ? 'a' : 'd');
    for (let k = 0; k < 3; k++) await tap(page, 'j', 70);
    if (i % 3 === 1) await tap(page, ' ', 160);
    if (i % 4 === 2) await tap(page, 'Shift');
    if (every) await every();
    i++;
  }
}
async function sandboxBoss(page: Page, cardX: number | null, shot?: string) {
  await menu(page);
  await click(page, 480, 330);
  await expect.poll(() => scene(page)).toBe('CreativeMenu');
  await page.keyboard.press('Enter');
  await expect.poll(() => scene(page)).toBe('Game');
  await page.waitForTimeout(400);
  await page.keyboard.press('b');
  await expect.poll(() => scene(page)).toBe('BossSelect');
  await page.waitForTimeout(400);
  if (cardX === null) await click(page, 480, 492);
  else {
    await click(page, cardX, 170);
    await page.waitForTimeout(300);
    if (shot) await page.screenshot({ path: `${OUT}/${shot}` });
    await click(page, cardX, 170);
  }
  await expect.poll(() => H<string>(page, "h.creative ? h.creative().bossStage : ''"), { timeout: 10_000 }).toBe('fight');
  await H(page, 'h.god()');
}

test('01-village-combat', async ({ page }) => {
  await story(page);
  await H(page, 'h.god()');
  await H(page, "h.spawn('raider', 260)");
  await H(page, "h.spawn('imp', 380)");
  await H(page, "h.spawn('raider', 480)");
  mark('start');
  await brawl(page, 6000);
  await page.screenshot({ path: `${OUT}/village-combat.png` });
  await brawl(page, 7000);
  mark('end');
});

test('02-district-liberation', async ({ page }) => {
  await story(page);
  await H(page, 'h.god()');
  await H(page, 'h.warp(580)');
  mark('start');
  let st = '';
  for (let i = 0; i < 40 && st !== 'bannerVulnerable'; i++) {
    await brawl(page, 900);
    if (i % 2 === 1) await H(page, 'h.killAll()');
    if (i % 6 === 5) await H(page, `h.warp(${Math.min(2150, 580 + (i + 1) * 60)})`);
    st = (await H<Record<string, string>>(page, 'h.states()')).gate!;
  }
  mark('banner');
  await H(page, 'h.breakBanner()');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/district-liberated.png` });
  await page.waitForTimeout(3500);
  mark('end');
});

test('03-kaalasura', async ({ page }) => {
  await sandboxBoss(page, null);
  mark('start');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/kaalasura.png` });
  await brawl(page, 15000, 'd', () => H(page, 'h.hitBoss(110)'));
  mark('end');
});

test('04-garjana-sky-citadel', async ({ page }) => {
  await sandboxBoss(page, 359, 'boss-select.png');
  mark('start');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/garjana-sky-citadel.png` });
  await brawl(page, 14000, 'd', () => H(page, 'h.hitBoss(90)'));
  mark('end');
});

test('05-boss-trial-leaderboard', async ({ page }) => {
  await menu(page);
  await click(page, 414, 382);
  await expect.poll(() => scene(page)).toBe('Trials');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/boss-trials.png` });
  mark('start');
  await click(page, 480, 292);
  await expect.poll(() => H<string>(page, "h.creative ? h.creative().bossStage : ''"), { timeout: 10_000 }).toBe('fight');
  const until = Date.now() + 60_000;
  while (Date.now() < until && ((await H<{ hp: number } | null>(page, 'h.boss()'))?.hp ?? 0) > 0) {
    await brawl(page, 600, 'd', () => H(page, 'h.hitBoss(45)'));
  }
  await expect.poll(() => scene(page), { timeout: 20_000 }).toBe('TrialResult');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/trial-result.png` });
  await page.waitForTimeout(1500);
  await click(page, 480, 392);
  await expect.poll(() => scene(page)).toBe('Leaderboard');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/leaderboard.png` });
  await page.waitForTimeout(1500);
  mark('end');
});

test('06-nishachara-lava-forge-shot', async ({ page }) => {
  await sandboxBoss(page, 598);
  await page.waitForTimeout(1500);
  await brawl(page, 3000, 'd', () => H(page, 'h.hitBoss(80)'));
  await page.screenshot({ path: `${OUT}/nishachara-lava-forge.png` });
});
