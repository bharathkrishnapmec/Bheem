import Phaser from 'phaser';
import { balance } from '@/config/balance';
import { PAL } from '@/config/palette';
import type { DamageKind, Faction, StatusApplication } from '@/core/types';
import { AudioManager } from '@/audio/AudioManager';
import type { Actor } from '@/entities/Actor';
import type { World } from '@/game/World';

export type ProjKind = 'arrow' | 'allyArrow' | 'boneArrow' | 'mireBolt' | 'darkOrb' | 'rainArrow' | 'shock';

export interface ProjSpec {
  kind: ProjKind;
  faction: Faction;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  gravity?: number;
  knockback?: number;
  poise?: number;
  pierce?: number;
  lifeMs?: number;
  source?: Actor | null;
  status?: StatusApplication;
  homing?: { target: Actor; turnRate: number };
  reflectable?: boolean;
  perfect?: boolean;
  /** Ground-hugging shockwave: max travel distance. */
  range?: number;
  w?: number;
  h?: number;
  damageKind?: DamageKind;
  isFinisher?: boolean;
}

export interface Proj extends Required<Omit<ProjSpec, 'homing' | 'status' | 'source' | 'range'>> {
  img: Phaser.GameObjects.Sprite;
  hit: Set<number>;
  stuck: number;
  alive: boolean;
  homing?: { target: Actor; turnRate: number };
  status?: StatusApplication;
  source: Actor | null;
  range: number;
  travelled: number;
}

const TEX: Record<ProjKind, string> = {
  arrow: 'arrow',
  allyArrow: 'arrow',
  boneArrow: 'boneArrow',
  mireBolt: 'mireBolt',
  darkOrb: 'darkOrb',
  rainArrow: 'rainArrow',
  shock: 'fx_shock',
};

/** Manual-kinematics projectiles (arrows, orbs, shockwaves) with geometry + actor collision. */
export class Projectiles {
  list: Proj[] = [];
  private pool: Phaser.GameObjects.Sprite[] = [];

  constructor(private world: World) {}

  spawn(s: ProjSpec): Proj {
    const img = this.pool.pop() ?? this.world.scene.add.sprite(0, 0, TEX[s.kind]);
    img.setTexture(TEX[s.kind]).setVisible(true).setActive(true).setAlpha(1).setDepth(550).setScale(1).clearTint().setAngle(0);
    img.setPosition(s.x, s.y);
    const anim = `${TEX[s.kind]}:loop`;
    if (this.world.scene.anims.exists(anim)) img.play(anim);
    else img.anims.stop();
    if (s.kind === 'shock') img.setOrigin(0.5, 1).setTint(s.faction === 'enemy' ? PAL.ruinGlow : PAL.statusCyan);
    else img.setOrigin(0.5, 0.5);
    if (s.kind === 'allyArrow') img.setTint(PAL.allyGold);
    const isArrow = s.kind === 'arrow' || s.kind === 'allyArrow' || s.kind === 'boneArrow';
    const p: Proj = {
      kind: s.kind,
      faction: s.faction,
      x: s.x,
      y: s.y,
      vx: s.vx,
      vy: s.vy,
      damage: s.damage,
      gravity: s.gravity ?? 0,
      knockback: s.knockback ?? balance.weapons.bow.knockback,
      poise: s.poise ?? balance.weapons.bow.poiseDamage,
      pierce: s.pierce ?? 0,
      lifeMs: s.lifeMs ?? 4000,
      source: s.source ?? null,
      status: s.status,
      homing: s.homing,
      reflectable: s.reflectable ?? (s.faction === 'enemy' && s.kind !== 'shock' && s.kind !== 'rainArrow'),
      perfect: s.perfect ?? false,
      range: s.range ?? Infinity,
      w: s.w ?? (isArrow ? 10 : 14),
      h: s.h ?? (isArrow ? 8 : 14),
      damageKind: s.damageKind ?? (isArrow || s.kind === 'rainArrow' ? 'arrow' : s.kind === 'shock' ? 'crush' : 'magic'),
      isFinisher: s.isFinisher ?? false,
      img,
      hit: new Set(),
      stuck: 0,
      alive: true,
      travelled: 0,
    };
    this.list.push(p);
    return p;
  }

  private kill(p: Proj, puff = false): void {
    p.alive = false;
    if (puff) this.world.fx.burst(p.x, p.y, 6, p.kind === 'mireBolt' ? [0x8cff5a, PAL.ruinViolet] : [PAL.ruinGlow, 0xffffff], { speed: 90, g: 0, life: 300 });
    p.img.anims.stop();
    p.img.setVisible(false).setActive(false);
    this.pool.push(p.img);
  }

  /** Sword deflect: flips enemy projectiles overlapping `r` to the hero faction. */
  deflect(r: { x: number; y: number; w: number; h: number }, dir: number, source: Actor): number {
    let n = 0;
    for (const p of this.list) {
      if (!p.alive || !p.reflectable || p.faction !== 'enemy' || p.stuck > 0) continue;
      if (p.x < r.x || p.x > r.x + r.w || p.y < r.y || p.y > r.y + r.h) continue;
      const sp = Math.max(420, Math.hypot(p.vx, p.vy) * 1.3);
      let ang = dir > 0 ? 0 : Math.PI;
      const src = p.source;
      if (src && src.isAlive()) ang = Math.atan2(src.cy - p.y, src.cx - p.x);
      p.vx = Math.cos(ang) * sp;
      p.vy = Math.sin(ang) * sp;
      p.gravity = 0;
      p.homing = undefined;
      p.faction = 'hero';
      p.source = source;
      p.damage = Math.round(p.damage * balance.weapons.sword.deflectDamageMultiplier * 2);
      p.hit.clear();
      p.lifeMs = 2000;
      p.img.setTint(PAL.cleanseGold);
      n++;
    }
    return n;
  }

