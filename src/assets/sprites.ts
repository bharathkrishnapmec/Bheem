/* Procedural pixel-art authoring: characters, props, pickups, FX, icons, tiles and parallax. */
import { PAL } from '@/config/palette';
import { PixelCanvas, hash2 } from './pixelCanvas';

export interface AnimSpec {
  frames: PixelCanvas[];
  fps: number;
  repeat: number;
}
export type SheetSpec = Record<string, AnimSpec>;

const O = PAL.outline;
const rad = (d: number) => (d * Math.PI) / 180;

// ---------------------------------------------------------------- weapons
export type WeaponDraw = 'sword' | 'tulwar' | 'bow' | 'boneBow' | 'staff' | 'spear' | 'club' | 'trident' | 'shortSword' | 'none';

export function drawWeapon(pc: PixelCanvas, hx: number, hy: number, angDeg: number, kind: WeaponDraw, pull?: [number, number]): void {
  const c = Math.cos(rad(angDeg));
  const s = Math.sin(rad(angDeg));
  const at = (d: number, p = 0): [number, number] => [hx + c * d - s * p, hy + s * d + c * p];
  const seg = (d0: number, d1: number, col: number, th = 1, p = 0) => {
    const a = at(d0, p);
    const b = at(d1, p);
    pc.line(a[0], a[1], b[0], b[1], col, th);
  };
  switch (kind) {
    case 'sword':
    case 'shortSword': {
      const L = kind === 'sword' ? 11 : 7;
      seg(2, L, 0xdfe4ee);
      seg(3, L - 1, 0x9aa3b5, 1, 1);
      const g0 = at(1.5, -2);
      const g1 = at(1.5, 2);
      pc.line(g0[0], g0[1], g1[0], g1[1], PAL.gold);
      seg(-2, 0, PAL.brown);
      const pm = at(-2);
      pc.set(pm[0], pm[1], PAL.gold);
      break;
    }
    case 'tulwar': {
      seg(2, 9, 0xb8b0c8);
      const tip = at(10, -1);
      pc.set(tip[0], tip[1], 0xd8d0e8);
      const g0 = at(1.5, -2);
      const g1 = at(1.5, 2);
      pc.line(g0[0], g0[1], g1[0], g1[1], 0x6a4a8a);
      seg(-2, 0, 0x3a2a3a);
      break;
    }
    case 'bow':
    case 'boneBow': {
      const wood = kind === 'bow' ? 0x8a5a2b : 0xe6e0cc;
      const R = 7;
      const cx = hx - c * 3;
      const cy = hy - s * 3;
      let prev: [number, number] | null = null;
      const ends: [number, number][] = [];
      for (let a = -75; a <= 75; a += 15) {
        const p: [number, number] = [cx + R * Math.cos(rad(angDeg + a)), cy + R * Math.sin(rad(angDeg + a))];
        if (prev) pc.line(prev[0], prev[1], p[0], p[1], wood);
        prev = p;
        if (a === -75 || a === 75) ends.push(p);
      }
      const [e0, e1] = ends as [[number, number], [number, number]];
      const str = 0xe8e0d0;
      if (pull) {
        pc.line(e0[0], e0[1], pull[0], pull[1], str);
        pc.line(e1[0], e1[1], pull[0], pull[1], str);
        pc.line(pull[0], pull[1], hx + c * 5, hy + s * 5, 0xc8b89a);
        pc.set(hx + c * 6, hy + s * 6, 0xdfe4ee);
      } else pc.line(e0[0], e0[1], e1[0], e1[1], str);
      break;
    }
    case 'staff': {
      seg(-6, 12, 0x6a4028);
      seg(-5, 11, 0x8a5a38, 1, 1);
      const t = at(13);
      pc.rect(t[0] - 1, t[1] - 1, 2, 2, 0x9fe6ff);
      pc.set(t[0] - 2, t[1], PAL.prana);
      pc.set(t[0] + 1, t[1] - 2, PAL.prana);
      pc.set(t[0], t[1] + 1, PAL.prana);
      break;
    }
    case 'spear': {
      seg(-7, 13, 0x7a5030);
      seg(13, 16, 0xdfe4ee);
      const b0 = at(13, -1);
      const b1 = at(13, 1);
      pc.set(b0[0], b0[1], 0xb0b8c8);
      pc.set(b1[0], b1[1], 0xb0b8c8);
      break;
    }
    case 'club': {
      seg(-2, 11, 0x6a4a2e, 3);
      const h = at(12);
      pc.disc(h[0], h[1], 3.2, 0x4a3020);
      pc.set(h[0] - 3, h[1] - 3, 0x9aa3b5);
      pc.set(h[0] + 3, h[1] - 3, 0x9aa3b5);
      pc.set(h[0] + 4, h[1] + 1, 0x9aa3b5);
      pc.set(h[0] - 1, h[1] + 4, 0x9aa3b5);
      break;
    }
    case 'trident': {
      seg(-14, 20, 0x2a1a30, 2);
      const b0 = at(20, -4);
      const b1 = at(20, 4);
      pc.line(b0[0], b0[1], b1[0], b1[1], PAL.gold);
      seg(20, 27, PAL.gold, 1, -4);
      seg(20, 29, PAL.cleanseGold, 2, 0);
      seg(20, 27, PAL.gold, 1, 4);
      const g = at(22);
      pc.set(g[0], g[1], PAL.ruinGlow);
      break;
    }
    case 'none':
      break;
  }
}

// ---------------------------------------------------------------- humanoid rig
export interface Pose {
  bob?: number;
  lean?: number;
  crouch?: number;
  lf?: [number, number];
  rf?: [number, number];
  la?: [number, number];
  ra?: [number, number];
  t?: number;
  weaponAng?: number;
  pull?: boolean;
  glow?: boolean;
}
export interface Joints {
  cx: number;
  feetY: number;
  hipY: number;
  shY: number;
  headX: number;
  headY: number;
  handF: [number, number];
  handB: [number, number];
  pose: Pose;
}
export interface HumSpec {
  fw: number;
  fh: number;
  legLen: number;
  torsoH: number;
  tw: number;
  headR: number;
  body: number;
  bodyDark: number;
  legs: number;
  legsDark: number;
  boots: number;
  arm: number;
  hand: number;
  outline?: number;
  thinLimbs?: boolean;
  weapon?: WeaponDraw;
  back?: (pc: PixelCanvas, j: Joints) => void;
  torso?: (pc: PixelCanvas, j: Joints, x0: number, y0: number) => void;
  head: (pc: PixelCanvas, j: Joints) => void;
  front?: (pc: PixelCanvas, j: Joints) => void;
}

export function humanoid(spec: HumSpec, pose: Pose): PixelCanvas {
  const pc = new PixelCanvas(spec.fw, spec.fh);
  const cx = Math.floor(spec.fw / 2);
  const feetY = spec.fh - 2;
  const crouch = pose.crouch ?? 0;
  const bob = pose.bob ?? 0;
  const lean = pose.lean ?? 0;
  const hipY = feetY - spec.legLen + crouch + bob;
  const shY = hipY - spec.torsoH;
  const headX = cx + lean + 1;
  const headY = shY - spec.headR + 1;
  const la = pose.la ?? [-1, spec.torsoH - 2];
  const ra = pose.ra ?? [1, spec.torsoH - 2];
  const shB: [number, number] = [cx + lean - Math.floor(spec.tw / 2) + 1, shY + 1];
  const shF: [number, number] = [cx + lean + Math.floor(spec.tw / 2) - 1, shY + 1];
  const handB: [number, number] = [shB[0] + la[0], shB[1] + la[1]];
  const handF: [number, number] = [shF[0] + ra[0], shF[1] + ra[1]];
  const j: Joints = { cx, feetY, hipY, shY, headX, headY, handF, handB, pose };
  const limb = spec.thinLimbs ? 1 : 2;

  spec.back?.(pc, j);
  // back arm
  pc.line(shB[0], shB[1], handB[0], handB[1], spec.bodyDark, limb);
  pc.set(handB[0], handB[1], spec.hand);
  // legs
  const leg = (hx: number, f: [number, number], col: number, boot: number) => {
    const fx = cx + f[0];
    const fy = feetY - f[1];
    const kx = (hx + fx) / 2 + (crouch > 0 ? 2 : 0) + (f[1] > 1 ? 1 : 0);
    const ky = (hipY + fy) / 2 - (crouch > 0 ? 1 : 0);
    pc.line(hx, hipY, kx, ky, col, limb);
    pc.line(kx, ky, fx, fy - 1, col, limb);
    pc.rect(fx - (limb === 2 ? 0 : 0), fy - 1, limb + 1, 2, boot);
  };
  leg(cx - 1 + lean, pose.rf ?? [-1, 0], spec.legsDark, spec.boots);
  leg(cx + 1 + lean, pose.lf ?? [1, 0], spec.legs, spec.boots);
  // torso
  const x0 = cx + lean - Math.floor(spec.tw / 2);
  pc.rect(x0, shY, spec.tw, spec.torsoH + 1, spec.body);
  pc.rect(x0, shY, Math.max(1, Math.floor(spec.tw / 3)), spec.torsoH + 1, spec.bodyDark);
  spec.torso?.(pc, j, x0, shY);
  spec.head(pc, j);
  // front arm & weapon
  if (spec.weapon && spec.weapon !== 'none' && (pose.weaponAng !== undefined || spec.weapon)) {
    const ang = pose.weaponAng ?? 80;
    drawWeapon(pc, handF[0], handF[1], ang, spec.weapon, pose.pull ? [handF[0] - Math.cos(rad(ang)) * 6, handF[1] - Math.sin(rad(ang)) * 6] : undefined);
  }
  pc.line(shF[0], shF[1], handF[0], handF[1], spec.arm, limb);
  pc.set(handF[0], handF[1], spec.hand);
  spec.front?.(pc, j);
  pc.outline(spec.outline ?? O);
  return pc;
}

