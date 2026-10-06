import Phaser from 'phaser';
import { balance } from '@/config/balance';
import { PAL } from '@/config/palette';
import { STR } from '@/config/strings';
import { GameEvents } from '@/core/GameEvents';
import { GameStore } from '@/core/GameStore';
import type { DistrictId } from '@/core/types';
import { nextDistrictState, type DistrictState } from '@/logic/district';
import { addRally } from '@/logic/summon';
import type { DistrictDef } from '@/level/levelSchema';
import { AudioManager } from '@/audio/AudioManager';
import { Banner } from '@/entities/world/Banner';
import { Gate } from '@/entities/world/Gate';
import type { World } from '@/game/World';

/** District state machine (§14.2) + objectives, gates, banners, visible liberation. */
export class DistrictManager {
  states = {} as Record<DistrictId, DistrictState>;
  banners = new Map<DistrictId, Banner>();
  gates = new Map<DistrictId, Gate>();
  private cur: DistrictDef | null = null;
  private visited = new Set<DistrictId>();
  private objT = 0;
  private lastObjective = '';
  private celebrants: Phaser.GameObjects.Sprite[] = [];
  onLiberated: ((id: DistrictId) => void) | null = null;

  constructor(
    private world: World,
    liberated: Set<DistrictId>,
  ) {
    for (const d of world.level.districts) {
      this.states[d.id] = liberated.has(d.id) ? 'liberated' : 'occupied';
    GameStore.state.districtsLiberated = [...liberated];
      const b = new Banner(world, d.id, d.banner.x, d.banner.y, d.banner.hp);
      b.onDestroyed = () => this.onBannerDestroyed(d);
      world.banners.push(b);
      this.banners.set(d.id, b);
      const g = new Gate(world, `gate_${d.id}`, d.exitGate.x, d.exitGate.y, d.exitGate.h, !liberated.has(d.id));
      this.gates.set(d.id, g);
      if (liberated.has(d.id)) {
        b.setLiberated();
        world.spawner.completeDistrict(d);
        this.addCelebrants(d, false);
      }
    }
  }

  current(): DistrictDef | null {
    return this.cur;
  }
  weather(): 'none' | 'rain' | 'fog' {
    return this.cur?.weather ?? 'none';
  }
  isLiberated(id: DistrictId): boolean {
    return this.states[id] === 'liberated';
  }
  get allLiberated(): boolean {
    return this.world.level.districts.every((d) => this.states[d.id] === 'liberated');
  }
  liberatedIds(): DistrictId[] {
    return this.world.level.districts.filter((d) => this.states[d.id] === 'liberated').map((d) => d.id);
  }

  private fire(d: DistrictDef, ev: Parameters<typeof nextDistrictState>[1]): void {
    this.states[d.id] = nextDistrictState(this.states[d.id], ev);
  }

  update(dt: number): void {
    const w = this.world;
    const px = w.player.x;
    const d = w.level.districts.find((dd) => px >= dd.bounds.x0 && px < dd.bounds.x1) ?? null;
    if (d && d !== this.cur) {
      this.cur = d;
      GameStore.state.districtId = d.id;
      GameEvents.emit('district:changed', { id: d.id, name: d.name });
      if (!this.visited.has(d.id)) {
        this.visited.add(d.id);
        GameEvents.emit('intro:card', { title: d.name, subtitle: this.isLiberated(d.id) ? STR.toasts.liberated(d.name) : STR.districtHints[d.id], durationMs: balance.intro.districtCardMs });
      }
    }
    if (!d) {
      this.cur = null;
      if (px >= w.level.bossArena.x0 - 200) this.setObjective(w.boss ? STR.objectives.boss : STR.objectives.arena);
      return;
    }
    const st = this.states[d.id];
    const trig = d.startTrigger;
    if (st === 'occupied' && px >= trig.x) {
      this.fire(d, 'enter');
      w.spawner.startDistrict(d);
      AudioManager.setCombat(true);
    }
    if (this.states[d.id] === 'combat' && w.spawner.districtCleared(d)) {
      this.fire(d, 'wavesCleared');
      this.fire(d, 'shieldDown');
      this.banners.get(d.id)!.setVulnerable(true);
      w.toast('The banner\u2019s ward has fallen!', 'violet');
      GameEvents.emit('encounter:cleared', {});
      AudioManager.setCombat(false);
    }
    this.objT -= dt;
    if (this.objT <= 0) {
      this.objT = 250;
      const s = this.states[d.id];
      if (s === 'occupied') this.setObjective(STR.objectives.enter);
      else if (s === 'combat') this.setObjective(STR.objectives.clear(Math.max(1, w.spawner.remaining(d))));
      else if (s === 'bannerVulnerable') this.setObjective(STR.objectives.banner, d.banner.x, d.banner.y - 60);
      else this.setObjective(STR.objectives.proceed, d.exitGate.x + 60, d.exitGate.y - 40);
    }
  }

  private setObjective(text: string, tx?: number, ty?: number): void {
    if (text === this.lastObjective) return;
    this.lastObjective = text;
    GameStore.state.objectiveText = text;
    GameEvents.emit('objective:changed', { text });
    GameEvents.emit('objective:target', tx !== undefined && ty !== undefined ? { x: tx, y: ty } : { x: null, y: null });
  }

  private onBannerDestroyed(d: DistrictDef): void {
    const w = this.world;
    this.fire(d, 'bannerDestroyed');
    if (!GameStore.state.districtsLiberated.includes(d.id)) GameStore.state.districtsLiberated.push(d.id);
    w.progress.banners.add(d.id);
    const idx = w.level.districts.indexOf(d);
    GameStore.setRally(addRally(GameStore.state.rally, 20));
    w.scene.time.delayedCall(700, () => {
      w.loot.coins(d.banner.x, d.banner.y - 80, balance.liberation.districtCoinBonus[idx] ?? 40, 1.6);
      this.gates.get(d.id)!.setOpen(true);
      AudioManager.play('liberate');
      w.toast(STR.toasts.liberated(d.name), 'gold');
      w.scene.time.delayedCall(1400, () => w.toast(STR.toasts.gateOpen, 'gold'));
      this.addCelebrants(d, true);
      GameEvents.emit('district:liberated', { id: d.id });
      this.onLiberated?.(d.id);
      w.saveProgress();
    });
  }

  /** Visible world-state change: freed villagers return and cheer around the banner. */
  private addCelebrants(d: DistrictDef, animate: boolean): void {
    const w = this.world;
    const xs = [-160, -90, 70, 140];
    xs.forEach((dx, i) => {
      const x = d.banner.x + dx;
      const gy = w.geo.groundBelow(x, d.banner.y - 100, true, 300);
      if (gy === null) return;
      const key = `villager${i % 3}`;
      const s = w.scene.add.sprite(animate ? x + (dx < 0 ? -200 : 200) : x, gy, key).setOrigin(0.5, 1).setDepth(33).setFlipX(dx > 0);
      s.play(`${key}:${animate ? 'run' : 'cheer'}`);
      if (animate) {
        s.setAlpha(0);
        w.scene.tweens.add({ targets: s, x, alpha: 1, duration: 1400, delay: 600 + i * 150, onComplete: () => s.play(`${key}:cheer`) });
      }
      this.celebrants.push(s);
    });
    if (animate) w.fx.embers(d.banner.x, d.banner.y - 40, 30, PAL.cleanseGold);
  }
}
