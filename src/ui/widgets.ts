import Phaser from 'phaser';
import { PAL } from '@/config/palette';
import { AudioManager } from '@/audio/AudioManager';
import type { InputState } from '@/input/InputState';
import { pxText } from './text';

/** UI_DESIGN pixel panel: dark fill, 2px bevelled edge, notched corners, optional gold trim. */
export function drawPanel(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { fill?: number; edge?: number; trim?: number; alpha?: number } = {},
): void {
  const fill = opts.fill ?? PAL.panel;
  const edge = opts.edge ?? PAL.panelEdge;
  const a = opts.alpha ?? 0.94;
  g.fillStyle(PAL.outline, a);
  g.fillRect(x + 2, y, w - 4, h);
  g.fillRect(x, y + 2, w, h - 4);
  g.fillStyle(edge, a);
  g.fillRect(x + 4, y + 2, w - 8, h - 4);
  g.fillRect(x + 2, y + 4, w - 4, h - 8);
  g.fillStyle(fill, a);
  g.fillRect(x + 4, y + 4, w - 8, h - 8);
  g.fillStyle(PAL.panelLight, a);
  g.fillRect(x + 4, y + 4, w - 8, 2);
  if (opts.trim !== undefined) {
    g.fillStyle(opts.trim, 1);
    g.fillRect(x + 8, y + 2, 12, 2);
    g.fillRect(x + w - 20, y + 2, 12, 2);
    g.fillRect(x + 8, y + h - 4, 12, 2);
    g.fillRect(x + w - 20, y + h - 4, 12, 2);
  }
}

export interface MenuItem {
  label: () => string;
  value?: () => string;
  onConfirm?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
  enabled?: () => boolean;
}

/** Vertical menu navigable with keyboard, gamepad (via InputState) and mouse. */
export class MenuList {
  index = 0;
  readonly container: Phaser.GameObjects.Container;
  private rows: { label: Phaser.GameObjects.BitmapText; value: Phaser.GameObjects.BitmapText | null; zone: Phaser.GameObjects.Zone }[] = [];
  private cursor: Phaser.GameObjects.BitmapText;
  private cursorR: Phaser.GameObjects.BitmapText;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private items: MenuItem[],
    private opts: { width: number; spacing?: number; scale?: number; align?: 'center' | 'left' } = { width: 300 },
  ) {
    this.container = scene.add.container(x, y);
    const sp = opts.spacing ?? 34;
    const sc = opts.scale ?? 2;
    items.forEach((it, i) => {
      const label = pxText(scene, 0, i * sp, it.label(), sc);
      const value = it.value ? pxText(scene, opts.width / 2, i * sp, it.value(), sc, PAL.statusCyan).setOrigin(1, 0) : null;
      if (opts.align !== 'left' && !value) label.setOrigin(0.5, 0);
      else label.setX(-opts.width / 2);
      const zone = scene.add.zone(0, i * sp + (sc * 10) / 2, opts.width + 40, sp - 4).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => this.select(i));
      zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
        this.select(i);
        const lx = p.x - this.container.x;
        if (it.onRight && !it.onConfirm) {
          if (lx < 0 && it.onLeft) it.onLeft();
          else it.onRight();
          AudioManager.play('uiMove');
          this.refresh();
        } else this.confirm();
      });
      this.container.add([label, zone]);
      if (value) this.container.add(value);
      this.rows.push({ label, value, zone });
    });
    this.cursor = pxText(scene, 0, 0, '>', sc, PAL.cleanseGold);
    this.cursorR = pxText(scene, 0, 0, '<', sc, PAL.cleanseGold);
    this.container.add([this.cursor, this.cursorR]);
    this.index = items.findIndex((it) => it.enabled?.() !== false);
    if (this.index < 0) this.index = 0;
    this.refresh();
  }

  private select(i: number): void {
    if (i === this.index || this.items[i]?.enabled?.() === false) return;
    this.index = i;
    AudioManager.play('uiMove');
    this.refresh();
  }

  private move(d: number): void {
    const n = this.items.length;
    for (let k = 1; k <= n; k++) {
      const i = (this.index + d * k + n * 2) % n;
      if (this.items[i]!.enabled?.() !== false) {
        this.index = i;
        break;
      }
    }
    AudioManager.play('uiMove');
    this.refresh();
  }

  private confirm(): void {
    const it = this.items[this.index];
    if (!it || it.enabled?.() === false) return;
    if (it.onConfirm) {
      AudioManager.play('uiConfirm');
      it.onConfirm();
    } else if (it.onRight) {
      it.onRight();
      AudioManager.play('uiMove');
    }
    if (this.container.active) this.refresh();
  }

  update(input: InputState): void {
    if (input.menuUp) this.move(-1);
    if (input.menuDown) this.move(1);
    const it = this.items[this.index];
    if (input.menuLeft && it?.onLeft) {
      it.onLeft();
      AudioManager.play('uiMove');
      this.refresh();
    }
    if (input.menuRight && it?.onRight) {
      it.onRight();
      AudioManager.play('uiMove');
      this.refresh();
    }
    if (input.confirm) this.confirm();
  }

  refresh(): void {
    const sp = this.opts.spacing ?? 34;
    this.rows.forEach((r, i) => {
      const it = this.items[i]!;
      const en = it.enabled?.() !== false;
      r.label.setText(it.label());
      r.value?.setText(it.value!());
      const sel = i === this.index;
      r.label.setTint(!en ? 0x6a6480 : sel ? PAL.cleanseGold : 0xe8e0f0);
      r.value?.setTint(sel ? 0xffffff : PAL.statusCyan);
      if (sel) {
        const lb = r.label.getTextBounds().local;
        const left = r.label.originX === 0.5 ? -lb.width / 2 : -this.opts.width / 2;
        const right = r.value ? this.opts.width / 2 : lb.width / 2;
        this.cursor.setPosition(left - 22, i * sp);
        this.cursorR.setPosition(right + 8, i * sp);
      }
    });
  }

  destroy(): void {
    this.container.destroy();
  }
}

