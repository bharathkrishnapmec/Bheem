import Phaser from 'phaser';
import { balance } from '@/config/balance';
import { GameStore } from '@/core/GameStore';
import type { Faction, KillType } from '@/core/types';
import { AudioManager } from '@/audio/AudioManager';
import { addRally } from '@/logic/summon';
import type { World } from '@/game/World';
import type { HitInfo } from '@/systems/CombatSystem';
import { Actor } from '../Actor';

export type CloneAct = 'kunai' | 'slash' | 'ambush' | 'shadow';

export interface CloneOwner {
  readonly veilAlpha: number;
  readonly active: boolean;
  dmg(v3: number, ultimate?: boolean): number;
  standNear(x: number, y: number): { x: number; y: number };
  onCloneGone(c: ShadowClone, killed: boolean, hit?: HitInfo): void;
}

const N = balance.nishachara;
const SHIMMER = 0xb080ff;

/** Nishachara's shadow copy (v2 §A8.4, v3 §B6): 1 HP, half damage, no ground shadow, violet shimmer. */
export class ShadowClone extends Actor {
  faction: Faction = 'enemy';
  /** Eclipse Veil: no shimmer difference from the real one. */
  identical = false;
  private glowT = Math.random() * 1000;
  private job: { kind: CloneAct; t: number; tell: boolean; v3: number } | null = null;
  private dashT = 0;
  private dashHit = false;
  private gone = false;

  constructor(
    world: World,
    x: number,
    y: number,
    private owner: CloneOwner,
  ) {
    super(world, x, y, 'nishachara', N.bodyW, N.bodyH);
    this.maxHp = this.hp = 1;
    this.kbResist = 1;
    this.stunImmune = true;
    this.setDepth(300);
    world.groundGroup.add(this);
    world.extraHostiles.add(this);
    this.puff();
  }

  get busy(): boolean {
    return !!this.job || this.dashT > 0;
  }

  /** Copies the real one's attack after `delay`, always with a ≥ 400 ms glint tell. */
  mimic(kind: CloneAct, delay: number, v3 = 0): void {
    if (this.dead || this.gone) return;
    this.job = { kind, t: delay + N.minTellMs, tell: false, v3 };
  }

  private puff(): void {
    this.world.fx.burst(this.x, this.y - 28, 12, [0x6a3aa8, 0x2a1a3e, SHIMMER], { speed: 140, life: 420 });
  }

  private get p(): Actor {
    return this.world.player;
  }

  private hitHero(v3: number): void {
    const amount = Math.max(1, Math.round(this.owner.dmg(v3) * N.clones.dmgMul));
    this.world.combat.hit(this.p, { amount, kind: 'melee', faction: 'enemy', dirX: Math.sign(this.p.x - this.x) || 1, knockback: 140, poise: 8, source: this });
  }

  private teleport(x: number, y: number): void {
    const pt = this.owner.standNear(x, y);
    this.puff();
    this.body.reset(pt.x, pt.y - 1);
    this.puff();
  }

