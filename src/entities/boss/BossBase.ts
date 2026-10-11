import Phaser from 'phaser';
import { balance } from '@/config/balance';
import { PAL } from '@/config/palette';
import { STR } from '@/config/strings';
import { GameEvents } from '@/core/GameEvents';
import { GameStore } from '@/core/GameStore';
import { TimeController } from '@/core/TimeController';
import type { Faction } from '@/core/types';
import { AudioManager } from '@/audio/AudioManager';
import { GuardSystem, guardPoiseFor } from '@/logic/guard';
import { bossDamage, crateDue, gapFor, phaseForHp, phaseStartHp, type BossPhase } from '@/logic/boss';
import { effectiveBossStrength } from '@/modes/creative/GameContext';
import type { World } from '@/game/World';
import type { HitInfo, HitResult } from '@/systems/CombatSystem';
import { FightTelemetry, type FightLog } from '@/systems/FightTelemetry';
import { Actor } from '../Actor';

export type BossId = keyof typeof balance.bosses.stats;

interface Crate {
  g: Phaser.GameObjects.Rectangle;
  x: number;
  y: number;
}

let breakTipShown = false;

/**
 * Shared v3 boss core: Guard Gauge, 4-phase thresholds, transition rewards, supply crates,
 * soft enrage, damage cap and dev telemetry. Subclasses implement the attacks.
 */
export abstract class BossBase extends Actor {
  override faction: Faction = 'enemy';
  phase: BossPhase = 1;
  readonly guard: GuardSystem;
  readonly thresholds: readonly number[];
  readonly phases: number;
  readonly strength = effectiveBossStrength();
  readonly telemetry: FightTelemetry;
  fightMs = 0;
  fighting = false;
  currentAttack = 'none';
  onDefeated: (() => void) | null = null;
  abstract readonly displayName: string;
  abstract readonly displayTitle: string;
  /** Ultimates and transitions cannot be cancelled by a Guard Break (Guard is left at 25 %). */
  protected uncancellable = false;
  /** No supply crates during an ultimate telegraph. */
  protected ultimateTele = false;
  protected arena: { x0: number; x1: number };
  private crateT = 0;
  private crates: Crate[] = [];
  private guardSig = '';
  private phaseStartMs = 0;
  private lastHeroHp = -1;
  private readonly onHeroDied = (): void => this.telemetry.death();

  constructor(
    world: World,
    x: number,
    y: number,
    key: string,
    bw: number,
    bh: number,
    readonly bossId: BossId,
  ) {
    super(world, x, y, key, bw, bh);
    const S = balance.bosses.stats[bossId];
    this.maxHp = this.hp = Math.max(1, Math.round(S.hp * this.strength.hpMul));
    this.armor = S.armor;
    this.stunImmune = true;
    this.kbResist = 1;
    this.poiseMax = this.poise = 1e9;
    this.phases = S.phases;
    this.thresholds = S.phases === 4 ? balance.bosses.global.thresholds : [0.5];
    const G = balance.guard;
    this.guard = new GuardSystem({
      max: S.guard,
      guardedHpMul: G.guardedHpMul,
      brokenHpMul: G.brokenHpMul,
      breakMs: G.breakMs,
      recoveryMs: G.recoveryMs,
      regenDelayMs: G.regenDelayMs,
      regenPerSec: G.regenPerSec,
      uncancellableResidual: G.uncancellableResidual,
    });
    this.arena = { x0: world.level.bossArena.x0, x1: world.level.bossArena.x1 };
    this.telemetry = new FightTelemetry(bossId);
    GameEvents.on('player:died', this.onHeroDied);
  }

