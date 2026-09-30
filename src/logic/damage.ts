import { balance } from '@/config/balance';
import type { DamageKind, KillType } from '@/core/types';

export function clampArmor(armor: number): number {
  return Math.max(0, Math.min(balance.combat.armorMax, armor));
}

/** §9.3 step 2: final = max(1, round(amount × multiplier × (1 − armor))). */
export function computeFinalDamage(amount: number, multiplier: number, armor: number): number {
  return Math.max(balance.combat.minDamage, Math.round(amount * multiplier * (1 - clampArmor(armor))));
}

export function mightMultiplier(mightTier: number): number {
  return 1 + balance.economy.upgrades.might.damagePerTier * mightTier;
}

export interface KillContext {
  isFinisher?: boolean;
  isClap?: boolean;
  targetGrounded?: boolean;
  isSlam?: boolean;
  byAlly?: boolean;
}

/** §13.1 kill type derivation. */
export function killTypeFor(kind: DamageKind, ctx: KillContext = {}): KillType {
  if (ctx.byAlly) return 'generic';
  if (ctx.isSlam || kind === 'crush') return 'crush';
  if (ctx.isClap && ctx.targetGrounded) return 'crush';
  switch (kind) {
    case 'melee':
      return 'slash';
    case 'arrow':
      return 'arrow';
    case 'lightning':
      return 'lightning';
    default:
      return 'generic';
  }
}

export type HitPreset = keyof typeof balance.hitStop;
export function presetForHit(amount: number): HitPreset {
  if (amount >= 30) return 'heavy';
  if (amount >= 15) return 'medium';
  return 'light';
}

/** Bow charge interpolation (§8.2): linear between tap and full values. */
export function bowShot(chargeMs: number): {
  damage: number;
  speed: number;
  gravityScale: number;
  pierce: number;
  perfect: boolean;
  t: number;
} {
  const b = balance.weapons.bow;
  const t = chargeMs <= b.tapMaxMs ? 0 : Math.min(1, (chargeMs - b.tapMaxMs) / (b.fullChargeMs - b.tapMaxMs));
  const lerp = (a: number, c: number) => a + (c - a) * t;
  const perfect = t >= 1;
  return {
    damage: Math.round(lerp(b.tap.damage, b.full.damage)),
    speed: lerp(b.tap.speed, b.full.speed),
    gravityScale: lerp(b.tap.gravityScale, b.full.gravityScale),
    pierce: perfect ? b.full.pierce : 0,
    perfect,
    t,
  };
}

/** Chain lightning damage for the n-th target (0 = primary). */
export function chainDamage(base: number, index: number): number {
  return Math.round(base * Math.pow(balance.weapons.staff.boltChainFalloff, index));
}

export function coinLossOnDeath(coins: number): number {
  return Math.floor(coins * balance.economy.deathCoinLoss);
}
