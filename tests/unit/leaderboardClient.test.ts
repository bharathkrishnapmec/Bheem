import { describe, expect, it } from 'vitest';
import { LocalProvider, type KV } from '@/leaderboard/LocalProvider';
import { SubmitQueue } from '@/leaderboard/SubmitQueue';
import { RunSession, taintReasons } from '@/leaderboard/RunSession';
import type { RunTicket } from '@/shared/types';

const mem = (): KV => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};
const base = { mode: 'trial', modifiers: { godMode: false }, search: '', debugKeyUsed: false, longestHiddenMs: 0, balanceOverride: false, trial: true };

describe('RunSession taint (v2 §A5.3)', () => {
  it('flags creative, modifiers, debug keys, URL flags, long hides and balance overrides', () => {
    expect(taintReasons(base)).toEqual([]);
    expect(taintReasons({ ...base, mode: 'creative' })).toEqual(['creative']);
    expect(taintReasons({ ...base, modifiers: { godMode: true } })).toEqual(['modifiers']);
    expect(taintReasons({ ...base, debugKeyUsed: true })).toEqual(['debug_key']);
    expect(taintReasons({ ...base, search: '?debug=1' })).toEqual(['url_flag']);
    expect(taintReasons({ ...base, search: '?seed=4' })).toEqual(['url_flag']);
    expect(taintReasons({ ...base, longestHiddenMs: 61_000 })).toEqual(['hidden']);
    expect(taintReasons({ ...base, longestHiddenMs: 61_000, trial: false })).toEqual([]);
    expect(taintReasons({ ...base, balanceOverride: true })).toEqual(['balance_override']);
  });
  it('excludes paused time and keeps taint sticky', () => {
    const s = new RunSession('trial_brute', 0);
    s.setPaused(true, 1000);
    s.setPaused(false, 4000);
    expect(s.elapsed(10_000)).toBe(7000);
    s.debugKeyUsed = true;
    s.check({ mode: 'trial', modifiers: {}, search: '', balanceOverride: false }, 10_000);
    s.debugKeyUsed = false;
    expect(s.check({ mode: 'trial', modifiers: {}, search: '', balanceOverride: false }, 11_000)).toEqual(['debug_key']);
    expect(s.tainted).toBe(true);
  });
});

describe('LocalProvider', () => {
  it('keeps the top 20 sorted and reports personal bests', async () => {
    const p = new LocalProvider(mem(), () => Date.UTC(2026, 9, 1));
    for (let i = 0; i < 25; i++) {
      const t = await p.startRun('trial_brute');
      await p.submit(t, { mode: 'trial', timeMs: 60_000 + i * 1000, hitsTaken: 0 }, 'Bheem1');
    }
    const top = await p.getTop('trial_brute', 'all', 50, 0);
    expect(top.total).toBe(20);
    expect(top.entries[0]!.value).toBe(60_000);
    const t = await p.startRun('trial_brute');
    expect(await p.submit(t, { mode: 'trial', timeMs: 50_000, hitsTaken: 1 }, 'Bheem1')).toMatchObject({ status: 'accepted', rank: 1 });
    expect(await p.submit(t, { mode: 'trial', timeMs: 90_000, hitsTaken: 0 }, 'Bheem1')).toMatchObject({ status: 'not_best', best: 56_000 });
    expect((await p.getTop('trial_brute', 'week', 1, 0)).entries[0]!.value).toBe(56_000);
  });
});

describe('SubmitQueue', () => {
  const ticket = (exp: number): RunTicket => ({ runId: 'r', board: 'trial_brute', token: 't', issuedAt: 0, expiresAt: exp });
  it('retries in order, stops on failure, expires after 24 h or token expiry, caps at 20', async () => {
    let now = 0;
    const q = new SubmitQueue(mem(), () => now);
    for (let i = 0; i < 22; i++) q.push(ticket(1e12), { mode: 'trial', timeMs: i, hitsTaken: 0 }, 'A');
    expect(q.items().length).toBe(20);
    expect(q.items()[0]!.result.timeMs).toBe(2);
    let calls = 0;
    const out = await q.flush(async () => {
      if (++calls > 3) throw new Error('offline');
      return { status: 'accepted' };
    });
    expect(out.length).toBe(3);
    expect(q.items()[0]!.result.timeMs).toBe(5);
    q.push(ticket(10), { mode: 'trial', timeMs: 1, hitsTaken: 0 }, 'B');
    now = 11;
    expect(q.items().some((i) => i.name === 'B')).toBe(false);
    now = 25 * 3_600_000;
    expect(q.items().length).toBe(0);
  });
});
