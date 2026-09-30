import Phaser from 'phaser';
import { PX } from '@/config/gameConfig';
import { PAL } from '@/config/palette';
import { CELL_H, CELL_W, FONT_CHARS, FONT_COLS, FONT_KEY, drawFontCanvas } from './pixelFont';
import { EXTERNAL_ASSETS } from './manifest';
import type { PixelCanvas } from './pixelCanvas';
import * as S from './sprites';

type Scene = Phaser.Scene;

export interface SheetInfo {
  fw: number;
  fh: number;
  anims: Record<string, number>;
}
/** Frame sizes (logical px) of generated sheets, used by entities to align bodies. */
export const SHEETS: Record<string, SheetInfo> = {};

function addCanvasTexture(scene: Scene, key: string, canvas: HTMLCanvasElement): Phaser.Textures.CanvasTexture | null {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  return scene.textures.addCanvas(key, canvas);
}

export function buildSheet(scene: Scene, key: string, spec: S.SheetSpec, scale = PX): void {
  const names = Object.keys(spec);
  const frames: PixelCanvas[] = [];
  const ranges: Record<string, number[]> = {};
  for (const n of names) {
    ranges[n] = [];
    for (const f of spec[n]!.frames) {
      ranges[n]!.push(frames.length);
      frames.push(f);
    }
  }
  const fw = frames[0]!.w * scale;
  const fh = frames[0]!.h * scale;
  SHEETS[key] = { fw, fh, anims: Object.fromEntries(names.map((n) => [n, ranges[n]!.length])) };
  if (EXTERNAL_ASSETS[key] && scene.textures.exists(key)) {
    registerAnims(scene, key, spec, ranges);
    return;
  }
  const cols = Math.max(1, Math.min(frames.length, Math.floor(4096 / fw)));
  const rows = Math.ceil(frames.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * fw;
  canvas.height = rows * fh;
  const ctx = canvas.getContext('2d')!;
  frames.forEach((f, i) => f.draw(ctx, (i % cols) * fw, Math.floor(i / cols) * fh, scale));
  const tex = addCanvasTexture(scene, key, canvas);
  if (!tex) return;
  frames.forEach((_f, i) => tex.add(i, 0, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh));
  registerAnims(scene, key, spec, ranges);
}

function registerAnims(scene: Scene, key: string, spec: S.SheetSpec, ranges: Record<string, number[]>): void {
  for (const n of Object.keys(spec)) {
    const k = `${key}:${n}`;
    if (scene.anims.exists(k)) scene.anims.remove(k);
    scene.anims.create({
      key: k,
      frames: ranges[n]!.map((i) => ({ key, frame: i })),
      frameRate: spec[n]!.fps,
      repeat: spec[n]!.repeat,
    });
  }
}

export function single(scene: Scene, key: string, pc: PixelCanvas, scale = PX): void {
  if (EXTERNAL_ASSETS[key] && scene.textures.exists(key)) return;
  addCanvasTexture(scene, key, pc.toCanvas(scale));
}

function loop(scene: Scene, key: string, frames: PixelCanvas[], fps: number, repeat = -1): void {
  buildSheet(scene, key, { loop: { frames, fps, repeat } });
}

function registerFont(scene: Scene): void {
  const img = `${FONT_KEY}_img`;
  addCanvasTexture(scene, img, drawFontCanvas());
  const data = Phaser.GameObjects.RetroFont.Parse(scene, {
    image: img,
    width: CELL_W,
    height: CELL_H,
    chars: FONT_CHARS,
    charsPerRow: FONT_COLS,
    'offset.x': 0,
    'offset.y': 0,
    'spacing.x': 0,
    'spacing.y': 0,
    lineSpacing: 2,
  } as unknown as Phaser.Types.GameObjects.BitmapText.RetroFontConfig);
  // Phaser 3.90's Parse already returns a full cache entry ({ data, texture, frame }).
  scene.cache.bitmapFont.add(FONT_KEY, data);
}

/** Ordered generation steps so Preload can show real progress. */
export function assetSteps(scene: Scene): { label: string; run: () => void }[] {
  return [
    { label: 'font', run: () => registerFont(scene) },
    { label: 'hero', run: () => (['sword', 'bow', 'staff'] as const).forEach((w) => buildSheet(scene, `hero_${w}`, S.heroSheet(w))) },
    {
      label: 'enemies',
      run: () => {
        buildSheet(scene, 'raider', S.raiderSheet());
        buildSheet(scene, 'boneArcher', S.boneArcherSheet());
        buildSheet(scene, 'mireHexer', S.hexerSheet());
        buildSheet(scene, 'skyCaller', S.skyCallerSheet());
        buildSheet(scene, 'brute', S.bruteSheet());
        buildSheet(scene, 'imp', S.impSheet());
      },
    },
    { label: 'boss', run: () => buildSheet(scene, 'boss', S.bossSheet()) },
    {
      label: 'allies',
      run: () => {
        (['spearman', 'archer', 'shieldbearer', 'captain'] as const).forEach((k) => buildSheet(scene, `ally_${k}`, S.allySheet(k)));
        [0, 1, 2].forEach((v) => buildSheet(scene, `villager${v}`, S.villagerSheet(v)));
      },
    },
    {
      label: 'props',
      run: () => {
        buildSheet(scene, 'cage', { closed: { frames: [S.cageFrames()[0]!], fps: 1, repeat: 0 }, broken: { frames: [S.cageFrames()[1]!], fps: 1, repeat: 0 } });
        loop(scene, 'banner', S.bannerFrames(false), 6);
        loop(scene, 'bannerFree', S.bannerFrames(true), 6);
        const sh = S.shrineFrames();
        buildSheet(scene, 'shrine', { dormant: { frames: [sh[0]!], fps: 1, repeat: 0 }, active: { frames: [sh[1]!, sh[2]!], fps: 6, repeat: -1 } });
        const ch = S.chestFrames();
        buildSheet(scene, 'chest', { closed: { frames: [ch[0]!], fps: 1, repeat: 0 }, open: { frames: [ch[1]!], fps: 1, repeat: 0 } });
        single(scene, 'gate', S.gateFrame());
        loop(scene, 'lamp', S.lampFrames(), 3);
        loop(scene, 'torch', S.torchFrames(), 8);
        single(scene, 'house', S.houseFrame(false));
        single(scene, 'safehouse', S.houseFrame(true));
        single(scene, 'temple', S.templeFrame());
        single(scene, 'stall', S.stallFrame());
        single(scene, 'tree', S.treeFrame());
        single(scene, 'pine', S.pineFrame());
        single(scene, 'fence', S.fenceFrame());
        single(scene, 'hay', S.hayFrame());
        single(scene, 'ruinTower', S.ruinTowerFrame());
        single(scene, 'pillar', S.pillarFrame());
        single(scene, 'brokenGate', S.brokenGateFrame());
      },
    },
    {
      label: 'pickups',
      run: () => {
        loop(scene, 'coin', S.coinFrames(), 10);
        single(scene, 'pickup_health', S.heartFrame());
        single(scene, 'pickup_prana', S.pranaOrbFrame());
        single(scene, 'pickup_arrows', S.arrowBundleFrame());
        single(scene, 'arrow', S.arrowFrame(false));
        single(scene, 'boneArrow', S.arrowFrame(true));
        loop(scene, 'mireBolt', S.orbFrames(0x8cff5a, 0x6a3aa0, 4), 10);
        loop(scene, 'darkOrb', S.orbFrames(PAL.ruinGlow, 0x2a1038, 5), 10);
        single(scene, 'rainArrow', S.rainArrowFrame());
      },
    },
    {
      label: 'fx',
      run: () => {
        for (const [k, pc] of Object.entries(S.fxTextures())) single(scene, k, pc, k === 'fx_px' ? 1 : PX);
        for (const [k, pc] of Object.entries(S.iconTextures())) single(scene, k, pc);
        for (const [k, pc] of Object.entries(S.tileTextures())) single(scene, k, pc);
        single(scene, 'noise', S.noiseCanvas(64), 1);
      },
    },
    {
      label: 'parallax',
      run: () => {
        single(scene, 'bg_sky', S.skyCanvas(480, 270));
        single(scene, 'bg_far', S.ridgeCanvas(480, 150, 0x2a1d3d, 0x3d2a55, 'mountain'));
        single(scene, 'bg_mid', S.ridgeCanvas(480, 150, 0x1a1128, 0x7b3fe4, 'village'));
        single(scene, 'bg_pines', S.ridgeCanvas(480, 150, 0x120c1e, 0x120c1e, 'pines'));
        single(scene, 'bg_near', S.nearCanvas(480, 60));
      },
    },
  ];
}

export function registerAllSync(scene: Scene): void {
  for (const s of assetSteps(scene)) s.run();
}
