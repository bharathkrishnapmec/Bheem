import Phaser from 'phaser';
import { clapDistanceFromDrag } from '@/input/TouchInput';
import { balance, type UpgradeId } from '@/config/balance';
import { PAL } from '@/config/palette';
import { GameEvents } from '@/core/GameEvents';
import { GameStore } from '@/core/GameStore';
import { TimeController } from '@/core/TimeController';
import type { Faction, KillType, WeaponId } from '@/core/types';
import { WEAPONS } from '@/core/types';
import { bowShot, chainDamage } from '@/logic/damage';
import { derivedPlayerStats } from '@/logic/economy';
import { StatusEffectSystem } from '@/systems/StatusEffectSystem';
import { emptyInput, type InputState } from '@/input/InputState';
import { AudioManager } from '@/audio/AudioManager';
import type { World } from '@/game/World';
import type { HitInfo, HitResult } from '@/systems/CombatSystem';
import { Actor } from '../Actor';

type PState = 'normal' | 'dash' | 'attack' | 'hurt' | 'dead' | 'summon' | 'locked';
type Rect = { x: number; y: number; w: number; h: number };
const DEG = Math.PI / 180;

export class Player extends Actor {
  override faction: Faction = 'hero';
  in: InputState = emptyInput();
  weapon: WeaponId = 'sword';
  st: PState = 'normal';
  private stT = 0;
  prana = 100;
  maxPrana = 100;
  pranaRegen = 3;
  ammo = 30;
  maxAmmo = 30;
  dmgMul = 1;
  /** Weapon switch requested during an action; applied as soon as the hero can act (no input is lost). */
  private weaponBuf: WeaponId | null = null;
  private weaponBufT = 0;
  private coyote = 0;
  private jumpBuf = 0;
  private atkBuf = 0;
  private airDashes = 1;
  dashCd = 0;
  private dashDir: 1 | -1 = 1;
  crouching = false;
  dropUntil = 0;
  private swapCd = 0;
  // sword
  private combo = -1;
  private comboWindow = 0;
  private atkPhase: 'startup' | 'active' | 'recovery' = 'startup';
  private atkT = 0;
  private atkKind: 'combo' | 'air' | 'crouch' = 'combo';
  private hitSet = new Set<number>();
  private bannerSet = new Set<number>();
  private queued = false;
  // bow
  charging = false;
  chargeMs = 0;
  private fireCd = 0;
  private fullNotified = false;
  private arrowRegenT = 0;
  private aimAng = 0;
  private shootT = 0;
  private shootIdx = 2;
  // staff
  staffHeld = false;
  staffMs = 0;
  private boltCd = 0;
  clapCd = 0;
  private castT = 0;
  private clap: { x: number; y: number; t: number } | null = null;
  private clapMarker: Phaser.GameObjects.Image;
  private clapChargeSfx = false;
  safe = { x: 0, y: 0 };
  private wasGrounded = true;
  private stepT = 0;
  private trailT = 0;
  private fallPeak = 0;

  constructor(world: World, x: number, y: number) {
    super(world, x, y, 'hero_sword', balance.player.bodyW, balance.player.bodyH);
    this.setDepth(400);
    this.safe = { x, y };
    this.targetWeight = balance.targeting.heroWeight;
    this.poiseMax = this.poise = 9999;
    this.clapMarker = world.scene.add.image(0, 0, 'fx_ring').setVisible(false).setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
    this.anim('idle');
  }

  applyUpgrades(u: Record<UpgradeId, number>, refill = false): void {
    const d = derivedPlayerStats(u);
    const hpGain = d.maxHp - this.maxHp;
    this.maxHp = d.maxHp;
    this.maxPrana = d.maxPrana;
    this.pranaRegen = d.pranaRegen;
    const ammoGain = d.maxAmmo - this.maxAmmo;
    this.maxAmmo = d.maxAmmo;
    this.dmgMul = d.damageMul;
    if (refill) {
      this.hp = this.maxHp;
      this.prana = this.maxPrana;
      this.ammo = this.maxAmmo;
    } else {
      if (hpGain > 0) this.hp += hpGain;
      if (ammoGain > 0) this.ammo += ammoGain;
    }
  }

  setWeapon(w: WeaponId): void {
    if (w === this.weapon || this.swapCd > 0) return;
    this.cancelCharges();
    this.weapon = w;
    this.swapCd = balance.player.weaponSwapCooldownMs;
    this.setTexture(`hero_${w}`);
    this.animBase = `hero_${w}`;
    this.anims.stop();
    this.anim('idle');
    AudioManager.play('uiMove');
  }

