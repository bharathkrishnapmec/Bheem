import Phaser from 'phaser';
import { balance } from '@/config/balance';
import { PAL } from '@/config/palette';
import { STR } from '@/config/strings';
import { GameStore } from '@/core/GameStore';
import { addRally } from '@/logic/summon';
import { chestCoins } from '@/logic/loot';
import type { LootSpec } from '@/level/levelSchema';
import { AudioManager } from '@/audio/AudioManager';
import type { Interactable, World } from '@/game/World';

export class Captive implements Interactable {
  range = 60;
  holdMs = balance.liberation.captiveHoldMs;
  freed = false;
  cage: Phaser.GameObjects.Sprite;
  villager: Phaser.GameObjects.Sprite;
  constructor(
    private world: World,
    public id: string,
    public x: number,
    public y: number,
    public guarded: boolean,
    alreadyFreed: boolean,
  ) {
    const v = Math.abs(Math.floor(x / 7)) % 3;
    this.villager = world.scene.add.sprite(x, y, `villager${v}`).setOrigin(0.5, 1).setDepth(35);
    this.cage = world.scene.add.sprite(x, y, 'cage').setOrigin(0.5, 1).setDepth(36);
    if (alreadyFreed) {
      this.freed = true;
      this.cage.play('cage:broken');
      this.villager.setVisible(false);
    } else {
      this.cage.play('cage:closed');
      this.villager.play(`villager${v}:captive`);
    }
  }
  label(): string {
    return STR.prompts.captive;
  }
  canInteract(): boolean {
    if (this.freed) return false;
    if (!this.guarded) return true;
    for (const e of this.world.enemies) if (e.isAlive() && Math.abs(e.x - this.x) < 320) return false;
    return true;
  }
  interact(): void {
    const w = this.world;
    this.freed = true;
    w.progress.rescued.add(this.id);
    this.cage.play('cage:broken');
    w.fx.burst(this.x, this.y - 30, 16, [0x8a6a4a, 0x5a3a2a, PAL.cleanseGold], { speed: 200, life: 500 });
    w.fx.embers(this.x, this.y - 30, 14, PAL.cleanseGold);
    AudioManager.play('free');
    const key = this.villager.texture.key;
    this.villager.play(`${key}:cheer`);
    w.scene.time.delayedCall(900, () => {
      this.villager.play(`${key}:run`);
      const dir = this.x < w.player.x ? -1 : 1;
      this.villager.setFlipX(dir < 0);
      w.scene.tweens.add({ targets: this.villager, x: this.x + dir * 260, alpha: 0, duration: 1600, onComplete: () => this.villager.setVisible(false) });
    });
    w.player.heal(balance.liberation.captiveHeal);
    GameStore.setRally(addRally(GameStore.state.rally, balance.rally.perCaptive));
    const n = GameStore.state.rescued + 1;
    GameStore.setRescued(n);
    w.toast(STR.toasts.captiveFreed, 'gold');
    const t = balance.summon.thresholds;
    if (n === t.extraSpearman || n === t.longDuration || n === t.shieldbearer || n === t.captain) w.scene.time.delayedCall(1200, () => w.toast(STR.toasts.squadUpgrade, 'cyan'));
    w.saveProgress();
  }
}

export class Shrine implements Interactable {
  range = 70;
  holdMs = 0;
  active = false;
  sprite: Phaser.GameObjects.Sprite;
  private glow: Phaser.GameObjects.Image;
  constructor(
    private world: World,
    public id: string,
    public x: number,
    public y: number,
    active: boolean,
  ) {
    this.sprite = world.scene.add.sprite(x, y, 'shrine').setOrigin(0.5, 1).setDepth(30);
    this.glow = world.scene.add.image(x, y - this.sprite.height * 0.6, 'fx_ring').setDepth(29).setTint(PAL.cleanseGold).setBlendMode(Phaser.BlendModes.ADD).setScale(2).setAlpha(0);
    this.setActive(active, true);
  }
  setActive(on: boolean, silent = false): void {
    this.active = on;
    this.sprite.play(on ? 'shrine:active' : 'shrine:dormant');
    this.glow.setAlpha(on ? 0.35 : 0);
    if (on && !silent) {
      this.world.fx.ring(this.x, this.y - 40, PAL.cleanseGold, 5, 600, 0.5);
      this.world.fx.embers(this.x, this.y - 40, 20);
    }
  }
  label(): string {
    return this.active ? STR.prompts.shrineShop : STR.prompts.shrine;
  }
  canInteract(): boolean {
    return true;
  }
  interact(): void {
    const w = this.world;
    const p = w.player;
    if (!this.active) {
      this.setActive(true);
      AudioManager.play('shrine');
      w.toast(STR.shrine.activated, 'gold');
    }
    p.heal(p.maxHp);
    p.prana = p.maxPrana;
    p.ammo = p.maxAmmo;
    w.setCheckpoint(this.id, this.x + 40, this.y);
    w.openShrine(this.id);
  }
}

export class Chest implements Interactable {
  range = 60;
  holdMs = 0;
  opened = false;
  sprite: Phaser.GameObjects.Sprite;
  constructor(
    private world: World,
    public id: string,
    public x: number,
    public y: number,
    private loot: LootSpec,
    opened: boolean,
  ) {
    this.sprite = world.scene.add.sprite(x, y, 'chest').setOrigin(0.5, 1).setDepth(34);
    this.opened = opened;
    this.sprite.play(opened ? 'chest:open' : 'chest:closed');
  }
  label(): string {
    return STR.prompts.chest;
  }
  canInteract(): boolean {
    return !this.opened;
  }
  interact(): void {
    const w = this.world;
    this.opened = true;
    w.progress.chests.add(this.id);
    this.sprite.play('chest:open');
    AudioManager.play('chest');
    w.fx.embers(this.x, this.y - 20, 16);
    w.loot.coins(this.x, this.y - 24, this.loot.coins ?? chestCoins(w.rng), 0.8);
    if (this.loot.health) w.loot.drop(this.x, this.y - 24, [{ kind: 'health', value: this.loot.health }]);
    if (this.loot.arrows) w.loot.drop(this.x, this.y - 24, [{ kind: 'arrows', value: this.loot.arrows }]);
    w.saveProgress();
  }
}
