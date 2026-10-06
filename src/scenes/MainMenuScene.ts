import Phaser from 'phaser';
import { GAME_H, GAME_W } from '@/config/gameConfig';
import { PAL } from '@/config/palette';
import { STR } from '@/config/strings';
import { SaveManager } from '@/core/SaveManager';
import { AudioManager } from '@/audio/AudioManager';
import { InputManager } from '@/input/InputManager';
import { Parallax } from '@/fx/Parallax';
import { pxText } from '@/ui/text';
import { ButtonNav, PixelButton } from '@/ui/widgets';
import { Device } from '@/platform/Device';

export class MainMenuScene extends Phaser.Scene {
  private input2!: InputManager;
  private buttons: PixelButton[] = [];
  private nav!: ButtonNav;
  private bg!: Parallax;
  private t = 0;
  private embers: { x: number; y: number; vy: number; vx: number; a: number }[] = [];
  private emberG!: Phaser.GameObjects.Graphics;
  private locked = false;

  constructor() {
    super('MainMenu');
  }

  create(): void {
    this.locked = false;
    this.cameras.main.fadeIn(400, 0, 0, 0);
    this.bg = new Parallax(this);
    // ground strip
    this.add.tileSprite(0, 430, GAME_W, 16, 'tile_grass').setOrigin(0).setDepth(-10);
    this.add.tileSprite(0, 446, GAME_W, GAME_H - 446, 'tile_dirt').setOrigin(0).setDepth(-10);
    this.add.image(120, 432, 'ruinTower').setOrigin(0.5, 1).setDepth(-11).setTint(0xb090d0);
    this.add.sprite(820, 432, 'banner').setOrigin(0.5, 1).setDepth(-9).play('banner:loop');
    this.add.sprite(700, 432, 'torch').setOrigin(0.5, 1).setDepth(-9).play('torch:loop');
    this.add.image(560, 432, 'pine').setOrigin(0.5, 1).setDepth(-12).setTint(0x6a5a8a);
    const hero = this.add.sprite(300, 432, 'hero_sword').setOrigin(0.5, 1).setDepth(-5);
    hero.play('hero_sword:idle');
    const raider = this.add.sprite(760, 432, 'raider').setOrigin(0.5, 1).setDepth(-6).setFlipX(true);
    raider.play('raider:idle');
    this.emberG = this.add.graphics().setDepth(50);

    const shadow = pxText(this, GAME_W / 2 + 4, 74, STR.title, 9, PAL.scarfDark).setOrigin(0.5, 0);
    const title = pxText(this, GAME_W / 2, 70, STR.title, 9, PAL.cleanseGold).setOrigin(0.5, 0);
    this.tweens.add({ targets: [title, shadow], y: '-=4', yoyo: true, repeat: -1, duration: 1600, ease: 'Sine.inOut' });
    pxText(this, GAME_W / 2, 164, STR.subtitle.toUpperCase(), 2, PAL.statusCyan).setOrigin(0.5, 0);
    pxText(this, GAME_W / 2, 190, STR.tagline, 1, 0xd8d0e8).setOrigin(0.5, 0);

    const hasSave = SaveManager.hasProgress();
    this.buttons = [];
    const play = new PixelButton(this, GAME_W / 2, 262, 320, 76, STR.menu.play, () => this.start(false), { scale: 5, color: PAL.cleanseGold });
    this.buttons.push(play);
    let y = 330;
    if (hasSave) {
      this.buttons.push(new PixelButton(this, GAME_W / 2, y, 260, 44, STR.menu.continue, () => this.start(true)));
      y += 52;
    }
    this.buttons.push(new PixelButton(this, GAME_W / 2, y, 260, 44, STR.menu.settings, () => this.openSettings()));
    this.nav = new ButtonNav(this.buttons);
    const best = SaveManager.get().bestClear;
    if (best) {
      const s = Math.floor(best.timeMs / 1000);
      pxText(this, GAME_W - 12, 12, `${STR.victory.best}: ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}  ${best.deaths} deaths`, 1, PAL.cleanseGold).setOrigin(1, 0);
    }
    if (!Device.isTouch())
      pxText(this, GAME_W / 2, GAME_H - 26, 'Move A/D  Jump Space  Attack Click/J  Dash Shift  Weapons 1-3/Q  Summon R  Interact E', 1, 0xb8b0c8).setOrigin(0.5, 0).setDepth(1000);
    pxText(this, 8, GAME_H - 14, 'v1.1', 1, 0x6a6480).setDepth(1000);

    this.input2 = new InputManager(this);
    AudioManager.setMusic('menu');
    this.events.on(Phaser.Scenes.Events.RESUME, () => this.input2.flush());
    (window as unknown as { __BHEEM__?: unknown }).__BHEEM__ = { scene: 'MainMenu' };
  }

  private start(cont: boolean): void {
    if (this.locked) return;
    this.locked = true;
    AudioManager.unlock();
    if (Device.isTouch()) void Device.enterFullscreenLandscape();
    if (!cont) SaveManager.clearProgress();
    this.cameras.main.fadeOut(150, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('Game', { continue: cont });
    });
  }

  private openSettings(): void {
    this.scene.pause();
    this.scene.launch('Settings', { from: 'MainMenu' });
  }

  override update(_t: number, dt: number): void {
    this.t += dt;
    this.bg.update(this.t * 0.03, 0);
    this.input2.update();
    if (!this.locked) this.nav.update(this.input2.state);
    if (this.embers.length < 40 && Math.random() < 0.3)
      this.embers.push({ x: Math.random() * GAME_W, y: GAME_H + 4, vy: -20 - Math.random() * 40, vx: (Math.random() - 0.5) * 20, a: 1 });
    this.emberG.clear();
    for (const e of this.embers) {
      e.x += (e.vx * dt) / 1000;
      e.y += (e.vy * dt) / 1000;
      e.a -= dt / 6000;
      this.emberG.fillStyle(e.y % 3 < 1.5 ? PAL.ember : PAL.cleanseGold, Math.max(0, e.a)).fillRect(Math.round(e.x), Math.round(e.y), 2, 2);
    }
    this.embers = this.embers.filter((e) => e.a > 0 && e.y > -10);
  }
}