  clearCircle(x: number, y: number, r: number, hostileTo: Faction): void {
    for (const p of this.list) {
      if (!p.alive || p.faction === hostileTo || p.stuck > 0) continue;
      if (Math.hypot(p.x - x, p.y - y) <= r) this.kill(p, true);
    }
  }

  update(dt: number): void {
    const s = dt / 1000;
    const w = this.world;
    const view = w.cam.cam.worldView;
    for (const p of this.list) {
      if (!p.alive) continue;
      p.lifeMs -= dt;
      if (p.stuck > 0) {
        p.stuck -= dt;
        if (p.stuck < 500) p.img.setAlpha(p.stuck / 500);
        if (p.stuck <= 0) this.kill(p);
        continue;
      }
      if (p.lifeMs <= 0) {
        this.kill(p, p.kind !== 'arrow');
        continue;
      }
      if (p.homing && p.homing.target.isAlive()) {
        const t = p.homing.target;
        const want = Math.atan2(t.cy - p.y, t.cx - p.x);
        const cur = Math.atan2(p.vy, p.vx);
        let d = want - cur;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const turn = Math.max(-p.homing.turnRate * s, Math.min(p.homing.turnRate * s, d));
        const sp = Math.hypot(p.vx, p.vy);
        p.vx = Math.cos(cur + turn) * sp;
        p.vy = Math.sin(cur + turn) * sp;
      }
      p.vy += p.gravity * s;
      const ox = p.x;
      const oy = p.y;
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.travelled += Math.abs(p.vx * s);
      if (p.kind === 'shock') {
        const gy = w.geo.groundBelow(p.x, p.y - 20, false, 60);
        if (gy === null || w.geo.solidAt(p.x + Math.sign(p.vx) * 8, p.y - 10) || p.travelled > p.range) {
          this.kill(p, true);
          continue;
        }
        p.y = gy;
        if (Math.random() < 0.5) w.fx.add({ x: p.x, y: p.y - 2, vx: 0, vy: -60, life: 200, c: p.faction === 'enemy' ? PAL.ruinGlow : PAL.statusCyan });
      } else {
        const hitGeo = w.geo.raycast(ox, oy, p.x, p.y);
        if (hitGeo) {
          p.x = hitGeo.x;
          p.y = hitGeo.y;
          if (p.kind === 'arrow' || p.kind === 'boneArrow' || p.kind === 'allyArrow') {
            p.stuck = balance.weapons.bow.stickMs;
            p.img.setPosition(p.x, p.y);
            AudioManager.play('arrowHit', { vol: 0.5, pan: w.cam.panFor(p.x) });
          } else this.kill(p, true);
          if (p.kind === 'rainArrow') w.fx.dust2(p.x, p.y, 3);
          continue;
        }
        if (p.x < view.x - balance.weapons.bow.offscreenDespawn || p.x > view.right + balance.weapons.bow.offscreenDespawn || p.y > w.level.height + 100) {
          this.kill(p);
          continue;
        }
      }
      p.img.setPosition(p.x, p.y);
      if (p.kind !== 'shock' && p.kind !== 'mireBolt' && p.kind !== 'darkOrb') p.img.setRotation(Math.atan2(p.vy, p.vx));
      if (p.kind === 'shock') p.img.setFlipX(p.vx < 0);
      if (p.perfect || (p.faction === 'hero' && p.reflectable === false && p.kind !== 'arrow')) w.fx.add({ x: p.x, y: p.y, life: 160, c: PAL.cleanseGold, size: 2 }, true);
      else if (p.kind === 'mireBolt' || p.kind === 'darkOrb') w.fx.add({ x: p.x, y: p.y, life: 220, c: p.kind === 'mireBolt' ? 0x8cff5a : PAL.ruinGlow }, true);

      // actor collision
      const hw = p.w / 2;
      const hh = p.h / 2;
      for (const a of w.hostilesOf(p.faction)) {
        if (p.hit.has(a.uid)) continue;
        const b = a.body;
        if (p.x + hw < b.x || p.x - hw > b.right || p.y + hh < b.y || p.y - hh > b.bottom) continue;
        p.hit.add(a.uid);
        const res = w.combat.hit(a, {
          amount: p.damage,
          kind: p.damageKind,
          faction: p.faction,
          source: p.source,
          dirX: Math.sign(p.vx) || 1,
          knockback: p.knockback,
          poise: p.poise,
          status: p.status,
          x: p.x,
          y: p.y,
          crit: p.perfect,
          preset: p.perfect ? 'heavy' : undefined,
          byAlly: p.kind === 'allyArrow',
          noHitStop: p.faction === 'enemy' && a.faction !== 'hero',
        });
        if (res.applied && res.killed && p.damageKind === 'arrow') w.deathFx.arrowDir.set(a.uid, { vx: p.vx, vy: p.vy });
        if (p.pierce > 0 && a.faction !== 'hero') {
          p.pierce--;
          continue;
        }
        this.kill(p, p.kind !== 'arrow');
        break;
      }
      if (!p.alive) continue;
      if (p.faction === 'hero') {
        for (const bn of w.banners) {
          if (p.hit.has(-bn.id) || !bn.overlapsPoint(p.x, p.y, hw)) continue;
          p.hit.add(-bn.id);
          if (bn.damage(p.damage, p.x, p.y)) this.kill(p);
          else if (!bn.destroyed) this.kill(p, true);
          break;
        }
      }
    }
    if (this.list.length > 64) this.list = this.list.filter((p) => p.alive);
  }

  clearAll(): void {
    for (const p of this.list) if (p.alive) this.kill(p);
    this.list = [];
  }
}
