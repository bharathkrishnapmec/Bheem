# RUINFALL: 60 Seconds to Save Emberhold

Design document for developers and AI coding agents.

- Stack: TypeScript (strict), Phaser 3 (target 3.90, minimum 3.60 for PostFX and the new particle API), Vite
- Genre: side-scrolling action-RPG "sorties" + small town hub + parchment world map
- Inspiration: Regions of Ruin (mood and structure only). All names, runes, maps, and art direction below are original.
- Numbers tagged `[tune]` live in `src/config/tuning.ts`. Never hardcode them in scenes.

---

## 1. Vision

The Ruin, a creeping purple corruption, is swallowing the Sundered Isle. The hamlet of Emberhold survives only because a hooded courier, **Bheem**, can outrun it. Every sortie into a region has a hard limit: **60 seconds** to fight through the ruins, reach the region's Pylon, and cleanse it before the Ruin arrives.

### Pillars
1. **Sixty seconds, always visible.** The timer is both a HUD element and a physical thing in the world (the Ruin Wall).
2. **Readable pixel art.** The hero silhouette and the red scarf must read instantly against dark, purple ruins.
3. **Warm vs. cursed.** Emberhold and cleansed regions are warm gold and blue. The Ruin is violet, black, and glowing runes.
4. **Juice everywhere.** Hits, pickups, and the final 10 seconds must feel loud.

### What we keep vs. what is ours

| Keep (genre language) | Ours (unique) |
|---|---|
| Side-view pixel art, ruined towers, pylons, floating runes | 60-second Ruin Clock with a visible advancing Ruin Wall |
| Parchment overworld map, town hub, status text, crit numbers | Hooded courier hero, time as a currency, sortie structure |
| Health described in words ("Perfect Health") | Star ratings by time left, Hearth Lamps as campaign lives |

---

## 2. Core Loop and the 60-Second Rule

```
Town (upgrade) -> World Map (pick region) -> 60s Sortie -> Result (stars, loot) -> Town
```

### Ruin Clock rules
- `RUN_TIME = 60.0` seconds `[tune]`. Countdown starts after a 3-2-1 beat.
- **Ruin Wall**: a wall of corruption starts at `x = -240` and advances to the level's end: `wallX = lerp(-240, levelEnd, elapsed / 60)`. Wall speed is about 56 to 88 px/s, always well below the hero's 160 px/s. Touching it = instant fail ("Consumed"). It punishes backtracking and dawdling.
- **Time gains** `[tune]`: Blue Potion +5s (pushes the wall back 350px), Bat kill +1s, Slime kill +0.5s, Critical hit +0.5s. Cap at 75s total.
- **Time loss**: taking a hit costs 1 heart AND 2s.
- **Win**: destroy/cleanse the region's Pylon before the clock hits 0.
- **Fail**: timer hits 0, hearts hit 0, or the wall touches Bheem. A Hearth Lamp goes out. Lose all 3 lamps = campaign over (New Run).
- **Stars**: 3 stars if time left >= 25s, 2 stars if >= 10s, else 1. Fail = 0.

### Pickup meanings (from the sprite sheet)

| Item | Effect |
|---|---|
| Coin | Currency (Embers). Spent in town. |
| Heart | Heals 1 heart (max 5). |
| Blue potion | +5s and pushes the Ruin Wall back. |
| Key | Opens a chest alcove or a gate. |
| Chest (closed/open) | Coins, potion, or a one-run boost. |
| Sword | Pickup: +1 damage for this sortie. Icon also used for the Forge. |
| Shield | Pickup: absorbs the next hit (no heart loss, no time loss). |
| Stars | Result screen rating. |

---

## 3. Character Design

### 3.1 Hero: Bheem, the Ruin Courier
- **Concept**: a small hooded runner who travels light. The silhouette is a pointed-hood blob on two quick legs, with a red scarf trailing behind.
- **Silhouette rules**: readable at 32x32. Hood = dark mass on top. Red headband/scarf = the only saturated red on screen. Use red as the hero's signature color across HUD, FX, and map cursor.
- **Personality through motion**: always leaning forward, fast feet, little pauses. Idle has a tiny breathing bob (procedural since there is one idle frame).

