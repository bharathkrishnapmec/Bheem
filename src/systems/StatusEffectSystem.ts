import { balance } from '@/config/balance';
import type { StatusApplication, StatusId } from '@/core/types';

export interface ActiveStatus {
  id: StatusId;
  remainingMs: number;
  totalMs: number;
  sourceId: number | undefined;
}

/** Anything that can carry statuses. Implemented by Actor; also by plain objects in unit tests. */
export interface StatusTarget {
  statuses: Map<StatusId, ActiveStatus>;
  stunImmune?: boolean;
  statusImmune?: StatusId[];
  small?: boolean;
  onStatusApplied?(id: StatusId, s: ActiveStatus): void;
  onStatusExpired?(id: StatusId, cleansed: boolean): void;
}

export interface StatusModifiers {
  speedMul?: number;
  dashCooldownMul?: number;
  disablesActions?: boolean;
}

export interface StatusDef {
  id: StatusId;
  stacking: 'refresh' | 'none';
  modifiers: StatusModifiers;
  /** Returns the adjusted duration (ms) or null to reject the application. */
  canApply?(target: StatusTarget, app: StatusApplication): number | null;
  onApply?(target: StatusTarget, s: ActiveStatus): void;
  onTick?(target: StatusTarget, s: ActiveStatus, dt: number): void;
  onExpire?(target: StatusTarget, s: ActiveStatus): void;
}

export const STATUS_DEFS: Record<StatusId, StatusDef> = {
  slow: {
    id: 'slow',
    stacking: 'refresh',
    modifiers: { speedMul: balance.status.slow.speedMul, dashCooldownMul: balance.status.slow.dashCooldownMul },
  },
  shocked: {
    id: 'shocked',
    stacking: 'none',
    modifiers: { disablesActions: true },
    canApply(t, app) {
      if (t.statusImmune?.includes('shocked')) return null;
      if (t.stunImmune) {
        // Elites/Brute: immune to stun, but a Bolt still staggers briefly (§9.4).
        return app.durationMs <= balance.status.shocked.boltMs ? balance.status.shocked.eliteBoltStaggerMs : null;
      }
      return app.durationMs;
    },
  },
  knockdown: {
    id: 'knockdown',
    stacking: 'none',
    modifiers: { disablesActions: true },
    canApply(t, app) {
      if (!t.small || t.stunImmune || t.statusImmune?.includes('knockdown')) return null;
      return app.durationMs;
    },
  },
  marked: { id: 'marked', stacking: 'refresh', modifiers: {} },
  /** Lava burn: damage is applied by HazardSystem while present; refresh, never stacks (v2 §A6.6). */
  scorch: { id: 'scorch', stacking: 'refresh', modifiers: {} },
};

/** Data-driven status handling (§9.4). No status is special-cased inside entity classes. */
export const StatusEffectSystem = {
  apply(target: StatusTarget, app: StatusApplication): boolean {
    const def = STATUS_DEFS[app.id];
    if (target.statusImmune?.includes(app.id)) return false;
    const duration = def.canApply ? def.canApply(target, app) : app.durationMs;
    if (duration === null || duration <= 0) return false;
    const existing = target.statuses.get(app.id);
    if (existing) {
      if (def.stacking === 'none') return false;
      existing.remainingMs = duration;
      existing.totalMs = duration;
      existing.sourceId = app.sourceId;
      return true;
    }
    const s: ActiveStatus = { id: app.id, remainingMs: duration, totalMs: duration, sourceId: app.sourceId };
    target.statuses.set(app.id, s);
    def.onApply?.(target, s);
    target.onStatusApplied?.(app.id, s);
    return true;
  },

  tick(target: StatusTarget, dt: number): void {
    if (target.statuses.size === 0) return;
    for (const s of target.statuses.values()) {
      const def = STATUS_DEFS[s.id];
      def.onTick?.(target, s, dt);
      s.remainingMs -= dt;
      if (s.remainingMs <= 0) this.remove(target, s.id, false);
    }
  },

  remove(target: StatusTarget, id: StatusId, cleansed: boolean): void {
    const s = target.statuses.get(id);
    if (!s) return;
    target.statuses.delete(id);
    STATUS_DEFS[id].onExpire?.(target, s);
    target.onStatusExpired?.(id, cleansed);
  },

  /** Removes statuses caused by a given source (e.g. a Hexer's Slow when it dies). Returns true if any removed. */
  removeBySource(target: StatusTarget, sourceId: number, id?: StatusId): boolean {
    let removed = false;
    for (const s of [...target.statuses.values()]) {
      if (s.sourceId === sourceId && (!id || s.id === id)) {
        this.remove(target, s.id, true);
        removed = true;
      }
    }
    return removed;
  },

  clear(target: StatusTarget): void {
    for (const id of [...target.statuses.keys()]) this.remove(target, id, false);
  },

  has(target: StatusTarget, id: StatusId): boolean {
    return target.statuses.has(id);
  },

  speedMultiplier(target: StatusTarget): number {
    let m = 1;
    for (const s of target.statuses.values()) m *= STATUS_DEFS[s.id].modifiers.speedMul ?? 1;
    return m;
  },

  dashCooldownMultiplier(target: StatusTarget): number {
    let m = 1;
    for (const s of target.statuses.values()) m *= STATUS_DEFS[s.id].modifiers.dashCooldownMul ?? 1;
    return m;
  },

  canAct(target: StatusTarget): boolean {
    for (const s of target.statuses.values()) if (STATUS_DEFS[s.id].modifiers.disablesActions) return false;
    return true;
  },

  list(target: StatusTarget): StatusId[] {
    return [...target.statuses.keys()].sort();
  },
};