/** Standard 6-frame run cycle feet/arms. */
export function runPose(i: number, n = 6, stride = 4, extra: Pose = {}): Pose {
  const p = (i / n) * Math.PI * 2;
  const sn = Math.sin(p);
  const cs = Math.cos(p);
  return {
    bob: Math.abs(cs) > 0.7 ? 0 : -1,
    lf: [Math.round(sn * stride), Math.max(0, Math.round(cs * 2))],
    rf: [Math.round(-sn * stride), Math.max(0, Math.round(-cs * 2))],
    la: [Math.round(sn * 3), 6],
    ra: [Math.round(-sn * 3), 6],
    t: i,
    ...extra,
  };
}

// ---------------------------------------------------------------- hero
function heroSpec(weapon: WeaponDraw): HumSpec {
  return {
    fw: 30,
    fh: 32,
    legLen: 7,
    torsoH: 8,
    tw: 7,
    headR: 4.5,
    body: PAL.tunic,
    bodyDark: PAL.tunicDark,
    legs: PAL.hoodDark,
    legsDark: 0x20243a,
    boots: PAL.brown,
    arm: PAL.tunic,
    hand: PAL.skin,
    weapon,
    back(pc, j) {
      // scarf tail flowing behind
      const t = j.pose.t ?? 0;
      const len = j.pose.lean && j.pose.lean > 2 ? 9 : 6;
      for (let k = 0; k < len; k++) {
        const x = j.headX - 4 - k;
        const y = j.shY - 1 + Math.round(Math.sin(t * 1.3 + k * 0.9) * 1) + Math.floor(k / 3);
        pc.rect(x, y, 1, 2, k % 3 === 2 ? PAL.scarfDark : PAL.scarf);
      }
    },
    torso(pc, j, x0, y0) {
      pc.rect(x0, j.hipY - 1, 7, 1, PAL.brown);
      pc.set(x0 + 4, j.hipY - 1, PAL.gold);
      pc.rect(x0 + 1, y0, 5, 1, PAL.scarf);
    },
    head(pc, j) {
      const { headX: hx, headY: hy } = j;
      pc.disc(hx, hy, 4.5, PAL.hood);
      pc.rect(hx - 6, hy - 1, 2, 2, PAL.hoodDark);
      pc.set(hx - 7, hy, PAL.hoodDark);
      pc.rect(hx - 4, hy - 4, 3, 2, PAL.hoodDark);
      pc.rect(hx, hy - 1, 4, 4, PAL.skin);
      pc.rect(hx, hy - 2, 4, 1, PAL.hoodDark);
      pc.set(hx + 2, hy, O);
      pc.set(hx + 3, hy + 2, 0xd8906a);
      // scarf wrap
      pc.rect(hx - 4, hy + 3, 8, 2, PAL.scarf);
      pc.rect(hx - 4, hy + 4, 2, 1, PAL.scarfDark);
    },
  };
}

function swordPoses(): Record<string, Pose[]> {
  return {
    atk1: [
      { ra: [-1, -6], weaponAng: -130, lean: -1, t: 0 },
      { ra: [6, 0], weaponAng: -5, lean: 1, lf: [3, 0], rf: [-3, 0], t: 1 },
      { ra: [5, 3], weaponAng: 40, lean: 1, lf: [3, 0], rf: [-3, 0], t: 2 },
    ],
    atk2: [
      { ra: [-2, 4], weaponAng: 150, lean: 0, t: 0 },
      { ra: [6, -2], weaponAng: -25, lean: 1, lf: [3, 0], rf: [-3, 0], t: 1 },
      { ra: [4, -5], weaponAng: -70, lean: 1, lf: [3, 0], rf: [-3, 0], t: 2 },
    ],
    atk3: [
      { ra: [0, -9], la: [0, -8], weaponAng: -100, lean: -1, t: 0 },
      { ra: [7, 3], la: [5, 3], weaponAng: 50, lean: 2, crouch: 2, lf: [4, 0], rf: [-4, 0], t: 1 },
      { ra: [6, 5], la: [4, 4], weaponAng: 80, lean: 2, crouch: 2, lf: [4, 0], rf: [-4, 0], t: 2 },
    ],
    air: [
      { ra: [2, -7], weaponAng: -70, lf: [2, 3], rf: [-2, 1], t: 0 },
      { ra: [6, 3], weaponAng: 60, lf: [2, 3], rf: [-2, 1], t: 1 },
    ],
    crouchAtk: [
      { crouch: 4, ra: [0, 2], weaponAng: 160, t: 0 },
      { crouch: 4, ra: [7, 2], weaponAng: 3, lean: 1, lf: [3, 0], rf: [-3, 0], t: 1 },
    ],
  };
}

export function heroSheet(weapon: 'sword' | 'bow' | 'staff'): SheetSpec {
  const wd: WeaponDraw = weapon;
  const spec = heroSpec(wd);
  const restAng = weapon === 'sword' ? 110 : weapon === 'bow' ? 95 : -80;
  const restRa: [number, number] = weapon === 'staff' ? [2, 4] : [1, 6];
  const P = (p: Pose) => humanoid(spec, { weaponAng: restAng, ra: restRa, ...p });
  const sheet: SheetSpec = {
    idle: { frames: [0, 1, 2, 3].map((i) => P({ bob: i < 2 ? 0 : 1, t: i })), fps: 5, repeat: -1 },
    run: { frames: [0, 1, 2, 3, 4, 5].map((i) => P(runPose(i, 6, 4, { ra: restRa[0] === 2 ? [3, 3] : undefined, lean: 1 }))), fps: 12, repeat: -1 },
    jump: { frames: [P({ lf: [2, 3], rf: [-2, 1], la: [-3, 2], t: 1 })], fps: 1, repeat: 0 },
    fall: { frames: [P({ lf: [1, 1], rf: [-2, 0], la: [-4, -1], t: 2 }), P({ lf: [1, 1], rf: [-2, 0], la: [-4, 0], t: 3 })], fps: 8, repeat: -1 },
    crouch: { frames: [P({ crouch: 4, lf: [2, 0], rf: [-2, 0] })], fps: 1, repeat: 0 },
    dash: { frames: [P({ lean: 3, lf: [5, 1], rf: [-5, 1], la: [-5, 2], t: 4 })], fps: 1, repeat: 0 },
    hurt: { frames: [P({ lean: -2, la: [-4, -2], ra: [-2, -3], t: 5 })], fps: 1, repeat: 0 },
    dead: { frames: [P({ lean: -2, la: [-4, -2], ra: [-2, -3], t: 5 }).lying()], fps: 1, repeat: 0 },
    cheer: { frames: [P({ ra: [2, -9], weaponAng: -90, t: 0 }), P({ ra: [2, -10], weaponAng: -90, bob: -1, t: 1 })], fps: 4, repeat: -1 },
  };
  if (weapon === 'sword') {
    for (const [k, poses] of Object.entries(swordPoses())) sheet[k] = { frames: poses.map((p) => humanoid(spec, p)), fps: 20, repeat: 0 };
  } else if (weapon === 'bow') {
    // aim frames: -60,-30,0,30,60 (upper body "rotates")
    [-60, -30, 0, 30, 60].forEach((a, i) => {
      const c = Math.cos(rad(a));
      const s = Math.sin(rad(a));
      sheet[`aim${i}`] = {
        frames: [humanoid(spec, { ra: [Math.round(c * 7), Math.round(s * 7)], la: [Math.round(c * 3), Math.round(s * 3)], weaponAng: a, pull: true })],
        fps: 1,
        repeat: 0,
      };
      sheet[`shoot${i}`] = {
        frames: [humanoid(spec, { ra: [Math.round(c * 7), Math.round(s * 7)], la: [Math.round(c * 1) - 2, Math.round(s * 1) + 1], weaponAng: a, lean: -1 })],
        fps: 1,
        repeat: 0,
      };
    });
  } else {
    sheet.cast = { frames: [humanoid(spec, { ra: [3, -6], weaponAng: -80 }), humanoid(spec, { ra: [7, -1], weaponAng: -8, lean: 1 })], fps: 16, repeat: 0 };
    sheet.clapRaise = { frames: [humanoid(spec, { ra: [1, -9], la: [0, -9], weaponAng: -90, bob: -1 })], fps: 1, repeat: 0 };
    sheet.clapSlam = { frames: [humanoid(spec, { ra: [6, 4], la: [4, 4], weaponAng: 80, crouch: 3, lf: [3, 0], rf: [-3, 0] })], fps: 1, repeat: 0 };
  }
  return sheet;
}

// ---------------------------------------------------------------- enemies
const RAIDER: HumSpec = {
  fw: 30,
  fh: 32,
  legLen: 7,
  torsoH: 9,
  tw: 8,
  headR: 4,
  body: 0x3b2a4f,
  bodyDark: 0x2a1d3a,
  legs: 0x2e2238,
  legsDark: 0x1f1728,
  boots: 0x3a2a2a,
  arm: 0x5a4a6a,
  hand: 0x8a9a74,
  weapon: 'tulwar',
  torso(pc, j, x0, y0) {
    pc.rect(x0, y0 + 3, 8, 1, PAL.ruinViolet);
    pc.rect(x0, j.hipY - 1, 8, 1, 0x6a3a2a);
    pc.rect(x0 + 5, y0, 3, 2, 0x5a4a6a);
  },
  head(pc, j) {
    const { headX: hx, headY: hy } = j;
    pc.disc(hx, hy, 4, 0x4a3a5e);
    pc.rect(hx - 1, hy - 4, 3, 1, 0x6a5a7e);
    pc.rect(hx + 1, hy - 1, 3, 3, 0x8a9a74);
    pc.set(hx + 2, hy, PAL.danger);
    pc.rect(hx + 1, hy - 1, 3, 1, 0x2a1d3a);
    // horns
    pc.line(hx - 3, hy - 3, hx - 5, hy - 6, 0xd8cfb8);
    pc.line(hx + 2, hy - 4, hx + 4, hy - 7, 0xd8cfb8);
  },
};

