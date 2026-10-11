import { checkReachability } from './reachability';
import type { DistrictId, EnemyType } from '@/core/types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Vec2 {
  x: number;
  y: number;
}
export interface VoidZone {
  rect: Rect;
  fallRespawnPoints: Vec2[];
}
export interface GeyserDef {
  x: number;
  y: number;
  periodMs: number;
  phaseOffsetMs: number;
}
export interface CrumblingDef {
  rect: Rect;
  standMs: number;
  shakeMs: number;
  respawnMs: number;
}
export interface MovingDef {
  rect: Rect;
  path: 'sine-x' | 'sine-y';
  amplitude: number;
  periodMs: number;
  phaseMs?: number;
}
export interface UpdraftDef {
  rect: Rect;
  vy: number;
  relockMs: number;
}
export type ArenaId = 'courtyard' | 'training_yard' | 'lava_forge' | 'sky_citadel';
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
  // ---- Addendum v2 §A6.4 (all optional so older levels stay valid)
  arenaType?: 'story' | 'arena';
  arenaId?: ArenaId;
  name?: string;
  cameraZoom?: number;
  lavaZones?: Rect[];
  voidZones?: VoidZone[];
  geysers?: GeyserDef[];
  crumblingPlatforms?: CrumblingDef[];
  movingPlatforms?: MovingDef[];
  updrafts?: UpdraftDef[];
  grappleAnchors?: Vec2[];
  bossSpawn?: Vec2;
  /** Alias of playerStart for arena maps. */
  heroSpawn?: Vec2;
  safeAnchors?: Vec2[];
  skyPreset?: 'storm' | 'calm';
  theme?: 'village' | 'forge' | 'sky';
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

  validateArenaFields(raw, issues, { num, rect, point, rects });

  if (issues.length) throw new LevelValidationError(issues);
  return raw as unknown as LevelData;
}

interface Checkers {
  num(o: Obj, k: string, path: string): void;
  rect(r: unknown, path: string): void;
  point(p: unknown, path: string, extra?: string[]): void;
  rects(arr: unknown, path: string, optional?: boolean): void;
}

const surfaceRects = (raw: Obj): Rect[] => {
  const out: Rect[] = [];
  for (const k of ['solids', 'oneWays'] as const) if (Array.isArray(raw[k])) out.push(...(raw[k] as Rect[]).filter((r) => isObj(r)));
  for (const k of ['crumblingPlatforms', 'movingPlatforms'] as const)
    if (Array.isArray(raw[k])) for (const c of raw[k] as { rect?: Rect }[]) if (isObj(c) && isObj(c.rect)) out.push(c.rect);
  return out;
};

/** A point "stands on ground" if a surface top lies 0..12 px below it within the surface's x span. */
export function onGround(p: Vec2, surfaces: readonly Rect[]): boolean {
  return surfaces.some((r) => p.x >= r.x && p.x <= r.x + r.w && r.y - p.y >= -2 && r.y - p.y <= 12);
}

