import Phaser from 'phaser';
import { balance, type BossAttackId } from '@/config/balance';
import { PAL } from '@/config/palette';
import { STR } from '@/config/strings';
import { GameEvents } from '@/core/GameEvents';
import { GameStore } from '@/core/GameStore';
import type { Faction, KillType } from '@/core/types';
import { bossDamageMultiplier, chooseBossAttack, darkRainColumns, phaseForHp, recoverFor, shouldDesperation, telegraphFor, type BossPhase } from '@/logic/boss';
import { AudioManager } from '@/audio/AudioManager';
import type { Enemy } from '@/entities/enemies/Enemy';
import type { World } from '@/game/World';
import type { HitInfo } from '@/systems/CombatSystem';
import { Actor } from '../Actor';

type BState = 'intro' | 'idle' | 'approach' | 'tele' | 'act' | 'recover' | 'transition' | 'dead';
const A = balance.boss.attacks;

/** Kaalasura, the Hollow King — three-phase boss (§13). */
export class Kaalasura extends Actor {
  override faction: Faction = 'enemy';
  phase: BossPhase = 1;
  st: BState = 'intro';
  private stT = 0;
  private attack: BossAttackId = 'slam';
  private last: BossAttackId | null = null;
  private hitSet = new Set<number>();
  private minions = new Set<Enemy>();
  private desperationUsed = false;
  private sub = 0;
  private subT = 0;
  private glowT = 0;
  private punish = false;
  private rainCols: { x: number; safe: boolean }[] = [];
  private arena: { x0: number; x1: number };
  onDefeated: (() => void) | null = null;

  constructor(world: World, x: number, y: number) {
    super(world, x, y, 'boss', 64, 104);
    this.maxHp = this.hp = balance.boss.hp;
    this.armor = balance.boss.armor;
    this.stunImmune = true;
    this.kbResist = 1;
    this.poiseMax = this.poise = 1e9;
    this.targetWeight = 1;
    this.setDepth(320);
    this.face(-1);
    this.arena = { x0: world.level.bossArena.x0, x1: world.level.bossArena.x1 };
    this.invulnMs = 1e9;
    this.stT = balance.boss.introMs;
    this.anim('roar');
  }

  override get superArmor(): boolean {
    return true;
  }

  override damageTakenMul(h: HitInfo): number {
    const alive = [...this.minions].filter((m) => m.isAlive()).length;
    return super.damageTakenMul(h) * bossDamageMultiplier(alive, this.punish) * (this.punish ? 1.25 : 1);
  }

  private get p(): Actor {
    return this.world.player;
  }

  private go(s: BState, ms: number): void {
    this.st = s;
    this.stT = ms;
    this.hitSet.clear();
  }

  beginFight(): void {
    this.invulnMs = 0;
    GameEvents.emit('boss:spawned', { name: STR.boss.name, max: this.maxHp });
    GameStore.setBoss(this.hp, this.maxHp, 1);
    this.go('idle', 600);
  }

  step(dt: number): void {
    this.tickBase(dt);
    if (this.dead) return;
    this.stT -= dt;
    this.glowT += dt;
    if (Math.random() < 0.2) this.world.fx.add({ x: this.x + (Math.random() - 0.5) * 60, y: this.body.bottom - Math.random() * 90, vy: -60, life: 600, c: this.phase === 3 ? PAL.danger : PAL.ruinGlow }, true);
    const b = this.body;
    // keep inside arena
    if (this.x < this.arena.x0 + 60) b.setVelocityX(Math.max(0, b.velocity.x));
    if (this.x > this.arena.x1 - 60) b.setVelocityX(Math.min(0, b.velocity.x));
    switch (this.st) {
      case 'intro':
        b.setVelocityX(0);
        return;
      case 'transition':
        b.setVelocityX(0);
        this.anim('roar');
        if (this.stT <= 0) {
          this.invulnMs = 0;
          this.go('idle', 400);
        }
        return;
      case 'idle':
        this.face(this.p.x - this.x);
        b.setVelocityX(0);
        this.anim('idle');
        if (this.stT <= 0) this.choose();
        return;
      case 'approach': {
        const dx = this.p.x - this.x;
        this.face(dx);
        b.setVelocityX(Math.sign(dx) * balance.boss.speed * this.speedMul() * (this.phase === 3 ? 1.3 : 1));
        this.anim('walk');
        if (Math.abs(dx) < 130 || this.stT <= 0) this.startTele();
        return;
      }
      case 'tele':
        b.setVelocityX(0);
        this.teleFx();
        if (this.stT <= 0) this.startAct();
        return;
      case 'act':
        this.act(dt);
        return;
      case 'recover':
        b.setVelocityX(b.velocity.x * 0.85);
        if (this.stT <= 0) {
          this.punish = false;
          this.restoreTint();
          this.go('idle', balance.boss.idleMs * (this.phase === 3 ? balance.boss.phase3CooldownMul : 1));
        }
        return;
    }
  }

