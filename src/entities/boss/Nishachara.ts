import Phaser from 'phaser';
import { balance } from '@/config/balance';
import { PAL } from '@/config/palette';
import { STR } from '@/config/strings';
import { GameEvents } from '@/core/GameEvents';
import { GameStore } from '@/core/GameStore';
import { SaveManager } from '@/core/SaveManager';
import type { KillType } from '@/core/types';
import { AudioManager } from '@/audio/AudioManager';
import { comboLength, telegraphMs, type BossPhase } from '@/logic/boss';
import type { Player } from '@/entities/player/Player';
import type { World } from '@/game/World';
import type { HitInfo, HitResult } from '@/systems/CombatSystem';
import { BossBase } from './BossBase';
import { ShadowClone, cloneShuffle, type CloneOwner } from './ShadowClone';

const N = balance.nishachara;
const A = N.attacks;
export type NishAttackId = keyof typeof A;
type NState = 'intro' | 'idle' | 'tele' | 'act' | 'recover' | 'transition' | 'exposed' | 'stagger' | 'shadows' | 'dead';
interface Pt {
  x: number;
  y: number;
}
interface Seg {
  x0: number;
  x1: number;
  y: number;
}
const VIOLET = 0xb080ff;
const CRIMSON = 0xff2a40;

/** Nishachara, the Veiled Blade — v3 four-phase ninja boss (Addendum v2 §A8, Boss Buff v3 §B6). */
export class Nishachara extends BossBase implements CloneOwner {
  readonly displayName = STR.nishachara.name;
  readonly displayTitle = STR.nishachara.title;
  readonly clones = new Set<ShadowClone>();
  st: NState = 'intro';
  private stT = 0;
  private attack: NishAttackId = 'kunaiFan';
  private last: NishAttackId | null = null;
  private comboLeft = 0;
  private subT = 0;
  private glowT = 0;
  private veilT = 0;
  private veilCd = 2500;
  private visibleT = 0;
  private revealT = 0;
  private tellT = 0;
  private takenMul = 1;
  private cloneCd = 0;
  private cloneBatch = 0;
  private batchT = 0;
  private smoke: { x: number; y: number; t: number } | null = null;
  private smokeTarget: Pt = { x: 0, y: 0 };
  private markT = 0;
  private markPulled = false;
  private purgeT = 0;
  private eclipseT = 0;
  private tideT = 0;
  private tideSteps = 0;
  private tideWarned = false;
  private shadowsDone = [false, false];
  private shadowIdx = 0;
  private shadowQueue: (ShadowClone | 'real')[] = [];
  private dashPts: Pt[] = [];
  private dashN = 0;
  private dashT = 0;
  private dashHit = false;
  private hook: { from: Pt; to: Pt; anchor: Pt; bottom: number; t: number; hit: boolean } | null = null;
  private swapWith: ShadowClone | null = null;
  private tipShown = false;
  private readonly segs: Seg[];
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly hud: Phaser.GameObjects.Graphics;
  private dim: Phaser.GameObjects.Rectangle | null = null;

  constructor(world: World, x: number, y: number) {
    super(world, x, y, 'nishachara', N.bodyW, N.bodyH, 'nishachara');
    const L = world.level;
    const solids = L.solids.filter((s) => s.y > 0 && s.w < L.width).map((s) => ({ x0: s.x, x1: s.x + s.w, y: s.y }));
    const ows = (L.oneWays ?? []).map((s) => ({ x0: s.x, x1: s.x + s.w, y: s.y }));
    this.segs = [...solids, ...ows].filter((s) => s.x1 > this.arena.x0 && s.x0 < this.arena.x1);
    this.setDepth(300);
    this.face(-1);
    this.invulnMs = 1e9;
    this.anim('roar');
    this.gfx = world.scene.add.graphics().setDepth(331);
    this.hud = world.scene.add.graphics().setDepth(900).setScrollFactor(0);
  }

  override get superArmor(): boolean {
    return true;
  }
  get veiled(): boolean {
    return this.veilT > 0 && this.visibleT <= 0 && this.revealT <= 0 && this.eclipseT <= 0 && (this.st === 'idle' || this.st === 'tele' || this.st === 'act' || this.st === 'recover');
  }
  /** Alpha shared by the real one and its clones. */
  get veilAlpha(): number {
    if (this.eclipseT > 0 || this.st === 'shadows') return 0.55 + 0.1 * Math.sin(this.glowT / 90);
    if (!this.veiled) return 1;
    return this.tellT > 0 && Math.floor(this.glowT / 70) % 2 ? N.tellAlpha : N.veilAlpha;
  }
  get cloneCount(): number {
    return this.clones.size;
  }
  private get p(): Player {
    return this.world.player;
  }
  private go(s: NState, ms: number): void {
    this.st = s;
    this.stT = ms;
  }

  override beginFight(): void {
    super.beginFight();
    this.go('idle', 900);
  }

