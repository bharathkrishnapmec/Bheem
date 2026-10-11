import type { BoardId, BoardPage, MyRank, Period, RunResult, RunTicket, SubmitOutcome } from '@/shared/types';

/** fetch() client for the Worker API (v2 §A5.5). Throws on network/5xx so callers can queue. */
export class RemoteProvider {
  constructor(
    private base: string,
    private deviceId: string,
    private build: string,
    private fetcher: typeof fetch = (...a) => fetch(...a),
  ) {}
  private async call<T>(path: string, body?: unknown): Promise<T> {
    const res = await this.fetcher(`${this.base.replace(/\/$/, '')}${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    if (res.status >= 500 || res.status === 429) throw new Error(`http ${res.status}`);
    return (await res.json()) as T;
  }
  getTop(board: BoardId, period: Period, limit = 25, offset = 0): Promise<BoardPage> {
    return this.call(`/v1/boards/${board}?period=${period}&limit=${limit}&offset=${offset}`);
  }
  async getMine(board: BoardId, period: Period): Promise<MyRank | null> {
    const r = await this.call<MyRank | { rank: null }>(`/v1/boards/${board}/me?period=${period}&deviceId=${encodeURIComponent(this.deviceId)}`);
    return r.rank ? (r as MyRank) : null;
  }
  async startRun(board: BoardId): Promise<RunTicket> {
    const r = await this.call<Omit<RunTicket, 'board'>>('/v1/run/start', { board, deviceId: this.deviceId, buildVersion: this.build });
    return { ...r, board };
  }
  submit(ticket: RunTicket, result: RunResult, name: string): Promise<SubmitOutcome> {
    return this.call('/v1/run/submit', { runId: ticket.runId, token: ticket.token, board: ticket.board, name, deviceId: this.deviceId, buildVersion: this.build, result });
  }
}
