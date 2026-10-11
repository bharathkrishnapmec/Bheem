import type { EnemyType } from '@/core/types';

export type TrialBossId = 'kaalasura' | 'garjana' | 'nishachara' | 'brute';
export type BoardId = 'story_score' | `trial_${TrialBossId}`;
export type Period = 'all' | 'week';

export interface StoryStats {
  kills: Partial<Record<EnemyType | 'boss', number>>;
  rescued: number;
  districtsLiberated: number;
  chests: number;
  noDamageDistricts: number;
  deaths: number;
  guardBreaks?: number;
  warbanners?: number;
}

export interface RunResult {
  mode: 'story' | 'trial';
  /** Story: total run time; trial: fight time excluding pauses. */
  timeMs: number;
  hitsTaken: number;
  score?: number;
  stats?: StoryStats;
  inputLogHash?: string;
}

export interface Entry {
  rank: number;
  name: string;
  value: number;
  hits?: number;
  at: number;
}
export interface BoardPage {
  entries: Entry[];
  total: number;
}
export interface MyRank {
  rank: number;
  entry: Entry;
  neighbours: Entry[];
}
export interface RunTicket {
  runId: string;
  board: BoardId;
  token: string;
  issuedAt: number;
  expiresAt: number;
}
export type SubmitStatus = 'accepted' | 'not_best' | 'rejected' | 'queued';
export interface SubmitOutcome {
  status: SubmitStatus;
  rank?: number;
  best?: number;
  reason?: string;
}
