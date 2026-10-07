import Phaser from 'phaser';
import { balance } from '@/config/balance';
import { PAL } from '@/config/palette';
import type { EnemyType, Faction, KillType } from '@/core/types';
import { pickTarget } from '@/systems/TargetingSystem';
import { AudioManager } from '@/audio/AudioManager';
import type { World } from '@/game/World';
import type { HitInfo, HitResult } from '@/systems/CombatSystem';
import { pxText } from '@/ui/text';
import { Actor } from '../Actor';

export interface EnemyOpts {
  elite?: boolean;
  waveId?: string;
  required?: boolean;
  districtId?: string;
  summoner?: Enemy | null;
  aggro?: boolean;
}

/** Shared enemy behaviour: targeting, movement helpers, telegraphs, tokens, melee hitboxes. */
export abstract class Enemy extends Actor {
  override faction: Faction = 'enemy';
  abstract override readonly type: EnemyType;
  coins = 1;
  speed = 100;
  homeX: number;
  ai = 'idle';
  stT = 0;
  target: Actor | null = null;
  private retargetT = 0;
  sleeping = false;
  attackN = 0;
  waveId?: string;
  required = true;
  summoner: Enemy | null = null;
  summons = new Set<Enemy>();
  aggro = false;
  hitSet = new Set<number>();
  private mark: Phaser.GameObjects.BitmapText | null = null;
  private markT = 0;
  protected cd = 0;
  spawnT = 300;

  constructor(world: World, x: number, y: number, key: string, bw: number, bh: number, o: EnemyOpts = {}) {
    super(world, x, y, key, bw, bh);
    this.homeX = x;
    this.elite = !!o.elite;
    this.waveId = o.waveId;
    this.required = o.required ?? true;
    this.summoner = o.summoner ?? null;
    this.aggro = o.aggro ?? true;
    this.setDepth(300);
    this.invulnMs = 250;
    this.setAlpha(0);
    world.scene.tweens.add({ targets: this, alpha: 1, duration: 250 });
  }

  protected setStats(d: { hp: number; armor: number; poise: number; speed: number; coins: number; knockbackResist: number }): void {
    const m = this.elite ? 1.5 : 1;
    this.maxHp = this.hp = Math.round(d.hp * m);
    this.armor = d.armor;
    this.poiseMax = this.poise = d.poise * m;
    this.speed = d.speed;
    this.coins = d.coins * (this.elite ? 2 : 1);
    this.kbResist = d.knockbackResist;
  }

  get player() {
    return this.world.player;
  }

  go(s: string, ms = 0): void {
    this.ai = s;
    this.stT = ms;
    this.hitSet.clear();
  }

  step(dt: number): void {
    this.tickBase(dt);
    if (this.dead) return;
    if (this.spawnT > 0) this.spawnT -= dt;
    const cam = this.world.cam;
    const far = Math.abs(this.x - cam.centerX) > balance.world.sleepDistanceScreens * 960;
    this.sleeping = far && !this.aggro;
    if (this.sleeping) {
      this.body.setVelocityX(0);
      return;
    }
    if (this.markT > 0) {
      this.markT -= dt;
      this.mark?.setPosition(this.x, this.body.y - 10).setVisible(Math.floor(this.markT / 70) % 2 === 0);
      if (this.markT <= 0) this.mark?.setVisible(false);
    }
    if (this.elite && Math.random() < 0.08) this.world.fx.add({ x: this.x + (Math.random() - 0.5) * this.bodyW, y: this.body.bottom - 4, vy: -50, life: 400, c: PAL.ruinGlow }, true);
    if (!this.canAct()) {
      this.releaseToken();
      if (this.ai !== 'idle' && this.ai !== 'chase') this.go('chase');
      this.body.setVelocityX(this.body.velocity.x * 0.9);
      this.onStunned(dt);
      return;
    }
    this.stT -= dt;
    this.cd -= dt;
    this.retargetT -= dt;
    if (this.retargetT <= 0 || !this.target?.isAlive()) {
      this.retargetT = balance.targeting.reevaluateMs;
      const range = this.aggro ? Infinity : balance.enemyAI.aggroRange;
      this.target = pickTarget(this.x, this.y, this.world.hostilesOf('enemy'), range);
      if (this.target) this.aggro = true;
    }
    this.think(dt);
  }

