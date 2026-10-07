import Phaser from 'phaser';
import { balance } from '@/config/balance';
import { PAL } from '@/config/palette';
import { STR } from '@/config/strings';
import { GameEvents } from '@/core/GameEvents';
import { GameStore } from '@/core/GameStore';
import { TimeController } from '@/core/TimeController';
import type { KillType } from '@/core/types';
import { AudioManager } from '@/audio/AudioManager';
import { comboLength, telegraphMs, type BossPhase } from '@/logic/boss';
import type { Enemy } from '@/entities/enemies/Enemy';
import type { World } from '@/game/World';
import type { HitInfo } from '@/systems/CombatSystem';
import type { Actor } from '../Actor';
import { BossBase } from './BossBase';
import { Pylon } from './Pylon';

const G = balance.garjana;
const A = G.attacks;
export type GarjanaAttackId = keyof typeof A;
type GState = 'intro' | 'hover' | 'glide' | 'tele' | 'act' | 'recover' | 'transition' | 'exposed' | 'stormDown' | 'judgment' | 'dead';
interface Pt {
  x: number;
  y: number;
}

/** Garjana, the Storm Archer — v3 four-phase flying boss (Addendum v2 §A7, Boss Buff v3 §B5). */
export class Garjana extends BossBase {
  readonly displayName = STR.garjana.name;
  readonly displayTitle = STR.garjana.title;
  st: GState = 'intro';
  private stT = 0;
  private attack: GarjanaAttackId = 'lightningArrow';
  private last: GarjanaAttackId | null = null;
  private comboLeft = 0;
  private sub = 0;
  private subT = 0;
  private glowT = 0;
  private anchor = 1;
  private from: Pt = { x: 0, y: 0 };
  private to: Pt = { x: 0, y: 0 };
  private barrierWanted = false;
  private barrierDownMs = 0;
  private barrierWasUp = false;
  private barrierTipShown = false;
  private tingCd = 0;
  private flinchCd = 0;
  private gustT = 0;
  private pylons = new Set<Pylon>();
  private hawks = new Set<Enemy>();
  private hawkBatch = 0;
  private judged = [false, false];
  private judgmentIdx = 0;
  private pads: Pt[] = [];
  private rainXs: number[] = [];
  private hopPts: Pt[] = [];
  private diveTarget: Pt = { x: 0, y: 0 };
  private diveHit = false;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private dark: Phaser.GameObjects.Rectangle | null = null;
  private readonly groundY: number;
  private readonly main: { x0: number; x1: number };

  constructor(world: World, x: number, y: number) {
    super(world, x, y, 'garjana', 60, 96, 'garjana');
    this.flying = true;
    this.body.setAllowGravity(false);
    this.groundY = world.level.groundY;
    const widest = [...world.level.solids].sort((a, b) => b.w - a.w)[0];
    this.main = widest ? { x0: widest.x + 50, x1: widest.x + widest.w - 50 } : { x0: this.arena.x0 + 100, x1: this.arena.x1 - 100 };
    const hy = this.groundY - (G.hoverMin + G.hoverMax) / 2;
    this.setPosition(x, hy);
    this.to = { x, y: hy };
    this.targetWeight = 1;
    this.setDepth(320);
    this.face(-1);
    this.invulnMs = 1e9;
    this.anim('roar');
    this.gfx = world.scene.add.graphics().setDepth(330);
  }

  override get superArmor(): boolean {
    return true;
  }
  get barrierUp(): boolean {
    return this.barrierWanted && this.barrierDownMs <= 0 && this.st !== 'exposed' && this.st !== 'stormDown' && this.st !== 'dead' && !this.guard.broken;
  }
  get pylonCount(): number {
    return this.pylons.size;
  }
  private get p(): Actor {
    return this.world.player;
  }

  private go(s: GState, ms: number): void {
    this.st = s;
    this.stT = ms;
  }

  override beginFight(): void {
    super.beginFight();
    this.go('hover', 800);
  }

