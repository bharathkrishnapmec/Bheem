import Phaser from 'phaser';
import { balance } from '@/config/balance';
import type { Faction, KillType, StatusId } from '@/core/types';
import type { Rect } from '@/level/levelSchema';
import { StatusEffectSystem, type ActiveStatus, type StatusTarget } from '@/systems/StatusEffectSystem';
import type { TargetCandidate } from '@/systems/TargetingSystem';
import type { World } from '@/game/World';
import type { HitInfo, HitResult } from '@/systems/CombatSystem';
import { SHEETS } from '@/assets/ProceduralAssets';

/** Base for every combatant. Sprite origin is at the feet (0.5, 1); body is centred horizontally. */
export abstract class Actor extends Phaser.Physics.Arcade.Sprite implements StatusTarget, TargetCandidate {
  static seq = 1;
  readonly uid = Actor.seq++;
  declare body: Phaser.Physics.Arcade.Body;
  abstract faction: Faction;
  hp = 1;
  maxHp = 1;
  armor = 0;
  poiseMax = 10;
  poise = 10;
  private poiseT = 0;
  kbResist = 0;
  /** Aura speed buff (Kaalasura Warbanner). */
  buffSpeedMul = 1;
  statuses = new Map<StatusId, ActiveStatus>();
  stunImmune = false;
  small = false;
  statusImmune?: StatusId[];
  targetWeight = 1;
  targetable = true;
  dead = false;
  elite = false;
  invulnMs = 0;
  facing: 1 | -1 = 1;
  flashMs = 0;
  staggerMs = 0;
  flying = false;
  lastAttacker: Actor | null = null;
  animBase: string;
  bodyW: number;
  bodyH: number;

  constructor(
    public world: World,
    x: number,
    y: number,
    key: string,
    bw: number,
    bh: number,
  ) {
    super(world.scene, x, y, key, 0);
    this.animBase = key;
    this.bodyW = bw;
    this.bodyH = bh;
    world.scene.add.existing(this);
    world.scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    this.fitBody(bw, bh);
    this.body.setMaxVelocityY(balance.player.maxFallSpeed);
  }

  fitBody(w: number, h: number): void {
    const sh = SHEETS[this.texture.key];
    const fw = sh?.fw ?? this.width;
    const fh = sh?.fh ?? this.height;
    this.body.setSize(w, h, false);
    this.body.setOffset((fw - w) / 2, fh - h);
  }

  isAlive(): boolean {
    return !this.dead && this.active;
  }

  get vx(): number {
    return this.body ? this.body.velocity.x : 0;
  }
  get cx(): number {
    return this.body.center.x;
  }
  get cy(): number {
    return this.body.center.y;
  }
  get grounded(): boolean {
    return this.body.blocked.down || this.body.touching.down;
  }
  bounds(): Rect {
    const b = this.body;
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }
  /** True while stagger/knockback cannot interrupt (e.g. Brute gold glow). */
  get superArmor(): boolean {
    return false;
  }
  canAct(): boolean {
    return !this.dead && this.staggerMs <= 0 && StatusEffectSystem.canAct(this);
  }
  /** Final say on incoming HP damage (e.g. a boss that must survive into its Last Stand). */
  limitDamage(dmg: number): number {
    return dmg;
  }

  speedMul(): number {
    return StatusEffectSystem.speedMultiplier(this) * this.buffSpeedMul;
  }
  /** Extra damage multiplier applied by the target (boss shield, punish windows...). */
  damageTakenMul(_hit: HitInfo): number {
    return StatusEffectSystem.has(this, 'marked') ? 1.15 : 1;
  }

  anim(name: string, ignoreIfPlaying = true): void {
    const k = `${this.animBase}:${name}`;
    if (this.anims.currentAnim?.key === k && ignoreIfPlaying) return;
    if (this.scene.anims.exists(k)) this.anims.play(k, ignoreIfPlaying);
  }

  face(dir: number): void {
    if (dir === 0) return;
    this.facing = dir > 0 ? 1 : -1;
    this.setFlipX(this.facing < 0);
  }

  hitFlash(ms: number = balance.combat.heroHitFlashMs): void {
    this.flashMs = ms;
    this.setTintFill(0xffffff);
  }

  stagger(ms = balance.combat.staggerMs): void {
    this.staggerMs = ms;
  }

  poiseDamage(amount: number): boolean {
    this.poiseT = balance.combat.poiseResetMs;
    this.poise -= amount;
    if (this.poise <= 0) {
      this.poise = this.poiseMax;
      return true;
    }
    return false;
  }

  /** Common per-frame bookkeeping; dt is scaled gameplay ms. */
  tickBase(dt: number): void {
    StatusEffectSystem.tick(this, dt);
    if (this.invulnMs > 0) this.invulnMs -= dt;
    if (this.staggerMs > 0) this.staggerMs -= dt;
    if (this.poiseT > 0) {
      this.poiseT -= dt;
      if (this.poiseT <= 0) this.poise = this.poiseMax;
    }
    if (this.flashMs > 0) {
      this.flashMs -= dt;
      if (this.flashMs <= 0) this.restoreTint();
    }
  }

  restoreTint(): void {
    if (StatusEffectSystem.has(this, 'shocked')) this.setTint(0xbfefff);
    else if (StatusEffectSystem.has(this, 'slow')) this.setTint(0xb0ffa0);
    else this.clearTint();
  }

  onStatusApplied(_id: StatusId, _s: ActiveStatus): void {
    if (this.flashMs <= 0) this.restoreTint();
  }
  onStatusExpired(_id: StatusId, _cleansed: boolean): void {
    if (this.flashMs <= 0) this.restoreTint();
  }

  onHurt(_res: HitResult, _hit: HitInfo): void {}
  abstract onDeath(hit: HitInfo, killType: KillType): void;
  abstract step(dt: number): void;
}
