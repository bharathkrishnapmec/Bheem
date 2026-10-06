import Phaser from 'phaser';
import { Quality } from '@/platform/Quality';
import { balance } from '@/config/balance';
import { PAL } from '@/config/palette';
import { GameEvents } from '@/core/GameEvents';
import { pxText } from '@/ui/text';

interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  drag: number;
  life: number;
  max: number;
  size: number;
  c: number;
  c2: number;
  delay: number;
  hold: boolean;
}

/**
 * All transient world-space visual effects. Pixel particles are drawn with a single Graphics object
 * (cheap, crisp, time-scale aware). Dissolve samples the sprite's actual pixels (UI_DESIGN §6 pixel crumble).
 */
export class FX {
  private g: Phaser.GameObjects.Graphics;
  private gAdd: Phaser.GameObjects.Graphics;
  private dust: Dust[] = [];
  private glow: Dust[] = [];
  private bolts: { pts: number[]; life: number; max: number; w: number; c: number }[] = [];
  private numbers: { t: Phaser.GameObjects.BitmapText; life: number; max: number; vy: number }[] = [];
  private pool: Phaser.GameObjects.BitmapText[] = [];
  private sampleCache = new Map<string, { x: number; y: number; c: number }[]>();
  private flashTimes: number[] = [];
  private offDmg: () => void;

