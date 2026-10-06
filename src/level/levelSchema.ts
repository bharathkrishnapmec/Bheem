import type { DistrictId, EnemyType } from '@/core/types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface LootSpec {
  coins?: number;
  health?: number;
  arrows?: number;
}
export interface WaveSpawn {
  type: EnemyType;
  x: number;
  y: number;
  delayMs?: number;
  elite?: boolean;
}
export type WaveTrigger = 'onEnter' | { afterWave: string } | { x: number };
export interface WaveDef {
  id: string;
  trigger: WaveTrigger;
  spawns: WaveSpawn[];
  requiredToClear: boolean;
}
export type AmbientType =
  | 'house'
  | 'temple'
  | 'lamp'
  | 'torch'
  | 'stall'
  | 'tree'
  | 'pine'
  | 'fence'
  | 'hay'
  | 'safehouse'
  | 'ruinTower'
  | 'pillar'
  | 'brokenGate';
export interface AmbientProp {
  type: AmbientType;
  x: number;
  y: number;
}
export interface DistrictDef {
  id: DistrictId;
  name: string;
  bounds: { x0: number; x1: number };
  startTrigger: Rect;
  exitGate: { x: number; y: number; h: number };
  shrine: { x: number; y: number };
  banner: { x: number; y: number; hp: number };
  captives: { x: number; y: number; guarded?: boolean }[];
  chests: { x: number; y: number; loot: LootSpec }[];
  waves: WaveDef[];
  ambient: AmbientProp[];
  weather?: 'none' | 'rain' | 'fog';
  cameraVertical?: boolean;
}
export interface ParallaxLayer {
  key: string;
  scrollFactor: number;
  y: number;
}
export interface LightPreset {
  tint: string;
  alpha: number;
}
export interface BossArenaDef {
  x0: number;
  x1: number;
  trigger: Rect;
  entryGate: { x: number; y: number; h: number };
  bossSpawn: { x: number; y: number };
  shrine: { x: number; y: number };
}
export interface LevelData {
  width: number;
  height: number;
  groundY: number;
  playerStart: { x: number; y: number };
  solids: Rect[];
  oneWays: Rect[];
  hazards?: Rect[];
  districts: DistrictDef[];
  bossArena: BossArenaDef;
  parallax: ParallaxLayer[];
  lighting: { occupied: LightPreset; liberated: LightPreset; bossP3: LightPreset };
}

export class LevelValidationError extends Error {
  constructor(public issues: string[]) {
    super(`Invalid level data:\n - ${issues.join('\n - ')}`);
    this.name = 'LevelValidationError';
  }
}