const BONE = 0xe6e0cc;
const ARCHER: HumSpec = {
  fw: 30,
  fh: 32,
  legLen: 7,
  torsoH: 8,
  tw: 6,
  headR: 3.5,
  body: 0x3a3040,
  bodyDark: 0x2a2230,
  legs: BONE,
  legsDark: 0x9d9682,
  boots: 0x5a4a3a,
  arm: BONE,
  hand: BONE,
  thinLimbs: true,
  weapon: 'boneBow',
  torso(pc, _j, x0, y0) {
    for (let r = 1; r < 7; r += 2) pc.rect(x0 + 1, y0 + r, 4, 1, BONE);
    pc.rect(x0 + 2, y0, 1, 8, 0x9d9682);
  },
  head(pc, j) {
    const { headX: hx, headY: hy } = j;
    pc.disc(hx, hy, 3.5, BONE);
    pc.rect(hx + 1, hy - 1, 2, 2, O);
    pc.set(hx + 2, hy - 1, PAL.ruinGlow);
    pc.rect(hx, hy + 2, 3, 1, 0x9d9682);
    pc.rect(hx - 4, hy - 3, 4, 2, 0x4a3a5e);
  },
};

export function raiderSheet(): SheetSpec {
  const P = (p: Pose) => humanoid(RAIDER, { weaponAng: 120, ...p });
  return {
    idle: { frames: [P({}), P({ bob: 1 })], fps: 3, repeat: -1 },
    walk: { frames: [0, 1, 2, 3].map((i) => P(runPose(i, 4, 3))), fps: 8, repeat: -1 },
    windup: { frames: [P({ ra: [-2, -7], weaponAng: -135, lean: -1 })], fps: 1, repeat: 0 },
    attack: { frames: [P({ ra: [7, 1], weaponAng: 5, lean: 2, lf: [3, 0], rf: [-3, 0] }), P({ ra: [5, 4], weaponAng: 50, lean: 1 })], fps: 10, repeat: 0 },
    lunge: { frames: [P({ ra: [8, 0], weaponAng: 0, lean: 3, lf: [5, 1], rf: [-5, 1] })], fps: 1, repeat: 0 },
    hurt: { frames: [P({ lean: -2, ra: [-2, -2], weaponAng: -60 })], fps: 1, repeat: 0 },
  };
}

export function boneArcherSheet(): SheetSpec {
  const P = (p: Pose) => humanoid(ARCHER, { weaponAng: 90, ra: [1, 6], ...p });
  return {
    idle: { frames: [P({}), P({ bob: 1 })], fps: 3, repeat: -1 },
    walk: { frames: [0, 1, 2, 3].map((i) => P(runPose(i, 4, 3, { ra: [1, 6] }))), fps: 8, repeat: -1 },
    draw: { frames: [P({ ra: [7, 0], la: [2, 0], weaponAng: 0, pull: true })], fps: 1, repeat: 0 },
    drawUp: { frames: [P({ ra: [6, -4], la: [2, -1], weaponAng: -30, pull: true })], fps: 1, repeat: 0 },
    release: { frames: [P({ ra: [7, 0], la: [-2, 1], weaponAng: 0, lean: -1 })], fps: 1, repeat: 0 },
    hurt: { frames: [P({ lean: -2, ra: [-2, -2], weaponAng: -60 })], fps: 1, repeat: 0 },
  };
}

function hexerFrame(bob: number, cast: boolean, hurt = false): PixelCanvas {
  const pc = new PixelCanvas(30, 34);
  const cx = 14;
  const by = 31 + bob;
  const robe = 0x3d2b52;
  const robeD = 0x2a1d3a;
  pc.poly([[cx - 4, by - 17], [cx + 4, by - 17], [cx + 7, by], [cx - 7, by]], robe);
  pc.poly([[cx - 4, by - 17], [cx - 1, by - 17], [cx - 3, by], [cx - 7, by]], robeD);
  for (let x = cx - 7; x <= cx + 7; x++) if ((x + bob) % 3 !== 0) pc.set(x, by, 0x6fbf4a);
  pc.rect(cx - 7, by - 1, 15, 1, 0x4a8a3a);
  // hood
  const hx = cx + (hurt ? -1 : 1);
  const hy = by - 21;
  pc.disc(hx, hy, 4.5, robe);
  pc.line(hx - 3, hy - 3, hx - 7, hy - 6, robe, 2);
  pc.rect(hx + 1, hy - 1, 3, 3, 0x120a1a);
  pc.set(hx + 2, hy, 0x8cff5a);
  pc.set(hx + 3, hy, 0x8cff5a);
  // staff & orb
  const sx = cx + (cast ? 8 : 6);
  const sy = by - (cast ? 26 : 20);
  pc.line(cx + 4, by - 1, sx, sy, 0x5a3a28);
  pc.line(cx + 2, by - 12, cast ? sx - 1 : cx + 5, cast ? sy + 3 : by - 12, 0x7a6a8a, 2);
  pc.disc(sx, sy - 1, cast ? 2.5 : 1.5, 0x8cff5a);
  pc.set(sx, sy - 1, 0xeaffd0);
  if (cast) {
    pc.set(sx - 3, sy - 4, 0xb080ff);
    pc.set(sx + 3, sy - 3, 0x8cff5a);
    pc.set(sx + 1, sy - 5, 0xb080ff);
  }
  pc.outline(O);
  return pc;
}

export function hexerSheet(): SheetSpec {
  return {
    idle: { frames: [0, -1, -2, -1].map((b) => hexerFrame(b, false)), fps: 5, repeat: -1 },
    walk: { frames: [0, -1, -2, -1].map((b) => hexerFrame(b, false)), fps: 7, repeat: -1 },
    cast: { frames: [hexerFrame(-1, true), hexerFrame(-2, true)], fps: 8, repeat: -1 },
    hurt: { frames: [hexerFrame(0, false, true)], fps: 1, repeat: 0 },
  };
}

function callerFrame(wing: number, cast = false, dive = false, hurt = false): PixelCanvas {
  const pc = new PixelCanvas(40, 30);
  const cx = 20;
  const cy = 15;
  const body = 0x5a2d82;
  const belly = 0x8a5ab8;
  const wingC = 0x3a1d5a;
  const wingM = 0x6a3aa0;
  if (!dive) {
    // wings: wing = -1 up, 0 mid, 1 down
    const tipY = cy - 9 + wing * 8;
    for (const side of [-1, 1]) {
      const pts: [number, number][] = [
        [cx + side * 2, cy - 3],
        [cx + side * 16, tipY],
        [cx + side * 14, tipY + 5],
        [cx + side * 10, cy + 1 + wing],
        [cx + side * 7, cy + 3],
        [cx + side * 2, cy + 2],
      ];
      pc.poly(side < 0 ? pts : pts.map((p) => p).reverse(), wingC);
      pc.line(cx + side * 2, cy - 3, cx + side * 16, tipY, wingM);
      pc.line(cx + side * 9, cy - 1 + wing * 2, cx + side * 10, cy + 1 + wing, wingM);
    }
  } else {
    pc.poly([[cx - 3, cy - 6], [cx - 6, cy + 8], [cx - 2, cy + 4]], wingC);
    pc.poly([[cx + 3, cy - 6], [cx + 6, cy + 8], [cx + 2, cy + 4]], wingC);
  }
  pc.ellipse(cx, cy, 4, 6, body);
  pc.ellipse(cx + 1, cy + 1, 2, 4, belly);
  // tail
  pc.line(cx - 1, cy + 6, cx - 4, cy + 11, body);
  pc.set(cx - 5, cy + 12, PAL.danger);
  // head
  const hx = cx + (hurt ? -1 : 1);
  const hy = cy - 8;
  pc.disc(hx, hy, 3, body);
  pc.set(hx - 2, hy - 4, 0xd8cfb8);
  pc.set(hx + 2, hy - 4, 0xd8cfb8);
  pc.set(hx - 2, hy - 3, 0xd8cfb8);
  pc.set(hx + 2, hy - 3, 0xd8cfb8);
  pc.set(hx + 1, hy, 0xffd25a);
  pc.set(hx + 2, hy, 0xffd25a);
  if (cast) {
    pc.line(cx + 3, cy - 2, cx + 6, cy - 8, body, 2);
    pc.line(cx - 3, cy - 2, cx - 6, cy - 8, body, 2);
    pc.disc(cx, cy - 14, 2, PAL.ruinGlow);
    pc.set(cx, cy - 14, 0xffffff);
  }
  pc.outline(O);
  return pc;
}

export function skyCallerSheet(): SheetSpec {
  return {
    fly: { frames: [callerFrame(-1), callerFrame(0), callerFrame(1), callerFrame(0)], fps: 8, repeat: -1 },
    cast: { frames: [callerFrame(-1, true), callerFrame(0, true)], fps: 6, repeat: -1 },
    dive: { frames: [callerFrame(0, false, true)], fps: 1, repeat: 0 },
    hurt: { frames: [callerFrame(0, false, false, true)], fps: 1, repeat: 0 },
  };
}

const BRUTE: HumSpec = {
  fw: 48,
  fh: 46,
  legLen: 10,
  torsoH: 14,
  tw: 14,
  headR: 4.5,
  body: 0x6b4a7a,
  bodyDark: 0x4a3058,
  legs: 0x3a2a3a,
  legsDark: 0x2a1d2a,
  boots: 0x2a1a1a,
  arm: 0x7b5a8a,
  hand: 0x7b5a8a,
  weapon: 'club',
  torso(pc, j, x0, y0) {
    pc.rect(x0, j.hipY - 3, 14, 3, 0x5a3a28);
    pc.rect(x0 + 6, j.hipY - 3, 2, 3, PAL.gold);
    pc.line(x0, y0 + 1, x0 + 13, y0 + 9, 0x5a3a28, 2);
    pc.rect(x0 + 9, y0 - 1, 6, 4, 0x4a4a5a);
    pc.set(x0 + 11, y0 - 2, 0x9aa3b5);
    pc.set(x0 + 13, y0 - 2, 0x9aa3b5);
  },
  head(pc, j) {
    const { headX: hx } = j;
    const hy = j.headY + 3;
    pc.disc(hx + 1, hy, 4.5, 0x7b5a8a);
    pc.rect(hx - 2, hy - 5, 7, 2, 0x3a2a3a);
    pc.set(hx + 3, hy - 1, PAL.danger);
    pc.set(hx + 4, hy - 1, PAL.danger);
    pc.set(hx + 3, hy + 3, 0xf0e8d0);
    pc.set(hx + 5, hy + 3, 0xf0e8d0);
    pc.set(hx + 5, hy + 2, 0xf0e8d0);
  },
};

