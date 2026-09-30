import { balance, type UpgradeId } from '@/config/balance';

export function upgradeCost(id: UpgradeId, currentTier: number): number | null {
  const u = balance.economy.upgrades[id];
  if (currentTier >= u.tiers) return null;
  return u.costs[currentTier] ?? null;
}

export function canPurchase(id: UpgradeId, currentTier: number, coins: number): boolean {
  const c = upgradeCost(id, currentTier);
  return c !== null && coins >= c;
}

export interface DerivedStats {
  maxHp: number;
  maxPrana: number;
  pranaRegen: number;
  maxAmmo: number;
  damageMul: number;
}

export function derivedPlayerStats(upgrades: Record<UpgradeId, number>): DerivedStats {
  const p = balance.player;
  const u = balance.economy.upgrades;
  return {
    maxHp: p.maxHp + upgrades.vitality * u.vitality.hpPerTier,
    maxPrana: p.maxPrana + upgrades.prana * u.prana.pranaPerTier,
    pranaRegen: p.pranaRegenPerSec + upgrades.prana * u.prana.regenPerTier,
    maxAmmo: balance.weapons.bow.quiver + upgrades.quiver * u.quiver.arrowsPerTier,
    damageMul: 1 + upgrades.might * u.might.damagePerTier,
  };
}

export function totalUpgradeCost(): number {
  let t = 0;
  for (const u of Object.values(balance.economy.upgrades)) t += u.costs.reduce((a: number, b: number) => a + b, 0);
  return t;
}
