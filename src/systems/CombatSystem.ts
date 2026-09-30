import { balance } from '@/config/balance';
import { SaveManager } from '@/core/SaveManager';
import { TimeController } from '@/core/TimeController';
import { GameEvents } from '@/core/GameEvents';
import type { DamageKind, Faction, KillType, StatusApplication } from '@/core/types';
import { computeFinalDamage, killTypeFor, presetForHit, type HitPreset } from '@/logic/damage';
import { StatusEffectSystem } from './StatusEffectSystem';
import type { Actor } from '@/entities/Actor';
import { isHostile, type World } from '@/game/World';
import { AudioManager } from '@/audio/AudioManager';
import { PAL } from '@/config/palette';

export interface HitInfo {
  amount: number;
  kind: DamageKind;
  faction: Faction;
  source?: Actor | null;
  dirX: number;
  knockback: number;
  knockUp?: number;
  poise: number;
  status?: StatusApplication;
  hitStopMs?: number;
  preset?: HitPreset;
  multiplier?: number;
  isFinisher?: boolean;
  isClap?: boolean;
  isSlam?: boolean;
  byAlly?: boolean;
  /** Show red CRITICAL HIT pop text. */
  crit?: boolean;
  noHitStop?: boolean;
  x?: number;
  y?: number;
  ignoreIFrames?: boolean;
}

export interface HitResult {
  applied: boolean;
  damage: number;
  killed: boolean;
  staggered: boolean;
  killType?: KillType;
}

const MISS: HitResult = { applied: false, damage: 0, killed: false, staggered: false };

/** §9.3 central damage pipeline. Every source of damage goes through `hit()`. */
export class CombatSystem {
  constructor(private world: World) {}

  hit(target: Actor, h: HitInfo): HitResult {
    if (!target.isAlive()) return MISS;
    if (!isHostile(h.faction, target.faction)) return MISS;
    if (target.invulnMs > 0 && !h.ignoreIFrames) return MISS;
    const mult = (h.multiplier ?? 1) * target.damageTakenMul(h);
    const dmg = computeFinalDamage(h.amount, mult, target.armor);
    target.hp = Math.max(0, target.hp - dmg);
    target.lastAttacker = h.source ?? null;
    const heroSide = h.faction !== 'enemy';
    const isHero = target.faction === 'hero';

    // poise & stagger
    let staggered = false;
    if (!target.superArmor && target.poiseDamage(h.poise)) {
      staggered = true;
      target.stagger();
    }
    // knockback
    if (!target.superArmor && h.knockback > 0) {
      const k = 1 - target.kbResist;
      const up = h.knockUp ?? Math.min(200, h.knockback * 0.5);
      target.body.setVelocity(h.dirX * h.knockback * k, target.flying ? -up * 0.3 * k : -up * k);
    }
    if (h.status) StatusEffectSystem.apply(target, { ...h.status, sourceId: h.status.sourceId ?? h.source?.uid });

    target.hitFlash(isHero ? balance.combat.heroHitFlashMs : 80);
    const hx = h.x ?? target.cx;
    const hy = h.y ?? target.cy;
    const fx = this.world.fx;
    const heavy = dmg >= 30 || !!h.crit;
    if (SaveManager.settings.damageNumbers) {
      GameEvents.emit('damage:number', { x: target.x, y: target.body.y - 6, amount: dmg, kind: isHero ? 'hero' : heavy ? 'heavy' : 'normal' });
    }
    if (h.crit && !isHero) fx.popText(target.x, target.body.y - 26, 'CRITICAL HIT', PAL.danger, 2);
    const sparkCol = h.kind === 'lightning' ? PAL.statusCyan : h.kind === 'magic' ? PAL.ruinGlow : 0xffffff;
    fx.sparks(hx, hy, h.dirX, sparkCol, balance.fx.hitSparkCount + (heavy ? 4 : 0));
    if (!isHero && target.faction === 'enemy') fx.ichor(hx, hy, h.dirX, 4);

    // hit stop + shake
    const preset: HitPreset = isHero ? 'heroHit' : (h.preset ?? presetForHit(dmg));
    const p = balance.hitStop[preset];
    if (!h.noHitStop && (heroSide || isHero)) {
      const stop = h.hitStopMs ?? p.stopMs;
      if (stop > 0) TimeController.hitStop(stop, isHero ? 15 : 10);
      this.world.cam.shake(p.shakeAmp, p.shakeMs);
    }
    const pan = this.world.cam.panFor(target.x);
    if (isHero) AudioManager.play('hurt');
    else if (h.kind === 'arrow') AudioManager.play('arrowHit', { pan });
    else AudioManager.play(heavy ? 'hitHeavy' : 'hit', { pan });

    let killed = false;
    let killType: KillType | undefined;
    if (target.hp <= 0) {
      killed = true;
      target.dead = true;
      killType = killTypeFor(h.kind, {
        isFinisher: h.isFinisher,
        isClap: h.isClap,
        isSlam: h.isSlam,
        byAlly: h.byAlly,
        targetGrounded: target.grounded,
      });
      this.world.tokens.release(target.uid);
      target.onDeath(h, killType);
    }
    const res: HitResult = { applied: true, damage: dmg, killed, staggered, killType };
    if (!killed) target.onHurt(res, h);
    return res;
  }

  /** Hits every hostile actor whose body overlaps `r` that is not already in `already`. */
  hitArea(r: { x: number; y: number; w: number; h: number }, h: HitInfo, already?: Set<number>, filter?: (a: Actor) => boolean): Actor[] {
    const out: Actor[] = [];
    for (const a of this.world.hostilesOf(h.faction)) {
      if (already?.has(a.uid)) continue;
      if (filter && !filter(a)) continue;
      const b = a.body;
      if (b.x < r.x + r.w && b.x + b.width > r.x && b.y < r.y + r.h && b.y + b.height > r.y) {
        const res = this.hit(a, { ...h, dirX: h.dirX || (a.cx >= r.x + r.w / 2 ? 1 : -1) });
        already?.add(a.uid);
        if (res.applied) out.push(a);
      }
    }
    return out;
  }
}