export function bruteSheet(): SheetSpec {
  const P = (p: Pose) => humanoid(BRUTE, { weaponAng: 70, ra: [2, 10], la: [-2, 10], ...p });
  return {
    idle: { frames: [P({}), P({ bob: 1 })], fps: 2, repeat: -1 },
    walk: { frames: [0, 1, 2, 3].map((i) => P(runPose(i, 4, 4, { ra: [2, 10], la: [-2, 10] }))), fps: 6, repeat: -1 },
    windup: { frames: [P({ ra: [0, -12], la: [-1, -11], weaponAng: -110, lean: -2, bob: -1 })], fps: 1, repeat: 0 },
    slam: { frames: [P({ ra: [9, 6], la: [7, 6], weaponAng: 85, crouch: 4, lean: 3, lf: [4, 0], rf: [-4, 0] })], fps: 1, repeat: 0 },
    chargeWind: { frames: [P({ lean: -2, crouch: 2, ra: [-4, 4], weaponAng: 170 })], fps: 1, repeat: 0 },
    charge: { frames: [0, 1, 2, 3].map((i) => P(runPose(i, 4, 6, { lean: 4, ra: [6, 2], weaponAng: 10 }))), fps: 14, repeat: -1 },
    stunned: { frames: [P({ lean: -2, crouch: 3, ra: [2, 12], weaponAng: 95 }), P({ lean: -1, crouch: 3, ra: [2, 12], weaponAng: 95 })], fps: 3, repeat: -1 },
    hurt: { frames: [P({ lean: -3, ra: [-2, 2], weaponAng: -40 })], fps: 1, repeat: 0 },
  };
}

function impFrame(f: number, atk = false): PixelCanvas {
  const pc = new PixelCanvas(20, 18);
  const cx = 10;
  const cy = 10;
  const w = f === 0 ? -3 : 1;
  pc.poly([[cx - 2, cy - 1], [cx - 8, cy + w - 2], [cx - 6, cy + w + 2], [cx - 2, cy + 2]], 0x4a1d6a);
  pc.poly([[cx + 2, cy - 1], [cx + 2, cy + 2], [cx + 6, cy + w + 2], [cx + 8, cy + w - 2]], 0x4a1d6a);
  pc.disc(cx, cy, 3.5, 0x8a3ab8);
  pc.set(cx - 2, cy - 4, 0xd8cfb8);
  pc.set(cx + 2, cy - 4, 0xd8cfb8);
  pc.set(cx + 1, cy - 1, 0xffd25a);
  pc.set(cx + 3, cy - 1, 0xffd25a);
  pc.rect(cx + 1, cy + 1, 2, 1, atk ? 0xffffff : 0x3a1050);
  pc.line(cx - 1, cy + 3, cx - 3, cy + 6, 0x8a3ab8);
  pc.outline(O);
  return pc;
}
export function impSheet(): SheetSpec {
  return {
    fly: { frames: [impFrame(0), impFrame(1)], fps: 10, repeat: -1 },
    attack: { frames: [impFrame(1, true)], fps: 1, repeat: 0 },
    hurt: { frames: [impFrame(0, true)], fps: 1, repeat: 0 },
  };
}

// ---------------------------------------------------------------- boss
const BOSS: HumSpec = {
  fw: 72,
  fh: 70,
  legLen: 16,
  torsoH: 22,
  tw: 20,
  headR: 7,
  body: 0x3a1a4e,
  bodyDark: 0x2a1038,
  legs: 0x2a1a30,
  legsDark: 0x1a0e20,
  boots: 0x120812,
  arm: 0x4a2260,
  hand: 0x6a3a5a,
  weapon: 'trident',
  back(pc, j) {
    const t = j.pose.t ?? 0;
    const x0 = j.cx + (j.pose.lean ?? 0) - 10;
    pc.poly(
      [
        [x0 + 2, j.shY],
        [x0 + 16, j.shY],
        [x0 + 12, j.feetY - 1],
        [x0 - 8 - (t % 2), j.feetY - 1],
      ],
      0x5c0f1e,
    );
    for (let y = j.shY + 4; y < j.feetY; y += 5) pc.set(x0 - 2 - ((y + t) % 3), y, 0x3a0a14);
  },
  torso(pc, j, x0, y0) {
    pc.rect(x0, y0, 20, 3, PAL.gold);
    pc.rect(x0 + 2, j.hipY - 3, 16, 3, 0x1a0e20);
    pc.rect(x0 + 8, j.hipY - 3, 4, 3, PAL.gold);
    pc.disc(x0 + 11, y0 + 10, 3, j.pose.glow ? 0xffffff : PAL.ruinGlow);
    pc.disc(x0 + 11, y0 + 10, 1.5, j.pose.glow ? PAL.ruinGlow : 0xffffff);
    pc.line(x0 + 4, y0 + 5, x0 + 8, y0 + 9, PAL.ruinViolet);
    pc.line(x0 + 17, y0 + 5, x0 + 14, y0 + 9, PAL.ruinViolet);
    // pauldrons
    pc.ellipse(x0 + 1, y0 + 2, 4, 3, 0x2a1038);
    pc.ellipse(x0 + 19, y0 + 2, 4, 3, 0x2a1038);
    pc.line(x0 - 2, y0, x0 - 5, y0 - 4, 0xd8cfb8);
    pc.line(x0 + 22, y0, x0 + 25, y0 - 4, 0xd8cfb8);
  },
  head(pc, j) {
    const { headX: hx, headY: hy } = j;
    pc.disc(hx, hy + 1, 7, 0x2a1030);
    pc.rect(hx - 6, hy - 6, 13, 3, PAL.gold);
    for (let k = -6; k <= 6; k += 3) pc.line(hx + k, hy - 6, hx + k, hy - 9 - (k === 0 ? 2 : 0), PAL.gold);
    pc.line(hx - 6, hy - 3, hx - 11, hy - 11, 0xd8cfb8, 2);
    pc.line(hx + 6, hy - 3, hx + 11, hy - 11, 0xd8cfb8, 2);
    pc.rect(hx + 1, hy - 1, 5, 2, 0x120812);
    pc.rect(hx + 2, hy - 1, 2, 1, 0xffd25a);
    pc.set(hx + 5, hy - 1, 0xffd25a);
    pc.rect(hx - 1, hy + 4, 7, 3, 0x1a0e20);
    pc.set(hx + 1, hy + 5, 0xf0e8d0);
    pc.set(hx + 4, hy + 5, 0xf0e8d0);
  },
};

export function bossSheet(): SheetSpec {
  const P = (p: Pose) => humanoid(BOSS, { weaponAng: -80, ra: [3, 8], la: [-3, 18], ...p });
  return {
    idle: { frames: [0, 1, 2, 3].map((i) => P({ bob: i < 2 ? 0 : 1, t: i })), fps: 4, repeat: -1 },
    walk: { frames: [0, 1, 2, 3].map((i) => P(runPose(i, 4, 5, { ra: [3, 8], la: [-3, 18], weaponAng: -80, t: i }))), fps: 6, repeat: -1 },
    windup: { frames: [P({ ra: [0, -16], la: [-2, -15], weaponAng: -100, lean: -2, bob: -1 })], fps: 1, repeat: 0 },
    slam: { frames: [P({ ra: [14, 10], la: [10, 12], weaponAng: 80, crouch: 6, lean: 4, lf: [6, 0], rf: [-6, 0] })], fps: 1, repeat: 0 },
    cast: { frames: [P({ ra: [4, 6], la: [16, -2], weaponAng: -80, glow: true, t: 0 }), P({ ra: [4, 6], la: [17, -3], weaponAng: -80, glow: false, t: 1 })], fps: 8, repeat: -1 },
    bow: { frames: [P({ ra: [16, -2], la: [6, -2], weaponAng: -5, lean: 1 })], fps: 1, repeat: 0 },
    summon: { frames: [P({ ra: [6, -16], la: [-6, -16], weaponAng: -90, glow: true, bob: -1 })], fps: 1, repeat: 0 },
    chargeWind: { frames: [P({ lean: -3, crouch: 3, ra: [-6, 4], weaponAng: 175 })], fps: 1, repeat: 0 },
    charge: { frames: [0, 1, 2, 3].map((i) => P(runPose(i, 4, 7, { lean: 6, ra: [14, 2], la: [6, 6], weaponAng: 0, t: i }))), fps: 14, repeat: -1 },
    roar: { frames: [P({ ra: [8, -12], la: [-8, -12], weaponAng: -70, glow: true, lean: -2 }), P({ ra: [9, -13], la: [-9, -13], weaponAng: -70, glow: false, lean: -2 })], fps: 10, repeat: -1 },
    hurt: { frames: [P({ lean: -4, ra: [-2, 2], weaponAng: -130 })], fps: 1, repeat: 0 },
    kneel: { frames: [P({ crouch: 10, lean: 2, ra: [10, 12], la: [4, 14], weaponAng: 95, glow: true })], fps: 1, repeat: 0 },
    look: { frames: [P({ crouch: 10, lean: 0, ra: [10, 12], la: [4, 14], weaponAng: 95, glow: true, bob: -1 })], fps: 1, repeat: 0 },
  };
}