function validateArenaFields(raw: Obj, issues: string[], c: Checkers): void {
  const opt = <T>(k: string, each: (v: unknown, path: string) => void): T[] | undefined => {
    const arr = raw[k];
    if (arr === undefined) return undefined;
    if (!Array.isArray(arr)) {
      issues.push(`level.${k} must be an array`);
      return undefined;
    }
    arr.forEach((v, i) => each(v, `level.${k}[${i}]`));
    return arr as T[];
  };
  if (raw.arenaType !== undefined && raw.arenaType !== 'story' && raw.arenaType !== 'arena') issues.push('level.arenaType must be "story" or "arena"');
  if (raw.cameraZoom !== undefined && (!isNum(raw.cameraZoom) || raw.cameraZoom <= 0.3 || raw.cameraZoom > 2)) issues.push('level.cameraZoom must be a number in (0.3, 2]');
  if (raw.skyPreset !== undefined && raw.skyPreset !== 'storm' && raw.skyPreset !== 'calm') issues.push('level.skyPreset must be "storm" or "calm"');
  const lava = opt<Rect>('lavaZones', (v, p) => c.rect(v, p)) ?? [];
  const voids = opt<VoidZone>('voidZones', (v, p) => {
    if (!isObj(v)) return issues.push(`${p} must be an object`);
    c.rect(v.rect, `${p}.rect`);
    if (!Array.isArray(v.fallRespawnPoints) || v.fallRespawnPoints.length === 0) issues.push(`${p}.fallRespawnPoints must be a non-empty array`);
    else v.fallRespawnPoints.forEach((q: unknown, j: number) => c.point(q, `${p}.fallRespawnPoints[${j}]`));
  });
  opt('geysers', (v, p) => c.point(v, p, ['periodMs', 'phaseOffsetMs']));
  opt('crumblingPlatforms', (v, p) => {
    if (!isObj(v)) return issues.push(`${p} must be an object`);
    c.rect(v.rect, `${p}.rect`);
    for (const k of ['standMs', 'shakeMs', 'respawnMs']) c.num(v, k, p);
  });
  opt('movingPlatforms', (v, p) => {
    if (!isObj(v)) return issues.push(`${p} must be an object`);
    c.rect(v.rect, `${p}.rect`);
    if (v.path !== 'sine-x' && v.path !== 'sine-y') issues.push(`${p}.path must be "sine-x" or "sine-y"`);
    for (const k of ['amplitude', 'periodMs']) c.num(v, k, p);
  });
  opt('updrafts', (v, p) => {
    if (!isObj(v)) return issues.push(`${p} must be an object`);
    c.rect(v.rect, `${p}.rect`);
    c.num(v, 'vy', p);
    c.num(v, 'relockMs', p);
    if (isNum(v.vy) && v.vy >= 0) issues.push(`${p}.vy must be negative (upward)`);
  });
  opt('grappleAnchors', (v, p) => c.point(v, p));
  const anchors = opt<Vec2>('safeAnchors', (v, p) => c.point(v, p)) ?? [];
  for (const k of ['bossSpawn', 'heroSpawn']) if (raw[k] !== undefined) c.point(raw[k], `level.${k}`);
  if (issues.length) return;

  if (raw.arenaType === 'arena') {
    const r = checkReachability(raw as unknown as LevelData);
    r.unreachable.forEach((u) => issues.push(`unreachable platform ${u.x0}-${u.x1}@${u.y}`));
  }
  const surfaces = surfaceRects(raw);
  anchors.forEach((a, i) => {
    if (!onGround(a, surfaces)) issues.push(`level.safeAnchors[${i}] (${a.x},${a.y}) is not on solid ground`);
  });
  (voids ?? []).forEach((v, i) =>
    v.fallRespawnPoints.forEach((q, j) => {
      if (!onGround(q, surfaces)) issues.push(`level.voidZones[${i}].fallRespawnPoints[${j}] (${q.x},${q.y}) is not on solid ground`);
    }),
  );
  const spawns: [string, Vec2][] = [['playerStart', raw.playerStart as Vec2]];
  if (raw.heroSpawn) spawns.push(['heroSpawn', raw.heroSpawn as Vec2]);
  if (raw.bossSpawn) spawns.push(['bossSpawn', raw.bossSpawn as Vec2]);
  for (const [name, sp] of spawns) {
    lava.forEach((r, i) => {
      if (sp.x >= r.x && sp.x <= r.x + r.w && sp.y >= r.y - 4 && sp.y <= r.y + r.h) issues.push(`level.${name} overlaps level.lavaZones[${i}]`);
    });
    (voids ?? []).forEach((v, i) => {
      const r = v.rect;
      if (sp.x >= r.x && sp.x <= r.x + r.w && sp.y >= r.y && sp.y <= r.y + r.h) issues.push(`level.${name} lies inside level.voidZones[${i}]`);
    });
  }
}
