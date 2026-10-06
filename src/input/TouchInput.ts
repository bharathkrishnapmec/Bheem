/**
 * Device-agnostic touch model (pure logic, no DOM). The DOM overlay (`ui/touch/TouchControls`) feeds pointer
 * events in; `InputManager` reads it out and merges it into `InputState`. Each pointer id owns exactly one
 * control, so multi-touch (move + attack + jump) is independent.
 */
export type TouchControl =
  | 'stick'
  | 'attack'
  | 'jump'
  | 'dash'
  | 'summon'
  | 'interact'
  | 'pause'
  | 'toolbox'
  | 'reset'
  | 'bossSelect'
  | 'sword'
  | 'bow'
  | 'staff'
  | 'cycle';

export const TOUCH = {
  stickRadius: 56,
  stickDeadzone: 0.2,
  stickDownThreshold: 0.5,
  aimMaxDrag: 70,
  aimMinDrag: 12,
  clapMaxDistance: 480,
} as const;

interface Ptr {
  control: TouchControl;
  x0: number;
  y0: number;
  x: number;
  y: number;
}

export class TouchInput {
  /** True once any touch has been seen and no other device has been used since. */
  active = false;
  private ptrs = new Map<number, Ptr>();
  private pending = new Set<TouchControl>();

  down(id: number, control: TouchControl, x: number, y: number): void {
    this.active = true;
    this.ptrs.set(id, { control, x0: x, y0: y, x, y });
    this.pending.add(control);
  }

  move(id: number, x: number, y: number): void {
    const p = this.ptrs.get(id);
    if (!p) return;
    p.x = x;
    p.y = y;
  }

  up(id: number): void {
    this.ptrs.delete(id);
  }

  releaseAll(): void {
    this.ptrs.clear();
    this.pending.clear();
  }

  private find(c: TouchControl): Ptr | undefined {
    for (const p of this.ptrs.values()) if (p.control === c) return p;
    return undefined;
  }

  held(c: TouchControl): boolean {
    return !!this.find(c);
  }

  /** True if the control was pressed since the last call (catches taps shorter than a frame). */
  takePressed(c: TouchControl): boolean {
    const had = this.pending.has(c);
    this.pending.delete(c);
    return had;
  }

  /** Joystick as normalised vector (-1..1), dead-zoned. Knob offset is clamped to the radius. */
  stick(): { x: number; y: number; knobX: number; knobY: number; ox: number; oy: number } | null {
    const p = this.find('stick');
    if (!p) return null;
    let dx = p.x - p.x0;
    let dy = p.y - p.y0;
    const len = Math.hypot(dx, dy);
    const R = TOUCH.stickRadius;
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    const nx = dx / R;
    const ny = dy / R;
    const mag = Math.hypot(nx, ny);
    const live = mag >= TOUCH.stickDeadzone;
    return { x: live ? nx : 0, y: live ? ny : 0, knobX: dx, knobY: dy, ox: p.x0, oy: p.y0 };
  }

  /** Aim from dragging off the attack button. `angle` is null under the min drag (auto-aim). */
  aim(): { angle: number | null; frac: number; dx: number; dy: number } | null {
    const p = this.find('attack');
    if (!p) return null;
    const dx = p.x - p.x0;
    const dy = p.y - p.y0;
    const len = Math.hypot(dx, dy);
    if (len < TOUCH.aimMinDrag) return { angle: null, frac: 0, dx, dy };
    return { angle: Math.atan2(dy, dx), frac: Math.min(len, TOUCH.aimMaxDrag) / TOUCH.aimMaxDrag, dx, dy };
  }
}

export const touchInput = new TouchInput();

/** Thunderclap target distance from drag fraction (0..1 -> 0..480 px). */
export function clapDistanceFromDrag(frac: number): number {
  return Math.max(0, Math.min(1, frac)) * TOUCH.clapMaxDistance;
}
