import { balance } from '@/config/balance';
import { PAL } from '@/config/palette';
import type { EnemyType } from '@/core/types';
import { AudioManager } from '@/audio/AudioManager';
import type { World } from '@/game/World';
import type { HitInfo } from '@/systems/CombatSystem';
import { StatusEffectSystem } from '@/systems/StatusEffectSystem';
import { Enemy, type EnemyOpts } from './Enemy';

const E = balance.enemies;

// ------------------------------------------------------------------ Raider
export class Raider extends Enemy {
  override readonly type = 'raider' as const;
  private lunge = false;
  constructor(w: World, x: number, y: number, o?: EnemyOpts) {
    super(w, x, y, 'raider', 28, 50, o);
    this.setStats(E.raider);
  }
  protected think(): void {
    const R = E.raider;
    const t = this.target;
    if (!t) return this.patrol();
    const adx = Math.abs(this.dx());
    switch (this.ai) {
      case 'tele':
        this.halt();
        this.faceTarget();
        this.anim('windup');
        if (this.stT <= 0) {
          if (this.lunge) {
            this.go('lunge', R.lunge.durationMs);
            this.anim('lunge');
          } else {
            this.go('atk', R.cleave.activeMs);
            this.anim('attack');
            AudioManager.play('swing', { pan: this.world.cam.panFor(this.x), vol: 0.6 });
          }
        }
        return;
      case 'atk':
        this.halt();
        this.melee(R.cleave.w, R.cleave.h, R.cleave.damage, R.cleave.knockback);
        if (this.stT <= 0) this.go('recover', R.recoverMs);
        return;
      case 'lunge':
        this.body.setVelocityX(this.facing * R.lunge.speed * 1.6);
        this.melee(40, 50, R.lunge.damage, R.lunge.knockback);
        if (this.stT <= 0) this.go('recover', R.recoverMs);
        return;
      case 'recover':
        this.halt();
        if (this.stT < R.recoverMs - 200) this.anim('idle');
        if (this.stT <= 0) {
          this.releaseToken();
          this.go('chase');
        }
        return;
    }
    // chase / circle
    const inRange = adx <= R.attackRange && Math.abs(this.dy()) < 60;
    const lungeRange = adx > 100 && adx < 200 && this.attackN % R.lungeEvery === R.lungeEvery - 1 && Math.abs(this.dy()) < 40;
    if ((inRange || lungeRange) && this.cd <= 0 && this.requestToken()) {
      this.attackN++;
      this.lunge = !inRange;
      this.cd = 300;
      const ms = this.lunge ? R.lunge.telegraphMs : R.telegraphMs;
      this.go('tele', ms);
      this.telegraph(ms);
      return;
    }
    // circling raiders step in as soon as an attack token frees up
    const hasToken = this.world.tokens.has(this.uid) || t !== this.player || (adx <= balance.enemyAI.circleMax && this.cd <= 0 && this.requestToken());
    if (hasToken || adx > balance.enemyAI.circleMax) this.moveToward(t.x, 1, R.attackRange - 16);
    else if (adx < balance.enemyAI.circleMin) this.moveDir(-Math.sign(this.dx()), 0.6);
    else {
      this.halt();
      this.faceTarget();
    }
    this.anim(Math.abs(this.body.velocity.x) > 10 ? 'walk' : 'idle');
  }
}

