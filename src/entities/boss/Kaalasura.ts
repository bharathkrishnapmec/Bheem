import Phaser from 'phaser';
import { balance, type BossAttackId } from '@/config/balance';
import { PAL } from '@/config/palette';
import { STR } from '@/config/strings';
import { GameEvents } from '@/core/GameEvents';
import { GameStore } from '@/core/GameStore';
import type { KillType } from '@/core/types';
import { comboLength, darkRainColumns, hellfireEdge, minionWardMul, telegraphMs, type BossPhase } from '@/logic/boss';
import { AudioManager } from '@/audio/AudioManager';
import type { Enemy } from '@/entities/enemies/Enemy';
import type { EnemyType } from '@/core/types';
import type { World } from '@/game/World';
import type { HitInfo } from '@/systems/CombatSystem';
import type { Actor } from '../Actor';
import { BossBase } from './BossBase';
import { Warbanner } from './Warbanner';

type BState = 'intro' | 'idle' | 'approach' | 'tele' | 'act' | 'recover' | 'transition' | 'stagger' | 'stun' | 'lastStand' | 'execute' | 'dead';
const A = balance.boss.attacks;
const K = balance.boss;
const ECHOABLE: ReadonlySet<BossAttackId> = new Set(['slam', 'bowFan', 'mireOrbs', 'cleave', 'stompWave']);
const ECHO_ATTACKS: ReadonlySet<BossAttackId> = new Set(['hollowEcho', 'chainEchoes']);

interface Echo {
  s: Phaser.GameObjects.Sprite;
  attack: BossAttackId;
  t: number;
  teleMs: number;
  started: boolean;
  fired: boolean;
  life: number;
  facing: 1 | -1;
  hits: Set<number>;
}

/** Kaalasura, the Hollow King — v3 four-phase boss (Boss Buff §B4). */
export class Kaalasura extends BossBase {
  readonly displayName = STR.boss.name;
  readonly displayTitle = STR.boss.title;
  st: BState = 'intro';
  private stT = 0;
  private attack: BossAttackId = 'slam';
  private last: BossAttackId | null = null;
  private echoSource: BossAttackId = 'bowFan';
  private hitSet = new Set<number>();
  private minions = new Set<Enemy>();
  private banners = new Set<Warbanner>();
  private echoes: Echo[] = [];
  private sub = 0;
  private subT = 0;
  private glowT = 0;
  private comboLeft = 0;
  private rainCols: { x: number; safe: boolean }[] = [];
  private slam2X = 0;
  private meteorXs: number[] = [];
  private lastStandUsed = false;
  private hell = { on: false, t: 0, warnT: 0, tickT: 0, forceMin: false, y: 0, g: null as Phaser.GameObjects.Graphics | null };

  constructor(world: World, x: number, y: number) {
    super(world, x, y, 'boss', 64, 104, 'kaalasura');
    this.targetWeight = 1;
    this.setDepth(320);
    this.face(-1);
    this.invulnMs = 1e9;
    this.stT = K.introMs;
    this.anim('roar');
  }

  override get superArmor(): boolean {
    return true;
  }
  protected override extraTakenMul(): number {
    return minionWardMul(this.killMinions().length);
  }
  protected override damageBuff(): number {
    return this.banners.size > 0 ? 1 + A.warbanner.damageBuff : 1;
  }
  get hellfireOn(): boolean {
    return this.hell.on;
  }
  get bannerCount(): number {
    return this.banners.size;
  }

  private get p(): Actor {
    return this.world.player;
  }

  private go(s: BState, ms: number): void {
    this.st = s;
    this.stT = ms;
    this.hitSet.clear();
  }

  override beginFight(): void {
    super.beginFight();
    this.go('idle', 600);
  }

