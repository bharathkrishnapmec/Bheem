import { balance } from '@/config/balance';
import { STR } from '@/config/strings';
import type { BossBase } from '@/entities/boss/BossBase';
import { Garjana } from '@/entities/boss/Garjana';
import { Kaalasura } from '@/entities/boss/Kaalasura';
import type { Actor } from '@/entities/Actor';
import type { World } from '@/game/World';
import type { ArenaId } from '@/level/levelSchema';

export interface BossFight {
  actor: Actor;
  cinematic: boolean;
}

/** Boss Select (Creative and Trials) is generated from this list; adding a boss needs no UI code. */
export interface BossEntry {
  id: string;
  name: string;
  title: string;
  description: string;
  hp: number;
  phases: number;
  difficulty: number;
  estimate: string;
  thumbnailKey: string;
  /** First entry is the default arena. */
  arenas: readonly ArenaId[];
  trialEligible: boolean;
  /** v3 bosses: full BossBase fight (Guard, phases, intro and death cinematic). */
  boss?: (w: World, x: number, y: number) => BossBase;
  /** Plain elite fights. */
  factory?: (w: World, x: number, y: number) => BossFight;
}

const S = balance.bosses.stats;
const estimate = (id: keyof typeof balance.bosses.targets): string => {
  const T = balance.bosses.targets[id];
  return STR.creative.estimate(Math.floor(T.minMs / 60_000), Math.ceil(T.maxMs / 60_000));
};

export const bossRegistry: readonly BossEntry[] = [
  {
    id: 'kaalasura',
    name: STR.boss.name,
    title: STR.boss.title,
    description: STR.creative.bossDesc.kaalasura,
    hp: S.kaalasura.hp,
    phases: S.kaalasura.phases,
    difficulty: S.kaalasura.difficulty,
    estimate: estimate('kaalasura'),
    thumbnailKey: 'boss',
    arenas: ['training_yard'],
    trialEligible: true,
    boss: (w, x, y) => new Kaalasura(w, x, y),
  },
  {
    id: 'garjana',
    name: STR.garjana.name,
    title: STR.garjana.title,
    description: STR.garjana.desc,
    hp: S.garjana.hp,
    phases: S.garjana.phases,
    difficulty: S.garjana.difficulty,
    estimate: estimate('garjana'),
    thumbnailKey: 'garjana',
    arenas: ['sky_citadel'],
    trialEligible: true,
    boss: (w, x, y) => new Garjana(w, x, y),
  },
  {
    id: 'brute',
    name: STR.creative.miniBoss,
    title: STR.creative.miniBossTitle,
    description: STR.creative.bossDesc.brute,
    hp: Math.round(balance.enemies.brute.hp * 1.5),
    phases: 1,
    difficulty: S.brute.difficulty,
    estimate: estimate('brute'),
    thumbnailKey: 'brute',
    arenas: ['training_yard'],
    trialEligible: true,
    factory: (w, x, y) => {
      const e = w.spawner.spawnEnemy('brute', x, y, { elite: true, aggro: true, required: false });
      if (!e) throw new Error('mini-boss spawn blocked by enemy cap');
      return { actor: e, cinematic: false };
    },
  },
];

export const bossById = (id: string | undefined): BossEntry => bossRegistry.find((b) => b.id === id) ?? bossRegistry[0]!;

export { phaseStartHp } from '@/logic/boss';
