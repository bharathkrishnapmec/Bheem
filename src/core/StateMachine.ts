export interface StateDef<C, S extends string> {
  enter?: (ctx: C, prev: S | null) => void;
  update?: (ctx: C, dt: number) => void;
  exit?: (ctx: C, next: S) => void;
}

/** Generic finite state machine. `timeInState` accumulates scaled time for timers. */
export class StateMachine<C, S extends string> {
  current: S;
  previous: S | null = null;
  timeInState = 0;
  private locked = false;

  constructor(
    private ctx: C,
    private states: Record<S, StateDef<C, S>>,
    initial: S,
  ) {
    this.current = initial;
    this.states[initial].enter?.(ctx, null);
  }

  is(...s: S[]): boolean {
    return s.includes(this.current);
  }

  set(next: S, force = false): void {
    if (this.locked) return;
    if (next === this.current && !force) return;
    this.locked = true;
    const prev = this.current;
    this.states[prev].exit?.(this.ctx, next);
    this.previous = prev;
    this.current = next;
    this.timeInState = 0;
    this.locked = false;
    this.states[next].enter?.(this.ctx, prev);
  }

  update(dt: number): void {
    this.timeInState += dt;
    this.states[this.current].update?.(this.ctx, dt);
  }
}
