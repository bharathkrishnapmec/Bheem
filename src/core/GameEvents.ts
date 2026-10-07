import type { ActionId, DistrictId, EnemyType, KillType, StatusId, WeaponId } from './types';

export interface GameEventMap {
  'player:hp': { hp: number; max: number; delta: number };
  'player:prana': { prana: number; max: number; denied?: boolean };
  'prana:denied': Record<string, never>;
  'player:ammo': { ammo: number; max: number };
  'player:weapon': { weapon: WeaponId };
  'player:status': { effects: StatusId[] };
  'player:dash': { cooldownMs: number };
  'player:died': Record<string, never>;
  'player:hazard': Record<string, never>;
  'player:hurt': { amount: number };
  'rally:changed': { value: number; max: number; ready: boolean };
  'summon:started': { durationMs: number; squadSize: number };
  'summon:ended': Record<string, never>;
  'summon:cooldown': { remainingMs: number; totalMs: number };
  'summon:denied': { reason: 'active' | 'cooldown' | 'rally' };
  'coins:changed': { coins: number; delta: number };
  'rescue:changed': { rescued: number; total: number };
  'district:changed': { id: DistrictId; name: string };
  'objective:changed': { text: string; progress?: number; target?: number };
  'objective:target': { x: number; y: number } | { x: null; y: null };
  'banner:damaged': { id: string; hp: number; max: number; x: number; y: number };
  'banner:vulnerable': { id: string };
  'district:liberated': { id: DistrictId };
  'enemy:killed': { type: EnemyType; killType: KillType; elite: boolean; x: number; y: number };
  'encounter:cleared': Record<string, never>;
  'combo:multi': { count: number };
  'boss:spawned': { name: string; title?: string; max: number };
  'boss:hp': { hp: number; max: number; phase: 1 | 2 | 3 };
  'boss:phase': { phase: 1 | 2 | 3 };
  'boss:died': Record<string, never>;
  'prompt:show': { key: ActionId; label: string; progress?: number };
  'prompt:hide': Record<string, never>;
  'checkpoint:reached': { id: string };
  'damage:number': { x: number; y: number; amount: number; kind: 'normal' | 'heavy' | 'heal' | 'hero' };
  'game:paused': { paused: boolean };
  'victory:title': Record<string, never>;
  'intro:card': { title: string; subtitle: string; durationMs: number };
  'toast': { text: string; color?: 'gold' | 'red' | 'cyan' | 'violet' };
  'fx:screenFlash': { color: number; alpha: number; ms: number };
  'fx:vignette': { amount: number; ms: number };
  'fx:desaturate': { amount: number; ms: number };
  'soul:wisp': { x: number; y: number };
  'upgrade:purchased': { id: string; tier: number };
  'shrine:open': { id: string };
  'shrine:close': Record<string, never>;
  'settings:changed': Record<string, never>;
  'ui:intent': UIIntent;
  'score:changed': { score: number; delta: number; x?: number; y?: number; label?: string };
  'hit:landed': { x: number; y: number; dmg: number };
  'chest:opened': { x: number; y: number };
  'app:background': { reason: 'hidden' | 'blur' | 'portrait' };
}

export type UIIntent =
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'retry' }
  | { type: 'restart' }
  | { type: 'mainMenu' }
  | { type: 'purchase'; upgrade: string }
  | { type: 'closeShrine' }
  | { type: 'toggleMute' };

export type GameEventName = keyof GameEventMap;
type Handler<K extends GameEventName> = (payload: GameEventMap[K]) => void;

/** Typed event bus. Framework-free so it can be unit tested and shared between scenes. */
export class EventBus {
  private handlers = new Map<GameEventName, Set<(p: unknown) => void>>();

  on<K extends GameEventName>(name: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(fn as (p: unknown) => void);
    return () => this.off(name, fn);
  }

  once<K extends GameEventName>(name: K, fn: Handler<K>): () => void {
    const off = this.on(name, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  off<K extends GameEventName>(name: K, fn: Handler<K>): void {
    this.handlers.get(name)?.delete(fn as (p: unknown) => void);
  }

  emit<K extends GameEventName>(name: K, payload: GameEventMap[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[GameEvents] handler for "${name}" threw`, err);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const GameEvents = new EventBus();
