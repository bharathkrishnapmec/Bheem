import Phaser from 'phaser';
import { balance } from '@/config/balance';
import { STR } from '@/config/strings';
import { GameEvents } from '@/core/GameEvents';
import { TimeController } from '@/core/TimeController';
import { AudioManager } from '@/audio/AudioManager';
import type { Actor } from '@/entities/Actor';
import type { World } from '@/game/World';
import type { CrumblingDef, GeyserDef, MovingDef, Rect, UpdraftDef, Vec2 } from '@/level/levelSchema';
import { GameContext } from '@/modes/creative/GameContext';
import { StatusEffectSystem } from '@/systems/StatusEffectSystem';
import {
  crumbleSolid,
  envOutcome,
  geyserPhase,
  gustPush,
  launchVelocityX,
  movingOffset,
  nearestPoint,
  stepCrumble,
  type CrumbleData,
} from '@/logic/hazards';

interface Crumble {
  def: CrumblingDef;
  c: CrumbleData;
  body: Phaser.Physics.Arcade.Image;
  vis: Phaser.GameObjects.TileSprite;
}
interface Mover {
  def: MovingDef;
  body: Phaser.Physics.Arcade.Image;
  vis: Phaser.GameObjects.TileSprite;
}
interface Geyser {
  def: GeyserDef;
  g: Phaser.GameObjects.Graphics;
  hit: Set<number>;
  wasErupting: boolean;
}
interface Vent {
  def: UpdraftDef;
  g: Phaser.GameObjects.Graphics;
}

/**
 * Runtime arena hazards (v2 §A6): lava, void/cloud catch, geysers, crumbling + moving platforms,
 * updraft vents and wind gusts. Hazard numbers live in `balance.arenas`; timing rules in `logic/hazards`.
 */
export class HazardSystem {
  t = 0;
  readonly movers: Mover[] = [];
  readonly crumbles: Crumble[] = [];
  private geysers: Geyser[] = [];
  private vents: Vent[] = [];
  private lavaVis: Phaser.GameObjects.TileSprite[] = [];
  private moverGroup: Phaser.Physics.Arcade.Group;
  private crumbleGroup: Phaser.Physics.Arcade.StaticGroup;
  private ventLock = 0;
  private inVent = false;
  private lavaCd = 0;
  private scorchAcc = 0;
  private gust: { dir: 1 | -1; t: number; push: boolean; g: Phaser.GameObjects.Graphics } | null = null;

  constructor(
    private w: World,
    oneWayCheck: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
  ) {
    const scene = w.scene;
    const L = w.level;
    const topKey = L.theme === 'sky' ? 'tile_skyTop' : L.theme === 'forge' ? 'tile_basaltTop' : 'tile_plank';
    this.moverGroup = scene.physics.add.group({ allowGravity: false, immovable: true });
    this.crumbleGroup = scene.physics.add.staticGroup();
    for (const r of L.lavaZones ?? []) {
      const ts = scene.add.tileSprite(r.x, r.y, r.w, r.h, 'tile_lava').setOrigin(0).setDepth(23);
      this.lavaVis.push(ts);
      scene.add.rectangle(r.x, r.y - 24, r.w, 26, 0xff6a20, 0.18).setOrigin(0).setDepth(22).setBlendMode(Phaser.BlendModes.ADD);
      // physics floor under the lava so bodies never fall forever (not part of geo, so AI treats it as a ledge)
      const floor = scene.add.rectangle(r.x + r.w / 2, r.y + r.h - 8, r.w, 16).setVisible(false);
      w.solidGroup.add(floor);
    }
    for (const def of L.crumblingPlatforms ?? []) {
      const r = def.rect;
      const body = this.crumbleGroup.create(r.x + r.w / 2, r.y + r.h / 2, 'fx_px') as Phaser.Physics.Arcade.Image;
      body.setVisible(false).setDisplaySize(r.w, r.h).refreshBody();
      const vis = scene.add.tileSprite(r.x, r.y, r.w, 8, topKey).setOrigin(0).setDepth(24).setTint(0xd0b8a8);
      this.crumbles.push({ def, c: { state: 'solid', t: 0 }, body, vis });
    }
    for (const def of L.movingPlatforms ?? []) {
      const r = def.rect;
      const body = this.moverGroup.create(r.x + r.w / 2, r.y + r.h / 2, 'fx_px') as Phaser.Physics.Arcade.Image;
      body.setVisible(false).setDisplaySize(r.w, r.h);
      const bb = body.body as Phaser.Physics.Arcade.Body;
      bb.setSize(r.w, r.h, true).setAllowGravity(false).setImmovable(true);
      bb.checkCollision.down = bb.checkCollision.left = bb.checkCollision.right = false;
      bb.friction.set(1, 0);
      const vis = scene.add.tileSprite(r.x, r.y, r.w, 8, topKey).setOrigin(0).setDepth(24);
      this.movers.push({ def, body, vis });
    }
    for (const def of L.geysers ?? []) this.geysers.push({ def, g: scene.add.graphics().setDepth(240), hit: new Set(), wasErupting: false });
    for (const def of L.updrafts ?? []) this.vents.push({ def, g: scene.add.graphics().setDepth(21).setBlendMode(Phaser.BlendModes.ADD) });
    scene.physics.add.collider(w.groundGroup, this.moverGroup);
    scene.physics.add.collider(w.groundGroup, this.crumbleGroup, undefined, oneWayCheck);
  }

