export const GAME_W = 960;
export const GAME_H = 540;
/** UI_DESIGN.md mandates readable pixel art (nearest-neighbour, integer-friendly scaling). */
export const ART_STYLE: 'pixel' | 'hd' = 'pixel';
/** Pixel-art textures are authored on a 2x grid so 1 art pixel = 2 logical px at 960x540. */
export const PX = 2;
export const BG_COLOR = '#0b0a12';
/** Which UI implementation UIScene mounts. 'pixel' = UI_DESIGN.md HUD, 'placeholder' = minimal, 'blank' = none. */
export const UI_ADAPTER: 'pixel' | 'placeholder' | 'blank' = 'pixel';
export const SAVE_KEY = 'bheem.save.v1';
