/* eslint-disable @typescript-eslint/no-explicit-any -- probes read Phaser internals in the page */
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const H = <T>(page: Page, fn: string) => page.evaluate(`(() => { const h = window.__BHEEM__; return ${fn}; })()`) as Promise<T>;
const scene = (page: Page) => H<string>(page, 'h && h.scene');

async function click(page: Page, gx: number, gy: number) {
  const c = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(c.x + (gx / 960) * c.width, c.y + (gy / 540) * c.height);
}
async function tap(page: Page, key: string, ms = 70) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

/** Samples world invariants; returns violations (deduped by kind). */
async function check(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const nearBodies = (gs: any, p: any) => {
      const world = gs.physics.world;
        const near = (b: any) => b.gameObject !== p && Math.abs(b.center.x - p.x) < b.width / 2 + 40 && b.top > p.y - 60 && b.top < p.y + 60;
        const fmt = (b: any) => `${b.gameObject?.texture?.key}/${b.gameObject?.constructor?.name} imm=${b.immovable} en=${b.enable} ${Math.round(b.x)},${Math.round(b.y)} ${b.width}x${b.height}`;
      return [...world.staticBodies.entries.filter(near).map((b: unknown) => 'S ' + fmt(b)), ...world.bodies.entries.filter(near).map((b: unknown) => 'D ' + fmt(b))].join(' | ');
    };
    const g = (window as unknown as { __GAME__: Phaser.Game }).__GAME__;
    const gs = g.scene.getScene('Game') as unknown as { w?: Record<string, any>; sys: Phaser.Scenes.Systems };
    const out: string[] = [];
    if (!gs?.sys.isActive() || !gs.w?.player) return out;
    const w = gs.w;
    const L = w.level;
    const bad = (n: number) => !Number.isFinite(n);
    const p = w.player;
    if (bad(p.x) || bad(p.y) || bad(p.hp)) out.push(`player NaN ${p.x},${p.y},${p.hp}`);
    if (p.x < -20 || p.x > L.width + 20) out.push(`player out of level x=${Math.round(p.x)} y=${Math.round(p.y)} w=${L.width} arena=${L.arenaId} st=${p.st} v=${Math.round(p.body.velocity.x)},${Math.round(p.body.velocity.y)} boss=${w.boss?.currentAttack ?? '-'}/${w.boss?.isAlive?.()} blocked=${JSON.stringify(p.body.blocked)} near=${nearBodies(gs, p)}`);
    if (p.hp < 0 || p.hp > p.maxHp + 0.01) out.push(`player hp ${p.hp}/${p.maxHp}`);
    if (bad(p.prana) || p.prana < 0) out.push(`prana ${p.prana}`);
    if (p.ammo < 0 || p.ammo > p.maxAmmo) out.push(`ammo ${p.ammo}/${p.maxAmmo}`);
    for (const e of w.enemies) {
      if (!e.isAlive()) continue;
      if (bad(e.x) || bad(e.y)) out.push(`enemy NaN ${e.type}`);
      else if (e.x < -40 || e.x > L.width + 40 || e.y < -500) out.push(`enemy out of level ${e.type} ${Math.round(e.x)},${Math.round(e.y)}`);
      if (e.hp > e.maxHp + 0.01) out.push(`enemy hp>max ${e.type}`);
    }
    const b = w.boss;
    if (b?.active && b.isAlive()) {
      if (bad(b.x) || bad(b.y) || bad(b.hp)) out.push('boss NaN');
      const a = L.bossArena;
      if (a && (b.x < a.x0 - 60 || b.x > a.x1 + 60)) out.push(`boss outside arena ${Math.round(b.x)} [${a.x0},${a.x1}]`);
      if (b.y > L.height + 50) out.push(`boss below level ${Math.round(b.y)}`);
    }
    const cam = gs.sys.cameras.main;
    if (bad(cam.scrollX) || bad(cam.scrollY)) out.push('camera NaN');
    const ui = g.scene.getScene('UI');
    const order = g.scene.getScenes(true).map((s) => s.scene.key);
    for (const k of ['Pause', 'GameOver', 'TrialResult', 'Toolbox', 'BossSelect', 'Shrine'])
      if (order.includes(k) && ui && order.indexOf(k) < order.indexOf('UI')) out.push(`${k} under UI`);
    return out;
  });
}

