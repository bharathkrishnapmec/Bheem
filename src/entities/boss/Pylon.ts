import Phaser from 'phaser';
import { PAL } from '@/config/palette';
import type { Faction, KillType } from '@/core/types';
import { AudioManager } from '@/audio/AudioManager';
import type { World } from '@/game/World';
import type { HitInfo } from '@/systems/CombatSystem';
import { Actor } from '../Actor';

const KEY = 'storm_pylon';

function ensureTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(KEY)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x10121e).fillRect(0, 0, 22, 64);
  g.fillStyle(0x3a4a6a).fillRect(2, 4, 18, 58);
  g.fillStyle(PAL.statusCyan).fillRect(8, 8, 6, 40);
  g.fillStyle(0xffffff).fillRect(10, 12, 2, 30);
  g.fillStyle(0x6a7a9a).fillRect(0, 56, 22, 8);
  g.generateTexture(KEY, 22, 64);
  g.destroy();
}

/** Garjana's Storm Pylon (v3 §B5): sword/bow only, Thunder immune. */
export class Pylon extends Actor {
  faction: Faction = 'enemy';
  private glowT = 0;

  constructor(
    world: World,
    x: number,
    y: number,
    hp: number,
    private onBroken: (p: Pylon) => void,
  ) {
    ensureTexture(world.scene);
    super(world, x, y, KEY, 22, 64);
    this.maxHp = this.hp = hp;
    this.body.setAllowGravity(false);
    this.body.setImmovable(true);
    this.kbResist = 1;
    this.stunImmune = true;
    this.poiseMax = this.poise = 1e9;
    this.setDepth(300);
    world.extraHostiles.add(this);
    world.fx.burst(x, y - 32, 14, [PAL.statusCyan, 0xffffff], { speed: 200, life: 400 });
  }

  override get superArmor(): boolean {
    return true;
  }

  override damageTakenMul(h: HitInfo): number {
    return h.kind === 'lightning' ? 0 : super.damageTakenMul(h);
  }

  step(dt: number): void {
    this.tickBase(dt);
    this.body.setVelocity(0, 0);
    this.glowT += dt;
    if (this.flashMs <= 0) this.setTint(Math.floor(this.glowT / 300) % 2 ? 0xffffff : 0xc8f0ff);
  }

  onDeath(_h: HitInfo, _k: KillType): void {
    const w = this.world;
    w.extraHostiles.delete(this);
    w.fx.burst(this.x, this.y - 32, 24, [PAL.statusCyan, 0xffffff, 0x6a7a9a], { speed: 300, life: 500 });
    AudioManager.play('bannerBreak');
    this.body.enable = false;
    this.setVisible(false);
    this.onBroken(this);
    w.scene.time.delayedCall(50, () => this.destroy());
  }
}
