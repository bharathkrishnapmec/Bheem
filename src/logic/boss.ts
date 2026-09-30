import { balance, type BossAttackId } from '@/config/balance';
import type { RNG } from '@/core/RNG';

export type BossPhase = 1 | 2 | 3;

export function phaseForHp(hp: number, max: number): BossPhase {
  const f = hp / max;
  const [p2, p3] = balance.boss.phaseThresholds;
  if (f <= p3) return 3;
  if (f <= p2) return 2;
  return 1;
}

/** Weighted pick from the phase list, never repeating the previous attack. */
export function chooseBossAttack(phase: BossPhase, last: BossAttackId | null, rng: RNG): BossAttackId {
  const weights = balance.boss.weights[phase] as Partial<Record<BossAttackId, number>>;
  return rng.weighted<BossAttackId>(weights, last) ?? 'slam';
}

export function telegraphFor(attack: BossAttackId, phase: BossPhase): number {
  const a = balance.boss.attacks[attack] as { telegraphMs?: number };
  const base = a.telegraphMs ?? 0;
  return phase === 3 ? base * balance.boss.phase3TelegraphMul : base;
}

export function recoverFor(attack: BossAttackId, phase: BossPhase): number {
  const a = balance.boss.attacks[attack] as { recoverMs?: number };
  const base = a.recoverMs ?? balance.boss.idleMs;
  return phase === 3 ? base * balance.boss.phase3CooldownMul : base;
}

export function shouldDesperation(hp: number, max: number, used: boolean): boolean {
  return !used && hp / max <= balance.boss.desperationAt;
}

/** Picks which Dark Rain column stays empty (the guaranteed safe spot). */
export function darkRainColumns(rng: RNG): { safe: number; columns: number[] } {
  const n = balance.boss.attacks.darkRain.columns;
  const safe = rng.int(0, n - 1);
  const columns: number[] = [];
  for (let i = 0; i < n; i++) if (i !== safe) columns.push(i);
  return { safe, columns };
}

export function bossDamageMultiplier(minionsAlive: number, punish: boolean): number {
  let m = 1;
  if (minionsAlive >= balance.boss.shieldMinions) m *= balance.boss.shieldMul;
  if (punish) m *= 1.0;
  return m;
}