// ------------------------------------------------------------------ Bone Archer
export class BoneArcher extends Enemy {
  override readonly type = 'boneArcher' as const;
  private volley = 0;
  constructor(w: World, x: number, y: number, o?: EnemyOpts) {
    super(w, x, y, 'boneArcher', 26, 50, o);
    this.setStats(E.boneArcher);
    this.cd = 800 + Math.random() * 800;
  }
  protected think(): void {
    const A = E.boneArcher;
    const t = this.target;
    if (!t) return this.patrol();
    const adx = Math.abs(this.dx());
    const up = this.dy() < -60;
    if (this.ai === 'tele') {
      this.halt();
      this.faceTarget();
      this.anim(up ? 'drawUp' : 'draw');
      if (this.stT <= 0) this.shoot();
      return;
    }
    if (this.ai === 'volley') {
      this.halt();
      if (this.stT <= 0) this.shoot();
      return;
    }
    if (this.ai === 'recover') {
      this.halt();
      this.anim('idle');
      if (this.stT <= 0) this.go('chase');
      return;
    }
    const los = this.world.geo.lineOfSight(this.x, this.cy - 10, t.cx, t.cy);
    if (this.cd <= 0 && adx <= A.keepMax + 100 && los) {
      this.volley = this.hp / this.maxHp < A.volleyHpFraction ? 3 : 1;
      this.go('tele', A.telegraphMs);
      this.telegraph(A.telegraphMs);
      return;
    }
    if (adx < A.backOff) this.moveDir(-Math.sign(this.dx()), 1);
    else if (adx > A.keepMax) this.moveToward(t.x, 1);
    else if (adx < A.keepMin) this.moveDir(-Math.sign(this.dx()), 0.7);
    else {
      this.halt();
      this.faceTarget();
    }
    this.anim(Math.abs(this.body.velocity.x) > 10 ? 'walk' : 'idle');
  }
  private shoot(): void {
    const A = E.boneArcher;
    const t = this.target;
    this.faceTarget();
    if (t) {
      const ox = this.x + this.facing * 16;
      const oy = this.cy - 8;
      const d = Math.hypot(t.cx - ox, t.cy - oy);
      const g = 300;
      const time = d / A.arrow.speed;
      const ang = Math.atan2(t.cy - oy - 0.5 * g * time * time, t.cx - ox);
      this.world.proj.spawn({
        kind: 'boneArrow',
        faction: 'enemy',
        x: ox,
        y: oy,
        vx: Math.cos(ang) * A.arrow.speed,
        vy: Math.sin(ang) * A.arrow.speed,
        gravity: g,
        damage: A.arrow.damage,
        knockback: A.arrow.knockback,
        source: this,
      });
      AudioManager.play('bowShoot', { pan: this.world.cam.panFor(this.x), vol: 0.6 });
    }
    this.anim(this.dy() < -60 ? 'drawUp' : 'draw');
    this.volley--;
    if (this.volley > 0) this.go('volley', A.volleyGapMs);
    else {
      this.cd = A.cooldownMs + (Math.random() * 2 - 1) * A.cooldownJitterMs;
      this.go('recover', 400);
    }
  }
}

// ------------------------------------------------------------------ Mire Hexer
export class MireHexer extends Enemy {
  override readonly type = 'mireHexer' as const;
  private blinkCd = 0;
  constructor(w: World, x: number, y: number, o?: EnemyOpts) {
    super(w, x, y, 'mireHexer', 26, 50, o);
    this.setStats(E.mireHexer);
    this.cd = 1500;
  }
  protected think(dt: number): void {
    const H = E.mireHexer;
    this.blinkCd -= dt;
    const t = this.target;
    if (!t) return this.patrol();
    const adx = Math.abs(this.dx());
    if (this.ai === 'cast') {
      this.halt();
      this.faceTarget();
      this.anim('cast');
      if (Math.random() < 0.4) this.world.fx.add({ x: this.x + this.facing * 14, y: this.body.y + 10, vy: -40, life: 300, c: 0x8cff5a }, true);
      if (this.stT <= 0) {
        this.world.proj.spawn({
          kind: 'mireBolt',
          faction: 'enemy',
          x: this.x + this.facing * 16,
          y: this.body.y + 12,
          vx: this.facing * H.bolt.speed,
          vy: -30,
          damage: H.bolt.damage,
          lifeMs: H.bolt.lifetimeMs,
          knockback: 40,
          poise: 0,
          homing: { target: t, turnRate: 1.3 },
          status: { id: 'slow', durationMs: balance.status.slow.durationMs, sourceId: this.uid },
          source: this,
        });
        AudioManager.play('hexCast', { pan: this.world.cam.panFor(this.x) });
        this.cd = H.cooldownMs;
        this.go('chase');
      }
      return;
    }
    if (adx < H.blinkTrigger && this.blinkCd <= 0) {
      this.blink();
      return;
    }
    if (this.cd <= 0 && adx < H.keepMax + 140) {
      this.go('cast', H.castMs);
      this.telegraph(H.castMs, PAL.ruinGlow);
      this.world.fx.glyph(this.x, this.y, H.castMs, 0x8cff5a);
      return;
    }
    if (adx > H.keepMax) this.moveToward(t.x);
    else if (adx < H.keepMin) this.moveDir(-Math.sign(this.dx()), 0.8);
    else {
      this.halt();
      this.faceTarget();
    }
    this.anim(Math.abs(this.body.velocity.x) > 10 ? 'walk' : 'idle');
  }
  private blink(): void {
    const H = E.mireHexer;
    this.blinkCd = H.blinkCooldownMs;
    const dir = -Math.sign(this.dx()) || 1;
    for (const d of [dir, -dir]) {
      const nx = this.x + d * H.blinkDistance;
      const gy = this.world.geo.groundBelow(nx, this.y - 60, true, 200);
      if (gy === null || nx < 20 || nx > this.world.level.width - 20) continue;
      this.world.fx.burst(this.x, this.cy, 14, [PAL.ruinViolet, 0x8cff5a], { speed: 120, g: -50, life: 400 });
      this.setPosition(nx, gy - 1);
      this.body.reset(nx, gy - 1);
      this.world.fx.burst(nx, this.cy, 14, [PAL.ruinViolet, 0x8cff5a], { speed: 120, g: -50, life: 400 });
      AudioManager.play('hexCast', { pan: this.world.cam.panFor(this.x) });
      return;
    }
  }
}

