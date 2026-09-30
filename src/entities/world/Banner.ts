import Phaser from 'phaser';
import { PAL } from '@/config/palette';
import { GameEvents } from '@/core/GameEvents';
import { AudioManager } from '@/audio/AudioManager';
import type { World } from '@/game/World';

/** Occupation banner: shielded until the district garrison falls (§14). */
export class Banner {
  static seq = 1;
  readonly id = Banner.seq++;
  hp: number;
  vulnerable = false;
  destroyed = false;
  sprite: Phaser.GameObjects.Sprite;
  private shield: Phaser.GameObjects.Image;
  private t = 0;
  onDestroyed: (() => void) | null = null;

  constructor(
    private world: World,
    public districtId: string,
    public x: number,
    public y: number,
    public max: number,
  ) {
    this.hp = max;
    this.sprite = world.scene.add.sprite(x, y, 'banner').setOrigin(0.5, 1).setDepth(40).play('banner:loop');
    this.shield = world.scene.add.image(x, y - this.sprite.height / 2, 'fx_ring').setDepth(41).setTint(PAL.ruinViolet).setBlendMode(Phaser.BlendModes.ADD);
    this.shield.setScale(this.sprite.width / 40, this.sprite.height / 40).setAlpha(0.5);
  }

  get top(): number {
    return this.y - this.sprite.height;
  }

  overlapsRect(r: { x: number; y: number; w: number; h: number }): boolean {
    if (this.destroyed) return false;
    const hw = this.sprite.width / 2;
    return r.x < this.x + hw && r.x + r.w > this.x - hw && r.y < this.y && r.y + r.h > this.top;
  }
  overlapsPoint(x: number, y: number, pad = 0): boolean {
    if (this.destroyed) return false;
    return Math.abs(x - this.x) < this.sprite.width / 2 + pad && y > this.top - pad && y < this.y + pad;
  }

  setVulnerable(v: boolean): void {
    this.vulnerable = v;
    this.shield.setVisible(!v && !this.destroyed);
    if (v) {
      this.world.fx.ring(this.x, this.y - this.sprite.height / 2, PAL.ruinGlow, 4, 400, 1);
      GameEvents.emit('banner:vulnerable', { id: this.districtId });
    }
  }

  /** Returns true when the hit connected (absorbed by shield or damaged). */
  damage(amount: number, hx: number, hy: number): boolean {
    if (this.destroyed) return false;
    const fx = this.world.fx;
    if (!this.vulnerable) {
      fx.sparks(hx, hy, hx < this.x ? -1 : 1, PAL.ruinGlow, 4);
      this.shield.setAlpha(1);
      AudioManager.play('deny', { vol: 0.5 });
      return true;
    }
    this.hp = Math.max(0, this.hp - Math.round(amount));
    fx.sparks(hx, hy, hx < this.x ? -1 : 1, PAL.cleanseGold, 8);
    fx.burst(hx, hy, 6, [0x5a2080, PAL.ruinViolet], { speed: 120, life: 500, g: 300 });
    this.sprite.setTintFill(0xffffff);
    this.world.scene.time.delayedCall(60, () => this.sprite.clearTint());
    this.world.cam.shake(3, 100);
    AudioManager.play('bannerHit', { pan: this.world.cam.panFor(this.x) });
    GameEvents.emit('banner:damaged', { id: this.districtId, hp: this.hp, max: this.max, x: this.x, y: this.top });
    if (this.hp <= 0) this.destroy();
    return true;
  }

  private destroy(): void {
    this.destroyed = true;
    this.shield.setVisible(false);
    const fx = this.world.fx;
    fx.dissolve(this.sprite, 900, { edge: PAL.cleanseGold, drift: 90, blast: 60 });
    fx.flash(0xfff4c0, 0.5, 120);
    fx.ring(this.x, this.y - 60, PAL.cleanseGold, 8, 600, 1);
    AudioManager.play('bannerBreak');
    this.world.cam.shake(8, 300);
    this.world.scene.time.delayedCall(900, () => {
      this.sprite.setTexture('bannerFree').setVisible(true).setAlpha(0).play('bannerFree:loop');
      this.world.scene.tweens.add({ targets: this.sprite, alpha: 1, duration: 800 });
    });
    this.onDestroyed?.();
  }

  /** Restored from save: show liberated banner immediately. */
  setLiberated(): void {
    this.destroyed = true;
    this.shield.setVisible(false);
    this.sprite.setTexture('bannerFree').play('bannerFree:loop');
  }

  update(dt: number): void {
    this.t += dt;
    if (!this.vulnerable && !this.destroyed) this.shield.setAlpha(Math.max(0.35 + Math.sin(this.t / 300) * 0.15, this.shield.alpha - dt / 400));
  }
}