  // ------------------------------------------------------------------ damage rules
  override damageTakenMul(h: HitInfo): number {
    if (h.deflected) {
      this.onDeflected();
      const flat = h.kind === 'magic' ? G.orbDeflectFlat : G.deflectFlat;
      return flat / Math.max(1, h.amount) / Math.max(0.05, 1 - this.armor);
    }
    return super.damageTakenMul(h);
  }
  protected override extraTakenMul(h: HitInfo): number {
    if (h.kind === 'arrow') {
      if (this.barrierUp) {
        this.ting();
        return 0;
      }
      return G.bowMul;
    }
    if (h.kind === 'lightning') return G.staffMul;
    return 1;
  }
  override limitDamage(dmg: number): number {
    if (this.st === 'judgment' || this.st === 'transition') return 0;
    if (this.judged[1] || !this.fighting) return dmg;
    return Math.max(0, Math.min(dmg, this.hp - Math.ceil(this.maxHp * G.judgmentFloorFrac)));
  }
  override guardHit(poise: number): void {
    super.guardHit(this.st === 'stormDown' ? poise * G.pylons.stormDownGuardMul : poise);
  }

  private ting(): void {
    const w = this.world;
    if (this.tingCd > 0) return;
    this.tingCd = 600;
    AudioManager.play('deflect');
    w.fx.popText(this.x, this.body.y - 20, STR.garjana.barrier, PAL.statusCyan, 2, 600);
    if (!this.barrierTipShown) {
      this.barrierTipShown = true;
      w.toast(STR.garjana.barrierTip, 'cyan');
    }
  }

  private onDeflected(): void {
    if (this.flinchCd > 0 || this.st === 'transition' || this.st === 'judgment' || this.st === 'dead' || this.st === 'stormDown') return;
    const w = this.world;
    this.flinchCd = G.flinchCdMs;
    TimeController.hitStop(90, 30);
    w.fx.ring(this.x, this.cy, PAL.cleanseGold, 8, 400);
    w.fx.popText(this.x, this.body.y - 40, STR.garjana.perfect, PAL.cleanseGold, 3, 1000);
    GameEvents.emit('boss:perfectDeflect', {});
    this.comboLeft = 0;
    this.expose(G.flinchMs, this.groundY - G.flinchY);
  }

  /** Drops to a reachable height above the main island with the barrier down. */
  private expose(ms: number, y: number, state: GState = 'exposed'): void {
    this.to = { x: Phaser.Math.Clamp(this.x, this.main.x0, this.main.x1), y };
    this.barrierDownMs = Math.max(this.barrierDownMs, ms);
    this.restoreTint();
    this.anim('hurt');
    this.go(state, ms);
  }

  protected onGuardBroken(): void {
    if (this.st === 'transition' || this.st === 'judgment' || this.st === 'dead' || this.st === 'intro') return;
    this.comboLeft = 0;
    this.expose(balance.guard.breakMs, this.groundY - G.lowHover);
  }

