import { balance } from '@/config/balance';

export interface SquadComposition {
  spearman: number;
  archer: number;
  shieldbearer: number;
  captain: number;
  durationMs: number;
}

/** §10.3 squad composition by rescued villager count. */
export function squadComposition(rescued: number): SquadComposition {
  const s = balance.summon;
  const t = s.thresholds;
  return {
    spearman: s.baseSpearmen + (rescued >= t.extraSpearman ? 1 : 0),
    archer: s.baseArchers,
    shieldbearer: rescued >= t.shieldbearer ? 1 : 0,
    captain: rescued >= t.captain ? 1 : 0,
    durationMs: rescued >= t.longDuration ? s.longDurationMs : s.baseDurationMs,
  };
}

export function squadSize(c: SquadComposition): number {
  return c.spearman + c.archer + c.shieldbearer + c.captain;
}

export type SummonDenial = 'active' | 'cooldown' | 'rally' | null;

/** §10.1 gating: returns the reason a summon is blocked, or null when allowed. */
export function summonDenial(rally: number, cooldownRemainingMs: number, squadActive: boolean): SummonDenial {
  if (squadActive) return 'active';
  if (cooldownRemainingMs > 0) return 'cooldown';
  if (rally < balance.rally.summonCost) return 'rally';
  return null;
}

export function rallyForKill(elite: boolean, rallyTier: number): number {
  const r = balance.rally;
  return (elite ? r.perElite : r.perKill) + rallyTier * balance.economy.upgrades.rally.rallyPerKillPerTier;
}

export function addRally(current: number, gain: number): number {
  return Math.min(balance.rally.max, Math.max(0, current + gain));
}

export function allyHpMultiplier(rallyTier: number): number {
  return 1 + balance.summon.hpPerRallyTier * rallyTier;
}
