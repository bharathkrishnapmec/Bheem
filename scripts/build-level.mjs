// Authoring helper: generates src/level/village.level.json (the data the game consumes).
// Run: node scripts/build-level.mjs
import { writeFileSync } from 'node:fs';

const G = 1040; // ground top
const H = 1200;
const W = 10400;
const solids = [];
const oneWays = [];
const hazards = [];
const ground = (x0, x1, y = G) => solids.push({ x: x0, y, w: x1 - x0, h: H - y });
const plat = (x, y, w) => oneWays.push({ x, y, w, h: 16 });

// Boundaries
solids.push({ x: -40, y: 0, w: 40, h: H });
solids.push({ x: W, y: 0, w: 40, h: H });
// Ground with two small spike pits
ground(0, 1480);
ground(1480, 1560, 1140);
hazards.push({ x: 1480, y: 1110, w: 80, h: 30 });
ground(1560, 3700);
ground(3700, 3780, 1140);
hazards.push({ x: 3700, y: 1110, w: 80, h: 30 });
ground(3780, 5200);
// Temple Hill stairs up (10 steps x 24px) to plateau at 800
const stepUp = [];
for (let i = 0; i < 10; i++) {
  const y = G - 24 * (i + 1);
  ground(5200 + i * 48, 5200 + (i + 1) * 48, y);
  stepUp.push({ x: 5200 + i * 48 + 24, y });
}
const PL = G - 240; // 800
ground(5680, 6900, PL);
// stairs down
for (let i = 0; i < 10; i++) {
  const y = PL + 24 * (i + 1);
  ground(6900 + i * 28, 6900 + (i + 1) * 28, y);
}
ground(7180, W);

// One-way platforms
// D1
plat(700, 960, 160);
plat(1150, 960, 120);
plat(1260, 880, 130);
plat(2060, 960, 180);
// D2 market rooftops
plat(2750, 960, 150);
plat(2950, 880, 150);
plat(3150, 800, 200);
plat(3420, 800, 200);
plat(3680, 880, 170);
plat(3900, 800, 140);
plat(4020, 720, 170);
plat(4250, 960, 130);
// D3 temple plateau levels
plat(5880, 720, 200);
plat(6120, 640, 200);
plat(6380, 720, 160);
plat(6600, 640, 160);
// D4 hall
plat(7880, 960, 220);
plat(8100, 880, 140);
// Boss arena side platforms
plat(9150, 945, 180);
plat(10020, 945, 180);

const sp = (type, x, y = G, extra = {}) => ({ type, x, y, ...extra });

