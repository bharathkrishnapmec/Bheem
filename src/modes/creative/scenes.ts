import { ARENA_IDS } from '@/level/LevelLoader';
import type { ArenaId } from '@/level/levelSchema';
import Phaser from 'phaser';
import { GAME_H, GAME_W } from '@/config/gameConfig';
import { PAL } from '@/config/palette';
import { STR } from '@/config/strings';
import { SaveManager } from '@/core/SaveManager';
import type { EnemyType } from '@/core/types';
import { AudioManager } from '@/audio/AudioManager';
import { InputManager } from '@/input/InputManager';
import { pxText } from '@/ui/text';
import { MenuList, drawPanel, type MenuItem } from '@/ui/widgets';
import { TouchControls } from '@/ui/touch/TouchControls';
import { GameContext, type CreativeStart } from './GameContext';
import { CreativeStore } from './CreativeStore';
import { bossRegistry } from './bossRegistry';
import type { CreativeController } from './CreativeController';

const setSceneName = (name: string): void => {
  const h = (window as unknown as { __BHEEM__?: { scene?: string } }).__BHEEM__;
  if (h) h.scene = name;
};
const fmt = (ms: number | null): string => {
  if (ms === null) return STR.creative.none;
  const s = ms / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};
const cycle = <T>(list: readonly T[], v: T, d: number): T => list[(list.indexOf(v) + d + list.length) % list.length]!;

abstract class MenuScene extends Phaser.Scene {
  protected inp!: InputManager;
  protected menu!: MenuList;
  protected backdrop(): void {
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x140c24, 1).setOrigin(0);
    const g = this.add.graphics();
    for (let i = 0; i < 60; i++) g.fillStyle(0xffffff, Math.random() * 0.6).fillRect(Math.random() * GAME_W, Math.random() * GAME_H * 0.6, 2, 2);
  }
  protected setupInput(): void {
    this.inp = new InputManager(this);
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      this.inp.flush();
      this.menu?.refresh();
    });
  }
  protected startCreative(start: CreativeStart): void {
    AudioManager.unlock();
    this.scene.stop('Game');
    this.scene.stop('UI');
    this.scene.start('Game', { creative: start });
  }
  override update(): void {
    this.inp.update();
    if (this.inp.state.back) return this.onBack();
    this.menu.update(this.inp.state);
  }
  protected abstract onBack(): void;
}

/** Main Menu -> Creative Mode hub. */
export class CreativeMenuScene extends MenuScene {
  private arena: ArenaId = GameContext.start?.kind === 'sandbox' ? (GameContext.start.arena ?? 'training_yard') : 'training_yard';
  constructor() {
    super('CreativeMenu');
  }
  create(): void {
    this.backdrop();
    TouchControls.setPlaying(false);
    pxText(this, GAME_W / 2, 70, STR.creative.title.toUpperCase(), 5, PAL.cleanseGold).setOrigin(0.5, 0);
    pxText(this, GAME_W / 2, 130, 'All weapons, max upgrades, full squad. No Story progress is touched.', 1, PAL.statusCyan).setOrigin(0.5, 0);
    this.menu = new MenuList(
      this,
      GAME_W / 2,
      220,
      [
        {
          label: () => STR.creative.sandboxArena,
          value: () => `< ${STR.arena.names[this.arena]} >`,
          onConfirm: () => this.startCreative({ kind: 'sandbox', arena: this.arena }),
          onLeft: () => (this.arena = cycle(ARENA_IDS, this.arena, -1)),
          onRight: () => (this.arena = cycle(ARENA_IDS, this.arena, 1)),
        },
        { label: () => STR.creative.bossSelect, onConfirm: () => this.scene.start('BossSelect') },
        { label: () => STR.creative.back, onConfirm: () => this.onBack() },
      ],
      { width: 420, spacing: 52, scale: 2 },
    );
    this.setupInput();
    setSceneName('CreativeMenu');
  }
  protected onBack(): void {
    this.scene.start('MainMenu');
  }
}

