import type { WeaponId } from '@/core/types';

/** Per-frame, device-agnostic intent snapshot. Gameplay only ever reads this. */
export interface InputState {
  moveX: number;
  up: boolean;
  down: boolean;
  downPressed: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
  jumpReleased: boolean;
  dashPressed: boolean;
  attackPressed: boolean;
  attackHeld: boolean;
  attackReleased: boolean;
  weaponSelect: WeaponId | null;
  cycle: -1 | 0 | 1;
  summonPressed: boolean;
  interactPressed: boolean;
  interactHeld: boolean;
  pausePressed: boolean;
  /** Aim direction in radians, or null when no explicit aim (use facing). */
  aimAngle: number | null;
  aimSource: 'mouse' | 'stick' | 'touch' | 'none';
  /** Touch drag-aim strength 0..1 (Thunderclap distance). */
  aimDist: number;
  aimWorldX: number;
  aimWorldY: number;
  // menu navigation
  menuUp: boolean;
  menuDown: boolean;
  menuLeft: boolean;
  menuRight: boolean;
  confirm: boolean;
  back: boolean;
  anyPressed: boolean;
  anyHeld: boolean;
  device: 'kb' | 'pad' | 'touch';
  toolboxPressed: boolean;
  resetPressed: boolean;
}

export function emptyInput(): InputState {
  return {
    moveX: 0,
    up: false,
    down: false,
    downPressed: false,
    jumpPressed: false,
    jumpHeld: false,
    jumpReleased: false,
    dashPressed: false,
    attackPressed: false,
    attackHeld: false,
    attackReleased: false,
    weaponSelect: null,
    cycle: 0,
    summonPressed: false,
    interactPressed: false,
    interactHeld: false,
    pausePressed: false,
    aimAngle: null,
    aimSource: 'none',
    aimDist: 0,
    aimWorldX: 0,
    aimWorldY: 0,
    menuUp: false,
    menuDown: false,
    menuLeft: false,
    menuRight: false,
    confirm: false,
    back: false,
    anyPressed: false,
    anyHeld: false,
    device: 'kb',
    toolboxPressed: false,
    resetPressed: false,
  };
}
