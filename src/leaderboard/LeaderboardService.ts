import { generatedName } from '@/shared/names';
import type { BoardId, BoardPage, MyRank, Period, RunResult, RunTicket, SubmitOutcome } from '@/shared/types';
import { LocalProvider, type KV } from './LocalProvider';
import { RemoteProvider } from './RemoteProvider';
import { SubmitQueue } from './SubmitQueue';

const DEVICE_KEY = 'bheem.deviceId';
const NAME_KEY = 'bheem.lb.name';

function storage(): KV {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* storage blocked */
  }
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

/** Facade used by the game (v2 §A2.3): Remote when VITE_LEADERBOARD_URL is set, LocalProvider always mirrors personal bests. */
export class LeaderboardService {
  readonly local: LocalProvider;
  readonly remote: RemoteProvider | null;
  readonly queue: SubmitQueue;
  constructor(
    private kv: KV = storage(),
    url: string | undefined = import.meta.env.VITE_LEADERBOARD_URL as string | undefined,
    build: string = (import.meta.env.VITE_BUILD_VERSION as string | undefined) ?? 'dev',
    fetcher?: typeof fetch,
  ) {
    this.local = new LocalProvider(kv);
    this.queue = new SubmitQueue(kv);
    this.remote = url ? new RemoteProvider(url, this.deviceId, build, fetcher) : null;
  }
  get online(): boolean {
    return this.remote !== null;
  }
  get deviceId(): string {
    let id = this.kv.getItem(DEVICE_KEY);
    if (!id) {
      id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `d-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      this.kv.setItem(DEVICE_KEY, id);
    }
    return id;
  }
  get name(): string {
    return this.kv.getItem(NAME_KEY) ?? generatedName();
  }
  set name(n: string) {
    this.kv.setItem(NAME_KEY, n);
  }
  get hasName(): boolean {
    return this.kv.getItem(NAME_KEY) !== null;
  }
  getTop(board: BoardId, period: Period, limit = 25, offset = 0): Promise<BoardPage> {
    return this.remote ? this.remote.getTop(board, period, limit, offset) : this.local.getTop(board, period, limit, offset);
  }
  getMine(board: BoardId, period: Period): Promise<MyRank | null> {
    return this.remote ? this.remote.getMine(board, period) : this.local.getMine(board, period);
  }
  async startRun(board: BoardId): Promise<RunTicket> {
    if (this.remote) {
      try {
        return await this.remote.startRun(board);
      } catch {
        /* offline: fall back to a local ticket */
      }
    }
    return this.local.startRun(board);
  }
  /** Records the local best (marked practice when tainted); submits remotely only for clean runs with a server ticket. */
  async submit(ticket: RunTicket, result: RunResult, tainted: boolean): Promise<SubmitOutcome> {
    const local = await this.local.submit(ticket, result, this.name, tainted);
    if (tainted || !this.remote || ticket.token === 'local') return local;
    try {
      return await this.remote.submit(ticket, result, this.name);
    } catch {
      this.queue.push(ticket, result, this.name);
      return { status: 'queued' };
    }
  }
  /** Retry queued submissions (app start and `online` event). */
  flush(): Promise<SubmitOutcome[]> {
    const r = this.remote;
    return r ? this.queue.flush((q) => r.submit(q.ticket, q.result, q.name)) : Promise.resolve([]);
  }
}

export const Leaderboard = new LeaderboardService();