/** Boss cards generated from bossRegistry plus fight options. */
export class BossSelectScene extends MenuScene {
  private sel = 0;
  private phase: 1 | 2 | 3 | 4 = 1;
  private allies: 'none' | 'auto' = 'none';
  private skipIntro = true;
  private card!: Phaser.GameObjects.Container;
  constructor() {
    super('BossSelect');
  }
  create(): void {
    this.backdrop();
    TouchControls.setPlaying(false);
    const prev = GameContext.start;
    if (prev?.kind === 'boss') {
      this.sel = Math.max(0, bossRegistry.findIndex((b) => b.id === prev.bossId));
      this.phase = prev.phase ?? 1;
      this.allies = prev.allies ?? 'none';
      this.skipIntro = prev.skipIntro !== false;
    }
    pxText(this, GAME_W / 2, 24, STR.creative.bossSelect.toUpperCase(), 4, PAL.cleanseGold).setOrigin(0.5, 0);
    this.card = this.add.container(0, 0);
    this.drawCards();
    const boss = () => bossRegistry[this.sel]!;
    const items: MenuItem[] = [
      { label: () => STR.creative.boss, value: () => `< ${boss().name} >`, onLeft: () => this.pick(-1), onRight: () => this.pick(1), onConfirm: () => this.pick(1) },
      {
        label: () => STR.creative.startPhase,
        value: () => `< ${Math.min(this.phase, boss().phases)} >`,
        onLeft: () => (this.phase = cycle([1, 2, 3] as const, this.phase, -1)),
        onRight: () => (this.phase = cycle([1, 2, 3] as const, this.phase, 1)),
        onConfirm: () => (this.phase = cycle([1, 2, 3] as const, this.phase, 1)),
        enabled: () => boss().phases > 1,
      },
      {
        label: () => STR.creative.allies,
        value: () => `< ${this.allies === 'auto' ? STR.creative.alliesAuto : STR.creative.alliesNone} >`,
        onLeft: () => (this.allies = this.allies === 'auto' ? 'none' : 'auto'),
        onRight: () => (this.allies = this.allies === 'auto' ? 'none' : 'auto'),
        onConfirm: () => (this.allies = this.allies === 'auto' ? 'none' : 'auto'),
      },
      {
        label: () => STR.creative.skipIntro,
        value: () => (this.skipIntro ? STR.creative.on : STR.creative.off),
        onLeft: () => (this.skipIntro = !this.skipIntro),
        onRight: () => (this.skipIntro = !this.skipIntro),
        onConfirm: () => (this.skipIntro = !this.skipIntro),
      },
      { label: () => STR.creative.fight, onConfirm: () => this.fight() },
      { label: () => STR.creative.back, onConfirm: () => this.onBack() },
    ];
    this.menu = new MenuList(this, GAME_W / 2, 300, items, { width: 520, spacing: 34, scale: 2 });
    this.setupInput();
    setSceneName('BossSelect');
  }
  private pick(d: number): void {
    this.sel = (this.sel + d + bossRegistry.length) % bossRegistry.length;
    this.drawCards();
  }
  private drawCards(): void {
    this.card.removeAll(true);
    const n = bossRegistry.length;
    const cw = 300;
    const gap = 24;
    const x0 = GAME_W / 2 - (n * cw + (n - 1) * gap) / 2;
    bossRegistry.forEach((b, i) => {
      const x = x0 + i * (cw + gap);
      const on = i === this.sel;
      const g = this.add.graphics();
      drawPanel(g, x, 74, cw, 196, { alpha: on ? 0.98 : 0.7, trim: on ? PAL.cleanseGold : undefined });
      const thumb = this.add.image(x + 54, 220, b.thumbnailKey, 0).setOrigin(0.5, 1);
      thumb.setScale(Math.min(1, 96 / Math.max(thumb.height, 1))).setAlpha(on ? 1 : 0.6);
      const zone = this.add.zone(x, 74, cw, 196).setOrigin(0).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        if (this.sel === i) this.fight();
        else this.pick(i - this.sel);
      });
      this.card.add([
        g,
        thumb,
        pxText(this, x + 110, 88, b.name, b.name.length > 10 ? 1.5 : 2, on ? PAL.cleanseGold : 0xc8c0d8),
        pxText(this, x + 110, 110, b.title, 1, PAL.statusCyan),
        pxText(this, x + 110, 130, `${STR.creative.hp} ${b.hp}   ${STR.creative.phases} ${b.phases}`, 1, 0xffffff),
        pxText(this, x + 110, 146, `${STR.creative.bestTime} ${fmt(CreativeStore.bestTime(b.id))}`, 1, PAL.cleanseGold),
        pxText(this, x + 110, 166, b.description, 1, 0xd8d0e8).setMaxWidth(cw - 122),
        zone,
      ]);
    });
  }
  private fight(): void {
    const b = bossRegistry[this.sel]!;
    this.startCreative({ kind: 'boss', bossId: b.id, phase: b.phases > 1 ? this.phase : 1, allies: this.allies, skipIntro: this.skipIntro });
  }
  protected onBack(): void {
    this.scene.start('CreativeMenu');
  }
}

