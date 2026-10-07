import { STR } from '@/config/strings';
import { GameEvents } from '@/core/GameEvents';
import { GameStore } from '@/core/GameStore';
import { TimeController } from '@/core/TimeController';
import type { EnemyType } from '@/core/types';
import type { Actor } from '@/entities/Actor';
import type { World } from '@/game/World';
import type { PickupKind } from '@/logic/loot';
import { balance } from '@/config/balance';
import { GameContext } from './GameContext';
import { TrainingDummy } from './TrainingDummy';

export const MAX_UPGRADES = { might: 3, vitality: 3, quiver: 2, prana: 3, rally: 3 } as const;
export const FULL_SQUAD = 12;

export interface FightStats {
  timeMs: number;
  damageTaken: number;
  hitsLanded: number;
}

type QueuedSpawn = { type: EnemyType | 'dummy'; dx: number };

/** Creative-only tooling layered on the shared Story systems. Never touches Story saves. */
export class CreativeController {
  stats: FightStats = { timeMs: 0, damageTaken: 0, hitsLanded: 0 };
  style = { n: 0, t: 0 };
  queue: QueuedSpawn[] = [];
  fighting = false;
  private offs: (() => void)[] = [];

  constructor(
    private w: World,
    private start: { x: number; y: number },
  ) {
    this.offs.push(
      GameEvents.on('player:hurt', (p) => (this.stats.damageTaken += p.amount)),
      GameEvents.on('hit:landed', () => {
        this.stats.hitsLanded++;
        this.style.n = this.style.t > 0 ? this.style.n + 1 : 1;
        this.style.t = 2000;
      }),
    );
  }

  /** Loadout every Creative run starts with: all weapons, max upgrades, full squad, summon ready. */
  static loadout(): { upgrades: Record<keyof typeof MAX_UPGRADES, number>; rescued: number } {
    return { upgrades: { ...MAX_UPGRADES }, rescued: FULL_SQUAD };
  }

  update(dt: number, realDt: number): void {
    const p = this.w.player;
    const m = GameContext.modifiers;
    if (!p.dead) {
      if (m.godMode) p.hp = p.maxHp;
      if (m.infinitePrana) p.prana = p.maxPrana;
      if (m.infiniteArrows) p.ammo = p.maxAmmo;
      if (m.noDashCooldown) p.dashCd = 0;
    }
    if (m.instantRally && GameStore.state.rally < GameStore.state.maxRally) GameStore.setRally(GameStore.state.maxRally);
    if (this.fighting) this.stats.timeMs += dt;
    if ((this.style.t -= realDt) <= 0) this.style.n = 0;
    while (this.queue.length && this.alive() < balance.world.activeEnemyCap) {
      const q = this.queue.shift()!;
      this.spawnNow(q.type, q.dx);
    }
  }

  private alive(): number {
    return [...this.w.enemies].filter((e) => e.isAlive()).length;
  }

  setSlowMo(s: 1 | 0.5 | 0.25): void {
    GameContext.slowMo = s;
    TimeController.setBaseScale(s);
  }

  spawn(type: EnemyType | 'dummy'): void {
    const dx = 160 + (this.queue.length % 4) * 40;
    if (this.alive() >= balance.world.activeEnemyCap) {
      this.queue.push({ type, dx });
      this.w.toast(STR.creative.queued(this.queue.length), 'violet');
      return;
    }
    this.spawnNow(type, dx);
  }

  private spawnNow(type: EnemyType | 'dummy', dx: number): void {
    const w = this.w;
    const p = w.player;
    const x = Math.max(80, Math.min(w.level.width - 80, p.x + dx * p.facing));
    if (type === 'dummy') {
      const d = new TrainingDummy(w, x, w.level.groundY - 1);
      w.enemies.add(d);
      w.groundGroup.add(d);
      return;
    }
    w.spawner.spawnEnemy(type, x, p.y - (type === 'skyCaller' ? 160 : 0), { aggro: true, required: false });
  }

  spawnPickup(kind: Exclude<PickupKind, 'coin'>): void {
    const D = balance.drops;
    const value = kind === 'health' ? D.healthOrb.heal : kind === 'prana' ? D.pranaOrb.amount : D.arrowBundle.amount;
    const p = this.w.player;
    this.w.loot.drop(p.x + 70 * p.facing, p.y - 60, [{ kind, value }]);
  }

  summonSquad(): void {
    GameStore.setRally(GameStore.state.maxRally);
    this.w.summon.cooldown = 0;
    this.w.summon.tryStart();
  }

  /** Removes every enemy (not the boss), projectile and pickup without awarding anything. */
  clearAll(keep?: Actor | null): void {
    const w = this.w;
    this.queue = [];
    for (const e of [...w.enemies]) {
      if (e === keep) continue;
      e.releaseToken();
      w.enemies.delete(e);
      e.destroy();
    }
    w.proj.clearAll();
    w.loot.clear();
  }

  /** Restores the hero to a fresh full-stat state at the start point. */
  restorePlayer(): void {
    const w = this.w;
    const p = w.player;
    p.dead = false;
    p.safe = { x: this.start.x, y: this.start.y };
    p.respawnSafe();
    p.facing = 1;
    p.hp = p.maxHp;
    p.prana = p.maxPrana;
    p.ammo = p.maxAmmo;
    p.dashCd = 0;
    p.invulnMs = 600;
    p.statuses.clear();
    p.anim('idle');
    w.summon.dismissAll();
    w.summon.cooldown = 0;
    GameStore.setRally(GameStore.state.maxRally);
    p.syncStore();
  }

  resetStats(): void {
    this.stats = { timeMs: 0, damageTaken: 0, hitsLanded: 0 };
    this.style = { n: 0, t: 0 };
  }

  destroy(): void {
    this.offs.forEach((f) => f());
    this.offs = [];
    TimeController.setBaseScale(1);
  }
}
