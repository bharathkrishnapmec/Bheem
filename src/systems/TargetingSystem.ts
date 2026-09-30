export interface TargetCandidate {
  x: number;
  y: number;
  targetWeight: number;
  isAlive(): boolean;
  targetable?: boolean;
}

/** §10.6: pick the candidate with the lowest distance / weight. */
export function pickTarget<T extends TargetCandidate>(
  fromX: number,
  fromY: number,
  candidates: Iterable<T>,
  maxRange = Infinity,
): T | null {
  let best: T | null = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    if (!c.isAlive() || c.targetable === false) continue;
    const d = Math.hypot(c.x - fromX, c.y - fromY);
    if (d > maxRange) continue;
    const score = d / Math.max(0.01, c.targetWeight);
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** Nearest living candidate (used by allies and aim assist). */
export function nearest<T extends TargetCandidate>(
  fromX: number,
  fromY: number,
  candidates: Iterable<T>,
  maxRange = Infinity,
  filter?: (c: T) => boolean,
): T | null {
  let best: T | null = null;
  let bestD = maxRange;
  for (const c of candidates) {
    if (!c.isAlive() || c.targetable === false) continue;
    if (filter && !filter(c)) continue;
    const d = Math.hypot(c.x - fromX, c.y - fromY);
    if (d <= bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}
