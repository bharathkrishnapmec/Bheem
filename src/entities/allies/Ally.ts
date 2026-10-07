import { balance } from '@/config/balance';
import { PAL } from '@/config/palette';
import type { AllyType, Faction, KillType } from '@/core/types';
import { nearest } from '@/systems/TargetingSystem';
import { AudioManager } from '@/audio/AudioManager';
import type { World } from '@/game/World';
import type { HitInfo } from '@/systems/CombatSystem';
import { Actor } from '../Actor';

type AState = 'follow' | 'engage' | 'attack' | 'retreat';

/** Summoned soldier (§10.4–10.5): Follow → Engage → Attack → Retreat. */
export class Ally extends Actor {
  override faction: Faction = 'ally';
  st: AState = 'follow';
  private stT = 0;
  private atkCd = 0;
  private enemy: Actor | null = null;
  private hitSet = new Set<number>();
  private retargetT = 0;
  lifeMs: number;
  dmg: number;
  speed: number;
  range: number;
  attackMs: number;
  slot: number;
  expired = false;

  constructor(
    world: World,
    x: number,
    y: number,
    public kind: AllyType,
    hpMul: number,
    lifeMs: number,
    slot: number,
  ) {
    super(world, x, y, `ally_${kind}`, 26, 50);
    const d = balance.allies[kind];
    this.maxHp = this.hp = Math.round(d.hp * hpMul);
    this.dmg = d.damage;
    this.speed = d.speed;
    this.range = d.range;
    this.attackMs = d.attackMs;
    this.targetWeight = d.weight;
    this.lifeMs = lifeMs;
    this.slot = slot;
    this.poiseMax = this.poise = kind === 'shieldbearer' ? 60 : 25;
    this.armor = kind === 'shieldbearer' ? 0.3 : kind === 'captain' ? 0.15 : 0;
    this.kbResist = kind === 'shieldbearer' ? 0.6 : 0.2;
    this.setDepth(380);
    this.invulnMs = 400;
    this.atkCd = 300 + slot * 150;
    this.anim('idle');
  }

  private auraMul(): number {
    for (const a of this.world.allies) if (a !== this && a.kind === 'captain' && a.isAlive() && Math.abs(a.x - this.x) < 220) return 1 + balance.summon.captainAura;
    return 1;
  }

  step(dt: number): void {
    const A = balance.allies;
    this.tickBase(dt);
    if (this.dead) return;
    this.lifeMs -= dt;
    this.stT -= dt;
    this.atkCd -= dt;
    this.retargetT -= dt;
    if (this.lifeMs <= 0) {
      this.expire();
      return;
    }
    if (this.lifeMs < 3000) this.setAlpha(Math.floor(this.lifeMs / 120) % 2 ? 0.6 : 1);
    const p = this.world.player;
    // leash: teleport back if too far from hero
    if (Math.abs(this.x - p.x) > A.leashRange || this.y > this.world.level.height) {
      const nx = p.x - p.facing * (40 + this.slot * 22);
      this.world.fx.burst(this.x, this.cy, 8, [PAL.allyGold, 0xffffff], { speed: 100, life: 300 });
      this.setPosition(nx, p.y - 2);
      this.body.reset(nx, p.y - 2);
      this.world.fx.burst(nx, p.cy, 8, [PAL.allyGold, 0xffffff], { speed: 100, life: 300 });
    }
    if (!this.canAct()) {
      this.body.setVelocityX(this.body.velocity.x * 0.9);
      this.anim('hurt');
      return;
    }
    if (this.retargetT <= 0 || !this.enemy?.isAlive()) {
      this.retargetT = 300;
      this.enemy = nearest(this.x, this.y, this.world.hostilesOf('ally'), A.engageRange * (this.kind === 'archer' ? 1.4 : 1), (e) => Math.abs(e.x - p.x) < A.engageHeroRange);
    }
    if (this.hp / this.maxHp < 0.3 && this.kind !== 'shieldbearer') this.st = 'retreat';
    else if (this.st !== 'attack') this.st = this.enemy ? 'engage' : 'follow';

    switch (this.st) {
      case 'follow': {
        const side = p.facing;
        const gx = p.x - side * (36 + this.slot * 26);
        const d = gx - this.x;
        if (Math.abs(d) > 24) this.move(Math.sign(d), Math.abs(d) > A.followRange ? 1.25 : 0.8);
        else {
          this.halt();
          this.face(p.x - this.x || side);
        }
        if (this.grounded && p.grounded && p.y < this.y - 40 && Math.abs(p.x - this.x) < 140) this.body.setVelocityY(A.jumpVelocity);
        break;
      }
      case 'retreat': {
        const gx = p.x - p.facing * 60;
        if (Math.abs(gx - this.x) > 20) this.move(Math.sign(gx - this.x), 1.1);
        else this.halt();
        if (this.enemy && this.kind === 'archer') this.tryAttack();
        break;
      }
      case 'engage': {
        const e = this.enemy!;
        const dx = e.x - this.x;
        const adx = Math.abs(dx);
        if (this.kind === 'archer') {
          const def = A.archer;
          if (adx < def.fleeRange) this.move(-Math.sign(dx), 1);
          else if (adx > def.keepMax) this.move(Math.sign(dx), 1);
          else if (adx < def.keepMin) this.move(-Math.sign(dx), 0.6);
          else {
            this.halt();
            this.face(dx);
          }
          this.tryAttack();
        } else {
          if (adx > this.range - 10) this.move(Math.sign(dx), 1);
          else {
            this.halt();
            this.face(dx);
            this.tryAttack();
          }
        }
        break;
      }
      case 'attack': {
        this.halt();
        if (this.stT <= 0) {
          this.doAttack();
          this.st = 'engage';
        }
        break;
      }
    }
    if (this.st !== 'attack') this.anim(Math.abs(this.body.velocity.x) > 15 ? 'walk' : 'idle');
  }

