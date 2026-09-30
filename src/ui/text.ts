import Phaser from 'phaser';
import { FONT_KEY, CELL_H } from '@/assets/pixelFont';

/** Pixel BitmapText helper. `scale` is an integer multiplier of the 8px glyph cell (1..6). */
export function pxText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  scale = 2,
  color = 0xffffff,
): Phaser.GameObjects.BitmapText {
  const t = scene.add.bitmapText(Math.round(x), Math.round(y), FONT_KEY, text, CELL_H * scale);
  t.setLetterSpacing(-1);
  t.setTint(color);
  return t;
}

export function hex(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}
