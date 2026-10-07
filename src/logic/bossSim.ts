import { balance } from '@/config/balance';
import type { BossId } from '@/entities/boss/BossBase';

/**
 * Boss fight-length model (Boss Buff v3 §B9.1):
 *   effectiveDps = heroDps · guardModifier · armorModifier
 *   phaseTime    = phaseHp / effectiveDps + transitionMs + windowsLost
 */
export type SkillProfile = keyof typeof balance.bosses.sim.profiles;

export interface SimResult {
  bossId: BossId;
  profile: SkillProfile;
  phaseMs: number[];
  totalMs: number;
  guardMod: number;
}

/** Average HP multiplier from the Guard Gauge given break frequency (broken windows also get more hits in). */
export function guardModifier(breaksPerMin: number): number {
  const G = balance.guard;
  const fb = Math.min(1, (breaksPerMin * G.breakMs) / 60_000);
  return (1 - fb) * G.guardedHpMul + fb * G.brokenHpMul * balance.bosses.sim.brokenUptimeMul;
}

export function simulate(bossId: BossId, profile: SkillProfile): SimResult {
  const S = balance.bosses.stats[bossId];
  const P = balance.bosses.sim.profiles[profile];
  const thresholds = S.phases === 4 ? balance.bosses.global.thresholds : [0.5];
  const bands = [1, ...thresholds, 0];
  const guardMod = guardModifier(P.breaksPerMin);
  const eff = P.dps * guardMod * (1 - S.armor);
  const lost = balance.bosses.sim.lostMsPerPhase[bossId];
  const phaseMs: number[] = [];
  for (let i = 0; i < bands.length - 1; i++) {
    const hp = S.hp * (bands[i]! - bands[i + 1]!);
    const transition = i > 0 ? balance.bosses.global.transitionMs : 0;
    phaseMs.push(Math.round((hp / eff) * 1000 + transition + lost));
  }
  return { bossId, profile, phaseMs, guardMod, totalMs: phaseMs.reduce((a, b) => a + b, 0) };
}

export function inTarget(r: SimResult): boolean {
  const T = balance.bosses.targets[r.bossId];
  return r.totalMs >= T.minMs && r.totalMs <= T.maxMs;
}

export const fmtMs = (ms: number): string => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