  step(dt: number): void {
    this.tickBase(dt);
    if (this.dead) return;
    this.stepCore(dt);
    this.stT -= dt;
    this.glowT += dt;
    this.updateEchoes(dt);
    this.updateHellfire(dt);
    this.updateBanners(dt);
    if (Math.random() < 0.2) this.world.fx.add({ x: this.x + (Math.random() - 0.5) * 60, y: this.body.bottom - Math.random() * 90, vy: -60, life: 600, c: this.phase >= 3 ? PAL.danger : PAL.ruinGlow }, true);
    const b = this.body;
    if (this.x < this.arena.x0 + 60) b.setVelocityX(Math.max(0, b.velocity.x));
    if (this.x > this.arena.x1 - 60) b.setVelocityX(Math.min(0, b.velocity.x));
    if (!this.lastStandUsed && this.fighting && this.st !== 'transition' && this.st !== 'intro' && this.hp / this.maxHp <= K.lastStandAt) this.startLastStand();
    switch (this.st) {
      case 'intro':
        b.setVelocityX(0);
        return;
      case 'transition':
        b.setVelocityX(0);
        this.anim('roar');
        if (this.stT <= 0) {
          this.uncancellable = false;
          this.invulnMs = 0;
          this.go('idle', 400);
        }
        return;
      case 'idle':
        this.face(this.p.x - this.x);
        b.setVelocityX(0);
        this.anim('idle');
        if (this.stT <= 0) this.choose(false);
        return;
      case 'approach': {
        const dx = this.p.x - this.x;
        this.face(dx);
        b.setVelocityX(Math.sign(dx) * K.speed * this.speedMul() * (this.phase >= 3 ? 1.25 : 1));
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
          this.restoreTint();
          if (this.comboLeft > 0) this.choose(true);
          else this.go('idle', this.gap());
        }
        return;
      case 'stagger':
      case 'execute':
      case 'stun':
        b.setVelocityX(0);
        this.anim('idle');
        if (this.flashMs <= 0) this.setTint(Math.floor(this.glowT / 140) % 2 ? 0x9fd8ff : 0xffffff);
        if (this.stT <= 0) {
          this.restoreTint();
          this.go('idle', 500);
        }
        return;
      case 'lastStand':
        b.setVelocityX(0);
        this.anim('roar');
        if (this.flashMs <= 0) this.setTint(Math.floor(this.glowT / 90) % 2 ? PAL.danger : 0xffffff);
        if (this.stT <= 0) this.lastStandNext();
        return;
    }
  }

  private choose(chain: boolean): void {
    if (!chain) this.comboLeft = comboLength(this.phase, this.world.rng);
    this.comboLeft--;
    const weights: Partial<Record<BossAttackId, number>> = { ...K.weights[this.phase] };
    if (this.banners.size >= A.warbanner.max) delete weights.warbanner;
    if (chain) {
      delete weights.rain;
      delete weights.warbanner;
      delete weights.hollowMeteor;
    }
    this.attack = this.world.rng.weighted<BossAttackId>(weights, this.last) ?? 'slam';
    if (!ECHO_ATTACKS.has(this.attack) && ECHOABLE.has(this.attack)) this.echoSource = this.attack;
    this.last = this.attack;
    this.currentAttack = this.attack;
    if ((this.attack === 'slam' || this.attack === 'cleave') && Math.abs(this.p.x - this.x) > 150) this.go('approach', 1500);
    else this.startTele();
  }

  private teleFor(a: BossAttackId): number {
    return telegraphMs(A[a].telegraphMs, this.phase, A[a].ranged, K.p3TelegraphMul);
  }

