/**
 * Replaceable asset manifest. Every texture key the game uses is listed here. By default all are
 * generated procedurally at boot (ProceduralAssets). To swap in final art, add an `external` entry:
 * the Preload scene loads it and the procedural generator skips that key. Animation frame counts of
 * external spritesheets must match the procedural sheet (see docs/CREDITS.md).
 */
export interface ExternalAsset {
  type: 'image' | 'spritesheet';
  url: string;
  frameWidth?: number;
  frameHeight?: number;
}

export const EXTERNAL_ASSETS: Record<string, ExternalAsset> = {
  // Example: hero_sword: { type: 'spritesheet', url: 'assets/hero_sword.png', frameWidth: 60, frameHeight: 64 },
};

export const CHARACTER_KEYS = [
  'hero_sword',
  'hero_bow',
  'hero_staff',
  'raider',
  'boneArcher',
  'mireHexer',
  'skyCaller',
  'brute',
  'imp',
  'boss',
  'garjana',
  'ally_spearman',
  'ally_archer',
  'ally_shieldbearer',
  'ally_captain',
  'villager0',
  'villager1',
  'villager2',
] as const;
export type CharacterKey = (typeof CHARACTER_KEYS)[number];