  // ------------------------------------------------------------------ geometry
  standNear(x: number, y: number): Pt {
    let best: Pt = { x, y };
    let bs = Infinity;
    for (const s of this.segs) {
      const cx = Phaser.Math.Clamp(x, s.x0 + 18, s.x1 - 18);
      if (this.world.hazards.lavaAt(cx, s.y - 2)) continue;
      const pd = Math.hypot(cx - this.p.x, s.y - this.p.y) < 50 ? 400 : 0;
      const d = Math.abs(cx - x) + Math.abs(s.y - y) * 0.6 + pd;
      if (d < bs) {
        bs = d;
        best = { x: cx, y: s.y };
      }
    }
    return best;
  }
  private floorBelow(x: number, y: number): number {
    let f = Infinity;
    for (const s of this.segs) if (x >= s.x0 && x <= s.x1 && s.y >= y - 4 && s.y < f) f = s.y;
    return Number.isFinite(f) ? f : y;
  }
  private teleport(pt: Pt): void {
    this.puff();
    this.body.setAllowGravity(true);
    this.body.reset(pt.x, pt.y - 1);
    this.puff();
  }
  private puff(): void {
    this.world.fx.burst(this.x, this.y - 28, 12, [0x6a3aa8, 0x2a1a3e, VIOLET], { speed: 150, life: 420 });
  }

  // ------------------------------------------------------------------ damage rules
  protected override extraTakenMul(h: HitInfo): number {
    if (h.kind === 'lightning') this.reveal(h.isClap ? 'real' : 'around');
    return this.takenMul;
  }
  override onHurt(res: HitResult, h: HitInfo): void {
    super.onHurt(res, h);
    this.visibleT = N.visibleAfterHitMs;
    if (this.clones.size && this.st !== 'shadows' && this.world.rng.chance(N.clones.shuffleOnHitChance)) this.shuffle();
  }
  override limitDamage(dmg: number): number {
    if (this.st === 'shadows' || this.st === 'transition') return 0;
    if (this.shadowsDone[1] || !this.fighting) return dmg;
    return Math.max(0, Math.min(dmg, this.hp - Math.ceil(this.maxHp * N.shadowsFloorFrac)));
  }

  private reveal(mode: 'real' | 'around', x = this.x, y = this.cy): void {
    if (mode === 'real' || Math.hypot(x - this.x, y - this.cy) <= N.revealR) this.revealT = N.revealMs;
    for (const c of this.clones) if (Math.hypot(c.x - x, c.cy - y) <= N.revealR) c.setAlpha(1);
  }

  protected onGuardBroken(): void {
    if (this.st === 'transition' || this.st === 'shadows' || this.st === 'dead' || this.st === 'intro') return;
    this.cancelMoves();
    this.comboLeft = 0;
    this.veilT = 0;
    this.anim('hurt');
    this.go('stagger', balance.guard.breakMs);
  }

  private cancelMoves(): void {
    this.dashT = 0;
    this.hook = null;
    this.body.setAllowGravity(true);
    this.body.setVelocity(0, 0);
    if (!this.grounded || this.world.hazards.lavaAt(this.x, this.y + 20)) this.teleport(this.standNear(this.x, this.y));
  }

  // ------------------------------------------------------------------ main loop
  step(dt: number): void {
    this.tickBase(dt);
    if (this.dead) return;
    this.stepCore(dt);
    this.stT -= dt;
    this.subT -= dt;
    this.glowT += dt;
    this.visibleT -= dt;
    this.revealT -= dt;
    this.tellT -= dt;
    this.updateVeil(dt);
    this.updateClones(dt);
    this.updateMark(dt);
    this.updateTimers(dt);
    this.updateTide(dt);
    this.setAlpha(this.veilAlpha);
    this.drawOverlay();
    if (this.fighting && this.phase === 4 && this.st !== 'transition' && this.st !== 'shadows') {
      for (let i = 0; i < 2; i++)
        if (!this.shadowsDone[i] && this.hp / this.maxHp <= N.shadows[i]!.at) {
          this.startShadows(i);
          break;
        }
    }
    if (this.st !== 'act' && this.body.allowGravity && this.world.hazards.lavaAt(this.x, this.y)) this.teleport(this.standNear(this.x, this.y));
    switch (this.st) {
      case 'intro':
        this.body.setVelocityX(0);
        return;
      case 'transition':
        this.body.setVelocityX(0);
        this.anim('roar');
        if (this.stT <= 0) {
          this.uncancellable = false;
          this.invulnMs = 0;
          this.go('idle', this.gap());
        }
        return;
      case 'idle':
        this.strafe();
        if (this.stT <= 0) this.choose(false);
        return;
      case 'tele':
        this.body.setVelocityX(0);
        if (this.flashMs <= 0 && !this.veiled) this.setTint(Math.floor(this.glowT / 80) % 2 ? VIOLET : 0xffffff);
        if (this.stT <= 0) this.startAct();
        return;
      case 'act':
        this.act(dt);
        return;
      case 'recover':
        this.body.setVelocityX(0);
        this.anim('idle');
        if (this.stT <= 0) {
          this.restoreTint();
          if (this.comboLeft > 0) this.choose(true);
          else this.go('idle', this.gap());
        }
        return;
      case 'exposed':
      case 'stagger':
        this.body.setVelocityX(0);
        this.anim('hurt');
        if (this.flashMs <= 0) this.setTint(Math.floor(this.glowT / 140) % 2 ? VIOLET : 0xffffff);
        if (this.stT <= 0) {
          this.takenMul = 1;
          this.restoreTint();
          this.go('idle', this.gap());
        }
        return;
      case 'shadows':
        this.stepShadows();
        return;
    }
  }