  private startTele(): void {
    const ms = this.teleFor(this.attack);
    this.go('tele', ms);
    this.face(this.p.x - this.x);
    const w = this.world;
    AudioManager.play('telegraph');
    switch (this.attack) {
      case 'slam':
        this.anim('windup');
        w.fx.groundRing(this.x + this.facing * 90, this.y, PAL.danger, A.slam.w * 1.4, ms);
        break;
      case 'cleave':
        this.anim('windup');
        w.fx.groundRing(this.x + (this.facing * A.cleave.range) / 2, this.y, PAL.danger, A.cleave.range * 2, ms);
        break;
      case 'bowFan':
        this.anim('bow');
        break;
      case 'mireOrbs':
        this.anim('cast');
        w.fx.glyph(this.x, this.y, ms, PAL.ruinGlow);
        break;
      case 'rain':
      case 'warbanner':
        this.anim('summon');
        AudioManager.play('glyph');
        break;
      case 'stompWave':
        this.anim('windup');
        break;
      case 'rampage':
        this.anim('chargeWind');
        break;
      case 'hollowEcho':
      case 'chainEchoes':
        this.anim('cast');
        w.fx.glyph(this.x, this.y, ms, PAL.ruinViolet);
        break;
      case 'hollowMeteor':
        this.anim('chargeWind');
        w.fx.ring(this.x, this.cy, PAL.danger, 6, ms);
        break;
      case 'darkRain': {
        this.anim('cast');
        const { safe, columns } = darkRainColumns(w.rng);
        const cw = A.darkRain.columnWidth;
        const n = A.darkRain.columns;
        const left = Phaser.Math.Clamp(this.p.x - (n * cw) / 2, this.arena.x0 + 20, Math.max(this.arena.x0 + 20, this.arena.x1 - 20 - n * cw));
        this.rainCols = [];
        for (let i = 0; i < n; i++) {
          const x = left + cw * (i + 0.5);
          const isSafe = i === safe;
          this.rainCols.push({ x, safe: isSafe });
          if (!columns.includes(i) && !isSafe) continue;
          const shadow = w.scene.add.image(x, this.y, 'fx_shadow').setOrigin(0.5, 0.5).setDepth(6).setDisplaySize(cw - 8, 18);
          shadow.setTint(isSafe ? PAL.cleanseGold : PAL.danger).setAlpha(0);
          w.scene.tweens.add({ targets: shadow, alpha: isSafe ? 0.5 : 0.8, duration: A.darkRain.shadowMs });
          w.scene.tweens.add({ targets: shadow, alpha: 0, delay: ms + A.darkRain.durationMs, duration: 250, onComplete: () => shadow.destroy() });
        }
        break;
      }
    }
  }

  private teleFx(): void {
    const on = Math.floor(this.glowT / 80) % 2 === 0;
    if (this.flashMs <= 0) this.setTint(on ? (this.attack === 'rampage' || this.phase >= 3 ? PAL.danger : PAL.cleanseGold) : 0xffffff);
    if ((this.attack === 'rain' || this.attack === 'warbanner') && Math.random() < 0.5) this.world.fx.add({ x: this.x, y: this.body.y, vx: (Math.random() - 0.5) * 200, vy: -150, life: 400, c: PAL.ruinGlow }, true);
  }

  private startAct(): void {
    this.restoreTint();
    this.sub = 0;
    this.subT = 0;
    switch (this.attack) {
      case 'slam': {
        this.doSlam(this.x + this.facing * 90, this.facing, false, this.hitSet);
        const S = A.slam;
        this.slam2X = Phaser.Math.Clamp(this.p.x, this.x - S.secondReach, this.x + S.secondReach);
        this.slam2X = Phaser.Math.Clamp(this.slam2X, this.arena.x0 + 60, this.arena.x1 - 60);
        this.world.fx.groundRing(this.slam2X, this.y, PAL.danger, S.w * 1.3, S.secondDelayMs);
        this.sub = 1;
        this.subT = S.secondDelayMs;
        this.go('act', 99999);
        return;
      }
      case 'cleave':
        this.doCleave(this.x, this.facing, this.hitSet);
        return this.endAct();
      case 'bowFan':
        this.anim('bow');
        this.fireFan(this.x + this.facing * 30, this.body.y + 30);
        return this.endAct();
      case 'mireOrbs':
        this.fireOrbs(this.x + this.facing * 30, this.body.y + 20, this.facing);
        return this.endAct();
      case 'rain':
        this.summonMinions([...Array<EnemyType>(A.rain.imps).fill('imp'), ...Array<EnemyType>(A.rain.raiders).fill('raider')], true);
        return this.endAct();
      case 'warbanner':
        this.plantBanner();
        return this.endAct();
      case 'hollowEcho':
        this.spawnEcho(0);
        return this.endAct();
      case 'chainEchoes':
        this.spawnEcho(0, 1);
        this.spawnEcho(A.chainEchoes.gapMs, -1);
        return this.endAct();
      case 'stompWave':
      case 'rampage':
      case 'darkRain':
      case 'hollowMeteor':
        this.go('act', 99999);
        return;
    }
  }

