import type { ActionId } from '@/core/types';

/** Keyboard/mouse bindings use Phaser key names, plus MOUSE_LEFT / MOUSE_RIGHT / WHEEL_UP / WHEEL_DOWN. */
export const DEFAULT_KEY_BINDINGS: Record<ActionId, string[]> = {
  left: ['A', 'LEFT'],
  right: ['D', 'RIGHT'],
  jump: ['SPACE', 'W', 'UP'],
  crouch: ['S', 'DOWN'],
  dash: ['SHIFT'],
  attack: ['MOUSE_LEFT', 'J'],
  weapon1: ['ONE'],
  weapon2: ['TWO'],
  weapon3: ['THREE'],
  cycleNext: ['Q', 'WHEEL_DOWN'],
  cyclePrev: ['WHEEL_UP'],
  summon: ['R'],
  interact: ['E'],
  pause: ['ESC', 'P'],
};

export const REBINDABLE_ACTIONS: ActionId[] = [
  'left',
  'right',
  'jump',
  'crouch',
  'dash',
  'attack',
  'weapon1',
  'weapon2',
  'weapon3',
  'cycleNext',
  'summon',
  'interact',
  'pause',
];

/** Standard-mapping (Xbox layout) gamepad button indices. */
export const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
} as const;

export const DEFAULT_PAD_BINDINGS: Partial<Record<ActionId, number[]>> = {
  jump: [PAD.A],
  dash: [PAD.B, PAD.RB],
  attack: [PAD.X, PAD.RT],
  weapon1: [PAD.DPAD_LEFT],
  weapon2: [PAD.DPAD_UP],
  weapon3: [PAD.DPAD_RIGHT],
  cycleNext: [PAD.LB],
  summon: [PAD.LT],
  interact: [PAD.Y],
  pause: [PAD.START],
};

export const DEBUG_KEY = 'F3';
