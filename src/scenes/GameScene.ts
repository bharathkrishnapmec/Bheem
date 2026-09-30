import Phaser from 'phaser';
import { BG_COLOR, GAME_H, GAME_W } from '@/config/gameConfig';
import { balance } from '@/config/balance';
import { PAL } from '@/config/palette';
import { STR } from '@/config/strings';
import { GameEvents } from '@/core/GameEvents';
import { GameStore } from '@/core/GameStore';
import { RNG } from '@/core/RNG';
import { SaveManager } from '@/core/SaveManager';
import { TimeController } from '@/core/TimeController';
import type { DistrictId, Faction, KillType } from '@/core/types';
import { coinLossOnDeath } from '@/logic/damage';
import { rollDrops } from '@/logic/loot';
import { addRally, rallyForKill } from '@/logic/summon';
import { loadVillage } from '@/level/LevelLoader';
import { LevelGeometry } from '@/level/geometry';
import type { LevelData } from '@/level/levelSchema';
import { AudioManager } from '@/audio/AudioManager';
import { InputManager } from '@/input/InputManager';
import { emptyInput } from '@/input/InputState';
import { Parallax } from '@/fx/Parallax';
import { FX } from '@/fx/FX';
import { CameraDirector } from '@/fx/CameraDirector';
import { DeathFX } from '@/fx/DeathFX';
import { pxText } from '@/ui/text';
import type { Actor } from '@/entities/Actor';
import { Player } from '@/entities/player/Player';
import type { Enemy } from '@/entities/enemies/Enemy';
import type { Ally } from '@/entities/allies/Ally';
import { Kaalasura } from '@/entities/boss/Kaalasura';
import type { Banner } from '@/entities/world/Banner';
import { Gate } from '@/entities/world/Gate';
import { Captive, Chest, Shrine } from '@/entities/world/Interactables';
import { Projectiles } from '@/entities/projectiles/Projectiles';
import { CombatSystem } from '@/systems/CombatSystem';
import { LootSystem } from '@/systems/LootSystem';
import { AttackTokenSystem } from '@/systems/AttackTokenSystem';
import { SpawnDirector } from '@/systems/SpawnDirector';
import { DistrictManager } from '@/systems/DistrictManager';
import { SummonSystem } from '@/systems/SummonSystem';
import type { Interactable, World } from '@/game/World';

class GameWorld implements World {
  level!: LevelData;
  geo!: LevelGeometry;
  player!: Player;
  enemies = new Set<Enemy>();
  allies = new Set<Ally>();
  boss: Kaalasura | null = null;
  banners: Banner[] = [];
  interactables: Interactable[] = [];
  combat!: CombatSystem;
  fx!: FX;
  proj!: Projectiles;
  loot!: LootSystem;
  tokens!: AttackTokenSystem;
  rng = new RNG();
  spawner!: SpawnDirector;
  districts!: DistrictManager;
  summon!: SummonSystem;
  cam!: CameraDirector;
  deathFx!: DeathFX;
  groundGroup!: Phaser.GameObjects.Group;
  solidGroup!: Phaser.Physics.Arcade.StaticGroup;
  progress = { rescued: new Set<string>(), chests: new Set<string>(), banners: new Set<string>(), checkpointId: '' };
  now = 0;
  constructor(
    public scene: Phaser.Scene,
    private host: GameScene,
  ) {}
  hostilesOf(f: Faction): Actor[] {
    const out: Actor[] = [];
    if (f === 'enemy') {
      if (this.player.isAlive() && this.player.targetable) out.push(this.player);
      for (const a of this.allies) if (a.isAlive()) out.push(a);
    } else {
      for (const e of this.enemies) if (e.isAlive() && e.targetable) out.push(e);
      if (this.boss?.isAlive()) out.push(this.boss);
    }
    return out;
  }
  reduced(): boolean {
    return SaveManager.settings.reducedEffects;
  }
  inCombat(): boolean {
    return [...this.enemies].some((e) => e.isAlive() && e.aggro) || !!this.boss?.isAlive();
  }
  onEnemyKilled(e: Enemy, k: KillType): void {
    this.host.enemyKilled(e, k);
  }
  toast(text: string, color?: 'gold' | 'red' | 'cyan' | 'violet'): void {
    GameEvents.emit('toast', { text, color });
  }
  saveProgress(): void {
    this.host.save();
  }
  openShrine(id: string): void {
    this.host.openShrine(id);
  }
  setCheckpoint(id: string, x: number, y: number): void {
    this.host.setCheckpoint(id, x, y);
  }
}

