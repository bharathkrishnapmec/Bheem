import { balance } from '@/config/balance';

/** Limits how many enemies may be in melee Attack state against the hero at once (§11.2). */
export class AttackTokenSystem {
  private holders = new Set<number>();
  get inUse(): number {
    return this.holders.size;
  }
  capacity: number = balance.enemyAI.meleeTokens;

  setBossMode(on: boolean): void {
    this.capacity = on ? balance.enemyAI.bossTokens : balance.enemyAI.meleeTokens;
  }

  request(id: number): boolean {
    if (this.holders.has(id)) return true;
    if (this.holders.size >= this.capacity) return false;
    this.holders.add(id);
    return true;
  }

  release(id: number): void {
    this.holders.delete(id);
  }

  has(id: number): boolean {
    return this.holders.has(id);
  }

  get count(): number {
    return this.holders.size;
  }

  get list(): number[] {
    return [...this.holders];
  }

  clear(): void {
    this.holders.clear();
  }
}
