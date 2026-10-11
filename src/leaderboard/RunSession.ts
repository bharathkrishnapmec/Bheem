import type { BoardId } from '@/shared/types';
import { balance } from '@/config/balance';

export type TaintReason = 'creative' | 'modifiers' | 'debug_key' | 'url_flag' | 'hidden' | 'balance_override';

export interface TaintInputs {
  mode: string;
  modifiers: Record<string, unknown>;
  search: string;
  debugKeyUsed: boolean;
  longestHiddenMs: number;
  balanceOverride: boolean;
  trial: boolean;
}

/** v2 §A5.3: any reason here makes a run practice-only (local best marked "(practice)"). */
export function taintReasons(t: TaintInputs): TaintReason[] {
  const r: TaintReason[] = [];
  if (t.mode === 'creative') r.push('creative');
  if (Object.values(t.modifiers).some((v) => v === true)) r.push('modifiers');
  if (t.debugKeyUsed) r.push('debug_key');
  const q = new URLSearchParams(t.search);
  if (q.has('debug') || q.has('seed')) r.push('url_flag');
  if (t.trial && t.longestHiddenMs > balance.trials.hiddenTaintMs) r.push('hidden');
  if (t.balanceOverride) r.push('balance_override');
  return r;
}

/** One ranked attempt: collects tamper flags and pause-excluded time. Taint is sticky. */
export class RunSession {
  private flags = new Set<TaintReason>();
  private hiddenSince: number | null = null;
  private longestHidden = 0;
  private pausedMs = 0;
  private pauseAt: number | null = null;
  debugKeyUsed = false;
  constructor(
    readonly board: BoardId,
    readonly startedAt: number,
  ) {}
  setHidden(hidden: boolean, now: number): void {
    if (hidden && this.hiddenSince === null) this.hiddenSince = now;
    if (!hidden && this.hiddenSince !== null) {
      this.longestHidden = Math.max(this.longestHidden, now - this.hiddenSince);
      this.hiddenSince = null;
    }
  }
  setPaused(paused: boolean, now: number): void {
    if (paused && this.pauseAt === null) this.pauseAt = now;
    if (!paused && this.pauseAt !== null) {
      this.pausedMs += now - this.pauseAt;
      this.pauseAt = null;
    }
  }
  elapsed(now: number): number {
    return now - this.startedAt - this.pausedMs - (this.pauseAt !== null ? now - this.pauseAt : 0);
  }
  check(t: Omit<TaintInputs, 'debugKeyUsed' | 'longestHiddenMs' | 'trial'>, now: number): TaintReason[] {
    const hiddenNow = this.hiddenSince !== null ? now - this.hiddenSince : 0;
    taintReasons({ ...t, debugKeyUsed: this.debugKeyUsed, longestHiddenMs: Math.max(this.longestHidden, hiddenNow), trial: this.board !== 'story_score' }).forEach((f) => this.flags.add(f));
    return [...this.flags];
  }
  get tainted(): boolean {
    return this.flags.size > 0;
  }
}
