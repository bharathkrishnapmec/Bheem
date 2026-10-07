/** Dev-only per-attempt boss telemetry (Boss Buff v3 §B9.2). Nothing leaves the device. */
export interface FightLog {
  bossId: string;
  phaseMs: number[];
  guardBreaks: number;
  hitsByAttack: Record<string, { hits: number; damage: number }>;
  deaths: number;
  supplyUsed: number;
  totalMs: number;
  result: 'kill' | 'death' | 'abandon' | 'running';
}

const store: FightLog[] = [];

export class FightTelemetry {
  static readonly enabled: boolean = !!import.meta.env?.DEV;
  readonly log: FightLog;

  constructor(bossId: string) {
    this.log = { bossId, phaseMs: [], guardBreaks: 0, hitsByAttack: {}, deaths: 0, supplyUsed: 0, totalMs: 0, result: 'running' };
  }
  phase(_phase: number, ms: number): void {
    this.log.phaseMs.push(Math.round(ms));
  }
  guardBreak(): void {
    this.log.guardBreaks++;
  }
  heroHit(attack: string, damage: number): void {
    const h = (this.log.hitsByAttack[attack] ??= { hits: 0, damage: 0 });
    h.hits++;
    h.damage += damage;
  }
  death(): void {
    this.log.deaths++;
  }
  supply(): void {
    this.log.supplyUsed++;
  }
  finish(result: FightLog['result'], lastPhaseMs: number, totalMs: number): void {
    if (this.log.result !== 'running') return;
    this.log.phaseMs.push(Math.round(lastPhaseMs));
    this.log.totalMs = Math.round(totalMs);
    this.log.result = result;
    if (!FightTelemetry.enabled) return;
    store.push(this.log);
    console.info('[boss-telemetry]', JSON.stringify(this.log));
  }
  static all(): readonly FightLog[] {
    return store;
  }
  /** Saves every logged attempt this session as a JSON file. */
  static download(): void {
    if (typeof document === 'undefined') return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `bheem-boss-telemetry-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