  private strafe(): void {
    this.face(this.p.x - this.x);
    const dx = this.p.x - this.x;
    const want = Math.abs(dx) > 260 ? Math.sign(dx) : Math.abs(dx) < 140 ? -Math.sign(dx) : 0;
    const blocked = want !== 0 && (!!this.world.hazards.lavaAt(this.x + want * 30, this.y + 10) || this.x + want * 30 < this.arena.x0 + 20 || this.x + want * 30 > this.arena.x1 - 20);
    this.body.setVelocityX(blocked ? 0 : want * N.run * 0.6);
    this.anim(want && !blocked ? 'run' : 'idle');
  }

  private updateVeil(dt: number): void {
    const V = N.veil[this.phase];
    if (this.veilT > 0) {
      this.veilT -= dt;
      if (this.veilT <= 0) this.veilCd = V.cdMs;
      return;
    }
    if (!this.fighting || this.st === 'exposed' || this.st === 'stagger' || this.st === 'transition' || this.st === 'shadows') return;
    this.veilCd -= dt;
    if (this.veilCd <= 0 && (this.st === 'idle' || this.st === 'recover')) {
      this.veilT = V.ms;
      this.puff();
      AudioManager.play('hexCast', { pan: this.world.cam.panFor(this.x) });
      if (!this.tipShown) {
        this.tipShown = true;
        this.world.toast(STR.nishachara.veilTip, 'cyan');
      }
    }
  }

  private updateTimers(dt: number): void {
    if (this.smoke && (this.smoke.t -= dt) <= 0) this.smoke = null;
    if (this.purgeT > 0 && (this.purgeT -= dt) <= 0) this.world.hazards.geyserRate = 1;
    if (this.eclipseT > 0 && (this.eclipseT -= dt) <= 0) {
      for (const c of this.clones) c.identical = false;
      this.setDim(0);
      AudioManager.play('glyph', { vol: 0.4 });
    }
  }

  // ------------------------------------------------------------------ clones
  private updateClones(dt: number): void {
    this.cloneCd -= dt;
    this.batchT -= dt;
    if (this.phase < 2 || !this.fighting) return;
    if (this.st === 'transition' || this.st === 'shadows' || this.st === 'dead' || this.st === 'intro') return;
    if (this.clones.size === 0 && this.cloneCd <= 0) {
      const C = N.clones[this.phase as 2 | 3 | 4];
      this.spawnClones(C.cap);
      this.cloneCd = C.cdMs;
      this.cloneBatch = this.clones.size;
      this.batchT = N.clones.breakWindowMs;
    }
  }

  private spawnClones(n: number, ring = 0): ShadowClone[] {
    const out: ShadowClone[] = [];
    const w = this.world;
    for (let i = 0; i < n; i++) {
      const x = ring > 0 ? this.p.x + Math.cos((i / n) * Math.PI * 2) * ring : this.p.x + w.rng.range(-320, 320);
      const pt = this.standNear(x, this.p.y);
      if (Math.abs(pt.x - this.p.x) < 50 && Math.abs(pt.y - this.p.y) < 40) continue;
      const c = new ShadowClone(w, pt.x + w.rng.range(-N.clones.offset, N.clones.offset) * 0.3, pt.y - 1, this);
      if (this.eclipseT > 0) c.identical = true;
      this.clones.add(c);
      out.push(c);
    }
    return out;
  }

  onCloneGone(c: ShadowClone, killed: boolean, hit?: HitInfo): void {
    this.clones.delete(c);
    if (hit?.kind === 'lightning') this.reveal(hit.isClap ? 'real' : 'around', c.x, c.cy);
    if (this.dead || this.st === 'shadows') return;
    if (killed && this.cloneBatch > 0 && this.clones.size === 0 && this.batchT > 0) this.cloneBreak();
    if (this.clones.size === 0) this.cloneBatch = 0;
  }

  private cloneBreak(): void {
    if (this.st === 'transition' || this.st === 'dead') return;
    const w = this.world;
    const B = N.cloneBreak;
    this.cancelMoves();
    this.comboLeft = 0;
    this.veilT = 0;
    this.takenMul = B.takenMul;
    this.go('exposed', B.exposeMs);
    w.fx.popText(this.x, this.body.y - 30, STR.nishachara.cloneBreak, PAL.cleanseGold, 3, 1200);
    w.fx.ring(this.x, this.cy, VIOLET, 8, 500);
    AudioManager.play('bannerBreak');
    GameEvents.emit('boss:cloneBreak', {});
    this.guardHit(B.guardHit);
  }