class Watch {
  issues = new Map<string, number>();
  errors: string[] = [];
  shots = 0;
  constructor(
    private page: Page,
    private info: TestInfo,
  ) {
    page.on('pageerror', (e) => this.errors.push(`pageerror: ${e.message} @ ${(e.stack ?? "").split("\n").slice(1, 6).join(" < ")}`));
    page.on('console', (m) => {
      if (m.type() === 'error') this.errors.push(`console: ${m.text()}`);
    });
  }
  async sample(label: string) {
    for (const v of await check(this.page)) {
      const k = `${label}: ${v.replace(/-?\d+(\.\d+)?/g, '#')}`;
      if (!this.issues.has(k)) {
        console.info(`GLITCH ${label}: ${v}`);
        await this.shot('glitch');
      }
      this.issues.set(k, (this.issues.get(k) ?? 0) + 1);
    }
  }
  async shot(name: string) {
    await this.page.screenshot({ path: this.info.outputPath(`${String(++this.shots).padStart(2, '0')}-${name}.png`) });
  }
  async play(label: string, ms: number, extra?: (i: number) => Promise<unknown>) {
    const until = Date.now() + ms;
    let i = 0;
    const keys = ['d', 'd', 'a', 'd', 'w'];
    while (Date.now() < until) {
      const dir = keys[i % keys.length]!;
      await this.page.keyboard.down(dir);
      await tap(this.page, 'j', 60);
      if (i % 2) await tap(this.page, ' ', 120);
      if (i % 3 === 0) await tap(this.page, 'Shift', 50);
      if (i % 9 === 4) await tap(this.page, String((i % 3) + 1), 40); // weapon swap
      if (i % 13 === 6) await tap(this.page, 'q', 40);
      if (i % 17 === 8) await tap(this.page, 'r', 40); // summon
      await this.page.keyboard.up(dir);
      if (extra) await extra(i);
      if (i % 2 === 0) await this.sample(label);
      i++;
    }
  }
  report() {
    if (this.errors.length) console.info(`ERRORS ${[...new Set(this.errors)].slice(0, 10).join(' | ')}`);
    console.info(`SUMMARY issues=${this.issues.size} errors=${this.errors.length}`);
  }
}

async function menu(page: Page) {
  await page.goto('/');
  await expect.poll(() => scene(page), { timeout: 60_000 }).toBe('MainMenu');
  await page.waitForTimeout(600);
}
async function sandbox(page: Page) {
  await menu(page);
  await click(page, 480, 330);
  await expect.poll(() => scene(page)).toBe('CreativeMenu');
  await page.keyboard.press('Enter');
  await expect.poll(() => scene(page)).toBe('Game');
  await page.waitForTimeout(500);
}
async function bossFromSelect(page: Page, cardX: number | null) {
  await page.keyboard.press('b');
  await expect.poll(() => scene(page)).toBe('BossSelect');
  await page.waitForTimeout(300);
  if (cardX === null) await click(page, 480, 492);
  else {
    await click(page, cardX, 170);
    await page.waitForTimeout(250);
    await click(page, cardX, 170);
  }
  await expect.poll(() => H<string>(page, "h.creative ? h.creative().bossStage : ''"), { timeout: 15_000 }).toBe('fight');
}

test.describe.configure({ mode: 'serial' });

