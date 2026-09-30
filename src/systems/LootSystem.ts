import Phaser from 'phaser';
import { balance } from '@/config/balance';
import { PAL } from '@/config/palette';
import { GameStore } from '@/core/GameStore';
import { splitCoins, type DropRoll, type PickupKind } from '@/logic/loot';
import { AudioManager } from '@/audio/AudioManager';
import type { World } from '@/game/World';

interface Pickup {
  kind: PickupKind;
  value: number;
  s: Phaser.GameObjects.Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  grounded: boolean;
  magnet: boolean;
}

const TEX: Record<PickupKind, string> = { coin: 'coin', health: 'pickup_health', prana: 'pickup_prana', arrows: 'pickup_arrows' };

/** Bouncing, magnetised pickups (§11.4). */
export class LootSystem {
  items: Pickup[] = [];
  constructor(private world: World) {}

  drop(x: number, y: number, rolls: DropRoll[], spread = 1): void {
    const D = balance.drops;
    for (const r of rolls) {
      const s = this.world.scene.add.sprite(x, y, TEX[r.kind]).setDepth(350).setOrigin(0.5, 1);
      if (r.kind === 'coin') s.play('coin:loop');
      this.items.push({
        kind: r.kind,
        value: r.value,
        s,
        x,
        y,
        vx: (Math.random() - 0.5) * D.popSpreadX * 2 * spread,
        vy: D.popVelocityY * (0.7 + Math.random() * 0.5),
        age: 0,
        life: D.lifetimeMs,
        grounded: false,
        magnet: false,
      });
    }
  }

  coins(x: number, y: number, amount: number, spread = 1): void {
    this.drop(x, y, splitCoins(amount), spread);
  }

  update(dt: number): void {
    const D = balance.drops;
    const s = dt / 1000;
    const p = this.world.player;
    const px = p.x;
    const py = p.cy;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]!;
      it.age += dt;
      it.life -= dt;
      if (it.life <= 0) {
        it.s.destroy();
        this.items.splice(i, 1);
        continue;
      }
      const d = Math.hypot(px - it.x, py - it.y);
      if (!p.dead && it.age > 300 && (d < D.magnetRange || it.magnet)) {
        it.magnet = true;
        const a = Math.atan2(py - it.y, px - it.x);
        it.x += Math.cos(a) * D.magnetSpeed * s;
        it.y += Math.sin(a) * D.magnetSpeed * s;
      } else {
        it.vy += D.gravity * s;
        const ny = it.y + it.vy * s;
        const nx = it.x + it.vx * s;
        const gy = this.world.geo.groundBelow(nx, it.y - 2, true, Math.max(4, ny - it.y + 4));
        if (gy !== null && it.vy > 0 && ny >= gy) {
          it.y = gy;
          it.vy = Math.abs(it.vy) > 80 ? -it.vy * D.bounce : 0;
          it.vx *= 0.6;
        } else it.y = ny;
        if (this.world.geo.solidAt(nx, it.y - 4)) it.vx = -it.vx * 0.5;
        else it.x = nx;
        if (it.y > this.world.level.height) it.life = 0;
      }
      it.s.setPosition(Math.round(it.x), Math.round(it.y));
      it.s.setVisible(it.life > D.blinkMs || Math.floor(it.life / 100) % 2 === 0);
      if (!p.dead && d < D.pickupRadius + 10) {
        this.collect(it);
        it.s.destroy();
        this.items.splice(i, 1);
      }
    }
  }

  private collect(it: Pickup): void {
    const p = this.world.player;
    const pan = this.world.cam.panFor(it.x);
    switch (it.kind) {
      case 'coin':
        GameStore.addCoins(it.value);
        AudioManager.play('coin', { pan, vol: 0.6 });
        break;
      case 'health':
        p.heal(it.value);
        AudioManager.play('heal', { pan });
        this.world.fx.embers(it.x, it.y - 6, 8, PAL.heal);
        break;
      case 'prana':
        p.prana = Math.min(p.maxPrana, p.prana + it.value);
        AudioManager.play('pickup', { pan });
        this.world.fx.embers(it.x, it.y - 6, 8, PAL.prana);
        break;
      case 'arrows':
        p.ammo = Math.min(p.maxAmmo, p.ammo + it.value);
        AudioManager.play('pickup', { pan });
        this.world.fx.popText(it.x, it.y - 14, `+${it.value} arrows`, 0xffffff, 1, 600);
        break;
    }
  }

  clear(): void {
    for (const it of this.items) it.s.destroy();
    this.items = [];
  }
}
