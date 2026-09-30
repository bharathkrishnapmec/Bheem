import Phaser from 'phaser';
import { AudioManager } from '@/audio/AudioManager';
import type { World } from '@/game/World';

/** Wooden gate that blocks progress (district exits, boss arena). Participates in physics and AI geometry. */
export class Gate {
  img: Phaser.GameObjects.TileSprite;
  body: Phaser.Physics.Arcade.Image;
  open = false;
  constructor(
    private world: World,
    public id: string,
    public x: number,
    public y: number,
    public h: number,
    closed = true,
  ) {
    const w = 24;
    this.img = world.scene.add.tileSprite(x, y, w, h, 'gate').setOrigin(0.5, 1).setDepth(45);
    this.body = world.scene.physics.add.staticImage(x, y - h / 2, 'fx_px').setVisible(false);
    this.body.setDisplaySize(w, h).refreshBody();
    world.solidGroup.add(this.body);
    if (closed) world.geo.dynamic.set(id, { x: x - w / 2, y: y - h, w, h });
    else this.setOpen(true, true);
  }

  setOpen(open: boolean, instant = false): void {
    if (open === this.open) return;
    this.open = open;
    const w = this.world;
    (this.body.body as Phaser.Physics.Arcade.StaticBody).enable = !open;
    if (open) {
      w.geo.dynamic.delete(this.id);
      if (instant) this.img.setVisible(false);
      else {
        AudioManager.play('gate', { pan: w.cam.panFor(this.x) });
        w.fx.dust2(this.x, this.y, 12);
        w.cam.shake(3, 400);
        w.scene.tweens.add({ targets: this.img, y: this.y - this.h + 10, duration: 900, ease: 'Quad.in', onComplete: () => this.img.setVisible(false) });
      }
    } else {
      w.geo.dynamic.set(this.id, { x: this.x - 12, y: this.y - this.h, w: 24, h: this.h });
      this.img.setVisible(true).setY(this.y - this.h);
      w.scene.tweens.add({ targets: this.img, y: this.y, duration: instant ? 1 : 300, ease: 'Bounce.out' });
      if (!instant) {
        AudioManager.play('gate');
        w.cam.shake(6, 250);
      }
    }
  }
}
