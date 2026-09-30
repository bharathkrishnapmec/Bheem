import Phaser from 'phaser';
import { GAME_H, GAME_W } from '@/config/gameConfig';
import { PAL } from '@/config/palette';
import { STR } from '@/config/strings';
import { EXTERNAL_ASSETS } from '@/assets/manifest';
import { assetSteps } from '@/assets/ProceduralAssets';
import { pxText } from '@/ui/text';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    for (const [key, a] of Object.entries(EXTERNAL_ASSETS)) {
      if (a.type === 'image') this.load.image(key, a.url);
      else this.load.spritesheet(key, a.url, { frameWidth: a.frameWidth ?? 32, frameHeight: a.frameHeight ?? 32 });
    }
    this.load.on('loaderror', (f: Phaser.Loader.File) => console.warn('[Preload] external asset failed, using procedural:', f.key));
  }

  create(): void {
    const steps = assetSteps(this);
    // font must exist before any text
    steps.shift()!.run();
    const g = this.add.graphics();
    pxText(this, GAME_W / 2, GAME_H / 2 - 50, STR.title, 5, PAL.cleanseGold).setOrigin(0.5);
    const label = pxText(this, GAME_W / 2, GAME_H / 2 + 36, STR.loading, 2, PAL.statusCyan).setOrigin(0.5);
    let i = 0;
    const total = steps.length;
    const draw = () => {
      g.clear();
      g.fillStyle(PAL.panelEdge, 1).fillRect(GAME_W / 2 - 162, GAME_H / 2 + 6, 324, 16);
      g.fillStyle(PAL.outline, 1).fillRect(GAME_W / 2 - 160, GAME_H / 2 + 8, 320, 12);
      g.fillStyle(PAL.cleanseGold, 1).fillRect(GAME_W / 2 - 158, GAME_H / 2 + 10, (316 * i) / total, 8);
    };
    draw();
    const tick = () => {
      const s = steps[i];
      if (!s) {
        label.setText('Ready');
        this.time.delayedCall(80, () => this.scene.start('MainMenu'));
        return;
      }
      try {
        s.run();
      } catch (e) {
        console.error(`[Preload] asset step "${s.label}" failed`, e);
      }
      i++;
      draw();
      this.time.delayedCall(1, tick);
    };
    this.time.delayedCall(1, tick);
  }
}