// ---------------------------------------------------------------- allies & villagers
function allySpec(kind: 'spearman' | 'archer' | 'shieldbearer' | 'captain'): HumSpec {
  const cap = kind === 'captain';
  return {
    fw: 32,
    fh: cap ? 36 : 32,
    legLen: cap ? 8 : 7,
    torsoH: cap ? 10 : 8,
    tw: cap ? 8 : 7,
    headR: 4,
    body: kind === 'archer' ? 0x3f6a3a : 0xb07a30,
    bodyDark: kind === 'archer' ? 0x2a4a28 : 0x7a5220,
    legs: 0x4a3a2a,
    legsDark: 0x32281c,
    boots: 0x2a1c12,
    arm: kind === 'archer' ? 0x3f6a3a : 0xb07a30,
    hand: 0xc68a5a,
    outline: 0x6a4c10,
    weapon: kind === 'spearman' ? 'spear' : kind === 'archer' ? 'bow' : 'shortSword',
    back: cap
      ? (pc, j) => {
          const t = j.pose.t ?? 0;
          pc.poly([[j.cx - 3, j.shY], [j.cx + 2, j.shY], [j.cx - 2, j.hipY + 4], [j.cx - 8 - (t % 2), j.hipY + 3]], PAL.scarf);
        }
      : undefined,
    torso(pc, j, x0, y0) {
      pc.rect(x0, j.hipY - 1, 8, 1, PAL.gold);
      pc.rect(x0 + 2, y0 + 2, 3, 3, kind === 'archer' ? 0x2a4a28 : PAL.gold);
    },
    head(pc, j) {
      const { headX: hx, headY: hy } = j;
      pc.disc(hx, hy, 4, 0xc68a5a);
      if (kind === 'archer') {
        pc.disc(hx - 1, hy - 1, 4, 0x2a4a28);
        pc.rect(hx, hy - 1, 4, 4, 0xc68a5a);
      } else {
        pc.rect(hx - 4, hy - 4, 8, 3, 0xaab4c0);
        pc.rect(hx - 4, hy - 2, 2, 3, 0x8a94a0);
        pc.set(hx, hy - 5, PAL.gold);
      }
      pc.set(hx + 2, hy, O);
      pc.rect(hx + 1, hy + 2, 3, 1, 0x3a2a1a);
      if (cap) {
        pc.line(hx - 1, hy - 5, hx - 5, hy - 8, PAL.scarf, 2);
        pc.set(hx - 6, hy - 8, PAL.scarf);
      }
    },
    front:
      kind === 'shieldbearer'
        ? (pc, j) => {
            const x = j.cx + (j.pose.lean ?? 0) + 4;
            pc.rect(x, j.shY, 5, 12, 0x8a94a0);
            pc.rect(x + 1, j.shY + 1, 3, 10, 0xaab4c0);
            pc.rect(x + 2, j.shY + 4, 1, 4, PAL.gold);
            pc.rect(x + 1, j.shY + 5, 3, 1, PAL.gold);
          }
        : undefined,
  };
}

export function allySheet(kind: 'spearman' | 'archer' | 'shieldbearer' | 'captain'): SheetSpec {
  const spec = allySpec(kind);
  const rest = kind === 'spearman' ? -70 : kind === 'archer' ? 95 : 110;
  const restRa: [number, number] = kind === 'spearman' ? [2, 3] : [1, 6];
  const P = (p: Pose) => humanoid(spec, { weaponAng: rest, ra: restRa, ...p });
  const attack =
    kind === 'archer'
      ? [P({ ra: [7, -1], la: [2, -1], weaponAng: -8, pull: true }), P({ ra: [7, -1], la: [-2, 0], weaponAng: -8 })]
      : kind === 'spearman'
        ? [P({ ra: [-1, 2], weaponAng: 0, lean: -1 }), P({ ra: [8, 1], weaponAng: 0, lean: 2, lf: [3, 0], rf: [-3, 0] })]
        : [P({ ra: [-1, -6], weaponAng: -120 }), P({ ra: [7, 1], weaponAng: 10, lean: 1, lf: [3, 0], rf: [-3, 0] })];
  return {
    idle: { frames: [P({ t: 0 }), P({ bob: 1, t: 1 })], fps: 3, repeat: -1 },
    walk: { frames: [0, 1, 2, 3].map((i) => P(runPose(i, 4, 3, { ra: restRa, t: i }))), fps: 9, repeat: -1 },
    attack: { frames: attack, fps: 8, repeat: 0 },
    hurt: { frames: [P({ lean: -2 })], fps: 1, repeat: 0 },
  };
}

const VILLAGER_COLORS = [
  { body: 0xe8d9b0, dark: 0xb8a880, wrap: 0xe07a30 },
  { body: 0xd88a6a, dark: 0xa86a4a, wrap: 0xe8d9b0 },
  { body: 0x8ab0d8, dark: 0x6a8ab0, wrap: 0xd8b040 },
];
export function villagerSheet(variant: number): SheetSpec {
  const col = VILLAGER_COLORS[variant % VILLAGER_COLORS.length]!;
  const spec: HumSpec = {
    fw: 26,
    fh: 30,
    legLen: 6,
    torsoH: 8,
    tw: 7,
    headR: 3.5,
    body: col.body,
    bodyDark: col.dark,
    legs: 0xf0ead8,
    legsDark: 0xc8c0a8,
    boots: 0x6a4a2a,
    arm: col.body,
    hand: 0xc68a5a,
    head(pc, j) {
      const { headX: hx, headY: hy } = j;
      pc.disc(hx, hy, 3.5, 0xc68a5a);
      pc.rect(hx - 3, hy - 4, 7, 2, col.wrap);
      pc.set(hx - 4, hy - 3, col.wrap);
      pc.set(hx + 2, hy, O);
      pc.rect(hx - 3, hy - 1, 2, 3, 0x2a1a10);
    },
  };
  const P = (p: Pose) => humanoid(spec, p);
  return {
    captive: { frames: [P({ crouch: 5, la: [-3, 4], ra: [-4, 5], lean: -1 }), P({ crouch: 5, la: [-3, 4], ra: [-4, 5], lean: -1, bob: 1 })], fps: 2, repeat: -1 },
    wave: { frames: [P({ ra: [3, -7] }), P({ ra: [5, -6] })], fps: 5, repeat: -1 },
    run: { frames: [0, 1, 2, 3].map((i) => P(runPose(i, 4, 3))), fps: 10, repeat: -1 },
    cheer: { frames: [P({ ra: [2, -8], la: [-2, -8] }), P({ ra: [2, -8], la: [-2, -8], bob: -2 })], fps: 4, repeat: -1 },
  };
}

// ---------------------------------------------------------------- props
export function cageFrames(): PixelCanvas[] {
  const make = (broken: boolean) => {
    const pc = new PixelCanvas(26, 34);
    const wood = 0x6a4028;
    const dark = 0x4a2a18;
    pc.rect(1, 30, 24, 3, dark);
    pc.rect(1, 2, 24, 3, broken ? -1 : dark);
    if (!broken) for (let x = 2; x < 25; x += 4) pc.rect(x, 4, 2, 27, wood);
    else {
      pc.line(3, 30, 0, 18, wood, 2);
      pc.line(22, 30, 25, 20, wood, 2);
      pc.line(10, 31, 8, 26, wood, 2);
      pc.rect(1, 2, 8, 3, dark);
    }
    pc.rect(11, 14, 4, 4, broken ? -1 : 0x9aa3b5);
    pc.outline(O);
    return pc;
  };
  return [make(false), make(true)];
}

export function bannerFrames(liberated: boolean): PixelCanvas[] {
  const frames: PixelCanvas[] = [];
  for (let f = 0; f < 3; f++) {
    const pc = new PixelCanvas(28, 64);
    pc.rect(4, 2, 2, 60, 0x4a3020);
    pc.rect(2, 60, 6, 3, 0x3a2418);
    pc.rect(3, 1, 4, 2, liberated ? PAL.gold : 0x9aa3b5);
    const flag = liberated ? PAL.cleanseGold : 0x4a1d6a;
    const flagD = liberated ? PAL.gold : 0x2e1044;
    for (let y = 0; y < 26; y++) {
      const wave = Math.round(Math.sin(y * 0.3 + f * 2) * 1);
      const w = 18 - (liberated ? 0 : y > 20 ? (y + f) % 3 : 0);
      pc.rect(6, 5 + y, w + wave, 1, y % 8 === 7 ? flagD : flag);
    }
    // emblem
    if (liberated) {
      pc.disc(15, 16, 4, PAL.scarf);
      for (let a = 0; a < 8; a++) pc.set(15 + Math.round(Math.cos(a * 0.785) * 6), 16 + Math.round(Math.sin(a * 0.785) * 6), PAL.scarf);
    } else {
      pc.disc(15, 15, 4, BONE);
      pc.rect(13, 14, 2, 2, O);
      pc.rect(16, 14, 2, 2, O);
      pc.set(15, 17, O);
      pc.rect(13, 19, 5, 2, BONE);
      pc.set(14, 14, PAL.ruinGlow);
      pc.set(17, 14, PAL.ruinGlow);
    }
    // tattered bottom
    if (!liberated) for (let x = 6; x < 24; x += 3) pc.set(x + (f % 2), 31, -1);
    pc.outline(O);
    frames.push(pc);
  }
  return frames;
}

export function shrineFrames(): PixelCanvas[] {
  const make = (active: boolean, flick: number) => {
    const pc = new PixelCanvas(34, 44);
    const stone = active ? 0x9a8f86 : 0x6a6470;
    const stoneD = active ? 0x6f665f : 0x4a4452;
    pc.rect(2, 38, 30, 5, stoneD);
    pc.rect(5, 34, 24, 4, stone);
    pc.rect(9, 14, 16, 20, stone);
    pc.rect(9, 14, 4, 20, stoneD);
    pc.rect(13, 20, 8, 12, 0x2a2030);
    pc.poly([[4, 14], [30, 14], [24, 6], [10, 6]], active ? 0xa8402a : 0x5a4a50);
    pc.rect(15, 1, 4, 5, active ? PAL.gold : 0x6a6470);
    pc.rect(6, 13, 22, 2, active ? PAL.gold : stoneD);
    // lamp bowl
    pc.rect(14, 29, 6, 2, active ? PAL.gold : 0x5a5060);
    if (active) {
      pc.rect(16, 25 - flick, 2, 4 + flick, PAL.ember);
      pc.set(16, 24 - flick, 0xffe28a);
      pc.set(17, 26, 0xffffff);
      pc.set(12, 18, 0xffe28a);
      pc.set(22, 17, 0xffe28a);
    }
    // rune on base
    for (let x = 8; x < 27; x += 4) pc.set(x, 36, active ? PAL.cleanseGold : PAL.ruinViolet);
    pc.outline(O);
    return pc;
  };
  return [make(false, 0), make(true, 0), make(true, 1)];
}

