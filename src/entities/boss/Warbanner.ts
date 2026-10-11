import Phaser from 'phaser';
import { balance } from '@/config/balance';
import { PAL } from '@/config/palette';
import { GameEvents } from '@/core/GameEvents';
import type { Faction, KillType } from '@/core/types';
import { AudioManager } from '@/audio/AudioManager';
import type { World } from '@/game/World';
import type { HitInfo } from '@/systems/CombatSystem';
import { Actor } from '../Actor';

function warbannerTexture(scene: Phaser.Scene): string {
  const key = 'warbanner';
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({}, false);
  g.fillStyle(0x1a1018).fillRect(10, 0, 4, 72);
  g.fillStyle(0x2a1030).fillRect(13, 6, 22, 30);
  g.fillStyle(PAL.ruinViolet).fillRect(14, 7, 20, 28);
  g.fillStyle(PAL.danger).fillRect(20, 14, 8, 12);
  g.fillStyle(PAL.ruinGlow).fillRect(8, 0, 8, 4);
  g.generateTexture(key, 36, 72);
  g.destroy();
  return key;
}

/** Kaalasura's Warbanner (v3 §B4 phase 2): +20 % boss damage while it stands; destroying it hits his Guard. */
export class Warbanner extends Actor {
  override faction: Faction = 'enemy';
  private t = 0;

  constructor(
    world: World,
    x: number,
    y: number,
    private onDown: (b: Warbanner) => void,
  ) {
    super(world, x, y, warbannerTexture(world.scene), 20, 70);
    this.maxHp = this.hp = balance.boss.attacks.warbanner.hp;
    this.stunImmune = true;
    this.kbResist = 1;
    this.poiseMax = this.poise = 1e9;
    this.body.setAllowGravity(false);
    this.body.setImmovable(true);
    this.setDepth(300);
    this.setScale(1, 0.1);
    world.scene.tweens.add({ targets: this, scaleY: 1, duration: 300, ease: 'Back.easeOut' });
    world.extraHostiles.add(this);
  }
  override get superArmor(): boolean {
    return true;
  }
  step(dt: number): void {
    this.tickBase(dt);
    this.t += dt;
    if (Math.random() < 0.15) this.world.fx.add({ x: this.x + 12, y: this.y - 50 + Math.random() * 20, vy: -40, life: 500, c: PAL.ruinGlow }, true);
  }
  onDeath(_h: HitInfo, _k: KillType): void {
    this.world.extraHostiles.delete(this);
    this.body.enable = false;
    AudioManager.play('bannerBreak');
    this.world.fx.burst(this.x, this.y - 40, 16, [PAL.ruinViolet, PAL.ruinGlow, 0xffffff], { speed: 220, life: 500 });
    GameEvents.emit('boss:warbanner', {});
    this.onDown(this);
    this.world.scene.tweens.add({ targets: this, alpha: 0, angle: 80, duration: 400, onComplete: () => this.destroy() });
  }
  remove(): void {
    this.world.extraHostiles.delete(this);
    this.destroy();
  }
}
