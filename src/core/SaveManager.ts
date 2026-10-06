import { DEFAULT_KEY_BINDINGS } from '@/config/controls';
import { SAVE_KEY } from '@/config/gameConfig';
import type { UpgradeId } from '@/config/balance';
import type { ActionId, DistrictId } from './types';

export interface SaveSettings {
  master: number;
  music: number;
  sfx: number;
  shake: number;
  reducedEffects: boolean;
  damageNumbers: boolean;
  bindings: Record<ActionId, string[]>;
  touchAlways: boolean;
  touchSize: TouchSize;
  touchOpacity: number;
  leftHanded: boolean;
  haptics: boolean;
  quality: QualityPreset;
  toolboxPauses: boolean;
}

export type TouchSize = 'S' | 'M' | 'L';
export type QualityPreset = 'auto' | 'high' | 'low';
const TOUCH_SIZES: readonly TouchSize[] = ['S', 'M', 'L'];
const QUALITIES: readonly QualityPreset[] = ['auto', 'high', 'low'];
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);

export interface SaveProgress {
  checkpointId: string;
  districtStates: Record<DistrictId, 'occupied' | 'liberated'>;
  coins: number;
  upgrades: Record<UpgradeId, number>;
  rescued: string[];
  bannersDestroyed: string[];
  chestsOpened: string[];
  deaths: number;
  playtimeMs: number;
  kills: number;
}

export interface SaveData {
  version: 1;
  settings: SaveSettings;
  progress?: SaveProgress;
  bestClear?: { timeMs: number; deaths: number; rescued: number };
}

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export class MemoryStorage implements StorageLike {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
}

export function defaultSettings(): SaveSettings {
  const bindings = {} as Record<ActionId, string[]>;
  for (const k of Object.keys(DEFAULT_KEY_BINDINGS) as ActionId[]) bindings[k] = [...DEFAULT_KEY_BINDINGS[k]];
  return {
    master: 0.8,
    music: 0.6,
    sfx: 0.8,
    shake: 1,
    reducedEffects: false,
    damageNumbers: true,
    bindings,
    touchAlways: false,
    touchSize: 'M',
    touchOpacity: 0.6,
    leftHanded: false,
    haptics: true,
    quality: 'auto',
    toolboxPauses: true,
  };
}