  // ------------------------------------------------------------------ main loop
  step(dt: number): void {
    this.tickBase(dt);
    if (this.dead) return;
    this.stepCore(dt);
    this.stT -= dt;
    this.subT -= dt;
    this.glowT += dt;
    if (this.barrierDownMs > 0) this.barrierDownMs -= dt;
    if (this.flinchCd > 0) this.flinchCd -= dt;
    if (this.tingCd > 0) this.tingCd -= dt;
    this.body.setVelocity(0, 0);
    this.guard.frozen = this.barrierUp;
    this.updateHawks();
    this.updateGusts(dt);
    this.drawOverlay();
    this.world.cam.frame = { x: this.x, y: this.cy - 40 };
    if (this.fighting && this.phase === 4 && this.st !== 'transition' && this.st !== 'judgment') {
      for (let i = 0; i < 2; i++)
        if (!this.judged[i] && this.hp / this.maxHp <= G.judgment[i]!.at) {
          this.startJudgment(i);
          break;
        }
    }
    const bob = Math.sin(this.glowT / 300) * G.bob;
    switch (this.st) {
      case 'intro':
        this.moveTo(this.to.x, this.to.y + bob, 4, dt);
        return;
      case 'transition':
        this.anim('roar');
        this.moveTo(this.to.x, this.to.y, 3, dt);
        if (this.stT <= 0) {
          this.uncancellable = false;
          this.invulnMs = 0;
          this.startGlide();
        }
        return;
      case 'hover':
        this.face(this.p.x - this.x);
        this.anim('idle');
        this.moveTo(this.to.x, this.to.y + bob, 6, dt);
        if (this.stT <= 0) this.choose(false);
        return;
      case 'glide': {
        const t = Phaser.Math.Clamp(1 - this.stT / G.glideMs, 0, 1);
        const s = t * t * (3 - 2 * t);
        this.anim('idle');
        this.setPosition(Phaser.Math.Linear(this.from.x, this.to.x, s), Phaser.Math.Linear(this.from.y, this.to.y, s));
        if (this.stT <= 0) this.go('hover', this.gap());
        return;
      }
      case 'tele':
        this.moveTo(this.to.x, this.to.y + bob, 6, dt);
        if (this.flashMs <= 0) this.setTint(Math.floor(this.glowT / 80) % 2 ? PAL.statusCyan : 0xffffff);
        if (this.stT <= 0) this.startAct();
        return;
      case 'act':
        this.act(dt);
        return;
      case 'recover':
        this.moveTo(this.to.x, this.to.y + bob, 6, dt);
        if (this.stT <= 0) {
          this.restoreTint();
          if (this.comboLeft > 0) this.choose(true);
          else this.startGlide();
        }
        return;
      case 'exposed':
      case 'stormDown':
        this.moveTo(this.to.x, this.to.y, 8, dt);
        if (this.flashMs <= 0) this.setTint(Math.floor(this.glowT / 140) % 2 ? 0x9fd8ff : 0xffffff);
        if (this.stT <= 0) {
          this.restoreTint();
          this.startGlide();
        }
        return;
      case 'judgment':
        this.anim('cast');
        this.moveTo(this.to.x, this.to.y, 4, dt);
        if (this.stT <= 0) this.strikeJudgment();
        return;
    }
  }

  private moveTo(tx: number, ty: number, k: number, dt: number): void {
    const f = 1 - Math.exp((-k * dt) / 1000);
    this.setPosition(this.x + (tx - this.x) * f, this.y + (ty - this.y) * f);
  }

  private startGlide(): void {
    let a = this.anchor;
    while (a === this.anchor) a = Math.floor(Math.random() * G.anchorsFrac.length);
    this.anchor = a;
    this.from = { x: this.x, y: this.y };
    this.to = {
      x: this.arena.x0 + (this.arena.x1 - this.arena.x0) * G.anchorsFrac[a]!,
      y: this.groundY - Phaser.Math.Between(G.hoverMin, G.hoverMax),
    };
    this.go('glide', G.glideMs);
  }

  private choose(chain: boolean): void {
    if (!chain) this.comboLeft = comboLength(this.phase, this.world.rng);
    this.comboLeft--;
    const weights: Partial<Record<GarjanaAttackId, number>> = { ...G.weights[this.phase] };
    if (this.hawks.size > 0) delete weights.stormHawks;
    if (chain) {
      delete weights.skyDive;
      delete weights.stormHawks;
    }
    this.attack = this.world.rng.weighted<GarjanaAttackId>(weights, this.last) ?? 'lightningArrow';
    this.last = this.attack;
    this.currentAttack = this.attack;
    this.startTele();
  }

  private floorAt(x: number): number {
    let best = this.p.y;
    let found = false;
    for (const r of this.world.level.solids) {
      if (x < r.x || x > r.x + r.w || r.y < this.p.y - 60) continue;
      if (!found || r.y < best) best = r.y;
      found = true;
    }
    return found ? best : this.p.y;
  }

