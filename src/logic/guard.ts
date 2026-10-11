/** Guard Gauge (Boss Buff v3 §B3). Pure logic, no Phaser: the boss owns one and feeds it poise damage. */

export interface GuardConfig {
  max: number;
  guardedHpMul: number;
  brokenHpMul: number;
  breakMs: number;
  recoveryMs: number;
  regenDelayMs: number;
  regenPerSec: number;
  /** Guard left after a would-be break during an uncancellable action (ultimate / transition). */
  uncancellableResidual: number;
}

export type GuardState = 'guarded' | 'broken' | 'recovery';

export interface GuardSnapshot {
  guard: number;
  max: number;
  broken: boolean;
  recoveryUntil?: number;
}

export interface GuardHitResult {
  broke: boolean;
  /** Guard reached 0 during an uncancellable action and was clamped to the residual instead. */
  deferred: boolean;
  applied: number;
}

export class GuardSystem {
  guard: number;
  state: GuardState = 'guarded';
  /** Time spent in the current broken / recovery state. */
  stateMs = 0;
  sinceDamageMs = 0;
  /** Garjana's Wind Barrier: no damage, no regen. */
  frozen = false;

  constructor(public cfg: GuardConfig) {
    this.guard = cfg.max;
  }

  get max(): number {
    return this.cfg.max;
  }
  get broken(): boolean {
    return this.state === 'broken';
  }
  /** HP damage multiplier from the guard state. */
  hpMultiplier(): number {
    if (this.state === 'broken') return this.cfg.brokenHpMul;
    return this.guard > 0 ? this.cfg.guardedHpMul : 1;
  }

  damage(poise: number, opts: { uncancellable?: boolean } = {}): GuardHitResult {
    const none = { broke: false, deferred: false, applied: 0 };
    if (poise <= 0 || this.frozen || this.state !== 'guarded') return none;
    const applied = Math.min(this.guard, poise);
    this.guard -= applied;
    this.sinceDamageMs = 0;
    if (this.guard > 0) return { broke: false, deferred: false, applied };
    if (opts.uncancellable) {
      this.guard = Math.round(this.cfg.max * this.cfg.uncancellableResidual);
      return { broke: false, deferred: true, applied };
    }
    this.breakNow();
    return { broke: true, deferred: false, applied };
  }

  /** Immediate Guard Break (also used by scripted windows such as Kaalasura's Last Stand). */
  breakNow(ms = this.cfg.breakMs): void {
    this.guard = 0;
    this.state = 'broken';
    this.stateMs = this.cfg.breakMs - ms;
  }

  update(dt: number): void {
    if (this.state === 'broken') {
      this.stateMs += dt;
      if (this.stateMs >= this.cfg.breakMs) {
        this.state = 'recovery';
        this.stateMs = 0;
        this.guard = this.cfg.max;
      }
      return;
    }
    if (this.state === 'recovery') {
      this.stateMs += dt;
      if (this.stateMs >= this.cfg.recoveryMs) {
        this.state = 'guarded';
        this.stateMs = 0;
        this.sinceDamageMs = 0;
      }
      return;
    }
    if (this.frozen) return;
    this.sinceDamageMs += dt;
    if (this.sinceDamageMs >= this.cfg.regenDelayMs && this.guard < this.cfg.max)
      this.guard = Math.min(this.cfg.max, this.guard + (this.cfg.regenPerSec * dt) / 1000);
  }

  /** Phase transitions: Guard resets to full (v3 §B3.7). */
  reset(max = this.cfg.max): void {
    this.cfg = { ...this.cfg, max };
    this.guard = max;
    this.state = 'guarded';
    this.stateMs = 0;
    this.sinceDamageMs = 0;
  }

  snapshot(now: number): GuardSnapshot {
    const s: GuardSnapshot = { guard: Math.round(this.guard), max: this.cfg.max, broken: this.broken };
    if (this.state === 'recovery') s.recoveryUntil = now + (this.cfg.recoveryMs - this.stateMs);
    return s;
  }
}

/** Minimal hit shape so this stays Phaser-free. */
export interface PoiseSource {
  kind: string;
  faction: string;
  guardPoise?: number;
  isFinisher?: boolean;
  isClap?: boolean;
  byAlly?: boolean;
}

/** Guard poise for a hit (v3 §B3 table); explicit `guardPoise` wins, environment deals 0. */
export function guardPoiseFor(h: PoiseSource, table: { swordLight: number; swordFinisher: number; arrowTap: number; bolt: number; clap: number; soldier: number; hazard: number }): number {
  if (h.guardPoise !== undefined) return h.guardPoise;
  if (h.faction === 'neutral') return table.hazard;
  if (h.byAlly) return table.soldier;
  switch (h.kind) {
    case 'melee':
      return h.isFinisher ? table.swordFinisher : table.swordLight;
    case 'arrow':
      return table.arrowTap;
    case 'lightning':
      return h.isClap ? table.clap : table.bolt;
    default:
      return 0;
  }
}
