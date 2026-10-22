import { expect, test, type Page } from '@playwright/test';

const H = <T>(page: Page, fn: string) => page.evaluate(`(() => { const h = window.__BHEEM__; return ${fn}; })()`) as Promise<T>;
const scene = (page: Page) => H<string>(page, 'h && h.scene');

async function click(page: Page, gx: number, gy: number) {
  const c = (await page.locator('canvas').boundingBox())!;
  await page.locator('canvas').click({ position: { x: (gx / 960) * c.width, y: (gy / 540) * c.height } });
}
async function tap(page: Page, key: string, ms = 80) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}
async function brawl(page: Page, ms: number, every?: () => Promise<unknown>) {
  const until = Date.now() + ms;
  let i = 0;
  while (Date.now() < until) {
    const dir = i % 5 === 4 ? 'a' : 'd';
    await page.keyboard.down(dir);
    await page.waitForTimeout(200);
    await page.keyboard.up(dir);
    for (let k = 0; k < 3; k++) await tap(page, 'j', 60);
    if (i % 3 === 1) await tap(page, ' ', 150);
    if (i % 4 === 2) await tap(page, 'Shift');
    if (every) await every();
    i++;
  }
}

/** Installs a rAF sampler plus Phaser object counters; returns a reader. */
async function startProbe(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __PROBE__: { dts: number[]; last: number; on: boolean } };
    w.__PROBE__ = { dts: [], last: performance.now(), on: true };
    const tick = (t: number) => {
      const p = w.__PROBE__;
      if (!p.on) return;
      p.dts.push(t - p.last);
      p.last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
async function counts(page: Page) {
  return page.evaluate(() => {
    const g = (window as unknown as { __GAME__: Phaser.Game }).__GAME__;
    const out: Record<string, number> = {};
    for (const s of g.scene.getScenes(true)) {
      const k = s.scene.key;
      out[`${k}.display`] = s.children.list.length;
      out[`${k}.tweens`] = s.tweens.getTweens().length;
      out[`${k}.timers`] = (s.time as unknown as { _active: unknown[] })._active?.length ?? 0;
      const body = (s as unknown as { physics?: { world?: { bodies: { size: number } } } }).physics?.world?.bodies;
      if (body) out[`${k}.bodies`] = body.size;
    }
    out.heapMB = Math.round(((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1e6);
    out.fps = Math.round(g.loop.actualFps);
    return out;
  });
}
async function stopProbe(page: Page, label: string, before: Record<string, number>) {
  const dts = await page.evaluate(() => {
    const p = (window as unknown as { __PROBE__: { dts: number[]; on: boolean } }).__PROBE__;
    p.on = false;
    return p.dts.slice(5);
  });
  const s = [...dts].sort((a, b) => a - b);
  const q = (f: number) => Math.round(s[Math.floor(f * (s.length - 1))]! * 10) / 10;
  const after = await counts(page);
  const delta: Record<string, string> = {};
  for (const k of Object.keys(after)) if (k !== 'fps' && (before[k] ?? 0) !== after[k]) delta[k] = `${before[k] ?? 0}→${after[k]}`;
  console.info(`PERF ${label}: frames=${s.length} p50=${q(0.5)} p95=${q(0.95)} p99=${q(0.99)} max=${q(1)} >50ms=${s.filter((d) => d > 50).length} fps=${after.fps} ${JSON.stringify(delta)}`);
}

async function menu(page: Page) {
  await page.goto('/');
  await expect.poll(() => scene(page), { timeout: 60_000 }).toBe('MainMenu');
  await page.waitForTimeout(800);
}
async function sandboxBoss(page: Page, cardX: number | null) {
  await menu(page);
  await click(page, 480, 330);
  await expect.poll(() => scene(page)).toBe('CreativeMenu');
  await page.keyboard.press('Enter');
  await expect.poll(() => scene(page)).toBe('Game');
  await page.waitForTimeout(400);
  await page.keyboard.press('b');
  await expect.poll(() => scene(page)).toBe('BossSelect');
  await page.waitForTimeout(300);
  if (cardX === null) await click(page, 480, 492);
  else {
    await click(page, cardX, 170);
    await page.waitForTimeout(250);
    await click(page, cardX, 170);
  }
  await expect.poll(() => H<string>(page, "h.creative ? h.creative().bossStage : ''"), { timeout: 10_000 }).toBe('fight');
  await H(page, 'h.god()');
}

type Node = { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; parent?: number; children?: number[] };
/** Long main-thread tasks (contiguous non-idle samples > 60 ms) with their hottest stacks. */
async function profile<T>(page: Page, label: string, fn: () => Promise<T>): Promise<T> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  await cdp.send('Profiler.start');
  const r = await fn();
  const { profile: prof } = (await cdp.send('Profiler.stop')) as unknown as { profile: { nodes: Node[]; samples: number[]; timeDeltas: number[] } };
  const byId = new Map(prof.nodes.map((n) => [n.id, n]));
  for (const n of prof.nodes) for (const c of n.children ?? []) byId.get(c)!.parent = n.id;
  const idle = (n: Node) => n.callFrame.functionName === '(idle)';
  const self = new Map<string, number>();
  let wall = 0;
  const frame = (n: Node) => `${n.callFrame.functionName || '(anon)'}@${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`;
  const runs: { ms: number; hot: Map<string, number> }[] = [];
  let cur: { ms: number; hot: Map<string, number> } | null = null;
  for (let i = 0; i < prof.samples.length; i++) {
    const n = byId.get(prof.samples[i]!)!;
    const dt = (prof.timeDeltas[i + 1] ?? 0) / 1000;
    wall += dt;
    if (!idle(n)) self.set(frame(n), (self.get(frame(n)) ?? 0) + dt);
    if (idle(n)) {
      if (cur && cur.ms > 80) runs.push(cur);
      cur = null;
      continue;
    }
    cur ??= { ms: 0, hot: new Map() };
    cur.ms += dt;
    // attribute to the deepest few frames from our bundle
    let m: Node | undefined = n;
    const chain: string[] = [];
    while (m && chain.length < 4) {
      if (m.callFrame.url.includes('index-') || m.callFrame.functionName.startsWith('(')) chain.push(frame(m));
      m = m.parent ? byId.get(m.parent) : undefined;
    }
    const key = chain.join(' < ') || frame(n);
    cur.hot.set(key, (cur.hot.get(key) ?? 0) + dt);
  }
  if (cur && cur.ms > 80) runs.push(cur);
  const busy = [...self.values()].reduce((a, b) => a + b, 0);
  console.info(`SELF ${label} busy=${((busy / wall) * 100).toFixed(0)}% :: ${[...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${((v / wall) * 100).toFixed(1)}% ${k}`).join(' | ')}`);
  runs.sort((a, b) => b.ms - a.ms);
  for (const run of runs.slice(0, 4)) {
    const top = [...run.hot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${v.toFixed(0)}ms ${k}`);
    console.info(`LONG ${label} ${run.ms.toFixed(0)}ms :: ${top.join(' || ')}`);
  }
  return r;
}

