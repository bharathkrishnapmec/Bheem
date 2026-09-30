/** Simple countdown timer in ms, driven by scaled delta. */
export class Cooldown {
  remaining = 0;
  total = 0;
  start(ms: number): void {
    this.remaining = ms;
    this.total = ms;
  }
  tick(dt: number): void {
    if (this.remaining > 0) this.remaining = Math.max(0, this.remaining - dt);
  }
  get ready(): boolean {
    return this.remaining <= 0;
  }
  reset(): void {
    this.remaining = 0;
  }
}
