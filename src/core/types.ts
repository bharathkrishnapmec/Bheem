export type Faction = 'hero' | 'ally' | 'enemy' | 'neutral';
export type DamageKind = 'melee' | 'arrow' | 'lightning' | 'crush' | 'magic' | 'contact';
export type KillType = 'slash' | 'arrow' | 'lightning' | 'crush' | 'generic';
export type StatusId = 'slow' | 'shocked' | 'knockdown' | 'marked';
export type WeaponId = 'sword' | 'bow' | 'staff';
export type DistrictId = 'gate' | 'market' | 'temple' | 'hall';
export type EnemyType = 'raider' | 'boneArcher' | 'mireHexer' | 'skyCaller' | 'brute' | 'imp';
export type AllyType = 'spearman' | 'archer' | 'shieldbearer' | 'captain';
export type ActionId =
  | 'left'
  | 'right'
  | 'jump'
  | 'crouch'
  | 'dash'
  | 'attack'
  | 'weapon1'
  | 'weapon2'
  | 'weapon3'
  | 'cycleNext'
  | 'cyclePrev'
  | 'summon'
  | 'interact'
  | 'pause';

export interface StatusApplication {
  id: StatusId;
  durationMs: number;
  sourceId?: number;
}

export const WEAPONS: readonly WeaponId[] = ['sword', 'bow', 'staff'];
export const DISTRICT_IDS: readonly DistrictId[] = ['gate', 'market', 'temple', 'hall'];