test('story: full run with real input, death, retry, pause spam', async ({ page }, info) => {
  const W = new Watch(page, info);
  await menu(page);
  await click(page, 480, 250);
  await expect.poll(() => scene(page), { timeout: 30_000 }).toBe('Game');
  await page.waitForTimeout(1000);
  await W.shot('village-start');
  await W.play('village', 12000);
  await W.shot('village-combat');
  // pause/resume spam
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120 + i * 30);
    await W.sample('pause-spam');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(80);
  }
  await W.shot('after-pause-spam');
  // die and retry from checkpoint
  await H(page, 'h.killPlayer()');
  await expect.poll(() => H<boolean>(page, "(() => { const g = window.__GAME__; return g.scene.isActive('GameOver'); })()"), { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(800);
  await W.shot('game-over');
  await page.keyboard.press('Enter');
  await expect.poll(() => H<boolean>(page, "(() => window.__GAME__.scene.isActive('GameOver'))()"), { timeout: 15_000 }).toBe(false);
  await page.waitForTimeout(800);
  await W.sample('retry');
  await W.shot('retry');
  await H(page, 'h.god()');
  // districts: real combat with periodic clears
  for (let d = 0; d < 4; d++) {
    const states = await H<Record<string, string>>(page, 'h.states()');
    const next = Object.entries(states).find(([, s]) => s !== 'liberated');
    if (!next) break;
    const x = await page.evaluate((id) => {
      const gs = (window as any).__GAME__.scene.getScene('Game');
      const dd = gs.w.level.districts.find((q: any) => q.id === id);
      return (dd.bounds.x0 + dd.bounds.x1) / 2;
    }, next[0]);
    await H(page, `h.warp(${Math.round(x)})`);
    await W.play(`district-${next[0]}`, 7000);
    await W.shot(`district-${next[0]}`);
    for (let k = 0; k < 40; k++) {
      await H(page, 'h.killAll()');
      await H(page, 'h.breakBanner()');
      await page.waitForTimeout(250);
      await W.sample(`district-${next[0]}`);
      if ((await H<Record<string, string>>(page, 'h.states()'))[next[0]] === 'liberated') break;
    }
    await page.waitForTimeout(1500);
    await W.shot(`liberated-${next[0]}`);
  }
  W.report();
});

for (const [name, x] of [
  ['kaalasura', null],
  ['garjana', 359],
  ['nishachara', 598],
  ['brute', 837],
] as const) {
  test(`boss ${name}: real input through every phase`, async ({ page }, info) => {
    const W = new Watch(page, info);
    await sandbox(page);
    await bossFromSelect(page, x);
    await H(page, 'h.god()');
    await page.waitForTimeout(600);
    await W.shot(`${name}-start`);
    let lastPhase = 1;
    await W.play(name, 45000, async (i) => {
      if (i % 3 === 0) await H(page, 'h.hitBoss && h.hitBoss(45)');
      const b = await H<{ phase: number } | null>(page, 'h.boss ? h.boss() : null');
      if (b && b.phase !== lastPhase) {
        lastPhase = b.phase;
        await page.waitForTimeout(700);
        await W.shot(`${name}-phase${b.phase}`);
      }
      if (!b && i % 5 === 0) return;
    });
    await page.waitForTimeout(1500);
    await W.shot(`${name}-end`);
    // rematch then reset spam
    for (let r = 0; r < 3; r++) {
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(150);
      await W.sample(`${name}-reset`);
    }
    await W.shot(`${name}-after-reset`);
    W.report();
  });
}

test('creative sandbox: arenas, crowd, hazards, toolbox spam', async ({ page }, info) => {
  const W = new Watch(page, info);
  await sandbox(page);
  for (let i = 0; i < 14; i++) await H(page, `h.tool('spawn', '${['raider', 'imp', 'boneArcher', 'mireHexer', 'brute'][i % 5]}')`);
  await W.play('sandbox-crowd', 12000);
  await W.shot('sandbox-crowd');
  for (let i = 0; i < 5; i++) {
    await tap(page, 'Tab', 60);
    await page.waitForTimeout(150);
    await W.sample('toolbox-spam');
    await tap(page, 'Tab', 60);
    await page.waitForTimeout(100);
  }
  await W.shot('after-toolbox-spam');
  W.report();
});