#### Palette (approximate, sampled by eye. Verify against the source file)

| Part | Hex |
|---|---|
| Outline | `#1E1B2E` |
| Hood (slate) | `#3A4062` |
| Tunic (blue) | `#2E6DB4` |
| Scarf / headband (red) | `#D8392B` |
| Skin | `#F0B088` |
| Belt / buckle (gold) | `#D9A23A` |
| Boots / gloves (brown) | `#6A4028` |

### 3.2 Sprite sheet -> atlas map

The uploaded sheet is laid out as grids. Re-export at native resolution with nearest-neighbor only (the preview is upscaled and carries a stock watermark). Target a **32x32** logical frame for hero, enemies, and items. Pack into a TexturePacker/Aseprite atlas JSON and load with `this.load.atlas`.

| Sheet region | Atlas keys | Notes |
|---|---|---|
| Top-left 4x2 block (8 frames) | `hero_run_00` ... `hero_run_07` | Run cycle, side view. |
| Top-middle 3 frames | `hero_jump_00` (takeoff), `hero_jump_01` (rise, arms up), `hero_jump_02` (fall, arms out) | Verify order visually. |
| Top-right single | `hero_idle_00` | Front-facing idle. Also used for Title and Result poses. |
| Coin (glowing), heart, potion, key | `item_coin`, `item_heart`, `item_potion`, `item_key` | Coin has a baked glow. Keep it. |
| Chests | `chest_closed`, `chest_open` | |
| Sword, shield | `item_sword`, `item_shield` | |
| D-pad, A/B, gear, speaker | `ui_dpad`, `ui_ab`, `ui_gear`, `ui_speaker` | Mobile touch controls and top-bar buttons. |
| Stars | `ui_star_full`, `ui_star_empty` | |
| Explosion, smoke x2, sparkle | `fx_explosion`, `fx_smoke_a`, `fx_smoke_b`, `fx_sparkle` | Single frames, animated with tweens/particles. |
| Green arc | `fx_hop_arc` | Slime hop telegraph. |
| Green slime x2 | `enemy_slime_00/01` | 2-frame squash/stretch. |
| Bat x2 | `enemy_bat_00/01` | 2-frame wing flap. |
| Empty cells (right grid) | reserved | Room for new art: attack, hurt, new enemies, Pylon. |

> Licensing: the provided image shows a stock-site watermark. Use a licensed copy of the pack, or redraw, before shipping anything public.

### 3.3 Hero animation set

| Anim key | Frames | FPS | Loop | Source |
|---|---|---|---|---|
| `hero_idle` | `hero_idle_00` + procedural bob (scaleY 1.00 to 1.03, 1.2 Hz) | n/a | yes | sheet |
| `hero_run` | run_00..07 | 12 | yes | sheet |
| `hero_jump_up` | jump_01 | n/a | hold | sheet |
| `hero_fall` | jump_02 | n/a | hold | sheet |
| `hero_takeoff` | jump_00 | n/a | once, 80ms | sheet |
| `hero_land` | idle + squash tween (scale 1.15x / 0.85y, 90ms) | n/a | once | procedural |
| `hero_attack` | **missing**: 3 frames to draw. Fallback: jump_01 pose + lunge tween (+6px, 80ms) + slash arc FX | 18 | once | new art |
| `hero_hurt` | jump_02 pose + white tint 60ms then red tint 120ms + knockback | n/a | once | procedural |
| `hero_interact` | jump_01 held (arms raised at the Pylon) | n/a | hold | sheet |
| `hero_die` | hurt pose, tint to violet, shrink + fade 600ms | n/a | once | procedural |

**Scarf trail (secondary animation)**: add 3 to 4 small red pixel sprites that follow the head with a 2-frame delay each (position history buffer). Their droop/lift follows velocity. This gives a sense of speed that the 8-frame cycle alone does not.

### 3.4 Movement and combat feel (`[tune]`)

