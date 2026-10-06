import Phaser from 'phaser';
import { GAME_H, GAME_W } from '@/config/gameConfig';
import { PAL } from '@/config/palette';
import { STR } from '@/config/strings';
import { REBINDABLE_ACTIONS, DEFAULT_KEY_BINDINGS } from '@/config/controls';
import { SaveManager } from '@/core/SaveManager';
import { GameEvents } from '@/core/GameEvents';
import type { ActionId } from '@/core/types';
import { AudioManager } from '@/audio/AudioManager';
import { InputManager } from '@/input/InputManager';
import { pxText } from '@/ui/text';
import { MenuList, drawPanel, vol, type MenuItem } from '@/ui/widgets';

function cycle<T>(list: readonly T[], cur: T, d: number): T {
  const i = list.indexOf(cur);
  return list[(i + d + list.length) % list.length]!;
}
const step = (v: number, d: number) => Math.max(0, Math.min(1, Math.round((v + d) * 10) / 10));
const KEY_LABEL: Record<string, string> = { MOUSE_LEFT: 'LMB', MOUSE_RIGHT: 'RMB', WHEEL_UP: 'Wheel Up', WHEEL_DOWN: 'Wheel Dn', ONE: '1', TWO: '2', THREE: '3' };
export const keyLabel = (k: string | undefined): string => (k ? (KEY_LABEL[k] ?? k) : '-');

export class SettingsScene extends Phaser.Scene {
  private from = 'MainMenu';
  private input2!: InputManager;
  private menu: MenuList | null = null;
  private page: 'main' | 'bind' | 'touch' = 'main';
  private waiting: ActionId | null = null;
  private hint!: Phaser.GameObjects.BitmapText;
  private title!: Phaser.GameObjects.BitmapText;

  constructor() {
    super('Settings');
  }