  private choose(): void {
    if (shouldDesperation(this.hp, this.maxHp, this.desperationUsed)) {
      this.desperationUsed = true;
      this.attack = 'roar';
      this.startTele();
      return;
    }
    this.attack = chooseBossAttack(this.phase, this.last, this.world.rng);
    this.last = this.attack;
    if (this.attack === 'slam' && Math.abs(this.p.x - this.x) > 150) this.go('approach', 1500);
    else this.startTele();
  }

  private startTele(): void {
    const ms = this.attack === 'roar' ? 700 : telegraphFor(this.attack, this.phase);
    this.go('tele', ms);
    this.face(this.p.x - this.x);
    const w = this.world;
    AudioManager.play('telegraph');
    switch (this.attack) {
      case 'slam':
        this.anim('windup');
        w.fx.groundRing(this.x + this.facing * 90, this.y, PAL.danger, A.slam.w * 1.4, ms);
        break;
      case 'bowFan':
        this.anim('bow');
        break;
      case 'mireOrbs':
        this.anim('cast');
        w.fx.glyph(this.x, this.y, ms, PAL.ruinGlow);
        break;
      case 'rain':
        this.anim('summon');
        AudioManager.play('glyph');
        break;
      case 'stompWave':
        this.anim('windup');
        break;
      case 'rampage':
        this.anim('chargeWind');
        break;
      case 'darkRain': {
        this.anim('cast');
        const { safe, columns } = darkRainColumns(w.rng);
        const cw = A.darkRain.columnWidth;
        const n = A.darkRain.columns;
        const left = Phaser.Math.Clamp(this.p.x - (n * cw) / 2, this.arena.x0 + 20, this.arena.x1 - 20 - n * cw);
        this.rainCols = [];
        for (let i = 0; i < n; i++) {
          const x = left + cw * (i + 0.5);
          const isSafe = i === safe;
          this.rainCols.push({ x, safe: isSafe });
          if (!columns.includes(i) && !isSafe) continue;
          const shadow = w.scene.add.image(x, this.world.level.groundY, 'fx_shadow').setOrigin(0.5, 0.5).setDepth(6).setDisplaySize(cw - 8, 18);
          shadow.setTint(isSafe ? PAL.cleanseGold : PAL.danger).setAlpha(0);
          w.scene.tweens.add({ targets: shadow, alpha: isSafe ? 0.5 : 0.8, duration: A.darkRain.shadowMs });
          w.scene.tweens.add({ targets: shadow, alpha: 0, delay: ms + A.darkRain.durationMs, duration: 250, onComplete: () => shadow.destroy() });
        }
        break;
      }
      case 'roar':
        this.anim('roar');
        break;
    }
  }

  private teleFx(): void {
    const on = Math.floor(this.glowT / 80) % 2 === 0;
    if (this.flashMs <= 0) this.setTint(on ? (this.attack === 'rampage' || this.phase === 3 ? PAL.danger : PAL.cleanseGold) : 0xffffff);
    if (this.attack === 'rain' && Math.random() < 0.5) this.world.fx.add({ x: this.x, y: this.body.y, vx: (Math.random() - 0.5) * 200, vy: -150, life: 400, c: PAL.ruinGlow }, true);
  }

