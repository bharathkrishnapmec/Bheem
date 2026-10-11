import { describe, expect, it } from 'vitest';
import { GuardSystem, type GuardConfig } from '@/logic/guard';

const cfg: GuardConfig = { max: 350, guardedHpMul: 0.8, brokenHpMul: 1.5, breakMs: 4000, recoveryMs: 8000, regenDelayMs: 5000, regenPerSec: 30, uncancellableResidual: 0.25 };

describe('GuardSystem', () => {
  it('guards HP at x0.8 and breaks at 0 for 4 s with x1.5', () => {
    const g = new GuardSystem(cfg);
    expect(g.hpMultiplier()).toBe(0.8);
    expect(g.damage(300).broke).toBe(false);
    const r = g.damage(80);
    expect(r).toEqual({ broke: true, deferred: false, applied: 50 });
    expect(g.broken).toBe(true);
    expect(g.hpMultiplier()).toBe(1.5);
    g.update(3999);
    expect(g.broken).toBe(true);
    g.update(1);
    expect(g.state).toBe('recovery');
    expect(g.guard).toBe(350);
  });
  it('cannot be broken (or damaged) during the 8 s recovery', () => {
    const g = new GuardSystem(cfg);
    g.breakNow();
    g.update(4000);
    expect(g.damage(999).applied).toBe(0);
    expect(g.snapshot(1000).recoveryUntil).toBe(9000);
    g.update(8000);
    expect(g.state).toBe('guarded');
    expect(g.damage(999).broke).toBe(true);
  });
  it('regenerates +30/s only after 5 s without guard damage', () => {
    const g = new GuardSystem(cfg);
    g.damage(200);
    g.update(4900);
    expect(g.guard).toBe(150);
    g.update(100);
    g.update(1000);
    expect(g.guard).toBeCloseTo(183); // +3 in the tick that crosses 5 s, then +30
    g.damage(10);
    g.update(1000);
    expect(g.guard).toBeCloseTo(173);
  });
  it('uncancellable actions leave Guard at 25% instead of breaking', () => {
    const g = new GuardSystem(cfg);
    const r = g.damage(400, { uncancellable: true });
    expect(r.deferred).toBe(true);
    expect(g.broken).toBe(false);
    expect(g.guard).toBe(Math.round(350 * 0.25));
  });
  it('frozen guard (Wind Barrier) takes no damage and does not regen', () => {
    const g = new GuardSystem(cfg);
    g.damage(100);
    g.frozen = true;
    expect(g.damage(100).applied).toBe(0);
    g.update(10000);
    expect(g.guard).toBe(250);
  });
  it('phase reset refills guard and clears break', () => {
    const g = new GuardSystem(cfg);
    g.breakNow();
    g.reset();
    expect(g.state).toBe('guarded');
    expect(g.guard).toBe(350);
    expect(g.snapshot(0)).toEqual({ guard: 350, max: 350, broken: false });
  });
});
