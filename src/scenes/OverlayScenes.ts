import Phaser from 'phaser';
import { GAME_H, GAME_W } from '@/config/gameConfig';
import { balance, type UpgradeId } from '@/config/balance';
import { PAL } from '@/config/palette';
import { STR } from '@/config/strings';
import { GameEvents } from '@/core/GameEvents';
import { GameStore } from '@/core/GameStore';
import { SaveManager } from '@/core/SaveManager';
import { canPurchase, upgradeCost } from '@/logic/economy';
import { AudioManager } from '@/audio/AudioManager';
import { InputManager } from '@/input/InputManager';
import { pxText } from '@/ui/text';
import { MenuList, drawPanel, type MenuItem } from '@/ui/widgets';
import { GameContext } from '@/modes/creative/GameContext';

abstract class Overlay extends Phaser.Scene {
  protected inp!: InputManager;
  protected menu!: MenuList;
  protected dim(alpha = 0.6): void {
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x05040a, alpha).setOrigin(0);
  }
  protected panel(w: number, h: number): void {
    const g = this.add.graphics();
    drawPanel(g, GAME_W / 2 - w / 2, GAME_H / 2 - h / 2, w, h, { alpha: 0.95 });
  }
  protected setupInput(): void {
    this.inp = new InputManager(this);
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      this.inp.flush();
      this.menu?.refresh();
    });
  }
  protected toMenu(): void {
    this.scene.stop('Game');
    this.scene.stop('UI');
    this.scene.stop();
    this.scene.start('MainMenu');
  }
}

export class PauseScene extends Overlay {
  constructor() {
    super('Pause');
  }
  create(): void {
    this.dim();
    const cr = GameContext.creative;
    this.panel(360, cr ? 440 : 300);
    pxText(this, GAME_W / 2, cr ? 64 : GAME_H / 2 - 120, STR.pause.title, 4, PAL.cleanseGold).setOrigin(0.5, 0);
    const game = () => this.scene.get('Game') as Phaser.Scene & { creativeReset(): void; openBossSelect(): void };
    const creativeItems: MenuItem[] = cr
      ? [
          {
            label: () => STR.creative.reset,
            onConfirm: () => {
              this.resume();
              game().creativeReset();
            },
          },
          {
            label: () => STR.creative.toolbox,
            onConfirm: () => {
              AudioManager.duck(0);
              this.scene.stop();
              this.scene.launch('Toolbox');
            },
          },
          {
            label: () => STR.creative.bossSelect,
            onConfirm: () => {
              AudioManager.duck(0);
              this.scene.stop();
              game().openBossSelect();
            },
          },
        ]
      : [];
    this.menu = new MenuList(
      this,
      GAME_W / 2,
      cr ? 130 : GAME_H / 2 - 20,
      [
        { label: () => STR.pause.resume, onConfirm: () => this.resume() },
        ...creativeItems,
        { label: () => STR.pause.restart, onConfirm: () => this.restart() },
        {
          label: () => STR.pause.settings,
          onConfirm: () => {
            this.scene.pause();
            this.scene.launch('Settings', { from: 'Pause' });
            this.scene.bringToTop('Settings');
          },
        },
        { label: () => STR.pause.quit, onConfirm: () => this.toMenu() },
      ],
      { width: 280, spacing: cr ? 40 : 40, scale: 2 },
    );
    this.setupInput();
    AudioManager.duck(99999);
    (window as unknown as { __BHEEM__?: { scene?: string } }).__BHEEM__!.scene = 'Pause';
  }
  private restart(): void {
    AudioManager.duck(0);
    GameEvents.emit('ui:intent', { type: 'restart' });
  }
  private resume(): void {
    AudioManager.duck(0);
    GameEvents.emit('game:paused', { paused: false });
    (window as unknown as { __BHEEM__?: { scene?: string } }).__BHEEM__!.scene = 'Game';
    this.scene.stop();
    this.scene.resume('Game');
  }
  override update(): void {
    this.inp.update();
    if (this.inp.state.pausePressed || this.inp.state.back) return this.resume();
    this.menu.update(this.inp.state);
  }
}

