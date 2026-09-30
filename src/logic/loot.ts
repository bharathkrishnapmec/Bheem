import { balance } from '@/config/balance';
import type { RNG } from '@/core/RNG';

export type PickupKind = 'coin' | 'health' | 'prana' | 'arrows';

export interface DropRoll {
  kind: PickupKind;
  value: number;
}

/** §11.4 drop table. Coins are always dropped; other drops roll independently. */
export function rollDrops(rng: RNG, coins: number, elite: boolean, ammo: number): DropRoll[] {
  const d = balance.drops;
  const out: DropRoll[] = splitCoins(coins);
  if (rng.chance(elite ? d.healthOrb.eliteChance : d.healthOrb.chance)) out.push({ kind: 'health', value: d.healthOrb.heal });
  if (rng.chance(d.pranaOrb.chance)) out.push({ kind: 'prana', value: d.pranaOrb.amount });
  const arrowChance = ammo < d.arrowBundle.lowAmmoThreshold ? d.arrowBundle.lowAmmoChance : d.arrowBundle.chance;
  if (rng.chance(arrowChance)) out.push({ kind: 'arrows', value: d.arrowBundle.amount });
  return out;
}

/** Splits a coin amount into pickups worth at most `coinValueCap` each. */
export function splitCoins(amount: number): DropRoll[] {
  const out: DropRoll[] = [];
  let left = Math.max(0, Math.floor(amount));
  const cap = balance.drops.coinValueCap;
  while (left > 0) {
    const v = Math.min(cap, left);
    out.push({ kind: 'coin', value: v });
    left -= v;
  }
  return out;
}

export function chestCoins(rng: RNG): number {
  return rng.int(balance.economy.chestCoinsMin, balance.economy.chestCoinsMax);
}
