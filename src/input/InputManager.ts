import Phaser from 'phaser';
import { balance } from '@/config/balance';
import { DEFAULT_PAD_BINDINGS, PAD } from '@/config/controls';
import { SaveManager } from '@/core/SaveManager';
import type { ActionId } from '@/core/types';
import { emptyInput, type InputState } from './InputState';

type Held = Record<ActionId, boolean>;
const ACTIONS: ActionId[] = ['left', 'right', 'jump', 'crouch', 'dash', 'attack', 'weapon1', 'weapon2', 'weapon3', 'cycleNext', 'cyclePrev', 'summon', 'interact', 'pause'];

/**
 * Reads keyboard, mouse and gamepad and produces an InputState once per frame.
 * Bindings come from SaveManager settings (rebindable). One instance per scene.
 */
export class InputManager {
  state: InputState = emptyInput();
  private prev: Held = Object.fromEntries(ACTIONS.map((a) => [a, false])) as Held;
  private keys = new Map<string, Phaser.Input.Keyboard.Key>();
  private wheel = 0;
  private mouseDown = false;
  private mouseRight = false;
  private mouseMoved = false;
  private prevMenu = { up: false, down: false, left: false, right: false, confirm: false, back: false, any: false };
  private anyKeyDown = false;
  /** Keys pressed since the last poll, so taps shorter than a frame still register. */
  private latched = new Set<string>();
  private disposed = false;
  enabled = true;
  /** Optional world-space origin used to compute mouse aim angle (the hero). */
  aimOrigin: { x: number; y: number } | null = null;

