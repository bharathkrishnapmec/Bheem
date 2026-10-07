import type { ArenaId } from '@/level/levelSchema';
export type GameMode = 'story' | 'creative';

export interface Modifiers {
  godMode: boolean;
  infinitePrana: boolean;
  infiniteArrows: boolean;
  instantRally: boolean;
  noDashCooldown: boolean;
  /** Creative toolbox: pause geysers / crumbling / wind (lava and void still apply). */
  hazardsPaused: boolean;
}

export const storyModifiers = (): Modifiers => ({
  godMode: false,
  infinitePrana: false,
  infiniteArrows: false,
  instantRally: false,
  noDashCooldown: false,
  hazardsPaused: false,
});

export interface CreativeStart {
  kind: 'sandbox' | 'boss';
  arena?: ArenaId;
  bossId?: string;
  phase?: 1 | 2 | 3;
  allies?: 'none' | 'auto';
  skipIntro?: boolean;
}

/** Run-wide mode switch. Story mode always runs with every modifier off. */
export const GameContext = {
  mode: 'story' as GameMode,
  modifiers: storyModifiers(),
  slowMo: 1 as 1 | 0.5 | 0.25,
  start: null as CreativeStart | null,
  enterStory(): void {
    this.mode = 'story';
    this.modifiers = storyModifiers();
    this.slowMo = 1;
    this.start = null;
  },
  enterCreative(start: CreativeStart): void {
    if (this.mode !== 'creative') {
      this.modifiers = storyModifiers();
      this.slowMo = 1;
    }
    this.mode = 'creative';
    this.start = start;
  },
  get creative(): boolean {
    return this.mode === 'creative';
  },
};
