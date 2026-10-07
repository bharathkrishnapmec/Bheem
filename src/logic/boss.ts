import { balance } from '@/config/balance';
import type { RNG } from '@/core/RNG';

/** Shared boss rules (Boss Buff v3 §B2). Pure: no Phaser. */
export type BossPhase = 1 | 2 | 3 | 4;

const G = balance.bosses.global;

/** Phase for the current HP: 4 phases at 75/50/25 %, or any shorter threshold list (Brute: [0.5]). */
export function phaseForHp(hp: number, max: number, thresholds: readonly number[] = G.thresholds): BossPhase {
  const f = hp / max;
  let ph = 1;
  for (const t of thresholds) if (f <= t) ph++;
  return Math.min(4, ph) as BossPhase;
}

/** HP at the top of a phase band (phase 2 of [0.75, 0.5, 0.25] starts at 75 %). */
export function phaseStartHp(max: number, phase: BossPhase, thresholds: readonly number[] = G.thresholds): number {
  return phase === 1 ? max : Math.floor(max * (thresholds[phase - 2] ?? 1));
}

/** Soft enrage: attack gaps shrink 8 % per minute after the start time, capped at 30 %. */
export function enrageMul(fightMs: number, startMs: number): number {
  if (fightMs <= startMs) return 1;
  const E = balance.bosses.softEnrage;
  return 1 - Math.min(E.cap, (E.perMinute * (fightMs - startMs)) / 60_000);
}

export function gapFor(phase: BossPhase, fightMs: number, enrageStartMs: number): number {
  return G.gapMs[phase - 1]! * enrageMul(fightMs, enrageStartMs);
}

/** P1–P2 single attacks, P3 up to 2 chained, P4 up to 3. */
export function comboLength(phase: BossPhase, rng: RNG): number {
  const max = G.comboMax[phase - 1]!;
  return max <= 1 ? 1 : rng.int(1, max);
}

/**
 * Final boss hit damage. Balance values already include damageScale (×1.25, applied once);
 * the cap (35, or 45 for safe-spot ultimates) is applied before the Creative damage multiplier.
 */
export function bossDamage(v3: number, ultimate = false, creativeMul = 1): number {
  if (creativeMul <= 0) return 0;
  const cap = ultimate ? G.ultimateMaxHit : G.maxHitDamage;
  return Math.max(1, Math.round(Math.min(cap, v3) * creativeMul));
}

/** Telegraph after phase scaling (×0.8 from phase 3), never below the melee/ranged floors. */
export function telegraphMs(base: number, phase: BossPhase, ranged: boolean, p3Mul = 0.8): number {
  const ms = phase >= 3 ? base * p3Mul : base;
  return Math.max(ranged ? G.telegraphFloor.ranged : G.telegraphFloor.melee, Math.round(ms));
}

/** Picks which Dark Rain column stays empty (the guaranteed safe spot). */
export function darkRainColumns(rng: RNG, n: number = balance.boss.attacks.darkRain.columns): { safe: number; columns: number[] } {
  const safe = rng.int(0, n - 1);
  const columns: number[] = [];
  for (let i = 0; i < n; i++) if (i !== safe) columns.push(i);
  return { safe, columns };
}

/** Kaalasura's Hellfire edge width per side after `ms` in phase 4; never leaves less than minSafe in the middle. */
export function hellfireEdge(ms: number, arenaW: number, H: { edge: number; creepEveryMs: number; creepPx: number; minSafe: number } = balance.boss.hellfire): number {
  const maxEdge = Math.max(0, (arenaW - H.minSafe) / 2);
  return Math.min(maxEdge, H.edge + H.creepPx * Math.floor(Math.max(0, ms) / H.creepEveryMs));
}

/** Boss takes reduced damage while enough minions are alive (Rain of Soldiers ward). */
export function minionWardMul(minionsAlive: number): number {
  return minionsAlive >= balance.boss.shieldMinions ? balance.boss.shieldMul : 1;
}

/** Supply crate schedule: one every crateEveryMs of fight time, max crateMax on the field. */
export function crateDue(sinceLastMs: number, onField: number, ultimateTelegraph: boolean): boolean {
  const S = balance.bosses.sustain;
  return sinceLastMs >= S.crateEveryMs && onField < S.crateMax && !ultimateTelegraph;
}