export function vol(v: number): string {
  const n = Math.round(v * 10);
  return '[' + '='.repeat(n) + '-'.repeat(10 - n) + ']';
}

/** Large tappable pixel button (touch-friendly). Hover/focus highlight, fires on pointerup inside. */
export class PixelButton {
  readonly container: Phaser.GameObjects.Container;
  private g: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.BitmapText;
  focused = false;
  private pressed = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly w: number,
    readonly h: number,
    text: string,
    private onClick: () => void,
    private opts: { scale?: number; color?: number; trim?: number; fill?: number } = {},
  ) {
    this.container = scene.add.container(x, y);
    this.g = scene.add.graphics();
    this.label = pxText(scene, 0, 0, text, opts.scale ?? 2, opts.color ?? 0xe8e0f0).setOrigin(0.5);
    const zone = scene.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => this.setFocus(true));
    zone.on('pointerout', () => {
      this.pressed = false;
      this.draw();
    });
    zone.on('pointerdown', () => {
      this.pressed = true;
      this.draw();
    });
    zone.on('pointerup', () => {
      if (!this.pressed) return;
      this.pressed = false;
      this.draw();
      this.fire();
    });
    this.container.add([this.g, this.label, zone]);
    this.draw();
  }

  fire(): void {
    AudioManager.play('uiConfirm');
    this.onClick();
  }

  setText(t: string): this {
    this.label.setText(t);
    return this;
  }

  setFocus(on: boolean): void {
    if (this.focused === on) return;
    this.focused = on;
    this.draw();
  }

  private draw(): void {
    const g = this.g;
    g.clear();
    const y = this.pressed ? 2 : 0;
    drawPanel(g, -this.w / 2, -this.h / 2 + y, this.w, this.h, {
      fill: this.focused ? PAL.panelLight : (this.opts.fill ?? PAL.panel),
      edge: this.focused ? PAL.cleanseGold : PAL.panelEdge,
      trim: this.opts.trim ?? PAL.cleanseGold,
      alpha: 0.95,
    });
    this.label.setY(y).setTint(this.focused ? PAL.cleanseGold : (this.opts.color ?? 0xe8e0f0));
  }

  destroy(): void {
    this.container.destroy();
  }
}

/** Keyboard/gamepad focus ring over a set of PixelButtons (vertical or grid by index order). */
export class ButtonNav {
  index = 0;
  constructor(
    private buttons: PixelButton[],
    private cols = 1,
  ) {
    this.buttons.forEach((b, i) =>
      b.container.list.forEach((o) => {
        if (o instanceof Phaser.GameObjects.Zone) o.on('pointerover', () => this.focus(i, false));
      }),
    );
    this.focus(0, false);
  }

  focus(i: number, sfx = true): void {
    if (!this.buttons.length) return;
    this.index = (i + this.buttons.length) % this.buttons.length;
    this.buttons.forEach((b, k) => b.setFocus(k === this.index));
    if (sfx) AudioManager.play('uiMove');
  }

  update(input: InputState): void {
    if (input.menuUp) this.focus(this.index - this.cols);
    if (input.menuDown) this.focus(this.index + this.cols);
    if (this.cols > 1 && input.menuLeft) this.focus(this.index - 1);
    if (this.cols > 1 && input.menuRight) this.focus(this.index + 1);
    if (input.confirm) this.buttons[this.index]?.fire();
  }
}
