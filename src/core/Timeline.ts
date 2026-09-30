import { realClock, type Clock } from './TimeController';

export interface TimelineBeat {
  at: number;
  run: () => void;
}

/** Deterministic scripted timeline driven by the real-time clock (for cinematics). */
export class Timeline {
  private start = 0;
  private idx = 0;
  private beats: TimelineBeat[];
  running = false;

  constructor(
    beats: TimelineBeat[],
    private clock: Clock = realClock,
  ) {
    this.beats = [...beats].sort((a, b) => a.at - b.at);
  }

  play(): void {
    this.start = this.clock();
    this.idx = 0;
    this.running = true;
    this.tick();
  }

  get elapsed(): number {
    return this.clock() - this.start;
  }

  tick(): void {
    if (!this.running) return;
    const t = this.elapsed;
    while (this.idx < this.beats.length && this.beats[this.idx]!.at <= t) {
      this.beats[this.idx++]!.run();
    }
    if (this.idx >= this.beats.length) this.running = false;
  }

  /** Runs all remaining beats immediately (skip). */
  finish(): void {
    while (this.idx < this.beats.length) this.beats[this.idx++]!.run();
    this.running = false;
  }

  stop(): void {
    this.running = false;
  }
}
