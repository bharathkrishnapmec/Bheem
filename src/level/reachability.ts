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
 * Debug check (§15, v2 §A6.4): warns on platforms the hero can't reach.
 * Surfaces are the tops of solids, one-ways, crumbling and moving platforms (moving ones use their
 * full sweep). A surface is reachable from another if the rise is within `maxRise` and the gap within
 * `maxGap`; updraft columns lift the hero from their base to `updraftRise` above their top; lava
 * launches always land on a safe anchor, so anchors count as reachable when the level has lava.
 */
export function checkReachability(level: LevelData, maxRise = 100, maxGap = 96, updraftRise = 180): ReachabilityResult {
  const surfaces: Surface[] = [];
  const add = (r: Rect, dx0 = 0, dx1 = 0) => {
    if (r.w >= 8) surfaces.push({ x0: r.x + dx0, x1: r.x + r.w + dx1, y: r.y, src: r });
  };
  for (const r of [...level.solids, ...level.oneWays]) add(r);
  for (const c of level.crumblingPlatforms ?? []) add(c.rect);
  for (const m of level.movingPlatforms ?? []) {
    if (m.path === 'sine-x') add(m.rect, -m.amplitude, m.amplitude);
    else surfaces.push({ x0: m.rect.x, x1: m.rect.x + m.rect.w, y: m.rect.y - m.amplitude, src: m.rect });
  }
  const start = level.heroSpawn ?? level.playerStart;
  const reached = new Set<number>();
  const queue: number[] = [];
  const seed = (pred: (s: Surface) => boolean) =>
    surfaces.forEach((s, i) => {
      if (!reached.has(i) && pred(s)) {
        reached.add(i);
        queue.push(i);
      }
    });
  seed((s) => start.x >= s.x0 && start.x <= s.x1 && Math.abs(s.y - start.y) < 40);
  if (level.lavaZones?.length) for (const a of level.safeAnchors ?? []) seed((s) => a.x >= s.x0 && a.x <= s.x1 && Math.abs(s.y - a.y) < 14);
  const vents = level.updrafts ?? [];
  while (queue.length) {
    const a = surfaces[queue.shift()!]!;
    surfaces.forEach((b, j) => {
      if (reached.has(j)) return;
      const gap = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1));
      const rise = a.y - b.y;
      let ok = rise <= maxRise && (gap <= maxGap || (rise < 0 && gap <= maxGap * 1.8));
      if (!ok)
        for (const v of vents) {
          const r = v.rect;
          const baseNear = a.x1 >= r.x - maxGap && a.x0 <= r.x + r.w + maxGap && a.y >= r.y && a.y <= r.y + r.h + maxRise;
          const topNear = b.x1 >= r.x - maxGap && b.x0 <= r.x + r.w + maxGap && b.y >= r.y - updraftRise && b.y <= r.y + r.h;
          if (baseNear && topNear) ok = true;
        }
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
