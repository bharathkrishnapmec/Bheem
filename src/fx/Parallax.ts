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

  update(scrollX: number, scrollY: number): void {
    const p = balance.camera.parallax;
    const dy = scrollY - this.baseScrollY;
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

  setTint(c: number): void {
    [this.far, this.mid, this.pines].forEach((l) => l.setTint(c));
  }
}
