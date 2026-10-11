export interface RunRow {
  run_id: string;
  board: string;
  device_id: string;
  issued_at: number;
  expires_at: number;
  used: number;
  build: string;
}
export interface ScoreRow {
  board: string;
  period_key: string;
  device_id: string;
  name: string;
  value: number;
  hits: number;
  time_ms: number;
  created_at: number;
}
export interface Store {
  insertRun(r: RunRow): Promise<void>;
  getRun(id: string): Promise<RunRow | null>;
  /** Atomically marks a run used; false if it already was. */
  useRun(id: string): Promise<boolean>;
  getScore(board: string, period: string, device: string): Promise<ScoreRow | null>;
  putScore(s: ScoreRow): Promise<void>;
  top(board: string, period: string, desc: boolean, limit: number, offset: number): Promise<{ rows: ScoreRow[]; total: number }>;
  rank(s: ScoreRow, desc: boolean, story: boolean): Promise<number>;
  around(board: string, period: string, desc: boolean, rank: number, span: number): Promise<ScoreRow[]>;
}

interface D1Stmt {
  bind(...v: unknown[]): D1Stmt;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface D1Like {
  prepare(sql: string): D1Stmt;
}

const order = (desc: boolean, story: boolean) => `value ${desc ? 'DESC' : 'ASC'}, ${story ? 'time_ms' : 'hits'} ASC, created_at ASC`;

export class D1Store implements Store {
  constructor(private db: D1Like) {}
  async insertRun(r: RunRow): Promise<void> {
    await this.db.prepare('INSERT INTO runs (run_id, board, device_id, issued_at, expires_at, used, build) VALUES (?,?,?,?,?,0,?)').bind(r.run_id, r.board, r.device_id, r.issued_at, r.expires_at, r.build).run();
  }
  getRun(id: string): Promise<RunRow | null> {
    return this.db.prepare('SELECT * FROM runs WHERE run_id = ?').bind(id).first<RunRow>();
  }
  async useRun(id: string): Promise<boolean> {
    const r = await this.db.prepare('UPDATE runs SET used = 1 WHERE run_id = ? AND used = 0').bind(id).run();
    return r.meta.changes === 1;
  }
  getScore(board: string, period: string, device: string): Promise<ScoreRow | null> {
    return this.db.prepare('SELECT * FROM scores WHERE board = ? AND period_key = ? AND device_id = ?').bind(board, period, device).first<ScoreRow>();
  }
  async putScore(s: ScoreRow): Promise<void> {
    await this.db
      .prepare('INSERT INTO scores (board, period_key, device_id, name, value, hits, time_ms, created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT (board, period_key, device_id) DO UPDATE SET name = excluded.name, value = excluded.value, hits = excluded.hits, time_ms = excluded.time_ms, created_at = excluded.created_at')
      .bind(s.board, s.period_key, s.device_id, s.name, s.value, s.hits, s.time_ms, s.created_at)
      .run();
  }
  async top(board: string, period: string, desc: boolean, limit: number, offset: number): Promise<{ rows: ScoreRow[]; total: number }> {
    const story = board === 'story_score';
    const rows = await this.db.prepare(`SELECT * FROM scores WHERE board = ? AND period_key = ? ORDER BY ${order(desc, story)} LIMIT ? OFFSET ?`).bind(board, period, limit, offset).all<ScoreRow>();
    const total = await this.db.prepare('SELECT COUNT(*) AS n FROM scores WHERE board = ? AND period_key = ?').bind(board, period).first<{ n: number }>();
    return { rows: rows.results, total: total?.n ?? 0 };
  }
  async rank(s: ScoreRow, desc: boolean, story: boolean): Promise<number> {
    const cmp = desc ? '>' : '<';
    const tie = story ? 'time_ms' : 'hits';
    const r = await this.db
      .prepare(`SELECT COUNT(*) AS n FROM scores WHERE board = ? AND period_key = ? AND (value ${cmp} ? OR (value = ? AND ${tie} < ?))`)
      .bind(s.board, s.period_key, s.value, s.value, story ? s.time_ms : s.hits)
      .first<{ n: number }>();
    return (r?.n ?? 0) + 1;
  }
  async around(board: string, period: string, desc: boolean, rank: number, span: number): Promise<ScoreRow[]> {
    const off = Math.max(0, rank - 1 - span);
    return (await this.top(board, period, desc, span * 2 + 1, off)).rows;
  }
}