// ------------------------------------------------------------------ Sky Caller
export class SkyCaller extends Enemy {
  override readonly type = 'skyCaller' as const;
  private landed = 0;
  private marks: { x: number; y: number }[] = [];
  private bob = Math.random() * 6;
  constructor(w: World, x: number, y: number, o?: EnemyOpts) {
    super(w, x, y - 160, 'skyCaller', 30, 46, o);
    this.setStats(E.skyCaller);
    this.flying = true;
    this.body.setAllowGravity(false);
    this.cd = 3000;
  }
  protected override onStunned(dt: number): void {
    // Shocked: falls from the sky and lies stunned briefly.
    this.body.setAllowGravity(true);
    this.anim('hurt');
    if (this.grounded) this.landed = E.skyCaller.landingStunMs;
    void dt;
  }
  protected think(dt: number): void {
    const S = E.skyCaller;
    if (this.landed > 0) {
      this.landed -= dt;
      this.halt();
      this.anim('hurt');
      if (this.landed > 0) return;
    }
    this.body.setAllowGravity(false);
    const t = this.target ?? this.player;
    this.bob += dt / 400;
    const ground = this.world.geo.groundBelow(this.x, this.y - 10, true, 800) ?? this.world.level.groundY;
    const wantY = ground - (S.hoverMin + S.hoverMax) / 2 + Math.sin(this.bob) * 18;
    this.body.setVelocityY((wantY - this.y) * 2.5);
    if (this.ai === 'ritual') {
      this.body.setVelocityX(0);
      this.anim('cast');
      if (this.stT <= 0) this.rain();
      return;
    }
    const adx = Math.abs(t.x - this.x);
    this.face(t.x - this.x);
    let vx = 0;
    if (adx > S.keepMax) vx = Math.sign(t.x - this.x);
    else if (adx < S.keepMin) vx = -Math.sign(t.x - this.x);
    const nx = this.x + vx * 20;
    const b = this.world.districts.current()?.bounds;
    if (b && (nx < b.x0 + 40 || nx > b.x1 - 40)) vx = 0;
    this.body.setVelocityX(vx * this.speed * this.speedMul());
    this.anim('fly');
    const live = [...this.summons].filter((s) => s.isAlive()).length;
    if (this.cd <= 0 && live < S.maxSummons && this.world.cam.inView(this.x, this.y, 60)) {
      this.go('ritual', S.glyphMs);
      this.telegraph(S.glyphMs, PAL.ruinGlow);
      this.marks = [];
      const n = S.impsPerRain + S.raidersPerRain;
      for (let i = 0; i < n; i++) {
        const mx = t.x + (i - (n - 1) / 2) * (S.markSpread / 1.5) + (Math.random() - 0.5) * 40;
        const my = this.world.geo.groundBelow(mx, t.y - 120, true, 400) ?? t.y;
        this.marks.push({ x: mx, y: my });
        this.world.fx.glyph(mx, my, S.glyphMs, PAL.ruinGlow);
      }
      AudioManager.play('glyph', { pan: this.world.cam.panFor(this.x) });
    }
  }
  private rain(): void {
    const S = E.skyCaller;
    this.cd = S.cooldownMs;
    this.go('chase');
    this.marks.forEach((m, i) => {
      const type: EnemyType = i < S.impsPerRain ? 'imp' : 'raider';
      const e = this.world.spawner.spawnEnemy(type, m.x, m.y - 4, { summoner: this, required: false, aggro: true });
      if (e) {
        this.summons.add(e);
        this.world.fx.ring(m.x, m.y - 30, PAL.ruinGlow, 2, 300);
        this.world.fx.burst(m.x, m.y - 30, 12, [PAL.ruinViolet, PAL.ruinGlow], { speed: 140, life: 400 });
      }
    });
  }
}