  create(data: { from?: string }): void {
    this.from = data.from ?? 'MainMenu';
    this.page = 'main';
    this.waiting = null;
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x05040a, 0.75).setOrigin(0);
    const g = this.add.graphics();
    drawPanel(g, GAME_W / 2 - 260, 40, 520, 460, { trim: PAL.gold });
    this.title = pxText(this, GAME_W / 2, 58, STR.settings.title, 3, PAL.cleanseGold).setOrigin(0.5, 0);
    this.hint = pxText(this, GAME_W / 2, 470, '', 1, 0xb8b0c8).setOrigin(0.5, 0);
    this.input2 = new InputManager(this);
    this.input.keyboard?.on('keydown', this.onKey, this);
    this.buildMain();
  }

  private patch(p: Parameters<typeof SaveManager.updateSettings>[0]): void {
    SaveManager.updateSettings(p);
    AudioManager.setVolumes(SaveManager.settings);
    GameEvents.emit('settings:changed', {});
  }

  private buildMain(): void {
    this.menu?.destroy();
    this.page = 'main';
    this.title.setText(STR.settings.title);
    this.hint.setText('Arrows/D-pad adjust  -  Enter select  -  Esc back');
    const s = () => SaveManager.settings;
    const slider = (label: string, key: 'master' | 'music' | 'sfx' | 'shake'): MenuItem => ({
      label: () => label,
      value: () => vol(s()[key]),
      onLeft: () => this.patch({ [key]: step(s()[key], -0.1) }),
      onRight: () => this.patch({ [key]: step(s()[key], 0.1) }),
    });
    const toggle = (label: string, key: 'reducedEffects' | 'damageNumbers'): MenuItem => ({
      label: () => label,
      value: () => (s()[key] ? STR.settings.on : STR.settings.off),
      onLeft: () => this.patch({ [key]: !s()[key] }),
      onRight: () => this.patch({ [key]: !s()[key] }),
    });
    this.menu = new MenuList(
      this,
      GAME_W / 2,
      112,
      [
        slider(STR.settings.master, 'master'),
        slider(STR.settings.music, 'music'),
        slider(STR.settings.sfx, 'sfx'),
        slider(STR.settings.shake, 'shake'),
        toggle(STR.settings.reduced, 'reducedEffects'),
        toggle(STR.settings.damageNumbers, 'damageNumbers'),
        {
          label: () => STR.settings.fullscreen,
          value: () => (this.scale.isFullscreen ? STR.settings.on : STR.settings.off),
          onRight: () => this.toggleFullscreen(),
          onLeft: () => this.toggleFullscreen(),
        },
        {
          label: () => STR.settings.quality,
          value: () => STR.settings.qualityNames[s().quality] ?? s().quality,
          onLeft: () => this.patch({ quality: cycle(['auto', 'high', 'low'] as const, s().quality, -1) }),
          onRight: () => this.patch({ quality: cycle(['auto', 'high', 'low'] as const, s().quality, 1) }),
        },
        { label: () => STR.settings.touch, onConfirm: () => this.buildTouch() },
        { label: () => STR.settings.bindings, onConfirm: () => this.buildBind() },
        { label: () => STR.settings.back, onConfirm: () => this.close() },
      ],
      { width: 440, spacing: 31, scale: 2, align: 'left' },
    );
  }

  private buildTouch(): void {
    this.menu?.destroy();
    this.page = 'touch';
    this.title.setText(STR.settings.touch);
    this.hint.setText('Tap or use arrows to change  -  Esc back');
    const s = () => SaveManager.settings;
    const toggle = (label: string, key: 'touchAlways' | 'leftHanded' | 'haptics' | 'toolboxPauses'): MenuItem => ({
      label: () => label,
      value: () => (s()[key] ? STR.settings.on : STR.settings.off),
      onLeft: () => this.patch({ [key]: !s()[key] }),
      onRight: () => this.patch({ [key]: !s()[key] }),
    });
    const op = (d: number) => this.patch({ touchOpacity: Math.max(0.3, Math.min(1, Math.round((s().touchOpacity + d) * 20) / 20)) });
    this.menu = new MenuList(
      this,
      GAME_W / 2,
      112,
      [
        toggle(STR.settings.touchAlways, 'touchAlways'),
        {
          label: () => STR.settings.touchSize,
          value: () => s().touchSize,
          onLeft: () => this.patch({ touchSize: cycle(['S', 'M', 'L'] as const, s().touchSize, -1) }),
          onRight: () => this.patch({ touchSize: cycle(['S', 'M', 'L'] as const, s().touchSize, 1) }),
        },
        { label: () => STR.settings.touchOpacity, value: () => `${Math.round(s().touchOpacity * 100)}%`, onLeft: () => op(-0.05), onRight: () => op(0.05) },
        toggle(STR.settings.leftHanded, 'leftHanded'),
        toggle(STR.settings.haptics, 'haptics'),
        toggle(STR.settings.toolboxPauses, 'toolboxPauses'),
        { label: () => STR.settings.back, onConfirm: () => this.buildMain() },
      ],
      { width: 440, spacing: 40, scale: 2, align: 'left' },
    );
  }

  private toggleFullscreen(): void {
    try {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen();
    } catch (e) {
      console.warn('[Settings] fullscreen unavailable', e);
    }
  }

  private buildBind(): void {
    this.menu?.destroy();
    this.page = 'bind';
    this.title.setText(STR.settings.bindings);
    this.hint.setText('Enter to rebind (primary key)  -  Esc back');
    const items: MenuItem[] = REBINDABLE_ACTIONS.map((a) => ({
      label: () => STR.actions[a],
      value: () => (this.waiting === a ? '...' : (SaveManager.settings.bindings[a] ?? []).slice(0, 2).map(keyLabel).join(' / ')),
      onConfirm: () => {
        this.waiting = a;
        this.hint.setText(STR.settings.pressKey);
      },
    }));
    items.push({
      label: () => STR.settings.reset,
      onConfirm: () => {
        const b = {} as Record<ActionId, string[]>;
        for (const k of Object.keys(DEFAULT_KEY_BINDINGS) as ActionId[]) b[k] = [...DEFAULT_KEY_BINDINGS[k]];
        this.patch({ bindings: b });
        this.input2.rebuildKeys();
      },
    });
    items.push({ label: () => STR.settings.back, onConfirm: () => this.buildMain() });
    this.menu = new MenuList(this, GAME_W / 2, 100, items, { width: 440, spacing: 24, scale: 2, align: 'left' });
  }

  private onKey(ev: KeyboardEvent): void {
    if (!this.waiting) return;
    const a = this.waiting;
    const name = Object.entries(Phaser.Input.Keyboard.KeyCodes).find(([, c]) => c === ev.keyCode)?.[0];
    this.time.delayedCall(0, () => {
      this.waiting = null;
      if (ev.keyCode !== Phaser.Input.Keyboard.KeyCodes.ESC && name) {
        const b = { ...SaveManager.settings.bindings };
        // remove from other actions to avoid conflicts
        for (const k of Object.keys(b) as ActionId[]) if (k !== a) b[k] = b[k].filter((x) => x !== name);
        const rest = (b[a] ?? []).filter((x) => x !== name);
        b[a] = [name, ...rest.slice(0, 1)];
        this.patch({ bindings: b });
        this.input2.rebuildKeys();
        AudioManager.play('uiConfirm');
      } else AudioManager.play('uiBack');
      this.hint.setText('Enter to rebind (primary key)  -  Esc back');
      this.input2.flush();
      this.menu?.refresh();
    });
    this.input2.update();
  }

  private close(): void {
    AudioManager.play('uiBack');
    this.input.keyboard?.off('keydown', this.onKey, this);
    this.scene.stop();
    this.scene.resume(this.from);
  }

  override update(): void {
    if (this.waiting) return;
    const s = this.input2.update();
    if (s.back) {
      if (this.page === 'bind' || this.page === 'touch') {
        AudioManager.play('uiBack');
        this.buildMain();
      } else this.close();
      return;
    }
    this.menu?.update(s);
  }
}