  private shuffle(): void {
    const all: (ShadowClone | Nishachara)[] = [this, ...this.clones];
    const pts = cloneShuffle(all.map((a) => ({ x: a.x, y: a.y })));
    all.forEach((a, i) => {
      const pt = pts[i]!;
      this.world.fx.burst(a.x, a.y - 28, 10, [0x6a3aa8, 0x2a1a3e], { speed: 120, life: 380 });
      a.body.reset(pt.x, pt.y);
    });
  }

  private mimicAll(kind: 'kunai' | 'slash' | 'ambush'): void {
    for (const c of this.clones) if (!c.busy) c.mimic(kind, this.world.rng.range(N.clones.mimicMinMs, N.clones.mimicMaxMs));
  }

  // ------------------------------------------------------------------ attacks
  private choose(chain: boolean): void {
    if (!chain) this.comboLeft = comboLength(this.phase, this.world.rng);
    this.comboLeft--;
    const weights: Partial<Record<NishAttackId, number>> = { ...N.weights[this.phase] };
    if (!this.veiled) delete weights.ambush;
    if (this.smoke || !this.clones.size) delete weights.smokeBomb;
    if (this.markT > 0) delete weights.crimsonMark;
    if (this.eclipseT > 0) delete weights.eclipseVeil;
    if (this.purgeT > 0 || !this.world.hazards.crumbles.some((c) => c.c.state === 'solid')) delete weights.platformPurge;
    if (!this.world.level.grappleAnchors?.length) delete weights.lavaHook;
    if (chain) {
      delete weights.platformPurge;
      delete weights.eclipseVeil;
      delete weights.smokeBomb;
      delete weights.lavaHook;
    }
    this.attack = this.world.rng.weighted<NishAttackId>(weights, this.last) ?? 'kunaiFan';
    this.last = this.attack;
    this.currentAttack = this.attack;
    this.startTele();
  }

  /** Every attack from the Veil gets ≥ 400 ms of glint + outline flicker + panned whisper. */
  static tellFor(base: number, phase: BossPhase, ranged: boolean, veiled: boolean): number {
    const ms = telegraphMs(base, phase, ranged);
    return veiled ? Math.max(ms, N.minTellMs) : ms;
  }

  private glint(ms: number): void {
    const w = this.world;
    this.tellT = ms;
    w.fx.ring(this.x + this.facing * 12, this.cy - 14, 0xffffff, 1.4, 120);
    AudioManager.play('glyph', { pan: w.cam.panFor(this.x), vol: 0.6 });
  }

  private startTele(): void {
    const w = this.world;
    const a = A[this.attack];
    if (this.attack === 'ambush') {
      this.teleport(this.standNear(this.p.x - this.p.facing * A.ambush.behind, this.p.y));
    }
    this.face(this.p.x - this.x);
    const ms = Nishachara.tellFor(a.telegraphMs, this.phase, a.ranged, this.veiled);
    this.go('tele', ms);
    AudioManager.play('telegraph', { pan: w.cam.panFor(this.x) });
    if (this.veiled) this.glint(ms);
    this.swapWith = null;
    if (this.phase >= 2 && this.clones.size && (this.attack === 'kunaiFan' || this.attack === 'slashDance') && w.rng.chance(N.mirrorSwap.chance)) {
      const c = [...this.clones].sort((p, q) => Math.abs(p.x - this.x) - Math.abs(q.x - this.x))[0]!;
      this.swapWith = c;
      w.fx.ring(this.x, this.cy, VIOLET, 3, N.mirrorSwap.flashMs);
      w.fx.ring(c.x, c.cy, VIOLET, 3, N.mirrorSwap.flashMs);
    }
    switch (this.attack) {
      case 'kunaiFan':
      case 'smokeBomb':
        this.anim('throw');
        this.smokeTarget = { x: this.p.x, y: this.p.y };
        break;
      case 'slashDance': {
        this.anim('crouch');
        const dir = Math.sign(this.p.x - this.x) || this.facing;
        const S = A.slashDance;
        const cl = (x: number) => Phaser.Math.Clamp(x, this.arena.x0 + 30, this.arena.x1 - 30);
        this.dashPts = [
          { x: this.x, y: this.y },
          { x: cl(this.p.x + dir * S.overshoot), y: this.y },
          { x: cl(this.p.x - dir * S.overshoot * 0.6), y: this.y },
        ];
        break;
      }
      case 'ambush':
        this.anim('crouch');
        break;
      case 'lavaHook': {
        this.anim('cast');
        const anchors = w.level.grappleAnchors ?? [];
        const mid = (this.x + this.p.x) / 2;
        const anchor = [...anchors].sort((p, q) => Math.abs(p.x - mid) - Math.abs(q.x - mid))[0]!;
        const to = this.standNear(anchor.x * 2 - this.x, this.y);
        this.hook = { from: { x: this.x, y: this.y }, to, anchor, bottom: this.p.y - 24, t: 0, hit: false };
        w.fx.groundRing(anchor.x, this.p.y, PAL.danger, 120, ms);
        break;
      }
      case 'crimsonMark':
        this.anim('cast');
        w.fx.glyph(this.p.x, this.p.body.y - 30, ms, CRIMSON);
        break;
      case 'platformPurge':
        this.anim('roar');
        w.fx.ring(this.x, this.cy, PAL.danger, 6, ms);
        break;
      case 'eclipseVeil':
        this.anim('cast');
        this.setDim(0.35);
        w.fx.glyph(this.x, this.y, ms, VIOLET);
        break;
      default:
        this.anim('cast');
        w.fx.glyph(this.x, this.y, ms, VIOLET);
    }
  }

