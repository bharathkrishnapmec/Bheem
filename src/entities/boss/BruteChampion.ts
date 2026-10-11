import Phaser from 'phaser';
import { balance } from '@/config/balance';
import { PAL } from '@/config/palette';
import { STR } from '@/config/strings';
import { GameEvents } from '@/core/GameEvents';
import { GameStore } from '@/core/GameStore';
import type { KillType } from '@/core/types';
import { AudioManager } from '@/audio/AudioManager';
import { summonDue, telegraphMs, type BossPhase } from '@/logic/boss';
import type { Enemy } from '@/entities/enemies/Enemy';
import type { Player } from '@/entities/player/Player';
import type { World } from '@/game/World';
import type { HitInfo } from '@/systems/CombatSystem';
import { BossBase } from './BossBase';

const B = balance.bruteChampion;
const A = B.attacks;
export type BruteAttackId = keyof typeof A;
type BState = 'intro' | 'idle' | 'tele' | 'act' | 'recover' | 'transition' | 'stagger' | 'wallStun' | 'roar' | 'dead';
const BERSERK = 0xff6a4a;

/** Brute Champion — v3 two-phase mini-boss (Boss Buff v3 §B7). */
export class BruteChampion extends BossBase {
  readonly displayName = STR.bruteChampion.name;
  readonly displayTitle = STR.bruteChampion.title;
  st: BState = 'intro';
  attack: BruteAttackId = 'slam';
  /** Attacks chosen since Berserk began (every third one roars and summons). */
  berserkCount = 0;
  readonly minions = new Set<Enemy>();
  private stT = 0;
  private subT = 0;
  private sub = 0;
  private glowT = 0;
  private hitDone = false;
  private chargesLeft = 0;
  private wavesLeft = 0;
  private waveX = 0;
  private last: BruteAttackId | null = null;

  constructor(world: World, x: number, y: number) {
    super(world, x, y, 'brute', B.bodyW, B.bodyH, 'brute');
    this.setDepth(300);
    this.face(-1);
    this.invulnMs = 1e9;
    this.anim('idle');
  }

  override get superArmor(): boolean {
    return true;
  }
  get berserk(): boolean {
    return this.phase >= 2;
  }
  get impCount(): number {
    return [...this.minions].filter((m) => m.isAlive()).length;
  }
  private get p(): Player {
    return this.world.player;
  }
  private go(s: BState, ms: number): void {
    this.st = s;
    this.stT = ms;
  }

  override beginFight(): void {
    super.beginFight();
    this.go('idle', 900);
  }

  protected onGuardBroken(): void {
    if (this.st === 'transition' || this.st === 'dead' || this.st === 'intro') return;
    this.body.setVelocityX(0);
    this.chargesLeft = 0;
    this.wavesLeft = 0;
    this.go('stagger', balance.guard.breakMs);
  }

  protected onPhaseEnter(ph: BossPhase, silent: boolean): void {
    if (ph < 2) return;
    this.berserkCount = 0;
    if (silent) return;
    const w = this.world;
    this.body.setVelocityX(0);
    this.chargesLeft = 0;
    this.wavesLeft = 0;
    this.uncancellable = true;
    this.go('transition', balance.bosses.global.transitionMs);
    AudioManager.play('roar');
    w.cam.shake(8, 500);
    w.fx.ring(this.x, this.cy, BERSERK, 9, 700);
    w.fx.popText(this.x, this.body.y - 40, STR.bruteChampion.berserk, BERSERK, 3, 1000);
    GameEvents.emit('intro:card', { title: STR.bruteChampion.phases[1]!, subtitle: STR.bruteChampion.name, durationMs: 1400 });
    w.proj.clearCircle(this.x, this.cy, 2400, 'enemy');
  }