export function chestFrames(): PixelCanvas[] {
  const make = (open: boolean) => {
    const pc = new PixelCanvas(20, 18);
    const wood = 0x8a5a2b;
    const dark = 0x5a3a1c;
    pc.rect(1, 8, 18, 9, wood);
    pc.rect(1, 12, 18, 1, dark);
    pc.rect(1, 8, 2, 9, PAL.gold);
    pc.rect(17, 8, 2, 9, PAL.gold);
    if (open) {
      pc.rect(3, 6, 14, 3, 0xffd25a);
      pc.set(6, 5, 0xffffff);
      pc.set(12, 5, 0xffe28a);
      pc.rect(1, 1, 18, 4, dark);
      pc.rect(1, 1, 18, 1, PAL.gold);
    } else {
      pc.rect(1, 3, 18, 5, wood);
      pc.rect(1, 3, 18, 1, dark);
      pc.rect(8, 7, 4, 4, PAL.gold);
      pc.set(9, 8, O);
    }
    pc.outline(O);
    return pc;
  };
  return [make(false), make(true)];
}

export function gateFrame(): PixelCanvas {
  const pc = new PixelCanvas(14, 120);
  pc.rect(0, 0, 14, 120, 0x3a2418);
  for (let x = 2; x < 13; x += 4) pc.rect(x, 0, 2, 120, 0x5a5a6a);
  for (let y = 6; y < 120; y += 14) pc.rect(0, y, 14, 2, 0x4a4a5a);
  for (let y = 116; y < 120; y++) for (let x = 2; x < 13; x += 4) pc.set(x, y + 1, -1);
  for (let y = 10; y < 120; y += 22) pc.set(7, y, PAL.ruinGlow);
  pc.outline(O);
  return pc;
}

export function lampFrames(): PixelCanvas[] {
  return [0, 1].map((f) => {
    const pc = new PixelCanvas(12, 44);
    pc.rect(5, 8, 2, 35, 0x3a3040);
    pc.rect(3, 42, 6, 2, 0x2a2030);
    pc.rect(3, 3, 6, 6, 0x2a2030);
    pc.rect(4, 4, 4, 4, f ? 0xffd25a : PAL.ember);
    pc.set(5, 5, 0xffffff);
    pc.rect(2, 2, 8, 1, 0x3a3040);
    pc.outline(O);
    return pc;
  });
}

export function torchFrames(): PixelCanvas[] {
  return [0, 1, 2].map((f) => {
    const pc = new PixelCanvas(10, 26);
    pc.rect(4, 10, 2, 16, 0x5a3a28);
    pc.rect(3, 9, 4, 2, 0x3a2418);
    const h = [5, 6, 4][f]!;
    pc.rect(3, 9 - h, 4, h, PAL.ember);
    pc.rect(4, 8 - h + (f % 2), 2, h - 1, 0xffd25a);
    pc.set(4 + (f % 2), 9 - h - 1, 0xffe28a);
    pc.outline(O);
    return pc;
  });
}

function roofTiles(pc: PixelCanvas, x0: number, y0: number, w: number, h: number, col: number, colD: number): void {
  for (let y = 0; y < h; y++) {
    const inset = Math.round((y / h) * -3);
    for (let x = inset; x < w - inset; x++) {
      const c = (x + (y % 2) * 2) % 4 === 0 || y % 3 === 2 ? colD : col;
      pc.set(x0 + x, y0 + y, c);
    }
  }
}

export function houseFrame(safe = false): PixelCanvas {
  const pc = new PixelCanvas(84, 66);
  const wall = 0xe0d0b0;
  const wallD = 0xb8a888;
  pc.rect(8, 30, 68, 34, wall);
  pc.rect(8, 30, 6, 34, wallD);
  pc.rect(6, 62, 72, 3, 0x6a5040);
  // pillars
  for (const x of [12, 38, 70]) pc.rect(x, 30, 3, 32, 0x6a4028);
  // Kerala two-tier sloped roof with upturned eaves
  pc.poly([[20, 6], [64, 6], [84, 30], [0, 30]], 0xa8402a);
  roofTiles(pc, 4, 16, 76, 14, 0xa8402a, 0x7a2a1a);
  pc.poly([[28, 0], [56, 0], [66, 12], [18, 12]], 0x8a3020);
  pc.set(0, 28, 0xa8402a);
  pc.set(83, 28, 0xa8402a);
  pc.rect(40, 0, 4, 2, PAL.gold);
  // door + window
  pc.rect(46, 40, 12, 22, safe ? 0xffc868 : 0x3a2418);
  if (safe) pc.rect(48, 42, 8, 18, 0xffe2a0);
  pc.rect(20, 40, 10, 8, 0x3a2418);
  pc.rect(24, 40, 2, 8, 0x6a4028);
  pc.rect(20, 43, 10, 1, 0x6a4028);
  pc.outline(O);
  return pc;
}

export function templeFrame(): PixelCanvas {
  const pc = new PixelCanvas(100, 92);
  const st = 0xa89888;
  const stD = 0x786a5e;
  pc.rect(4, 82, 92, 9, stD);
  pc.rect(10, 76, 80, 6, st);
  pc.rect(16, 40, 68, 36, st);
  for (const x of [18, 32, 62, 76]) {
    pc.rect(x, 40, 6, 36, 0xc8b8a8);
    pc.rect(x, 40, 2, 36, stD);
  }
  pc.rect(42, 50, 16, 26, 0x2a2030);
  pc.rect(47, 58, 6, 8, PAL.ember);
  pc.poly([[10, 40], [90, 40], [76, 26], [24, 26]], 0x8a3020);
  roofTiles(pc, 14, 30, 72, 10, 0x8a3020, 0x5a1a10);
  pc.poly([[24, 26], [76, 26], [64, 14], [36, 14]], 0xa8402a);
  pc.poly([[36, 14], [64, 14], [54, 5], [46, 5]], 0x8a3020);
  pc.rect(48, 0, 4, 6, PAL.gold);
  pc.set(49, -1, PAL.gold);
  pc.outline(O);
  return pc;
}

export function stallFrame(): PixelCanvas {
  const pc = new PixelCanvas(52, 40);
  pc.rect(4, 12, 2, 28, 0x5a3a28);
  pc.rect(46, 12, 2, 28, 0x5a3a28);
  for (let x = 0; x < 52; x++) pc.rect(x, 6 + (x % 8 < 4 ? 0 : 0), 1, 7, Math.floor(x / 6) % 2 ? 0xe8d9b0 : 0xc0392b);
  for (let x = 0; x < 52; x += 6) pc.rect(x, 13, 3, 2, Math.floor(x / 6) % 2 ? 0xe8d9b0 : 0xc0392b);
  pc.rect(6, 28, 40, 4, 0x8a5a2b);
  pc.rect(6, 32, 40, 8, 0x6a4028);
  for (let x = 9; x < 44; x += 5) pc.disc(x, 26, 1.8, [0xe07a30, 0xd8b040, 0x6fbf4a, 0xc0392b][(x / 5) % 4 | 0]!);
  pc.outline(O);
  return pc;
}

export function treeFrame(): PixelCanvas {
  const pc = new PixelCanvas(56, 70);
  pc.rect(24, 34, 8, 36, 0x4a3020);
  pc.rect(24, 34, 3, 36, 0x3a2418);
  pc.line(28, 44, 16, 36, 0x4a3020, 2);
  pc.line(28, 42, 40, 34, 0x4a3020, 2);
  for (const [x, y, r, c] of [
    [28, 22, 18, 0x2e5a2a],
    [14, 30, 11, 0x2e5a2a],
    [42, 30, 11, 0x2e5a2a],
    [24, 16, 10, 0x3f7a36],
    [36, 20, 8, 0x3f7a36],
    [20, 26, 6, 0x4f8a3a],
  ] as const)
    pc.disc(x, y, r, c);
  pc.outline(O);
  return pc;
}

export function pineFrame(): PixelCanvas {
  const pc = new PixelCanvas(32, 72);
  pc.rect(14, 56, 4, 16, 0x3a2418);
  for (let i = 0; i < 5; i++) {
    const y = 6 + i * 11;
    const w = 6 + i * 3;
    pc.poly([[16, y - 6], [16 + w, y + 10], [16 - w, y + 10]], i % 2 ? 0x1f4a2e : 0x2a5a36);
  }
  pc.outline(O);
  return pc;
}

export function fenceFrame(): PixelCanvas {
  const pc = new PixelCanvas(36, 14);
  for (let x = 1; x < 36; x += 7) pc.rect(x, 1, 2, 13, 0x6a4028);
  pc.rect(0, 4, 36, 2, 0x8a5a38);
  pc.rect(0, 9, 36, 2, 0x8a5a38);
  pc.outline(O);
  return pc;
}

export function hayFrame(): PixelCanvas {
  const pc = new PixelCanvas(24, 16);
  pc.ellipse(12, 9, 11, 7, 0xd8b040);
  for (let x = 3; x < 22; x += 3) pc.line(x, 4, x + 1, 14, 0xa88a30);
  pc.outline(O);
  return pc;
}

export function ruinTowerFrame(): PixelCanvas {
  const pc = new PixelCanvas(36, 90);
  const st = 0x4a3a66;
  const stD = 0x32264a;
  pc.poly([[6, 90], [30, 90], [27, 14], [9, 18]], st);
  pc.poly([[6, 90], [12, 90], [12, 17], [9, 18]], stD);
  // broken top
  pc.poly([[9, 18], [14, 8], [18, 14], [23, 4], [27, 14]], st);
  for (let y = 24; y < 86; y += 9) pc.rect(8, y, 20, 1, stD);
  // glowing runes
  const runes = [
    [17, 30],
    [15, 46],
    [20, 60],
    [16, 74],
  ];
  for (const [x, y] of runes) {
    pc.rect(x!, y!, 3, 1, PAL.ruinGlow);
    pc.rect(x! + 1, y! - 2, 1, 5, PAL.ruinGlow);
    pc.set(x! + 1, y!, 0xffffff);
  }
  pc.outline(O);
  return pc;
}

