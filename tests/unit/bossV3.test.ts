import { describe, expect, it } from 'vitest';
import { balance } from '@/config/balance';
import { RNG } from '@/core/RNG';
import { bossDamage, comboLength, summonDue, waveGapPx, crateDue, enrageMul, gapFor, hellfireEdge, phaseStartHp, telegraphMs } from '@/logic/boss';
import { guardPoiseFor } from '@/logic/guard';
import lavaForge from '@/level/arenas/lava_forge.level.json';

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

describe('Garjana v3 tuning', () => {
  const G = balance.garjana;
  it('keeps every ordinary attack under the 35 cap and Judgment under the 45 ultimate cap', () => {
    for (const a of Object.values(G.attacks)) if ('damage' in a) expect(a.damage).toBeLessThanOrEqual(balance.bosses.global.maxHitDamage);
    for (const j of G.judgment) expect(j.damage).toBeLessThanOrEqual(balance.bosses.global.ultimateMaxHit);
  });
  it('only weights attacks that exist, and adds Sky Dive from phase 2', () => {
    for (const ph of [1, 2, 3, 4] as const) for (const k of Object.keys(G.weights[ph])) expect(k in G.attacks).toBe(true);
    expect('skyDive' in G.weights[1]).toBe(false);
    expect('skyDive' in G.weights[2]).toBe(true);
    expect('stormSurge' in G.weights[4]).toBe(true);
  });
  it('second Judgment is harder: fewer pads, longer telegraph', () => {
    expect(G.judgment[1]!.pads).toBeLessThan(G.judgment[0]!.pads);
    expect(G.judgment[1]!.telegraphMs).toBeGreaterThan(G.judgment[0]!.telegraphMs);
  });
});

describe('Nishachara v3 tuning', () => {
  const N = balance.nishachara;
  const G = balance.bosses.global;
  it('keeps every attack under the ordinary hit cap after scaling', () => {
    for (const a of Object.values(N.attacks)) if ('damage' in a) expect(bossDamage(a.damage)).toBeLessThanOrEqual(G.maxHitDamage);
    for (const s of N.shadows) expect(bossDamage(s.realDamage)).toBeLessThanOrEqual(G.maxHitDamage);
  });
  it('weights only reference real attacks; ambush/kunai/slash in every phase', () => {
    for (const ph of [1, 2, 3, 4] as const) {
      const w = N.weights[ph];
      for (const k of Object.keys(w)) expect(k in N.attacks).toBe(true);
      expect(w).toMatchObject({ kunaiFan: expect.any(Number), slashDance: expect.any(Number), ambush: expect.any(Number) });
    }
    expect('eclipseVeil' in N.weights[4]).toBe(true);
    expect('eclipseVeil' in N.weights[3]).toBe(false);
  });
  it('veiled tells are at least 400 ms and the shuriken gap is at least 40 degrees', () => {
    expect(N.minTellMs).toBeGreaterThanOrEqual(400);
    const W = N.attacks.shurikenWheel;
    expect(W.slots - W.count).toBe(2);
    expect((2 * 360) / W.slots).toBeGreaterThanOrEqual(40);
  });
  it('clone caps grow 3 / 4 / 6 and Thousand Shadows fires at 20% and 8%', () => {
    expect([N.clones[2].cap, N.clones[3].cap, N.clones[4].cap]).toEqual([3, 4, 6]);
    expect(N.shadows.map((s) => s.at)).toEqual([0.2, 0.08]);
    expect(N.shadowsFloorFrac).toBeLessThan(N.shadows[1]!.at);
  });
  it('Lava Tide never exceeds 180 px or submerges a Lava Forge platform', () => {
    const T = N.lavaTide;
    expect(T.stepPx * T.maxSteps).toBeLessThanOrEqual(180);
    const L = lavaForge as unknown as { width: number; solids: { x: number; y: number; w: number }[]; lavaZones: { y: number }[] };
    const top = Math.min(...L.lavaZones.map((r) => r.y));
    const lowest = Math.max(...L.solids.filter((s) => s.y > 0 && s.w < L.width).map((s) => s.y));
    expect(top - lowest - T.dryMargin).toBeGreaterThanOrEqual(0);
  });
});

describe('Brute Champion v3 tuning', () => {
  const B = balance.bruteChampion;
  const A = B.attacks;
  it('900 HP, two phases split at 50 %, Guard 200 then 160, enrage at 2:30', () => {
    const S = balance.bosses.stats.brute;
    expect([S.hp, S.phases, S.guard, S.guardP2, S.enrageStartMs]).toEqual([900, 2, 200, 160, 150_000]);
    expect(phaseStartHp(900, 2, [0.5])).toBe(450);
  });
  it('v3 damage and telegraph values, all under the ordinary cap', () => {
    expect([A.slam.damage, A.slam.shockDamage, A.charge.damage, A.hammer.damage]).toEqual([28, 18, 25, 24]);
    expect([A.slam.telegraphMs, A.charge.telegraphMs, A.hammer.telegraphMs, A.hammer.recoverMs, A.charge.wallStunMs]).toEqual([800, 700, 500, 1400, 1200]);
    for (const v of [A.slam.damage, A.slam.shockDamage, A.charge.damage, A.hammer.damage]) expect(bossDamage(v)).toBe(v);
    for (const a of Object.values(A)) expect(telegraphMs(a.telegraphMs, 2, a.ranged, 1)).toBeGreaterThanOrEqual(G.telegraphFloor.melee);
  });
  it('wall stun costs 80 Guard; Double Charge is two charges 0.8 s apart', () => {
    expect(A.charge.wallGuard).toBe(80);
    expect([A.doubleCharge.charges, A.doubleCharge.gapMs]).toEqual([2, 800]);
  });
  it('Shockwave Triple leaves at least 100 px between waves', () => {
    expect(A.shockTriple.waves).toBe(3);
    expect(waveGapPx(A.slam.shockSpeed, A.shockTriple.delayMs, A.slam.shockW)).toBeGreaterThanOrEqual(B.minWaveGapPx);
  });
  it('Berserk-only attacks are weighted only in phase 2; every third attack summons 2 Imps', () => {
    expect(B.weights[1].doubleCharge + B.weights[1].shockTriple).toBe(0);
    expect(B.weights[2].doubleCharge).toBeGreaterThan(0);
    expect(B.weights[2].shockTriple).toBeGreaterThan(0);
    expect([1, 2, 3, 4, 5, 6].map((n) => summonDue(n, B.summonEvery))).toEqual([false, false, true, false, false, true]);
    expect(B.summonImps).toBe(2);
  });
});