export class GameOverScene extends Overlay {
  constructor() {
    super('GameOver');
  }
  create(data: { coinLoss?: number }): void {
    this.dim(0);
    const bg = this.add.rectangle(0, 0, GAME_W, GAME_H, 0x1a0508, 0).setOrigin(0);
    this.tweens.add({ targets: bg, fillAlpha: 0.8, duration: 600 });
    pxText(this, GAME_W / 2, 130, STR.gameOver.title, 3, PAL.danger).setOrigin(0.5);
    pxText(this, GAME_W / 2, 176, STR.gameOver.subtitle, 2, 0xd8c8d8).setOrigin(0.5);
    if (data.coinLoss) pxText(this, GAME_W / 2, 210, STR.gameOver.coinLoss(data.coinLoss), 2, PAL.cleanseGold).setOrigin(0.5);
    this.menu = new MenuList(
      this,
      GAME_W / 2,
      270,
      [
        { label: () => STR.gameOver.retry, onConfirm: () => GameEvents.emit('ui:intent', { type: 'retry' }) },
        { label: () => STR.gameOver.menu, onConfirm: () => this.toMenu() },
      ],
      { width: 300, spacing: 40, scale: 2 },
    );
    this.setupInput();
    (window as unknown as { __BHEEM__?: { scene?: string } }).__BHEEM__!.scene = 'GameOver';
  }
  override update(): void {
    this.inp.update();
    this.menu.update(this.inp.state);
  }
}