  // ------------------------------------------------------------------ loop
  step(dt: number): void {
    this.tickBase(dt);
    if (this.dead) return;
    this.stepCore(dt);
    this.stT -= dt;
    this.subT -= dt;
    this.glowT += dt;
    this.tintFx();
    switch (this.st) {
      case 'intro':
        this.body.setVelocityX(0);
        this.anim('idle');
        return;
      case 'transition':
        this.body.setVelocityX(0);
        this.anim('windup');
        if (this.stT <= 0) {
          this.uncancellable = false;
          this.invulnMs = 0;
          this.go('idle', this.gap());
        }
        return;
      case 'idle':
        this.approach();
        if (this.stT <= 0) this.choose();
        return;
      case 'roar':
        this.body.setVelocityX(0);
        this.anim('windup');
        if (this.stT <= 0) this.startTele();
        return;
      case 'tele':
        this.body.setVelocityX(0);
        if (this.stT <= 0) this.startAct();
        return;
      case 'act':
        this.act();
        return;
      case 'stagger':
      case 'wallStun':
      case 'recover':
        this.body.setVelocityX(0);
        this.anim(this.st === 'recover' ? 'idle' : 'stunned');
        if (this.stT <= 0) {
          this.currentAttack = 'none';
          this.go('idle', this.gap());
        }
        return;
      case 'dead':
        return;
    }
  }

  private tintFx(): void {
    if (this.flashMs > 0) return;
    const on = Math.floor(this.glowT / 80) % 2 === 0;
    if (this.st === 'tele' || this.st === 'roar' || (this.st === 'act' && this.sub === 9)) this.setTint(on ? (this.berserk ? PAL.danger : PAL.cleanseGold) : 0xffffff);
    else if (this.berserk) this.setTint(Math.floor(this.glowT / 160) % 2 ? BERSERK : 0xffb08a);
    else if (this.tintTopLeft !== 0xffffff) this.restoreTint();
  }

  private approach(): void {
    const dx = this.p.x - this.x;
    this.face(dx);
    const run = this.berserk ? B.berserkRun : B.run;
    if (Math.abs(dx) > B.slamRange - 30) {
      this.body.setVelocityX(Math.sign(dx) * run);
      this.anim('walk');
    } else {
      this.body.setVelocityX(0);
      this.anim('idle');
    }
  }

  private choose(): void {
    if (this.berserk) {
      this.berserkCount++;
      if (summonDue(this.berserkCount, B.summonEvery)) {
        this.pick();
        this.summonImps();
        this.go('roar', B.roarMs);
        return;
      }
    }
    this.pick();
    this.startTele();
  }

  private pick(): void {
    const W = B.weights[this.phase >= 2 ? 2 : 1];
    const adx = Math.abs(this.p.x - this.x);
    const ids = Object.keys(W) as BruteAttackId[];
    const weight = (id: BruteAttackId): number => {
      let v: number = W[id];
      if (v <= 0) return 0;
      const charge = id === 'charge' || id === 'doubleCharge';
      if (charge && adx < B.chargeMinRange) v *= 0.25;
      if (!charge && adx > B.slamRange * 1.6) v *= 0.4;
      if (id === this.last) v *= 0.5;
      return v;
    };
    const total = ids.reduce((s, id) => s + weight(id), 0);
    let r = this.world.rng.next() * total;
    for (const id of ids) {
      r -= weight(id);
      if (r <= 0) {
        this.attack = id;
        break;
      }
    }
    this.last = this.attack;
  }

  private summonImps(): void {
    const w = this.world;
    AudioManager.play('roar');
    w.cam.shake(5, 300);
    w.fx.ring(this.x, this.cy, BERSERK, 7, 500);
    const n = Math.min(B.summonImps, B.maxImps - this.impCount);
    for (let i = 0; i < n; i++) {
      const x = Phaser.Math.Clamp(this.x + (i ? 160 : -160), this.arena.x0 + 60, this.arena.x1 - 60);
      w.fx.glyph(x, this.y, 500, PAL.ruinGlow);
      w.scene.time.delayedCall(500, () => {
        if (this.dead || !this.active) return;
        const e = w.spawner.spawnEnemy('imp', x, this.y - 10, { required: false, aggro: true });
        if (e) this.minions.add(e);
      });
    }
  }

