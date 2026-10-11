import Phaser from 'phaser';
import { balance } from '@/config/balance';
import { GAME_H, GAME_W } from '@/config/gameConfig';

/** Dusk parallax (UI_DESIGN §5): sky, far mountains, violet village ruins, pines, near foreground. */
export class Parallax {
  sky: Phaser.GameObjects.TileSprite;
  far: Phaser.GameObjects.TileSprite;
  mid: Phaser.GameObjects.TileSprite;
  pines: Phaser.GameObjects.TileSprite;
  near: Phaser.GameObjects.TileSprite;
  private stars: Phaser.GameObjects.Graphics;
  private zoom = 1;

  constructor(scene: Phaser.Scene, private baseScrollY = 0) {
    const p = balance.camera.parallax;
    this.sky = scene.add.tileSprite(0, 0, GAME_W, GAME_H, 'bg_sky').setOrigin(0).setScrollFactor(0).setDepth(-100);
    this.stars = scene.add.graphics().setScrollFactor(0).setDepth(-99);
    for (let i = 0; i < 70; i++) {
      const x = (i * 137.5) % GAME_W;
      const y = (i * 71.3) % (GAME_H * 0.45);
      this.stars.fillStyle(0xffffff, 0.3 + ((i * 13) % 7) / 10).fillRect(Math.round(x), Math.round(y), i % 9 === 0 ? 2 : 1, i % 9 === 0 ? 2 : 1);
    }
    // Single fixed moon (the sky tile repeats, so the moon can't live in it).
    scene.add.circle(GAME_W * 0.78, 84, 34, 0xe9d49c, 0.12).setScrollFactor(0).setDepth(-98);
    scene.add.circle(GAME_W * 0.78, 84, 22, 0xf5e6c8).setScrollFactor(0).setDepth(-98);
    scene.add.circle(GAME_W * 0.78 + 7, 78, 16, 0xfaf0dc).setScrollFactor(0).setDepth(-98);
    this.far = scene.add.tileSprite(0, GAME_H - 330, GAME_W, 300, 'bg_far').setOrigin(0).setScrollFactor(0).setDepth(-97);
    this.mid = scene.add.tileSprite(0, GAME_H - 290, GAME_W, 300, 'bg_mid').setOrigin(0).setScrollFactor(0).setDepth(-96);
    this.pines = scene.add.tileSprite(0, GAME_H - 250, GAME_W, 300, 'bg_pines').setOrigin(0).setScrollFactor(0).setDepth(-95);
    this.near = scene.add
      .tileSprite(0, GAME_H - 120, GAME_W, 120, 'bg_near')
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(900)
      .setAlpha(p.nearAlpha);
  }

  /** Screen-fixed layers are scaled by camera zoom too; counter-scale them so they still cover the view. */
  fitZoom(z: number): void {
    this.zoom = z;
    for (const l of [this.sky, this.far, this.mid, this.pines, this.near, this.stars]) coverZoom(l, z);
  }

  update(scrollX: number, scrollY: number): void {
    const p = balance.camera.parallax;
    const dy = scrollY - this.baseScrollY;
    this.updateLayers(scrollX, dy, p);
    if (this.zoom !== 1)
      for (const l of [this.far, this.mid, this.pines, this.near]) l.y = GAME_H / 2 + (l.y - GAME_H / 2) / this.zoom;
  }

  private updateLayers(scrollX: number, dy: number, p: typeof balance.camera.parallax): void {
    this.sky.tilePositionX = scrollX * p.sky;
    this.far.tilePositionX = scrollX * p.far;
    this.mid.tilePositionX = scrollX * p.mid;
    this.pines.tilePositionX = scrollX * 0.6;
    this.near.tilePositionX = scrollX * p.near;
    this.far.y = GAME_H - 330 - dy * p.far;
    this.mid.y = GAME_H - 290 - dy * p.mid;
    this.pines.y = GAME_H - 250 - dy * 0.6;
    this.near.y = GAME_H - 110 - dy * p.near;
  }

  /** Arena look (v2 §A6): forge = ember-red silhouettes, sky = cloud sea without ground layers. */
  setTheme(t: 'village' | 'forge' | 'sky'): void {
    if (t === 'forge') {
      this.sky.setTint(0xff9a80);
      [this.far, this.mid, this.pines].forEach((l) => l.setTint(0x502020));
      this.near.setVisible(false);
    } else if (t === 'sky') {
      this.sky.setTint(0xd8c8ff);
      this.pines.setVisible(false);
      this.near.setVisible(false);
      this.mid.setTint(0xe8e0ff).setAlpha(0.5);
      this.far.setTint(0xb8a8e8);
    }
  }

  setTint(c: number): void {
    [this.far, this.mid, this.pines].forEach((l) => l.setTint(c));
  }
}

/** Positions an origin-0, full-screen, scrollFactor-0 object so it covers the view at camera zoom z. */
export function coverZoom(o: Phaser.GameObjects.Components.Transform, z: number): void {
  o.setScale(1 / z);
  o.setPosition(GAME_W / 2 - GAME_W / (2 * z), GAME_H / 2 - GAME_H / (2 * z));
}