  protected onStunned(_dt: number): void {
    this.anim('hurt');
  }

  protected abstract think(dt: number): void;

  // ---------------------------------------------------------------- helpers
  releaseToken(): void {
    this.world.tokens.release(this.uid);
  }

  /** Melee against the hero needs an attack token (§11.2); allies can always be attacked. */
  protected requestToken(): boolean {
    if (this.target !== this.player) return true;
    return this.world.tokens.request(this.uid);
  }

  protected dx(): number {
    return this.target ? this.target.x - this.x : 0;
  }
  protected dy(): number {
    return this.target ? this.target.cy - this.cy : 0;
  }

  protected faceTarget(): void {
    if (this.target) this.face(this.target.x - this.x);
  }

  protected moveDir(dir: number, mul = 1): void {
    const b = this.body;
    const sp = this.speed * mul * this.speedMul();
    if (dir === 0) {
      b.setVelocityX(b.velocity.x * 0.8);
      return;
    }
    this.face(dir);
    if (!this.flying && this.grounded) {
      const ahead = this.x + dir * (this.bodyW / 2 + 8);
      if (!this.world.geo.hasGround(ahead, this.y, 180)) {
        b.setVelocityX(0);
        return;
      }
      if ((dir < 0 && b.blocked.left) || (dir > 0 && b.blocked.right)) b.setVelocityY(-480);
    }
    b.setVelocityX(dir * sp);
  }

  protected moveToward(tx: number, mul = 1, stopDist = 4): void {
    const d = tx - this.x;
    this.moveDir(Math.abs(d) <= stopDist ? 0 : Math.sign(d), mul);
  }

  protected halt(): void {
    this.body.setVelocityX(this.body.velocity.x * 0.75);
  }

  protected patrol(): void {
    const r = balance.enemyAI.patrolRange;
    if (this.ai !== 'patrolL' && this.ai !== 'patrolR') this.go('patrolR');
    const goal = this.ai === 'patrolR' ? this.homeX + r : this.homeX - r;
    if (Math.abs(goal - this.x) < 8 || (this.grounded && !this.world.geo.hasGround(this.x + this.facing * 20, this.y, 60))) this.go(this.ai === 'patrolR' ? 'patrolL' : 'patrolR');
    this.moveToward(goal, 0.4);
    this.anim('walk');
  }

  telegraph(ms: number, color: number = PAL.danger): void {
    if (!this.mark) this.mark = pxText(this.scene, this.x, this.body.y - 10, '!', 3, color).setOrigin(0.5, 1).setDepth(650);
    this.mark.setTint(color).setVisible(true);
    this.markT = Math.min(ms, 600);
    AudioManager.play('telegraph', { pan: this.world.cam.panFor(this.x), vol: 0.7 });
  }

  protected melee(w: number, h: number, damage: number, knockback: number, opts: Partial<HitInfo> = {}): Actor[] {
    const off = this.bodyW / 2 + w / 2 - 10;
    const r = { x: this.x + this.facing * off - w / 2, y: this.body.bottom - h, w, h };
    return this.world.combat.hitArea(
      r,
      { amount: damage, kind: 'melee', faction: 'enemy', source: this, dirX: this.facing, knockback, poise: 10, ...opts },
      this.hitSet,
    );
  }

  override onHurt(res: HitResult, hit: HitInfo): void {
    this.aggro = true;
    if (hit.source && hit.source.isAlive() && hit.source !== this.target && this.world.rng.chance(balance.targeting.switchOnDamageChance)) this.target = hit.source;
    if (res.staggered) {
      this.releaseToken();
      this.go('chase');
      this.anim('hurt');
    }
  }

  onDeath(_hit: HitInfo, killType: KillType): void {
    this.releaseToken();
    this.mark?.destroy();
    this.mark = null;
    this.world.onEnemyKilled(this, killType);
  }

  override destroy(fromScene?: boolean): void {
    this.mark?.destroy();
    super.destroy(fromScene);
  }
}
