import { describe, expect, it } from 'vitest';
import { balance } from '@/config/balance';
import { crumbleSolid, envOutcome, geyserPhase, gustPush, launchVelocityX, movingOffset, nearestPoint, stepCrumble, type CrumbleData } from '@/logic/hazards';
import { validateLevel, LevelValidationError } from '@/level/levelSchema';
import { checkReachability } from '@/level/reachability';
import forge from '@/level/arenas/lava_forge.level.json';
import sky from '@/level/arenas/sky_citadel.level.json';
import yard from '@/modes/creative/creative_arena.level.json';

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;
const G = { idleMs: 0, teleMs: 1000, eruptMs: 600 };

describe('geysers', () => {
  it('cycles idle -> telegraph -> erupt with the telegraph always before eruption', () => {
    expect(geyserPhase(0, 5600, 0, G).phase).toBe('idle');
    expect(geyserPhase(4000, 5600, 0, G).phase).toBe('telegraph');
    expect(geyserPhase(5000, 5600, 0, G).phase).toBe('erupt');
    expect(geyserPhase(5600, 5600, 0, G).phase).toBe('idle');
  });
  it('forge geysers never all erupt at once', () => {
    const gs = forge.geysers;
    for (let t = 0; t < 20000; t += 50) {
      const erupting = gs.filter((g) => geyserPhase(t, g.periodMs, g.phaseOffsetMs, G).phase === 'erupt').length;
      expect(erupting).toBeLessThan(gs.length);
    }
  });
});

describe('crumbling platforms', () => {
  const k = { standMs: 600, shakeMs: 600, respawnMs: 4000, riseMs: 500 };
  it('only crumbles after the hero stands for standMs, then returns', () => {
    let c: CrumbleData = { state: 'solid', t: 0 };
    c = stepCrumble(c, 500, true, k);
    c = stepCrumble(c, 100, false, k); // stepping off resets
    expect(c).toEqual({ state: 'solid', t: 0 });
    c = stepCrumble(c, 600, true, k);
    expect(c.state).toBe('shaking');
    expect(crumbleSolid(c.state)).toBe(true);
    c = stepCrumble(c, 600, false, k);
    expect(c.state).toBe('gone');
    expect(crumbleSolid(c.state)).toBe(false);
    c = stepCrumble(c, 4000, false, k);
    expect(c.state).toBe('rising');
    c = stepCrumble(c, 500, false, k);
    expect(c.state).toBe('solid');
  });
});

describe('movement + launch helpers', () => {
  it('moving platforms follow a sine within amplitude', () => {
    for (let t = 0; t < 6000; t += 100) expect(Math.abs(movingOffset('sine-x', 120, 6000, t).x)).toBeLessThanOrEqual(120);
    expect(movingOffset('sine-y', 80, 5000, 1250).y).toBeCloseTo(80);
  });
  it('lava launch lands near the nearest safe anchor', () => {
    const from = { x: 600, y: 790 };
    const tgt = nearestPoint(forge.safeAnchors, from.x, from.y)!;
    const vy = balance.arenas.lava.launchVy;
    const g = balance.player.gravity;
    const vx = launchVelocityX(from, tgt, vy, g, 2000);
    const t = (-vy + Math.sqrt(vy * vy + 2 * g * (tgt.y - from.y))) / g;
    expect(from.x + vx * t).toBeCloseTo(tgt.x, 0);
  });
  it('gust push is always beatable by holding against it', () => {
    expect(Math.abs(gustPush(90, balance.player.runSpeed))).toBeLessThan(balance.player.runSpeed);
    expect(gustPush(-90, balance.player.runSpeed)).toBeLessThan(0);
  });
  it('regular enemies die to the environment, elites are relaunched', () => {
    expect(envOutcome(false)).toBe('kill');
    expect(envOutcome(true)).toBe('damageAndRelaunch');
  });
});

describe('arena levels', () => {
  it('validator accepts all three arenas', () => {
    for (const l of [forge, sky, yard]) expect(() => validateLevel(clone(l))).not.toThrow();
  });
  it('arenas have no unreachable platforms (incl. updrafts and moving platforms)', () => {
    for (const l of [forge, sky]) expect(checkReachability(validateLevel(clone(l))).unreachable).toEqual([]);
  });
  it('rejects a spawn inside lava', () => {
    const l = clone(forge);
    l.heroSpawn = { x: 50, y: 800 };
    expect(() => validateLevel(l)).toThrow(/heroSpawn overlaps level.lavaZones\[0\]/);
  });
  it('rejects a missing fall respawn and an off-ground anchor', () => {
    const l = clone(sky);
    l.voidZones[0]!.fallRespawnPoints = [];
    expect(() => validateLevel(l)).toThrow(LevelValidationError);
    const l2 = clone(sky);
    l2.safeAnchors.push({ x: 1100, y: 700 });
    expect(() => validateLevel(l2)).toThrow(/safeAnchors\[3\].*not on solid ground/);
  });
  it('rejects an unreachable platform', () => {
    const l = clone(forge);
    l.oneWays.push({ x: 900, y: 40, w: 100, h: 16 });
    expect(() => validateLevel(l)).toThrow(/unreachable platform/);
  });
  it('Lava Forge has a 400px central platform as a safe anchor', () => {
    const centre = forge.solids.find((s) => s.w === 400)!;
    expect(forge.safeAnchors.some((a) => a.x >= centre.x && a.x <= centre.x + centre.w && a.y === centre.y)).toBe(true);
    expect(forge.crumblingPlatforms.some((c) => c.rect.x === centre.x)).toBe(false);
  });
});

describe('environment faction', () => {
  it('neutral (environment) sources hurt every faction, nothing targets neutral', async () => {
    const { isHostile } = await import('@/game/World');
    for (const f of ['hero', 'ally', 'enemy'] as const) {
      expect(isHostile('neutral', f)).toBe(true);
      expect(isHostile(f, 'neutral')).toBe(false);
    }
  });
});