let errors: string[] = [];
test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text()));
});
test.afterEach(() => {
  if (errors.length) console.info(`CONSOLE ${errors.slice(0, 8).join(' | ')}`);
});

test('menu idle', async ({ page }) => {
  await menu(page);
  const b = await counts(page);
  await startProbe(page);
  await page.waitForTimeout(6000);
  await stopProbe(page, 'menu-idle', b);
});

test('story village + districts', async ({ page }) => {
  await menu(page);
  await page.locator('canvas').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('Enter');
  await expect.poll(() => scene(page), { timeout: 30_000 }).toBe('Game');
  await page.waitForTimeout(1200);
  await H(page, 'h.god()');
  let b = await counts(page);
  await startProbe(page);
  await profile(page, 'village', () => brawl(page, 10000));
  await stopProbe(page, 'village-walk-combat', b);
  b = await counts(page);
  await startProbe(page);
  await profile(page, 'crowd', async () => { for (const x of [600, 900, 1300, 1700, 2100]) {
    await H(page, `h.warp(${x})`);
    for (let i = 0; i < 6; i++) await H(page, `h.spawn('raider', ${200 + i * 40})`);
    await brawl(page, 3000);
    await H(page, 'h.killAll()');
  } });
  await stopProbe(page, 'district-crowd-12', b);
  b = await counts(page);
  await startProbe(page);
  for (let r = 0; r < 4; r++) {
    for (let i = 0; i < 10; i++) await H(page, `h.spawn('${['raider', 'imp', 'boneArcher', 'mireHexer'][i % 4]}', ${150 + i * 30})`);
    await brawl(page, 2500);
    await H(page, 'h.killAll()');
    await page.waitForTimeout(1500);
  }
  await stopProbe(page, 'spawn-kill-cycles(leak)', b);
});

for (const [name, x] of [
  ['kaalasura', null],
  ['garjana', 359],
  ['nishachara', 598],
  ['brute', 837],
] as const) {
  test(`boss ${name}`, async ({ page }) => {
    await sandboxBoss(page, x);
    await page.waitForTimeout(800);
    const b = await counts(page);
    await startProbe(page);
    let n = 0;
    await profile(page, name, () =>
      brawl(page, 24000, async () => {
        if (++n % 2 === 0) await H(page, 'h.hitBoss(70)');
      }),
    );
    await stopProbe(page, `boss-${name}`, b);
  });
}