  // ------------------------------------------------------------------ attacks
  private startTele(): void {
    const a = A[this.attack];
    const ms = telegraphMs(a.telegraphMs, this.phase, a.ranged, 1);
    this.face(this.p.x - this.x);
    this.currentAttack = this.attack;
    this.go('tele', ms);
    AudioManager.play('telegraph', { pan: this.world.cam.panFor(this.x) });
    const w = this.world;
    switch (this.attack) {
      case 'slam':
      case 'hammer':
        this.anim('windup');
        w.fx.groundRing(this.x + this.facing * 50, this.y, PAL.danger, A.slam.w * 1.3, ms);
        break;
      case 'shockTriple':
        this.anim('windup');
        w.fx.groundRing(this.x + this.facing * 50, this.y, PAL.danger, A.slam.w * 2, ms);
        break;
      case 'charge':
      case 'doubleCharge':
        this.anim('chargeWind');
        w.fx.ring(this.x, this.cy, PAL.danger, 5, ms);
        break;
    }
  }

  private startAct(): void {
    this.restoreTint();
    this.hitDone = false;
    this.sub = 0;
    this.subT = 0;
    switch (this.attack) {
      case 'slam':
        this.slam(A.slam.damage, true);
        this.go('recover', A.slam.recoverMs);
        return;
      case 'hammer':
        this.slam(A.hammer.damage, false);
        this.sub = 9;
        this.subT = A.hammer.backhandMs;
        this.go('act', 99999);
        return;
      case 'shockTriple':
        this.slam(A.slam.damage, true);
        this.wavesLeft = A.shockTriple.waves - 1;
        this.subT = A.shockTriple.delayMs;
        this.go('act', 99999);
        return;
      case 'charge':
      case 'doubleCharge':
        this.chargesLeft = this.attack === 'doubleCharge' ? A.doubleCharge.charges : 1;
        this.beginCharge();
        return;
    }
  }

  private beginCharge(): void {
    this.face(this.p.x - this.x);
    this.hitDone = false;
    this.sub = 1;
    this.go('act', A.charge.maxMs);
    AudioManager.play('roar', { vol: 0.5, pan: this.world.cam.panFor(this.x) });
  }

  private act(): void {
    const w = this.world;
    switch (this.attack) {
      case 'hammer':
        this.anim('windup');
        this.body.setVelocityX(0);
        if (this.subT > 0) return;
        this.face(this.p.x - this.x);
        this.anim('slam');
        this.box(A.hammer.w, A.hammer.h, A.hammer.damage, A.hammer.knockback, 'melee');
        w.fx.burst(this.x + this.facing * 50, this.cy, 10, [0xffffff, PAL.cleanseGold], { speed: 220, life: 260 });
        AudioManager.play('slam', { vol: 0.6, pan: w.cam.panFor(this.x) });
        this.sub = 0;
        this.go('recover', A.hammer.recoverMs);
        return;
      case 'shockTriple':
        this.body.setVelocityX(0);
        if (this.subT > 0) return;
        this.shockwave(this.waveX);
        this.wavesLeft--;
        this.subT = A.shockTriple.delayMs;
        if (this.wavesLeft <= 0) this.go('recover', A.shockTriple.recoverMs);
        return;
      case 'charge':
      case 'doubleCharge':
        this.charge();
        return;
      default:
        this.go('recover', 600);
    }
  }

