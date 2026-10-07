import { balance } from '@/config/balance';
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
  phase?: 1 | 2 | 3 | 4;
  allies?: 'none' | 'auto';
  skipIntro?: boolean;
}

export type BossPreset = 'classic' | 'normal' | 'legendary';
/** Creative-only boss strength (Boss Buff v3 §B2.4). Story and Trials always use Normal. */
export interface BossStrength {
  preset: BossPreset;
  hpMul: number;
  dmgMul: number;
}
export const normalStrength = (): BossStrength => ({ preset: 'normal', hpMul: 1, dmgMul: 1 });

/** Run-wide mode switch. Story mode always runs with every modifier off. */
export const GameContext = {
  mode: 'story' as GameMode,
  modifiers: storyModifiers(),
  slowMo: 1 as 1 | 0.5 | 0.25,
  start: null as CreativeStart | null,
  bossStrength: normalStrength(),
  enterStory(): void {
    this.mode = 'story';
    this.modifiers = storyModifiers();
    this.slowMo = 1;
    this.start = null;
    this.bossStrength = normalStrength();
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

/** Multipliers bosses actually use: Normal outside Creative, preset × sliders inside it. */
export function effectiveBossStrength(): { hpMul: number; dmgMul: number; enrageShiftMs: number; normal: boolean } {
  const s = GameContext.creative ? GameContext.bossStrength : normalStrength();
  const p = balance.bosses.presets[s.preset];
  return { hpMul: p.hpMul * s.hpMul, dmgMul: p.dmgMul * s.dmgMul, enrageShiftMs: p.enrageShiftMs, normal: s.preset === 'normal' && s.hpMul === 1 && s.dmgMul === 1 };
}