  constructor(private scene: Phaser.Scene) {
    this.rebuildKeys();
    const input = scene.input;
    input.mouse?.disableContextMenu();
    input.on('pointerdown', this.onDown, this);
    input.on('pointerup', this.onUp, this);
    input.on('pointermove', this.onMove, this);
    input.on('wheel', this.onWheel, this);
    input.keyboard?.on('keydown', this.onAnyKey, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (p.rightButtonDown()) this.mouseRight = true;
    else this.mouseDown = true;
    this.state.device = 'kb';
  }
  private onUp(p: Phaser.Input.Pointer): void {
    if (p.rightButtonReleased()) this.mouseRight = false;
    else this.mouseDown = false;
  }
  private onMove(): void {
    this.mouseMoved = true;
  }
  private onWheel(_p: unknown, _o: unknown, _dx: number, dy: number): void {
    this.wheel = dy > 0 ? 1 : -1;
  }
  private onAnyKey(ev?: KeyboardEvent): void {
    this.anyKeyDown = true;
    if (ev) for (const [n, k] of this.keys) if (k.keyCode === ev.keyCode) this.latched.add(n);
    this.state.device = 'kb';
  }

  rebuildKeys(): void {
    const kb = this.scene.input.keyboard;
    if (!kb) return;
    const b = SaveManager.settings.bindings;
    const names = new Set<string>(['ENTER', 'ESC', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'W', 'A', 'S', 'D', 'SPACE', 'BACKSPACE', 'F3']);
    for (const a of ACTIONS) for (const n of b[a] ?? []) if (!n.startsWith('MOUSE') && !n.startsWith('WHEEL')) names.add(n);
    for (const n of names) {
      if (this.keys.has(n)) continue;
      const code = Phaser.Input.Keyboard.KeyCodes[n as keyof typeof Phaser.Input.Keyboard.KeyCodes];
      if (code === undefined) continue;
      this.keys.set(n, kb.addKey(code, true, false));
    }
  }

  key(name: string): boolean {
    return (this.keys.get(name)?.isDown ?? false) || this.latched.has(name);
  }

  keyJustDown(name: string): boolean {
    const k = this.keys.get(name);
    return k ? Phaser.Input.Keyboard.JustDown(k) : false;
  }

  private pad(): Phaser.Input.Gamepad.Gamepad | null {
    const gp = this.scene.input.gamepad;
    if (!gp || gp.total === 0) return null;
    return gp.getPad(0) ?? gp.pad1 ?? null;
  }

  private padBtn(p: Phaser.Input.Gamepad.Gamepad | null, i: number): boolean {
    return !!p && !!p.buttons[i] && p.buttons[i]!.pressed;
  }

  private actionHeld(a: ActionId, pad: Phaser.Input.Gamepad.Gamepad | null, wheelDir: number): boolean {
    const binds = SaveManager.settings.bindings[a] ?? [];
    for (const n of binds) {
      if (n === 'MOUSE_LEFT' && this.mouseDown) return true;
      if (n === 'MOUSE_RIGHT' && this.mouseRight) return true;
      if (n === 'WHEEL_DOWN' && wheelDir > 0) return true;
      if (n === 'WHEEL_UP' && wheelDir < 0) return true;
      if (this.key(n)) return true;
    }
    for (const i of DEFAULT_PAD_BINDINGS[a] ?? []) if (this.padBtn(pad, i)) return true;
    return false;
  }

  /** Call once per frame (before gameplay reads `state`). */
  update(): InputState {
    const s = this.state;
    if (this.disposed) return s;
    const pad = this.pad();
    const wheelDir = this.wheel;
    this.wheel = 0;
    const held = {} as Held;
    for (const a of ACTIONS) held[a] = this.enabled && this.actionHeld(a, pad, wheelDir);
    const pressed = (a: ActionId) => held[a] && !this.prev[a];
    const released = (a: ActionId) => !held[a] && this.prev[a];

    let padX = 0;
    let padY = 0;
    let aimX = 0;
    let aimY = 0;
    if (pad) {
      const dz = balance.input.stickDeadzone;
      const ax = pad.axes[0]?.getValue() ?? 0;
      const ay = pad.axes[1]?.getValue() ?? 0;
      padX = Math.abs(ax) > dz ? ax : 0;
      padY = Math.abs(ay) > dz ? ay : 0;
      const rx = pad.axes[2]?.getValue() ?? 0;
      const ry = pad.axes[3]?.getValue() ?? 0;
      if (Math.hypot(rx, ry) > dz * 1.5) {
        aimX = rx;
        aimY = ry;
      }
      if (padX || padY || pad.buttons.some((b) => b.pressed)) s.device = 'pad';
    }
    let mx = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    if (this.padBtn(pad, PAD.DPAD_LEFT) && !DEFAULT_PAD_BINDINGS.weapon1?.includes(PAD.DPAD_LEFT)) mx = -1;
    if (mx === 0 && padX) mx = padX;
    s.moveX = this.enabled ? mx : 0;
    const upHeld = this.enabled && (this.key('W') || this.key('UP') || padY < -0.5);
    const downHeld = this.enabled && (held.crouch || padY > 0.5);
    s.downPressed = downHeld && !s.down;
    s.up = upHeld;
    s.down = downHeld;
    s.jumpPressed = pressed('jump');
    s.jumpHeld = held.jump;
    s.jumpReleased = released('jump');
    s.dashPressed = pressed('dash');
    s.attackPressed = pressed('attack');
    s.attackHeld = held.attack;
    s.attackReleased = released('attack');
    s.weaponSelect = pressed('weapon1') ? 'sword' : pressed('weapon2') ? 'bow' : pressed('weapon3') ? 'staff' : null;
    s.cycle = pressed('cycleNext') ? 1 : pressed('cyclePrev') ? -1 : 0;
    s.summonPressed = pressed('summon');
    s.interactPressed = pressed('interact');
    s.interactHeld = held.interact;
    s.pausePressed = pressed('pause');

    // Aim
    const p = this.scene.input.activePointer;
    const cam = this.scene.cameras.main;
    if (aimX || aimY) {
      s.aimAngle = Math.atan2(aimY, aimX);
      s.aimSource = 'stick';
    } else if (s.device === 'kb' && this.aimOrigin && (this.mouseMoved || this.mouseDown)) {
      const wp = cam.getWorldPoint(p.x, p.y);
      s.aimWorldX = wp.x;
      s.aimWorldY = wp.y;
      s.aimAngle = Math.atan2(wp.y - this.aimOrigin.y, wp.x - this.aimOrigin.x);
      s.aimSource = 'mouse';
    } else {
      s.aimAngle = null;
      s.aimSource = 'none';
    }

    // Menus
    const m = {
      up: this.key('UP') || this.key('W') || this.padBtn(pad, PAD.DPAD_UP) || padY < -0.6,
      down: this.key('DOWN') || this.key('S') || this.padBtn(pad, PAD.DPAD_DOWN) || padY > 0.6,
      left: this.key('LEFT') || this.key('A') || this.padBtn(pad, PAD.DPAD_LEFT) || padX < -0.6,
      right: this.key('RIGHT') || this.key('D') || this.padBtn(pad, PAD.DPAD_RIGHT) || padX > 0.6,
      confirm: this.key('ENTER') || this.key('SPACE') || this.padBtn(pad, PAD.A),
      back: this.key('ESC') || this.key('BACKSPACE') || this.padBtn(pad, PAD.B) || this.padBtn(pad, PAD.START),
      any: this.anyKeyDown || this.mouseDown || (!!pad && pad.buttons.some((b) => b.pressed)),
    };
    s.menuUp = m.up && !this.prevMenu.up;
    s.menuDown = m.down && !this.prevMenu.down;
    s.menuLeft = m.left && !this.prevMenu.left;
    s.menuRight = m.right && !this.prevMenu.right;
    s.confirm = m.confirm && !this.prevMenu.confirm;
    s.back = m.back && !this.prevMenu.back;
    s.anyPressed = m.any && !this.prevMenu.any;
    s.anyHeld = m.any || ACTIONS.some((a) => held[a]);
    this.prevMenu = m;
    this.anyKeyDown = false;
    this.latched.clear();
    this.mouseMoved = false;
    this.prev = held;
    return s;
  }

  /** Clear edge state (e.g. after unpausing) so held buttons don't retrigger. */
  flush(): void {
    this.latched.clear();
    const pad = this.pad();
    for (const a of ACTIONS) this.prev[a] = this.actionHeld(a, pad, 0);
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    const input = this.scene.input;
    input.off('pointerdown', this.onDown, this);
    input.off('pointerup', this.onUp, this);
    input.off('pointermove', this.onMove, this);
    input.off('wheel', this.onWheel, this);
    input.keyboard?.off('keydown', this.onAnyKey, this);
  }
}