  private startAct(): void {
    this.restoreTint();
    this.sub = 0;
    this.subT = 0;
    const w = this.world;
    switch (this.attack) {
      case 'slam':
        this.doSlam(this.x + this.facing * 90);
        this.punish = true;
        return this.endAct();
      case 'bowFan': {
        this.anim('bow');
        const ox = this.x + this.facing * 30;
        const oy = this.body.y + 30;
        const base = Math.atan2(this.p.cy - oy, this.p.cx - ox);
        const n = A.bowFan.arrows + (this.phase === 3 ? 2 : 0);
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * A.bowFan.spreadDeg * (Math.PI / 180);
          w.proj.spawn({ kind: 'boneArrow', faction: 'enemy', x: ox, y: oy, vx: Math.cos(a) * A.bowFan.speed, vy: Math.sin(a) * A.bowFan.speed, damage: A.bowFan.damage, source: this, knockback: 160 });
        }
        AudioManager.play('bowShoot');
        return this.endAct();
      }
      case 'mireOrbs':
        for (let i = 0; i < A.mireOrbs.count + (this.phase === 3 ? 1 : 0); i++) {
          w.proj.spawn({
            kind: 'darkOrb',
            faction: 'enemy',
            x: this.x + this.facing * 30,
            y: this.body.y + 20 + i * 20,
            vx: this.facing * A.mireOrbs.speed,
            vy: -80 + i * 80,
            damage: A.mireOrbs.damage,
            lifeMs: A.mireOrbs.homeMs,
            homing: { target: this.p, turnRate: A.mireOrbs.turnRate },
            status: { id: 'slow', durationMs: balance.status.slow.durationMs, sourceId: this.uid },
            source: this,
            knockback: 60,
            poise: 0,
          });
        }
        AudioManager.play('hexCast');
        return this.endAct();
      case 'rain':
        this.summonMinions(A.rain.imps, A.rain.raiders, true);
        return this.endAct();
      case 'stompWave':
      case 'rampage':
      case 'darkRain':
        this.go('act', 99999);
        return;
      case 'roar': {
        this.anim('roar');
        AudioManager.play('roar');
        w.cam.shake(10, A.roar.durationMs * 0.6);
        w.fx.ring(this.x, this.cy, PAL.danger, 10, 600);
        const dir = Math.sign(this.p.x - this.x) || 1;
        w.combat.hit(this.p, { amount: 0.001, kind: 'magic', faction: 'enemy', source: this, dirX: dir, knockback: A.roar.push, knockUp: 200, poise: 0, noHitStop: true });
        this.summonMinions(A.roar.imps, 0, false);
        this.invulnMs = A.roar.durationMs * 0.5;
        this.attack = 'darkRain';
        this.last = 'darkRain';
        this.world.scene.time.delayedCall(A.roar.durationMs * 0.5, () => {
          if (!this.dead) this.startTele();
        });
        this.go('intro', 99999);
        return;
      }
    }
  }

  private endAct(): void {
    this.go('recover', recoverFor(this.attack, this.phase));
  }

  private act(dt: number): void {
    const w = this.world;
    const b = this.body;
    this.subT -= dt;
    switch (this.attack) {
      case 'stompWave': {
        b.setVelocityX(0);
        if (this.subT <= 0) {
          this.anim('slam', false);
          this.doSlam(this.x, true);
          this.sub++;
          this.subT = A.stompWave.gapMs * (this.phase === 3 ? 0.8 : 1);
          if (this.sub >= A.stompWave.waves) this.endAct();
        }
        return;
      }
      case 'rampage': {
        const R = A.rampage;
        if (this.sub === 0 || this.subT <= 0) {
          if (this.sub >= R.passes) {
            this.punish = true;
            return this.endAct();
          }
          this.face(this.p.x - this.x || -this.facing);
          this.sub++;
          this.subT = 1600;
          this.hitSet.clear();
          AudioManager.play('roar', { vol: 0.5 });
        }
        this.anim('charge');
        b.setVelocityX(this.facing * R.speed);
        if (Math.random() < 0.6) w.fx.dust2(this.x - this.facing * 30, this.y, 1, this.facing);
        const r = { x: this.x - 40, y: this.body.y + 10, w: 80, h: this.body.height - 10 };
        w.combat.hitArea(r, { amount: R.damage, kind: 'crush', faction: 'enemy', source: this, dirX: this.facing, knockback: R.knockback, knockUp: 260, poise: 30, isSlam: true }, this.hitSet);
        const atWall = (this.facing < 0 && this.x < this.arena.x0 + 80) || (this.facing > 0 && this.x > this.arena.x1 - 80);
        if (atWall) {
          b.setVelocityX(0);
          w.cam.shake(8, 250);
          AudioManager.play('slam');
          w.fx.burst(this.x + this.facing * 30, this.cy, 14, [0xffffff, PAL.danger], { speed: 220, life: 400 });
          this.subT = 0;
          this.face(-this.facing);
        }
        return;
      }
      case 'darkRain': {
        const D = A.darkRain;
        b.setVelocityX(0);
        this.anim('cast');
        if (this.sub === 0) {
          this.sub = 1;
          this.subT = D.durationMs;
          AudioManager.play('roar', { vol: 0.4 });
        }
        if (Math.random() < 0.9) {
          for (const c of this.rainCols) {
            if (c.safe || Math.random() > 0.35) continue;
            const x = c.x + (Math.random() - 0.5) * (D.columnWidth - 20);
            w.proj.spawn({ kind: 'rainArrow', faction: 'enemy', x, y: w.cam.cam.worldView.y - 20, vx: 0, vy: D.arrowSpeed, damage: D.damage, source: this, knockback: 80, poise: 5, lifeMs: 2000, w: 10, h: 20 });
          }
        }
        if (this.subT <= 0) this.endAct();
        return;
      }
    }
  }

  private doSlam(x: number, stomp = false): void {
    const w = this.world;
    const S = A.slam;
    this.anim('slam', false);
    if (!stomp) {
      const r = { x: x - S.w / 2, y: this.y - S.h, w: S.w, h: S.h };
      w.combat.hitArea(r, { amount: S.damage, kind: 'crush', faction: 'enemy', source: this, dirX: this.facing, knockback: S.knockback, poise: 40, isSlam: true }, this.hitSet);
    }
    for (const d of [-1, 1]) {
      w.proj.spawn({ kind: 'shock', faction: 'enemy', x: x + d * 30, y: this.y, vx: d * S.shockSpeed, vy: 0, damage: S.shockDamage, range: S.shockRange, knockback: 220, poise: 10, w: 28, h: S.shockHeight * 2, damageKind: 'crush', source: this });
    }
    w.fx.decal('fx_crack', x, this.y + 2, 4000);
    w.fx.dust2(x, this.y, 16);
    w.fx.groundRing(x, this.y, PAL.danger, 260, 350);
    w.cam.shake(balance.hitStop.bossSlam.shakeAmp, balance.hitStop.bossSlam.shakeMs);
    AudioManager.play('slam');
  }

  private summonMinions(imps: number, raiders: number, glyphs: boolean): void {
    const w = this.world;
    const n = imps + raiders;
    for (let i = 0; i < n; i++) {
      const x = Phaser.Math.Clamp(this.p.x + (i - (n - 1) / 2) * 140 + (Math.random() - 0.5) * 40, this.arena.x0 + 80, this.arena.x1 - 80);
      const y = w.level.groundY;
      if (glyphs) w.fx.glyph(x, y, 500, PAL.ruinGlow);
      w.scene.time.delayedCall(glyphs ? 500 : 100, () => {
        const e = w.spawner.spawnEnemy(i < imps ? 'imp' : 'raider', x, y, { required: false, aggro: true });
        if (e) this.minions.add(e);
      });
    }
  }

  override onHurt(): void {
    GameStore.setBoss(this.hp, this.maxHp, this.phase);
    const ph = phaseForHp(this.hp, this.maxHp);
    if (ph > this.phase) this.enterPhase(ph);
  }

  private enterPhase(ph: BossPhase): void {
    const w = this.world;
    this.phase = ph;
    GameStore.setBoss(this.hp, this.maxHp, ph);
    GameEvents.emit('boss:phase', { phase: ph });
    this.invulnMs = balance.boss.transitionMs;
    this.go('transition', balance.boss.transitionMs);
    this.punish = false;
    AudioManager.play('roar');
    w.cam.shake(8, 500);
    w.fx.ring(this.x, this.cy, ph === 3 ? PAL.danger : PAL.ruinGlow, 9, 700);
    w.fx.flash(ph === 3 ? 0xff4040 : 0xc58bff, 0.4, 120);
    const pl = w.player;
    pl.heal(balance.boss.transitionHeal);
    pl.prana = Math.min(pl.maxPrana, pl.prana + balance.boss.transitionPrana);
    GameEvents.emit('intro:card', { title: ph === 2 ? STR.boss.phase2 : STR.boss.phase3, subtitle: STR.boss.name, durationMs: 1600 });
    if (ph === 2) {
      w.toast('Kill the minions to break his ward!', 'violet');
      this.summonMinions(0, balance.boss.shieldMinions, true);
    } else this.summonMinions(2, 0, true);
    w.proj.clearCircle(this.x, this.cy, 2000, 'enemy');
  }

  onDeath(_hit: HitInfo, _k: KillType): void {
    this.st = 'dead';
    this.body.setVelocity(0, 0);
    GameStore.setBoss(0, this.maxHp, this.phase);
    for (const m of this.minions) if (m.isAlive()) this.world.combat.hit(m, { amount: 9999, kind: 'contact', faction: 'neutral', dirX: 0, knockback: 0, poise: 0, ignoreIFrames: true, noHitStop: true });
    this.onDefeated?.();
  }

  killMinions(): Enemy[] {
    return [...this.minions].filter((m) => m.isAlive());
  }
}