  private startAct(): void {
    const w = this.world;
    this.restoreTint();
    if (this.swapWith?.active && this.swapWith.isAlive()) {
      const c = this.swapWith;
      const me = { x: this.x, y: this.y };
      this.puff();
      this.body.reset(c.x, c.y);
      c.body.reset(me.x, me.y);
      this.puff();
      this.face(this.p.x - this.x);
    }
    this.swapWith = null;
    switch (this.attack) {
      case 'kunaiFan': {
        const K = A.kunaiFan;
        this.fireKunai(this.phase >= 3 ? K.countP3 : K.count);
        this.mimicAll('kunai');
        return this.endAct();
      }
      case 'slashDance':
        this.dashN = 0;
        this.startDash(this.dashPts[1]!);
        this.mimicAll('slash');
        this.go('act', 99999);
        return;
      case 'ambush':
        this.melee(A.ambush.damage, A.ambush.reach);
        this.subT = A.ambush.gapMs;
        this.mimicAll('ambush');
        this.go('act', 99999);
        return;
      case 'smokeBomb': {
        const S = A.smokeBomb;
        this.smoke = { x: this.smokeTarget.x, y: this.smokeTarget.y, t: S.ms };
        w.fx.burst(this.smoke.x, this.smoke.y - 40, 30, [0x2a1a3e, 0x4a3a5e, 0x6a5a7e], { speed: 260, life: 700 });
        AudioManager.play('slam', { pan: w.cam.panFor(this.smoke.x), vol: 0.5 });
        this.shuffle();
        return this.endAct();
      }
      case 'lavaHook':
        this.body.setAllowGravity(false);
        this.anim('slash');
        AudioManager.play('swing');
        this.go('act', 99999);
        return;
      case 'shurikenWheel':
        this.fireWheel();
        return this.endAct();
      case 'crimsonMark':
        this.markT = A.crimsonMark.ms;
        this.markPulled = false;
        w.toast(STR.nishachara.marked, 'red');
        return this.endAct();
      case 'platformPurge':
        w.hazards.purge(A.platformPurge.count, A.platformPurge.stepMs);
        w.hazards.geyserRate = A.platformPurge.geyserRate;
        this.purgeT = A.platformPurge.ms;
        w.cam.shake(6, 400);
        return this.endAct();
      case 'eclipseVeil': {
        const E = A.eclipseVeil;
        this.eclipseT = E.ms;
        this.spawnClones(Math.max(0, E.copies - this.clones.size));
        for (const c of this.clones) c.identical = true;
        this.setDim(0.45);
        AudioManager.play('roar', { vol: 0.5 });
        w.fx.popText(this.p.x, this.p.body.y - 40, STR.nishachara.eclipse, VIOLET, 2, 1000);
        return this.endAct();
      }
    }
  }

  private endAct(): void {
    this.body.setAllowGravity(true);
    this.go('recover', this.comboLeft > 0 ? balance.bosses.global.comboGapMs : A[this.attack].recoverMs);
  }

  private startDash(to: Pt): void {
    const S = A.slashDance;
    const dx = to.x - this.x;
    this.face(dx);
    this.dashHit = false;
    this.dashT = Math.min(S.dashMs, (Math.abs(dx) / S.speed) * 1000);
    this.body.setAllowGravity(false);
    this.body.setVelocity(Math.sign(dx) * S.speed, 0);
    this.anim('slash', false);
    AudioManager.play('swing', { pan: this.world.cam.panFor(this.x) });
  }

