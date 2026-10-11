import { balance } from '@/config/balance';
import type { EnemyType } from '@/core/types';
import type { LevelTotals } from './scoring';

/** Story maxima from a level JSON (enemies by type, captives, chests, districts). Warbanners use a generous bound. */
export function levelTotals(level: { districts: { captives: unknown[]; chests: unknown[] }[] }, warbanners = 12): LevelTotals {
  const enemies: Partial<Record<EnemyType, number>> = {};
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') {
      const r = o as Record<string, unknown>;
      if (typeof r.type === 'string' && r.type in balance.score.kill) {
        const t = r.type as EnemyType;
        enemies[t] = (enemies[t] ?? 0) + (typeof r.count === 'number' ? r.count : 1);
      }
      Object.values(r).forEach(walk);
    }
  };
  walk(level);
  const ds = level.districts;
  return { enemies, captives: ds.reduce((n, d) => n + d.captives.length, 0), districts: ds.length, chests: ds.reduce((n, d) => n + d.chests.length, 0), warbanners };
}