  private endAct(): void {
    this.go('recover', this.comboLeft > 0 ? balance.bosses.global.comboGapMs : A[this.attack].recoverMs);
  }

  private act(dt: number): void {
    const w = this.world;
    const b = this.body;
    this.subT -= dt;
    switch (this.attack) {
      case 'slam':
        b.setVelocityX(0);
        if (this.subT <= 0) {
          this.doSlam(this.slam2X, this.facing, false, new Set());
          this.endAct();
        }
        return;
      case 'stompWave':
        b.setVelocityX(0);
        if (this.subT <= 0) {
          this.doSlam(this.x, this.facing, true, this.hitSet);
          this.sub++;
          this.subT = A.stompWave.gapMs * (this.phase >= 3 ? 0.85 : 1);
          if (this.sub >= A.stompWave.waves) this.endAct();
        }
        return;
      case 'rampage': {
        const R = A.rampage;
        if (this.sub === 0 || this.subT <= 0) {
          if (this.sub >= R.passes) return this.endAct();
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
        w.combat.hitArea(r, { amount: this.dmg(R.damage), kind: 'crush', faction: 'enemy', source: this, dirX: this.facing, knockback: R.knockback, knockUp: 260, poise: 30, isSlam: true }, this.hitSet);
        const atWall = (this.facing < 0 && this.x < this.arena.x0 + 80) || (this.facing > 0 && this.x > this.arena.x1 - 80);
        if (atWall) {
          b.setVelocityX(0);
          w.cam.shake(8, 250);
          AudioManager.play('slam');
          w.fx.burst(this.x + this.facing * 30, this.cy, 14, [0xffffff, PAL.danger], { speed: 220, life: 400 });
          this.face(-this.facing);
          if (this.sub >= R.passes) {
            this.comboLeft = 0;
            this.go('stun', R.wallStunMs);
            w.fx.popText(this.x, this.body.y - 20, 'STUNNED', PAL.statusCyan, 2, 700);
            this.guardHit(R.wallGuard);
            return;
          }
          this.subT = 0;
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
        for (const c of this.rainCols) {
          if (c.safe || Math.random() > 0.32) continue;
          const x = c.x + (Math.random() - 0.5) * (D.columnWidth - 20);
          w.proj.spawn({ kind: 'rainArrow', faction: 'enemy', x, y: w.cam.cam.worldView.y - 20, vx: 0, vy: D.arrowSpeed, damage: this.dmg(D.damage), source: this, knockback: 80, poise: 5, lifeMs: 2000, w: 10, h: 20 });
        }
        if (this.subT <= 0) this.endAct();
        return;
      }
      case 'hollowMeteor': {
        const M = A.hollowMeteor;
        b.setVelocityX(0);
        if (this.sub === 0) {
          this.sub = 1;
          this.subT = M.fallMs + 300;
          this.targetable = false;
          this.invulnMs = M.fallMs + 600;
          w.scene.tweens.add({ targets: this, alpha: 0, duration: 250 });
          w.fx.dust2(this.x, this.y, 18);
          AudioManager.play('jump');
          const cx = Phaser.Math.Clamp(this.p.x, this.arena.x0 + 80, this.arena.x1 - 80);
          this.meteorXs = [cx, cx - M.spread, cx + M.spread].map((x) => Phaser.Math.Clamp(x, this.arena.x0 + 60, this.arena.x1 - 60));
          for (const x of this.meteorXs) w.fx.groundRing(x, this.y, PAL.danger, M.w * 1.4, M.fallMs + 300);
          return;
        }
        if (this.subT <= 0) {
          const hits = new Set<number>();
          for (const x of this.meteorXs) {
            w.combat.hitArea({ x: x - M.w / 2, y: this.y - 220, w: M.w, h: 220 }, { amount: this.dmg(M.damage), kind: 'crush', faction: 'enemy', source: this, dirX: Math.sign(this.p.x - x) || 1, knockback: 380, knockUp: 280, poise: 40, isSlam: true }, hits);
            for (const d of [-1, 1]) w.proj.spawn({ kind: 'shock', faction: 'enemy', x: x + d * 30, y: this.y, vx: d * 420, vy: 0, damage: this.dmg(M.shockDamage), range: M.shockRange, knockback: 180, poise: 8, w: 24, h: 50, damageKind: 'crush', source: this });
            w.fx.burst(x, this.y - 10, 14, [PAL.danger, 0xffb060, PAL.ruinViolet], { speed: 260, life: 500 });
            w.fx.decal('fx_crack', x, this.y + 2, 4000);
          }
          w.cam.shake(12, 400);
          AudioManager.play('slam');
          this.body.reset(this.meteorXs[0]!, this.y);
          this.alpha = 1;
          this.targetable = true;
          this.invulnMs = 0;
          this.endAct();
        }
        return;
      }
    }
  }

  private doSlam(x: number, dir: number, stomp: boolean, hits: Set<number>, fromEcho = false): void {
    const w = this.world;
    const S = A.slam;
    if (!fromEcho) this.anim('slam', false);
    if (!stomp) {
      const r = { x: x - S.w / 2, y: this.y - S.h, w: S.w, h: S.h };
      w.combat.hitArea(r, { amount: this.dmg(S.damage), kind: 'crush', faction: 'enemy', source: this, dirX: dir, knockback: S.knockback, poise: 40, isSlam: true }, hits);
    }
    for (const d of [-1, 1]) {
      w.proj.spawn({ kind: 'shock', faction: 'enemy', x: x + d * 30, y: this.y, vx: d * S.shockSpeed, vy: 0, damage: this.dmg(S.shockDamage), range: S.shockRange, knockback: 220, poise: 10, w: 28, h: S.shockHeight * 2, damageKind: 'crush', source: this });
    }
    w.fx.decal('fx_crack', x, this.y + 2, 4000);
    w.fx.dust2(x, this.y, 16);
    w.fx.groundRing(x, this.y, PAL.danger, 260, 350);
    w.cam.shake(balance.hitStop.bossSlam.shakeAmp, balance.hitStop.bossSlam.shakeMs);
    AudioManager.play('slam');
  }

  /** 180° low sweep in front: jump over it or dash through. */
  private doCleave(x: number, dir: 1 | -1, hits: Set<number>): void {
    const w = this.world;
    const C = A.cleave;
    const r = { x: dir > 0 ? x - 30 : x - C.range, y: this.y - C.h, w: C.range + 30, h: C.h };
    w.combat.hitArea(r, { amount: this.dmg(C.damage), kind: 'melee', faction: 'enemy', source: this, dirX: dir, knockback: C.knockback, knockUp: 160, poise: 40, preset: 'heavy' }, hits);
    for (let i = 0; i < 10; i++) w.fx.add({ x: x + dir * (20 + i * (C.range / 10)), y: this.y - 20 - Math.sin((i / 9) * Math.PI) * 30, vx: dir * 80, life: 260, c: i % 2 ? PAL.ruinGlow : 0xffffff, size: 3 }, true);
    AudioManager.play('swingHeavy');
  }

  private fireFan(ox: number, oy: number): void {
    const w = this.world;
    const base = Math.atan2(this.p.cy - oy, this.p.cx - ox);
    const n = A.bowFan.arrows;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * A.bowFan.spreadDeg * (Math.PI / 180);
      w.proj.spawn({ kind: 'boneArrow', faction: 'enemy', x: ox, y: oy, vx: Math.cos(a) * A.bowFan.speed, vy: Math.sin(a) * A.bowFan.speed, damage: this.dmg(A.bowFan.damage), source: this, knockback: 160 });
    }
    AudioManager.play('bowShoot');
  }

  private fireOrbs(ox: number, oy: number, dir: number): void {
    const M = A.mireOrbs;
    for (let i = 0; i < M.count; i++) {
      this.world.proj.spawn({
        kind: 'darkOrb',
        faction: 'enemy',
        x: ox,
        y: oy + i * 20,
        vx: dir * M.speed,
        vy: -80 + i * 80,
        damage: this.dmg(M.damage),
        lifeMs: M.homeMs,
        homing: { target: this.p, turnRate: M.turnRate },
        status: { id: 'slow', durationMs: balance.status.slow.durationMs, sourceId: this.uid },
        source: this,
        knockback: 60,
        poise: 0,
      });
    }
    AudioManager.play('hexCast');
  }

  private summonMinions(types: EnemyType[], glyphs: boolean): void {
    const w = this.world;
    const n = types.length;
    types.forEach((type, i) => {
      const x = Phaser.Math.Clamp(this.p.x + (i - (n - 1) / 2) * 140 + (Math.random() - 0.5) * 40, this.arena.x0 + 80, this.arena.x1 - 80);
      const y = this.y;
      if (glyphs) w.fx.glyph(x, y, 500, PAL.ruinGlow);
      w.scene.time.delayedCall(glyphs ? 500 : 100, () => {
        if (this.dead) return;
        const e = w.spawner.spawnEnemy(type, x, y, { required: false, aggro: true });
        if (e) this.minions.add(e);
      });
    });
  }

  private plantBanner(): void {
    const w = this.world;
    const side = this.p.x > this.x ? -1 : 1;
    const x = Phaser.Math.Clamp(this.x + side * 120, this.arena.x0 + 60, this.arena.x1 - 60);
    const bn = new Warbanner(w, x, this.y, (b) => {
      this.banners.delete(b);
      this.guardHit(A.warbanner.guardHit);
    });
    this.banners.add(bn);
    w.toast(STR.boss.warbanner, 'violet');
    w.cam.shake(4, 200);
  }

  private updateBanners(dt: number): void {
    if (!this.banners.size) {
      for (const m of this.minions) m.buffSpeedMul = 1;
      return;
    }
    for (const bn of this.banners) bn.step(dt);
    for (const m of this.minions) {
      const near = [...this.banners].some((bn) => Math.abs(bn.x - m.x) < A.warbanner.radius);
      m.buffSpeedMul = near ? 1 + A.warbanner.minionSpeedBuff : 1;
    }
  }

  private clearBanners(): void {
    for (const bn of this.banners) bn.remove();
    this.banners.clear();
  }

  private spawnEcho(delayMs: number, sideSign?: number): void {
    const w = this.world;
    const E = A.hollowEcho;
    const side = sideSign ?? (this.x < this.p.x ? 1 : -1);
    const x = Phaser.Math.Clamp(this.p.x + side * E.sideOffset, this.arena.x0 + 60, this.arena.x1 - 60);
    const s = w.scene.add.sprite(x, this.y, 'boss', 0).setOrigin(0.5, 1).setAlpha(0).setTint(PAL.ruinGlow).setDepth(319);
    s.setBlendMode(Phaser.BlendModes.ADD);
    if (w.scene.anims.exists('boss:idle')) s.play('boss:idle');
    w.scene.tweens.add({ targets: s, alpha: 0.5, duration: 300 });
    const attack = ECHOABLE.has(this.echoSource) ? this.echoSource : 'bowFan';
    this.echoes.push({ s, attack, t: -(E.delayMs + delayMs), teleMs: this.teleFor(attack), started: false, fired: false, life: E.lifeMs + delayMs, facing: x < this.p.x ? 1 : -1, hits: new Set() });
  }

  private updateEchoes(dt: number): void {
    const w = this.world;
    for (const e of [...this.echoes]) {
      e.t += dt;
      e.life -= dt;
      e.facing = e.s.x < this.p.x ? 1 : -1;
      e.s.setFlipX(e.facing < 0);
      if (e.t >= 0 && !e.started) {
        e.started = true;
        AudioManager.play('telegraph', { vol: 0.6 });
        if (e.attack === 'slam' || e.attack === 'cleave') w.fx.groundRing(e.s.x + e.facing * 90, this.y, PAL.ruinViolet, A.slam.w * 1.4, e.teleMs);
        else w.fx.glyph(e.s.x, this.y, e.teleMs, PAL.ruinViolet);
      }
      if (e.started && !e.fired) {
        e.s.setAlpha(Math.floor(e.t / 80) % 2 ? 0.35 : 0.65);
        if (e.t >= e.teleMs) {
          e.fired = true;
          e.s.setAlpha(0.5);
          this.echoAttack(e);
        }
      }
      if (e.life <= 0 || (e.fired && e.t > e.teleMs + 600)) {
        this.echoes = this.echoes.filter((o) => o !== e);
        w.scene.tweens.add({ targets: e.s, alpha: 0, duration: 300, onComplete: () => e.s.destroy() });
      }
    }
  }

  private echoAttack(e: Echo): void {
    const x = e.s.x;
    switch (e.attack) {
      case 'slam':
        return this.doSlam(x + e.facing * 90, e.facing, false, e.hits, true);
      case 'stompWave':
        return this.doSlam(x, e.facing, true, e.hits, true);
      case 'cleave':
        return this.doCleave(x, e.facing, e.hits);
      case 'mireOrbs':
        return this.fireOrbs(x + e.facing * 30, this.y - 80, e.facing);
      default:
        return this.fireFan(x + e.facing * 30, this.y - 74);
    }
  }

  private clearEchoes(): void {
    for (const e of this.echoes) e.s.destroy();
    this.echoes = [];
  }

  private igniteHellfire(): void {
    if (this.hell.on) return;
    this.hell.on = true;
    this.hell.t = 0;
    this.hell.warnT = K.hellfire.warnMs;
    this.hell.y = this.y;
    this.hell.g = this.world.scene.add.graphics().setDepth(7);
    this.world.toast(STR.boss.hellfire, 'red');
  }

  private updateHellfire(dt: number): void {
    const h = this.hell;
    if (!h.on || !h.g) return;
    const H = K.hellfire;
    const W = this.arena.x1 - this.arena.x0;
    h.t += dt;
    h.warnT -= dt;
    const maxEdge = Math.max(0, (W - H.minSafe) / 2);
    const edge = h.forceMin ? maxEdge : hellfireEdge(h.t, W);
    const next = h.forceMin ? maxEdge : hellfireEdge(h.t + H.warnMs, W);
    const g = h.g.clear();
    const pulse = 0.5 + 0.5 * Math.sin(this.glowT / 90);
    const y = h.y;
    const { x0, x1 } = this.arena;
    const live = h.warnT <= 0;
    g.fillStyle(0xff3020, live ? 0.3 + 0.15 * pulse : 0.15 * pulse).fillRect(x0, y - 60, edge, 64).fillRect(x1 - edge, y - 60, edge, 64);
    g.fillStyle(0xffa040, live ? 0.8 : 0.4 * pulse).fillRect(x0, y - 4, edge, 6).fillRect(x1 - edge, y - 4, edge, 6);
    if (next > edge) g.fillStyle(0xff6030, 0.35 * pulse).fillRect(x0 + edge, y - 3, next - edge, 4).fillRect(x1 - next, y - 3, next - edge, 4);
    g.fillStyle(PAL.cleanseGold, 0.9).fillRect(x0 + edge - 1, y - 90, 2, 94).fillRect(x1 - edge - 1, y - 90, 2, 94);
    if (Math.random() < 0.5 && edge > 0) {
      const fx = Math.random() < 0.5 ? x0 + Math.random() * edge : x1 - Math.random() * edge;
      this.world.fx.add({ x: fx, y: y - 4, vy: -90 - Math.random() * 60, life: 500, c: Math.random() < 0.5 ? 0xff6030 : 0xffc060 }, true);
    }
    if (!live) return;
    const p = this.world.player;
    const inFire = p.isAlive() && p.grounded && (p.x < x0 + edge || p.x > x1 - edge);
    h.tickT -= dt;
    if (inFire && h.tickT <= 0) {
      h.tickT = H.tickMs;
      this.world.combat.hit(p, { amount: (H.dps * H.tickMs) / 1000, kind: 'magic', faction: 'enemy', dirX: p.x < (x0 + x1) / 2 ? 1 : -1, knockback: 0, poise: 0, noHitStop: true, ignoreIFrames: true, guardPoise: 0 });
    }
  }

  private clearHellfire(): void {
    this.hell.g?.destroy();
    this.hell.g = null;
    this.hell.on = false;
  }

  private startLastStand(): void {
    const w = this.world;
    const LS = K.lastStand;
    this.lastStandUsed = true;
    this.uncancellable = true;
    this.ultimateTele = true;
    this.comboLeft = 0;
    this.alpha = 1;
    this.targetable = true;
    this.currentAttack = 'lastStand';
    this.invulnMs = LS.telegraphMs + LS.invulnMs;
    this.sub = 0;
    this.go('lastStand', LS.telegraphMs);
    AudioManager.play('roar');
    w.cam.shake(10, 900);
    w.fx.ring(this.x, this.cy, PAL.danger, 12, 900);
    GameEvents.emit('intro:card', { title: STR.boss.lastStand, subtitle: STR.boss.name, durationMs: 1500 });
  }

  private lastStandNext(): void {
    const LS = K.lastStand;
    const w = this.world;
    if (this.sub === 0) {
      this.sub = 1;
      this.stT = LS.invulnMs;
      this.ultimateTele = false;
      this.summonMinions([...Array<EnemyType>(LS.brutes).fill('brute'), ...Array<EnemyType>(LS.imps).fill('imp')], true);
      this.igniteHellfire();
      this.hell.forceMin = true;
      w.player.heal(LS.heroHeal);
      return;
    }
    this.uncancellable = false;
    this.invulnMs = 0;
    this.guard.breakNow(LS.executeMs);
    this.emitGuard(true);
    this.go('execute', LS.executeMs);
    w.fx.popText(this.x, this.body.y - 40, STR.boss.execute, PAL.cleanseGold, 3, 1000);
    AudioManager.play('liberate');
  }

  protected onGuardBroken(): void {
    if (this.st === 'transition' || this.st === 'lastStand' || this.st === 'execute' || this.st === 'dead' || this.st === 'intro') return;
    this.comboLeft = 0;
    this.alpha = 1;
    this.targetable = true;
    if (this.attack === 'hollowMeteor' && this.st === 'act') this.invulnMs = 0;
    this.restoreTint();
    this.body.setVelocityX(0);
    this.go('stagger', balance.guard.breakMs);
  }

  protected onPhaseEnter(ph: BossPhase, silent: boolean): void {
    this.clearBanners();
    if (ph === 4) this.igniteHellfire();
    if (silent) return;
    const w = this.world;
    this.uncancellable = true;
    this.comboLeft = 0;
    this.alpha = 1;
    this.targetable = true;
    this.go('transition', balance.bosses.global.transitionMs);
    AudioManager.play('roar');
    w.cam.shake(8, 500);
    w.fx.ring(this.x, this.cy, ph >= 3 ? PAL.danger : PAL.ruinGlow, 9, 700);
    w.fx.flash(ph >= 3 ? 0xff4040 : 0xc58bff, 0.4, 120);
    GameEvents.emit('intro:card', { title: STR.boss.phases[ph - 1]!, subtitle: STR.boss.name, durationMs: 1600 });
    if (ph === 2) {
      w.toast(STR.boss.wardTip, 'violet');
      this.summonMinions(Array<EnemyType>(K.shieldMinions).fill('raider'), true);
    } else if (ph === 3) this.summonMinions(['imp', 'imp'], true);
    w.proj.clearCircle(this.x, this.cy, 2000, 'enemy');
  }

  override limitDamage(dmg: number): number {
    if (this.st === 'lastStand') return 0;
    if (this.lastStandUsed || !this.fighting) return dmg;
    const floor = Math.ceil(this.maxHp * K.lastStand.floorFrac);
    return Math.max(0, Math.min(dmg, this.hp - floor));
  }

  onDeath(_hit: HitInfo, _k: KillType): void {
    this.st = 'dead';
    this.body.setVelocity(0, 0);
    this.alpha = 1;
    GameStore.setBoss(0, this.maxHp, this.phase);
    for (const m of this.minions) if (m.isAlive()) this.world.combat.hit(m, { amount: 9999, kind: 'contact', faction: 'neutral', dirX: 0, knockback: 0, poise: 0, ignoreIFrames: true, noHitStop: true });
    this.clearBanners();
    this.clearEchoes();
    this.clearHellfire();
    this.finishFight('kill');
    this.onDefeated?.();
  }

  override destroy(fromScene?: boolean): void {
    this.clearBanners();
    this.clearEchoes();
    this.clearHellfire();
    super.destroy(fromScene);
  }

  killMinions(): Enemy[] {
    return [...this.minions].filter((m) => m.isAlive());
  }
}