  private startTele(): void {
    const a = A[this.attack];
    const ms = telegraphMs(a.telegraphMs, this.phase, a.ranged);
    this.go('tele', ms);
    this.face(this.p.x - this.x);
    AudioManager.play('telegraph');
    const w = this.world;
    switch (this.attack) {
      case 'lightningArrow':
      case 'updraftBurst':
        this.anim('bow');
        break;
      case 'thunderRain':
        this.anim('cast');
        this.rainXs = this.rainMarkers();
        for (const x of this.rainXs) w.fx.groundRing(x, this.floorAt(x), PAL.statusCyan, A.thunderRain.r * 2, ms);
        break;
      case 'skyDive':
        this.anim('windup');
        this.to = { x: this.x, y: this.y - 60 };
        this.diveTarget = { x: Phaser.Math.Clamp(this.p.x, this.arena.x0 + 60, this.arena.x1 - 60), y: this.p.y };
        w.fx.groundRing(this.diveTarget.x, this.diveTarget.y, PAL.danger, 120, ms);
        break;
      case 'chainStorm':
        this.anim('cast');
        this.hopPts = this.chainPoints();
        w.fx.glyph(this.x, this.y, ms, PAL.statusCyan);
        break;
      case 'stormSurge':
        this.anim('roar');
        w.fx.ring(this.x, this.cy, PAL.statusCyan, 8, ms);
        break;
      default:
        this.anim('cast');
        w.fx.glyph(this.x, this.y, ms, PAL.statusCyan);
    }
  }

  private rainMarkers(): number[] {
    const R = A.thunderRain;
    const side = Math.random() < 0.5 ? -1 : 1;
    const offs = [0, -R.spread, R.spread, side * R.spread * 2].slice(0, R.markers);
    const widen = side * (R.minGap - (R.spread - 2 * R.r));
    return offs.map((o) => {
      const shifted = o * side > 0 ? o + widen : o;
      return Phaser.Math.Clamp(this.p.x + shifted + (Math.random() - 0.5) * R.jitter, this.arena.x0 + 30, this.arena.x1 - 30);
    });
  }

  private chainPoints(): Pt[] {
    const pts: Pt[] = [{ x: this.p.x, y: this.p.y }];
    const tops = this.world.level.solids
      .filter((r) => r.x + r.w > this.arena.x0 && r.x < this.arena.x1)
      .map((r) => ({ x: r.x + r.w / 2, y: r.y }))
      .sort((a, b) => Math.abs(a.x - this.p.x) - Math.abs(b.x - this.p.x));
    for (const t of tops) {
      if (pts.length >= A.chainStorm.hops) break;
      if (pts.some((q) => Math.abs(q.x - t.x) < 80)) continue;
      pts.push(t);
    }
    while (pts.length < A.chainStorm.hops) pts.push({ x: this.p.x + (pts.length % 2 ? 160 : -160), y: this.p.y });
    return pts;
  }

  private startAct(): void {
    this.restoreTint();
    this.sub = 0;
    this.subT = 0;
    const w = this.world;
    switch (this.attack) {
      case 'lightningArrow':
        this.fireLightning();
        if (Math.random() < A.lightningArrow.volleyChance) {
          this.sub = 1;
          this.subT = A.lightningArrow.volleyGapMs;
          this.go('act', 99999);
          return;
        }
        return this.endAct();
      case 'thunderRain':
        for (const x of this.rainXs) this.strike(x, this.floorAt(x), A.thunderRain.r, A.thunderRain.damage);
        if (this.phase >= 3) this.barrierDownMs = Math.max(this.barrierDownMs, G.barrier.rainDropMs);
        return this.endAct();
      case 'updraftBurst':
        this.fireFan(A.updraftBurst.arrows, A.updraftBurst.spreadDeg, A.updraftBurst.speed, A.updraftBurst.damage);
        return this.endAct();
      case 'stormHawks':
        this.spawnHawks();
        return this.endAct();
      case 'skyDive':
        this.anim('dive');
        this.diveHit = false;
        this.go('act', 99999);
        return;
      case 'chainStorm':
        w.fx.groundRing(this.hopPts[0]!.x, this.hopPts[0]!.y, PAL.statusCyan, A.chainStorm.r * 2, A.chainStorm.hopMs);
        this.subT = A.chainStorm.hopMs;
        this.go('act', 99999);
        return;
      case 'stormOrbs':
        this.sub = A.stormOrbs.count;
        this.go('act', 99999);
        return;
      case 'tempest':
        this.sub = A.tempest.rings;
        this.go('act', 99999);
        return;
      case 'stormSurge':
        this.sub = A.stormSurge.pulses;
        this.go('act', 99999);
        return;
    }
  }

  private endAct(): void {
    this.go('recover', this.comboLeft > 0 ? balance.bosses.global.comboGapMs : A[this.attack].recoverMs);
  }

