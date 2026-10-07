import { describe, expect, it } from 'vitest';
import { balance } from '@/config/balance';
import type { BossId } from '@/entities/boss/BossBase';
import { guardModifier, inTarget, simulate } from '@/logic/bossSim';

describe('boss simulator (v3 §B9.1)', () => {
  it('guard is roughly neutral for mid-skill play', () => {
    expect(guardModifier(balance.bosses.sim.profiles.mid.breaksPerMin)).toBeGreaterThan(0.9);
    expect(guardModifier(balance.bosses.sim.profiles.mid.breaksPerMin)).toBeLessThan(1.1);
  });
  for (const id of Object.keys(balance.bosses.stats) as BossId[]) {
    it(`${id}: mid-skill modelled time is inside the target range`, () => {
      const r = simulate(id, 'mid');
      expect(inTarget(r), `${id} ${r.totalMs} ms`).toBe(true);
      expect(simulate(id, 'novice').totalMs).toBeGreaterThan(r.totalMs);
      expect(simulate(id, 'skilled').totalMs).toBeLessThan(r.totalMs);
    });
  }
});