  private get paused(): boolean {
    return GameContext.creative && GameContext.modifiers.hazardsPaused;
  }

  /** Telegraphed horizontal wind gust (Garjana P3+): 1 s whistle/streaks, then a capped push. */
  startGust(dir: 1 | -1): void {
    if (this.gust || this.paused) return;
    this.gust = { dir, t: 0, push: false, g: this.w.scene.add.graphics().setDepth(700).setScrollFactor(0) };
    AudioManager.play('telegraph');
  }
  get gustActive(): boolean {
    return !!this.gust;
  }

  update(dt: number): void {
    const w = this.w;
    if (!this.paused) this.t += dt;
    for (const ts of this.lavaVis) {
      ts.tilePositionX += dt * 0.01;
      ts.tilePositionY = Math.sin(w.now / 700) * 2;
    }
    this.updateMovers(dt);
    this.updateCrumbles(dt);
    this.updateGeysers();
    this.updateVents(dt);
    this.updateGust(dt);
    this.updateLava(dt);
    this.updateVoid();
    this.updateScorch(dt);
  }

  private updateMovers(dt: number): void {
    const sec = Math.max(1, dt) / 1000;
    for (const m of this.movers) {
      const r = m.def.rect;
      const o = movingOffset(m.def.path, m.def.amplitude, m.def.periodMs, this.t, m.def.phaseMs ?? 0);
      const tx = r.x + r.w / 2 + o.x;
      const ty = r.y + r.h / 2 + o.y;
      const b = m.body.body as Phaser.Physics.Arcade.Body;
      b.setVelocity((tx - m.body.x) / sec / Math.max(0.05, TimeController.scale), (ty - m.body.y) / sec / Math.max(0.05, TimeController.scale));
      m.vis.setPosition(m.body.x - r.w / 2, m.body.y - r.h / 2);
    }
  }

  private heroOn(r: Rect): boolean {
    const p = this.w.player;
    return p.grounded && Math.abs(p.y - r.y) < 6 && p.x >= r.x - 4 && p.x <= r.x + r.w + 4;
  }

  private updateCrumbles(dt: number): void {
    const k = { riseMs: balance.arenas.lava.crumbleRiseMs } as const;
    for (const cr of this.crumbles) {
      const prev = cr.c.state;
      if (!this.paused) cr.c = stepCrumble(cr.c, dt, this.heroOn(cr.def.rect), { ...cr.def, ...k });
      const st = cr.c.state;
      const r = cr.def.rect;
      if (st !== prev) {
        cr.body.body!.enable = crumbleSolid(st);
        if (st === 'shaking') this.w.fx.dust2(r.x + r.w / 2, r.y, 6);
        if (st === 'gone') this.w.scene.tweens.add({ targets: cr.vis, y: r.y + 140, alpha: 0, duration: 500, ease: 'Quad.in' });
        if (st === 'rising') this.w.scene.tweens.add({ targets: cr.vis, y: r.y, alpha: 1, duration: k.riseMs, ease: 'Quad.out' });
      }
      if (st === 'shaking') cr.vis.setPosition(r.x + (Math.random() * 2 - 1) * 2, r.y + (Math.random() * 2 - 1));
      else if (st === 'solid') {
        cr.vis.setPosition(r.x, r.y);
        cr.vis.setTint(cr.c.t > 0 ? 0xffa080 : 0xd0b8a8);
      }
    }
  }

