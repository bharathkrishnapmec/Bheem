import { expect, test, type CDPSession, type Page } from '@playwright/test';

type Hooks = { scene: string; player?: () => { x: number; y: number; st: string; weapon: string } };
const hooks = (page: Page) => page.evaluate(() => (window as unknown as { __BHEEM__?: Hooks }).__BHEEM__?.scene);
const player = (page: Page) => page.evaluate(() => (window as unknown as { __BHEEM__: Hooks }).__BHEEM__.player!());

/** Real multi-touch through CDP so the DOM overlay receives genuine touch pointer events. */
class Touch {
  constructor(private cdp: CDPSession) {}
  private pts = new Map<number, { x: number; y: number }>();
  private async send(type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel') {
    await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...this.pts].map(([id, p]) => ({ id, x: p.x, y: p.y })) });
  }
  async down(id: number, x: number, y: number) {
    this.pts.set(id, { x, y });
    await this.send('touchStart');
  }
  async move(id: number, x: number, y: number) {
    this.pts.set(id, { x, y });
    await this.send('touchMove');
  }
  async up(id: number) {
    this.pts.delete(id);
    await this.send('touchEnd');
  }
}

async function center(page: Page, sel: string) {
  const b = (await page.locator(sel).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test('mobile: tap PLAY, move with joystick, attack + jump simultaneously, pause', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text());
  });
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __BHEEM__?: Hooks }).__BHEEM__?.scene === 'MainMenu', null, { timeout: 60_000 });
  const vp = page.viewportSize()!;
  // PLAY is the big button centred at (480, 262) in the 960x540 game space.
  const canvas = (await page.locator('canvas').boundingBox())!;
  await page.touchscreen.tap(canvas.x + (480 / 960) * canvas.width, canvas.y + (262 / 540) * canvas.height);
  await page.waitForFunction(() => (window as unknown as { __BHEEM__?: Hooks }).__BHEEM__?.scene === 'Game', null, { timeout: 5_000 });
  await expect(page.locator('#touch-controls')).toHaveClass(/show/);

  const cdp = await page.context().newCDPSession(page);
  const t = new Touch(cdp);
  const x0 = (await player(page)).x;
  // joystick: thumb lands in the left zone and drags right
  const sx = vp.width * 0.15;
  const sy = vp.height * 0.7;
  await t.down(1, sx, sy);
  await t.move(1, sx + 50, sy);
  await expect.poll(async () => (await player(page)).x, { timeout: 5_000 }).toBeGreaterThan(x0 + 40);
  // attack + jump while still moving (3 simultaneous touches)
  const atk = await center(page, '#touch-controls [data-control="attack"]');
  const jmp = await center(page, '#touch-controls [data-control="jump"]');
  await t.down(2, atk.x, atk.y);
  await t.down(3, jmp.x, jmp.y);
  await expect.poll(async () => (await player(page)).st, { timeout: 3_000, intervals: [30] }).toBe('attack');
  await t.up(2);
  await t.up(3);
  await t.up(1);
  // weapon chip -> bow
  const bow = await center(page, '#touch-controls [data-control="bow"]');
  await t.down(4, bow.x, bow.y);
  await t.up(4);
  await expect.poll(async () => (await player(page)).weapon, { timeout: 5_000 }).toBe('bow');
  // pause button
  const pause = await center(page, '#touch-controls [data-control="pause"]');
  await t.down(5, pause.x, pause.y);
  await t.up(5);
  await page.waitForFunction(() => (window as unknown as { __BHEEM__?: Hooks }).__BHEEM__?.scene === 'Pause', null, { timeout: 3_000 });
  await expect(page.locator('#touch-controls')).not.toHaveClass(/show/);
  expect(await hooks(page)).toBe('Pause');
  expect(errors).toEqual([]);
});

test('mobile: Creative Mode → Sandbox → Reset → Boss Select → fight → result, all by touch', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  type CH = { scene: string; creative: () => { alive: number; bossStage: string; mode: string }; tool: (n: string, a?: string) => boolean; boss: () => { hp: number } | null; hitBoss: (d: number) => void };
  const H = <T>(fn: string) => page.evaluate(`(() => { const h = window.__BHEEM__; return ${fn}; })()`) as Promise<T>;
  const scene = () => page.evaluate(() => (window as unknown as { __BHEEM__?: CH }).__BHEEM__?.scene);
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __BHEEM__?: CH }).__BHEEM__?.scene === 'MainMenu', null, { timeout: 60_000 });
  const c = (await page.locator('canvas').boundingBox())!;
  const tap = (gx: number, gy: number) => page.touchscreen.tap(c.x + (gx / 960) * c.width, c.y + (gy / 540) * c.height);
  /** Menus select on first tap and confirm on the next if needed. */
  const tapTo = async (gx: number, gy: number, target: string) => {
    for (let i = 0; i < 3 && (await scene()) !== target; i++) {
      await tap(gx, gy);
      await page.waitForTimeout(300);
    }
    await expect.poll(scene, { timeout: 5_000 }).toBe(target);
  };
  await tapTo(480, 330, 'CreativeMenu');
  await tapTo(480, 230, 'Game');
  await expect.poll(() => H<string>('h.creative().mode')).toBe('creative');
  const reset = page.locator('#touch-controls [data-control="reset"]');
  await expect(reset).toBeVisible();
  await expect(page.locator('#touch-controls [data-control="toolbox"]')).toBeVisible();
  for (let i = 0; i < 4; i++) await H("h.tool('spawn','raider')");
  await expect.poll(() => H<number>('h.creative().alive')).toBe(4);
  await reset.tap();
  await expect.poll(() => H<number>('h.creative().alive'), { timeout: 1_000 }).toBe(0);
  await page.locator('#touch-controls [data-control="toolbox"]').tap();
  await expect.poll(scene).toBe('Toolbox');
  await tapTo(480, 70 + 13 * 32 + 5, 'Game'); // Close row
  await page.locator('#touch-controls [data-control="bossSelect"]').tap();
  await expect.poll(scene).toBe('BossSelect');
  await tapTo(318, 172, 'Game'); // tap the selected Kaalasura card to fight
  await expect.poll(() => H<string>('h.creative().bossStage'), { timeout: 3_000 }).toBe('fight');
  for (let i = 0; i < 60 && ((await H<{ hp: number } | null>('h.boss()'))?.hp ?? 0) > 0; i++) {
    await H('h.hitBoss(60)');
    await page.waitForTimeout(100);
  }
  await expect.poll(scene, { timeout: 15_000 }).toBe('CreativeResult');
  await tapTo(480, 280, 'Game'); // Rematch
  await expect.poll(() => H<string>('h.creative().bossStage'), { timeout: 3_000 }).toBe('fight');
  expect(errors).toEqual([]);
});
