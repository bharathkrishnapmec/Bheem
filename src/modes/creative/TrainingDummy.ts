import { balance } from '@/config/balance';
import { Enemy } from '@/entities/enemies/Enemy';
import type { World } from '@/game/World';

/** Stationary raider-bodied target that never dies and refills after a short rest. */
export class TrainingDummy extends Enemy {
  override readonly type = 'raider' as const;
  private rest = 0;
  constructor(w: World, x: number, y: number) {
    super(w, x, y, 'raider', 26, 56, { required: false, aggro: false });
    this.setStats({ ...balance.enemies.raider, hp: 5000, coins: 0, knockbackResist: 1 });
    this.coins = 0;
    this.setTint(0xd8c090);
  }
  protected think(dt: number): void {
    this.body.setVelocityX(0);
    if (this.hp < this.maxHp) {
      this.rest += dt;
      if (this.rest > 2000) {
        this.hp = this.maxHp;
        this.rest = 0;
      }
    }
    if (this.hp < 50) this.hp = this.maxHp;
  }
  override onHurt(): void {
    this.rest = 0;
    if (this.hp < 50) this.hp = this.maxHp;
  }
}