| Parameter | Value |
|---|---|
| Run speed | 160 px/s, accel 1200, decel 1600 |
| Gravity | 900 |
| Jump velocity | -330 (about 60px high). Release early: `vy *= 0.5` |
| Coyote time / jump buffer | 100 ms / 120 ms |
| Max safe gap (generator) | 80 px (5 tiles) |
| Ice friction multiplier | 0.25 |
| Attack | Hitbox 28x20 in front, active 80 to 160 ms, cooldown 250 ms, dmg 1 (+ Forge upgrades) |
| Crit | 15% chance, x3 damage, shows red "CRITICAL HIT" |
| Hit-stop | 50 ms normal, 80 ms crit |
| Hearts | 5 |

Controls: A = jump, B = attack (maps to the A/B icon). Interact is automatic near the Pylon and chests.

**Health status line** (bottom-left, small cyan pixel text): Perfect Health (5), Scratched (4), Wounded (3), Badly Wounded (2), Barely Alive (1).

### 3.5 Enemies

| Enemy | HP | Behaviour | Telegraph | Reward |
|---|---|---|---|---|
| Green Slime | 2 | Patrols, hops every 1.2s, contact damage 1 | `fx_hop_arc` appears 0.3s before each hop | +0.5s |
| Bat | 1 | Wakes within 160px, sine swoop (amp 40px, speed 70) | Wing-flap speed-up + screech | +1s |
| Ruinblight variants | +1 | Same sprites tinted violet (`#7B3FE4` 50%) plus a faint glow. Appear from region 2 | Purple particle drip | x1.5 |
| **The Pylon** (region boss) | 12 / 16 / 20 / 26 / 34 by region | Stationary crystal. Shown with a world-space health bar labeled "PYLON". Spawns 2 bats every 6s. Lightning strike: a rune circle on the ground for 0.6s, then a bolt (1 dmg) | Rune circle + hum rising in pitch | Cleanse = win |

Pylon phases: (1) calm, spawns only. (2) below 60% HP: lightning strikes begin. (3) below 25% HP: strikes double, runes spin faster, screen edges pulse violet.

---

## 4. Map Design

Three map layers: **World Map**, **Region sortie levels**, and the **Town hub**.

### 4.1 World Map: "The Sundered Isle"

- Presentation: hand-inked **parchment** with a compass rose, a torn-edge border, and biome color washes. Use a **different island silhouette** than the reference: a crescent with an inner bay.
- Biome zones: snow (north), forest (west), savanna/desert (east), rocky highlands (center), lake (south-west), sea (outside).
- Ruin overlay: a violet mist polygon creeps inward from the map corners. It grows each time a sortie fails (and a little each campaign "day"). Cleansed regions push it back with a gold ink bloom.
- Cursor: Bheem walks between nodes using `hero_run` along a dotted ink path.
- Node states: locked (grey ink), available (pulsing red dot), cleansed (gold star burst), ruined (violet scribble).

| # | Region | Biome | Chunks / length | Par time | Hook |
|---|---|---|---|---|---|
| 1 | Mossgrave | Forest (W) | 7 / 3360px | 40s | Tutorial. Slimes, light ruin towers, few pits. |
| 2 | Duskmarch | Savanna (E) | 8 / 3840px | 42s | Bats + pits, wide gaps, long sightlines. |
| 3 | Frostreach | Snow (N) | 9 / 4320px | 45s | Low-friction ice, heavy fog, bat packs. |
| 4 | Stonecrown | Highlands (center) | 10 / 4800px | 48s | Vertical platforming, falling rocks, chests with keys. |
| 5 | The Hollow Pylon | Corrupted mix | 11 / 5280px | 52s | All enemies, all hazards, the largest Pylon. |

Regions unlock in order. Emberhold sits on the south coast and is always available.

Implementation notes:
- Pre-render the parchment as one 1024x576 texture. Node positions are normalized (0..1) coordinates in `regions.json`.
- Ruin mist: a `RenderTexture` (or Graphics polygons) with noise tint, updated only on state change.
- Ink-draw path: reveal with a growing mask or by stepping through dotted points with a tween.
- Paper grain: one static overlay at 6% alpha.