  constructor(private scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(600);
    this.gAdd = scene.add.graphics().setDepth(601).setBlendMode(Phaser.BlendModes.ADD);
    this.offDmg = GameEvents.on('damage:number', (p) => this.damageNumber(p.x, p.y, p.amount, p.kind));
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.offDmg());
  }

  get reduced(): boolean {
    return Quality.reduced();
  }
  private n(count: number): number {
    return Math.max(1, Math.round(count * (this.reduced ? 0.4 : 1)));
  }

  add(p: Partial<Dust> & { x: number; y: number }, additive = false): void {
    const list = additive ? this.glow : this.dust;
    if (list.length > Quality.particleBudget(balance.fx.maxParticles) * 8) return;
    list.push({ vx: 0, vy: 0, g: 0, drag: 0, life: 400, max: p.life ?? 400, size: 2, c: 0xffffff, c2: -1, delay: 0, hold: false, ...p } as Dust);
  }

  burst(x: number, y: number, count: number, colors: number[], o: { speed?: number; angle?: number; spread?: number; g?: number; life?: number; size?: number; drag?: number; additive?: boolean } = {}): void {
    const sp = o.speed ?? 160;
    const spread = o.spread ?? Math.PI * 2;
    const base = o.angle ?? -Math.PI / 2;
    for (let i = 0, n = this.n(count); i < n; i++) {
      const a = base + (Math.random() - 0.5) * spread;
      const s = sp * (0.4 + Math.random() * 0.8);
      const life = (o.life ?? 400) * (0.6 + Math.random() * 0.6);
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: o.g ?? 600, drag: o.drag ?? 1.5, life, max: life, size: o.size ?? 2, c: colors[i % colors.length]! }, o.additive);
    }
  }

  sparks(x: number, y: number, dir: number, color: number, count = 6): void {
    this.burst(x, y, count, [color, 0xffffff, PAL.cleanseGold], { speed: 260, angle: dir >= 0 ? 0 : Math.PI, spread: 1.6, g: 400, life: 220, additive: true });
  }
  ichor(x: number, y: number, dir: number, count = 5): void {
    this.burst(x, y, count, [PAL.ichor, PAL.ruinViolet, 0x5a2080], { speed: 180, angle: dir >= 0 ? -0.5 : Math.PI + 0.5, spread: 1.4, g: 900, life: 500, size: 2 });
  }
  dust2(x: number, y: number, count = 4, dir = 0): void {
    this.burst(x, y, count, [0x9a8a7a, 0x6a5a5a, 0xb8a890], { speed: 70, angle: dir ? (dir > 0 ? -2.6 : -0.5) : -Math.PI / 2, spread: dir ? 1 : 2.4, g: -40, life: 380, drag: 3 });
  }
  embers(x: number, y: number, count = 8, color: number = PAL.cleanseGold): void {
    this.burst(x, y, count, [color, PAL.ember, 0xffffff], { speed: 60, spread: 1.2, g: -120, life: 900, drag: 1, additive: true });
  }

  /** Sample an image frame's opaque pixels on the 2px art grid. */
  private samples(key: string, frame: Phaser.Textures.Frame): { x: number; y: number; c: number }[] {
    const ck = `${key}#${frame.name}`;
    const hit = this.sampleCache.get(ck);
    if (hit) return hit;
    const out: { x: number; y: number; c: number }[] = [];
    const src = frame.source.image as HTMLCanvasElement | HTMLImageElement;
    let ctx: CanvasRenderingContext2D | null = null;
    if (src instanceof HTMLCanvasElement) ctx = src.getContext('2d', { willReadFrequently: true });
    else {
      const c = document.createElement('canvas');
      c.width = src.width;
      c.height = src.height;
      ctx = c.getContext('2d');
      ctx?.drawImage(src, 0, 0);
    }
    if (ctx) {
      const d = ctx.getImageData(frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight).data;
      for (let y = 0; y < frame.cutHeight; y += 2)
        for (let x = 0; x < frame.cutWidth; x += 2) {
          const i = (y * frame.cutWidth + x) * 4;
          if (d[i + 3]! > 100) out.push({ x, y, c: (d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]! });
        }
    }
    this.sampleCache.set(ck, out);
    return out;
  }

  /** Noise-threshold pixel dissolve with ember edge and upward drift. Hides the sprite. */
  dissolve(s: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image, ms: number = balance.deathFx.dissolveMs, o: { edge?: number; tint?: number; drift?: number; blast?: number } = {}): void {
    const frame = s.frame;
    const pts = this.samples(s.texture.key, frame);
    const w = frame.cutWidth;
    const h = frame.cutHeight;
    const left = s.x - w * s.originX * Math.abs(s.scaleX);
    const top = s.y - h * s.originY * Math.abs(s.scaleY);
    const edge = o.edge ?? PAL.ember;
    const step = this.reduced ? 2 : 1;
    for (let i = 0; i < pts.length; i += step) {
      const p = pts[i]!;
      const px = s.flipX ? w - p.x - 2 : p.x;
      const nx = Math.sin(p.x * 0.37 + p.y * 0.21) * 0.5 + 0.5;
      const delay = (1 - p.y / h) * 0.5 * ms + nx * 0.5 * ms;
      const ang = Math.atan2(p.y - h / 2, px - w / 2);
      const blast = o.blast ?? 0;
      this.dust.push({
        x: left + px * Math.abs(s.scaleX),
        y: top + p.y * Math.abs(s.scaleY),
        vx: (Math.random() - 0.5) * 30 + Math.cos(ang) * blast,
        vy: -(o.drift ?? 50) * (0.5 + Math.random()) + Math.sin(ang) * blast,
        g: -20,
        drag: 1,
        life: 500 + Math.random() * 300,
        max: 800,
        size: 2 * Math.max(1, Math.round(Math.abs(s.scaleX))),
        c: o.tint ?? p.c,
        c2: edge,
        delay,
        hold: true,
      });
    }
    s.setVisible(false);
  }

  slash(x: number, y: number, facing: number, scale = 1, tint = 0xffffff, angle = 0): void {
    const img = this.scene.add.image(x, y, 'fx_slash').setDepth(590).setTint(tint).setBlendMode(Phaser.BlendModes.ADD);
    img.setScale(scale * (facing < 0 ? -1 : 1), scale).setAngle(angle);
    this.scene.tweens.add({ targets: img, alpha: 0, scaleY: scale * 1.2, duration: 140, onComplete: () => img.destroy() });
  }

  ring(x: number, y: number, color: number, scaleTo = 3, ms = 300, from = 0.3): void {
    const r = this.scene.add.image(x, y, 'fx_ring').setDepth(589).setTint(color).setScale(from).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: r, scale: scaleTo, alpha: 0, duration: ms, onComplete: () => r.destroy() });
  }

  groundRing(x: number, y: number, color: number, width: number, ms = 400): void {
    const r = this.scene.add.image(x, y, 'fx_ring').setDepth(589).setTint(color).setScale(0.3, 0.1).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: r, scaleX: width / 68, scaleY: 0.35, alpha: 0, duration: ms, onComplete: () => r.destroy() });
  }

  /** Jagged lightning between points; `life` in ms. */
  lightning(x1: number, y1: number, x2: number, y2: number, ms: number = balance.weapons.staff.boltVisualMs, width = 3, color: number = PAL.statusCyan): void {
    const pts: number[] = [x1, y1];
    const segs = Math.max(4, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 22));
    const nx = -(y2 - y1);
    const ny = x2 - x1;
    const nl = Math.hypot(nx, ny) || 1;
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const off = (Math.random() - 0.5) * 26;
      pts.push(x1 + (x2 - x1) * t + (nx / nl) * off, y1 + (y2 - y1) * t + (ny / nl) * off);
    }
    pts.push(x2, y2);
    this.bolts.push({ pts, life: ms, max: ms, w: width, c: color });
    this.burst(x2, y2, 6, [0xffffff, color], { speed: 200, g: 200, life: 200, additive: true });
  }

  damageNumber(x: number, y: number, amount: number, kind: 'normal' | 'heavy' | 'heal' | 'hero'): void {
    const t = this.pool.pop() ?? pxText(this.scene, 0, 0, '', 2).setDepth(700).setOrigin(0.5, 1);
    const color = kind === 'hero' ? PAL.danger : kind === 'heal' ? PAL.heal : kind === 'heavy' ? PAL.cleanseGold : 0xffffff;
    t.setText(kind === 'heal' ? `+${amount}` : String(amount))
      .setTint(color)
      .setFontSize(kind === 'heavy' ? 30 : 20)
      .setPosition(x + (Math.random() - 0.5) * 16, y)
      .setAlpha(1)
      .setVisible(true)
      .setActive(true);
    t.setScale(1.4);
    this.numbers.push({ t, life: balance.fx.damageNumberMs, max: balance.fx.damageNumberMs, vy: -balance.fx.damageNumberRise * 3 });
  }

  popText(x: number, y: number, text: string, color: number, scale = 2, ms = 800): void {
    const t = pxText(this.scene, x, y, text, scale, color).setOrigin(0.5, 1).setDepth(710).setScale(0.4);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 120, ease: 'Back.out' });
    this.scene.tweens.add({ targets: t, y: y - 26, alpha: 0, delay: ms * 0.6, duration: ms * 0.4, onComplete: () => t.destroy() });
  }

  decal(key: string, x: number, y: number, ms: number, tint?: number): Phaser.GameObjects.Image {
    const d = this.scene.add.image(x, y, key).setOrigin(0.5, 1).setDepth(5);
    if (tint !== undefined) d.setTint(tint);
    this.scene.tweens.add({ targets: d, alpha: 0, delay: ms * 0.7, duration: ms * 0.3, onComplete: () => d.destroy() });
    return d;
  }

  glyph(x: number, y: number, ms: number, color: number = PAL.ruinGlow): Phaser.GameObjects.Image {
    const g = this.scene.add.image(x, y, 'fx_glyph').setDepth(4).setTint(color).setScale(0.2, 0.08).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: g, scaleX: 1.4, scaleY: 0.45, duration: Math.min(300, ms / 2), ease: 'Back.out' });
    this.scene.tweens.add({ targets: g, angle: 180, duration: ms });
    this.scene.tweens.add({ targets: g, alpha: 0, delay: ms, duration: 150, onComplete: () => g.destroy() });
    return g;
  }

  /** Rate-limited camera flash (§13 max 3/s, disabled in reduced effects). */
  flash(color: number, alpha = 0.6, ms = 80): void {
    if (this.reduced) return;
    const now = performance.now();
    this.flashTimes = this.flashTimes.filter((t) => now - t < 1000);
    if (this.flashTimes.length >= balance.deathFx.maxFlashesPerSec) return;
    this.flashTimes.push(now);
    GameEvents.emit('fx:screenFlash', { color, alpha, ms });
  }

  update(dt: number): void {
    const s = dt / 1000;
    this.g.clear();
    this.gAdd.clear();
    const step = (list: Dust[], g: Phaser.GameObjects.Graphics) => {
      let w = 0;
      for (let i = 0; i < list.length; i++) {
        const p = list[i]!;
        if (p.hold) {
          p.delay -= dt;
          if (p.delay > 0) {
            g.fillStyle(p.c, 1).fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
            list[w++] = p;
            continue;
          }
          p.hold = false;
        }
        p.life -= dt;
        if (p.life <= 0) continue;
        p.vy += p.g * s;
        const d = Math.max(0, 1 - p.drag * s);
        p.vx *= d;
        p.vy *= d;
        p.x += p.vx * s;
        p.y += p.vy * s;
        const t = p.life / p.max;
        const c = p.c2 >= 0 && t > 0.75 ? p.c2 : p.c;
        g.fillStyle(c, Math.min(1, t * 1.6)).fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
        list[w++] = p;
      }
      list.length = w;
    };
    step(this.dust, this.g);
    step(this.glow, this.gAdd);
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]!;
      b.life -= dt;
      if (b.life <= 0) {
        this.bolts.splice(i, 1);
        continue;
      }
      const a = b.life / b.max;
      this.gAdd.lineStyle(b.w * 3, b.c, 0.35 * a).strokePoints(this.toPts(b.pts));
      this.gAdd.lineStyle(b.w, 0xffffff, a).strokePoints(this.toPts(b.pts));
    }
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i]!;
      n.life -= dt;
      const t = 1 - n.life / n.max;
      n.t.y += n.vy * s * (1 - t);
      n.t.setScale(t < 0.15 ? 1.4 - t * 2.6 : 1);
      n.t.setAlpha(t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1);
      if (n.life <= 0) {
        n.t.setVisible(false).setActive(false);
        this.pool.push(n.t);
        this.numbers.splice(i, 1);
      }
    }
  }

  private toPts(a: number[]): Phaser.Math.Vector2[] {
    const out: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < a.length; i += 2) out.push(new Phaser.Math.Vector2(a[i], a[i + 1]));
    return out;
  }
}