export class VictoryScene extends Overlay {
  constructor() {
    super('Victory');
  }
  create(d: { timeMs: number; deaths: number; rescued: number; total: number; coins: number; kills: number; score: number }): void {
    const newBest = SaveManager.recordScore(d.score);
    this.cameras.main.fadeIn(800, 0, 0, 0);
    this.add.image(0, 0, 'bg_sky').setOrigin(0).setDisplaySize(GAME_W, GAME_H).setTint(0xffe0b0);
    this.add.image(GAME_W / 2, GAME_H, 'bg_mid').setOrigin(0.5, 1).setScale(2).setTint(0xffd890);
    this.dim(0.35);
    this.panel(520, 360);
    pxText(this, GAME_W / 2, 110, STR.victory.title, 4, PAL.cleanseGold).setOrigin(0.5);
    pxText(this, GAME_W / 2, 150, STR.victory.subtitle, 1, PAL.statusCyan).setOrigin(0.5);
    const s = Math.floor(d.timeMs / 1000);
    const rows: [string, string][] = [
      [STR.victory.time, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`],
      [STR.victory.deaths, String(d.deaths)],
      [STR.victory.rescued, `${d.rescued}/${d.total}`],
      [STR.victory.kills, String(d.kills)],
      [STR.victory.coins, String(d.coins)],
      [STR.victory.score, String(d.score)],
    ];
    rows.forEach(([k, v], i) => {
      const y = 184 + i * 26;
      const a = pxText(this, GAME_W / 2 - 200, y, k, 2, 0xe8e0f0).setAlpha(0);
      const b = pxText(this, GAME_W / 2 + 200, y, v, 2, PAL.cleanseGold).setOrigin(1, 0).setAlpha(0);
      this.tweens.add({ targets: [a, b], alpha: 1, delay: 400 + i * 200, duration: 300 });
    });
    const stars = 1 + (d.rescued >= d.total ? 1 : 0) + (d.deaths === 0 ? 1 : 0);
    for (let i = 0; i < 3; i++) {
      const st = this.add.image(GAME_W / 2 - 50 + i * 50, 350, i < stars ? 'icon_star' : 'icon_starEmpty').setScale(0);
      st.y = 356;
      this.tweens.add({ targets: st, scale: 2, delay: 1500 + i * 250, duration: 300, ease: 'Back.out', onStart: () => i < stars && AudioManager.play('coin') });
    }
    const best = SaveManager.get().bestClear;
    const bestScore = SaveManager.get().bestScore ?? d.score;
    let line = `${STR.victory.bestScore}: ${bestScore}`;
    if (best) {
      const b = Math.floor(best.timeMs / 1000);
      line = `${STR.victory.best}: ${Math.floor(b / 60)}:${String(b % 60).padStart(2, '0')}   ${line}`;
    }
    pxText(this, GAME_W / 2, 386, line, 1, PAL.statusCyan).setOrigin(0.5);
    if (newBest) pxText(this, GAME_W / 2 + 200, 330, STR.victory.newBest, 1, PAL.ember).setOrigin(1, 0.5);
    this.menu = new MenuList(this, GAME_W / 2, 420, [{ label: () => STR.victory.menu, onConfirm: () => this.toMenu() }], { width: 240, spacing: 36, scale: 2 });
    this.setupInput();
    AudioManager.setMusic('victory');
    (window as unknown as { __BHEEM__?: { scene?: string } }).__BHEEM__ = { scene: 'Victory' };
  }
  override update(): void {
    this.inp.update();
    this.menu.update(this.inp.state);
  }
}

const UPGRADES: UpgradeId[] = ['might', 'vitality', 'quiver', 'prana', 'rally'];

export class ShrineScene extends Overlay {
  private onChange: () => void = () => {};
  private coinText!: Phaser.GameObjects.BitmapText;
  private msg!: Phaser.GameObjects.BitmapText;
  constructor() {
    super('Shrine');
  }
  create(data: { id: string; onChange?: () => void }): void {
    this.onChange = data.onChange ?? (() => {});
    this.dim(0.55);
    this.panel(560, 400);
    pxText(this, GAME_W / 2, 86, STR.shrine.title, 3, PAL.cleanseGold).setOrigin(0.5);
    pxText(this, GAME_W / 2, 118, STR.shrine.subtitle, 1, PAL.statusCyan).setOrigin(0.5);
    this.add.image(GAME_W / 2 - 40, 144, 'icon_coin');
    this.coinText = pxText(this, GAME_W / 2 - 26, 138, '', 2, PAL.cleanseGold);
    this.msg = pxText(this, GAME_W / 2, 430, '', 1, PAL.statusCyan).setOrigin(0.5);
    const items = UPGRADES.map((id) => ({
      label: () => `${STR.upgrades[id].name} ${'*'.repeat(GameStore.state.upgrades[id])}`,
      value: () => {
        const c = upgradeCost(id, GameStore.state.upgrades[id]);
        return c === null ? STR.shrine.maxed : `${c}c`;
      },
      enabled: () => upgradeCost(id, GameStore.state.upgrades[id]) !== null,
      onConfirm: () => this.buy(id),
    }));
    this.menu = new MenuList(this, GAME_W / 2, 180, [...items, { label: () => STR.shrine.close, onConfirm: () => this.close() }], { width: 460, spacing: 34, scale: 2 });
    this.setupInput();
    this.refresh();
  }
  private refresh(): void {
    this.coinText.setText(String(GameStore.state.coins));
    const it = UPGRADES[this.menu.index];
    if (it) this.msg.setText(STR.upgrades[it].desc).setTint(PAL.statusCyan);
    this.menu.refresh();
  }
  private buy(id: UpgradeId): void {
    const tier = GameStore.state.upgrades[id];
    const cost = upgradeCost(id, tier);
    if (cost === null || !canPurchase(id, tier, GameStore.state.coins)) {
      AudioManager.play('deny');
      this.msg.setText(STR.shrine.notEnough).setTint(PAL.danger);
      return;
    }
    GameStore.addCoins(-cost);
    GameStore.state.upgrades[id] = tier + 1;
    GameStore.flush();
    AudioManager.play('purchase');
    GameEvents.emit('upgrade:purchased', { id, tier: tier + 1 });
    this.onChange();
    this.refresh();
    this.msg.setText(STR.shrine.purchased).setTint(PAL.cleanseGold);
  }
  private close(): void {
    GameEvents.emit('shrine:close', {});
    this.scene.stop();
    this.scene.resume('Game');
  }
  override update(): void {
    this.inp.update();
    const st = this.inp.state;
    if (st.back || st.pausePressed || st.interactPressed) return this.close();
    const before = this.menu.index;
    this.menu.update(st);
    if (this.menu.index !== before) this.refresh();
  }
}
void balance;
