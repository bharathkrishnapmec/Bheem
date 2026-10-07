import { balance } from '@/config/balance';
import { STR } from '@/config/strings';
import { GameEvents, type GameEventMap } from '@/core/GameEvents';
import { GameStore } from '@/core/GameStore';
import type { DistrictId, EnemyType } from '@/core/types';

export function pointsForKill(type: EnemyType | 'boss'): number {
  return type === 'boss' ? balance.score.boss : balance.score.kill[type];
}

/** Cosmetic Story-mode score: listens to gameplay events and never feeds back into gameplay. */
export class ScoreSystem {
  private offs: (() => void)[] = [];
  private rescued: number;
  private hurt = false;
  private visited = new Set<DistrictId>();

  constructor(
    private pos: () => { x: number; y: number },
    enabled = true,
  ) {
    this.rescued = GameStore.state.rescued;
    if (!enabled) return;
    const on = <K extends keyof GameEventMap>(k: K, fn: (p: GameEventMap[K]) => void) => {
      GameEvents.on(k, fn);
      this.offs.push(() => GameEvents.off(k, fn));
    };
    on('enemy:killed', (p) => this.add(pointsForKill(p.type), p.x, p.y - 40));
    on('env:kill', () => this.addAtHero(balance.score.envKill, STR.hud.environment));
    on('boss:died', () => this.addAtHero(balance.score.boss));
    on('rescue:changed', (p) => {
      if (p.rescued > this.rescued) this.addAtHero(balance.score.captive * (p.rescued - this.rescued));
      this.rescued = p.rescued;
    });
    on('chest:opened', (p) => this.add(balance.score.chest, p.x, p.y - 40));
    on('player:hurt', () => (this.hurt = true));
    on('district:changed', (p) => {
      if (this.visited.has(p.id)) return;
      this.visited.add(p.id);
      this.hurt = false;
    });
    on('district:liberated', () => {
      this.addAtHero(balance.score.district);
      if (!this.hurt) {
        const q = this.pos();
        this.add(balance.score.noDamageDistrict, q.x, q.y - 18, STR.hud.flawless);
      }
    });
  }

  private addAtHero(n: number, label?: string): void {
    const q = this.pos();
    this.add(n, q.x, q.y, label);
  }

  add(n: number, x?: number, y?: number, label?: string): void {
    GameStore.state.score += n;
    GameEvents.emit('score:changed', { score: GameStore.state.score, delta: n, x, y, label });
  }

  destroy(): void {
    this.offs.forEach((f) => f());
    this.offs = [];
  }
}
