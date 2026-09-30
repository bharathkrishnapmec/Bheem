export interface TimeRequest {
  scale: number;
  endAt: number;
  priority: number;
  tag?: string;
}

export interface TimeTargets {
  setScale(scale: number): void;
}

export type Clock = () => number;
export const realClock: Clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export const HIT_STOP_EPSILON = 0.001;

/**
 * The ONLY place that changes time scales. Requests are measured in real time, stack by priority,
 * and the highest-priority active request wins (ties: the lowest scale wins).
 */
export class TimeControllerCore {
  private requests: TimeRequest[] = [];
  private targets: TimeTargets | null = null;
  private applied = 1;
  reducedEffects = false;
  baseScale = 1;

  constructor(private clock: Clock = realClock) {}

  bind(targets: TimeTargets | null): void {
    this.targets = targets;
    this.applied = -1;
    this.update();
  }

  hitStop(ms: number, priority = 10): void {
    if (ms <= 0) return;
    this.push(HIT_STOP_EPSILON, ms, priority, 'hitstop');
  }

  slowMo(scale: number, ms: number, priority = 20, force = false): void {
    if (this.reducedEffects && !force && priority < 100) return;
    this.push(scale, ms, priority, 'slowmo');
  }

  /** Base scale used by scripted sequences (e.g. cinematic "time returns to 0.6"). */
  setBaseScale(scale: number): void {
    this.baseScale = scale;
    this.update();
  }

  clear(): void {
    this.requests.length = 0;
    this.baseScale = 1;
    this.update();
  }

  private push(scale: number, ms: number, priority: number, tag: string): void {
    this.requests.push({ scale, endAt: this.clock() + ms, priority, tag });
    this.update();
  }

  get scale(): number {
    return this.applied < 0 ? this.compute() : this.applied;
  }

  get activeCount(): number {
    return this.requests.length;
  }

  compute(): number {
    const now = this.clock();
    let best: TimeRequest | null = null;
    for (let i = this.requests.length - 1; i >= 0; i--) {
      const r = this.requests[i]!;
      if (r.endAt <= now) {
        this.requests.splice(i, 1);
        continue;
      }
      if (!best || r.priority > best.priority || (r.priority === best.priority && r.scale < best.scale)) best = r;
    }
    return best ? best.scale : this.baseScale;
  }

  update(): number {
    const s = this.compute();
    if (s !== this.applied) {
      this.applied = s;
      this.targets?.setScale(s);
    }
    return s;
  }
}

export const TimeController = new TimeControllerCore();
