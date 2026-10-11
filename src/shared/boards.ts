import { balance } from '@/config/balance';
import { storyScore } from './scoring';
import type { BoardId, RunResult, TrialBossId } from './types';

export const TRIAL_BOSSES = Object.keys(balance.trials.minFightMs) as TrialBossId[];

export interface BoardDef {
  id: BoardId;
  mode: 'story' | 'trial';
  sort: 'asc' | 'desc';
  boss?: TrialBossId;
}

/** Single source of truth for client and server (v2 §A2.2): one trial board per trial-eligible boss. */
export const BOARDS: readonly BoardDef[] = [
  { id: 'story_score', mode: 'story', sort: 'desc' },
  ...TRIAL_BOSSES.map((b): BoardDef => ({ id: `trial_${b}`, mode: 'trial', sort: 'asc', boss: b })),
];

export const boardDef = (id: string): BoardDef | undefined => BOARDS.find((b) => b.id === id);

/** Negative if `a` ranks above `b`. Ties break on time (story) or fewer hits (trials). */
export function compareEntries(board: BoardDef, a: { value: number; hits: number; timeMs: number }, b: { value: number; hits: number; timeMs: number }): number {
  const d = board.sort === 'desc' ? b.value - a.value : a.value - b.value;
  if (d) return d;
  return board.mode === 'story' ? a.timeMs - b.timeMs : a.hits - b.hits;
}

/** ISO week key, e.g. "2026-W41" (resets Monday 00:00 UTC). */
export function weekKey(ms: number): string {
  const d = new Date(ms);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = Date.UTC(t.getUTCFullYear(), 0, 1);
  const wk = Math.ceil(((t.getTime() - y0) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}

const int = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** Plausibility check (v2 §A5.2 with v3 §B8 limits). Returns a reason, or null when acceptable. */
export function checkRun(board: BoardDef, r: RunResult, maxScore: number): string | null {
  if (r.mode !== board.mode) return 'mode';
  if (!int(r.timeMs) || !int(r.hitsTaken)) return 'fields';
  if (board.mode === 'trial') {
    if (r.timeMs < balance.trials.minFightMs[board.boss!]) return 'too_fast';
    return null;
  }
  const st = r.stats;
  if (!st || !int(r.score)) return 'fields';
  if (r.timeMs < balance.trials.storyMinMs) return 'too_fast';
  const counts = [st.rescued, st.districtsLiberated, st.chests, st.noDamageDistricts, st.deaths, st.guardBreaks ?? 0, st.warbanners ?? 0, ...Object.values(st.kills)];
  if (!counts.every(int)) return 'stats';
  if (st.noDamageDistricts > st.districtsLiberated || (st.kills.boss ?? 0) < 1) return 'stats';
  const recomputed = storyScore(st);
  if (recomputed !== r.score) return 'score_mismatch';
  if (recomputed > maxScore) return 'score_cap';
  return null;
}

/** Board value for a run: story score (desc) or adjusted trial time (asc). */
export function runValue(board: BoardDef, r: RunResult): number {
  return board.mode === 'story' ? (r.score ?? 0) : r.timeMs + r.hitsTaken * balance.trials.hitPenaltyMs;
}
