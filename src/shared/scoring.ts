import { balance } from '@/config/balance';
import type { EnemyType } from '@/core/types';
import type { StoryStats } from './types';

const S = balance.score;

/** Trial result (v2 §A4.3, v3 §B8 penalty): lower is better. */
export function adjustedTimeMs(fightTimeMs: number, hitsTaken: number): number {
  return Math.round(fightTimeMs) + Math.max(0, Math.floor(hitsTaken)) * balance.trials.hitPenaltyMs;
}

/** Story score recomputed from run stats; client and server share this exact function. */
export function storyScore(st: StoryStats): number {
  let n = 0;
  for (const [type, count] of Object.entries(st.kills) as [EnemyType | 'boss', number][]) {
    if (!count) continue;
    if (type === 'boss') n += S.boss * Math.min(1, count);
    else n += S.kill[type] * (type === 'imp' ? Math.min(count, S.impKillCap) : count);
  }
  n += S.captive * st.rescued + S.district * st.districtsLiberated + S.chest * st.chests;
  n += S.noDamageDistrict * Math.min(st.noDamageDistricts, st.districtsLiberated);
  n += S.guardBreak * Math.min(st.guardBreaks ?? 0, S.guardBreakCap) + S.warbanner * (st.warbanners ?? 0);
  return n;
}

export interface LevelTotals {
  enemies: Partial<Record<EnemyType, number>>;
  captives: number;
  districts: number;
  chests: number;
  warbanners: number;
}

/** Upper bound for an honest Story run: every placed enemy, every Imp up to the cap, full bonuses. */
export function maxPossibleScore(t: LevelTotals): number {
  const kills: StoryStats['kills'] = { ...t.enemies, imp: S.impKillCap, boss: 1 };
  return storyScore({
    kills,
    rescued: t.captives,
    districtsLiberated: t.districts,
    chests: t.chests,
    noDamageDistricts: t.districts,
    deaths: 0,
    guardBreaks: S.guardBreakCap,
    warbanners: t.warbanners,
  });
}