  private updateGeysers(): void {
    const G = balance.arenas.lava.geyser;
    const timing = { idleMs: 0, teleMs: G.teleMs, eruptMs: G.eruptMs };
    const reduced = this.w.reduced();
    for (const gy of this.geysers) {
      const { x, y } = gy.def;
      const g = gy.g.clear();
      const ph = this.paused ? { phase: 'idle' as const, into: 0 } : geyserPhase(this.t, gy.def.periodMs, gy.def.phaseOffsetMs, timing);
      g.fillStyle(0x1a0e0e, 1).fillRect(x - 14, y - 3, 28, 4);
      if (ph.phase === 'telegraph') {
        // glowing crack telegraph: gameplay-critical, kept in reduced effects
        const a = 0.5 + 0.5 * Math.sin(ph.into / 60);
        g.fillStyle(0xffa040, 0.6 + 0.4 * a).fillRect(x - 12, y - 3, 24, 3);
        g.fillStyle(0xff6020, 0.25 + 0.2 * a).fillRect(x - G.w / 2, y - G.h, G.w, G.h);
        if (!reduced && Math.random() < 0.3) this.w.fx.embers(x, y - 6, 1, 0xff8030);
      } else if (ph.phase === 'erupt') {
        if (!gy.wasErupting) {
          gy.hit.clear();
          AudioManager.play('slam', { pan: this.w.cam.panFor(x) });
        }
        const grow = Math.min(1, ph.into / 120);
        const h = G.h * grow;
        g.fillStyle(0xff8a2a, 0.9).fillRect(x - G.w / 2, y - h, G.w, h);
        g.fillStyle(0xffe080, 0.9).fillRect(x - G.w / 4, y - h, G.w / 2, h);
        this.geyserHits(gy, x, y, h);
      }
      gy.wasErupting = ph.phase === 'erupt';
    }
  }

  private geyserHits(gy: Geyser, x: number, y: number, h: number): void {
    const G = balance.arenas.lava.geyser;
    const w = this.w;
    const targets: Actor[] = [w.player, ...w.enemies];
    for (const a of targets) {
      if (!a.isAlive() || gy.hit.has(a.uid)) continue;
      if (Math.abs(a.x - x) > G.w / 2 + a.bodyW / 2 || a.y < y - h || a.y - a.bodyH > y + 4) continue;
      gy.hit.add(a.uid);
      w.combat.hit(a, { amount: G.damage, kind: 'contact', faction: 'neutral', dirX: Math.sign(a.x - x) || 1, knockback: 120, knockUp: G.knockUp, poise: 0 });
    }
  }

  private updateVents(dt: number): void {
    const p = this.w.player;
    this.ventLock = Math.max(0, this.ventLock - dt);
    let inside = false;
    for (const v of this.vents) {
      const r = v.def.rect;
      const g = v.g.clear();
      const a = 0.18 + 0.06 * Math.sin(this.w.now / 200 + r.x);
      g.fillStyle(0xdff6ff, a).fillRect(r.x, r.y, r.w, r.h);
      for (let i = 0; i < 4; i++) {
        const yy = r.y + r.h - (((this.w.now / 3 + i * (r.h / 4)) % r.h) | 0);
        g.fillStyle(0xffffff, 0.5).fillRect(r.x + 8 + ((i * 17) % (r.w - 16)), yy, 3, 14);
      }
      if (!p.dead && p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y - p.bodyH < r.y + r.h) {
        inside = true;
        if (this.ventLock <= 0 || this.inVent) {
          p.body.setVelocityY(Math.min(p.body.velocity.y, v.def.vy));
          p.airDashes = Math.max(p.airDashes, 1);
        }
      }
    }
    if (this.inVent && !inside) this.ventLock = this.vents[0]?.def.relockMs ?? 600;
    this.inVent = inside && (this.ventLock <= 0 || this.inVent);
  }