export function defaultSave(): SaveData {
  return { version: 1, settings: defaultSettings() };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp01 = (v: unknown, d: number): number => (isNum(v) ? Math.max(0, Math.min(1, v)) : d);

/** Validates and normalises unknown JSON into SaveData. Throws on structurally invalid data. */
export function parseSave(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object') throw new Error('save is not an object');
  const obj = raw as Record<string, unknown>;
  const migrated = migrate(obj);
  if (migrated.version !== 1) throw new Error(`unsupported save version ${String(migrated.version)}`);
  const d = defaultSettings();
  const s = (migrated.settings ?? {}) as Record<string, unknown>;
  const bindings = { ...d.bindings };
  if (s.bindings && typeof s.bindings === 'object') {
    for (const [k, v] of Object.entries(s.bindings as Record<string, unknown>)) {
      if (k in bindings && Array.isArray(v) && v.every((x) => typeof x === 'string')) {
        bindings[k as ActionId] = v as string[];
      }
    }
  }
  const settings: SaveSettings = {
    master: clamp01(s.master, d.master),
    music: clamp01(s.music, d.music),
    sfx: clamp01(s.sfx, d.sfx),
    shake: clamp01(s.shake, d.shake),
    reducedEffects: typeof s.reducedEffects === 'boolean' ? s.reducedEffects : d.reducedEffects,
    damageNumbers: typeof s.damageNumbers === 'boolean' ? s.damageNumbers : d.damageNumbers,
    bindings,
    touchAlways: bool(s.touchAlways, d.touchAlways),
    touchSize: oneOf(s.touchSize, TOUCH_SIZES, d.touchSize),
    touchOpacity: typeof s.touchOpacity === 'number' ? Math.max(0.3, Math.min(1, s.touchOpacity)) : d.touchOpacity,
    leftHanded: bool(s.leftHanded, d.leftHanded),
    haptics: bool(s.haptics, d.haptics),
    quality: oneOf(s.quality, QUALITIES, d.quality),
    toolboxPauses: bool(s.toolboxPauses, d.toolboxPauses),
  };
  const out: SaveData = { version: 1, settings };
  const p = migrated.progress as Record<string, unknown> | undefined;
  if (p) {
    if (typeof p.checkpointId !== 'string' || !isNum(p.coins) || typeof p.districtStates !== 'object') {
      throw new Error('progress block is malformed');
    }
    const up = (p.upgrades ?? {}) as Record<string, unknown>;
    out.progress = {
      checkpointId: p.checkpointId,
      districtStates: p.districtStates as SaveProgress['districtStates'],
      coins: Math.max(0, Math.floor(p.coins)),
      upgrades: {
        might: isNum(up.might) ? up.might : 0,
        vitality: isNum(up.vitality) ? up.vitality : 0,
        quiver: isNum(up.quiver) ? up.quiver : 0,
        prana: isNum(up.prana) ? up.prana : 0,
        rally: isNum(up.rally) ? up.rally : 0,
      },
      rescued: Array.isArray(p.rescued) ? (p.rescued as unknown[]).filter((x): x is string => typeof x === 'string') : [],
      bannersDestroyed: Array.isArray(p.bannersDestroyed)
        ? (p.bannersDestroyed as unknown[]).filter((x): x is string => typeof x === 'string')
        : [],
      chestsOpened: Array.isArray(p.chestsOpened)
        ? (p.chestsOpened as unknown[]).filter((x): x is string => typeof x === 'string')
        : [],
      deaths: isNum(p.deaths) ? p.deaths : 0,
      playtimeMs: isNum(p.playtimeMs) ? p.playtimeMs : 0,
      kills: isNum(p.kills) ? p.kills : 0,
    };
  }
  const b = migrated.bestClear as Record<string, unknown> | undefined;
  if (b && isNum(b.timeMs) && isNum(b.deaths) && isNum(b.rescued)) {
    out.bestClear = { timeMs: b.timeMs, deaths: b.deaths, rescued: b.rescued };
  }
  return out;
}

/** Migration stub: future versions transform older shapes here. */
function migrate(obj: Record<string, unknown>): Record<string, unknown> {
  if (obj.version === undefined) return { ...obj, version: 1 };
  return obj;
}

export class SaveManagerCore {
  private data: SaveData = defaultSave();
  private storage: StorageLike;
  warnings: string[] = [];

  constructor(storage?: StorageLike, private key = SAVE_KEY) {
    this.storage = storage ?? SaveManagerCore.detectStorage();
  }

  static detectStorage(): StorageLike {
    try {
      if (typeof localStorage !== 'undefined') {
        const probe = '__bheem_probe__';
        localStorage.setItem(probe, '1');
        localStorage.removeItem(probe);
        return localStorage;
      }
    } catch {
      /* private mode or disabled storage: fall through to memory */
    }
    return new MemoryStorage();
  }

  load(): SaveData {
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(this.key);
    } catch (e) {
      this.warn(`storage read failed: ${String(e)}`);
    }
    if (!raw) {
      this.data = defaultSave();
      return this.data;
    }
    try {
      this.data = parseSave(JSON.parse(raw));
    } catch (e) {
      this.warn(`corrupted save discarded: ${String(e)}`);
      this.data = defaultSave();
      this.write();
    }
    return this.data;
  }

  get(): SaveData {
    return this.data;
  }

  get settings(): SaveSettings {
    return this.data.settings;
  }

  updateSettings(patch: Partial<SaveSettings>): void {
    this.data.settings = { ...this.data.settings, ...patch };
    this.write();
  }

  saveProgress(p: SaveProgress): void {
    this.data.progress = p;
    this.write();
  }

  clearProgress(): void {
    delete this.data.progress;
    this.write();
  }

  recordClear(timeMs: number, deaths: number, rescued: number): void {
    const b = this.data.bestClear;
    if (!b || timeMs < b.timeMs) this.data.bestClear = { timeMs, deaths, rescued };
    this.write();
  }

  hasProgress(): boolean {
    return !!this.data.progress;
  }

  private write(): void {
    try {
      this.storage.setItem(this.key, JSON.stringify(this.data));
    } catch (e) {
      this.warn(`storage write failed, using memory: ${String(e)}`);
      this.storage = new MemoryStorage();
      try {
        this.storage.setItem(this.key, JSON.stringify(this.data));
      } catch {
        /* memory storage cannot fail */
      }
    }
  }

  private warn(msg: string): void {
    this.warnings.push(msg);
    console.warn(`[SaveManager] ${msg}`);
  }
}

export const SaveManager = new SaveManagerCore();