  step(dt: number): void {
    this.tickBase(dt);
    if (this.dead || this.gone) return;
    if (!this.owner.active) return this.pop(false);
    this.glowT += dt;
    const w = this.world;
    if (w.hazards.lavaAt(this.x, this.y)) return this.pop(true);
    this.setAlpha(this.owner.veilAlpha);
    if (this.flashMs <= 0) {
      if (this.identical) this.clearTint();
      else this.setTint(Math.floor(this.glowT / 110) % 3 === 0 ? SHIMMER : 0xffffff);
    }
    if (this.dashT > 0) {
      this.dashT -= dt;
      if (!this.dashHit && Math.abs(this.p.x - this.x) < 30 && Math.abs(this.p.y - this.y) < 50) {
        this.dashHit = true;
        this.hitHero(this.job?.v3 || N.attacks.slashDance.damage);
      }
      if (this.dashT <= 0) {
        this.body.setAllowGravity(true);
        this.body.setVelocityX(0);
        this.job = null;
        if (!this.grounded || w.hazards.lavaAt(this.x, this.y + 20)) this.teleport(this.x, this.y);
      }
      return;
    }
    this.face(this.p.x - this.x);
    if (this.job) {
      this.body.setVelocityX(0);
      this.job.t -= dt;
      if (!this.job.tell && this.job.t <= N.minTellMs) {
        this.job.tell = true;
        if (this.job.kind === 'ambush' || this.job.kind === 'shadow') this.teleport(this.p.x - this.p.facing * N.attacks.ambush.behind, this.p.y);
        this.face(this.p.x - this.x);
        w.fx.ring(this.x + this.facing * 12, this.cy - 14, 0xffffff, 1.2, 120);
        AudioManager.play('glyph', { pan: w.cam.panFor(this.x), vol: 0.35 });
        this.anim(this.job.kind === 'kunai' ? 'throw' : 'crouch');
      }
      if (this.job.t <= 0) this.execute(this.job);
      return;
    }
    const dx = this.p.x - this.x;
    const want = Math.abs(dx) > 220 ? Math.sign(dx) : Math.abs(dx) < 120 ? -Math.sign(dx) : 0;
    const blocked = want !== 0 && !!w.hazards.lavaAt(this.x + want * 24, this.y + 10);
    this.body.setVelocityX(blocked ? 0 : want * 120);
    this.anim(want && !blocked ? 'run' : 'idle');
  }

  private execute(job: { kind: CloneAct; v3: number }): void {
    const w = this.world;
    this.anim('slash', false);
    switch (job.kind) {
      case 'kunai': {
        const K = N.attacks.kunaiFan;
        const base = Math.atan2(this.p.cy - this.cy, this.p.cx - this.x);
        for (const d of [-1, 1]) {
          const a = base + d * K.spreadDeg * (Math.PI / 180);
          w.proj.spawn({ kind: 'boneArrow', faction: 'enemy', x: this.x, y: this.cy, vx: Math.cos(a) * K.speed, vy: Math.sin(a) * K.speed, damage: Math.max(1, Math.round(this.owner.dmg(K.damage) * N.clones.dmgMul)), source: this, knockback: 100 });
        }
        AudioManager.play('bowShoot', { vol: 0.4 });
        this.job = null;
        return;
      }
      case 'slash':
      case 'shadow': {
        const S = N.attacks.slashDance;
        this.dashHit = false;
        this.dashT = job.kind === 'shadow' ? 260 : S.dashMs * 0.7;
        this.body.setAllowGravity(false);
        this.body.setVelocity((Math.sign(this.p.x - this.x) || this.facing) * S.speed, 0);
        AudioManager.play('swing', { vol: 0.4 });
        return;
      }
      case 'ambush': {
        const A = N.attacks.ambush;
        if (Math.abs(this.p.x - (this.x + this.facing * A.reach * 0.5)) < A.reach && Math.abs(this.p.y - this.y) < 60) this.hitHero(A.damage);
        w.fx.slash(this.x + this.facing * 24, this.cy, this.facing, 1, SHIMMER);
        AudioManager.play('swing', { vol: 0.4 });
        this.job = null;
        return;
      }
    }
  }

  /** Pops in violet smoke. `killed` counts toward Clone Break; hero kills also give Rally. */
  pop(killed: boolean, hit?: HitInfo): void {
    if (this.gone) return;
    this.gone = true;
    const w = this.world;
    w.extraHostiles.delete(this);
    this.puff();
    AudioManager.play('enemyDeath', { pan: w.cam.panFor(this.x), vol: 0.4 });
    this.body.enable = false;
    this.setVisible(false);
    this.owner.onCloneGone(this, killed, hit);
    w.scene.time.delayedCall(30, () => this.destroy());
  }

  onDeath(hit: HitInfo, _k: KillType): void {
    if (hit.faction === 'hero') GameStore.setRally(addRally(GameStore.state.rally, N.clones.rally));
    this.pop(true, hit);
  }

  override destroy(fromScene?: boolean): void {
    this.world?.extraHostiles.delete(this);
    super.destroy(fromScene);
  }
}

export const cloneShuffle = <T>(xs: T[]): T[] => Phaser.Utils.Array.Shuffle([...xs]);