const ENEMY_TYPES: EnemyType[] = ['raider', 'boneArcher', 'mireHexer', 'skyCaller', 'brute', 'imp'];
const DISTRICTS: DistrictId[] = ['gate', 'market', 'temple', 'hall'];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Runtime validation with readable error paths. Throws LevelValidationError listing every issue. */
export function validateLevel(raw: unknown): LevelData {
  const issues: string[] = [];
  const num = (o: Obj, k: string, path: string): void => {
    if (!isNum(o[k])) issues.push(`${path}.${k} must be a number (got ${JSON.stringify(o[k])})`);
  };
  const rect = (r: unknown, path: string): void => {
    if (!isObj(r)) {
      issues.push(`${path} must be a rect object`);
      return;
    }
    for (const k of ['x', 'y', 'w', 'h']) num(r, k, path);
    if (isNum(r.w) && r.w <= 0) issues.push(`${path}.w must be > 0`);
    if (isNum(r.h) && r.h <= 0) issues.push(`${path}.h must be > 0`);
  };
  const point = (p: unknown, path: string, extra: string[] = []): void => {
    if (!isObj(p)) {
      issues.push(`${path} must be an object`);
      return;
    }
    for (const k of ['x', 'y', ...extra]) num(p, k, path);
  };
  const rects = (arr: unknown, path: string, optional = false): void => {
    if (arr === undefined && optional) return;
    if (!Array.isArray(arr)) {
      issues.push(`${path} must be an array`);
      return;
    }
    arr.forEach((r, i) => rect(r, `${path}[${i}]`));
  };

  if (!isObj(raw)) throw new LevelValidationError(['level root must be an object']);
  for (const k of ['width', 'height', 'groundY']) num(raw, k, 'level');
  point(raw.playerStart, 'level.playerStart');
  rects(raw.solids, 'level.solids');
  rects(raw.oneWays, 'level.oneWays');
  rects(raw.hazards, 'level.hazards', true);

  if (!Array.isArray(raw.districts)) {
    issues.push('level.districts must be an array (empty for arena maps)');
  } else {
    const waveIds = new Set<string>();
    raw.districts.forEach((d: unknown, i: number) => {
      const p = `level.districts[${i}]`;
      if (!isObj(d)) {
        issues.push(`${p} must be an object`);
        return;
      }
      if (!DISTRICTS.includes(d.id as DistrictId)) issues.push(`${p}.id must be one of ${DISTRICTS.join(', ')}`);
      if (typeof d.name !== 'string') issues.push(`${p}.name must be a string`);
      if (!isObj(d.bounds) || !isNum(d.bounds.x0) || !isNum(d.bounds.x1) || d.bounds.x1 <= d.bounds.x0) {
        issues.push(`${p}.bounds must be {x0, x1} with x1 > x0`);
      }
      rect(d.startTrigger, `${p}.startTrigger`);
      point(d.exitGate, `${p}.exitGate`, ['h']);
      point(d.shrine, `${p}.shrine`);
      point(d.banner, `${p}.banner`, ['hp']);
      if (!Array.isArray(d.captives)) issues.push(`${p}.captives must be an array`);
      else d.captives.forEach((c: unknown, j: number) => point(c, `${p}.captives[${j}]`));
      if (!Array.isArray(d.chests)) issues.push(`${p}.chests must be an array`);
      else d.chests.forEach((c: unknown, j: number) => point(c, `${p}.chests[${j}]`));
      if (!Array.isArray(d.ambient)) issues.push(`${p}.ambient must be an array`);
      if (!Array.isArray(d.waves)) issues.push(`${p}.waves must be an array`);
      else
        d.waves.forEach((w: unknown, j: number) => {
          const wp = `${p}.waves[${j}]`;
          if (!isObj(w)) {
            issues.push(`${wp} must be an object`);
            return;
          }
          if (typeof w.id !== 'string') issues.push(`${wp}.id must be a string`);
          else if (waveIds.has(w.id)) issues.push(`${wp}.id "${w.id}" is duplicated`);
          else waveIds.add(w.id);
          const t = w.trigger;
          const okTrigger =
            t === 'onEnter' || (isObj(t) && (typeof t.afterWave === 'string' || isNum(t.x)));
          if (!okTrigger) issues.push(`${wp}.trigger must be "onEnter", {afterWave} or {x}`);
          if (typeof w.requiredToClear !== 'boolean') issues.push(`${wp}.requiredToClear must be boolean`);
          if (!Array.isArray(w.spawns) || w.spawns.length === 0) issues.push(`${wp}.spawns must be a non-empty array`);
          else
            w.spawns.forEach((s: unknown, k: number) => {
              point(s, `${wp}.spawns[${k}]`);
              if (isObj(s) && !ENEMY_TYPES.includes(s.type as EnemyType)) {
                issues.push(`${wp}.spawns[${k}].type "${String(s.type)}" is not a known enemy`);
              }
            });
        });
    });
    raw.districts.forEach((d: unknown, i: number) => {
      if (!isObj(d) || !Array.isArray(d.waves)) return;
      d.waves.forEach((w: unknown, j: number) => {
        if (isObj(w) && isObj(w.trigger) && typeof w.trigger.afterWave === 'string' && !waveIds.has(w.trigger.afterWave)) {
          issues.push(`level.districts[${i}].waves[${j}].trigger.afterWave references unknown wave "${w.trigger.afterWave}"`);
        }
      });
    });
  }

  if (!isObj(raw.bossArena)) issues.push('level.bossArena must be an object');
  else {
    const b = raw.bossArena;
    num(b, 'x0', 'level.bossArena');
    num(b, 'x1', 'level.bossArena');
    rect(b.trigger, 'level.bossArena.trigger');
    point(b.entryGate, 'level.bossArena.entryGate', ['h']);
    point(b.bossSpawn, 'level.bossArena.bossSpawn');
    point(b.shrine, 'level.bossArena.shrine');
  }
  if (!Array.isArray(raw.parallax)) issues.push('level.parallax must be an array');
  if (!isObj(raw.lighting)) issues.push('level.lighting must be an object');
  else
    for (const k of ['occupied', 'liberated', 'bossP3']) {
      const l = raw.lighting[k];
      if (!isObj(l) || typeof l.tint !== 'string' || !isNum(l.alpha)) issues.push(`level.lighting.${k} must be {tint, alpha}`);
    }

  if (issues.length) throw new LevelValidationError(issues);
  return raw as unknown as LevelData;
}
