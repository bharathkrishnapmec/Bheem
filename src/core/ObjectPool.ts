/** Generic object pool. `create` builds a new instance, `reset` prepares a recycled one. */
export class ObjectPool<T> {
  private free: T[] = [];
  readonly active = new Set<T>();
  created = 0;

  constructor(
    private create: () => T,
    private onRelease?: (obj: T) => void,
    prewarm = 0,
  ) {
    for (let i = 0; i < prewarm; i++) {
      this.free.push(this.create());
      this.created++;
    }
  }

  get(): T {
    const obj = this.free.pop() ?? (this.created++, this.create());
    this.active.add(obj);
    return obj;
  }

  release(obj: T): void {
    if (!this.active.delete(obj)) return;
    this.onRelease?.(obj);
    this.free.push(obj);
  }

  releaseAll(): void {
    for (const o of [...this.active]) this.release(o);
  }

  get size(): number {
    return this.active.size;
  }

  get freeCount(): number {
    return this.free.length;
  }
}
