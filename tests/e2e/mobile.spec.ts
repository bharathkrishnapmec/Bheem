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
  await page.waitForTimeout(700);
  const x1 = (await player(page)).x;
  expect(x1).toBeGreaterThan(x0 + 40);
  // attack + jump while still moving (3 simultaneous touches)
  const atk = await center(page, '#touch-controls [data-control="attack"]');
  const jmp = await center(page, '#touch-controls [data-control="jump"]');
  await t.down(2, atk.x, atk.y);
  await t.down(3, jmp.x, jmp.y);
  await page.waitForTimeout(120);
  const p2 = await player(page);
  expect(p2.st).toBe('attack');
  await t.up(2);
  await t.up(3);
  await t.up(1);
  // weapon chip -> bow
  const bow = await center(page, '#touch-controls [data-control="bow"]');
  await t.down(4, bow.x, bow.y);
  await t.up(4);
  await page.waitForTimeout(250);
  expect((await player(page)).weapon).toBe('bow');
  // pause button
  const pause = await center(page, '#touch-controls [data-control="pause"]');
  await t.down(5, pause.x, pause.y);
  await t.up(5);
  await page.waitForFunction(() => (window as unknown as { __BHEEM__?: Hooks }).__BHEEM__?.scene === 'Pause', null, { timeout: 3_000 });
  await expect(page.locator('#touch-controls')).not.toHaveClass(/show/);
  expect(await hooks(page)).toBe('Pause');
  expect(errors).toEqual([]);
});