### 4.2 Region sortie levels (side-scrolling)

- Base resolution **480x270**, tile size **16x16**, chunk width **480px (30 tiles)**.
- Direction: left to right. Spawn at the left, **Pylon arena at the right end**.
- Ruin Wall advances from the left (see Section 2).

#### Chunk types

| Kind | Content |
|---|---|
| `flat` | Safe ground, pickups, light enemies |
| `gap` | Pit (<= 5 tiles wide) with a spike/ruin floor |
| `stairs` | Platforms stepping up or down |
| `arch` | Ruined tower or arch used as cover plus a rune band |
| `shrine` | Heart or potion on an optional high platform |
| `chest` | Alcove with a chest that needs a key found earlier |
| `ambush` | Trigger zone spawning a wave (2 slimes + 1 bat), then a gate opens |
| `arena` | Final chunk: Pylon, flat floor, rune circle |

#### Generation rules
1. Seeded RNG per sortie (`seed = save.seed + regionId + attempt`). Same seed = same level.
2. First chunk is always `flat`. Last is always `arena`. No two `gap` chunks in a row.
3. A heart or potion shrine appears at least every 3 chunks.
4. Every `chest` chunk requires a key placed in an earlier chunk.
5. Par-time check: estimated traversal (length / 160 px/s + 1.5s per enemy) must be <= 70% of 60s. Regenerate if not.
6. Gaps <= 80px, platform rises <= 48px, so every jump is solvable without coyote tricks.

```ts
type ChunkKind = 'flat' | 'gap' | 'stairs' | 'arch' | 'shrine' | 'chest' | 'ambush' | 'arena';
interface Chunk { kind: ChunkKind; x: number; w: number }

export function buildRegion(def: RegionDef, seed: string): Chunk[] {
  const rng = new Phaser.Math.RandomDataGenerator([seed]);
  const out: Chunk[] = [{ kind: 'flat', x: 0, w: 480 }];
  while (out.length < def.chunks - 1) {
    const kind = pickWeighted(def.chunkWeights, rng, out); // applies rules 2 to 4
    out.push({ kind, x: out.length * 480, w: 480 });
  }
  out.push({ kind: 'arena', x: out.length * 480, w: 480 });
  return out;
}
```

#### Terrain and look
- Ground is a heightmap built into a Phaser `Tilemap` at runtime, with Arcade static bodies on solid tiles.
- **Strata**: grass/moss cap (2px) -> dirt with roots -> dark rock -> near-black fade at the screen bottom. Scatter small roots and bones as decals.
- **Ruin towers**: dark cobble stacks with glowing violet rune bands and broken tops. They act as mid-ground silhouettes and as cover.
- Dead trees, pines, broken bridges, and standing stones for variety.

#### Parallax layers (scrollFactor)

| Layer | Content | Factor |
|---|---|---|
| 0 | Dusk sky gradient (lilac to pink to warm horizon) | 0.0 |
| 1 | Distant mountains/silhouettes | 0.1 |
| 2 | Pine forest, fog-faded | 0.3 |
| 3 | Ruin towers (mid-ground) | 0.6 |
| 4 | Gameplay layer | 1.0 |
| 5 | Foreground fog wisps, ash/spores | 1.3 |

#### Biome kit

| Biome | Palette mood | Special |
|---|---|---|
| Forest | Moss green, deep teal, violet runes | Fireflies, spore drift |
| Savanna | Ochre, amber, dusty rose | Heat shimmer, wide pits |
| Snow | Ice blue, white, grey-violet | Low friction, snowfall, heavy fog |
| Highlands | Slate, rust, cold orange | Falling rocks, vertical shafts |
| Corrupted | Black, violet, magenta | Rune storms, lightning arcs |

### 4.3 Town Hub: Emberhold
Side-view street with medieval houses, blue slate roofs, and a blue banner. Bheem walks left-right between buildings. No combat here.

