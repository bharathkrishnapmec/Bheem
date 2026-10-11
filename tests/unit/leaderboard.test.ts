import { describe, expect, it } from 'vitest';
import { balance } from '@/config/balance';
import { adjustedTimeMs, maxPossibleScore, storyScore } from '@/shared/scoring';
import { BOARDS, boardDef, checkRun, compareEntries, weekKey } from '@/shared/boards';
import { generatedName, nameIssue, normalizeName } from '@/shared/names';
import type { RunResult, StoryStats } from '@/shared/types';
import village from '@/level/village.level.json';

const stats = (): StoryStats => ({ kills: { raider: 10, imp: 80, boss: 1 }, rescued: 12, districtsLiberated: 4, chests: 5, noDamageDistricts: 1, deaths: 2, guardBreaks: 25, warbanners: 3 });
const totals = () => {
  const enemies: Record<string, number> = {};
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') {
      const r = o as Record<string, unknown>;
      if (typeof r.type === 'string' && r.type in balance.score.kill) enemies[r.type] = (enemies[r.type] ?? 0) + ((r.count as number) ?? 1);
      Object.values(r).forEach(walk);
    }
  };
  walk(village);
  const ds = village.districts;
  return { enemies, captives: ds.reduce((n, d) => n + d.captives.length, 0), districts: ds.length, chests: ds.reduce((n, d) => n + d.chests.length, 0), warbanners: 6 };
};

describe('shared scoring (v2 §A4.3 / v3 §B8)', () => {
  it('adjusted time adds 6 s per hit taken', () => {
    expect(adjustedTimeMs(100_000, 3)).toBe(118_000);
  });
  it('story score caps Imp kills and Guard Breaks', () => {
    const S = balance.score;
    const want = 10 * S.kill.raider + 60 * S.kill.imp + S.boss + 12 * S.captive + 4 * S.district + 5 * S.chest + S.noDamageDistrict + 20 * S.guardBreak + 3 * S.warbanner;
    expect(storyScore(stats())).toBe(want);
  });
  it('max possible score bounds a perfect village run', () => {
    const max = maxPossibleScore(totals());
    expect(max).toBeGreaterThan(storyScore(stats()));
  });
});

describe('boards + plausibility', () => {
  it('has one trial board per trial-eligible boss', () => {
    expect(BOARDS.map((b) => b.id)).toEqual(['story_score', 'trial_kaalasura', 'trial_garjana', 'trial_nishachara', 'trial_brute']);
  });
  it('tie-breaks: story on lower time, trials on fewer hits', () => {
    expect(compareEntries(boardDef('story_score')!, { value: 5, hits: 0, timeMs: 10 }, { value: 5, hits: 0, timeMs: 20 })).toBeLessThan(0);
    expect(compareEntries(boardDef('trial_garjana')!, { value: 5, hits: 2, timeMs: 0 }, { value: 5, hits: 1, timeMs: 0 })).toBeGreaterThan(0);
    expect(compareEntries(boardDef('trial_garjana')!, { value: 4, hits: 9, timeMs: 0 }, { value: 5, hits: 0, timeMs: 0 })).toBeLessThan(0);
  });
  it('accepts honest runs and rejects impossible ones', () => {
    const max = maxPossibleScore(totals());
    const trial: RunResult = { mode: 'trial', timeMs: 120_000, hitsTaken: 2 };
    expect(checkRun(boardDef('trial_kaalasura')!, trial, max)).toBeNull();
    expect(checkRun(boardDef('trial_kaalasura')!, { ...trial, timeMs: 60_000 }, max)).toBe('too_fast');
    expect(checkRun(boardDef('trial_brute')!, { ...trial, timeMs: 30_000 }, max)).toBeNull();
    expect(checkRun(boardDef('trial_brute')!, { ...trial, hitsTaken: -1 }, max)).toBe('fields');
    const story: RunResult = { mode: 'story', timeMs: 20 * 60_000, hitsTaken: 9, score: storyScore(stats()), stats: stats() };
    expect(checkRun(boardDef('story_score')!, story, max)).toBeNull();
    expect(checkRun(boardDef('story_score')!, { ...story, score: story.score! + 10 }, max)).toBe('score_mismatch');
    expect(checkRun(boardDef('story_score')!, { ...story, timeMs: 11 * 60_000 }, max)).toBe('too_fast');
    expect(checkRun(boardDef('story_score')!, { ...story, stats: { ...stats(), noDamageDistricts: 5 } }, max)).toBe('stats');
  });
  it('ISO week keys roll over on Monday UTC', () => {
    expect(weekKey(Date.UTC(2026, 9, 11, 23, 59))).toBe('2026-W41');
    expect(weekKey(Date.UTC(2026, 9, 12, 0, 0))).toBe('2026-W42');
    expect(weekKey(Date.UTC(2027, 0, 1))).toBe('2026-W53');
  });
});

describe('names (v2 §A3.2)', () => {
  it('validates length, characters and profanity', () => {
    expect(nameIssue('Bheem4821')).toBeNull();
    expect(nameIssue('ab')).toBe('length');
    expect(nameIssue('bad<name>')).toBe('chars');
    expect(nameIssue('sh1tlord')).toBe('profanity');
    expect(normalizeName('  heeeeey  you ')).toBe('heey you');
    expect(generatedName(() => 0.5)).toBe('Bheem5500');
  });
});