type GameLike = Phaser.Scene & { creativeCtl: CreativeController | null; creativeReset(): void; openBossSelect(): void };

/** In-game Creative toolbox overlay (Game is paused underneath). */
export class ToolboxScene extends MenuScene {
  private enemy: EnemyType = 'raider';
  private pickup: 'health' | 'prana' | 'arrows' = 'health';
  private moves: Phaser.GameObjects.Container | null = null;
  constructor() {
    super('Toolbox');
  }
  private get gameScene(): GameLike {
    return this.scene.get('Game') as GameLike;
  }
  create(): void {
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x05040a, 0.55).setOrigin(0);
    const g = this.add.graphics();
    drawPanel(g, GAME_W / 2 - 250, 14, 500, GAME_H - 28, { alpha: 0.96, trim: PAL.statusCyan });
    pxText(this, GAME_W / 2, 26, STR.creative.toolbox.toUpperCase(), 3, PAL.statusCyan).setOrigin(0.5, 0);
    const m = GameContext.modifiers;
    const ctl = () => this.gameScene.creativeCtl;
    const onOff = (v: boolean) => (v ? STR.creative.on : STR.creative.off);
    const toggle = (label: string, k: keyof typeof m): MenuItem => ({ label: () => label, value: () => onOff(m[k]), onConfirm: () => (m[k] = !m[k]), onLeft: () => (m[k] = !m[k]), onRight: () => (m[k] = !m[k]) });
    const enemies: EnemyType[] = ['raider', 'boneArcher', 'mireHexer', 'skyCaller', 'brute', 'imp'];
    const pickups = ['health', 'prana', 'arrows'] as const;
    const slow = [1, 0.5, 0.25] as const;
    const items: MenuItem[] = [
      toggle(STR.creative.god, 'godMode'),
      {
        label: () => STR.creative.hazards,
        value: () => (m.hazardsPaused ? STR.creative.paused : STR.creative.on),
        onConfirm: () => (m.hazardsPaused = !m.hazardsPaused),
        onLeft: () => (m.hazardsPaused = !m.hazardsPaused),
        onRight: () => (m.hazardsPaused = !m.hazardsPaused),
      },
      toggle(STR.creative.infPrana, 'infinitePrana'),
      toggle(STR.creative.infArrows, 'infiniteArrows'),
      toggle(STR.creative.instantRally, 'instantRally'),
      toggle(STR.creative.noDashCd, 'noDashCooldown'),
      {
        label: () => STR.creative.slowMo,
        value: () => `< ${GameContext.slowMo}x >`,
        onConfirm: () => ctl()?.setSlowMo(cycle(slow, GameContext.slowMo, 1)),
        onRight: () => ctl()?.setSlowMo(cycle(slow, GameContext.slowMo, 1)),
        onLeft: () => ctl()?.setSlowMo(cycle(slow, GameContext.slowMo, -1)),
      },
      {
        label: () => STR.creative.dmgNumbers,
        value: () => onOff(SaveManager.settings.damageNumbers),
        onConfirm: () => SaveManager.updateSettings({ damageNumbers: !SaveManager.settings.damageNumbers }),
        onLeft: () => SaveManager.updateSettings({ damageNumbers: !SaveManager.settings.damageNumbers }),
        onRight: () => SaveManager.updateSettings({ damageNumbers: !SaveManager.settings.damageNumbers }),
      },
      {
        label: () => STR.creative.spawn,
        value: () => `< ${STR.creative.enemies[this.enemy]} >`,
        onLeft: () => (this.enemy = cycle(enemies, this.enemy, -1)),
        onRight: () => (this.enemy = cycle(enemies, this.enemy, 1)),
        onConfirm: () => ctl()?.spawn(this.enemy),
      },
      { label: () => STR.creative.dummy, onConfirm: () => ctl()?.spawn('dummy') },
      {
        label: () => STR.creative.pickup,
        value: () => `< ${STR.creative.pickups[this.pickup]} >`,
        onLeft: () => (this.pickup = cycle(pickups, this.pickup, -1)),
        onRight: () => (this.pickup = cycle(pickups, this.pickup, 1)),
        onConfirm: () => ctl()?.spawnPickup(this.pickup),
      },
      { label: () => STR.creative.summon, onConfirm: () => ctl()?.summonSquad() },
      { label: () => STR.creative.clear, onConfirm: () => ctl()?.clearAll() },
      { label: () => STR.creative.moves, onConfirm: () => this.toggleMoves() },
      { label: () => STR.creative.close, onConfirm: () => this.onBack() },
    ];
    this.menu = new MenuList(this, GAME_W / 2, 70, items, { width: 440, spacing: 32, scale: 1 });
    this.setupInput();
    setSceneName('Toolbox');
  }
  private toggleMoves(): void {
    if (this.moves) {
      this.moves.destroy();
      this.moves = null;
      return;
    }
    const g = this.add.graphics();
    drawPanel(g, GAME_W / 2 - 300, GAME_H / 2 - 100, 600, 200, { alpha: 0.98, trim: PAL.cleanseGold });
    this.moves = this.add.container(0, 0, [
      g,
      pxText(this, GAME_W / 2, GAME_H / 2 - 88, STR.creative.moves.toUpperCase(), 2, PAL.cleanseGold).setOrigin(0.5, 0),
      ...STR.creative.moveList.map((l, i) => pxText(this, GAME_W / 2 - 284, GAME_H / 2 - 52 + i * 22, l, 1, 0xffffff)),
    ]);
  }
  override update(): void {
    this.inp.update();
    if (this.inp.state.toolboxPressed || this.inp.state.pausePressed) return this.onBack();
    if (this.moves && (this.inp.state.back || this.inp.state.confirm)) return this.toggleMoves();
    super.update();
  }
  protected onBack(): void {
    this.scene.stop();
    this.scene.resume('Game');
    setSceneName('Game');
  }
}

