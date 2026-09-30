import type { LevelData, Rect } from './levelSchema';

export interface Surface {
  x0: number;
  x1: number;
  y: number;
  src: Rect;
}

export interface ReachabilityResult {
  surfaces: Surface[];
  unreachable: Surface[];
}

/**
 * Debug check (§15): warns on platforms the hero can't reach with the base jump.
 * Surfaces are the tops of solids and one-ways. A surface is reachable from another if the rise is
 * within `maxRise` and the horizontal gap within `maxGap` (drops are always allowed within gap limits).
 */
export function checkReachability(level: LevelData, maxRise = 100, maxGap = 96): ReachabilityResult {
  const surfaces: Surface[] = [];
  for (const r of [...level.solids, ...level.oneWays]) {
    if (r.w < 8) continue;
    surfaces.push({ x0: r.x, x1: r.x + r.w, y: r.y, src: r });
  }
  const start = surfaces.findIndex(
    (s) => level.playerStart.x >= s.x0 && level.playerStart.x <= s.x1 && Math.abs(s.y - level.playerStart.y) < 40,
  );
  const reached = new Set<number>();
  const queue: number[] = [];
  if (start >= 0) {
    reached.add(start);
    queue.push(start);
  }
  while (queue.length) {
    const a = surfaces[queue.shift()!]!;
    surfaces.forEach((b, j) => {
      if (reached.has(j)) return;
      const gap = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1));
      const rise = a.y - b.y;
      const overlapping = gap === 0;
      const ok = rise <= maxRise && (gap <= maxGap || (rise < 0 && gap <= maxGap * 1.8)) && (overlapping || gap <= maxGap * 1.8);
      if (ok) {
        reached.add(j);
        queue.push(j);
      }
    });
  }
  // Ignore wall-like solids that aren't really walkable (tall thin boundaries).
  const unreachable = surfaces.filter((s, i) => !reached.has(i) && s.x1 - s.x0 >= 24 && s.y > 0);
  return { surfaces, unreachable };
}
