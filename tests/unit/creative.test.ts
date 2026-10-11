import { describe, expect, it, beforeEach } from 'vitest';
import { balance } from '@/config/balance';
import { GameContext, effectiveBossStrength, stepMul, storyModifiers } from '@/modes/creative/GameContext';
import { validateLevel } from '@/level/levelSchema';
import arena from '@/modes/creative/creative_arena.level.json';
import village from '@/level/village.level.json';

describe('GameContext', () => {
  beforeEach(() => GameContext.enterStory());

  it('story mode always runs with every modifier off', () => {
    GameContext.enterCreative({ kind: 'sandbox' });
    GameContext.modifiers.godMode = true;
    GameContext.slowMo = 0.25;
    GameContext.enterStory();
    expect(GameContext.mode).toBe('story');
    expect(GameContext.creative).toBe(false);
    expect(GameContext.modifiers).toEqual(storyModifiers());
    expect(Object.values(GameContext.modifiers).every((v) => v === false)).toBe(true);
    expect(GameContext.slowMo).toBe(1);
    expect(GameContext.start).toBeNull();
  });

  it('creative toggles survive switching between sandbox and boss fights', () => {
    GameContext.enterCreative({ kind: 'sandbox' });
    GameContext.modifiers.infiniteArrows = true;
    GameContext.slowMo = 0.5;
    GameContext.enterCreative({ kind: 'boss', bossId: 'kaalasura', phase: 2 });
    expect(GameContext.creative).toBe(true);
    expect(GameContext.modifiers.infiniteArrows).toBe(true);
    expect(GameContext.slowMo).toBe(0.5);
    expect(GameContext.start).toMatchObject({ kind: 'boss', phase: 2 });
  });

  it('entering creative from story starts with clean modifiers', () => {
    GameContext.enterCreative({ kind: 'sandbox' });
    expect(GameContext.modifiers).toEqual(storyModifiers());
  });
});

describe('creative arena map', () => {
  it('validates through the shared level schema with no districts', () => {
    const lvl = validateLevel(arena);
    expect(lvl.districts).toEqual([]);
    expect(lvl.width).toBe(1600);
    expect(lvl.bossArena.bossSpawn.x).toBeLessThan(lvl.width);
  });

  it('story village still requires its four districts', () => {
    expect(validateLevel(village).districts).toHaveLength(4);
  });
});

describe('Creative boss strength (v3 §B2.4)', () => {
  beforeEach(() => GameContext.enterStory());
  it('Story ignores Creative strength; Legendary stacks with the sliders', () => {
    GameContext.bossStrength = { preset: 'legendary', hpMul: 2, dmgMul: 0.5 };
    expect(effectiveBossStrength()).toMatchObject({ hpMul: 1, dmgMul: 1, normal: true });
    GameContext.enterCreative({ kind: 'boss', bossId: 'kaalasura' });
    GameContext.bossStrength = { preset: 'legendary', hpMul: 2, dmgMul: 0.5 };
    expect(effectiveBossStrength()).toMatchObject({ hpMul: 3, dmgMul: 0.625, enrageShiftMs: -120_000, normal: false });
  });
  it('sliders step by 0.25 within HP x0.25-4 and damage x0-2', () => {
    const C = balance.bosses.creative;
    expect(stepMul(0.25, -1, C.hpMulMin, C.hpMulMax, C.step)).toBe(0.25);
    expect(stepMul(4, 1, C.hpMulMin, C.hpMulMax, C.step)).toBe(4);
    expect(stepMul(1, 1, C.hpMulMin, C.hpMulMax, C.step)).toBe(1.25);
    expect(stepMul(0.25, -1, C.dmgMulMin, C.dmgMulMax, C.step)).toBe(0);
  });
});