  private updateGust(dt: number): void {
    const gu = this.gust;
    if (!gu) return;
    const K = balance.arenas.sky.gust;
    gu.t += dt;
    const g = gu.g.clear();
    if (!gu.push && gu.t >= K.teleMs) {
      gu.push = true;
      gu.t = 0;
    }
    const n = gu.push ? 14 : 6;
    for (let i = 0; i < n; i++) {
      const y = ((i * 97 + 31) % 520) + 10;
      const x = (((this.w.now * (gu.push ? 1.2 : 0.5) + i * 173) % 1100) - 70) * gu.dir + (gu.dir < 0 ? 960 : 0);
      g.fillStyle(0xe8f0ff, gu.push ? 0.35 : 0.18).fillRect(x, y, 60, 2);
    }
    if (gu.push) {
      const px = (gustPush(K.push * gu.dir, balance.player.runSpeed) * dt) / 1000;
      // never shove a grounded actor off a ledge on its own (v2 §A6.2)
      for (const a of [this.w.player, ...this.w.enemies, ...this.w.allies])
        if (a.isAlive() && (!a.grounded || this.w.geo.hasGround(a.x + px + Math.sign(px) * (a.bodyW / 2), a.y, 12))) a.x += px;
      if (gu.t >= K.pushMs) {
        gu.g.destroy();
        this.gust = null;
      }
    }
  }

  private safePoints(): Vec2[] {
    const L = this.w.level;
    return L.safeAnchors?.length ? L.safeAnchors : [L.heroSpawn ?? L.playerStart];
  }

  private inLava(a: Actor): Rect | null {
    for (const r of this.w.level.lavaZones ?? []) if (a.x >= r.x && a.x <= r.x + r.w && a.y > r.y + 4) return r;
    return null;
  }

  /** Arc toward the nearest safe platform with a fixed upward launch. */
  private launch(a: Actor, vy: number, maxVx: number): void {
    const tgt = nearestPoint(this.safePoints(), a.x, a.y);
    if (!tgt) return;
    a.body.setVelocity(launchVelocityX({ x: a.x, y: a.y }, tgt, vy, balance.player.gravity, maxVx), vy);
  }

  private updateLava(dt: number): void {
    const w = this.w;
    const K = balance.arenas.lava;
    if (!w.level.lavaZones?.length) return;
    this.lavaCd = Math.max(0, this.lavaCd - dt);
    const p = w.player;
    if (!p.dead && this.lavaCd <= 0 && this.inLava(p)) {
      this.lavaCd = 300;
      const r = p.invulnMs > 0 ? null : w.combat.hit(p, { amount: K.damage, kind: 'contact', faction: 'neutral', dirX: 0, knockback: 0, poise: 0, noHitStop: true });
      if (!p.dead) {
        TimeController.hitStop(K.hitStopMs, 9);
        StatusEffectSystem.apply(p, { id: 'scorch', durationMs: K.scorchMs });
        this.launch(p, K.launchVy, K.launchMaxVx);
        p.launchUntil = w.now + 700;
        p.invulnMs = Math.max(p.invulnMs, K.iFramesMs);
        w.fx.burst(p.x, p.y, 12, [0xff8030, 0xffd060, 0x401010], { speed: 180, g: 300, life: 450 });
        GameEvents.emit('hazard:lava-hit', {});
        if (r?.applied) GameEvents.emit('player:hazard', {});
      }
    }
    for (const e of w.enemies) {
      if (!e.isAlive() || e.flying || !this.inLava(e)) continue;
      this.envHit(e, 'lava');
    }
    for (const al of w.allies) if (al.isAlive() && this.inLava(al)) al.setPosition(p.x - p.facing * 30, p.y - 4);
  }