// ------------------------------------------------------------------ Brute
export class Brute extends Enemy {
  override readonly type = 'brute' as const;
  private glow = 0;
  constructor(w: World, x: number, y: number, o?: EnemyOpts) {
    super(w, x, y, 'brute', 46, 70, o);
    this.setStats(E.brute);
    this.stunImmune = true;
    this.elite = true;
    this.coins = E.brute.coins;
    this.cd = 1000;
  }
  override get superArmor(): boolean {
    return this.ai === 'teleSlam' || this.ai === 'slam' || this.ai === 'teleCharge' || this.ai === 'charge';
  }
  override damageTakenMul(h: HitInfo): number {
    return super.damageTakenMul(h) * (this.ai === 'punish' || this.ai === 'wallStun' ? E.brute.slam.punishMul : 1);
  }
  protected think(dt: number): void {
    const B = E.brute;
    this.glow += dt;
    if (this.superArmor) {
      if (this.flashMs <= 0) this.setTint(Math.floor(this.glow / 90) % 2 ? PAL.cleanseGold : 0xfff0b0);
    } else if (this.flashMs <= 0 && this.tintTopLeft !== 0xffffff) this.restoreTint();
    const t = this.target;
    if (!t) return this.patrol();
    const adx = Math.abs(this.dx());
    switch (this.ai) {
      case 'teleSlam':
        this.halt();
        this.anim('windup');
        if (this.stT <= 0) this.slam();
        return;
      case 'teleCharge':
        this.halt();
        this.anim('chargeWind');
        if (this.stT <= 0) {
          this.go('charge', B.charge.maxMs);
          AudioManager.play('roar', { vol: 0.5, pan: this.world.cam.panFor(this.x) });
        }
        return;
      case 'charge': {
        this.anim('charge');
        this.body.setVelocityX(this.facing * B.charge.speed);
        if (Math.random() < 0.5) this.world.fx.dust2(this.x - this.facing * 20, this.y, 1, this.facing);
        this.melee(50, 64, B.charge.damage, B.charge.knockback, { poise: 30 });
        const wall = (this.facing < 0 && this.body.blocked.left) || (this.facing > 0 && this.body.blocked.right) || !this.world.geo.hasGround(this.x + this.facing * 30, this.y, 60);
        if (wall) {
          this.body.setVelocityX(0);
          this.go('wallStun', B.charge.wallStunMs);
          this.world.cam.shake(6, 200);
          this.world.fx.burst(this.x + this.facing * 24, this.cy, 12, [0xffffff, PAL.cleanseGold], { speed: 200, life: 300 });
          AudioManager.play('slam', { pan: this.world.cam.panFor(this.x) });
        } else if (this.stT <= 0) this.go('recover', B.charge.recoverMs);
        return;
      }
      case 'punish':
      case 'wallStun':
        this.halt();
        this.anim('stunned');
        if (this.stT <= 0) {
          this.releaseToken();
          this.go('chase');
        }
        return;
      case 'recover':
        this.halt();
        this.anim('idle');
        if (this.stT <= 0) {
          this.releaseToken();
          this.go('chase');
        }
        return;
    }
    if (this.cd <= 0 && adx <= B.slamRange && Math.abs(this.dy()) < 80 && this.requestToken()) {
      this.faceTarget();
      this.go('teleSlam', B.slam.telegraphMs);
      this.telegraph(B.slam.telegraphMs, PAL.cleanseGold);
      this.cd = 1600;
      return;
    }
    if (this.cd <= 0 && adx >= B.chargeMinRange && adx <= B.chargeMaxRange && Math.abs(this.dy()) < 40 && this.requestToken()) {
      this.faceTarget();
      this.go('teleCharge', B.charge.telegraphMs);
      this.telegraph(B.charge.telegraphMs);
      this.cd = 2500;
      return;
    }
    this.moveToward(t.x, 1, B.slamRange - 30);
    this.anim(Math.abs(this.body.velocity.x) > 10 ? 'walk' : 'idle');
  }
  private slam(): void {
    const B = E.brute.slam;
    const w = this.world;
    this.anim('slam');
    this.melee(B.w, B.h, B.damage, B.knockback, { isSlam: true, kind: 'crush', poise: 40 });
    const fx = this.x + this.facing * 50;
    w.fx.decal('fx_crack', fx, this.y + 2, 4000);
    w.fx.dust2(fx, this.y, 14);
    w.fx.groundRing(fx, this.y, PAL.cleanseGold, 200, 300);
    w.cam.shake(balance.hitStop.bruteSlam.shakeAmp, balance.hitStop.bruteSlam.shakeMs);
    AudioManager.play('slam', { pan: w.cam.panFor(this.x) });
    for (const d of [-1, 1]) {
      w.proj.spawn({ kind: 'shock', faction: 'enemy', x: fx + d * 20, y: this.y, vx: d * B.shockSpeed, vy: 0, damage: B.shockDamage, range: B.shockRange, knockback: 200, poise: 10, w: 24, h: B.shockHeight * 2, damageKind: 'crush', source: this });
    }
    this.go('punish', B.recoverMs);
  }
}

