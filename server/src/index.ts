import { balance } from '@/config/balance';
import village from '@/level/village.level.json';
import { boardDef, checkRun, compareEntries, runValue, weekKey } from '@/shared/boards';
import { levelTotals } from '@/shared/levelTotals';
import { maxPossibleScore } from '@/shared/scoring';
import type { RunResult } from '@/shared/types';
import { EXTRA_DENY, nameIssue, normalizeName } from './profanity';
import { RateLimiter, ipHash } from './rateLimit';
import { D1Store, type D1Like, type ScoreRow, type Store } from './store';
import { signRun, verifyRun } from './token';

export interface Env {
  DB?: D1Like;
  RUN_TOKEN_SECRET: string;
  ALLOWED_ORIGINS?: string;
  /** Comma list of accepted build versions (current, previous). Unset = accept any. */
  BUILD_VERSIONS?: string;
  VERSION?: string;
}

const MAX_BODY = 4096;
const START_KEYS = ['board', 'deviceId', 'buildVersion'];
const SUBMIT_KEYS = ['runId', 'token', 'board', 'name', 'deviceId', 'buildVersion', 'result'];
const RESULT_KEYS = ['mode', 'timeMs', 'hitsTaken', 'score', 'stats', 'inputLogHash'];
const MAX_SCORE = maxPossibleScore(levelTotals(village));
const T = balance.trials;

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfter = 0,
  ) {
    super(String(status));
  }
}

const onlyKeys = (o: unknown, keys: string[]): o is Record<string, unknown> => !!o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).every((k) => keys.includes(k));
const str = (v: unknown, max = 64): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const periodKey = (p: string | null, now: number): string | null => (p === null || p === 'all' ? 'all' : p === 'week' ? weekKey(now) : null);
const entry = (r: ScoreRow, rank: number, trial: boolean) => ({ rank, name: r.name, value: r.value, ...(trial ? { hits: r.hits } : {}), at: r.created_at });