  private envHit(e: Actor & { elite?: boolean; type?: string }, via: 'lava' | 'void'): void {
    const w = this.w;
    const elite = !!(e as { elite?: boolean }).elite;
    if (envOutcome(elite) === 'kill') {
      w.combat.hit(e, { amount: 99999, kind: 'contact', faction: 'neutral', dirX: 0, knockback: 0, poise: 0, ignoreIFrames: true, noHitStop: true, killAs: via });
      GameEvents.emit('env:kill', { type: (e as unknown as { type: never }).type, via });
      return;
    }
    const dmg = via === 'lava' ? balance.arenas.lava.eliteEnvDamage : balance.arenas.sky.eliteEnvDamage;
    w.combat.hit(e, { amount: dmg, kind: 'contact', faction: 'neutral', dirX: 0, knockback: 0, poise: 0, ignoreIFrames: true, noHitStop: true });
    if (!e.isAlive()) return;
    if (via === 'lava') this.launch(e, balance.arenas.lava.launchVy, balance.arenas.lava.launchMaxVx);
    else {
      const q = nearestPoint(this.respawnPoints(), e.x, e.y) ?? this.safePoints()[0]!;
      e.setPosition(q.x, q.y - 4);
      e.body.reset(q.x, q.y - 4);
      e.body.setVelocity(0, 0);
    }
  }

  private respawnPoints(): Vec2[] {
    return (this.w.level.voidZones ?? []).flatMap((v) => v.fallRespawnPoints);
  }

  private updateVoid(): void {
    const w = this.w;
    const zones = w.level.voidZones;
    if (!zones?.length) return;
    const p = w.player;
    for (const z of zones) {
      if (!p.dead && p.y > z.rect.y && p.x >= z.rect.x && p.x <= z.rect.x + z.rect.w) {
        const r = w.combat.hit(p, { amount: balance.arenas.sky.fallDamage, kind: 'contact', faction: 'neutral', dirX: 0, knockback: 0, poise: 0, ignoreIFrames: true, noHitStop: true });
        if (!p.dead) {
          const q = nearestPoint(z.fallRespawnPoints, p.x, z.fallRespawnPoints[0]!.y) ?? z.fallRespawnPoints[0]!;
          p.setPosition(q.x, q.y - 2);
          p.body.reset(q.x, q.y - 2);
          p.body.setVelocity(0, 0);
          p.invulnMs = balance.arenas.sky.iFramesMs;
          p.st = 'normal';
          w.fx.ring(q.x, q.y - 20, 0xe8f0ff, 10, 500);
          w.toast(STR.arena.windCatch, 'cyan');
          GameEvents.emit('hazard:fall-catch', {});
          if (r.applied) GameEvents.emit('player:hazard', {});
        }
      }
      for (const e of w.enemies) if (e.isAlive() && e.y > z.rect.y) this.envHit(e, 'void');
      for (const al of w.allies) if (al.isAlive() && al.y > z.rect.y) al.setPosition(p.x - p.facing * 30, p.y - 4);
    }
  }

  private updateScorch(dt: number): void {
    const p = this.w.player;
    if (p.dead || !StatusEffectSystem.has(p, 'scorch')) {
      this.scorchAcc = 0;
      return;
    }
    if (Math.random() < 0.25 && !this.w.reduced()) this.w.fx.embers(p.x, p.y - 20, 1, 0xff8030);
    this.scorchAcc += dt;
    const tick = 500;
    while (this.scorchAcc >= tick) {
      this.scorchAcc -= tick;
      if (GameContext.creative && GameContext.modifiers.godMode) continue;
      const dmg = (balance.arenas.lava.scorchDps * tick) / 1000;
      if (p.hp > dmg) {
        p.hp -= dmg;
        GameEvents.emit('damage:number', { x: p.x, y: p.y - p.bodyH, amount: dmg, kind: 'hero' });
        p.syncStore();
      } else this.w.combat.hit(p, { amount: dmg, kind: 'contact', faction: 'neutral', dirX: 0, knockback: 0, poise: 0, ignoreIFrames: true, noHitStop: true });
    }
  }

  destroy(): void {
    this.gust?.g.destroy();
    this.gust = null;
  }
}
