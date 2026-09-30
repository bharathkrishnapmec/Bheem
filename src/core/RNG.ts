/** Seedable RNG (mulberry32). Deterministic for tests and `?seed=` debug runs. */
export class RNG {
  private s: number;
  constructor(seed = Date.now()) {
    this.s = seed >>> 0;
  }
  seed(seed: number): void {
    this.s = seed >>> 0;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  sign(): 1 | -1 {
    return this.next() < 0.5 ? -1 : 1;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)] as T;
  }
  weighted<K extends string>(weights: Partial<Record<K, number>>, exclude?: K | null): K | null {
    let total = 0;
    for (const k in weights) if (k !== exclude) total += weights[k] ?? 0;
    if (total <= 0) return null;
    let r = this.next() * total;
    for (const k in weights) {
      if (k === exclude) continue;
      r -= weights[k] ?? 0;
      if (r <= 0) return k;
    }
    return null;
  }
}

export const rng = new RNG();