// ------------------------------------------------------------------ Imp
export class Imp extends Enemy {
  override readonly type = 'imp' as const;
  constructor(w: World, x: number, y: number, o?: EnemyOpts) {
    super(w, x, y, 'imp', 20, 22, o);
    this.setStats(E.imp);
    this.small = true;
    this.cd = 400 + Math.random() * 600;
  }
  protected think(): void {
    const I = E.imp;
    const t = this.target;
    if (!t) { this.patrol(); this.anim('fly'); return; }
    const adx = Math.abs(this.dx());
    switch (this.ai) {
      case 'tele':
        this.halt();
        this.faceTarget();
        this.anim('attack');
        if (this.stT <= 0) {
          this.go('leap', 900);
          this.body.setVelocity(this.facing * (I.leap + adx * 0.6), I.leapVy);
          AudioManager.play('swing', { pan: this.world.cam.panFor(this.x), vol: 0.6 });
        }
        return;
      case 'leap':
        this.anim('fly');
        this.melee(26, 26, I.damage, I.knockback, { poise: 4 });
        if ((this.grounded && this.stT < 800) || this.stT <= 0) {
          this.releaseToken();
          this.go('flee', I.fleeMs);
        }
        return;
      case 'flee':
        this.moveDir(-Math.sign(this.dx()) || 1, 0.8);
        this.anim('fly');
        if (this.stT <= 0) this.go('chase');
        return;
    }
    if (this.cd <= 0 && adx < I.attackRange && Math.abs(this.dy()) < 80 && this.grounded && this.requestToken()) {
      this.go('tele', I.telegraphMs);
      this.telegraph(I.telegraphMs);
      this.cd = 1400;
      return;
    }
    this.moveToward(t.x, 1, I.attackRange * 0.7);
    this.anim('fly');
  }
}

export function createEnemy(w: World, type: EnemyType, x: number, y: number, o?: EnemyOpts): Enemy {
  switch (type) {
    case 'raider':
      return new Raider(w, x, y, o);
    case 'boneArcher':
      return new BoneArcher(w, x, y, o);
    case 'mireHexer':
      return new MireHexer(w, x, y, o);
    case 'skyCaller':
      return new SkyCaller(w, x, y, o);
    case 'brute':
      return new Brute(w, x, y, o);
    case 'imp':
      return new Imp(w, x, y, o);
  }
}

export { StatusEffectSystem };