  get enrageStartMs(): number {
    return balance.bosses.stats[this.bossId].enrageStartMs + this.strength.enrageShiftMs;
  }
  /** Idle gap before the next attack choice (phase gap × soft enrage). */
  gap(): number {
    return gapFor(this.phase, this.fightMs, this.enrageStartMs);
  }
  /** Final damage for a v3 attack value: buffs, then the 35/45 cap, then the Creative multiplier. */
  dmg(v3: number, ultimate = false): number {
    return bossDamage(v3 * this.damageBuff(), ultimate, this.strength.dmgMul);
  }
  guardMaxFor(ph: BossPhase): number {
    const S = balance.bosses.stats[this.bossId];
    return 'guardP2' in S && ph >= 2 ? S.guardP2 : S.guard;
  }
  protected damageBuff(): number {
    return 1;
  }
  protected extraTakenMul(_h: HitInfo): number {
    return 1;
  }
  /** Nishachara: only hits on the real body damage Guard. */
  protected acceptsGuard(_h: HitInfo): boolean {
    return true;
  }
  protected abstract onGuardBroken(): void;
  protected abstract onPhaseEnter(ph: BossPhase, silent: boolean): void;

  override damageTakenMul(h: HitInfo): number {
    return super.damageTakenMul(h) * this.guard.hpMultiplier() * this.extraTakenMul(h);
  }

  override onHurt(_res: HitResult, h: HitInfo): void {
    if (this.acceptsGuard(h)) this.guardHit(guardPoiseFor(h, balance.guard.poise));
    GameStore.setBoss(this.hp, this.maxHp, this.phase);
    const ph = phaseForHp(this.hp, this.maxHp, this.thresholds);
    if (ph > this.phase) this.enterPhase(ph);
  }

  guardHit(poise: number): void {
    if (!this.fighting || this.dead) return;
    const r = this.guard.damage(poise, { uncancellable: this.uncancellable });
    if (r.broke) this.guardBreak();
    this.emitGuard();
  }

  private guardBreak(): void {
    const w = this.world;
    const G = balance.guard;
    TimeController.hitStop(G.breakHitStopMs, 30);
    w.cam.shake(G.breakShakeAmp, G.breakShakeMs);
    AudioManager.play('bannerBreak');
    AudioManager.play('deflect');
    w.fx.popText(this.x, this.body.y - 40, STR.boss.break, PAL.statusCyan, 3, 900);
    w.fx.burst(this.cx, this.cy, 20, [0xffffff, PAL.statusCyan, 0x9fd8ff], { speed: 320, life: 500 });
    w.fx.ring(this.cx, this.cy, PAL.statusCyan, 6, 400);
    GameEvents.emit('boss:break', {});
    this.telemetry.guardBreak();
    if (!breakTipShown) {
      breakTipShown = true;
      w.toast(STR.boss.breakTip, 'cyan');
    }
    this.onGuardBroken();
  }

  emitGuard(force = false): void {
    const s = this.guard.snapshot(this.world.now);
    const sig = `${s.guard}|${s.broken}|${s.recoveryUntil !== undefined}`;
    if (!force && sig === this.guardSig) return;
    this.guardSig = sig;
    GameEvents.emit('boss:guard', s);
  }

  beginFight(): void {
    this.invulnMs = 0;
    this.fighting = true;
    GameEvents.emit('boss:spawned', { name: this.displayName, title: this.displayTitle, max: this.maxHp, phases: this.phases });
    GameStore.setBoss(this.hp, this.maxHp, this.phase);
    this.emitGuard(true);
  }

  /** Starts the fight at a later phase (Creative phase select, Story phase checkpoints). */
  startAtPhase(ph: BossPhase): void {
    this.hp = phaseStartHp(this.maxHp, ph, this.thresholds);
    this.phase = ph;
    this.guard.reset(this.guardMaxFor(ph));
    GameStore.setBoss(this.hp, this.maxHp, ph);
    GameEvents.emit('boss:phase', { phase: ph });
    this.emitGuard(true);
    this.onPhaseEnter(ph, true);
  }