  cancelCharges(): void {
    this.charging = false;
    this.chargeMs = 0;
    this.staffHeld = false;
    this.staffMs = 0;
    this.clapMarker.setVisible(false);
    this.clapChargeSfx = false;
  }

  lock(on: boolean): void {
    if (this.dead) return;
    if (on) {
      this.cancelCharges();
      this.st = 'locked';
    } else if (this.st === 'locked') this.st = 'normal';
  }

  startSummon(): void {
    this.cancelCharges();
    this.st = 'summon';
    this.stT = balance.summon.castMs;
    this.body.setVelocityX(0);
  }

  heal(n: number): void {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + n);
    const d = Math.round(this.hp - before);
    if (d > 0) GameEvents.emit('damage:number', { x: this.x, y: this.body.y - 6, amount: d, kind: 'heal' });
  }

  private deny(): void {
    GameEvents.emit('prana:denied', {});
    AudioManager.play('deny');
    this.world.fx.popText(this.x, this.body.y - 8, 'No Prana', PAL.prana, 1, 600);
  }

  get onOneWay(): boolean {
    const b = this.body;
    return this.world.level.oneWays.some((r) => Math.abs(b.bottom - r.y) < 3 && b.right > r.x && b.x < r.x + r.w);
  }

  // ------------------------------------------------------------------ main update
  step(dt: number): void {
    const P = balance.player;
    const i = this.in;
    const b = this.body;
    this.tickBase(dt);
    for (const k of ['dashCd', 'swapCd', 'fireCd', 'boltCd', 'clapCd', 'comboWindow', 'jumpBuf', 'atkBuf', 'coyote', 'shootT', 'castT'] as const) {
      if (this[k] > 0) this[k] -= dt;
    }
    if (!this.dead) {
      this.prana = Math.min(this.maxPrana, this.prana + (this.pranaRegen * dt) / 1000);
      if (this.ammo < this.maxAmmo) {
        this.arrowRegenT += dt;
        if (this.arrowRegenT >= balance.weapons.bow.regenMs) {
          this.arrowRegenT = 0;
          this.ammo++;
        }
      }
    }
    this.updateClap(dt);
    if (this.dead) {
      this.anim('dead');
      b.setVelocityX(b.velocity.x * 0.9);
      return;
    }
    const grounded = this.grounded;
    if (grounded) {
      this.coyote = P.coyoteMs;
      this.airDashes = P.airDashes;
      if (!this.wasGrounded) {
        this.world.fx.dust2(this.x, this.y, this.y - this.fallPeak > 120 ? 8 : 4);
        AudioManager.play('land', { vol: 0.6 });
      }
      if (!this.overHazard()) this.safe = { x: this.x, y: this.y };
    } else if (this.wasGrounded) this.fallPeak = this.y;
    else this.fallPeak = Math.min(this.fallPeak, this.y);
    this.wasGrounded = grounded;
    if (i.jumpPressed) this.jumpBuf = P.jumpBufferMs;
    if (i.attackPressed) this.atkBuf = P.attackBufferMs;
    if (i.weaponSelect) this.weaponBuf = i.weaponSelect;
    else if (i.cycle) this.weaponBuf = WEAPONS[(WEAPONS.indexOf(this.weaponBuf ?? this.weapon) + i.cycle + 3) % 3]!;
    if (i.weaponSelect || i.cycle) this.weaponBufT = 400;
    else if (this.st === 'normal' && this.canAct() && (this.weaponBufT -= dt) <= 0) this.weaponBuf = null;

    // flicker during i-frames
    this.setAlpha(this.invulnMs > 0 && this.st !== 'dash' && Math.floor(this.invulnMs / 60) % 2 === 0 ? 0.45 : 1);

    switch (this.st) {
      case 'hurt':
        this.stT -= dt;
        b.setVelocityX(b.velocity.x * 0.92);
        this.anim('hurt');
        if (this.stT <= 0) this.st = 'normal';
        return;
      case 'summon':
        this.stT -= dt;
        b.setVelocityX(0);
        this.anim('cheer');
        if (this.stT <= 0) this.st = 'normal';
        return;
      case 'locked':
        b.setVelocityX(this.approach(b.velocity.x, 0, P.decel, dt));
        this.pickAnim(grounded);
        return;
      case 'dash':
        this.updateDash(dt);
        return;
      case 'attack':
        this.updateSword(dt, grounded);
        return;
    }
    if (!this.canAct()) {
      b.setVelocityX(this.approach(b.velocity.x, 0, P.decel, dt));
      this.anim('hurt');
      return;
    }
    // weapon switching
    if (this.weaponBuf && this.swapCd <= 0) {
      this.setWeapon(this.weaponBuf);
      this.weaponBuf = null;
    }

    // dash
    if (i.dashPressed && this.dashCd <= 0 && (grounded || this.airDashes > 0)) {
      this.startDash(i.moveX !== 0 ? (i.moveX > 0 ? 1 : -1) : this.facing);
      return;
    }
    // crouch & drop-through
    const wantCrouch = grounded && i.down && !this.charging && !this.staffHeld;
    if (wantCrouch !== this.crouching) {
      this.crouching = wantCrouch;
      this.fitBody(P.bodyW, wantCrouch ? P.crouchH : P.bodyH);
    }
    if (grounded && i.down && this.jumpBuf > 0 && this.onOneWay) {
      this.dropUntil = this.world.now + P.dropThroughMs;
      this.jumpBuf = 0;
      this.y += 4;
      b.setVelocityY(60);
    }
    // horizontal movement
    let mul = this.speedMul();
    if (this.charging) mul *= P.chargeMoveMultiplier;
    if (this.staffHeld && this.staffMs > balance.weapons.staff.boltTapMaxMs) mul *= P.castSlowMultiplier;
    const target = this.crouching ? 0 : i.moveX * P.runSpeed * mul;
    const acc = grounded ? (target !== 0 ? P.accel : P.decel) : P.accel * P.airControl;
    b.setVelocityX(this.approach(b.velocity.x, target, acc, dt));
    const aiming = (this.charging || this.staffHeld) && i.aimAngle !== null;
    if (aiming) this.face(Math.cos(i.aimAngle!));
    else if (i.moveX !== 0 && !this.charging) this.face(i.moveX);
    // jump
    if (this.jumpBuf > 0 && this.coyote > 0 && !this.crouching) {
      b.setVelocityY(P.jumpVelocity);
      this.jumpBuf = 0;
      this.coyote = 0;
      AudioManager.play('jump');
      this.world.fx.dust2(this.x, this.y, 4);
    }
    if (i.jumpReleased && b.velocity.y < 0) b.setVelocityY(b.velocity.y * P.jumpCutMultiplier);

    // weapons
    if (this.weapon === 'sword') {
      if (this.atkBuf > 0) {
        this.atkBuf = 0;
        this.startSword(!grounded ? 'air' : this.crouching ? 'crouch' : 'combo');
        return;
      }
    } else if (this.weapon === 'bow') this.updateBow(dt);
    else this.updateStaff(dt);

    // footsteps
    if (grounded && Math.abs(b.velocity.x) > 60) {
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = 280;
        AudioManager.play('step');
        if (!this.world.reduced()) this.world.fx.dust2(this.x - this.facing * 6, this.y, 1, this.facing);
      }
    }
    this.pickAnim(grounded);
  }

  private approach(v: number, t: number, acc: number, dt: number): number {
    const d = (acc * dt) / 1000;
    if (v < t) return Math.min(t, v + d);
    if (v > t) return Math.max(t, v - d);
    return v;
  }

  private pickAnim(grounded: boolean): void {
    const b = this.body;
    if (this.weapon === 'bow' && (this.charging || this.shootT > 0)) {
      this.anim(this.charging ? `aim${this.shootIdx}` : `shoot${this.shootIdx}`);
      return;
    }
    if (this.weapon === 'staff') {
      if (this.clap && this.clap.t > 0) return this.anim('clapSlam');
      if (this.staffHeld && this.staffMs >= balance.weapons.staff.boltTapMaxMs) return this.anim('clapRaise');
      if (this.castT > 0) return this.anim('cast');
    }
    if (!grounded) this.anim(b.velocity.y < 0 ? 'jump' : 'fall');
    else if (this.crouching) this.anim('crouch');
    else if (Math.abs(b.velocity.x) > 20) this.anim('run');
    else this.anim('idle');
  }

  private overHazard(): boolean {
    const hz = this.world.level.hazards ?? [];
    return hz.some((r) => this.x > r.x - 20 && this.x < r.x + r.w + 20);
  }

  // ------------------------------------------------------------------ dash
  private startDash(dir: 1 | -1): void {
    const P = balance.player;
    this.cancelCharges();
    if (this.crouching) {
      this.crouching = false;
      this.fitBody(P.bodyW, P.bodyH);
    }
    this.st = 'dash';
    this.stT = P.dashDurationMs;
    this.dashDir = dir;
    this.face(dir);
    if (!this.grounded) this.airDashes--;
    this.dashCd = P.dashCooldownMs * StatusEffectSystem.dashCooldownMultiplier(this);
    this.invulnMs = Math.max(this.invulnMs, P.dashDurationMs + 40);
    this.body.setAllowGravity(false);
    AudioManager.play('dash');
    this.world.fx.dust2(this.x, this.y, 5, dir);
    GameEvents.emit('player:dash', { cooldownMs: this.dashCd });
    this.anim('dash');
  }

  private updateDash(dt: number): void {
    const P = balance.player;
    this.stT -= dt;
    this.body.setVelocity(this.dashDir * P.dashSpeed, 0);
    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = 30;
      const g = this.scene.add.image(this.x, this.y, this.texture.key, this.frame.name).setOrigin(0.5, 1).setFlipX(this.flipX).setDepth(399);
      g.setTintFill(PAL.statusCyan).setAlpha(0.5);
      this.scene.tweens.add({ targets: g, alpha: 0, duration: 160, onComplete: () => g.destroy() });
    }
    if (this.stT <= 0) {
      this.body.setAllowGravity(true);
      this.body.setVelocityX(this.dashDir * P.runSpeed);
      this.st = 'normal';
    }
  }

  // ------------------------------------------------------------------ sword
  private startSword(kind: 'combo' | 'air' | 'crouch'): void {
    const S = balance.weapons.sword;
    this.st = 'attack';
    this.atkKind = kind;
    if (kind === 'combo') this.combo = this.comboWindow > 0 ? (this.combo + 1) % 3 : 0;
    this.atkPhase = 'startup';
    this.atkT = kind === 'combo' ? S.startupMs[this.combo]! : kind === 'air' ? S.air.startupMs : S.crouch.startupMs;
    this.hitSet.clear();
    this.bannerSet.clear();
    this.queued = false;
    const i = this.in;
    if (i.moveX !== 0) this.face(i.moveX);
    else if (i.aimSource === 'mouse' && i.aimAngle !== null) this.face(Math.cos(i.aimAngle));
    this.anim(kind === 'combo' ? `atk${this.combo + 1}` : kind === 'air' ? 'air' : 'crouchAtk', false);
    AudioManager.play(kind === 'combo' && this.combo === 2 ? 'swingHeavy' : 'swing');
  }

  private swordSpec() {
    const S = balance.weapons.sword;
    if (this.atkKind === 'air') return { ...S.air, lunge: 0 };
    if (this.atkKind === 'crouch') return { ...S.crouch, lunge: 0 };
    const c = this.combo;
    return {
      damage: S.damage[c]!,
      startupMs: S.startupMs[c]!,
      activeMs: S.activeMs[c]!,
      recoveryMs: S.recoveryMs[c]!,
      w: S.hitbox[c]!.w,
      h: S.hitbox[c]!.h,
      knockback: S.knockback[c]!,
      hitStopMs: S.hitStopMs[c]!,
      poiseDamage: S.poiseDamage[c]!,
      lunge: S.lunge[c]!,
    };
  }

  swordRect(): Rect {
    const sp = this.swordSpec();
    const off = balance.weapons.sword.hitboxOffset;
    const cx = this.x + this.facing * off;
    if (this.atkKind === 'crouch') return { x: cx - sp.w / 2, y: this.y - sp.h, w: sp.w, h: sp.h };
    if (this.atkKind === 'air') return { x: this.x + this.facing * (off - 10) - sp.w / 2, y: this.cy - sp.h / 2 + 8, w: sp.w, h: sp.h };
    return { x: cx - sp.w / 2, y: this.cy - sp.h / 2, w: sp.w, h: sp.h };
  }

  private updateSword(dt: number, grounded: boolean): void {
    const S = balance.weapons.sword;
    const P = balance.player;
    const sp = this.swordSpec();
    const b = this.body;
    this.atkT -= dt;
    if (this.atkKind === 'air') {
      b.setVelocityX(this.approach(b.velocity.x, this.in.moveX * P.runSpeed * this.speedMul(), P.accel * P.airControl, dt));
    } else if (this.atkPhase !== 'active') b.setVelocityX(this.approach(b.velocity.x, 0, P.decel * 1.5, dt));
    if (this.in.attackPressed && this.atkPhase !== 'startup') this.queued = true;
    if (this.in.dashPressed && this.atkPhase === 'recovery' && this.dashCd <= 0) {
      this.st = 'normal';
      this.startDash(this.in.moveX ? (this.in.moveX > 0 ? 1 : -1) : this.facing);
      return;
    }
    if (this.atkPhase === 'startup' && this.atkT <= 0) {
      this.atkPhase = 'active';
      this.atkT = sp.activeMs;
      if (sp.lunge > 0 && grounded) b.setVelocityX(this.facing * (sp.lunge / (sp.activeMs / 1000)) * 0.6);
      const r = this.swordRect();
      const fin = this.atkKind === 'combo' && this.combo === 2;
      this.world.fx.slash(r.x + r.w / 2, r.y + r.h / 2, this.facing, fin ? 1.25 : 1, fin ? PAL.cleanseGold : 0xffffff, this.atkKind === 'crouch' ? 20 : this.combo === 1 ? 180 : 0);
    }
    if (this.atkPhase === 'active') {
      this.swordHit(sp);
      if (this.atkT <= 0) {
        this.atkPhase = 'recovery';
        this.atkT = sp.recoveryMs;
      }
    } else if (this.atkPhase === 'recovery') {
      if (this.queued && this.atkKind === 'combo' && this.combo < 2) {
        this.comboWindow = 1;
        this.startSword('combo');
        return;
      }
      if (this.atkKind === 'air' && grounded) this.atkT = Math.min(this.atkT, 40);
      if (this.atkT <= 0) {
        this.st = 'normal';
        this.comboWindow = this.atkKind === 'combo' && this.combo < 2 ? S.chainWindowMs : 0;
        if (this.queued && this.atkKind === 'combo' && this.combo >= 2) this.atkBuf = 0;
      }
    }
  }

  private swordHit(sp: ReturnType<Player['swordSpec']>): void {
    const w = this.world;
    const r = this.swordRect();
    const fin = this.atkKind === 'combo' && this.combo === 2;
    const hits = w.combat.hitArea(
      r,
      {
        amount: sp.damage * this.dmgMul,
        kind: 'melee',
        faction: 'hero',
        source: this,
        dirX: this.facing,
        knockback: sp.knockback,
        poise: sp.poiseDamage,
        hitStopMs: sp.hitStopMs,
        isFinisher: fin,
        preset: fin ? 'heavy' : undefined,
      },
      this.hitSet,
    );
    if (hits.length) {
      this.prana = Math.min(this.maxPrana, this.prana + balance.player.pranaPerSwordHit * hits.length);
      if (this.atkKind === 'air' && hits.some((a) => a.cy > this.cy)) this.body.setVelocityY(-balance.weapons.sword.air.pogo);
    }
    const n = w.proj.deflect(r, this.facing, this);
    if (n > 0) {
      TimeController.hitStop(balance.weapons.sword.deflectHitStopMs, 12);
      w.fx.popText(r.x + r.w / 2, r.y, 'DEFLECT!', PAL.cleanseGold, 2, 600);
      w.fx.sparks(r.x + r.w / 2, r.y + r.h / 2, this.facing, PAL.cleanseGold, 10);
      AudioManager.play('deflect');
    }
    for (const bn of w.banners) {
      if (this.bannerSet.has(bn.id) || !bn.overlapsRect(r)) continue;
      this.bannerSet.add(bn.id);
      bn.damage(sp.damage * this.dmgMul, r.x + r.w / 2, r.y + r.h / 2);
    }
  }

  // ------------------------------------------------------------------ bow
  private computeAim(): number {
    const i = this.in;
    if (i.aimAngle !== null) return i.aimAngle;
    const range = balance.input.aimAssistRange;
    let best: Actor | null = null;
    let bd: number = range;
    for (const e of this.world.hostilesOf('hero')) {
      const dx = e.cx - this.x;
      if (Math.sign(dx) !== this.facing || Math.abs(e.cy - this.cy) > 220) continue;
      const d = Math.hypot(dx, e.cy - this.cy);
      if (d < bd && this.world.geo.lineOfSight(this.x, this.cy - 8, e.cx, e.cy)) {
        bd = d;
        best = e;
      }
    }
    if (best) return Math.atan2(best.cy - (this.cy - 8), best.cx - this.x);
    return this.facing > 0 ? 0 : Math.PI;
  }

  private relAngle(a: number): number {
    let rel = this.facing > 0 ? a : Math.PI - a;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    return rel;
  }

  private updateBow(dt: number): void {
    const B = balance.weapons.bow;
    const i = this.in;
    this.aimAng = this.computeAim();
    const rel = Math.max(-80 * DEG, Math.min(80 * DEG, this.relAngle(this.aimAng)));
    this.shootIdx = Math.max(0, Math.min(4, Math.round((rel / DEG + 60) / 30)));
    if (i.attackPressed && !this.charging && this.fireCd <= 0) {
      if (this.ammo <= 0) {
        AudioManager.play('deny');
        this.world.fx.popText(this.x, this.body.y - 8, 'No arrows', PAL.danger, 1, 600);
      } else {
        this.charging = true;
        this.chargeMs = 0;
        this.fullNotified = false;
        AudioManager.play('bowDraw');
      }
    }
    if (!this.charging) return;
    this.chargeMs += dt;
    if (this.chargeMs >= B.fullChargeMs && !this.fullNotified) {
      this.fullNotified = true;
      AudioManager.play('bowFull');
      this.world.fx.ring(this.x + this.facing * 14, this.cy - 6, PAL.cleanseGold, 1.2, 250);
    }
    if (this.fullNotified && Math.random() < 0.3) this.world.fx.add({ x: this.x + this.facing * 16 + (Math.random() - 0.5) * 10, y: this.cy - 6, vy: -40, life: 300, c: PAL.cleanseGold }, true);
    if (!i.attackHeld) this.fireArrow(rel);
  }

  private fireArrow(rel: number): void {
    const B = balance.weapons.bow;
    const shot = bowShot(this.chargeMs);
    this.charging = false;
    this.ammo--;
    this.fireCd = B.fireCooldownMs;
    this.shootT = 200;
    const ang = this.facing > 0 ? rel : Math.PI - rel;
    const ox = this.x + Math.cos(ang) * 18;
    const oy = this.cy - 8 + Math.sin(ang) * 18;
    this.world.proj.spawn({
      kind: 'arrow',
      faction: 'hero',
      x: ox,
      y: oy,
      vx: Math.cos(ang) * shot.speed,
      vy: Math.sin(ang) * shot.speed,
      gravity: B.arrowGravity * shot.gravityScale,
      damage: shot.damage * this.dmgMul,
      pierce: shot.pierce,
      perfect: shot.perfect,
      source: this,
      lifeMs: 3000,
      knockback: shot.perfect ? 260 : B.knockback,
      poise: shot.perfect ? 20 : B.poiseDamage,
    });
    AudioManager.play('bowShoot');
    if (shot.perfect) this.world.cam.shake(2, 80);
  }

  // ------------------------------------------------------------------ staff
  private clapTarget(): { x: number; y: number } {
    const S = balance.weapons.staff;
    const i = this.in;
    let tx: number;
    if (i.aimSource === 'mouse') tx = i.aimWorldX;
    else if (i.aimSource === 'touch' && i.aimAngle !== null) tx = this.x + Math.sign(Math.cos(i.aimAngle) || this.facing) * clapDistanceFromDrag(i.aimDist);
    else {
      let best: Actor | null = null;
      let bd: number = S.clapMaxDistance;
      for (const e of this.world.hostilesOf('hero')) {
        const dx = e.x - this.x;
        if (Math.sign(dx) !== this.facing && Math.abs(dx) > 30) continue;
        if (Math.abs(dx) < bd && Math.abs(e.y - this.y) < 200) {
          bd = Math.abs(dx);
          best = e;
        }
      }
      tx = best ? best.x : this.x + this.facing * 200;
      if (i.aimSource === 'stick' && i.aimAngle !== null) tx = this.x + Math.cos(i.aimAngle) * 300;
    }
    tx = Phaser.Math.Clamp(tx, this.x - S.clapMaxDistance, this.x + S.clapMaxDistance);
    const gy = this.world.geo.groundBelow(tx, this.y - 160, true, 500) ?? this.y;
    return { x: tx, y: gy };
  }

  private updateStaff(dt: number): void {
    const S = balance.weapons.staff;
    const i = this.in;
    if (i.attackPressed && !this.staffHeld) {
      this.staffHeld = true;
      this.staffMs = 0;
    }
    if (!this.staffHeld) return;
    this.staffMs += dt;
    if (this.staffMs >= S.boltTapMaxMs) {
      const t = this.clapTarget();
      const ready = this.staffMs >= S.clapHoldMs;
      this.clapMarker.setVisible(true).setPosition(t.x, t.y - 4).setScale(ready ? 3.3 : 1 + (2.3 * (this.staffMs - S.boltTapMaxMs)) / (S.clapHoldMs - S.boltTapMaxMs), 0.9);
      this.clapMarker.setTint(ready ? PAL.cleanseGold : PAL.statusCyan).setAlpha(ready ? 0.6 + Math.sin(this.world.now / 60) * 0.3 : 0.5);
      if (!this.clapChargeSfx) {
        this.clapChargeSfx = true;
        AudioManager.play('clapCharge');
      }
      if (Math.random() < 0.4) this.world.fx.add({ x: this.x + this.facing * 4 + (Math.random() - 0.5) * 6, y: this.body.y - 10, vy: -50, vx: (Math.random() - 0.5) * 40, life: 260, c: PAL.statusCyan }, true);
    }
    if (!i.attackHeld) {
      const ms = this.staffMs;
      const target = this.clapTarget();
      this.cancelCharges();
      if (ms < S.boltTapMaxMs) this.castBolt();
      else if (ms >= S.clapHoldMs) this.castClap(target);
    }
  }

  private castBolt(): void {
    const S = balance.weapons.staff;
    const w = this.world;
    if (this.boltCd > 0) return;
    if (this.prana < S.boltCost) return this.deny();
    this.prana -= S.boltCost;
    this.boltCd = S.boltCooldownMs;
    this.castT = 180;
    this.anim('cast', false);
    AudioManager.play('bolt');
    const aim = this.in.aimAngle ?? (this.facing > 0 ? 0 : Math.PI);
    if (this.in.aimAngle !== null) this.face(Math.cos(aim));
    const ox = this.x + this.facing * 22;
    const oy = this.body.y + 8;
    // pick primary target: best alignment with aim within range and LOS
    let best: Actor | null = null;
    let bs = Infinity;
    for (const e of w.hostilesOf('hero')) {
      const dx = e.cx - ox;
      const dy = e.cy - oy;
      const d = Math.hypot(dx, dy);
      if (d > S.boltRange) continue;
      let da = Math.abs(Math.atan2(dy, dx) - aim);
      if (da > Math.PI) da = Math.PI * 2 - da;
      if (da > 1.0) continue;
      if (!w.geo.lineOfSight(ox, oy, e.cx, e.cy)) continue;
      const score = d * (1 + da * 1.5);
      if (score < bs) {
        bs = score;
        best = e;
      }
    }
    if (!best) {
      const bn = w.banners.find((bn) => !bn.destroyed && Math.abs(bn.x - this.x) < S.boltRange && Math.sign(bn.x - this.x) === this.facing);
      if (bn) {
        w.fx.lightning(ox, oy, bn.x, bn.y - 60);
        bn.damage(S.boltDamage, bn.x, bn.y - 60);
        return;
      }
      const ex = ox + Math.cos(aim) * S.boltRange * 0.6;
      const ey = oy + Math.sin(aim) * S.boltRange * 0.6;
      const hit = w.geo.raycast(ox, oy, ex, ey);
      w.fx.lightning(ox, oy, hit ? hit.x : ex, hit ? hit.y : ey);
      return;
    }
    const chainRange = S.boltChainRange * (w.districts.weather() === 'rain' ? 1 + S.rainChainBonus : 1);
    const hitIds = new Set<number>();
    let from = { x: ox, y: oy };
    let cur: Actor | null = best;
    for (let n = 0; cur && n <= S.boltChains; n++) {
      w.fx.lightning(from.x, from.y, cur.cx, cur.cy, S.boltVisualMs, n === 0 ? 3 : 2);
      hitIds.add(cur.uid);
      w.combat.hit(cur, {
        amount: chainDamage(S.boltDamage, n),
        kind: 'lightning',
        faction: 'hero',
        source: this,
        dirX: Math.sign(cur.cx - from.x) || this.facing,
        knockback: 60,
        poise: S.boltPoise,
        status: { id: 'shocked', durationMs: S.boltShockMs },
        noHitStop: n > 0,
      });
      from = { x: cur.cx, y: cur.cy };
      let next: Actor | null = null;
      let nd = chainRange;
      for (const e of w.hostilesOf('hero')) {
        if (hitIds.has(e.uid)) continue;
        const d = Math.hypot(e.cx - from.x, e.cy - from.y);
        if (d < nd) {
          nd = d;
          next = e;
        }
      }
      cur = next;
    }
  }

  private castClap(t: { x: number; y: number }): void {
    const S = balance.weapons.staff;
    if (this.clapCd > 0 || this.clap) return;
    if (this.prana < S.clapCost) return this.deny();
    this.prana -= S.clapCost;
    this.clapCd = S.clapCooldownMs;
    this.clap = { x: t.x, y: t.y, t: S.clapTelegraphMs };
    this.world.fx.groundRing(t.x, t.y, PAL.statusCyan, S.clapRadius * 2, S.clapTelegraphMs);
    this.world.fx.lightning(this.x, this.body.y, this.x + (Math.random() - 0.5) * 30, this.body.y - 90, 150, 2);
    AudioManager.play('glyph', { vol: 0.6 });
  }

  private updateClap(dt: number): void {
    if (!this.clap) return;
    const c = this.clap;
    const S = balance.weapons.staff;
    const w = this.world;
    c.t -= dt;
    if (c.t > 0) {
      if (Math.random() < 0.6) w.fx.add({ x: c.x + (Math.random() - 0.5) * S.clapRadius * 2, y: c.y - 2, vy: -80, life: 250, c: PAL.statusCyan }, true);
      return;
    }
    this.clap = null;
    w.fx.lightning(c.x + (Math.random() - 0.5) * 20, c.y - 560, c.x, c.y, 220, 7, PAL.statusCyan);
    w.fx.lightning(c.x - 40, c.y - 400, c.x - 20, c.y, 160, 3);
    w.fx.lightning(c.x + 40, c.y - 400, c.x + 25, c.y, 160, 3);
    w.fx.ring(c.x, c.y - 20, PAL.statusCyan, 7, 380);
    w.fx.groundRing(c.x, c.y, 0xffffff, S.clapRadius * 2.6, 300);
    w.fx.burst(c.x, c.y - 4, 30, [0xffffff, PAL.statusCyan, PAL.prana], { speed: 320, angle: -Math.PI / 2, spread: 2.6, g: 700, life: 600 });
    w.fx.decal('fx_scorch', c.x, c.y + 2, balance.deathFx.scorchMs);
    w.fx.flash(0xdff8ff, 0.5, 90);
    AudioManager.play('thunder');
    const cy = c.y - 30;
    for (const e of w.hostilesOf('hero')) {
      const dx = e.cx - c.x;
      const dy = e.cy - cy;
      if (Math.hypot(dx, dy * 0.8) > S.clapRadius + e.bodyW / 2) continue;
      w.combat.hit(e, {
        amount: S.clapDamage,
        kind: 'lightning',
        faction: 'hero',
        source: this,
        dirX: Math.sign(dx) || 1,
        knockback: 80,
        knockUp: -S.clapPopVelocity,
        poise: S.clapPoise,
        status: { id: 'shocked', durationMs: balance.status.shocked.clapMs },
        isClap: true,
        preset: 'thunderclap',
        crit: true,
      });
    }
    for (const bn of w.banners) if (Math.abs(bn.x - c.x) < S.clapRadius + 20) bn.damage(S.clapDamage, bn.x, c.y - 40);
    w.proj.clearCircle(c.x, cy, S.clapRadius + 20, 'hero');
    w.cam.shake(balance.hitStop.thunderclap.shakeAmp, balance.hitStop.thunderclap.shakeMs);
    TimeController.hitStop(balance.hitStop.thunderclap.stopMs, 12);
  }

  // ------------------------------------------------------------------ damage
  override onHurt(_res: HitResult, _hit: HitInfo): void {
    this.invulnMs = balance.player.hurtIFramesMs;
    if (this.st === 'locked') return;
    this.cancelCharges();
    this.st = 'hurt';
    this.stT = balance.player.hurtFlinchMs;
    GameEvents.emit('player:hurt', { amount: _res.damage });
  }

  onDeath(_hit: HitInfo, _k: KillType): void {
    this.st = 'dead';
    this.cancelCharges();
    this.anim('dead');
    this.body.setVelocity(_hit.dirX * 120, -200);
    GameEvents.emit('player:died', {});
  }

  /** Teleport to last safe ground after falling into a pit. */
  respawnSafe(): void {
    this.setPosition(this.safe.x, this.safe.y - 2);
    this.body.reset(this.safe.x, this.safe.y - 2);
    this.body.setVelocity(0, 0);
    this.invulnMs = 1000;
    this.cancelCharges();
    this.st = 'normal';
  }

  syncStore(): void {
    GameStore.setHp(Math.ceil(this.hp), this.maxHp);
    GameStore.setPrana(this.prana, this.maxPrana);
    GameStore.setAmmo(this.ammo, this.maxAmmo);
    GameStore.setWeapon(this.weapon);
    GameStore.setStatuses(StatusEffectSystem.list(this));
  }

  get chargeFrac(): number {
    if (this.weapon === 'bow' && this.charging) return Math.min(1, this.chargeMs / balance.weapons.bow.fullChargeMs);
    if (this.weapon === 'staff' && this.staffHeld && this.staffMs >= balance.weapons.staff.boltTapMaxMs) return Math.min(1, this.staffMs / balance.weapons.staff.clapHoldMs);
    return 0;
  }

  override destroy(fromScene?: boolean): void {
    this.clapMarker?.destroy();
    super.destroy(fromScene);
  }
}