  private act(dt: number): void {
    const w = this.world;
    switch (this.attack) {
      case 'lightningArrow':
        if (this.subT <= 0) {
          this.fireLightning();
          this.endAct();
        }
        return;
      case 'stormOrbs':
        if (this.subT <= 0 && this.sub > 0) {
          this.sub--;
          this.subT = A.stormOrbs.gapMs;
          this.fireOrb();
        }
        if (this.sub <= 0 && this.subT <= 0) this.endAct();
        return;
      case 'tempest':
        if (this.subT <= 0 && this.sub > 0) {
          const T = A.tempest;
          const off = ((T.rings - this.sub) % 2) * (Math.PI / T.perRing);
          for (let i = 0; i < T.perRing; i++) {
            const a = off + (i * Math.PI * 2) / T.perRing;
            w.proj.spawn({ kind: 'boneArrow', faction: 'enemy', x: this.x, y: this.cy, vx: Math.cos(a) * T.speed, vy: Math.sin(a) * T.speed, damage: this.dmg(T.damage), source: this, knockback: 120, lifeMs: 3500 });
          }
          AudioManager.play('bowShoot');
          this.sub--;
          this.subT = T.gapMs;
        }
        if (this.sub <= 0 && this.subT <= 0) this.endAct();
        return;
      case 'stormSurge':
        if (this.subT <= 0 && this.sub > 0) {
          const U = A.stormSurge;
          const x = Phaser.Math.Clamp(this.x, this.main.x0, this.main.x1);
          for (const d of [-1, 1]) w.proj.spawn({ kind: 'shock', faction: 'enemy', x: x + d * 20, y: this.floorAt(x), vx: d * U.speed, vy: 0, damage: this.dmg(U.damage), range: 1600, knockback: 160, poise: 8, w: 24, h: U.height, damageKind: 'crush', source: this });
          w.fx.ring(x, this.floorAt(x) - 20, PAL.statusCyan, 6, 300);
          w.cam.shake(4, 150);
          this.sub--;
          this.subT = U.gapMs;
        }
        if (this.sub <= 0 && this.subT <= 0) this.endAct();
        return;
      case 'chainStorm':
        if (this.subT <= 0) {
          const C = A.chainStorm;
          const pt = this.hopPts[this.sub]!;
          this.strike(pt.x, pt.y, C.r, C.damage);
          this.sub++;
          this.subT = C.hopMs;
          const next = this.hopPts[this.sub];
          if (next && this.sub < C.hops) w.fx.groundRing(next.x, next.y, PAL.statusCyan, C.r * 2, C.hopMs);
          else this.endAct();
        }
        return;
      case 'skyDive': {
        const D = A.skyDive;
        const dx = this.diveTarget.x - this.x;
        const dy = this.diveTarget.y - this.y;
        const dist = Math.hypot(dx, dy);
        const step = (D.speed * dt) / 1000;
        if (!this.diveHit && Math.abs(this.p.x - this.x) < 50 && Math.abs(this.p.y - this.y) < 80) {
          this.diveHit = true;
          this.hitHero(D.damage, this.x, false, 260);
        }
        if (dist <= step) {
          this.setPosition(this.diveTarget.x, this.diveTarget.y);
          w.cam.shake(6, 250);
          w.fx.ring(this.x, this.y - 10, PAL.statusCyan, 8, 400);
          this.comboLeft = 0;
          this.expose(D.recoverMs, this.diveTarget.y);
          this.barrierDownMs = this.pylons.size > 0 ? G.barrier.diveWindowPylonMs : G.barrier.diveWindowMs;
        } else this.setPosition(this.x + (dx / dist) * step, this.y + (dy / dist) * step);
        return;
      }
      default:
        this.endAct();
    }
  }

  // ------------------------------------------------------------------ attack helpers
  private hitHero(v3: number, fromX: number, ultimate = false, kb = 160): void {
    this.world.combat.hit(this.p, { amount: this.dmg(v3, ultimate), kind: 'lightning', faction: 'enemy', dirX: Math.sign(this.p.x - fromX) || 1, knockback: kb, poise: 10, source: this });
  }

