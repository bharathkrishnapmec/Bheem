import type { BoardId } from '@/shared/types';

/** Registry id -> trial board (the Brute Champion's registry id is `brute_mini`, its board `trial_brute`). */
export const trialBoard = (bossId?: string): BoardId => `trial_${bossId === 'brute_mini' ? 'brute' : (bossId ?? 'kaalasura')}` as BoardId;

export const fmtMs = (ms: number | null): string => {
  if (ms === null) return '--';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${String(Math.round(ms % 1000)).padStart(3, '0')}`;
};
