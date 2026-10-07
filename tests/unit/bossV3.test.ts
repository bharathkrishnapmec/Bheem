import { describe, expect, it } from 'vitest';
import { balance } from '@/config/balance';
import { RNG } from '@/core/RNG';
import { bossDamage, comboLength, crateDue, enrageMul, gapFor, hellfireEdge, phaseStartHp, telegraphMs } from '@/logic/boss';
import { guardPoiseFor } from '@/logic/guard';

const G = balance.bosses.global;

describe('boss v3 shared rules', () => {
  it('phase gaps 1800/1500/1200/900', () => {
    expect([1, 2, 3, 4].map((p) => gapFor(p as 1 | 2 | 3 | 4, 0, 480_000))).toEqual([1800, 1500, 1200, 900]);
  });
  it('soft enrage: 8 %/min after start, capped at 30 %, never below 70 % gap', () => {
    expect(enrageMul(479_000, 480_000)).toBe(1);
    expect(enrageMul(540_000, 480_000)).toBeCloseTo(0.92);
    expect(enrageMul(600_000, 480_000)).toBeCloseTo(0.84);
    expect(enrageMul(3_600_000, 480_000)).toBeCloseTo(0.7);
    expect(gapFor(4, 3_600_000, 480_000)).toBeCloseTo(630);
  });
  it('combo limits: P1-P2 single, P3 <= 2, P4 <= 3', () => {
    const r = new RNG(3);
    for (let i = 0; i < 200; i++) {
      expect(comboLength(1, r)).toBe(1);
      expect(comboLength(2, r)).toBe(1);
      expect(comboLength(3, r)).toBeLessThanOrEqual(2);
      const c4 = comboLength(4, r);
      expect(c4).toBeGreaterThanOrEqual(1);
      expect(c4).toBeLessThanOrEqual(3);
    }
  });
  it('damage cap 35 (45 for ultimates); damageScale applied once', () => {
    expect(bossDamage(60)).toBe(35);
    expect(bossDamage(60, true)).toBe(45);
    expect(bossDamage(30)).toBe(30);
    expect(bossDamage(30, false, 0)).toBe(0);
    expect(balance.boss.attacks.slam.damage).toBe(Math.round(24 * G.damageScale));
    expect(Math.round(balance.boss.attacks.slam.damage * balance.bosses.presets.classic.dmgMul)).toBe(24);
  });
  it('every Kaalasura attack value is within the ordinary cap', () => {
    for (const [id, a] of Object.entries(balance.boss.attacks)) {
      for (const [k, v] of Object.entries(a)) if (/damage/i.test(k) && typeof v === 'number') expect(v, `${id}.${k}`).toBeLessThanOrEqual(G.maxHitDamage);
    }
  });
  it('telegraph floors survive phase scaling', () => {
    expect(telegraphMs(400, 4, false)).toBe(350);
    expect(telegraphMs(500, 3, true)).toBe(450);
    expect(telegraphMs(900, 1, false)).toBe(900);
    for (const a of Object.values(balance.boss.attacks)) expect(telegraphMs(a.telegraphMs, 4, a.ranged)).toBeGreaterThanOrEqual(a.ranged ? 450 : 350);
  });
  it('phase start HP', () => {
    expect(phaseStartHp(3600, 2)).toBe(2700);
    expect(phaseStartHp(3600, 4)).toBe(900);
    expect(phaseStartHp(900, 2, [0.5])).toBe(450);
  });
  it('hellfire creeps but always leaves >= 900 px', () => {
    expect(hellfireEdge(0, 1600)).toBe(200);
    expect(hellfireEdge(20_000, 1600)).toBe(300);
    expect(hellfireEdge(600_000, 1600)).toBe(350);
    expect(1600 - 2 * hellfireEdge(600_000, 1600)).toBeGreaterThanOrEqual(900);
  });
  it('supply crates: 45 s cadence, max 2, never during ultimate telegraphs', () => {
    expect(crateDue(44_999, 0, false)).toBe(false);
    expect(crateDue(45_000, 0, false)).toBe(true);
    expect(crateDue(45_000, 2, false)).toBe(false);
    expect(crateDue(45_000, 1, true)).toBe(false);
  });
  it('guard poise table', () => {
    const P = balance.guard.poise;
    expect(guardPoiseFor({ kind: 'melee', faction: 'hero' }, P)).toBe(10);
    expect(guardPoiseFor({ kind: 'melee', faction: 'hero', isFinisher: true }, P)).toBe(18);
    expect(guardPoiseFor({ kind: 'arrow', faction: 'hero' }, P)).toBe(4);
    expect(guardPoiseFor({ kind: 'lightning', faction: 'hero', isClap: true }, P)).toBe(45);
    expect(guardPoiseFor({ kind: 'lightning', faction: 'hero' }, P)).toBe(6);
    expect(guardPoiseFor({ kind: 'melee', faction: 'hero', byAlly: true }, P)).toBe(3);
    expect(guardPoiseFor({ kind: 'contact', faction: 'neutral' }, P)).toBe(0);
    expect(guardPoiseFor({ kind: 'arrow', faction: 'hero', guardPoise: 80 }, P)).toBe(80);
  });
});
