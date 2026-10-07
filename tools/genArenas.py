"""Generates src/level/arenas/*.level.json (Lava Forge, Sky Citadel). Re-run after editing; JSON is committed."""
import json, os
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'level', 'arenas')
os.makedirs(OUT, exist_ok=True)
R = lambda x, y, w, h: {'x': x, 'y': y, 'w': w, 'h': h}
P = lambda x, y: {'x': x, 'y': y}
LIGHT = {'occupied': {'tint': '#5a2a78', 'alpha': 0.2}, 'liberated': {'tint': '#ffcc66', 'alpha': 0.05}, 'bossP3': {'tint': '#a0101a', 'alpha': 0.3}}
PARALLAX = [{'key': 'bg_sky', 'scrollFactor': 0.05, 'y': 0}, {'key': 'bg_far', 'scrollFactor': 0.15, 'y': 250}]

def arena(w, h, spawn, boss):
    return {'x0': 0, 'x1': w, 'trigger': R(99999, 0, 40, h), 'entryGate': {'x': -200, 'y': spawn['y'], 'h': 300}, 'bossSpawn': boss, 'shrine': P(-400, spawn['y'])}

forge_spawn, forge_boss = P(780, 700), P(1040, 700)
forge = {
    'name': 'Lava Forge', 'arenaId': 'lava_forge', 'arenaType': 'arena', 'theme': 'forge',
    'width': 1800, 'height': 900, 'groundY': 700, 'cameraZoom': 1,
    'playerStart': forge_spawn, 'heroSpawn': forge_spawn, 'bossSpawn': forge_boss,
    'solids': [R(-40, 0, 40, 900), R(1800, 0, 40, 900), R(700, 700, 400, 200), R(120, 720, 300, 180), R(1380, 720, 300, 180)],
    'oneWays': [R(260, 450, 180, 16), R(1360, 450, 180, 16), R(810, 390, 180, 16)],
    'hazards': [], 'districts': [],
    'lavaZones': [R(0, 780, 1800, 120)],
    'crumblingPlatforms': [{'rect': R(460, 630, 150, 16), 'standMs': 600, 'shakeMs': 600, 'respawnMs': 4000},
                           {'rect': R(1190, 630, 150, 16), 'standMs': 600, 'shakeMs': 600, 'respawnMs': 4000}],
    'movingPlatforms': [{'rect': R(500, 540, 130, 16), 'path': 'sine-x', 'amplitude': 120, 'periodMs': 6000},
                        {'rect': R(1170, 540, 130, 16), 'path': 'sine-x', 'amplitude': 120, 'periodMs': 6000, 'phaseMs': 3000},
                        {'rect': R(835, 560, 130, 16), 'path': 'sine-y', 'amplitude': 80, 'periodMs': 5000}],
    'geysers': [{'x': 230, 'y': 720, 'periodMs': 5600, 'phaseOffsetMs': 0},
                {'x': 1570, 'y': 720, 'periodMs': 5600, 'phaseOffsetMs': 2800},
                {'x': 350, 'y': 450, 'periodMs': 5600, 'phaseOffsetMs': 1400}],
    'grappleAnchors': [P(560, 140), P(900, 110), P(1240, 140)],
    'safeAnchors': [P(900, 700), P(270, 720), P(1530, 720)],
    'bossArena': arena(1800, 900, forge_spawn, forge_boss),
    'parallax': PARALLAX,
    'lighting': {'occupied': {'tint': '#ff5a1a', 'alpha': 0.1}, 'liberated': {'tint': '#ff7a2a', 'alpha': 0.08}, 'bossP3': {'tint': '#c0100a', 'alpha': 0.28}},
}

sky_spawn, sky_boss = P(960, 1000), P(1240, 1000)
islands = [R(840, 1000, 520, 60), R(600, 920, 160, 30), R(1440, 920, 160, 30), R(340, 860, 180, 30), R(1680, 860, 180, 30), R(80, 780, 180, 30), R(1940, 780, 180, 30)]
sky = {
    'name': 'Sky Citadel', 'arenaId': 'sky_citadel', 'arenaType': 'arena', 'theme': 'sky', 'skyPreset': 'storm',
    'width': 2200, 'height': 1400, 'groundY': 1000, 'cameraZoom': 0.9,
    'playerStart': sky_spawn, 'heroSpawn': sky_spawn, 'bossSpawn': sky_boss,
    'solids': islands,
    'oneWays': [R(760, 560, 200, 16), R(1240, 560, 200, 16), R(980, 420, 240, 16), R(300, 480, 160, 16), R(1740, 480, 160, 16)],
    'hazards': [], 'districts': [],
    'movingPlatforms': [{'rect': R(640, 700, 140, 16), 'path': 'sine-x', 'amplitude': 120, 'periodMs': 8000},
                        {'rect': R(1420, 700, 140, 16), 'path': 'sine-x', 'amplitude': 120, 'periodMs': 8000, 'phaseMs': 4000}],
    'updrafts': [{'rect': R(880, 600, 60, 400), 'vy': -740, 'relockMs': 600}, {'rect': R(1260, 600, 60, 400), 'vy': -740, 'relockMs': 600},
                 {'rect': R(390, 520, 60, 340), 'vy': -740, 'relockMs': 600}, {'rect': R(1750, 520, 60, 340), 'vy': -740, 'relockMs': 600}],
    'voidZones': [{'rect': R(-200, 1250, 2600, 400), 'fallRespawnPoints': [P(1100, 1000), P(680, 920), P(1520, 920), P(430, 860), P(1770, 860)]}],
    'safeAnchors': [P(1100, 1000), P(680, 920), P(1520, 920)],
    'grappleAnchors': [],
    'bossArena': arena(2200, 1400, sky_spawn, sky_boss),
    'parallax': PARALLAX,
    'lighting': {'occupied': {'tint': '#3a2a6a', 'alpha': 0.15}, 'liberated': {'tint': '#ffd0a0', 'alpha': 0.06}, 'bossP3': {'tint': '#4a1a8a', 'alpha': 0.3}},
}
for name, data in (('lava_forge', forge), ('sky_citadel', sky)):
    with open(os.path.join(OUT, f'{name}.level.json'), 'w') as f:
        json.dump(data, f, indent=1)
        f.write('\n')
print('ok')
