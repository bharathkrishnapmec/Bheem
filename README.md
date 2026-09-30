# BHEEM — Liberate the Village

A 2D side-scrolling action-platformer brawler built with Phaser 3 + TypeScript.
Fight through four occupied districts — Gate & Outskirts, Market Street, Temple Hill, Chieftain's Hall —
rescue villagers, tear down the Asura banners, then face **Kaalasura**.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/ (static, relative paths)
npx vite preview   # serve the build
```

Requires a WebGL-capable browser.

## Controls

| Action | Keyboard / mouse | Gamepad |
|---|---|---|
| Move | A / D (or arrows) | Left stick |
| Jump | Space / W / Up | A |
| Crouch / drop-through | S (+ Space) | Stick down (+ A) |
| Attack (hold to charge bow / Thunderclap) | J / left click | X / RT |
| Dash | Shift | B / RB |
| Weapons | 1 / 2 / 3, Q or wheel to cycle | D-pad left/up/right, LB |
| Summon squad | R | LT |
| Interact (hold) | E | Y |
| Pause | Esc / P | Start |
| Debug overlay | F3 | — |

All keys can be rebound in Settings.

## Project layout

```
src/config     balance.ts (all tuning), gameConfig, palette, strings
src/core       events, store, save, RNG, time controller
src/logic      pure game rules (damage, economy, loot, summon, boss, district)
src/systems    combat, statuses, targeting, tokens, spawns, summons, districts, loot
src/entities   player, enemies, allies, boss, projectiles, world objects
src/fx         FX, camera director, death FX, parallax
src/scenes     Boot, Preload, MainMenu, Settings, Game, UI, Pause, GameOver, Victory, Shrine
src/assets     procedural pixel art, pixel font, asset manifest
src/level      level schema, reachability, village.level.json
tests/unit     Vitest   ·   tests/e2e  Playwright
```

## Art

All art is generated procedurally at boot. To use a licensed sprite pack instead, set `ART_STYLE` in
`src/config/gameConfig.ts` and register textures in `src/assets/manifest.ts` using the same keys.
See `docs/DECISIONS.md` and `docs/CREDITS.md`.