export function pillarFrame(): PixelCanvas {
  const pc = new PixelCanvas(18, 52);
  pc.rect(2, 46, 14, 6, 0x786a5e);
  pc.rect(4, 10, 10, 36, 0xa89888);
  pc.rect(4, 10, 3, 36, 0x786a5e);
  pc.poly([[4, 10], [14, 10], [13, 4], [9, 7], [6, 3]], 0xa89888);
  pc.rect(6, 22, 6, 1, 0x786a5e);
  pc.outline(O);
  return pc;
}

export function brokenGateFrame(): PixelCanvas {
  const pc = new PixelCanvas(48, 70);
  pc.rect(2, 10, 6, 60, 0x5a3a28);
  pc.rect(40, 18, 6, 52, 0x5a3a28);
  pc.poly([[0, 10], [30, 4], [30, 10], [0, 16]], 0x6a4028);
  pc.rect(8, 16, 10, 18, 0x4a1d6a);
  pc.rect(8, 34, 3, 3, 0x4a1d6a);
  pc.rect(14, 34, 3, 2, 0x4a1d6a);
  pc.disc(13, 23, 2, BONE);
  pc.outline(O);
  return pc;
}

// ---------------------------------------------------------------- pickups / projectiles
export function coinFrames(): PixelCanvas[] {
  return [4, 3, 1, 3].map((rx, i) => {
    const pc = new PixelCanvas(10, 10);
    pc.ellipse(5, 5, rx, 4, PAL.gold);
    if (rx > 2) pc.ellipse(5, 5, rx - 2, 2, 0xffd25a);
    if (i === 0) pc.set(4, 3, 0xffffff);
    pc.outline(O);
    return pc;
  });
}
export function heartFrame(): PixelCanvas {
  const pc = new PixelCanvas(11, 10);
  pc.disc(3, 3, 2.5, PAL.danger);
  pc.disc(7, 3, 2.5, PAL.danger);
  pc.poly([[0, 4], [10, 4], [5, 9]], PAL.danger);
  pc.set(2, 2, 0xffffff);
  pc.outline(O);
  return pc;
}
export function pranaOrbFrame(): PixelCanvas {
  const pc = new PixelCanvas(10, 10);
  pc.disc(5, 5, 3.5, PAL.prana);
  pc.disc(5, 5, 2, 0x9fe6ff);
  pc.set(4, 3, 0xffffff);
  pc.outline(O);
  return pc;
}
export function arrowBundleFrame(): PixelCanvas {
  const pc = new PixelCanvas(12, 12);
  for (let i = 0; i < 3; i++) {
    pc.line(2 + i * 2, 11, 5 + i * 2, 2, 0x8a5a2b);
    pc.set(5 + i * 2, 1, 0xdfe4ee);
    pc.set(2 + i * 2, 11, 0xe8e0d0);
  }
  pc.rect(2, 7, 8, 2, PAL.scarf);
  pc.outline(O);
  return pc;
}
export function arrowFrame(bone = false): PixelCanvas {
  const pc = new PixelCanvas(15, 5);
  pc.rect(2, 2, 10, 1, bone ? BONE : 0x8a5a2b);
  pc.rect(12, 1, 2, 3, bone ? 0x9d9682 : 0xdfe4ee);
  pc.set(14, 2, bone ? 0x9d9682 : 0xffffff);
  pc.rect(0, 1, 3, 1, bone ? PAL.ruinGlow : 0xe8e0d0);
  pc.rect(0, 3, 3, 1, bone ? PAL.ruinGlow : 0xe8e0d0);
  pc.outline(O);
  return pc;
}
export function orbFrames(core: number, rim: number, r = 4): PixelCanvas[] {
  return [0, 1].map((f) => {
    const s = Math.ceil(r * 2 + 4);
    const pc = new PixelCanvas(s, s);
    const c = s / 2 - 0.5;
    pc.disc(c, c, r, rim);
    pc.disc(c, c, r - 1.5 - f * 0.5, core);
    pc.set(c - 1, c - 1, 0xffffff);
    pc.outline(O);
    return pc;
  });
}
export function rainArrowFrame(): PixelCanvas {
  const pc = new PixelCanvas(5, 16);
  pc.rect(2, 0, 1, 12, 0x2a1030);
  pc.rect(1, 12, 3, 2, PAL.ruinGlow);
  pc.set(2, 15, 0xffffff);
  pc.outline(O);
  return pc;
}

// ---------------------------------------------------------------- FX
export function fxTextures(): Record<string, PixelCanvas> {
  const out: Record<string, PixelCanvas> = {};
  const dot = new PixelCanvas(1, 1);
  dot.set(0, 0, 0xffffff);
  out.fx_px = dot;
  const spark = new PixelCanvas(7, 7);
  spark.line(3, 0, 3, 6, 0xffffff);
  spark.line(0, 3, 6, 3, 0xffffff);
  spark.set(3, 3, 0xffffff);
  out.fx_spark = spark;
  const puff = new PixelCanvas(10, 10);
  puff.disc(5, 5, 4, 0xffffff);
  out.fx_puff = puff;
  // slash crescent (drawn facing right)
  const slash = new PixelCanvas(40, 40);
  for (let a = -80; a <= 80; a += 2) {
    const t = 1 - Math.abs(a) / 80;
    const r0 = 16;
    const th = 1 + Math.round(t * 4);
    for (let k = 0; k < th; k++) slash.set(20 + Math.cos(rad(a)) * (r0 + k), 20 + Math.sin(rad(a)) * (r0 + k), k === th - 1 ? 0xcfe8ff : 0xffffff);
  }
  out.fx_slash = slash;
  const ring = new PixelCanvas(34, 34);
  ring.ring(16.5, 16.5, 15.5, 0xffffff, 2);
  out.fx_ring = ring;
  const glyph = new PixelCanvas(50, 50);
  glyph.ring(24.5, 24.5, 23, 0xffffff, 1);
  glyph.ring(24.5, 24.5, 17, 0xffffff, 1);
  for (let a = 0; a < 360; a += 45) {
    glyph.line(24.5 + Math.cos(rad(a)) * 17, 24.5 + Math.sin(rad(a)) * 17, 24.5 + Math.cos(rad(a + 135)) * 17, 24.5 + Math.sin(rad(a + 135)) * 17, 0xffffff);
  }
  out.fx_glyph = glyph;
  const crack = new PixelCanvas(40, 6);
  crack.line(0, 3, 10, 2, 0x1a1020);
  crack.line(10, 2, 18, 4, 0x1a1020);
  crack.line(18, 4, 28, 1, 0x1a1020);
  crack.line(28, 1, 39, 3, 0x1a1020);
  crack.line(14, 3, 16, 5, 0x1a1020);
  out.fx_crack = crack;
  const scorch = new PixelCanvas(30, 6);
  scorch.ellipse(15, 3, 14, 2.5, 0x1a1016);
  scorch.ellipse(15, 3, 8, 1.5, 0x3a1a10);
  out.fx_scorch = scorch;
  const shadow = new PixelCanvas(20, 6);
  shadow.ellipse(10, 3, 9, 2.5, 0x000000);
  out.fx_shadow = shadow;
  const shock = new PixelCanvas(20, 18);
  shock.poly([[0, 18], [6, 2], [10, 8], [14, 0], [20, 18]], 0xffffff);
  out.fx_shock = shock;
  const star = new PixelCanvas(9, 9);
  star.poly([[4.5, 0], [6, 3.5], [9, 3.5], [6.5, 5.5], [7.5, 9], [4.5, 7], [1.5, 9], [2.5, 5.5], [0, 3.5], [3, 3.5]], 0xffffff);
  out.fx_star = star;
  const rain = new PixelCanvas(1, 6);
  rain.rect(0, 0, 1, 6, 0xffffff);
  out.fx_rain = rain;
  const leaf = new PixelCanvas(3, 2);
  leaf.rect(0, 0, 3, 2, 0xffffff);
  out.fx_leaf = leaf;
  return out;
}

