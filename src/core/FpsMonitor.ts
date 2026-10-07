/**
 * Rolling FPS watchdog. If the average stays below `threshold` for `windowMs`, `update` returns true once
 * (caller switches on reduced effects and shows a toast).
 */
export class FpsMonitor {
  private lowMs = 0;
  private fired = false;
  private avg = 60;

  constructor(
    private threshold = 45,
    private windowMs = 3000,
  ) {}

  get average(): number {
    return this.avg;
  }

  update(frameMs: number): boolean {
    if (this.fired || frameMs <= 0) return false;
    const fps = 1000 / Math.min(frameMs, 250);
    this.avg += (fps - this.avg) * 0.1;
    if (this.avg < this.threshold) this.lowMs += frameMs;
    else this.lowMs = 0;
    if (this.lowMs >= this.windowMs) {
      this.fired = true;
      return true;
    }
    return false;
  }
}