type BossStage = 'none' | 'intro' | 'fight' | 'dead';

export class GameScene extends Phaser.Scene {
  w!: GameWorld;
  private inp!: InputManager;
  private bg!: Parallax;
  private light!: Phaser.GameObjects.Rectangle;
  private weatherG!: Phaser.GameObjects.Graphics;
  private fog!: Phaser.GameObjects.TileSprite;
  private rain: { x: number; y: number; l: number }[] = [];
  private shrines: Shrine[] = [];
  private bossGate: Gate | null = null;
  private bossStage: BossStage = 'none';
  private checkpoint = { id: '', x: 0, y: 0 };
  private holdT = 0;
  private holdTarget: Interactable | null = null;
  private promptShown = false;
  private multi = { n: 0, t: 0 };
  private dying = false;
  private cinematic = false;
  private debugText: Phaser.GameObjects.BitmapText | null = null;
  private lightTarget = { color: 0x000000, alpha: 0 };
  private lastEnemyT = 0;

  constructor() {
    super('Game');
  }

  create(data: { continue?: boolean }): void {
    const res = loadVillage();
    if (!res.level) {
      pxText(this, GAME_W / 2, GAME_H / 2, `${STR.errors.level}\n${res.error ?? ''}`, 2, PAL.danger).setOrigin(0.5);
      return;
    }
    this.reset();
    const level = res.level;
    const w = (this.w = new GameWorld(this, this));
    w.level = level;
    w.geo = new LevelGeometry(level.solids, level.oneWays);
    const prog = data.continue ? SaveManager.get().progress : undefined;
    const totalCaptives = level.districts.reduce((n, d) => n + d.captives.length, 0);
    GameStore.reset({
      coins: prog?.coins ?? 0,
      upgrades: prog ? { ...prog.upgrades } : undefined,
      rescued: prog?.rescued.length ?? 0,
      totalCaptives,
      deaths: prog?.deaths ?? 0,
      playtimeMs: prog?.playtimeMs ?? 0,
      kills: prog?.kills ?? 0,
      checkpointId: prog?.checkpointId ?? '',
      summonCost: balance.rally.summonCost,
    });
    if (!GameStore.state.upgrades) GameStore.state.upgrades = { might: 0, vitality: 0, quiver: 0, prana: 0, rally: 0 };
    if (prog) {
      prog.rescued.forEach((r) => w.progress.rescued.add(r));
      prog.chestsOpened.forEach((r) => w.progress.chests.add(r));
      prog.bannersDestroyed.forEach((r) => w.progress.banners.add(r));
    }
    const liberated = new Set<DistrictId>(level.districts.filter((d) => prog?.districtStates[d.id] === 'liberated').map((d) => d.id));

    this.physics.world.setBounds(0, -400, level.width, level.height + 800);
    this.physics.world.setBoundsCollision(true, true, false, false);
    this.cameras.main.setBackgroundColor(BG_COLOR);
    this.bg = new Parallax(this, level.groundY - 380);
    this.buildTerrain(level);

    w.solidGroup = this.physics.add.staticGroup();
    const oneWay = this.physics.add.staticGroup();
    for (const r of level.solids) w.solidGroup.add(this.physics.add.staticImage(r.x + r.w / 2, r.y + r.h / 2, 'fx_px').setDisplaySize(r.w, r.h).setVisible(false).refreshBody());
    for (const r of level.oneWays) oneWay.add(this.physics.add.staticImage(r.x + r.w / 2, r.y + r.h / 2, 'fx_px').setDisplaySize(r.w, r.h).setVisible(false).refreshBody());
    w.groundGroup = this.add.group();

    w.fx = new FX(this);
    w.cam = new CameraDirector(this, level.width, level.height);
    w.tokens = new AttackTokenSystem();
    w.combat = new CombatSystem(w);
    w.proj = new Projectiles(w);
    w.loot = new LootSystem(w);
    w.deathFx = new DeathFX(w);
    w.spawner = new SpawnDirector(w);
    w.summon = new SummonSystem(w);

    // checkpoint / start
    const shrineDefs = [...level.districts.map((d) => ({ id: `shrine_${d.id}`, ...d.shrine })), { id: 'shrine_boss', ...level.bossArena.shrine }];
    const cp = shrineDefs.find((s) => s.id === prog?.checkpointId);
    this.checkpoint = cp ? { id: cp.id, x: cp.x + 40, y: cp.y } : { id: '', x: level.playerStart.x, y: level.playerStart.y };
    w.progress.checkpointId = this.checkpoint.id;
    w.player = new Player(w, this.checkpoint.x, this.checkpoint.y - 1);
    w.player.applyUpgrades(GameStore.state.upgrades, true);
    w.groundGroup.add(w.player);

    w.districts = new DistrictManager(w, liberated);
    w.districts.onLiberated = () => this.updateLighting();
    for (const s of shrineDefs) {
      const sh = new Shrine(w, s.id, s.x, s.y, s.id === this.checkpoint.id || this.shrineUnlocked(s.id, liberated));
      this.shrines.push(sh);
      w.interactables.push(sh);
    }
    for (const d of level.districts) {
      d.captives.forEach((c, i) => {
        const id = `${d.id}:c${i}`;
        w.interactables.push(new Captive(w, id, c.x, c.y, !!c.guarded, w.progress.rescued.has(id) || liberated.has(d.id)));
      });
      d.chests.forEach((c, i) => {
        const id = `${d.id}:ch${i}`;
        w.interactables.push(new Chest(w, id, c.x, c.y, c.loot, w.progress.chests.has(id)));
      });
    }
    const ba = level.bossArena;
    this.bossGate = new Gate(w, 'gate_boss', ba.entryGate.x, ba.entryGate.y, ba.entryGate.h, false);

    this.physics.add.collider(w.groundGroup, w.solidGroup);
    this.physics.add.collider(w.groundGroup, oneWay, undefined, (a, p) => this.oneWayCheck(a as Actor, p as Phaser.Physics.Arcade.Image), this);

    this.light = this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0).setOrigin(0).setScrollFactor(0).setDepth(700);
    this.weatherG = this.add.graphics().setScrollFactor(0).setDepth(690);
    this.fog = this.add.tileSprite(0, 0, GAME_W, GAME_H, 'noise').setOrigin(0).setScrollFactor(0).setDepth(689).setAlpha(0).setTint(0xb8a8d8).setTileScale(24);
    this.updateLighting(true);

