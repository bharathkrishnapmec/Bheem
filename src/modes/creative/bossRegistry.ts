import { balance } from '@/config/balance';
import { STR } from '@/config/strings';
import { Kaalasura } from '@/entities/boss/Kaalasura';
import type { Actor } from '@/entities/Actor';
import type { World } from '@/game/World';

export interface BossFight {
  actor: Actor;
  /** Kaalasura runs the real Story intro/death cinematic; others are plain elite enemies. */
  cinematic: boolean;
}

export interface BossEntry {
  id: string;
  name: string;
  title: string;
  description: string;
  hp: number;
  phases: number;
  thumbnailKey: string;
  arenaId: 'creative_arena';
  factory: (w: World, x: number, y: number) => BossFight;
}

export const bossRegistry: readonly BossEntry[] = [
  {
    id: 'kaalasura',
    name: STR.boss.name,
    title: STR.boss.title,
    description: STR.creative.bossDesc.kaalasura,
    hp: balance.bosses.stats.kaalasura.hp,
    phases: balance.bosses.stats.kaalasura.phases,
    thumbnailKey: 'boss',
    arenaId: 'creative_arena',
    factory: (w, x, y) => ({ actor: new Kaalasura(w, x, y), cinematic: true }),
  },
  {
    id: 'brute',
    name: STR.creative.miniBoss,
    title: STR.creative.miniBossTitle,
    description: STR.creative.bossDesc.brute,
    hp: Math.round(balance.enemies.brute.hp * 1.5),
    phases: 1,
    thumbnailKey: 'brute',
    arenaId: 'creative_arena',
    factory: (w, x, y) => {
      const e = w.spawner.spawnEnemy('brute', x, y, { elite: true, aggro: true, required: false });
      if (!e) throw new Error('mini-boss spawn blocked by enemy cap');
      return { actor: e, cinematic: false };
    },
  },
];

export const bossById = (id: string | undefined): BossEntry => bossRegistry.find((b) => b.id === id) ?? bossRegistry[0]!;

export { phaseStartHp } from '@/logic/boss';