  private act(dt: number): void {
    switch (this.attack) {
      case 'slashDance': {
        const S = A.slashDance;
        this.dashT -= dt;
        if (!this.dashHit && Math.abs(this.p.x - this.x) < 30 && Math.abs(this.p.y - this.y) < 50) {
          this.dashHit = true;
          this.hitHero(S.damage);
        }
        if (Math.random() < 0.5) this.world.fx.burst(this.x, this.y - 28, 1, [VIOLET], { speed: 10, life: 200 });
        if (this.dashT <= 0) {
          this.body.setVelocity(0, 0);
          this.dashN++;
          if (this.dashN < 2) this.startDash(this.dashPts[2]!);
          else {
            this.cancelMoves();
            this.endAct();
          }
        }
        return;
      }
      case 'ambush':
        if (this.subT <= 0) {
          this.melee(A.ambush.damage, A.ambush.reach);
          this.endAct();
        }
        return;
      case 'lavaHook': {
        const h = this.hook;
        if (!h) return this.endAct();
        const H = A.lavaHook;
        h.t += dt;
        const s = Math.min(1, h.t / H.swingMs);
        const baseY = Phaser.Math.Linear(h.from.y - 160, h.to.y - 160, s);
        const depth = h.bottom - Phaser.Math.Linear(h.from.y - 160, h.to.y - 160, 0.5);
        const x = Phaser.Math.Linear(h.from.x, h.to.x, s);
        const y = baseY + Math.sin(Math.PI * s) * depth;
        this.body.reset(x, y);
        this.face(h.to.x - h.from.x);
        if (!h.hit && s > 0.4 && s < 0.6 && Math.abs(this.p.x - x) < H.reach && Math.abs(this.p.y - y) < H.reach + 20) {
          h.hit = true;
          this.hitHero(H.damage, 260);
        }
        if (s >= 1) {
          this.hook = null;
          this.teleportQuiet(h.to);
          this.endAct();
        }
        return;
      }
      default:
        this.endAct();
    }
  }

  private teleportQuiet(pt: Pt): void {
    this.body.setAllowGravity(true);
    this.body.reset(pt.x, pt.y - 1);
  }

  private hitHero(v3: number, kb = 160, ultimate = false): void {
    this.world.combat.hit(this.p, { amount: this.dmg(v3, ultimate), kind: 'melee', faction: 'enemy', dirX: Math.sign(this.p.x - this.x) || 1, knockback: kb, poise: 10, source: this });
  }

  private melee(v3: number, reach: number): void {
    const w = this.world;
    this.anim('slash', false);
    w.fx.slash(this.x + this.facing * 24, this.cy, this.facing, 1.2, VIOLET);
    AudioManager.play('swing', { pan: w.cam.panFor(this.x) });
    if (Math.abs(this.p.x - (this.x + this.facing * reach * 0.5)) < reach && Math.abs(this.p.y - this.y) < 60) this.hitHero(v3);
  }