| Building | Function |
|---|---|
| Forge | Sword damage upgrades (3 tiers) |
| Apothecary | Start each sortie with a potion; stronger time potions |
| Armory | Shield that blocks the first hit each sortie |
| Hall (map table) | Opens the World Map (or press M) |
| Lamp Tower | Shows the 3 Hearth Lamps; relit by 3-star clears |
| Vault | Key storage, chest loot exchange |

Resource panel (bottom-right): Coins, Sand (time upgrades), Keys.

---

## 5. User Flow

### 5.1 Scene flow

```
[Boot] -> [Preload] -> [Title] --New/Continue--> [Town: Emberhold]
                                                      |  (Hall / press M)
                                                      v
                                                [World Map] --pick node--> [Briefing 3s]
                                                      ^                        |
                                                      |                        v
                                                 [Result] <--win/fail-- [Region + HUD scene]
                                                      |
                                                      +--> back to [Town] (spend loot, continue)
Overlays on any scene: [Pause], [Settings]
```

### 5.2 Scenes

| Scene | Purpose | Key inputs | Exits |
|---|---|---|---|
| `BootScene` | Set config, load loading-bar assets | none | Preload |
| `PreloadScene` | Load atlas, audio, JSON. Progress bar | none | Title |
| `TitleScene` | Logo, Bheem idle, Play / Continue / Settings | Enter, tap | Town |
| `TownScene` | Walk, upgrade, enter Hall | move, interact | WorldMap |
| `WorldMapScene` | Select region, view Ruin spread | arrows/tap, Enter | Briefing, Town |
| `BriefingOverlay` | Region name, par time, enemy icons, hint (3s or skip) | Enter, tap | Region |
| `RegionScene` | The 60-second sortie | move, jump, attack | Result |
| `HUDScene` | Runs parallel to Region: timer, hearts, status, compass | none | n/a |
| `ResultScene` | Stars, time left, loot tally, lamps | Enter, tap | Town, WorldMap |
| `PauseOverlay` | Resume / Settings / Quit to town | Esc, gear icon | n/a |

### 5.3 Sortie timeline

| Time | Beat |
|---|---|
| Pre-0 | "The Ruin rises in 3..2..1". Camera pans Pylon -> Bheem. Controls locked. |
| 0 to 50s | Play. Timer white. Ruin Wall advances. |
| 50 to 60s | **Panic state**: timer red and pulsing, vignette heartbeat at 1 Hz, tick SFX each second. |
| Win | Pylon cleanse finale (Section 6), then Result. |
| Fail | Wall swallows the screen (violet wipe), "The Ruin takes [Region]", lamp dims, Result. |

### 5.4 First-time experience (Mossgrave)
- Contextual prompts (fade after use): "Jump", "Strike", "Grab the potion for time", "Stay ahead of the Ruin".
- No text walls. First 15 seconds have no enemies and one heart pickup.
- Touch controls appear automatically on touch devices.

### 5.5 Controls

| Action | Keyboard | Touch | Gamepad |
|---|---|---|---|
| Move | A/D or Left/Right | D-pad (bottom-left) | Left stick / D-pad |
| Jump | Space / W / Up | A button | South |
| Attack | J / X | B button | West |
| Pause | Esc | Gear icon | Start |
| Map (town) | M | Hall building | Y |

### 5.6 HUD layout (480x270)