  private charge(): void {
    const C = A.charge;
    const w = this.world;
    if (this.sub === 2) {
      // pause between the two charges of Double Charge: re-aim and glint
      this.body.setVelocityX(0);
      this.anim('chargeWind');
      this.face(this.p.x - this.x);
      if (this.flashMs <= 0) this.setTint(Math.floor(this.glowT / 80) % 2 ? PAL.danger : 0xffffff);
      if (this.subT <= 0) this.beginCharge();
      return;
    }
    this.anim('charge');
    this.body.setVelocityX(this.facing * C.speed);
    if (Math.random() < 0.5) w.fx.dust2(this.x - this.facing * 20, this.y, 1, this.facing);
    if (!this.hitDone && Math.abs(this.p.x - (this.x + this.facing * 20)) < 50 && Math.abs(this.p.y - this.y) < 64) {
      this.hitDone = true;
      this.hitHero(C.damage, C.knockback, 'melee');
    }
    const edge = this.facing < 0 ? this.x - this.arena.x0 < 40 : this.arena.x1 - this.x < 40;
    const wall = edge || (this.facing < 0 && this.body.blocked.left) || (this.facing > 0 && this.body.blocked.right) || !w.geo.hasGround(this.x + this.facing * 30, this.y, 60);
    if (wall) {
      this.body.setVelocityX(0);
      this.chargesLeft = 0;
      w.cam.shake(6, 200);
      w.fx.burst(this.x + this.facing * 24, this.cy, 12, [0xffffff, PAL.cleanseGold], { speed: 200, life: 300 });
      AudioManager.play('slam', { pan: w.cam.panFor(this.x) });
      w.toast(STR.bruteChampion.wallTip, 'gold');
      this.go('wallStun', C.wallStunMs);
      this.guardHit(C.wallGuard);
      return;
    }
    if (this.stT <= 0) {
      this.chargesLeft--;
      if (this.chargesLeft > 0) {
        this.body.setVelocityX(0);
        this.sub = 2;
        this.subT = A.doubleCharge.gapMs;
        this.go('act', 99999);
        AudioManager.play('telegraph', { pan: w.cam.panFor(this.x) });
      } else this.go('recover', this.attack === 'doubleCharge' ? A.doubleCharge.recoverMs : C.recoverMs);
    }
  }

  private slam(damage: number, shock: boolean): void {
    const S = A.slam;
    const w = this.world;
    this.anim('slam');
    this.box(S.w, S.h, damage, S.knockback, 'crush');
    const fx = this.x + this.facing * 50;
    this.waveX = fx;
    w.fx.decal('fx_crack', fx, this.y + 2, 4000);
    w.fx.dust2(fx, this.y, 14);
    w.fx.groundRing(fx, this.y, PAL.cleanseGold, 200, 300);
    w.cam.shake(balance.hitStop.bruteSlam.shakeAmp, balance.hitStop.bruteSlam.shakeMs);
    AudioManager.play('slam', { pan: w.cam.panFor(this.x) });
    if (shock) this.shockwave(fx);
  }

  private shockwave(fx: number): void {
    const S = A.slam;
    for (const d of [-1, 1]) {
      this.world.proj.spawn({ kind: 'shock', faction: 'enemy', x: fx + d * 20, y: this.y, vx: d * S.shockSpeed, vy: 0, damage: this.dmg(S.shockDamage), range: S.shockRange, knockback: 200, poise: 10, w: S.shockW, h: S.shockH, damageKind: 'crush', source: this });
    }
  }

  private box(bw: number, bh: number, v3: number, kb: number, kind: 'melee' | 'crush'): void {
    const cx = this.x + this.facing * (bw / 2);
    if (Math.abs(this.p.x - cx) < bw / 2 + 14 && this.p.y > this.y - bh - 10 && this.p.y < this.y + 20) this.hitHero(v3, kb, kind);
  }

  private hitHero(v3: number, kb: number, kind: 'melee' | 'crush'): void {
    this.world.combat.hit(this.p, { amount: this.dmg(v3), kind, faction: 'enemy', dirX: Math.sign(this.p.x - this.x) || this.facing, knockback: kb, poise: 30, isSlam: kind === 'crush', source: this });
  }

  // ------------------------------------------------------------------ death
  onDeath(_hit: HitInfo, _k: KillType): void {
    this.st = 'dead';
    this.body.setVelocity(0, 0);
    this.restoreTint();
    GameStore.setBoss(0, this.maxHp, this.phase);
    this.killImps();
    this.finishFight('kill');
    this.onDefeated?.();
  }

  private killImps(): void {
    for (const m of this.minions) if (m.isAlive()) this.world.combat.hit(m, { amount: 9999, kind: 'contact', faction: 'neutral', dirX: 0, knockback: 0, poise: 0, ignoreIFrames: true, noHitStop: true });
    this.minions.clear();
  }

  override destroy(fromScene?: boolean): void {
    this.minions.clear();
    super.destroy(fromScene);
  }
}