/** Worker request handler (v2 §A5.4-A5.5). Store, clock and limiter are injectable for tests. */
export function createApp(env: Env, store: Store, now: () => number = Date.now, limiter = new RateLimiter(now)) {
  const origins = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const builds = (env.BUILD_VERSIONS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  async function body(req: Request, keys: string[]): Promise<Record<string, unknown>> {
    const text = await req.text();
    if (text.length > MAX_BODY) throw new HttpError(413);
    let o: unknown;
    try {
      o = JSON.parse(text);
    } catch {
      throw new HttpError(400);
    }
    if (!onlyKeys(o, keys)) throw new HttpError(400);
    return o;
  }
  function limit(key: string, max: number, windowMs: number): void {
    const wait = limiter.take(key, max, windowMs);
    if (wait) throw new HttpError(429, wait);
  }

  async function start(req: Request, ip: string) {
    const b = await body(req, START_KEYS);
    const def = boardDef(String(b.board));
    if (!def || !str(b.deviceId) || !str(b.buildVersion, 32)) throw new HttpError(400);
    if (builds.length && !builds.includes(b.buildVersion)) throw new HttpError(400);
    limit(`start:${ip}`, 60, 3_600_000);
    const t = now();
    const runId = crypto.randomUUID();
    const nonce = crypto.randomUUID().slice(0, 8);
    const expiresAt = t + (def.mode === 'story' ? T.storyTokenMs : T.trialTokenMs);
    const token = await signRun(env.RUN_TOKEN_SECRET, runId, def.id, t, b.buildVersion, nonce);
    await store.insertRun({ run_id: runId, board: def.id, device_id: b.deviceId, issued_at: t, expires_at: expiresAt, used: 0, build: b.buildVersion });
    return { runId, token, issuedAt: t, expiresAt };
  }

  async function submit(req: Request, ip: string) {
    const b = await body(req, SUBMIT_KEYS);
    const def = boardDef(String(b.board));
    if (!def || !str(b.runId) || !str(b.token, 200) || !str(b.deviceId) || !str(b.buildVersion, 32) || typeof b.name !== 'string' || !onlyKeys(b.result, RESULT_KEYS)) throw new HttpError(400);
    limit(`submit:${b.deviceId}`, 1, 10_000);
    limit(`submit-ip:${ip}`, 30, 3_600_000);
    const rejected = { status: 'rejected' as const };
    const result = b.result as unknown as RunResult;
    const t = now();
    const run = await store.getRun(b.runId);
    if (!run || run.board !== def.id || run.device_id !== b.deviceId || run.build !== b.buildVersion || t > run.expires_at) return rejected;
    if (!(await verifyRun(env.RUN_TOKEN_SECRET, b.token, run.run_id, run.board, run.issued_at, run.build))) return rejected;
    if (!(await store.useRun(run.run_id))) return rejected;
    if (typeof result.timeMs !== 'number' || t - run.issued_at < result.timeMs - T.wallClockToleranceMs) return rejected;
    const name = normalizeName(b.name);
    if (nameIssue(name, EXTRA_DENY)) return { status: 'rejected' as const, reason: 'name' };
    if (checkRun(def, result, MAX_SCORE)) return rejected;
    const base = { board: def.id, device_id: b.deviceId, name, value: runValue(def, result), hits: result.hitsTaken, time_ms: result.timeMs, created_at: t };
    let improved = false;
    let best = base.value;
    for (const pk of ['all', weekKey(t)]) {
      const row: ScoreRow = { ...base, period_key: pk };
      const prev = await store.getScore(def.id, pk, b.deviceId);
      const better = !prev || compareEntries(def, { value: row.value, hits: row.hits, timeMs: row.time_ms }, { value: prev.value, hits: prev.hits, timeMs: prev.time_ms }) < 0;
      if (better) await store.putScore(row);
      if (pk === 'all') {
        improved = better;
        best = better ? row.value : prev!.value;
      }
    }
    const mine = await store.getScore(def.id, 'all', b.deviceId);
    const rank = await store.rank(mine!, def.sort === 'desc', def.mode === 'story');
    return improved ? { status: 'accepted' as const, rank } : { status: 'not_best' as const, rank, best };
  }

  async function boards(url: URL, board: string, me: boolean) {
    const def = boardDef(board);
    const pk = periodKey(url.searchParams.get('period'), now());
    if (!def || !pk) throw new HttpError(400);
    const desc = def.sort === 'desc';
    const trial = def.mode === 'trial';
    if (me) {
      const device = url.searchParams.get('deviceId');
      if (!str(device)) throw new HttpError(400);
      const row = await store.getScore(def.id, pk, device);
      if (!row) return { rank: null };
      const rank = await store.rank(row, desc, !trial);
      const around = await store.around(def.id, pk, desc, rank, 3);
      const first = Math.max(1, rank - 3);
      return { rank, entry: entry(row, rank, trial), neighbours: around.map((r, i) => entry(r, first + i, trial)) };
    }
    const lim = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 25) || 25));
    const off = Math.max(0, Number(url.searchParams.get('offset') ?? 0) || 0);
    const page = await store.top(def.id, pk, desc, lim, off);
    return { entries: page.rows.map((r, i) => entry(r, off + i + 1, trial)), total: page.total };
  }

  return async function handle(req: Request): Promise<Response> {
    const origin = req.headers.get('origin') ?? '';
    const cors: Record<string, string> = origins.includes(origin) ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'origin' } : {};
    if (origin && !cors['access-control-allow-origin']) return new Response(null, { status: 403 });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    const json = (data: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...cors, ...extra } });
    try {
      const ip = await ipHash(req.headers.get('cf-connecting-ip') ?? 'unknown', now());
      const p = url.pathname;
      if (req.method === 'GET' && p === '/v1/health') return json({ ok: true, version: env.VERSION ?? 'dev' });
      if (req.method === 'POST' && p === '/v1/run/start') return json(await start(req, ip));
      if (req.method === 'POST' && p === '/v1/run/submit') return json(await submit(req, ip));
      const m = /^\/v1\/boards\/([a-z_]+)(\/me)?$/.exec(p);
      if (req.method === 'GET' && m) return json(await boards(url, m[1]!, !!m[2]));
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.status }, e.status, e.retryAfter ? { 'retry-after': String(e.retryAfter) } : {});
      return json({ error: 'server' }, 500);
    }
  };
}

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    if (!env.DB) return Promise.resolve(new Response('DB binding missing', { status: 500 }));
    return createApp(env, new D1Store(env.DB))(req);
  },
};