```
+--------------------------------------------------------+
| ♥ ♥ ♥ ♥ ♥             47.3  [hourglass]         [gear][sound] |
|              Ruin wall >>> distance arrow (screen edge)       |
|                                                        |
|                                                        |
| You are in Perfect Health                 Coins Sand Keys |
+--------------------------------------------------------+
```
(Use the sheet's heart, gear, and speaker icons. The Pylon health bar is world-space above the Pylon.)

### 5.7 Save data

Key: `ruinfall.save.v1` in `localStorage`.

```ts
interface SaveV1 {
  v: 1; seed: number;
  coins: number; sand: number; keys: number; lamps: 0 | 1 | 2 | 3;
  regions: Record<RegionId, { unlocked: boolean; stars: 0 | 1 | 2 | 3; bestTime: number | null }>;
  upgrades: { sword: 0 | 1 | 2 | 3; shield: boolean; potion: 0 | 1 | 2 };
  settings: { music: number; sfx: number; touch: boolean };
}
```

---

## 6. Special Visual Effects

Global look: nearest-neighbor, integer-friendly scaling, 1px dark outlines, limited palettes per biome. Glow is additive and used sparingly.

### 6.1 FX palette

| Use | Hex |
|---|---|
| Ruin violet (base) | `#7B3FE4` |
| Ruin glow | `#C58BFF` |
| Lightning core | `#FFFFFF` |
| Crit / danger red | `#FF3B30` |
| Warm cleanse gold | `#FFD25A` |
| Status text cyan | `#5EE6F2` |

### 6.2 FX catalog

| FX | Trigger | Look | Phaser implementation | Duration |
|---|---|---|---|---|
| **Ruin Wall** | Always | Rolling violet mist wall with a bright rune-lit leading edge and black pixels drifting off it | `TileSprite` (noise) + particle emitter at the edge + slow `postFX` glow on the wall sprite | continuous |
| **Floating runes** | Near ruins/Pylon | 7x9px violet glyphs bobbing, pulsing alpha, brighter near the Pylon | Glyph frames in atlas, additive blend, sine alpha tween, pooled | continuous |
| **Pylon lightning** | Pylon phase 2+ | Jagged bolts from the crystal to ground strike points, 3-pass glow | `Graphics` redrawn at 20 Hz (see snippet) + spark particles at impact | 150 ms/strike |
| **Strike telegraph** | Before each bolt | Rune circle on the ground, ring tightens | Graphics circle + scale tween, then bolt | 600 ms |
| **Damage numbers** | Any hit | White numbers pop (scale 1.4 -> 1), rise 24px, fade | Pooled `BitmapText`, stagger offsets so they never overlap | 600 ms |
| **Critical hit** | Crit | Red "CRITICAL HIT" + large number, hit-stop, shake | Text + `camera.shake(80, 0.004)` + 80ms freeze | 700 ms |
| **Hit-stop** | Every hit | Brief freeze on attacker and target | Pause target anims + set velocities to 0, resume after timer | 50 to 80 ms |
| **Enemy death** | Kill | Explosion frame scales up, 8 orange square shards, smoke puff | `fx_explosion` tween + `emitter.explode(8)` + `fx_smoke_a` | 350 ms |
| **Run dust** | Every 140 ms on ground | Small puff at feet | `fx_smoke_a` scale 0.4 -> 0.7, alpha 0.7 -> 0, rise 6px | 250 ms |
| **Land dust** | Landing | Two puffs spreading left/right | `fx_smoke_b`, scale and fade | 300 ms |
| **Pickup sparkle** | Collect | Gold 4-point sparkle spins, scale pulse | `fx_sparkle` rotation + scale tween | 400 ms |
| **Coin halo** | Idle coin | Pulsing additive halo behind the coin | Additive sprite, sine scale 1.0 to 1.15 | continuous |
| **Slime hop arc** | Before slime hop | Green arc previews the trajectory | `fx_hop_arc`, flipped by direction | 300 ms |
| **Slash arc** | Attack | White-to-blue crescent in front of Bheem | 3-frame generated arc or Graphics arc, additive | 120 ms |
| **Hurt flash** | Damage taken | White then red tint, knockback, red vignette pulse | `setTintFill`, `postFX.vignette` tween | 180 ms |
| **Ruin tint creep** | As time drains | Screen grade shifts toward violet, vignette strengthens | `camera.postFX.addColorMatrix()` tween + vignette 0.2 -> 0.6 | over 60s |
| **Panic pulse** (last 10s) | t >= 50s | Timer red, scales 1.0 -> 1.15 each second, vignette heartbeat | Tweens driven by `Math.floor(remaining)` change | per second |
| **Pylon cleanse finale** | Win | Slow-mo, white flash, expanding gold shockwave ring, violet -> gold color sweep across the level, Ruin enemies burst into sparkles | See 6.3 | about 2 s |
| **Fail wipe** | Fail | Violet mist floods the screen from the left, runes flare | Full-screen Graphics/mist texture tween | 1.2 s |
| **Star reveal** | Result | Each star pops with overshoot (scale 0 -> 1.3 -> 1) and sparkle | Sequenced tweens, 250 ms apart | 1 s |
| **Map ink path** | Node select | Dotted path draws in; node ignites | Stepped tween through points | 600 ms |
| **Map Ruin creep** | After a fail | Violet mist grows over a region with noisy edge | `RenderTexture` redraw, alpha tween | 1.5 s |

### 6.3 Key implementations

**Procedural lightning bolt**

```ts
export function drawBolt(g: Phaser.GameObjects.Graphics, a: Phaser.Math.Vector2, b: Phaser.Math.Vector2, seg = 10, jitter = 10) {
  const pts: Phaser.Math.Vector2[] = [a.clone()];
  for (let i = 1; i < seg; i++) {
    const t = i / seg;
    pts.push(new Phaser.Math.Vector2(
      Phaser.Math.Linear(a.x, b.x, t) + Phaser.Math.Between(-jitter, jitter),
      Phaser.Math.Linear(a.y, b.y, t) + Phaser.Math.Between(-jitter, jitter),
    ));
  }
  pts.push(b.clone());
  const passes: [number, number, number][] = [[5, 0x7b3fe4, 0.25], [3, 0xc58bff, 0.6], [1, 0xffffff, 1]];
  for (const [w, c, a8] of passes) g.lineStyle(w, c, a8).strokePoints(pts);
}
// Call g.clear() then drawBolt(...) every 50 ms while a strike is active.
```

**Slow-mo + camera FX helpers**

```ts
export function slowMo(scene: Phaser.Scene, scale: number, ms: number) {
  scene.anims.globalTimeScale = scale;
  scene.tweens.timeScale = scale;
  scene.time.timeScale = scale;
  scene.physics.world.timeScale = 1 / scale; // Arcade: > 1 is slower
  scene.time.delayedCall(ms, () => {          // delayedCall is scaled, so pass ms * scale
    scene.anims.globalTimeScale = 1; scene.tweens.timeScale = 1;
    scene.time.timeScale = 1; scene.physics.world.timeScale = 1;
  });
}
```
Call as `slowMo(scene, 0.3, 800 * 0.3)` so the real-time length is about 800 ms.

**Pylon cleanse finale sequence**
1. `slowMo(0.3)` and zoom the camera to 1.15x on the Pylon.
2. Pylon cracks (frame swap + white flash, `camera.flash(200)`).
3. Gold shockwave ring: Graphics circle, radius 0 -> 400, alpha 1 -> 0, additive.
4. Tween the color matrix from violet to warm gold across the visible level; all Ruin enemies burst into `fx_sparkle`.
5. Ruin Wall dissolves into rising spores.
6. After about 2s, fade to Result.

### 6.4 Ambient effects per biome
Forest: fireflies + spores. Savanna: heat shimmer (subtle sine offset on the far layers) + dust. Snow: layered snowfall + fog banks. Highlands: falling pebbles + wind streaks. Corrupted: rune storms, constant lightning arcs, magenta ash.

### 6.5 Performance budget
- Max 300 live particles, max 2 PostFX on the main camera. Pool everything (floating text, particles, bolts). No allocations inside `update()`.
- Mobile/low-power mode: disable bloom, halve particle counts, drop parallax layer 5.
- Respect `prefers-reduced-motion`: disable screen shake and flashing. Expose a Settings toggle too.

---

## 7. Audio (brief)
Chiptune with a warm theme for town and map. Sortie music is a rising pulse that speeds up as the timer drains. SFX: tick (last 10s), heartbeat, potion chime, crit crack, Pylon hum that rises with danger, cleanse chord. Music and SFX sliders in Settings.

---

## 8. Technical Architecture

### 8.1 Setup

```
npm create vite@latest ruinfall -- --template vanilla-ts
cd ruinfall && npm i phaser
```

`vite.config.ts`: `base: './'`, `build.rollupOptions.output.manualChunks: { phaser: ['phaser'] }`.
`tsconfig.json`: `"strict": true`. Add `"noUncheckedIndexedAccess": true` if you want extra safety.

```ts
// src/main.ts
import Phaser from 'phaser';
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: 480, height: 270,
  backgroundColor: '#14101f',
  pixelArt: true,
  render: { pixelArt: true, roundPixels: true, antialias: false },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 900 }, debug: false } },
  scene: [BootScene, PreloadScene, TitleScene, TownScene, WorldMapScene, BriefingOverlay, RegionScene, HUDScene, ResultScene, PauseOverlay],
};
new Phaser.Game(config);
```
CSS: `canvas { image-rendering: pixelated; }`.

### 8.2 Folder structure

```
src/
  main.ts
  config/        tuning.ts  palette.ts  keys.ts
  scenes/        BootScene.ts ... PauseOverlay.ts
  entities/      Player.ts  Enemy.ts  Slime.ts  Bat.ts  Pylon.ts  Pickup.ts  Chest.ts
  systems/       RuinClock.ts  ChunkGenerator.ts  FxManager.ts  SaveManager.ts
                 AudioManager.ts  InputManager.ts  EventBus.ts
  ui/            Hud.ts  TouchControls.ts  StarRow.ts  DamageText.ts
  data/          regions.json  enemies.json  upgrades.json
public/assets/   atlas/  audio/  fonts/
```

### 8.3 Key classes
- `Player`: finite state machine (`idle, run, jump, fall, attack, hurt, interact, dead`). Input is read through `InputManager` so keyboard, touch, and gamepad share one path.
- `Enemy` (abstract) -> `Slime`, `Bat`. Data-driven from `enemies.json`.
- `Pylon`: phases, spawn timers, strike scheduler, health bar.
- `RuinClock`: owns elapsed/remaining time, the Ruin Wall position, bonuses/penalties. Emits typed events (`tick`, `panic`, `expired`, `consumed`).
- `ChunkGenerator`: Section 4.2 rules. Pure function plus a seeded RNG, so it is unit-testable.
- `FxManager`: the single entry point for all effects (`fx.hit(pos, crit)`, `fx.dust(pos)`, `fx.cleanse()`). Gameplay code never creates particles directly.
- `EventBus`: a typed wrapper around `Phaser.Events.EventEmitter`.

### 8.4 Asset pipeline
Aseprite or TexturePacker -> atlas PNG + JSON -> `this.load.atlas('main', png, json)`. Animations are created once in `PreloadScene` from atlas frame names. Keep atlas <= 2048x2048.

---

## 9. Build Order (milestones)

| M | Goal | Done when |
|---|---|---|
| 1 | Boot + hero in a flat test level | Bheem runs/jumps with the real feel numbers and animations |
| 2 | Clock + Ruin Wall + pickups | 60s timer, wall advances, potion/coin/heart work, fail and win placeholders |
| 3 | Enemies, combat, Pylon | Slime/bat AI, crits, hit-stop, Pylon phases, cleanse ends the sortie |
| 4 | Chunk generator + Mossgrave | Seeded level with parallax and ruins, solvable every time |
| 5 | Town, World Map, Result, save | Full loop Town -> Map -> Sortie -> Result -> Town, persisted |
| 6 | FX pass | Everything in 6.2 implemented through `FxManager` |
| 7 | Regions 2 to 5, mobile, polish | Touch controls, biome kits, audio, accessibility toggles, perf budget met |

---

## 10. Originality Checklist
- No reference art, names, runes, or map shapes copied. Screenshots of the inspiration were used for mood only.
- The Ruin Clock, Ruin Wall, courier hero, lamps, and star-by-time rating are this game's own identity.
- Replace or license every stock-watermarked asset before release.
- Keep the working title and world names original. Do not reuse the reference game's lore.
