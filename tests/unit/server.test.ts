import { describe, expect, it } from 'vitest';
import { createApp } from '../../server/src/index';
import type { RunRow, ScoreRow, Store } from '../../server/src/store';
import { signRun, verifyRun } from '../../server/src/token';
import { weekKey } from '@/shared/boards';

class MemoryStore implements Store {
  runs = new Map<string, RunRow>();
  scores: ScoreRow[] = [];
  async insertRun(r: RunRow) {
    this.runs.set(r.run_id, { ...r });
  }
  async getRun(id: string) {
    return this.runs.get(id) ?? null;
  }
  async useRun(id: string) {
    const r = this.runs.get(id);
    if (!r || r.used) return false;
    r.used = 1;
    return true;
  }
  async getScore(b: string, p: string, d: string) {
    return this.scores.find((s) => s.board === b && s.period_key === p && s.device_id === d) ?? null;
  }
  async putScore(s: ScoreRow) {
    this.scores = [...this.scores.filter((x) => !(x.board === s.board && x.period_key === s.period_key && x.device_id === s.device_id)), s];
  }
  private sorted(b: string, p: string, desc: boolean) {
    const story = b === 'story_score';
    return this.scores.filter((s) => s.board === b && s.period_key === p).sort((x, y) => (desc ? y.value - x.value : x.value - y.value) || (story ? x.time_ms - y.time_ms : x.hits - y.hits));
  }
  async top(b: string, p: string, desc: boolean, limit: number, offset: number) {
    const all = this.sorted(b, p, desc);
    return { rows: all.slice(offset, offset + limit), total: all.length };
  }
  async rank(s: ScoreRow, desc: boolean, story: boolean) {
    return this.scores.filter((x) => x.board === s.board && x.period_key === s.period_key && ((desc ? x.value > s.value : x.value < s.value) || (x.value === s.value && (story ? x.time_ms < s.time_ms : x.hits < s.hits)))).length + 1;
  }
  async around(b: string, p: string, desc: boolean, rank: number, span: number) {
    return this.sorted(b, p, desc).slice(Math.max(0, rank - 1 - span), rank + span);
  }
}

const ORIGIN = 'https://game.example';
function setup() {
  let t = Date.UTC(2026, 9, 7, 12);
  const store = new MemoryStore();
  const app = createApp({ RUN_TOKEN_SECRET: 'test-secret', ALLOWED_ORIGINS: ORIGIN, BUILD_VERSIONS: '1.1,1.0' }, store, () => t);
  const call = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
    app(new Request(`https://api.example${path}`, body === undefined ? { headers: { origin: ORIGIN, ...headers } } : { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
  const startRun = async (device = 'dev-1', board = 'trial_brute') => (await (await call('/v1/run/start', { board, deviceId: device, buildVersion: '1.1' })).json()) as { runId: string; token: string };
  const submit = (r: { runId: string; token: string }, timeMs: number, hits = 0, device = 'dev-1', name = 'Bheem1') =>
    call('/v1/run/submit', { runId: r.runId, token: r.token, board: 'trial_brute', name, deviceId: device, buildVersion: '1.1', result: { mode: 'trial', timeMs, hitsTaken: hits } });
  return { store, call, startRun, submit, adv: (ms: number) => (t += ms) };
}

describe('run tokens', () => {
  it('HMAC verifies only the exact run fields', async () => {
    const tok = await signRun('s', 'r1', 'trial_brute', 5, '1.1', 'n0nce');
    expect(await verifyRun('s', tok, 'r1', 'trial_brute', 5, '1.1')).toBe(true);
    expect(await verifyRun('s', tok, 'r1', 'trial_brute', 6, '1.1')).toBe(false);
    expect(await verifyRun('other', tok, 'r1', 'trial_brute', 5, '1.1')).toBe(false);
  });
});

describe('Worker API', () => {
  it('health, CORS preflight and foreign origins', async () => {
    const s = setup();
    expect(await (await s.call('/v1/health')).json()).toMatchObject({ ok: true });
    const pre = await s.call('/v1/run/start', undefined, {});
    expect(pre.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect((await s.call('/v1/health', undefined, { origin: 'https://evil.example' })).status).toBe(403);
  });
  it('accepts a plausible trial, keeps only the best, ranks and paginates', async () => {
    const s = setup();
    const r1 = await s.startRun();
    s.adv(120_000);
    expect(await (await s.submit(r1, 100_000, 1)).json()).toEqual({ status: 'accepted', rank: 1 });
    const r2 = await s.startRun();
    s.adv(200_000);
    expect(await (await s.submit(r2, 150_000)).json()).toEqual({ status: 'not_best', rank: 1, best: 106_000 });
    const r3 = await s.startRun('dev-2');
    s.adv(100_000);
    expect(await (await s.submit(r3, 95_000, 0, 'dev-2', 'Arjun')).json()).toEqual({ status: 'accepted', rank: 1 });
    const top = (await (await s.call('/v1/boards/trial_brute?period=all&limit=25&offset=0')).json()) as { entries: { rank: number; name: string; value: number; hits: number }[]; total: number };
    expect(top.total).toBe(2);
    expect(top.entries.map((e) => [e.rank, e.name, e.value, e.hits])).toEqual([
      [1, 'Arjun', 95_000, 0],
      [2, 'Bheem1', 106_000, 1],
    ]);
    const me = (await (await s.call('/v1/boards/trial_brute/me?period=week&deviceId=dev-1')).json()) as { rank: number; neighbours: unknown[] };
    expect(me.rank).toBe(2);
    expect(me.neighbours.length).toBe(2);
    expect(s.store.scores.some((x) => x.period_key === weekKey(Date.UTC(2026, 9, 7)))).toBe(true);
  });
  it('rejects reused/forged tokens, wall-clock cheats, too-fast runs and bad names', async () => {
    const s = setup();
    const r = await s.startRun();
    s.adv(30_000);
    expect(await (await s.submit(r, 100_000)).json()).toMatchObject({ status: 'rejected' }); // 100 s claimed in 30 s
    s.adv(11_000);
    expect(await (await s.submit(r, 30_000)).json()).toMatchObject({ status: 'rejected' }); // single use
    const f = await s.startRun();
    s.adv(60_000);
    expect(await (await s.submit({ ...f, token: f.token.replace(/.$/, (c) => (c === '0' ? '1' : '0')) }, 30_000)).json()).toMatchObject({ status: 'rejected' });
    const g = await s.startRun();
    s.adv(60_000);
    expect(await (await s.submit(g, 20_000)).json()).toMatchObject({ status: 'rejected' }); // below 25 s floor
    const h = await s.startRun();
    s.adv(60_000);
    expect(await (await s.submit(h, 40_000, 0, 'dev-1', 'sh1thead')).json()).toEqual({ status: 'rejected', reason: 'name' });
    expect(s.store.scores.length).toBe(0);
  });
  it('rate limits, size caps, unknown fields and stale builds', async () => {
    const s = setup();
    const a = await s.startRun();
    const b = await s.startRun();
    s.adv(60_000);
    await s.submit(a, 40_000);
    const limited = await s.submit(b, 40_000);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await s.call('/v1/run/start', 'x'.repeat(5000))).status).toBe(413);
    expect((await s.call('/v1/run/start', { board: 'trial_brute', deviceId: 'd', buildVersion: '1.1', extra: 1 })).status).toBe(400);
    expect((await s.call('/v1/run/start', { board: 'trial_brute', deviceId: 'd', buildVersion: '0.9' })).status).toBe(400);
    expect((await s.call('/v1/boards/nope')).status).toBe(400);
  });
});