  private strike(x: number, y: number, r: number, v3: number): void {
    const w = this.world;
    const col = w.scene.add.rectangle(x, y, r, 700, PAL.statusCyan, 0.85).setOrigin(0.5, 1).setDepth(340);
    w.scene.tweens.add({ targets: col, alpha: 0, scaleX: 0.2, duration: 300, onComplete: () => col.destroy() });
    w.fx.burst(x, y - 10, 10, [0xffffff, PAL.statusCyan], { speed: 220, life: 300 });
    AudioManager.play('thunder');
    if (Math.abs(this.p.x - x) < r + this.p.bodyW / 2 && this.p.y > y - 400 && this.p.y < y + 40) this.hitHero(v3, x);
  }

  private fireLightning(): void {
    const w = this.world;
    const L = A.lightningArrow;
    const ox = this.x + this.facing * 30;
    const oy = this.cy;
    const tx = this.p.x;
    const ty = this.floorAt(tx);
    const ang = Math.atan2(this.p.cy - oy, tx - ox);
    w.proj.spawn({ kind: 'boneArrow', faction: 'enemy', x: ox, y: oy, vx: Math.cos(ang) * L.speed, vy: Math.sin(ang) * L.speed, damage: this.dmg(L.damage), source: this, knockback: 160, lifeMs: 3000 });
    AudioManager.play('bowShoot');
    const travel = (Math.hypot(tx - ox, ty - oy) / L.speed) * 1000;
    w.scene.time.delayedCall(travel, () => {
      if (this.dead || !this.active) return;
      w.fx.groundRing(tx, ty, PAL.statusCyan, L.columnR * 2, L.columnDelayMs);
      w.scene.time.delayedCall(L.columnDelayMs, () => {
        if (!this.dead && this.active) this.strike(tx, ty, L.columnR, L.columnDamage);
      });
    });
  }

