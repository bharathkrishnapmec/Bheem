import Phaser from 'phaser';
import { SaveManager } from '@/core/SaveManager';
import { AudioManager } from '@/audio/AudioManager';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    SaveManager.load();
    AudioManager.setVolumes(SaveManager.settings);
    const unlock = () => AudioManager.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock);
    this.scene.start('Preload');
  }
}
