import { balance } from '@/config/balance';
import { boardDef, compareEntries, weekKey } from '@/shared/boards';
import type { BoardId, BoardPage, Entry, MyRank, Period, RunResult, RunTicket, SubmitOutcome } from '@/shared/types';
import { runValue } from '@/shared/boards';

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}
interface Row {
  name: string;
  value: number;
  hits: number;
  timeMs: number;
  at: number;
  practice?: boolean;
}
const KEY = 'bheem.lb.local.v1';

/** "This device only" board (v2 §A2.1): top 20 per board and period plus personal bests. */
export class LocalProvider {
  constructor(
    private kv: KV,
    private now: () => number = Date.now,
  ) {}
  private load(): Record<string, Row[]> {
    try {
      return JSON.parse(this.kv.getItem(KEY) ?? '{}') as Record<string, Row[]>;
    } catch {
      return {};
    }
  }
  private key(board: BoardId, period: Period): string {
    return `${board}|${period === 'all' ? 'all' : weekKey(this.now())}`;
  }
  private rows(board: BoardId, period: Period): Row[] {
    return this.load()[this.key(board, period)] ?? [];
  }
  getTop(board: BoardId, period: Period, limit = 25, offset = 0): Promise<BoardPage> {
    const rows = this.rows(board, period);
    const entries: Entry[] = rows.slice(offset, offset + limit).map((r, i) => ({ rank: offset + i + 1, name: r.practice ? `${r.name} (practice)` : r.name, value: r.value, hits: r.hits, at: r.at }));
    return Promise.resolve({ entries, total: rows.length });
  }
  getMine(board: BoardId, period: Period): Promise<MyRank | null> {
    const rows = this.rows(board, period);
    if (!rows.length) return Promise.resolve(null);
    const r = rows[0]!;
    return Promise.resolve({ rank: 1, entry: { rank: 1, name: r.name, value: r.value, hits: r.hits, at: r.at }, neighbours: [] });
  }
  best(board: BoardId): number | null {
    return this.rows(board, 'all')[0]?.value ?? null;
  }
  startRun(board: BoardId): Promise<RunTicket> {
    const t = this.now();
    return Promise.resolve({ runId: `local-${t}-${Math.floor(Math.random() * 1e6)}`, board, token: 'local', issuedAt: t, expiresAt: t + balance.trials.storyTokenMs });
  }
  submit(ticket: RunTicket, result: RunResult, name: string, practice = false): Promise<SubmitOutcome> {
    const def = boardDef(ticket.board)!;
    const all = this.load();
    const row: Row = { name, value: runValue(def, result), hits: result.hitsTaken, timeMs: result.timeMs, at: this.now(), practice: practice || undefined };
    let out: SubmitOutcome = { status: 'not_best' };
    for (const period of ['all', 'week'] as const) {
      const k = this.key(ticket.board, period);
      const prev = all[k] ?? [];
      const better = !prev.length || compareEntries(def, row, prev[0]!) < 0;
      const rows = [...prev, row].sort((a, b) => compareEntries(def, a, b)).slice(0, balance.trials.localTop);
      all[k] = rows;
      if (period === 'all') out = better ? { status: 'accepted', rank: rows.indexOf(row) + 1 } : { status: 'not_best', best: prev[0]!.value };
    }
    this.kv.setItem(KEY, JSON.stringify(all));
    return Promise.resolve(out);
  }
}
