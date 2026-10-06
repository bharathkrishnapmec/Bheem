import Phaser from 'phaser';
import { BG_COLOR, GAME_H, GAME_W } from '@/config/gameConfig';
import { balance } from '@/config/balance';
import { STR } from '@/config/strings';
import { BootScene } from '@/scenes/BootScene';
import { PreloadScene } from '@/scenes/PreloadScene';
import { MainMenuScene } from '@/scenes/MainMenuScene';
import { SettingsScene } from '@/scenes/SettingsScene';
import { GameScene } from '@/scenes/GameScene';
import { UIScene } from '@/scenes/UIScene';
import { PauseScene, GameOverScene, VictoryScene, ShrineScene } from '@/scenes/OverlayScenes';
import { BossSelectScene, CreativeMenuScene, CreativeResultScene, ToolboxScene } from '@/modes/creative/scenes';
import { installLifecycle } from '@/platform/lifecycle';
import { TouchControls } from '@/ui/touch/TouchControls';

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

function fatal(msg: string): void {
  const el = document.getElementById('fatal');
  if (el) {
    el.style.display = 'block';
    el.textContent = msg;
  }
}

if (!hasWebGL()) fatal(STR.errors.webgl);
else {
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: 'game-root',
    width: GAME_W,
    height: GAME_H,
    backgroundColor: BG_COLOR,
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    disableContextMenu: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { gamepad: true, keyboard: true, mouse: true },
    fps: { target: 60, smoothStep: true },
    physics: {
      default: 'arcade',
      arcade: { gravity: { x: 0, y: balance.player.gravity }, fps: 60, tileBias: 24, debug: false },
    },
    scene: [BootScene, PreloadScene, MainMenuScene, SettingsScene, GameScene, UIScene, PauseScene, GameOverScene, VictoryScene, ShrineScene, CreativeMenuScene, BossSelectScene, ToolboxScene, CreativeResultScene],
  });
  (window as unknown as { __GAME__: Phaser.Game }).__GAME__ = game;
  installLifecycle();
  TouchControls.mount();
}
