import Phaser from 'phaser';
import { balance } from '@/config/balance';
import { GAME_H, GAME_W } from '@/config/gameConfig';
import { SaveManager } from '@/core/SaveManager';

interface Bounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Manual camera: dead-zone follow with look-ahead, smoothly lerped bounds, shake, zoom and cinematic focus. */
export class CameraDirector {
  cam: Phaser.Cameras.Scene2D.Camera;
  private target: { x: number; y: number; vx: number; facing: number } | null = null;
  private bounds: Bounds;
  private goal: Bounds;
  private look = 0;
  private fx = 0;
  private fy = 0;
  private shakeAmp = 0;
  private shakeMs = 0;
  private shakeTotal = 1;
  focus: { x: number; y: number } | null = null;
  focusLerp = 0.08;
  aimOffset = 0;
  private sx = 0;
  private sy = 0;

  constructor(scene: Phaser.Scene, levelW: number, levelH: number) {
    this.cam = scene.cameras.main;
    this.bounds = { x0: 0, x1: levelW, y0: 0, y1: levelH };
    this.goal = { ...this.bounds };
    this.cam.setRoundPixels(true);
  }

  follow(t: { x: number; y: number; vx: number; facing: number }): void {
    this.target = t;
  }

  setBounds(b: Partial<Bounds>, instant = false): void {
    this.goal = { ...this.goal, ...b };
    if (instant) this.bounds = { ...this.goal };
  }

  snap(): void {
    if (!this.target) return;
    this.bounds = { ...this.goal };
    this.fx = this.target.x;
    this.fy = this.target.y - 40;
    this.update(16, true);
  }

  shake(amp: number, ms: number): void {
    const s = SaveManager.settings.shake * (SaveManager.settings.reducedEffects ? 0.4 : 1);
    if (s <= 0) return;
    if (amp * s >= this.shakeAmp * (this.shakeMs / this.shakeTotal)) {
      this.shakeAmp = amp * s;
      this.shakeMs = ms;
      this.shakeTotal = ms;
    }
  }

  focusOn(x: number, y: number, zoom: number, ms: number): void {
    this.focus = { x, y };
    this.zoomTo(zoom, ms);
  }

  unfocus(ms: number): void {
    this.focus = null;
    this.zoomTo(1, ms);
  }

  zoomTo(z: number, ms: number): void {
    if (SaveManager.settings.reducedEffects && z > 1) z = 1 + (z - 1) * 0.4;
    this.cam.zoomTo(z, ms, 'Sine.easeInOut', true);
  }

  panFor(x: number): number {
    const c = this.cam.worldView.centerX || x;
    return Math.max(-0.8, Math.min(0.8, (x - c) / (GAME_W / 2)));
  }

  inView(x: number, y: number, margin = 0): boolean {
    const v = this.cam.worldView;
    return x > v.x - margin && x < v.right + margin && y > v.y - margin && y < v.bottom + margin;
  }

  /** dt = real ms (camera keeps moving during hit-stop, slightly). */
  update(dt: number, instant = false): void {
    const c = balance.camera;
    const k = Math.min(1, dt / 16.67);
    for (const key of ['x0', 'x1', 'y0', 'y1'] as const) {
      const d = this.goal[key] - this.bounds[key];
      this.bounds[key] += instant ? d : d * Math.min(1, (dt / c.boundsTransitionMs) * 4);
    }
    let tx: number;
    let ty: number;
    if (this.focus) {
      tx = this.focus.x;
      ty = this.focus.y;
      this.fx += (tx - this.fx) * (instant ? 1 : this.focusLerp * k);
      this.fy += (ty - this.fy) * (instant ? 1 : this.focusLerp * k);
    } else if (this.target) {
      const t = this.target;
      const wantLook = Math.abs(t.vx) > 20 ? Math.sign(t.vx) * c.lookAhead : t.facing * c.lookAhead * 0.5;
      this.look += (wantLook - this.look) * Math.min(1, dt / c.lookAheadSmoothMs);
      tx = t.x + this.look + this.aimOffset;
      ty = t.y - 70;
      const dzw = c.deadzoneW / 2;
      const dzh = c.deadzoneH / 2;
      let gx = this.fx;
      let gy = this.fy;
      if (tx > gx + dzw) gx = tx - dzw;
      if (tx < gx - dzw) gx = tx + dzw;
      if (ty > gy + dzh) gy = ty - dzh;
      if (ty < gy - dzh) gy = ty + dzh;
      this.fx += (gx - this.fx) * (instant ? 1 : c.lerpX * k * 1.4);
      this.fy += (gy - this.fy) * (instant ? 1 : c.lerpY * k * 1.4);
    }
    const z = this.cam.zoom;
    const vw = GAME_W / z;
    const vh = GAME_H / z;
    let cx = this.fx;
    let cy = this.fy;
    const b = this.bounds;
    cx = b.x1 - b.x0 <= vw ? (b.x0 + b.x1) / 2 : Phaser.Math.Clamp(cx, b.x0 + vw / 2, b.x1 - vw / 2);
    cy = b.y1 - b.y0 <= vh ? (b.y0 + b.y1) / 2 : Phaser.Math.Clamp(cy, b.y0 + vh / 2, b.y1 - vh / 2);
    let ox = 0;
    let oy = 0;
    if (this.shakeMs > 0) {
      this.shakeMs -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeMs / this.shakeTotal);
      ox = (Math.random() * 2 - 1) * a;
      oy = (Math.random() * 2 - 1) * a;
      if (this.shakeMs <= 0) this.shakeAmp = 0;
    }
    this.sx = cx;
    this.sy = cy;
    this.cam.centerOn(cx + ox, cy + oy);
  }

  get centerX(): number {
    return this.sx;
  }
  get centerY(): number {
    return this.sy;
  }
}
