import Phaser from 'phaser';
import { balance } from '@/config/balance';
import { PAL } from '@/config/palette';
import { TimeController } from '@/core/TimeController';
import { GameEvents } from '@/core/GameEvents';
import type { KillType } from '@/core/types';
import { AudioManager } from '@/audio/AudioManager';
import type { Actor } from '@/entities/Actor';
import type { World } from '@/game/World';

/** Kill-type specific death presentation (§12). Owns the dying sprite until it is destroyed. */
export class DeathFX {
  arrowDir = new Map<number, { vx: number; vy: number }>();
  private lastBurst = 0;
  constructor(private world: World) {}

  play(a: Actor, k: KillType, opts: { elite?: boolean; last?: boolean; bigDissolve?: boolean } = {}): void {
    const w = this.world;
    const D = balance.deathFx;
    const scene = w.scene;
    a.targetable = false;
    a.body.checkCollision.none = false;
    a.setDepth(290);
    a.clearTint();
    a.anims.stop();
    const hurt = `${a.animBase}:hurt`;
    if (scene.anims.exists(hurt)) a.anims.play(hurt);
    TimeController.hitStop(D.hitStop[k], 11);
    AudioManager.play('enemyDeath', { pan: w.cam.panFor(a.x) });
    const dissolveMs = opts.bigDissolve ? D.bruteDissolveMs : D.dissolveMs;
    const finish = (delay: number, o: Parameters<World['fx']['dissolve']>[2] = {}) => {
      scene.time.delayedCall(delay, () => {
        if (!a.active) return;
        a.body.enable = false;
        w.fx.dissolve(a, dissolveMs, o);
        scene.time.delayedCall(dissolveMs + 50, () => a.destroy());
      });
    };
    // soul wisp toward the hero
    const wisp = scene.add.image(a.cx, a.cy, 'fx_spark').setDepth(620).setTint(PAL.cleanseGold).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: wisp,
      delay: 200,
      duration: 500,
      x: { getEnd: () => w.player.cx },
      y: { getEnd: () => w.player.cy },
      ease: 'Sine.in',
      onComplete: () => {
        wisp.destroy();
        GameEvents.emit('soul:wisp', { x: w.player.x, y: w.player.y });
      },
    });

    switch (k) {
      case 'slash': {
        // diagonal cut line, then split halves fly apart
        const line = scene.add.image(a.cx, a.cy, 'fx_slash').setDepth(595).setScale(1.2, 0.35).setAngle(-25).setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({ targets: line, alpha: 0, scaleX: 1.6, duration: D.slashLineMs + 80, onComplete: () => line.destroy() });
        const fh = a.frame.cutHeight;
        const split = fh * 0.55;
        const top = scene.add.sprite(a.x, a.y, a.texture.key, a.frame.name).setOrigin(0.5, 1).setFlipX(a.flipX).setDepth(291);
        top.setCrop(0, 0, a.frame.cutWidth, split);
        a.setCrop(0, split, a.frame.cutWidth, fh - split);
        const dir = a.lastAttacker ? Math.sign(a.x - a.lastAttacker.x) || 1 : 1;
        scene.tweens.add({ targets: top, x: a.x + dir * 30, y: a.y - 14, angle: dir * 35, duration: 380, ease: 'Quad.out' });
        w.fx.ichor(a.cx, a.cy, dir, 10);
        scene.time.delayedCall(260, () => {
          if (top.active) {
            w.fx.dissolve(top, dissolveMs);
            scene.time.delayedCall(dissolveMs, () => top.destroy());
          }
        });
        finish(D.genericDissolveDelayMs);
        break;
      }
      case 'arrow': {
        const v = this.arrowDir.get(a.uid) ?? { vx: a.lastAttacker ? Math.sign(a.x - a.lastAttacker.x) * 600 : 600, vy: 0 };
        this.arrowDir.delete(a.uid);
        const dir = Math.sign(v.vx) || 1;
        const hit = w.geo.raycast(a.cx, a.cy, a.cx + dir * D.arrowPinRange, a.cy);
        if (hit && !a.flying) {
          a.body.enable = false;
          scene.tweens.add({ targets: a, x: hit.x - dir * (a.bodyW / 2), duration: 110, ease: 'Quad.out' });
          scene.tweens.add({ targets: a, angle: dir * 8, duration: 110 });
          const pin = scene.add.image(hit.x - dir * 4, a.cy, 'arrow').setDepth(292).setFlipX(dir < 0);
          scene.time.delayedCall(D.arrowPinMs, () => pin.destroy());
          w.fx.dust2(hit.x, a.cy, 6, -dir);
          finish(D.arrowPinMs - dissolveMs);
        } else {
          a.body.setVelocity(dir * 220, -180);
          scene.tweens.add({ targets: a, angle: dir * 80, duration: 400 });
          finish(600);
        }
        break;
      }
      case 'lightning': {
        // x-ray flicker, then ash crumble with scorch mark
        let n = 0;
        const ev = scene.time.addEvent({
          delay: 35,
          repeat: Math.ceil(D.lightningXrayMs / 35),
          callback: () => {
            n++;
            if (n % 2) a.setTintFill(0xffffff);
            else a.setTintFill(0x101018);
          },
        });
        a.body.setVelocityX(0);
        scene.time.delayedCall(D.lightningXrayMs + 20, () => {
          ev.remove();
          if (!a.active) return;
          a.setTint(0x3a3440);
          w.fx.embers(a.cx, a.cy, 10, PAL.statusCyan);
        });
        if (!a.flying) w.fx.decal('fx_scorch', a.x, a.y + 2, D.scorchMs);
        finish(D.lightningXrayMs + 60, { tint: 0x4a4450, edge: PAL.statusCyan, drift: 70 });
        break;
      }
      case 'crush': {
        scene.tweens.add({ targets: a, scaleY: 0.35, scaleX: 1.35, duration: 80, ease: 'Quad.in' });
        w.fx.decal('fx_crack', a.x, a.y + 2, 3000);
        w.fx.dust2(a.x, a.y, 10);
        w.fx.ichor(a.x, a.y - 6, 1, 6);
        w.fx.ichor(a.x, a.y - 6, -1, 6);
        finish(D.genericDissolveDelayMs);
        break;
      }
      default: {
        const dir = a.lastAttacker ? Math.sign(a.x - a.lastAttacker.x) || 1 : 1;
        a.body.setVelocity(dir * 160, -260);
        scene.tweens.add({ targets: a, angle: dir * D.genericSpinDeg, duration: 520 });
        finish(D.genericDissolveDelayMs + 250);
      }
    }
    w.fx.burst(a.cx, a.cy, 8, [PAL.ruinViolet, PAL.ruinGlow, PAL.ichor], { speed: 120, g: -40, life: 600 });
    if (opts.elite) {
      TimeController.slowMo(D.elite.slowMo, D.elite.slowMoMs, 25);
      w.cam.zoomTo(D.elite.zoom, 120);
      scene.time.delayedCall(D.elite.slowMoMs, () => w.cam.zoomTo(1, D.elite.zoomOutMs));
      w.fx.flash(0xffffff, 0.35, D.flashMs);
    } else if (opts.last) {
      const now = performance.now();
      if (now - this.lastBurst > 800) {
        this.lastBurst = now;
        TimeController.slowMo(D.lastEnemy.slowMo, D.lastEnemy.slowMoMs, 24);
        w.cam.zoomTo(D.lastEnemy.zoom, 120);
        scene.time.delayedCall(D.lastEnemy.slowMoMs, () => w.cam.zoomTo(1, 400));
      }
    }
  }
}