    w.cam.follow(w.player);
    w.cam.snap();
    this.inp = new InputManager(this);
    TimeController.bind({
      setScale: (s: number) => {
        this.physics.world.timeScale = 1 / Math.max(s, 0.001);
        this.tweens.timeScale = s;
        this.time.timeScale = s;
        this.anims.globalTimeScale = s;
      },
    });

    this.scene.launch('UI');
    this.scene.bringToTop('UI');
    GameStore.markAll();
    AudioManager.setMusic('explore');
    this.cameras.main.fadeIn(500, 0, 0, 0);
    if (!prog) this.time.delayedCall(300, () => GameEvents.emit('intro:card', { title: STR.intro.title, subtitle: STR.intro.subtitle, durationMs: 2600 }));

    const onDied = () => this.onPlayerDied();
    const onRetry = (i: { type: string }) => {
      if (i.type === 'retry') this.retry();
    };
    GameEvents.on('player:died', onDied);
    GameEvents.on('ui:intent', onRetry);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      GameEvents.off('player:died', onDied);
      GameEvents.off('ui:intent', onRetry);
      TimeController.clear();
      TimeController.bind(null);
      this.scene.stop('UI');
    });
    this.events.on(Phaser.Scenes.Events.RESUME, () => this.inp.flush());
    this.input.keyboard?.on('keydown-F3', () => this.toggleDebug());
    this.input.keyboard?.on('keydown-F4', () => {
      if (!this.debugText) return;
      for (const e of w.enemies) if (e.isAlive()) w.combat.hit(e, { amount: 9999, kind: 'melee', faction: 'hero', dirX: 1, knockback: 0, poise: 0, ignoreIFrames: true });
      if (w.boss?.isAlive()) w.combat.hit(w.boss, { amount: 150, kind: 'melee', faction: 'hero', dirX: 1, knockback: 0, poise: 0, ignoreIFrames: true });
    });
    this.input.keyboard?.on('keydown-F6', () => {
      if (!this.debugText) return;
      const nx = w.player.x + 1200;
      w.player.setPosition(nx, w.player.y - 200);
      w.player.body.reset(nx, w.player.y - 200);
    });
    this.exposeTestHooks();
  }

  private reset(): void {
    this.shrines = [];
    this.rain = [];
    this.bossStage = 'none';
    this.dying = false;
    this.cinematic = false;
    this.holdT = 0;
    this.holdTarget = null;
    this.promptShown = false;
    this.debugText = null;
    this.multi = { n: 0, t: 0 };
  }

  private shrineUnlocked(id: string, lib: Set<DistrictId>): boolean {
    return id.startsWith('shrine_') && lib.has(id.slice(7) as DistrictId);
  }

  private oneWayCheck(a: Actor, p: Phaser.Physics.Arcade.Image): boolean {
    const b = a.body;
    if (!b || b.velocity.y < 0) return false;
    if (a instanceof Player && a.dropUntil > this.w.now) return false;
    const top = p.body!.top;
    return b.bottom - b.deltaY() <= top + 4;
  }

  private buildTerrain(level: LevelData): void {
    const stoneFrom = level.districts.find((d) => d.id === 'temple')?.bounds.x0 ?? 1e9;
    for (const r of level.solids) {
      const stone = r.x >= stoneFrom;
      this.add.tileSprite(r.x, r.y, r.w, Math.min(16, r.h), stone ? 'tile_stoneTop' : 'tile_grass').setOrigin(0).setDepth(20);
      if (r.h > 16) this.add.tileSprite(r.x, r.y + 16, r.w, r.h - 16, stone ? 'tile_stone' : 'tile_dirt').setOrigin(0).setDepth(19);
    }
    for (const r of level.oneWays) this.add.tileSprite(r.x, r.y, r.w, 12, 'tile_plank').setOrigin(0).setDepth(21);
    for (const h of level.hazards ?? []) this.add.tileSprite(h.x, h.y + h.h - 16, h.w, 16, 'tile_spikes').setOrigin(0).setDepth(22);
    for (const d of level.districts)
      for (const a of d.ambient) {
        if (!this.textures.exists(a.type)) continue;
        const depth = (['house', 'safehouse', 'temple', 'ruinTower', 'tree', 'pine', 'stall', 'brokenGate'].includes(a.type) ? 10 : 25);
        const s = this.add.sprite(a.x, a.y, a.type).setOrigin(0.5, 1).setDepth(depth);
        if (this.anims.exists(`${a.type}:loop`)) s.play(`${a.type}:loop`);
        if (depth < 15) s.setTint(0xc8b8e0);
      }
  }

  private updateLighting(instant = false): void {
    const L = this.w.level.lighting;
    const d = this.w.districts?.current();
    let preset = L.occupied;
    if (this.bossStage === 'fight' && this.w.boss?.phase === 3) preset = L.bossP3;
    else if (d && this.w.districts.isLiberated(d.id)) preset = L.liberated;
    this.lightTarget = { color: parseInt(preset.tint.replace('#', ''), 16), alpha: preset.alpha };
    if (instant) this.light.setFillStyle(this.lightTarget.color, this.lightTarget.alpha);
  }

  enemyKilled(e: Enemy, k: KillType): void {
    const w = this.w;
    GameStore.state.kills++;
    GameStore.setRally(addRally(GameStore.state.rally, rallyForKill(e.elite, GameStore.state.upgrades.rally)));
    const coins = balance.enemies[e.type].coins * (e.elite ? 3 : 1);
    w.loot.drop(e.x, e.body.y + 10, rollDrops(w.rng, coins, e.elite, w.player.ammo / w.player.maxAmmo));
    const d = w.districts.current();
    const last = !!d && w.spawner.isLive(d.id) && w.spawner.remaining(d) === 0 && ![...w.enemies].some((o) => o !== e && o.isAlive());
    w.deathFx.play(e, k, { elite: e.elite, last, bigDissolve: e.type === 'brute' });
    GameEvents.emit('enemy:killed', { type: e.type, killType: k, elite: e.elite, x: e.x, y: e.y });
    this.multi.n = this.multi.t > 0 ? this.multi.n + 1 : 1;
    this.multi.t = 1500;
    if (this.multi.n >= 3) GameEvents.emit('combo:multi', { count: this.multi.n });
  }

  save(): void {
    const w = this.w;
    const s = GameStore.state;
    const districtStates = {} as Record<DistrictId, 'occupied' | 'liberated'>;
    for (const d of w.level.districts) districtStates[d.id] = w.districts?.isLiberated(d.id) ? 'liberated' : 'occupied';
    SaveManager.saveProgress({
      checkpointId: this.checkpoint.id,
      districtStates,
      coins: s.coins,
      upgrades: { ...s.upgrades },
      rescued: [...w.progress.rescued],
      bannersDestroyed: [...w.progress.banners],
      chestsOpened: [...w.progress.chests],
      deaths: s.deaths,
      playtimeMs: s.playtimeMs,
      kills: s.kills,
    });
  }

  setCheckpoint(id: string, x: number, y: number): void {
    this.checkpoint = { id, x, y };
    this.w.progress.checkpointId = id;
    GameStore.state.checkpointId = id;
    GameEvents.emit('checkpoint:reached', { id });
    this.save();
  }

  openShrine(id: string): void {
    if (this.w.inCombat()) {
      this.w.toast('Cannot pray while enemies are near', 'red');
      return;
    }
    this.scene.pause();
    this.scene.launch('Shrine', {
      id,
      onChange: () => {
        this.w.player.applyUpgrades(GameStore.state.upgrades);
        this.w.player.syncStore();
        this.save();
      },
    });
  }

  private onPlayerDied(): void {
    if (this.dying) return;
    this.dying = true;
    const w = this.w;
    AudioManager.play('playerDeath');
    AudioManager.setCombat(false);
    TimeController.slowMo(0.3, 900, 40);
    w.cam.zoomTo(1.25, 600);
    GameEvents.emit('fx:desaturate', { amount: 1, ms: 900 });
    this.time.delayedCall(1400, () => {
      const loss = coinLossOnDeath(GameStore.state.coins);
      GameStore.addCoins(-loss);
      GameStore.state.deaths++;
      GameStore.flush();
      this.save();
      this.scene.pause();
      this.scene.launch('GameOver', { coinLoss: loss });
    });
  }

  private retry(): void {
    this.scene.stop('GameOver');
    this.scene.start('Game', { continue: true });
  }

  private startBoss(): void {
    const w = this.w;
    const ba = w.level.bossArena;
    this.bossStage = 'intro';
    this.bossGate?.setOpen(false);
    w.summon.dismissAll();
    w.cam.setBounds({ x0: ba.x0, x1: ba.x1 });
    AudioManager.setMusic('boss');
    const boss = (w.boss = new Kaalasura(w, ba.bossSpawn.x, ba.bossSpawn.y - 1));
    w.groundGroup.add(boss);
    boss.onDefeated = () => this.bossDefeated();
    w.player.lock(true);
    this.cinematic = true;
    w.cam.focusOn(boss.x, boss.cy, 1.15, 500);
    GameEvents.emit('intro:card', { title: STR.boss.name, subtitle: STR.boss.title, durationMs: balance.boss.introMs });
    AudioManager.play('roar');
    this.time.delayedCall(700, () => w.cam.shake(8, 900));
    this.time.delayedCall(balance.boss.introMs, () => {
      w.cam.unfocus(400);
      w.player.lock(false);
      this.cinematic = false;
      this.bossStage = 'fight';
      boss.beginFight();
      this.updateLighting();
    });
    GameEvents.on('boss:phase', () => this.updateLighting());
  }

  private bossDefeated(): void {
    const w = this.w;
    const boss = w.boss!;
    this.bossStage = 'dead';
    this.cinematic = true;
    w.player.lock(true);
    w.player.invulnMs = 1e9;
    w.proj.clearAll();
    for (const e of w.enemies) if (e.isAlive()) w.combat.hit(e, { amount: 9999, kind: 'lightning', faction: 'hero', dirX: 1, knockback: 0, poise: 0, ignoreIFrames: true, noHitStop: true });
    AudioManager.setMusic('none');
    AudioManager.play('roar');
    TimeController.slowMo(0.25, 1600, 60);
    w.cam.focusOn(boss.x, boss.cy, 1.5, 300);
    w.fx.flash(0xffffff, 0.8, 150);
    boss.anims.play('boss:kneel');
    const R = this.reducedFx();
    const bursts = R ? 3 : 8;
    for (let i = 0; i < bursts; i++)
      this.time.delayedCall(300 + i * 280, () => {
        w.fx.burst(boss.x + (Math.random() - 0.5) * 60, boss.body.y + Math.random() * 90, 20, [PAL.cleanseGold, 0xffffff, PAL.ruinGlow], { speed: 240, life: 700, additive: true });
        w.cam.shake(5, 200);
        boss.setTintFill(0xffffff);
        this.time.delayedCall(60, () => boss.clearTint());
      });
    this.time.delayedCall(2600, () => {
      boss.body.enable = false;
      w.fx.dissolve(boss, 1800, { edge: PAL.cleanseGold, drift: 120, blast: 80 });
      w.fx.ring(boss.x, boss.cy, PAL.cleanseGold, 12, 900);
      w.fx.flash(0xfff4c0, 0.7, 200);
      GameEvents.emit('boss:died', {});
      this.lightTarget = { color: parseInt(w.level.lighting.liberated.tint.replace('#', ''), 16), alpha: w.level.lighting.liberated.alpha };
      this.time.delayedCall(1900, () => boss.destroy());
    });
    this.time.delayedCall(4400, () => {
      w.cam.unfocus(800);
      w.player.anim('cheer');
      AudioManager.setMusic('victory');
      GameEvents.emit('victory:title', {});
      const s = GameStore.state;
      SaveManager.recordClear(s.playtimeMs, s.deaths, s.rescued);
      SaveManager.clearProgress();
    });
    this.time.delayedCall(7800, () => {
      this.cameras.main.fadeOut(800, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        const s = GameStore.state;
        this.scene.stop('UI');
        this.scene.start('Victory', { timeMs: s.playtimeMs, deaths: s.deaths, rescued: s.rescued, total: s.totalCaptives, coins: s.coins, kills: s.kills });
      });
    });
  }

  private reducedFx(): boolean {
    return SaveManager.settings.reducedEffects;
  }

  override update(_t: number, delta: number): void {
    const w = this.w;
    if (!w?.player) return;
    const realDt = Math.min(delta, 50);
    const scale = TimeController.update();
    const dt = realDt * scale;
    w.now += dt;
    this.inp.update();
    const st = this.inp.state;
    if (st.pausePressed && !this.dying && this.bossStage !== 'dead') {
      this.scene.pause();
      this.scene.launch('Pause');
      GameEvents.emit('game:paused', { paused: true });
      return;
    }
    const p = w.player;
    p.in = this.cinematic || this.dying ? emptyInput() : st;
    if (!this.cinematic && !this.dying && st.summonPressed) w.summon.tryStart();
    this.handleInteract(realDt);

    p.step(dt);
    for (const a of w.allies) if (a.active) a.step(dt);
    for (const e of w.enemies) {
      if (!e.active) {
        w.enemies.delete(e);
        continue;
      }
      if (e.isAlive()) e.step(dt);
    }
    if (w.boss?.active && w.boss.isAlive()) w.boss.step(dt);
    w.proj.update(dt);
    w.loot.update(dt);
    w.spawner.update(dt);
    w.districts.update(dt);
    w.summon.update(dt);
    for (const b of w.banners) b.update(dt);
    w.fx.update(dt);
    this.multi.t -= realDt;

    // hazards & pits
    if (!p.dead && !this.dying) {
      if (p.y > w.level.height + 60) {
        w.combat.hit(p, { amount: balance.world.hazardDamage * 2, kind: 'contact', faction: 'neutral', dirX: 0, knockback: 0, poise: 0, ignoreIFrames: true, noHitStop: true });
        GameEvents.emit('player:hazard', {});
        if (!p.dead) p.respawnSafe();
      }
      for (const h of w.level.hazards ?? [])
        if (p.x > h.x && p.x < h.x + h.w && p.y > h.y && p.y - 10 < h.y + h.h && p.invulnMs <= 0) {
          const r = w.combat.hit(p, { amount: balance.world.hazardDamage, kind: 'contact', faction: 'neutral', dirX: 0, knockback: 0, knockUp: 420, poise: 0 });
          if (r.applied) GameEvents.emit('player:hazard', {});
        }
    }
    for (const e of w.enemies) if (e.isAlive() && e.y > w.level.height + 100) e.hp = 0;

    const ba = w.level.bossArena;
    if (this.bossStage === 'none' && p.x > ba.trigger.x && !p.dead) this.startBoss();

    this.lastEnemyT += realDt;
    if (this.lastEnemyT > 500) {
      this.lastEnemyT = 0;
      AudioManager.setCombat(w.inCombat());
      this.updateLighting();
    }
    const lc = Phaser.Display.Color.IntegerToColor(this.light.fillColor);
    const tc = Phaser.Display.Color.IntegerToColor(this.lightTarget.color);
    const k = Math.min(1, realDt / 600);
    const mix = Phaser.Display.Color.Interpolate.ColorWithColor(lc, tc, 1, k);
    this.light.setFillStyle(Phaser.Display.Color.GetColor(mix.r, mix.g, mix.b), this.light.fillAlpha + (this.lightTarget.alpha - this.light.fillAlpha) * k);

    w.cam.update(realDt);
    const cam = this.cameras.main;
    this.bg.update(cam.scrollX, cam.scrollY);
    this.updateWeather(realDt);
    if (!this.dying) GameStore.state.playtimeMs += realDt;
    p.syncStore();
    GameStore.flush();
    if (this.debugText) this.updateDebug(scale);
  }

  private handleInteract(dt: number): void {
    const w = this.w;
    const p = w.player;
    let best: Interactable | null = null;
    let bd = Infinity;
    if (!p.dead && !this.cinematic)
      for (const it of w.interactables) {
        const d = Math.hypot(it.x - p.x, (it.y - p.y) * 0.5);
        if (d < it.range && d < bd && it.canInteract()) {
          best = it;
          bd = d;
        }
      }
    if (best !== this.holdTarget) this.holdT = 0;
    this.holdTarget = best;
    if (!best) {
      if (this.promptShown) GameEvents.emit('prompt:hide', {});
      this.promptShown = false;
      return;
    }
    const st = p.in;
    let progress: number | undefined;
    if (best.holdMs > 0) {
      if (st.interactHeld) this.holdT += dt;
      else this.holdT = Math.max(0, this.holdT - dt * 2);
      progress = this.holdT / best.holdMs;
      if (this.holdT >= best.holdMs) {
        this.holdT = 0;
        best.interact();
      }
    } else if (st.interactPressed) best.interact();
    GameEvents.emit('prompt:show', { key: 'interact', label: best.label(), progress });
    this.promptShown = true;
  }

  private updateWeather(dt: number): void {
    const wx = this.w.districts.weather();
    const reduced = this.reducedFx();
    this.fog.setAlpha(this.fog.alpha + ((wx === 'fog' ? 0.12 : 0) - this.fog.alpha) * Math.min(1, dt / 800));
    if (this.fog.alpha > 0.01) this.fog.tilePositionX += dt * 0.004;
    const g = this.weatherG;
    g.clear();
    const target = wx === 'rain' ? (reduced ? 40 : 120) : 0;
    while (this.rain.length < target) this.rain.push({ x: Math.random() * (GAME_W + 100), y: Math.random() * GAME_H, l: 8 + Math.random() * 10 });
    if (this.rain.length > target) this.rain.length = target;
    g.lineStyle(1, 0x9aa8d8, 0.45);
    for (const r of this.rain) {
      r.y += dt * 0.9;
      r.x -= dt * 0.18;
      if (r.y > GAME_H) {
        r.y = -r.l;
        r.x = Math.random() * (GAME_W + 100);
      }
      g.lineBetween(r.x, r.y, r.x - r.l * 0.2, r.y + r.l);
    }
  }

  private toggleDebug(): void {
    if (this.debugText) {
      this.debugText.destroy();
      this.debugText = null;
      this.physics.world.drawDebug = false;
      this.physics.world.debugGraphic?.clear();
      return;
    }
    this.debugText = pxText(this, 8, 8, '', 1, 0x7cff7c).setScrollFactor(0).setDepth(2000);
    if (!this.physics.world.debugGraphic) this.physics.world.createDebugGraphic();
    this.physics.world.drawDebug = true;
  }

  private updateDebug(scale: number): void {
    const w = this.w;
    const p = w.player;
    const alive = [...w.enemies].filter((e) => e.isAlive()).length;
    this.debugText!.setText(
      [
        `FPS ${Math.round(this.game.loop.actualFps)}  timescale ${scale.toFixed(2)}`,
        `hero ${Math.round(p.x)},${Math.round(p.y)} st ${p.st} hp ${Math.ceil(p.hp)}`,
        `enemies ${alive}/${balance.world.activeEnemyCap} tokens ${w.tokens.inUse} allies ${w.allies.size}`,
        `proj ${w.proj.list.length} loot ${w.loot.items.length}`,
        `district ${w.districts.current()?.id ?? '-'} ${w.districts.current() ? w.districts.states[w.districts.current()!.id] : ''}`,
        `boss ${this.bossStage} ${w.boss ? `${Math.ceil(w.boss.hp)} p${w.boss.phase} ${w.boss.st}` : ''}`,
        'F3 debug  F4 kill all  F6 warp',
      ].join('\n'),
    );
  }

  private exposeTestHooks(): void {
    const w = this.w;
    (window as unknown as { __BHEEM__: unknown }).__BHEEM__ = {
      scene: 'Game',
      player: () => ({ x: w.player.x, y: w.player.y, hp: w.player.hp, st: w.player.st, weapon: w.player.weapon }),
      enemies: () => [...w.enemies].filter((e) => e.isAlive()).length,
      district: () => w.districts.current()?.id ?? null,
      boss: () => (w.boss ? { hp: w.boss.hp, phase: w.boss.phase } : null),
      warp: (x: number) => {
        w.player.setPosition(x, w.player.y - 300);
        w.player.body.reset(x, w.player.y - 300);
      },
      states: () => ({ ...w.districts.states }),
      god: () => {
        w.player.invulnMs = 1e9;
      },
      killAll: () => {
        for (const e of w.enemies) if (e.isAlive()) w.combat.hit(e, { amount: 9999, kind: 'melee', faction: 'hero', dirX: 1, knockback: 0, poise: 0, ignoreIFrames: true });
      },
      breakBanner: () => {
        const b = w.districts.current() && w.districts.banners.get(w.districts.current()!.id);
        return b ? b.damage(9999, b.x, b.y) : false;
      },
      killPlayer: () => {
        w.player.invulnMs = 0;
        w.combat.hit(w.player, { amount: 9999, kind: 'melee', faction: 'enemy', dirX: 1, knockback: 0, poise: 0, ignoreIFrames: true });
      },
      hitBoss: (n: number) => {
        if (w.boss?.isAlive()) w.combat.hit(w.boss, { amount: n, kind: 'melee', faction: 'hero', dirX: 1, knockback: 0, poise: 0, ignoreIFrames: true });
      },
    };
  }
}