  private fireFan(n: number, spreadDeg: number, speed: number, v3: number): void {
    const w = this.world;
    const ox = this.x + this.facing * 30;
    const oy = this.cy;
    const base = Math.atan2(this.p.cy - oy, this.p.cx - ox);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * spreadDeg * (Math.PI / 180);
      w.proj.spawn({ kind: 'boneArrow', faction: 'enemy', x: ox, y: oy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, damage: this.dmg(v3), source: this, knockback: 140 });
    }
    AudioManager.play('bowShoot');
  }

  private fireOrb(): void {
    const O = A.stormOrbs;
    this.world.proj.spawn({
      kind: 'darkOrb',
      faction: 'enemy',
      x: this.x,
      y: this.cy,
      vx: this.facing * O.speed,
      vy: -60,
      damage: this.dmg(O.damage),
      lifeMs: O.lifeMs,
      homing: { target: this.p, turnRate: O.turnRate },
      source: this,
      knockback: 80,
      poise: 0,
    });
    AudioManager.play('hexCast');
  }

  private spawnHawks(): void {
    const w = this.world;
    const H = A.stormHawks;
    for (let i = 0; i < H.count; i++) {
      const x = Phaser.Math.Clamp(this.x + (i ? 140 : -140), this.arena.x0 + 80, this.arena.x1 - 80);
      w.fx.glyph(x, this.y, 400, PAL.statusCyan);
      const e = w.spawner.spawnEnemy('skyCaller', x, this.y, { required: false, aggro: true });
      if (!e) continue;
      e.maxHp = e.hp = H.hp;
      e.setTint(0x9fd8ff);
      this.hawks.add(e);
    }
    this.hawkBatch = this.hawks.size;
  }

  private updateHawks(): void {
    if (!this.hawks.size) return;
    const H = A.stormHawks;
    for (const h of [...this.hawks]) {
      if (h.isAlive()) continue;
      this.hawks.delete(h);
      if (Math.random() < H.pranaChance) this.world.loot.drop(h.x, h.y, [{ kind: 'prana', value: 15 }], 0.2);
    }
    if (this.hawkBatch >= H.count && this.hawks.size === 0) {
      this.hawkBatch = 0;
      this.guardHit(H.guardHit);
      this.barrierDownMs = Math.max(this.barrierDownMs, H.barrierDropMs);
      this.world.toast(STR.garjana.hawksDown, 'cyan');
    }
  }

  private updateGusts(dt: number): void {
    if (this.phase < 3 || !this.fighting) return;
    this.gustT += dt;
    const every = this.phase === 4 ? G.gustEveryMs[4] : G.gustEveryMs[3];
    if (this.gustT >= every) {
      this.gustT = 0;
      this.world.hazards?.startGust(Math.random() < 0.5 ? 1 : -1);
    }
  }

  private spawnPylons(): void {
    const w = this.world;
    const cands = w.level.solids.filter((r) => r.w < 400 && r.x + r.w > this.arena.x0 && r.x < this.arena.x1);
    Phaser.Utils.Array.Shuffle(cands);
    for (const r of cands) {
      if (this.pylons.size >= G.pylons.count) break;
      const x = r.x + r.w / 2;
      if ([...this.pylons].some((p) => Math.abs(p.x - x) < 60)) continue;
      const py = new Pylon(w, x, r.y, G.pylons.hp, (p) => {
        this.pylons.delete(p);
        if (this.pylons.size === 0 && this.barrierWanted) this.stormDown();
      });
      this.pylons.add(py);
    }
  }

  private stormDown(): void {
    if (this.dead || this.st === 'transition' || this.st === 'judgment') return;
    const w = this.world;
    this.comboLeft = 0;
    this.uncancellable = false;
    this.expose(G.pylons.stormDownMs, this.groundY, 'stormDown');
    w.fx.popText(this.x, this.body.y - 40, STR.garjana.stormDown, PAL.statusCyan, 3, 1200);
    w.toast(STR.garjana.stormDown, 'cyan');
    w.cam.shake(8, 400);
  }

  private pickPads(n: number, reach: number): Pt[] {
    const w = this.world;
    const all: Pt[] = [...(w.level.safeAnchors ?? []), ...w.level.solids.map((r) => ({ x: r.x + r.w / 2, y: r.y }))].filter((q) => q.x > this.arena.x0 && q.x < this.arena.x1);
    const uniq = all.filter((q, i) => all.findIndex((o) => Math.abs(o.x - q.x) < 100 && Math.abs(o.y - q.y) < 40) === i);
    const near = uniq.filter((q) => Math.abs(q.x - this.p.x) <= reach);
    Phaser.Utils.Array.Shuffle(near);
    const pick = near.slice(0, n);
    if (pick.length < n) pick.push(...uniq.filter((q) => !pick.includes(q)).sort((a, b) => Math.abs(a.x - this.p.x) - Math.abs(b.x - this.p.x)).slice(0, n - pick.length));
    return pick;
  }

  private startJudgment(i: number): void {
    const w = this.world;
    const J = G.judgment[i]!;
    this.judged[i] = true;
    this.judgmentIdx = i;
    this.uncancellable = true;
    this.ultimateTele = true;
    this.comboLeft = 0;
    this.restoreTint();
    this.invulnMs = J.telegraphMs;
    this.pads = this.pickPads(J.pads, J.reach);
    this.to = { x: (this.arena.x0 + this.arena.x1) / 2, y: this.groundY - G.hoverMax };
    this.go('judgment', J.telegraphMs);
    this.currentAttack = 'judgment';
    this.dark?.destroy();
    this.dark = w.scene.add.rectangle(-200, -200, 3000, 2000, 0x02030a, 0).setOrigin(0).setScrollFactor(0).setDepth(325);
    w.scene.tweens.add({ targets: this.dark, fillAlpha: 0.55, duration: 400 });
    for (const pad of this.pads) w.fx.groundRing(pad.x, pad.y, PAL.statusCyan, J.padR * 2, J.telegraphMs);
    AudioManager.play('roar');
    GameEvents.emit('intro:card', { title: STR.garjana.judgment, subtitle: STR.garjana.judgmentTip, durationMs: 1400 });
  }

  private strikeJudgment(): void {
    const w = this.world;
    const J = G.judgment[this.judgmentIdx]!;
    const safe = this.pads.some((q) => Math.abs(this.p.x - q.x) < J.padR && Math.abs(this.p.y - q.y) < 50);
    w.fx.flash(0xe8f4ff, 0.8, 200);
    w.cam.shake(12, 500);
    AudioManager.play('thunder');
    if (!safe) this.hitHero(J.damage, this.x, true, 200);
    this.dark?.destroy();
    this.dark = null;
    this.pads = [];
    this.ultimateTele = false;
    this.uncancellable = false;
    this.invulnMs = 0;
    if (this.judgmentIdx === 1) {
      this.guard.breakNow(J.vulnMs);
      this.emitGuard(true);
      this.expose(J.vulnMs, this.groundY);
    } else this.expose(J.vulnMs, this.groundY - G.lowHover);
  }

  private drawOverlay(): void {
    const g = this.gfx;
    g.clear();
    const up = this.barrierUp;
    if (up !== this.barrierWasUp) {
      this.barrierWasUp = up;
      GameEvents.emit('boss:barrier', { up });
    }
    const flicker = this.barrierWanted && this.barrierDownMs > 0 && this.barrierDownMs < G.barrier.flickerMs && this.st !== 'exposed' && this.st !== 'stormDown';
    if (up || (flicker && Math.floor(this.glowT / 60) % 2)) {
      const r = 78 + Math.sin(this.glowT / 120) * 4;
      g.lineStyle(3, PAL.statusCyan, 0.55).strokeCircle(this.x, this.cy, r);
      g.lineStyle(1, 0xffffff, 0.5).strokeCircle(this.x, this.cy, r - 8);
      for (let i = 0; i < 6; i++) {
        const a = this.glowT / 200 + (i * Math.PI) / 3;
        g.fillStyle(0xd8f4ff, 0.7).fillRect(this.x + Math.cos(a) * r - 2, this.cy + Math.sin(a) * r - 2, 4, 4);
      }
    }
    if (this.st === 'tele' && this.attack === 'lightningArrow') g.lineStyle(1, PAL.danger, 0.8).lineBetween(this.x + this.facing * 30, this.cy, this.p.x, this.p.cy);
    for (const q of this.pads) g.fillStyle(PAL.statusCyan, 0.35 + 0.2 * Math.sin(this.glowT / 100)).fillEllipse(q.x, q.y - 4, G.judgment[this.judgmentIdx]!.padR * 2, 16);
  }

  // ------------------------------------------------------------------ phases & death
  protected onPhaseEnter(ph: BossPhase, silent: boolean): void {
    this.barrierWanted = ph >= 2;
    if (ph >= 2) this.spawnPylons();
    this.gustT = 0;
    if (silent) return;
    const w = this.world;
    this.uncancellable = true;
    this.comboLeft = 0;
    this.restoreTint();
    this.to = { x: (this.arena.x0 + this.arena.x1) / 2, y: this.groundY - G.transitionAltitude };
    this.go('transition', balance.bosses.global.transitionMs);
    AudioManager.play('roar');
    w.cam.shake(8, 500);
    w.fx.ring(this.x, this.cy, PAL.statusCyan, 9, 700);
    w.fx.flash(0x9fd8ff, 0.4, 120);
    GameEvents.emit('intro:card', { title: STR.garjana.phases[ph - 1]!, subtitle: STR.garjana.name, durationMs: 1600 });
    if (ph === 2) w.toast(STR.garjana.pylonTip, 'cyan');
    w.proj.clearCircle(this.x, this.cy, 2400, 'enemy');
  }

  onDeath(_hit: HitInfo, _k: KillType): void {
    this.st = 'dead';
    this.body.setVelocity(0, 0);
    GameStore.setBoss(0, this.maxHp, this.phase);
    for (const h of this.hawks) if (h.isAlive()) this.world.combat.hit(h, { amount: 9999, kind: 'contact', faction: 'neutral', dirX: 0, knockback: 0, poise: 0, ignoreIFrames: true, noHitStop: true });
    this.cleanup();
    this.finishFight('kill');
    this.onDefeated?.();
  }

  private cleanup(): void {
    this.world.cam.frame = null;
    this.gfx.clear();
    this.dark?.destroy();
    this.dark = null;
    for (const p of this.pylons) {
      this.world.extraHostiles.delete(p);
      p.destroy();
    }
    this.pylons.clear();
  }

  override destroy(fromScene?: boolean): void {
    if (this.scene) this.cleanup();
    this.gfx.destroy();
    super.destroy(fromScene);
  }
}
