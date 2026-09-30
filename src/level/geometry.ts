import type { Rect } from './levelSchema';

export interface RayHit {
  x: number;
  y: number;
  t: number;
}

/** Segment vs axis-aligned rect (slab method). Returns entry parameter t in [0,1] or null. */
export function segmentRect(x1: number, y1: number, x2: number, y2: number, r: Rect): number | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tmin = 0;
  let tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (x1 < r.x || x1 > r.x + r.w) return null;
  } else {
    let t1 = (r.x - x1) / dx;
    let t2 = (r.x + r.w - x1) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (Math.abs(dy) < 1e-9) {
    if (y1 < r.y || y1 > r.y + r.h) return null;
  } else {
    let t1 = (r.y - y1) / dy;
    let t2 = (r.y + r.h - y1) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

export function pointInRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Pure static-geometry queries used by AI (ledges, LOS), raycasts and spawns. */
export class LevelGeometry {
  /** Dynamic blockers (closed gates) that participate in solid queries. */
  dynamic = new Map<string, Rect>();

  constructor(
    public solids: Rect[],
    public oneWays: Rect[],
  ) {}

  *allSolids(): Iterable<Rect> {
    yield* this.solids;
    yield* this.dynamic.values();
  }

  solidAt(x: number, y: number): boolean {
    for (const r of this.allSolids()) if (pointInRect(x, y, r)) return true;
    return false;
  }

  /** Top y of the first surface at or below (x, y). */
  groundBelow(x: number, y: number, includeOneWay = true, maxDrop = 4000): number | null {
    let best: number | null = null;
    const consider = (r: Rect) => {
      if (x < r.x || x > r.x + r.w) return;
      if (r.y + 0.5 < y) {
        if (y <= r.y + r.h && r.h > 30) best = best === null ? y : Math.min(best, y);
        return;
      }
      if (r.y - y > maxDrop) return;
      if (best === null || r.y < best) best = r.y;
    };
    for (const r of this.allSolids()) consider(r);
    if (includeOneWay) for (const r of this.oneWays) consider(r);
    return best;
  }

  /** Is there walkable ground within `drop` px below (x, feetY)? */
  hasGround(x: number, feetY: number, drop = 40): boolean {
    const g = this.groundBelow(x, feetY - 2, true, drop + 2);
    return g !== null && g - feetY <= drop;
  }

  raycast(x1: number, y1: number, x2: number, y2: number): RayHit | null {
    let best: number | null = null;
    for (const r of this.allSolids()) {
      const t = segmentRect(x1, y1, x2, y2, r);
      if (t !== null && (best === null || t < best)) best = t;
    }
    if (best === null) return null;
    return { x: x1 + (x2 - x1) * best, y: y1 + (y2 - y1) * best, t: best };
  }

  lineOfSight(x1: number, y1: number, x2: number, y2: number): boolean {
    return this.raycast(x1, y1, x2, y2) === null;
  }
}
