import type Phaser from 'phaser';
import type { Faction } from '@/core/types';
import type { RNG } from '@/core/RNG';
import type { LevelData } from '@/level/levelSchema';
import type { LevelGeometry } from '@/level/geometry';
import type { AttackTokenSystem } from '@/systems/AttackTokenSystem';
import type { Actor } from '@/entities/Actor';
import type { Player } from '@/entities/player/Player';
import type { Enemy } from '@/entities/enemies/Enemy';
import type { Ally } from '@/entities/allies/Ally';
import type { Kaalasura } from '@/entities/boss/Kaalasura';
import type { CombatSystem } from '@/systems/CombatSystem';
import type { FX } from '@/fx/FX';
import type { Projectiles } from '@/entities/projectiles/Projectiles';
import type { LootSystem } from '@/systems/LootSystem';
import type { SpawnDirector } from '@/systems/SpawnDirector';
import type { DistrictManager } from '@/systems/DistrictManager';
import type { SummonSystem } from '@/systems/SummonSystem';
import type { CameraDirector } from '@/fx/CameraDirector';
import type { DeathFX } from '@/fx/DeathFX';
import type { Banner } from '@/entities/world/Banner';

export interface Interactable {
  x: number;
  y: number;
  range: number;
  holdMs: number;
  label(): string;
  canInteract(): boolean;
  interact(): void;
}

/** Shared gameplay context handed to entities and systems (implemented by GameScene). */
export interface World {
  scene: Phaser.Scene;
  level: LevelData;
  geo: LevelGeometry;
  player: Player;
  enemies: Set<Enemy>;
  allies: Set<Ally>;
  boss: Kaalasura | null;
  banners: Banner[];
  interactables: Interactable[];
  combat: CombatSystem;
  fx: FX;
  proj: Projectiles;
  loot: LootSystem;
  tokens: AttackTokenSystem;
  rng: RNG;
  spawner: SpawnDirector;
  districts: DistrictManager;
  summon: SummonSystem;
  cam: CameraDirector;
  deathFx: DeathFX;
  /** Actors that collide with level solids. */
  groundGroup: Phaser.GameObjects.Group;
  solidGroup: Phaser.Physics.Arcade.StaticGroup;
  progress: { rescued: Set<string>; chests: Set<string>; banners: Set<string>; checkpointId: string };
  saveProgress(): void;
  openShrine(id: string): void;
  setCheckpoint(id: string, x: number, y: number): void;
  /** Scaled gameplay clock (ms). */
  now: number;
  hostilesOf(f: Faction): Actor[];
  reduced(): boolean;
  inCombat(): boolean;
  onEnemyKilled(e: Enemy, killType: import('@/core/types').KillType): void;
  toast(text: string, color?: 'gold' | 'red' | 'cyan' | 'violet'): void;
}

export function isHostile(a: Faction, b: Faction): boolean {
  if (a === 'neutral' || b === 'neutral') return false;
  return (a === 'enemy') !== (b === 'enemy');
}
