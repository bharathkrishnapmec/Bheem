import type { Rect, Vec2 } from '@/level/levelSchema';

/** Pure hazard timing / placement rules (Addendum v2 §A6). No Phaser imports so they are unit-testable. */

export type GeyserPhase = 'idle' | 'telegraph' | 'erupt';

export interface GeyserTiming {
  idleMs: number;
  teleMs: number;
  eruptMs: number;
}

/** Phase of a geyser at time `t` given its period and offset. Period = idle + telegraph + eruption. */
export function geyserPhase(t: number, periodMs: number, offsetMs: number, g: GeyserTiming): { phase: GeyserPhase; into: number } {
  const period = Math.max(periodMs, g.teleMs + g.eruptMs + 1);
  const idle = period - g.teleMs - g.eruptMs;
  const local = (((t + offsetMs) % period) + period) % period;
  if (local < idle) return { phase: 'idle', into: local };
  if (local < idle + g.teleMs) return { phase: 'telegraph', into: local - idle };
  return { phase: 'erupt', into: local - idle - g.teleMs };
}

export type CrumbleState = 'solid' | 'shaking' | 'gone' | 'rising';

export interface CrumbleData {
  state: CrumbleState;
  t: number;
}

export interface CrumbleTiming {
  standMs: number;
  shakeMs: number;
  respawnMs: number;
  riseMs: number;
}

/** Advances a crumbling platform. Only hero standing time counts (enemies/allies never trigger it). */
export function stepCrumble(c: CrumbleData, dt: number, heroOn: boolean, k: CrumbleTiming): CrumbleData {
  const { state } = c;
  let { t } = c;
  switch (state) {
    case 'solid':
      t = heroOn ? t + dt : 0;
      if (t >= k.standMs) return { state: 'shaking', t: 0 };
      return { state, t };
    case 'shaking':
      t += dt;
      return t >= k.shakeMs ? { state: 'gone', t: 0 } : { state, t };
    case 'gone':
      t += dt;
      return t >= k.respawnMs ? { state: 'rising', t: 0 } : { state, t };
    case 'rising':
      t += dt;
      return t >= k.riseMs ? { state: 'solid', t: 0 } : { state, t };
  }
}

export const crumbleSolid = (s: CrumbleState): boolean => s === 'solid' || s === 'shaking';

/** Offset from the rest position of a moving platform at time t. */
export function movingOffset(path: 'sine-x' | 'sine-y', amplitude: number, periodMs: number, t: number, phaseMs = 0): Vec2 {
  const v = Math.sin(((t + phaseMs) / periodMs) * Math.PI * 2) * amplitude;
  return path === 'sine-x' ? { x: v, y: 0 } : { x: 0, y: v };
}

export function nearestPoint(points: readonly Vec2[], x: number, y: number): Vec2 | null {
  let best: Vec2 | null = null;
  let bd = Infinity;
  for (const p of points) {
    const d = Math.hypot(p.x - x, (p.y - y) * 0.6);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/**
 * Lava launch: horizontal velocity that lands the hero on `target` given launch vy and gravity.
 * Solves for the descending-time root of y(t) = y0 + vy t + g t²/2 = target.y; falls back to the apex time.
 */
export function launchVelocityX(from: Vec2, target: Vec2, vy: number, gravity: number, maxVx = 520): number {
  const dy = target.y - from.y;
  const disc = vy * vy + 2 * gravity * dy;
  const t = disc >= 0 ? (-vy + Math.sqrt(disc)) / gravity : -vy / gravity;
  const vx = (target.x - from.x) / Math.max(0.2, t);
  return Math.max(-maxVx, Math.min(maxVx, vx));
}

export function inAnyRect(rects: readonly Rect[] | undefined, x: number, y: number): Rect | null {
  if (!rects) return null;
  for (const r of rects) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
  return null;
}

/** Wind gust push, capped below hero run speed so holding against it always wins. */
export function gustPush(push: number, runSpeed: number): number {
  return Math.min(Math.abs(push), runSpeed * 0.5) * Math.sign(push || 1);
}

/** What happens to a non-boss enemy that falls into lava / void. Bosses are immune (handled by caller). */
export function envOutcome(elite: boolean): 'kill' | 'damageAndRelaunch' {
  return elite ? 'damageAndRelaunch' : 'kill';
}