// ---------------------------------------------------------------- icons (12x12)
export function iconTextures(): Record<string, PixelCanvas> {
  const out: Record<string, PixelCanvas> = {};
  const I = () => new PixelCanvas(14, 14);
  const fin = (k: string, pc: PixelCanvas) => {
    pc.outline(O);
    out[k] = pc;
  };
  {
    const pc = I();
    pc.disc(4, 5, 2.6, PAL.danger).disc(9, 5, 2.6, PAL.danger).poly([[1, 6], [13, 6], [7, 12]], PAL.danger);
    pc.set(3, 4, 0xffffff);
    fin('icon_heart', pc);
  }
  {
    const pc = I();
    pc.ellipse(7, 7, 5, 5, PAL.gold).ellipse(7, 7, 3, 3, 0xffd25a);
    pc.rect(6, 5, 2, 4, PAL.gold);
    fin('icon_coin', pc);
  }
  {
    const pc = I();
    pc.line(2, 12, 11, 3, 0x8a5a2b).line(9, 2, 12, 2, 0xdfe4ee).line(12, 2, 12, 5, 0xdfe4ee);
    pc.line(1, 10, 3, 12, 0xe8e0d0);
    fin('icon_arrow', pc);
  }
  {
    const pc = I();
    pc.poly([[7, 1], [11, 8], [7, 12], [3, 8]], PAL.prana);
    pc.poly([[7, 4], [9, 8], [7, 10], [5, 8]], 0x9fe6ff);
    fin('icon_prana', pc);
  }
  {
    const pc = I();
    drawWeapon(pc, 4, 10, -45, 'sword');
    fin('icon_sword', pc);
  }
  {
    const pc = I();
    drawWeapon(pc, 8, 7, 0, 'bow', [3, 7]);
    fin('icon_bow', pc);
  }
  {
    const pc = I();
    drawWeapon(pc, 5, 9, -60, 'staff');
    fin('icon_staff', pc);
  }
  {
    const pc = I();
    pc.rect(3, 1, 1, 12, 0x6a4028).rect(4, 1, 8, 6, PAL.cleanseGold).rect(5, 3, 3, 2, PAL.scarf);
    fin('icon_rally', pc);
  }
  {
    const pc = I();
    pc.disc(7, 4, 2.5, 0xc68a5a).rect(4, 7, 7, 6, 0xe8d9b0).rect(4, 2, 6, 1, 0xe07a30);
    fin('icon_captive', pc);
  }
  {
    const pc = I();
    pc.disc(7, 7, 5, 0x9aa3b5);
    for (let a = 0; a < 360; a += 45) pc.rect(7 + Math.cos(rad(a)) * 5.5 - 1, 7 + Math.sin(rad(a)) * 5.5 - 1, 2, 2, 0x9aa3b5);
    pc.disc(7, 7, 2, PAL.panel);
    fin('icon_gear', pc);
  }
  {
    const pc = I();
    pc.rect(2, 5, 3, 4, 0xe8e0d0).poly([[4, 5], [8, 1], [8, 13], [4, 9]], 0xe8e0d0);
    pc.line(10, 4, 11, 7, 0xe8e0d0).line(11, 7, 10, 10, 0xe8e0d0);
    fin('icon_speaker', pc);
  }
  {
    const pc = I();
    pc.rect(2, 5, 3, 4, 0x8a8494).poly([[4, 5], [8, 1], [8, 13], [4, 9]], 0x8a8494);
    pc.line(9, 4, 12, 9, PAL.danger).line(12, 4, 9, 9, PAL.danger);
    fin('icon_mute', pc);
  }
  {
    const pc = I();
    pc.poly([[7, 0], [9, 5], [13, 5], [10, 8], [11, 13], [7, 10], [3, 13], [4, 8], [1, 5], [5, 5]], PAL.cleanseGold);
    pc.set(6, 4, 0xffffff);
    fin('icon_star', pc);
  }
  {
    const pc = I();
    pc.poly([[7, 0], [9, 5], [13, 5], [10, 8], [11, 13], [7, 10], [3, 13], [4, 8], [1, 5], [5, 5]], 0x3a3450);
    fin('icon_starEmpty', pc);
  }
  {
    const pc = I();
    pc.rect(1, 5, 12, 7, 0x8a5a2b).rect(1, 3, 12, 3, 0x5a3a1c).rect(6, 5, 2, 3, PAL.gold);
    fin('icon_chest', pc);
  }
  {
    const pc = I();
    pc.disc(7, 6, 4.5, BONE).rect(4, 5, 2, 2, O).rect(8, 5, 2, 2, O).rect(5, 10, 4, 3, BONE);
    fin('icon_skull', pc);
  }
  {
    const pc = I();
    pc.poly([[2, 2], [12, 2], [12, 7], [7, 13], [2, 7]], 0x9aa3b5).poly([[4, 4], [10, 4], [10, 7], [7, 11], [4, 7]], PAL.gold);
    fin('icon_shield', pc);
  }
  {
    const pc = I();
    pc.poly([[8, 0], [3, 7], [7, 7], [5, 13], [11, 5], [7, 5]], 0xffe28a);
    fin('icon_bolt', pc);
  }
  {
    const pc = I();
    pc.disc(7, 7, 5, PAL.ruinViolet).disc(7, 7, 3, PAL.ruinGlow);
    fin('icon_slow', pc);
  }
  {
    const pc = I();
    pc.disc(7, 5, 3, PAL.skin).rect(4, 8, 6, 5, PAL.tunic).rect(4, 7, 6, 1, PAL.scarf);
    pc.disc(7, 4, 3.2, PAL.hood).rect(7, 4, 3, 3, PAL.skin);
    fin('icon_hero', pc);
  }
  return out;
}

// ---------------------------------------------------------------- tiles
export function tileTextures(): Record<string, PixelCanvas> {
  const out: Record<string, PixelCanvas> = {};
  const grassTop = new PixelCanvas(16, 8);
  const dirt = new PixelCanvas(16, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const n = hash2(x, y, 3);
      dirt.set(x, y, n > 0.9 ? 0x6a4a30 : n < 0.08 ? 0x3a2418 : y % 8 === 0 && n > 0.5 ? 0x48301e : 0x543822);
    }
  for (let x = 0; x < 16; x++) {
    const h = 2 + Math.round(hash2(x, 0, 9) * 2);
    for (let y = 0; y < 8; y++) {
      if (y === 0) grassTop.set(x, y, hash2(x, 1, 5) > 0.5 ? O : 0x6aa84a);
      else if (y < h) grassTop.set(x, y, y === 1 ? 0x6aa84a : 0x4f8a3a);
      else if (y === h) grassTop.set(x, y, 0x3a6e2c);
      else grassTop.set(x, y, hash2(x, y, 3) > 0.85 ? 0x6a4a30 : 0x543822);
    }
    if (hash2(x, 2, 7) > 0.7) grassTop.set(x, 0, 0x7ab85a);
  }
  out.tile_dirt = dirt;
  out.tile_grass = grassTop;
  const stone = new PixelCanvas(16, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const brick = (y % 8 === 7) || ((x + (Math.floor(y / 8) % 2) * 8) % 16 === 15);
      stone.set(x, y, brick ? 0x4a4250 : hash2(x, y, 11) > 0.85 ? 0x7a7280 : 0x6a6270);
    }
  out.tile_stone = stone;
  const stoneTop = new PixelCanvas(16, 8);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 16; x++) stoneTop.set(x, y, y === 0 ? O : y === 1 ? 0x9a92a0 : y === 7 ? 0x4a4250 : hash2(x, y, 13) > 0.8 ? 0x8a8290 : 0x7a7280);
  out.tile_stoneTop = stoneTop;
  const plank = new PixelCanvas(16, 8);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 16; x++) plank.set(x, y, y === 0 || y === 7 ? O : y === 1 ? 0xa87a48 : x % 8 === 7 ? 0x5a3a1c : y === 6 ? 0x6a4428 : 0x8a5a2b);
  out.tile_plank = plank;
  const spikes = new PixelCanvas(16, 16);
  for (let i = 0; i < 4; i++) spikes.poly([[i * 4, 16], [i * 4 + 2, 3], [i * 4 + 4, 16]], 0x9aa3b5);
  for (let i = 0; i < 4; i++) spikes.set(i * 4 + 2, 4, 0xffffff);
  spikes.outline(O);
  out.tile_spikes = spikes;
  return out;
}

// ---------------------------------------------------------------- parallax
export function skyCanvas(w: number, h: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  const bands = [0x140d26, 0x1f1335, 0x2d1843, 0x45204f, 0x6a2b55, 0x94395a, 0xc2524f, 0xe07a4a, 0xf0a060];
  for (let y = 0; y < h; y++) {
    const t = Math.min(0.999, Math.pow(y / (h * 0.85), 1.3));
    const f = t * (bands.length - 1);
    const i = Math.floor(f);
    for (let x = 0; x < w; x++) {
      const dither = hash2(x, y, 21) < f - i ? 1 : 0;
      pc.set(x, y, bands[Math.min(bands.length - 1, i + dither)]!);
    }
  }
  for (let k = 0; k < 90; k++) {
    const x = Math.floor(hash2(k, 1, 31) * w);
    const y = Math.floor(hash2(k, 2, 31) * h * 0.45);
    pc.set(x, y, hash2(k, 3, 31) > 0.7 ? 0xffffff : 0xb8a8d8);
  }
  return pc;
}

/** Tileable silhouette layer: heights built from periodic sines so left/right edges match. */
export function ridgeCanvas(w: number, h: number, col: number, colHi: number, kind: 'mountain' | 'pines' | 'village'): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  const per = (x: number, k: number) => Math.sin((x / w) * Math.PI * 2 * k);
  for (let x = 0; x < w; x++) {
    let top: number;
    if (kind === 'mountain') top = h * 0.35 + per(x, 2) * 16 + per(x, 5) * 8 + per(x, 11) * 3;
    else top = h * 0.55 + per(x, 3) * 6 + per(x, 7) * 3;
    for (let y = Math.max(0, Math.floor(top)); y < h; y++) pc.set(x, y, y < top + 2 && kind === 'mountain' ? colHi : col);
  }
  if (kind === 'pines') {
    for (let i = 0; i < 26; i++) {
      const x = Math.floor((i / 26) * w + hash2(i, 1, 41) * 10);
      const th = 22 + Math.floor(hash2(i, 2, 41) * 22);
      const base = h * 0.6;
      for (let y = 0; y < th; y++) {
        const half = Math.floor((y / th) * 7) + 1;
        for (let dx = -half; dx <= half; dx++) pc.set((x + dx + w) % w, base - th + y, col);
      }
    }
  }
  if (kind === 'village') {
    for (let i = 0; i < 12; i++) {
      const x = Math.floor((i / 12) * w + hash2(i, 5, 43) * 16);
      const bw = 18 + Math.floor(hash2(i, 6, 43) * 14);
      const base = h * 0.62;
      const tower = i % 4 === 1;
      if (tower) {
        for (let y = base - 50; y < base; y++) for (let dx = 0; dx < 8; dx++) pc.set((x + dx) % w, y, col);
        pc.set((x + 3) % w, base - 36, colHi);
        pc.set((x + 4) % w, base - 22, colHi);
      } else {
        for (let y = 0; y < 10; y++) for (let dx = -y; dx < bw + y; dx++) pc.set((x + dx + w) % w, base - 22 + y, col);
        for (let y = base - 12; y < base; y++) for (let dx = 0; dx < bw; dx++) pc.set((x + dx) % w, y, col);
        pc.set((x + 5) % w, base - 7, colHi);
        pc.set((x + 6) % w, base - 7, colHi);
      }
    }
  }
  return pc;
}

export function nearCanvas(w: number, h: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  for (let i = 0; i < 14; i++) {
    const x = Math.floor((i / 14) * w + hash2(i, 1, 51) * 20);
    const th = 10 + Math.floor(hash2(i, 2, 51) * 18);
    for (let k = 0; k < 5; k++) {
      const bx = x + k * 2 - 4;
      pc.line(bx, h, bx + (k - 2) * 2, h - th + Math.abs(k - 2) * 3, 0x0e0a18);
    }
  }
  return pc;
}

export function noiseCanvas(size: number): PixelCanvas {
  const pc = new PixelCanvas(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const v = Math.floor(hash2(x, y, 77) * 255);
      pc.set(x, y, (v << 16) | (v << 8) | v);
    }
  return pc;
}