  /** Phase transition: Guard reset + v3 §B2.3 rewards (heal, refill, Prana, 2 Amrit orbs). */
  protected enterPhase(ph: BossPhase): void {
    const w = this.world;
    const S = balance.bosses.sustain;
    this.telemetry.phase(this.phase, this.fightMs - this.phaseStartMs);
    this.phaseStartMs = this.fightMs;
    this.phase = ph;
    this.guard.reset(this.guardMaxFor(ph));
    this.emitGuard(true);
    GameStore.setBoss(this.hp, this.maxHp, ph);
    GameEvents.emit('boss:phase', { phase: ph });
    this.invulnMs = balance.bosses.global.transitionMs;
    const p = w.player;
    p.heal(S.transitionHeal);
    p.prana = Math.min(p.maxPrana, p.prana + S.transitionPrana);
    p.ammo = p.maxAmmo;
    p.syncStore();
    for (let i = 0; i < S.amritOrbs; i++) {
      const x = Phaser.Math.Clamp(p.x + (i % 2 ? 150 : -150), this.arena.x0 + 60, this.arena.x1 - 60);
      w.loot.drop(x, p.y - 60, [{ kind: 'health', value: S.amritValue }], 0.2);
    }
    this.onPhaseEnter(ph, false);
  }

  /** Call first from the subclass step(). */
  protected stepCore(dt: number): void {
    if (!this.fighting || this.dead) return;
    this.fightMs += dt;
    this.guard.update(dt);
    this.emitGuard();
    const hp = this.world.player.hp;
    if (this.lastHeroHp >= 0 && hp < this.lastHeroHp) this.telemetry.heroHit(this.currentAttack, this.lastHeroHp - hp);
    this.lastHeroHp = hp;
    this.crateT += dt;
    if (crateDue(this.crateT, this.crates.length, this.ultimateTele)) {
      this.crateT = 0;
      this.dropCrate();
    }
    const pl = this.world.player;
    for (const c of [...this.crates]) if (Math.abs(pl.x - c.x) < 34 && Math.abs(pl.y - c.y) < 60) this.openCrate(c);
  }

  /** Test hook: fast-forwards the fight clock (enrage + crate timers). */
  debugAdvance(ms: number): void {
    this.fightMs += ms;
    this.crateT += ms;
  }

  get cratesOnField(): number {
    return this.crates.length;
  }

  private dropCrate(): void {
    const w = this.world;
    const anchors = (w.level.safeAnchors ?? []).filter((a) => a.x > this.arena.x0 && a.x < this.arena.x1);
    let x: number;
    let y: number;
    if (anchors.length) {
      const a = anchors[w.rng.int(0, anchors.length - 1)]!;
      x = a.x;
      y = a.y;
    } else {
      x = Phaser.Math.Clamp(w.player.x + (w.rng.int(0, 1) ? 260 : -260), this.arena.x0 + 80, this.arena.x1 - 80);
      y = this.y;
    }
    const g = w.scene.add.rectangle(x, w.cam.cam.worldView.y - 30, 26, 22, 0x8a5a2b).setStrokeStyle(2, 0x2a1608).setDepth(340);
    w.scene.tweens.add({ targets: g, y: y - 11, duration: 700, ease: 'Bounce.easeOut' });
    this.crates.push({ g, x, y });
    w.toast(STR.boss.crate, 'gold');
  }

  private openCrate(c: Crate): void {
    const S = balance.bosses.sustain;
    const w = this.world;
    w.loot.drop(c.x, c.y - 24, [
      { kind: 'arrows', value: S.crateArrows },
      { kind: 'prana', value: S.cratePrana },
    ], 0.6);
    w.fx.burst(c.x, c.y - 10, 10, [0x8a5a2b, PAL.cleanseGold], { speed: 160, life: 400 });
    AudioManager.play('pickup');
    c.g.destroy();
    this.crates = this.crates.filter((o) => o !== c);
    this.telemetry.supply();
  }

  protected finishFight(result: FightLog['result']): void {
    this.fighting = false;
    for (const c of this.crates) c.g.destroy();
    this.crates = [];
    this.telemetry.finish(result, this.fightMs - this.phaseStartMs, this.fightMs);
  }

  override destroy(fromScene?: boolean): void {
    if (this.fighting) this.finishFight('abandon');
    for (const c of this.crates) c.g.destroy();
    this.crates = [];
    GameEvents.off('player:died', this.onHeroDied);
    super.destroy(fromScene);
  }
}