  private fireKunai(n: number): void {
    const K = A.kunaiFan;
    const w = this.world;
    const ox = this.x + this.facing * 14;
    const oy = this.cy - 6;
    const base = Math.atan2(this.p.cy - oy, this.p.cx - ox);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * K.spreadDeg * (Math.PI / 180);
      w.proj.spawn({ kind: 'boneArrow', faction: 'enemy', x: ox, y: oy, vx: Math.cos(a) * K.speed, vy: Math.sin(a) * K.speed, damage: this.dmg(K.damage), source: this, knockback: 120 });
    }
    AudioManager.play('bowShoot', { pan: w.cam.panFor(this.x) });
  }

  /** Ring with two adjacent empty slots: a ≥ 40° gap to dash through. */
  private fireWheel(): void {
    const W = A.shurikenWheel;
    const w = this.world;
    const gap = w.rng.int(0, W.slots - 1);
    for (let i = 0; i < W.slots; i++) {
      if (i === gap || i === (gap + 1) % W.slots) continue;
      const a = (i / W.slots) * Math.PI * 2 + this.glowT / 1000;
      w.proj.spawn({ kind: 'darkOrb', faction: 'enemy', x: this.x, y: this.cy, vx: Math.cos(a) * W.speed, vy: Math.sin(a) * W.speed, damage: this.dmg(W.damage), source: this, knockback: 100, lifeMs: 2600, reflectable: false });
    }
    AudioManager.play('hexCast');
  }

  private updateMark(dt: number): void {
    if (this.markT <= 0) return;
    const C = A.crimsonMark;
    const w = this.world;
    const before = this.markT;
    this.markT -= dt;
    if (this.p.st === 'dash') {
      this.markT = 0;
      w.fx.popText(this.p.x, this.p.body.y - 30, STR.nishachara.cleansed, PAL.cleanseGold, 2, 800);
      if (this.st === 'tele' || this.st === 'act' || this.st === 'recover' || this.st === 'idle') {
        this.cancelMoves();
        this.comboLeft = 0;
        this.go('recover', C.cleanseRecoverMs);
      }
      return;
    }
    const pullAt = C.ms - C.pullAtMs;
    if (!this.markPulled && before > pullAt && this.markT <= pullAt) {
      this.markPulled = true;
      this.face(this.p.x - this.x);
      this.glint(N.minTellMs);
      w.scene.time.delayedCall(N.minTellMs + 50, () => {
        if (!this.dead && this.active && this.markT > 0 && this.st !== 'stagger' && this.st !== 'exposed') this.fireKunai(C.pullKunai);
      });
    }
  }

  private updateTide(dt: number): void {
    if (this.phase < 4 || !this.fighting || this.dead) return;
    const T = N.lavaTide;
    const w = this.world;
    if (this.tideSteps >= T.maxSteps || w.hazards.lavaRise >= w.hazards.maxLavaRise(T.dryMargin)) return;
    this.tideT += dt;
    if (!this.tideWarned && this.tideT >= T.everyMs - T.teleMs) {
      this.tideWarned = true;
      w.toast(STR.nishachara.tide, 'red');
      w.cam.shake(3, T.teleMs);
      AudioManager.play('slam', { vol: 0.6 });
      w.fx.flash(0xff6a20, 0.18, 300);
    }
    if (this.tideT >= T.everyMs) {
      this.tideT = 0;
      this.tideWarned = false;
      this.tideSteps++;
      w.hazards.raiseLava(T.stepPx, T.dryMargin);
    }
  }

  // ------------------------------------------------------------------ Thousand Shadows
  private startShadows(i: number): void {
    const w = this.world;
    const J = N.shadows[i]!;
    this.shadowsDone[i] = true;
    this.shadowIdx = i;
    this.cancelMoves();
    this.comboLeft = 0;
    this.veilT = 0;
    this.markT = 0;
    this.uncancellable = true;
    this.ultimateTele = true;
    this.restoreTint();
    this.currentAttack = 'thousandShadows';
    for (const c of [...this.clones]) c.pop(false);
    const made = this.spawnClones(J.clones, J.ring);
    const spot = this.standNear(this.p.x + (w.rng.chance(0.5) ? J.ring : -J.ring) * 0.8, this.p.y);
    this.teleport(spot);
    this.shadowQueue = cloneShuffle<ShadowClone | 'real'>([...made, 'real']);
    this.invulnMs = J.telegraphMs + J.gapMs * this.shadowQueue.length + 500;
    this.subT = J.telegraphMs;
    this.go('shadows', 99999);
    this.setDim(0.5);
    AudioManager.play('roar');
    GameEvents.emit('intro:card', { title: STR.nishachara.shadows, subtitle: STR.nishachara.shadowsTip, durationMs: 1400 });
  }

  private stepShadows(): void {
    const J = N.shadows[this.shadowIdx]!;
    this.body.setVelocityX(0);
    this.face(this.p.x - this.x);
    if (this.subT > 0) {
      this.anim('crouch');
      return;
    }
    const next = this.shadowQueue.shift();
    if (next === undefined) return this.endShadows();
    this.subT = J.gapMs;
    if (next === 'real') {
      this.teleport(this.standNear(this.p.x - this.p.facing * 50, this.p.y));
      this.face(this.p.x - this.x);
      this.melee(J.realDamage, 80);
    } else if (next.active && next.isAlive()) next.mimic('shadow', -N.minTellMs + 1, J.cloneDamage / N.clones.dmgMul);
  }

  private endShadows(): void {
    const w = this.world;
    const J = N.shadows[this.shadowIdx]!;
    this.setDim(0);
    this.uncancellable = false;
    this.ultimateTele = false;
    this.invulnMs = 0;
    w.scene.time.delayedCall(400, () => {
      for (const c of [...this.clones]) c.pop(false);
    });
    if (this.shadowIdx === 1) {
      this.guard.breakNow(J.exposeMs);
      this.emitGuard(true);
      this.takenMul = N.finalTakenMul;
      w.fx.popText(this.x, this.body.y - 30, STR.nishachara.finalStand, PAL.cleanseGold, 3, 1400);
    }
    this.go('exposed', J.exposeMs);
  }

  // ------------------------------------------------------------------ visuals
  private setDim(alpha: number): void {
    const w = this.world;
    if (!this.dim) this.dim = w.scene.add.rectangle(-200, -200, 3000, 2000, 0x02030a, 0).setOrigin(0).setScrollFactor(0).setDepth(299);
    w.scene.tweens.add({ targets: this.dim, fillAlpha: alpha, duration: 300 });
  }

  private drawOverlay(): void {
    const g = this.gfx.clear();
    const h = this.hud.clear();
    if (this.st === 'dead') return;
    const fy = this.grounded ? this.y : this.floorBelow(this.x, this.y);
    g.fillStyle(0x000000, 0.45).fillEllipse(this.x, fy + 1, 30, 6);
    if (this.veiled) {
      const a = this.tellT > 0 ? 0.6 : 0.3;
      g.lineStyle(1, VIOLET, a);
      g.beginPath();
      for (let i = 0; i <= 24; i++) {
        const t = (i / 24) * Math.PI * 2;
        const r = 1 + 0.08 * Math.sin(t * 5 + this.glowT / 90);
        const px = this.x + Math.cos(t) * 18 * r;
        const py = this.cy + Math.sin(t) * 32 * r;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.strokePath();
      for (const c of this.clones) {
        if (!c.active || c.identical) continue;
        g.lineStyle(1, VIOLET, Math.floor((this.glowT + c.x) / 90) % 3 === 0 ? 0.15 : 0.55);
        g.beginPath();
        for (let i = 0; i <= 24; i++) {
          const t = (i / 24) * Math.PI * 2;
          const r = 1 + 0.18 * Math.sin(t * 9 + this.glowT / 40);
          const px = c.x + Math.cos(t) * 18 * r;
          const py = c.cy + Math.sin(t) * 32 * r;
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.strokePath();
      }
      if (this.body.velocity.x !== 0 && Math.random() < 0.15) this.world.fx.dust2(this.x, this.y, 1);
    }
    if (SaveManager.settings.markReal && this.fighting) {
      const y = this.body.y - 14 + Math.sin(this.glowT / 200) * 2;
      g.fillStyle(VIOLET, 0.9).fillPoints(
        [
          { x: this.x, y: y - 6 },
          { x: this.x + 5, y },
          { x: this.x, y: y + 6 },
          { x: this.x - 5, y },
        ],
        true,
      );
    }
    if (this.smoke) {
      const k = Math.min(1, this.smoke.t / 500);
      g.fillStyle(0x1a1028, 0.55 * k).fillCircle(this.smoke.x, this.smoke.y - 40, A.smokeBomb.r);
      g.fillStyle(0x2a1a3e, 0.35 * k).fillCircle(this.smoke.x + 30, this.smoke.y - 70, A.smokeBomb.r * 0.7);
    }
    if (this.st === 'tele' && this.attack === 'slashDance' && this.dashPts.length === 3) {
      g.lineStyle(2, VIOLET, 0.5);
      g.lineBetween(this.dashPts[0]!.x, this.cy, this.dashPts[1]!.x, this.cy);
      g.lineBetween(this.dashPts[1]!.x, this.cy - 8, this.dashPts[2]!.x, this.cy + 8);
    }
    if (this.hook && (this.st === 'tele' || this.st === 'act')) g.lineStyle(2, 0x8a8a9a, 0.9).lineBetween(this.hook.anchor.x, this.hook.anchor.y, this.x, this.cy);
    if (this.markT > 0) {
      const p = this.p;
      const r = 14 + Math.sin(this.glowT / 80) * 2;
      g.lineStyle(2, CRIMSON, 0.9).strokeCircle(p.x, p.body.y - 18, r);
      g.lineStyle(1, CRIMSON, 0.9).lineBetween(p.x - 5, p.body.y - 22, p.x + 5, p.body.y - 14);
      g.lineBetween(p.x + 5, p.body.y - 22, p.x - 5, p.body.y - 14);
    }
    const cam = this.world.cam;
    if (this.veiled && !cam.inView(this.x, this.cy, -16)) {
      const v = cam.cam.worldView;
      const W = this.world.scene.scale.width;
      const Hh = this.world.scene.scale.height;
      const sx = Phaser.Math.Clamp(((this.x - v.x) / v.width) * W, 18, W - 18);
      const sy = Phaser.Math.Clamp(((this.cy - v.y) / v.height) * Hh, 18, Hh - 18);
      const ang = Math.atan2(this.cy - (v.y + v.height / 2), this.x - (v.x + v.width / 2));
      const pts = [0, 2.5, -2.5].map((o, i) => ({ x: sx + Math.cos(ang + o) * (i ? 7 : 11), y: sy + Math.sin(ang + o) * (i ? 7 : 11) }));
      h.fillStyle(VIOLET, 0.6 + 0.3 * Math.sin(this.glowT / 120)).fillPoints(pts, true);
    }
  }

  // ------------------------------------------------------------------ phases & death
  protected onPhaseEnter(ph: BossPhase, silent: boolean): void {
    if (ph === 4) this.tideT = 0;
    this.cloneCd = 0;
    if (silent) return;
    const w = this.world;
    this.cancelMoves();
    this.uncancellable = true;
    this.comboLeft = 0;
    this.veilT = 0;
    this.markT = 0;
    this.restoreTint();
    this.invulnMs = balance.bosses.global.transitionMs;
    this.go('transition', balance.bosses.global.transitionMs);
    AudioManager.play('roar');
    w.cam.shake(8, 500);
    w.fx.ring(this.x, this.cy, VIOLET, 9, 700);
    GameEvents.emit('intro:card', { title: STR.nishachara.phases[ph - 1]!, subtitle: STR.nishachara.name, durationMs: 1600 });
    if (ph === 2) w.toast(STR.nishachara.cloneTip, 'cyan');
    [...this.clones].forEach((c) => c.pop(false));
    w.proj.clearCircle(this.x, this.cy, 2400, 'enemy');
  }

  onDeath(_hit: HitInfo, _k: KillType): void {
    this.st = 'dead';
    this.setAlpha(1);
    this.body.setAllowGravity(true);
    this.body.setVelocity(0, 0);
    GameStore.setBoss(0, this.maxHp, this.phase);
    [...this.clones].forEach((c, i) => this.world.scene.time.delayedCall(60 * i, () => c.pop(false)));
    this.cleanup();
    this.finishFight('kill');
    this.onDefeated?.();
  }

  private cleanup(): void {
    this.gfx.clear();
    this.hud.clear();
    this.dim?.destroy();
    this.dim = null;
    this.smoke = null;
    this.markT = 0;
    if (this.world.hazards) this.world.hazards.geyserRate = 1;
  }

  override destroy(fromScene?: boolean): void {
    if (this.scene) {
      this.cleanup();
      for (const c of [...this.clones]) c.destroy();
      this.clones.clear();
    }
    this.gfx.destroy();
    this.hud.destroy();
    super.destroy(fromScene);
  }
}