/** Boss fight result panel. */
export class CreativeResultScene extends MenuScene {
  constructor() {
    super('CreativeResult');
  }
  create(d: { timeMs: number; damageTaken: number; hitsLanded: number; bossId: string; newBest: boolean }): void {
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x05040a, 0.6).setOrigin(0);
    const g = this.add.graphics();
    drawPanel(g, GAME_W / 2 - 220, 50, 440, 440, { alpha: 0.96, trim: PAL.cleanseGold });
    pxText(this, GAME_W / 2, 66, STR.creative.result.toUpperCase(), 3, PAL.cleanseGold).setOrigin(0.5, 0);
    const rows: [string, string][] = [
      [STR.creative.time, fmt(d.timeMs)],
      [STR.creative.dmgTaken, String(Math.round(d.damageTaken))],
      [STR.creative.hitsLanded, String(d.hitsLanded)],
      [STR.creative.bestTime, fmt(CreativeStore.bestTime(d.bossId))],
    ];
    rows.forEach(([k, v], i) => {
      pxText(this, GAME_W / 2 - 180, 112 + i * 26, k, 2, PAL.statusCyan);
      pxText(this, GAME_W / 2 + 180, 112 + i * 26, v, 2, 0xffffff).setOrigin(1, 0);
    });
    if (d.newBest) pxText(this, GAME_W / 2, 220, STR.creative.newBest, 2, PAL.ember).setOrigin(0.5, 0);
    const game = () => this.scene.get('Game') as GameLike;
    this.menu = new MenuList(
      this,
      GAME_W / 2,
      270,
      [
        {
          label: () => STR.creative.rematch,
          onConfirm: () => {
            this.close();
            game().creativeReset();
          },
        },
        { label: () => STR.creative.bossSelect, onConfirm: () => (this.scene.stop(), game().openBossSelect()) },
        { label: () => STR.creative.sandbox, onConfirm: () => this.startCreative({ kind: 'sandbox', arena: GameContext.start?.arena }) },
        { label: () => STR.pause.quit, onConfirm: () => this.onBack() },
      ],
      { width: 320, spacing: 44, scale: 2 },
    );
    this.setupInput();
    setSceneName('CreativeResult');
  }
  private close(): void {
    this.scene.stop();
    this.scene.resume('Game');
    setSceneName('Game');
  }
  protected onBack(): void {
    TouchControls.setPlaying(false);
    this.scene.stop('Game');
    this.scene.stop('UI');
    this.scene.stop();
    this.scene.start('MainMenu');
  }
}