  private move(dir: number, mul: number): void {
    this.face(dir);
    const b = this.body;
    if (this.grounded && ((dir < 0 && b.blocked.left) || (dir > 0 && b.blocked.right))) b.setVelocityY(balance.allies.jumpVelocity);
    if (this.grounded && !this.world.geo.hasGround(this.x + dir * 20, this.y, 200)) {
      b.setVelocityX(0);
      return;
    }
    b.setVelocityX(dir * this.speed * mul * this.speedMul());
  }

  private halt(): void {
    this.body.setVelocityX(this.body.velocity.x * 0.75);
  }

  private tryAttack(): void {
    if (this.atkCd > 0 || !this.enemy) return;
    if (this.kind === 'archer' && Math.abs(this.enemy.x - this.x) > balance.allies.archer.range) return;
    this.atkCd = this.attackMs;
    this.st = 'attack';
    this.stT = 180;
    this.face(this.enemy.x - this.x);
    this.anim('attack', false);
  }

  private doAttack(): void {
    const A = balance.allies;
    const dmg = this.dmg * this.auraMul();
    if (this.kind === 'archer') {
      const e = this.enemy;
      if (!e || !e.isAlive()) return;
      const ox = this.x + this.facing * 14;
      const oy = this.cy - 8;
      const ang = Math.atan2(e.cy - oy, e.cx - ox);
      this.world.proj.spawn({
        kind: 'allyArrow',
        faction: 'ally',
        x: ox,
        y: oy,
        vx: Math.cos(ang) * A.archer.arrowSpeed,
        vy: Math.sin(ang) * A.archer.arrowSpeed,
        gravity: 120,
        damage: dmg,
        knockback: 60,
        poise: A.poiseDamage,
        source: this,
      });
      AudioManager.play('bowShoot', { vol: 0.35, pan: this.world.cam.panFor(this.x) });
      return;
    }
    this.hitSet.clear();
    const w = this.range + 20;
    const r = { x: this.x + (this.facing > 0 ? 0 : -w), y: this.body.y, w, h: this.body.height };
    const hits = this.world.combat.hitArea(
      r,
      { amount: dmg, kind: 'melee', faction: 'ally', source: this, dirX: this.facing, knockback: A.knockback, poise: A.poiseDamage, guardPoise: balance.guard.poise.soldier, byAlly: true, noHitStop: true },
      this.hitSet,
    );
    if (hits.length) AudioManager.play('hit', { vol: 0.35, pan: this.world.cam.panFor(this.x) });
  }

  expire(): void {
    if (this.dead) return;
    this.dead = true;
    this.expired = true;
    this.body.enable = false;
    this.world.fx.dissolve(this, 600, { tint: PAL.allyGold, edge: 0xffffff, drift: 80 });
    this.world.scene.time.delayedCall(700, () => this.destroy());
  }

  onDeath(_hit: HitInfo, _k: KillType): void {
    this.body.setVelocity(_hit.dirX * 120, -160);
    this.world.scene.time.delayedCall(250, () => {
      if (!this.active) return;
      this.body.enable = false;
      this.world.fx.dissolve(this, 600, { edge: PAL.allyGold });
      this.world.scene.time.delayedCall(700, () => this.destroy());
    });
  }
}