const districts = [
  {
    id: 'gate',
    name: 'Gate & Outskirts',
    bounds: { x0: 0, x1: 2400 },
    startTrigger: { x: 480, y: 0, w: 60, h: H },
    exitGate: { x: 2388, y: G, h: 240 },
    shrine: { x: 230, y: G },
    banner: { x: 2250, y: G, hp: 150 },
    captives: [
      { x: 930, y: G },
      { x: 1760, y: G, guarded: true },
      { x: 2150, y: 960 },
    ],
    chests: [{ x: 1330, y: 880, loot: { coins: 32 } }],
    waves: [
      { id: '1a', trigger: 'onEnter', requiredToClear: true, spawns: [sp('raider', 1000), sp('raider', 1080), sp('raider', 1150, G, { delayMs: 600 })] },
      { id: '1b', trigger: { afterWave: '1a' }, requiredToClear: true, spawns: [sp('raider', 1350), sp('raider', 1420), sp('boneArcher', 1300, 880)] },
      { id: '1c', trigger: { x: 1640 }, requiredToClear: true, spawns: [sp('raider', 1900), sp('raider', 1980), sp('raider', 1600, G, { delayMs: 500 }), sp('raider', 2050, G, { delayMs: 900 })] },
      { id: '1d', trigger: { afterWave: '1c' }, requiredToClear: true, spawns: [sp('boneArcher', 2150, 960), sp('boneArcher', 2300), sp('raider', 2000), sp('raider', 2080), sp('raider', 1700, G, { delayMs: 800 })] },
    ],
    ambient: [
      { type: 'brokenGate', x: 60, y: G },
      { type: 'torch', x: 400, y: G },
      { type: 'hay', x: 620, y: G },
      { type: 'fence', x: 760, y: G },
      { type: 'tree', x: 880, y: G },
      { type: 'house', x: 1080, y: G },
      { type: 'safehouse', x: 1180, y: G },
      { type: 'torch', x: 1440, y: G },
      { type: 'hay', x: 1650, y: G },
      { type: 'house', x: 1900, y: G },
      { type: 'safehouse', x: 1950, y: G },
      { type: 'lamp', x: 2200, y: G },
      { type: 'tree', x: 2330, y: G },
    ],
    weather: 'none',
    cameraVertical: false,
  },
  {
    id: 'market',
    name: 'Market Street',
    bounds: { x0: 2400, x1: 4800 },
    startTrigger: { x: 2640, y: 0, w: 60, h: H },
    exitGate: { x: 4788, y: G, h: 240 },
    shrine: { x: 2520, y: G },
    banner: { x: 4640, y: G, hp: 150 },
    captives: [
      { x: 3020, y: G },
      { x: 3520, y: 800 },
      { x: 4330, y: G, guarded: true },
    ],
    chests: [{ x: 4110, y: 720, loot: { coins: 36 } }, { x: 2830, y: 960, loot: { health: 15, arrows: 8 } }],
    waves: [
      { id: '2a', trigger: 'onEnter', requiredToClear: true, spawns: [sp('raider', 3050), sp('raider', 3120), sp('mireHexer', 3350)] },
      { id: '2b', trigger: { afterWave: '2a' }, requiredToClear: true, spawns: [sp('skyCaller', 3600, G - 170), sp('boneArcher', 3240, 800), sp('boneArcher', 3500, 800)] },
      { id: '2c', trigger: { afterWave: '2b' }, requiredToClear: true, spawns: [sp('raider', 4000), sp('raider', 4080), sp('raider', 3850, G, { delayMs: 700 }), sp('mireHexer', 4300), sp('boneArcher', 4100, 720)] },
      { id: '2d', trigger: { afterWave: '2c' }, requiredToClear: true, spawns: [sp('brute', 4450, G, { elite: true })] },
    ],
    ambient: [
      { type: 'lamp', x: 2600, y: G },
      { type: 'stall', x: 2800, y: G },
      { type: 'house', x: 3000, y: G },
      { type: 'safehouse', x: 3080, y: G },
      { type: 'stall', x: 3300, y: G },
      { type: 'house', x: 3560, y: G },
      { type: 'lamp', x: 3880, y: G },
      { type: 'stall', x: 4100, y: G },
      { type: 'house', x: 4400, y: G },
      { type: 'safehouse', x: 4480, y: G },
      { type: 'torch', x: 4720, y: G },
    ],
    weather: 'rain',
    cameraVertical: true,
  },
  {
    id: 'temple',
    name: 'Temple Hill',
    bounds: { x0: 4800, x1: 7200 },
    startTrigger: { x: 5020, y: 0, w: 60, h: H },
    exitGate: { x: 7188, y: G, h: 240 },
    shrine: { x: 4920, y: G },
    banner: { x: 6820, y: PL, hp: 150 },
    captives: [
      { x: stepUp[6].x, y: stepUp[6].y },
      { x: 6250, y: PL },
      { x: 6200, y: 640, guarded: true },
    ],
    chests: [{ x: 6680, y: 640, loot: { coins: 40 } }],
    waves: [
      { id: '3a', trigger: 'onEnter', requiredToClear: true, spawns: [sp('brute', 5750, PL, { elite: true }), sp('brute', 6000, PL, { elite: true, delayMs: 4000 })] },
      { id: '3b', trigger: { afterWave: '3a' }, requiredToClear: true, spawns: [sp('skyCaller', 6100, PL - 170), sp('skyCaller', 6500, PL - 170, { delayMs: 1500 }), sp('mireHexer', 6300, PL), sp('mireHexer', 6650, PL)] },
      { id: '3c', trigger: { afterWave: '3b' }, requiredToClear: true, spawns: [sp('brute', 6600, PL, { elite: true }), sp('raider', 6400, PL), sp('raider', 6480, PL), sp('raider', 5800, PL, { delayMs: 800 }), sp('boneArcher', 6180, 640), sp('boneArcher', 5950, 720)] },
      { id: '3d', trigger: { afterWave: '3c' }, requiredToClear: true, spawns: [sp('brute', 6700, PL, { elite: true }), sp('skyCaller', 6400, PL - 170), sp('mireHexer', 6550, PL)] },
    ],
    ambient: [
      { type: 'pillar', x: 5080, y: G },
      { type: 'pine', x: 5150, y: G },
      { type: 'lamp', x: 5700, y: PL },
      { type: 'temple', x: 6000, y: PL },
      { type: 'ruinTower', x: 5800, y: PL },
      { type: 'safehouse', x: 6080, y: PL },
      { type: 'pillar', x: 6450, y: PL },
      { type: 'ruinTower', x: 6560, y: PL },
      { type: 'lamp', x: 6760, y: PL },
      { type: 'pine', x: 7100, y: G },
    ],
    weather: 'fog',
    cameraVertical: true,
  },
  {
    id: 'hall',
    name: "Chieftain's Hall",
    bounds: { x0: 7200, x1: 8800 },
    startTrigger: { x: 7440, y: 0, w: 60, h: H },
    exitGate: { x: 8598, y: G, h: 240 },
    shrine: { x: 7310, y: G },
    banner: { x: 8480, y: G, hp: 150 },
    captives: [
      { x: 7700, y: G },
      { x: 7990, y: 960 },
      { x: 8340, y: G, guarded: true },
    ],
    chests: [{ x: 8160, y: 880, loot: { coins: 30, health: 15 } }],
    waves: [
      { id: '4a', trigger: 'onEnter', requiredToClear: true, spawns: [sp('raider', 7800), sp('raider', 7880), sp('raider', 8000), sp('raider', 7600, G, { delayMs: 900 }), sp('boneArcher', 8150, 880), sp('boneArcher', 8250), sp('brute', 8300, G, { elite: true, delayMs: 1500 })] },
      { id: '4x', trigger: { x: 8230 }, requiredToClear: false, spawns: [sp('raider', 8450), sp('imp', 8400, G - 60), sp('imp', 8500, G - 60)] },
    ],
    ambient: [
      { type: 'torch', x: 7260, y: G },
      { type: 'ruinTower', x: 7500, y: G },
      { type: 'house', x: 7650, y: G },
      { type: 'safehouse', x: 7720, y: G },
      { type: 'torch', x: 8040, y: G },
      { type: 'ruinTower', x: 8300, y: G },
      { type: 'torch', x: 8560, y: G },
    ],
    weather: 'none',
    cameraVertical: false,
  },
];

const level = {
  width: W,
  height: H,
  groundY: G,
  playerStart: { x: 140, y: G },
  solids,
  oneWays,
  hazards,
  districts,
  bossArena: {
    x0: 8800,
    x1: W,
    trigger: { x: 8900, y: 0, w: 40, h: H },
    entryGate: { x: 8800, y: G, h: 300 },
    bossSpawn: { x: 9900, y: G },
    shrine: { x: 8700, y: G },
  },
  parallax: [
    { key: 'bg_sky', scrollFactor: 0.05, y: 0 },
    { key: 'bg_far', scrollFactor: 0.15, y: 250 },
    { key: 'bg_mid', scrollFactor: 0.4, y: 330 },
    { key: 'bg_near', scrollFactor: 1.15, y: 0 },
  ],
  lighting: {
    occupied: { tint: '#5a2a78', alpha: 0.28 },
    liberated: { tint: '#ffcc66', alpha: 0.06 },
    bossP3: { tint: '#a0101a', alpha: 0.3 },
  },
};

writeFileSync(new URL('../src/level/village.level.json', import.meta.url), JSON.stringify(level, null, 1));
console.info('level written:', solids.length, 'solids,', oneWays.length, 'one-ways');
