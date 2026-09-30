# BHEEM: Project Specification (for Devin)

> **Stack:** TypeScript + Phaser 3 + Vite
> **Genre:** 2D side-scrolling action game (platformer-brawler)
> **Inspiration:** *Regions of Ruin* (liberating a village from an occupying force). Take mechanics and mood as inspiration only. Do **not** copy its assets, names, or code.
> **UI:** A separate `UI_DESIGN.md` will be supplied later. See [Section 20](#20-ui-integration-contract) for how to build so it can be dropped in.

---

## 0. How to use this document

You are building a complete, playable vertical slice of **Bheem**. Read the whole document before writing code.

1. **Tables are the source of truth for numbers.** Every number must live in `src/config/balance.ts`. Never hard-code a gameplay number inside a class.
2. **Build in milestones** ([Section 25](#25-milestones)). Each milestone must run (`npm run dev`) and be demoable before moving on. Commit per milestone.
3. **Do not add features outside scope** ([Section 2](#2-scope)). If something is ambiguous, pick the option marked *Default* and record the decision in `docs/DECISIONS.md`.
4. **Use placeholder art and audio first** ([Section 18](#18-art-pipeline-and-placeholder-strategy)). The game must be fully playable with zero external assets, and real assets must be swappable through a manifest without code changes.
5. **Game feel is a feature.** Hit-stop, screen shake, telegraphs, and death scenes are requirements, not polish.

---

## 1. Vision and pillars

**Premise.** A demon warlord's army, the *Asura Horde*, has occupied a peaceful hill village. **Bheem**, a powerful village protector, returns to take it back. He fights through four districts, frees captured villagers, tears down the occupation banners, and kills the warlord **Kaalasura**.

**Design pillars**

| # | Pillar | What it means in practice |
|---|--------|---------------------------|
| 1 | **Powerful hero, three distinct weapons** | Sword (close), Bow (precise, ranged), Thunder Staff (area and chain). Each is fun alone, and switching mid-fight is encouraged. |
| 2 | **You are not alone** | Summon a squad of soldiers to fight beside you. Rescuing villagers makes the squad stronger. |
| 3 | **Monsters that fight dirty, and look cool** | They slow you, shoot arrows, and rain reinforcements from the sky. Every enemy has a clear silhouette and a readable telegraph. |
| 4 | **Deaths are spectacle** | Kills must feel great: hit-stop, slow-mo on big kills, unique death animations per kill type, and a cinematic boss death. |
| 5 | **Liberation, not just killing** | Progress = clear garrison, free captives, destroy banner, loot, village visibly comes back to life. |

**Session target:** 12 to 18 minutes for a first clear. About 2 to 3 minutes per district plus the boss.

---

## 2. Scope

### In scope (MVP vertical slice)
- One village map, 4 districts, 1 boss, about 9,000 px wide world, side-scrolling.
- Player with move, jump, dash, 3 weapons, summon.
- 5 enemy types + 1 summoned minion + 1 boss.
- Captive rescue, occupation banners, checkpoints (shrines) with upgrade shop, loot, coins.
- Death-scene system (per enemy and kill-type), boss death cinematic.
- Keyboard + mouse and gamepad support.
- Placeholder UI (replaced later by `UI_DESIGN.md`), save system, settings (volume, screen shake, flash reduction, key rebinding).
- Debug tools, unit tests, one end-to-end smoke test.

### Out of scope (do NOT build)
- Multiple levels or villages, overworld map, multiplayer, procedural generation.
- Inventory or equipment systems, crafting, dialogue trees, story cutscenes beyond the boss death and intro card.
- Touch and mobile controls (architecture must allow them later, see [Section 6.5](#65-future-touch-support)).
- Backend or accounts.

### Stretch (only if all milestones are done and stable)
- Second playable hero skin, New Game+, time-attack timer, touch controls.

---

## 3. Tech stack and setup

| Item | Choice | Notes |
|------|--------|-------|
| Language | **TypeScript 5.x**, `strict: true` | No `any` except at third-party boundaries. |
| Engine | **Phaser 3.x (latest stable 3.x)** | **Pin the exact version** in `package.json`. Verify the latest 3.x on npm. Do not use Phaser 4 unless told. |
| Build | **Vite** (latest stable) | `base: './'` so the build works from any static host or subfolder. |
| Renderer | **WebGL required** | Needed for the dissolve and post-FX shaders. Show a friendly error if WebGL is unavailable. |
| Physics | **Phaser Arcade Physics** | Fixed step 60 Hz (`fps.target = 60`, `physics.arcade.fps = 60`). |
| Lint / format | ESLint (typescript-eslint) + Prettier | Enforced in CI. |
| Unit tests | **Vitest** | For pure logic (damage, status effects, cooldowns, AI token allocation). |
| E2E | **Playwright** | One smoke test: boots, presses Start, moves, attacks, no console errors. |
| Package manager | npm | Commit `package-lock.json`. |

**npm scripts**
```
dev        vite
build      tsc --noEmit && vite build
preview    vite preview
lint       eslint . --ext .ts
test       vitest run
test:e2e   playwright test
```

**tsconfig essentials:** `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `target: ES2022`, `moduleResolution: bundler`, path alias `@/*` → `src/*`.

**Game config**
```ts
// src/config/gameConfig.ts
export const GAME_W = 960;   // logical width
export const GAME_H = 540;   // logical height (16:9)
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  width: GAME_W, height: GAME_H,
  parent: 'game-root',
  backgroundColor: '#0b0a12',
  pixelArt: false,              // default; flip via ART_STYLE constant if the UI doc specifies pixel art
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false, fps: 60 } },
  input: { gamepad: true },
  scene: [BootScene, PreloadScene, MainMenuScene, GameScene, UIScene, PauseScene, GameOverScene, VictoryScene],
};
```
Gravity is applied per-body (player and enemies) so projectiles and flyers can opt out.

---

## 4. Project structure

```
bheem/
├─ docs/
│  ├─ DECISIONS.md            # every ambiguous choice you made
│  ├─ UI_DESIGN.md            # supplied later by the owner
│  └─ CREDITS.md              # all third-party assets/audio + licenses
├─ public/assets/             # real assets (optional at first)
├─ src/
│  ├─ main.ts
│  ├─ config/
│  │  ├─ gameConfig.ts
│  │  ├─ balance.ts           # ALL gameplay numbers
│  │  ├─ controls.ts          # default key/pad bindings
│  │  └─ strings.ts           # all UI text (future localisation)
│  ├─ core/
│  │  ├─ GameStore.ts         # central observable state (HP, prana, rally, etc.)
│  │  ├─ GameEvents.ts        # typed event bus
│  │  ├─ StateMachine.ts      # generic FSM
│  │  ├─ TimeController.ts    # hit-stop + slow-mo
│  │  ├─ ObjectPool.ts
│  │  ├─ SaveManager.ts
│  │  └─ RNG.ts               # seedable RNG (for tests + debug)
│  ├─ scenes/                 # Boot, Preload, MainMenu, Game, UI, Pause, GameOver, Victory
│  ├─ input/
│  │  ├─ InputManager.ts      # raw devices → InputState
│  │  └─ InputState.ts
│  ├─ entities/
│  │  ├─ Actor.ts             # base: hp, faction, status effects, hurtbox
│  │  ├─ player/ (Player.ts, PlayerStates.ts, weapons/{Sword,Bow,ThunderStaff}.ts)
│  │  ├─ enemies/ (Enemy.ts, Raider.ts, BoneArcher.ts, MireHexer.ts, SkyCaller.ts, Brute.ts, Imp.ts)
│  │  ├─ boss/ (Kaalasura.ts, BossPhases.ts)
│  │  ├─ allies/ (Soldier.ts, Spearman.ts, ArcherAlly.ts, Shieldbearer.ts)
│  │  ├─ world/ (Captive.ts, Banner.ts, Shrine.ts, Chest.ts, Pickup.ts, Gate.ts)
│  │  └─ projectiles/ (Arrow.ts, MireBolt.ts, ThunderStrike.ts, Projectile.ts)
│  ├─ systems/
│  │  ├─ CombatSystem.ts      # damage pipeline
│  │  ├─ StatusEffectSystem.ts
│  │  ├─ HitboxSystem.ts
│  │  ├─ SpawnDirector.ts     # waves + caps
│  │  ├─ AttackTokenSystem.ts
│  │  ├─ TargetingSystem.ts   # enemy/ally target selection
│  │  ├─ SummonSystem.ts
│  │  ├─ LootSystem.ts
│  │  ├─ CheckpointSystem.ts
│  │  ├─ LiberationSystem.ts  # district progress, banners, gates
│  │  └─ CameraDirector.ts
│  ├─ fx/
│  │  ├─ FXManager.ts         # hit sparks, shake presets, damage numbers
│  │  ├─ DeathFX.ts           # death scene sequences
│  │  ├─ DissolvePipeline.ts  # WebGL post-FX
│  │  └─ BossDeathCinematic.ts
│  ├─ audio/AudioManager.ts
│  ├─ level/
│  │  ├─ LevelLoader.ts
│  │  ├─ levelSchema.ts
│  │  └─ village.level.json
│  ├─ ui/                     # UIAdapter + placeholder HUD (see §20)
│  ├─ debug/DebugOverlay.ts
│  └─ assets/manifest.ts      # asset keys → files (or procedural generators)
├─ tests/ (unit + e2e)
├─ index.html
├─ vite.config.ts
└─ README.md
```

---

## 5. Architecture

### 5.1 Scene flow

```
Boot → Preload → MainMenu → Game (+ UIScene in parallel) ⇄ Pause
                              ├─ player dies → GameOver (Retry from checkpoint)
                              └─ boss dies → BossDeathCinematic → Victory
```
- `UIScene` is launched **in parallel** over `GameScene` (`scene.launch('UIScene')`). It never touches gameplay objects directly. It only reads `GameStore` and listens to `GameEvents` ([Section 20](#20-ui-integration-contract)).
- `PauseScene` pauses `GameScene` (physics, tweens, timers) and overlays itself.

### 5.2 Game flow state machine (in `GameScene`)

| State | Enter | Exit | Notes |
|-------|-------|------|-------|
| `Intro` | Level loaded | After 2.5 s title card or any key | Camera pans across village, then snaps to hero. |
| `Playing` | Intro done | Player death, boss death, pause | Normal play. |
| `Paused` | Esc / P / pad Start | Same key | All time stopped. |
| `PlayerDead` | HP ≤ 0 | Retry pressed | Runs player death scene (see §13.7), then GameOver overlay. |
| `BossIntro` | Player crosses boss-arena trigger | After 3 s | Arena gates close, camera locks, boss-name card. Player input locked for the first 1.0 s only. |
| `BossFight` | BossIntro done | Boss dies or player dies | |
| `BossDeath` | Boss HP ≤ 0 | Cinematic ends | Player input locked. |
| `Victory` | Cinematic ends | n/a | |

### 5.3 Typed event bus

```ts
// src/core/GameEvents.ts: extend the list as needed, keep names stable (UI depends on them)
export interface GameEventMap {
  'player:hp':        { hp: number; max: number; delta: number };
  'player:prana':     { prana: number; max: number };
  'player:ammo':      { ammo: number; max: number };
  'player:weapon':    { weapon: 'sword' | 'bow' | 'staff' };
  'player:status':    { effects: StatusId[] };             // e.g. ['slow']
  'player:dash':      { cooldownMs: number };
  'player:died':      {};
  'rally:changed':    { value: number; max: number; ready: boolean };
  'summon:started':   { durationMs: number; squadSize: number };
  'summon:ended':     {};
  'summon:cooldown':  { remainingMs: number; totalMs: number };
  'coins:changed':    { coins: number; delta: number };
  'rescue:changed':   { rescued: number; total: number };
  'district:changed': { id: DistrictId; name: string };
  'objective:changed':{ text: string; progress?: number; target?: number };
  'banner:damaged':   { id: string; hp: number; max: number };
  'district:liberated': { id: DistrictId };
  'enemy:killed':     { type: EnemyType; killType: KillType; elite: boolean };
  'boss:spawned':     { name: string; max: number };
  'boss:hp':          { hp: number; max: number; phase: 1 | 2 | 3 };
  'boss:died':        {};
  'prompt:show':      { key: ActionId; label: string };
  'prompt:hide':      {};
  'checkpoint:reached': { id: string };
  'damage:number':    { x: number; y: number; amount: number; kind: 'normal' | 'heavy' | 'heal' | 'hero' };
  'game:paused':      { paused: boolean };
}
```

### 5.4 `GameStore`
Single source of truth for **HUD-relevant state**: `hp, maxHp, prana, maxPrana, ammo, maxAmmo, weapon, statusEffects, rally, coins, rescued, totalCaptives, districtId, objectiveText, upgrades, checkpointId`.
Mutating it emits the matching event. Entities may hold their own runtime state but must mirror HUD-relevant values into the store.

### 5.5 Time control (hit-stop and slow-mo)

`TimeController` is the **only** place that changes time scales. Implementation notes (important, these are easy to get wrong):

- Phaser's three time scales must be set together: `scene.time.timeScale`, `scene.anims.globalTimeScale`, `scene.tweens.timeScale`.
- **Arcade Physics `world.timeScale` is inverted:** `2.0` means half speed. Set it to `1 / scale`.
- Hit-stop and slow-mo durations must be measured in **real** time (`performance.now()` or a dedicated `requestAnimationFrame` counter), not scene time, otherwise they never end.
- Requests stack by priority: `{ scale, durationMs, priority }`. The highest-priority active request wins. Expired requests are dropped. Boss death cinematic has priority 100.

```ts
TimeController.hitStop(ms: number)                          // scale = 0.0 (use tiny epsilon 0.001)
TimeController.slowMo(scale: number, ms: number, priority?) // e.g. 0.25 for 350 ms
```

### 5.6 Update order (per frame, in `GameScene.update`)
1. `InputManager.poll()` → `InputState`
2. Player update (state machine)
3. Allies update
4. Enemies + boss update (AI)
5. Projectiles update
6. `HitboxSystem.resolve()` → emits damage requests
7. `CombatSystem.process()` → applies damage, knockback, statuses, death
8. `StatusEffectSystem.tick()`
9. `SpawnDirector.tick()`, `LiberationSystem.tick()`, `SummonSystem.tick()`
10. `CameraDirector.update()`
11. `GameStore` flush → events

---

## 6. Controls

### 6.1 Default bindings (all rebindable via Settings; saved to localStorage)

| Action | Keyboard + Mouse | Gamepad (Xbox layout) |
|--------|------------------|------------------------|
| Move left / right | `A` / `D` or `←` / `→` | Left stick X / D-pad |
| Jump | `Space`, `W`, or `↑` | `A` |
| Crouch / drop through platform | `S` or `↓` | Left stick down + `A` (drop) |
| Dash / dodge | `Left Shift` | `B` or `RB` |
| **Attack (primary)** | `Left Mouse` or `J` | `X` or `RT` |
| Aim | Mouse cursor | Right stick (auto-aim assist) |
| Weapon 1 Sword | `1` | D-pad Left |
| Weapon 2 Bow | `2` | D-pad Up |
| Weapon 3 Thunder Staff | `3` | D-pad Right |
| Cycle weapon next / prev | `Q` / mouse wheel | `LB` / `Y` |
| **Summon soldiers** | `R` | `RB` + `Y`, or `LT` *(Default: `LT`)* |
| Interact / rescue / open | `E` | `Y` |
| Pause | `Esc` or `P` | `Start` |
| Debug overlay (dev builds only) | `F3` | n/a |

### 6.2 `InputState` (what gameplay code consumes; gameplay never reads devices)

```ts
interface InputState {
  moveX: -1 | 0 | 1 | number;       // analog allowed (-1..1), deadzone 0.2
  jumpPressed: boolean;             // edge (this frame)
  jumpHeld: boolean;
  jumpReleased: boolean;
  crouchHeld: boolean;
  dashPressed: boolean;
  attackPressed: boolean;           // edge
  attackHeld: boolean;
  attackReleased: boolean;          // edge (bow/staff charge release)
  aim: { x: number; y: number };    // world-space point (mouse) or hero + stick*range (pad)
  aimAngle: number;                 // radians
  weaponSelect: 0 | 1 | 2 | 3;      // 0 = none
  weaponCycle: -1 | 0 | 1;
  summonPressed: boolean;
  interactPressed: boolean;
  pausePressed: boolean;
}
```

### 6.3 Input feel rules
- **Input buffering:** jump buffer 120 ms, attack buffer 150 ms (buffer attack during hurt-recovery and dash-recovery).
- **Coyote time:** 100 ms.
- **Gamepad aim assist:** if the right stick is neutral, aim toward the nearest enemy within 450 px in the facing direction. Otherwise use the stick direction.
- Mouse aim is converted to world space using the camera (`pointer.positionToCamera`), every frame, since the camera moves.
- Hero always faces the aim point while aiming with the bow/staff, and the movement direction otherwise.
- Disable browser defaults: right-click context menu, `Space`/arrow scrolling, mouse-wheel page scroll over the canvas.
- Pause automatically when the tab loses focus.

### 6.4 Context prompts
`Interact` shows a prompt (`prompt:show`) when within 70 px of a captive cage, shrine, chest, or gate lever. Hide on leave. The prompt only emits events. UI draws it.

### 6.5 Future touch support
All input goes through `InputManager` → `InputState`. A `TouchInput` provider can be added later without changing gameplay code. Do not build it now.

---

## 7. The hero: Bheem

### 7.1 Base stats (`balance.player`)

| Stat | Value | Notes |
|------|-------|-------|
| Max HP | 100 | +20 per Vitality upgrade tier |
| Max Prana (magic) | 100 | Used by Thunder Staff |
| Prana regen | 3 / s passive, +6 per sword hit landed | |
| Body (hurtbox) | 28 × 52 px | Standing; crouch = 28 × 32 |
| Run speed | 240 px/s | accel 1600, decel 2000 |
| Air control | 85% of ground accel | |
| Gravity | 1500 px/s² | |
| Jump velocity | −560 px/s | Variable height: releasing jump early multiplies upward velocity by 0.45 |
| Max fall speed | 900 px/s | |
| Dash | 520 px/s for 180 ms, cooldown 700 ms | **Invulnerable for the whole dash**. One air dash until landing. Dash is cancelled by hitting a wall. |
| Hurt i-frames | 600 ms | Sprite flickers. Dash cooldown is not reset. |
| Knockback on hit | Enemy-defined, hero has no poise (always flinches briefly 120 ms) unless dashing or summon-casting | |

### 7.2 Player state machine

States: `Idle, Run, Jump, Fall, Crouch, Dash, SwordAttack(n), BowCharge, BowRelease, StaffCharge, StaffRelease, Summon, Interact, Hurt, Dead`.

| From | Event | To | Conditions |
|------|-------|----|------------|
| Idle/Run | jump | Jump | grounded or within coyote |
| Jump | vy > 0 | Fall | |
| Fall | land | Idle/Run | |
| any grounded/air | dash | Dash | dash ready, not in Hurt/Summon/Dead |
| Dash | timer ends | Fall/Idle | |
| Idle/Run/Jump/Fall | attack (sword) | SwordAttack(1) | weapon = sword |
| SwordAttack(n) | attack within chain window | SwordAttack(n+1) | n < 3 |
| SwordAttack | recovery done | Idle | |
| Idle/Run/Jump/Fall | attack held (bow/staff) | BowCharge / StaffCharge | ammo / prana sufficient |
| Charge | released | Release → Idle | fire projectile or cast |
| Charge | dash | Dash | cancels charge, refunds nothing |
| any | summon | Summon | rally ≥ cost, not on cooldown |
| any non-Dash | damage taken | Hurt | not invulnerable |
| any | HP ≤ 0 | Dead | |

**Priority:** `Dead > Hurt > Dash > Summon > Attack/Charge > Jump/Fall > Run > Idle`.

---

## 8. Weapons

The hero can swap weapons instantly (swap cooldown 150 ms, cancels nothing except charge). Weapon data lives in `balance.weapons`.

### 8.1 Sword (Khadga): close range, combo, defensive

| Property | Value |
|----------|-------|
| Combo | 3 hits |
| Damage | 14 / 14 / 22 |
| Timing (ms) | Startup 70, Active 90, Recovery 110 (hit 3: 100 / 110 / 180) |
| Chain window | 260 ms after active frames end |
| Hitbox | 72 × 56 rect in front, offset 36 px. Hit 3 is 96 × 64 |
| Knockback | 160 / 160 / 340 px/s |
| Lunge | Hero moves forward 60 / 60 / 140 px/s during active frames |
| Hit-stop | 50 / 50 / 90 ms |
| Prana on hit | +6 |
| **Deflect** | During active frames, any enemy projectile flagged `deflectable` that overlaps the hitbox is reversed, re-owned by the player, damage ×1.0, tinted gold. Sparks + "ting" SFX + 40 ms hit-stop. |
| Air attack | Allowed. Single downward-diagonal slash, damage 16, no combo, small hop after landing a hit (pogo 280 px/s). |
| Crouch attack | Low sweep, damage 12, hits enemies on the ground only, knocks small enemies (Imp/Raider) over. |

### 8.2 Bow (Dhanush): precise ranged

| Property | Value |
|----------|-------|
| Ammo | Quiver 30 (+10 per Quiver upgrade tier). Regenerates 1 arrow per 1.2 s while not full. Arrow bundle pickups give +8 |
| Tap (charge < 0.25 s) | Damage 10, speed 700 px/s, gravity scale 0.35 |
| Full charge (0.9 s) | Damage 30, speed 1100 px/s, gravity scale 0.1, **pierces up to 2 targets**, "perfect" glow and crack SFX |
| Charge curve | Linear interpolation between tap and full values |
| Fire cooldown | 250 ms |
| Aim | 360° toward mouse/stick. Hero sprite upper body rotates to aim |
| Move while charging | 50% speed |
| Arrow lifetime | Sticks into terrain for 3 s then fades; despawn after leaving the camera by 600 px |
| Arrow visuals | Trail (simple fading line particles). Full-charge arrows leave a brighter trail |

### 8.3 Thunder Staff (Vajra Danda): chain lightning and area strike

| Mode | Input | Cost | Effect |
|------|-------|------|--------|
| **Thunder Bolt** (tap) | Tap attack (< 0.4 s) | 12 Prana | Hitscan toward the aim direction, range 420 px. Hits the first enemy or terrain along the ray. Damage 18. **Chains** to up to 2 more enemies within 180 px of the previous target, each at 60% damage. Applies **Shocked** (brief stagger 0.4 s, see §9.4). Cooldown 450 ms. |
| **Thunderclap** (hold ≥ 0.9 s, release) | Hold attack | 35 Prana | Target point = cursor, clamped to 480 px from hero (and snapped to the ground below). **Telegraph ring 0.35 s**, then a sky bolt. Radius 110 px, damage 50, **stun 1.2 s**, pops light enemies upward. Friendly fire: none. Cooldown 2.5 s |

Details:
- While charging, a growing ring previews the target area at the cursor.
- If Prana is insufficient: play a "dry" SFX, shake the prana HUD (emit `player:prana` with a flag or a dedicated `prana:denied`).
- Casting slows the hero to 60% speed during the cast and is not cancellable except by dash.
- **Rain synergy (optional, cheap to do):** in the market district's rain segment, chain range is +25%.
- **Raycast implementation:** compute the segment from the staff tip to `tip + dir * range`. Test against enemy hurtbox rects (line-rect intersection) and terrain rects. Take the nearest hit. Draw the bolt as a jagged polyline (5 to 8 segments with random perpendicular offset ±10 px) plus a glow, lasting 120 ms.

### 8.4 Weapon roles (balance intent)
- **Sword:** best DPS up close and protects against arrows. Risky against the Brute.
- **Bow:** safe vs. Archers, Hexers, Sky Callers. Ammo-limited.
- **Staff:** crowd control and multi-target. Prana-limited. Sword hits refill prana, which ties the weapons together.

---

## 9. Combat system

### 9.1 Factions and layers
`Faction: Hero | Ally | Enemy | Neutral`. Hero and Allies never damage each other. Enemies damage Hero and Allies. Projectiles carry the owner's faction.

### 9.2 Hitboxes and hurtboxes
- Every `Actor` has a **hurtbox** (Arcade body) and optional transient **hitboxes** (rect zones spawned with a lifetime during active frames, owned by an attack definition).
- A hitbox records `alreadyHit: Set<Actor>` so one swing hits each target once (multi-hit attacks explicitly list re-hit intervals).
- Hitboxes are pooled.

### 9.3 Damage pipeline

```ts
interface DamageInfo {
  amount: number;
  source: Actor | null;
  sourceFaction: Faction;
  kind: 'melee' | 'arrow' | 'lightning' | 'crush' | 'magic' | 'contact';
  knockback: { x: number; y: number };     // px/s impulse
  poiseDamage: number;
  statuses?: StatusApplication[];          // e.g. { id: 'slow', durationMs: 3000 }
  hitStopMs?: number;
  canDeflect?: boolean;
  isFinisherCandidate?: boolean;
}
```

`CombatSystem.applyDamage(target, info)`:
1. Reject if target is dead, invulnerable (dash / i-frames), or same faction.
2. `final = max(1, round(info.amount × damageMultiplier(source) × (1 − target.armor)))`. `armor ∈ [0, 0.75]`.
3. Subtract HP. Emit `damage:number`. Spawn hit sparks (color by `kind`).
4. Apply knockback (scaled by `target.knockbackResist`, 0 to 1).
5. Apply poise damage. If poise ≤ 0 and not `superArmor`, stagger (0.5 s), then reset poise.
6. Apply statuses (see 9.4).
7. Apply hit-stop and shake for the attacker's side (never for enemy-on-enemy). Hero being hit gets a small shake and a red-edge flash (respecting flash-reduction setting).
8. If HP ≤ 0: determine `killType` from `info.kind` (+ context, see §13) and call `DeathFX.play(target, killType)`.

### 9.4 Status effects (`StatusEffectSystem`)

| Status | Source | Effect | Duration | Stacking rule |
|--------|--------|--------|----------|---------------|
| **Slow** | Mire Hexer, Boss orbs | Move speed ×0.55, dash cooldown ×1.5, jump unaffected. Hero tinted purple, dripping particles, slowed footstep SFX | 3.0 s | **Refreshes, does not stack.** Slow cast by a Hexer is **removed immediately when that Hexer dies** (reward for priority targeting). Dash does **not** cleanse. |
| **Shocked** | Thunder Staff | Stagger (cannot act) | 0.4 s (Bolt), 1.2 s (Clap, called "Stun") | No stacking. Elites/Brute are immune to stun but take a 0.25 s stagger from Bolt. Boss immune. |
| **Knocked down** | Crouch sweep, Clap | Enemy lies on the ground | 0.8 s | Small enemies only |
| **Marked** | Sky Caller glyph | Target of Rain of Soldiers | until landing | Visual only |

Status rules:
- Statuses are data (`StatusDef`) with `onApply / onTick / onExpire`. Do not special-case in entity classes.
- `player:status` event emits the active list whenever it changes.
- Enemies apply Slow to **Allies** too (soldiers slow down).

### 9.5 Poise and stagger
Each enemy has `poise`. Damage reduces poise. At 0, stagger animation plays, attack is interrupted, and poise resets after 2 s of not being hit. `superArmor` windows (e.g. Brute during slam wind-up) ignore stagger, and the VFX must show it (white-gold outline pulse).

### 9.6 Hit-stop and shake presets

| Preset | Hit-stop | Shake (amplitude px / duration ms) |
|--------|----------|------------------------------------|
| Light hit | 40 ms | 2 / 80 |
| Medium hit | 60 ms | 4 / 120 |
| Heavy hit / finisher | 90 ms | 7 / 200 |
| Hero takes damage | 70 ms | 5 / 150 |
| Thunderclap impact | 80 ms | 9 / 260 |
| Brute slam | n/a | 8 / 240 |
| Boss slam | n/a | 12 / 320 |

Shake intensity is multiplied by the user's Screen Shake setting (0 to 100%).

---

## 10. Summon system: the soldiers

### 10.1 Rally meter
- **Rally** fills by defeating enemies and freeing captives: **+4** per normal kill, **+10** per elite (Brute, Sky Caller), **+15** per captive freed. Max 100. Emits `rally:changed`.
- Summon requires **Rally ≥ 60** and the summon cooldown finished. It **spends 60**.
- **Summon cooldown:** 12 s after the squad ends or after casting (whichever is later).
- Only **one squad** exists at a time. Summoning again while a squad is active is blocked (HUD shows "Squad active").

### 10.2 The cast
Pressing Summon starts a 500 ms cast: hero raises the staff, a mantra circle appears, gold light pillars drop and soldiers materialize at 40 to 140 px around the hero (ground-snapped, avoiding walls). The hero is invulnerable for the cast. Screen-edge gold glow. SFX: horn + chant.

### 10.3 Squad composition

| Rescued villagers | Squad |
|-------------------|-------|
| 0 to 2 | 2 Spearmen + 1 Archer |
| 3+ | +1 Spearman |
| 6+ | Duration 25 s → 35 s |
| 9+ | **Shieldbearer** added (taunts) |
| 12 | **Elite Captain** added (buffs allies' damage +20% while alive; 120 HP) |

### 10.4 Ally stats

| Ally | HP | Damage | Attack | Range | Speed | Notes |
|------|----|--------|--------|-------|-------|-------|
| Spearman | 40 | 8 | every 0.9 s | 56 px thrust | 170 | Charges nearest enemy |
| Archer | 25 | 6 | every 1.4 s | 360 px | 140 | Stays 200 to 300 px from target, arrows can be deflected by enemies? **No** |
| Shieldbearer | 80 | 4 | every 1.2 s bash | 48 px | 130 | **Taunt** (target weight ×2.0), blocks frontal arrows |
| Elite Captain | 120 | 14 | every 1.0 s | 70 px | 180 | Aura +20% ally damage |

Squad upgrades from the shrine (**Rally** upgrade tier) give +25% ally HP per tier.

### 10.5 Ally AI (FSM: `Follow → Engage → Attack → Retreat`)
- **Follow:** stay within 120 px of the hero (formation offsets behind/beside the hero so they don't stack).
- **Engage:** if an enemy is within 280 px (hero within 500 px), move to it.
- **Attack:** per-ally attack pattern.
- **Retreat:** Archers flee if an enemy is within 120 px.
- **Leash:** if the hero is > 600 px away, teleport-fade to the hero (prevents stuck allies).
- Allies obey platforming basics: jump up ledges ≤ 96 px when the target is above. Otherwise they wait.
- Allies can be **slowed** and **killed**. When the timer ends they fade into gold particles and go back to the sky. Death and expiry both use the ally death FX (§13.5).

### 10.6 Enemy targeting (`TargetingSystem`)
Each enemy picks the target with the lowest `distance / weight`:
`hero weight 1.0`, `soldier 0.7`, `shieldbearer 2.0`, `captain 1.0`. Re-evaluate every 400 ms (not every frame) and on taking damage from a specific source (switch to that source 50% of the time).

---

## 11. Enemies

### 11.1 Roster

| Enemy | HP | Armor | Poise | Speed | Role | Coins |
|-------|----|-------|-------|-------|------|-------|
| **Raider** (Asura grunt) | 40 | 0 | 20 | 120 | Melee swarmer | 3 |
| **Bone Archer** | 28 | 0 | 10 | 90 | Ranged, keeps distance | 4 |
| **Mire Hexer** (shaman) | 35 | 0 | 10 | 80 | Slows hero and allies | 5 |
| **Sky Caller** | 50 | 0 | 15 | 70 (floats) | Summons soldiers from the sky | 8 |
| **Brute** (elite) | 160 | 0.25 | 80 | 80 | Heavy slam, charge | 15 |
| **Imp** (summoned) | 15 | 0 | 5 | 180 | Fast diver, fodder | 1 |
| **Kaalasura** (boss) | 900 | 0.15 | n/a | see §12 | Warlord | 100 + finale |

### 11.2 Shared enemy AI framework
Each enemy is an `Actor` with an FSM: `Idle/Patrol → Alert → Approach/Reposition → Telegraph → Attack → Recover → (Stagger | Dead)`.

- **Aggro:** player/ally within `aggroRange` (default 420 px) with line of sight (simple ray vs. terrain), or upon being hit.
- **Leash:** return to the spawn anchor if > 900 px from it with no target for 4 s.
- **Patrol:** idle enemies walk between two anchors (±120 px) or stand guard.
- **Telegraph is mandatory** for every damaging attack: a wind-up animation **and** a readable tell (glow, glyph, red line). Minimum telegraph is 350 ms for melee and 500 ms for ranged. Attacks must never hit on the same frame as the tell starts.
- **Attack tokens (`AttackTokenSystem`):** at most **2** enemies may be in melee `Attack` state against the hero at once (3 during boss fight). Others circle/hold at 140 to 220 px and use "taunt" idle animations. Tokens release on Recover.
- **Caps:** at most 12 active (aggro'd) enemies at once. Extra spawns queue in `SpawnDirector`.
- **Platform awareness:** ground enemies stop at ledges (no suicide), and may jump gaps ≤ 96 px if marked `canJump`. Flying enemies ignore gravity and path in straight lines with avoidance.
- **Facing:** always faces its target except during an attack.
- **Randomness:** use seeded `RNG` so tests can be deterministic.

### 11.3 Enemy specifics

**Raider**
- Approach at speed 120. At ≤ 70 px: Telegraph 450 ms (raises weapon, red glint) → **cleave** (hitbox 80 × 60, damage 10, knockback 220) → Recover 600 ms.
- Every 4th attack, instead performs a **lunge**: 350 ms telegraph, dash 260 px/s for 200 ms, damage 12.

**Bone Archer**
- Keeps 260 to 380 px from target. Backs off if target closer than 200 px (speed 90).
- Shoot: Telegraph 600 ms (draws bow, **red aim line** appears), fires arrow (speed 520, damage 9, `deflectable`), cooldown 2.0 s (random ±0.4 s).
- Fires a **2-arrow volley** (0.25 s apart) at 50% HP.
- Prefers high ground: if a platform within 200 px is higher and reachable, goes there.

**Mire Hexer**
- Stays 300 to 420 px away, hovers behind Raiders.
- **Mire Bolt:** cast time 700 ms (purple glyph above head), projectile speed 260 px/s (slow, dodgeable), damage 4, applies **Slow 3 s**. Cooldown 3.5 s.
- **Death removes Slow it caused.** On death, a purple mist puff plays and, if the hero is slowed by it, the slow particles pop off (a clear feedback moment).
- Has a short teleport-blink (once per 8 s) when a hero/ally is within 100 px: moves 200 px away.

**Sky Caller**
- Floats 120 to 200 px above the ground, stays 350 to 500 px from the hero, flees when approached.
- **Rain of Soldiers** (cooldown 9 s): picks a point near the hero (x ± 200) → **glyph telegraph on ground for 1.0 s** (red rune circle, "Marked") → a portal opens above and **2 Imps fall** (or 1 Raider in districts 3 and 4) with a dust impact. Landing stuns the arriving enemy for 0.4 s (opening to punish). 
- Max 3 summoned enemies alive per caller. **Killing the caller dissolves its summoned Imps** (they are "bound" to it). Great target priority.
- Invulnerable during the 0.3 s cast pose? **No.** It can be interrupted: damage during the telegraph cancels the summon. Cooldown then still starts.

**Brute (elite)**
- Slow advance. Attacks:
  1. **Ground Slam:** telegraph 800 ms (raises hammer, **super armor**, gold-white outline pulse), hits at front 120 × 80 (damage 22, knockback 380), then sends a **shockwave** 240 px each side along the ground (damage 14, jumpable, height 30 px). Recover 1.4 s (**punish window**, takes +25% damage).
  2. **Charge:** telegraph 700 ms (paws ground, dust), charges 420 px/s for up to 600 ms, damage 20, stops/stuns itself for 1.2 s if it hits a wall.
- Immune to stun. Bolt only staggers 0.25 s. Thunderclap deals full damage but no stun.

**Imp (summoned)**
- Falls from the portal, lands (0.4 s stun), then **dive-bites**: telegraph 350 ms, leaps 200 px, damage 6. Flees 1 s after attacking. Erratic, fast, easily killed. Good for feeding Rally and coins.

### 11.4 Drops

| Drop | Chance | Effect |
|------|--------|--------|
| Coins | 100% | Amount from table. Magnetize to the hero within 120 px |
| Health orb ("Amrit") | 10% (25% from elites) | +15 HP |
| Prana orb | 10% | +20 Prana |
| Arrow bundle | 8% (higher if ammo < 10: 20%) | +8 arrows |

Drops pop upward with a small arc, bounce once, despawn after 12 s (blink the last 3 s). Drop tables live in `balance.drops`. Pickups are pooled.

---

## 12. Boss: Kaalasura, the Hollow King

**Arena:** the Chieftain's Hall courtyard, 1600 px wide, flat floor with two small side platforms (for Bow/Staff aim variety). The arena locks (gates close, camera fixed) on entry.

**Stats:** HP 900, armor 0.15, immune to Shocked/stun/knockdown. Boss bar with 3 segments (phase ticks at 66% and 33%). The boss stays a large sprite (about 2.2× hero height).

### 12.1 Phases and attack patterns

The boss FSM: `Idle → Choose → Telegraph → Attack → Recover`. `Choose` picks from the current phase's weighted list, never repeating the same attack twice in a row.

**Phase 1 (100% to 66%): "The Warlord"**

| Attack | Weight | Telegraph | Details |
|--------|--------|-----------|---------|
| Overhead Slam | 40 | 900 ms | Damage 24, ground shockwave both sides (jump over). Recovery 1.6 s (punish) |
| Bone Bow Fan | 35 | 700 ms | 3 arrows in a fan (±12°), damage 9 each, `deflectable` |
| Mire Orbs | 25 | 800 ms | Two slow purple orbs home gently for 3 s. Hit = Slow. Sword can cut them |

**Phase 2 (66% to 33%): "Call of the Horde"**
Adds to Phase 1 list (weights rebalanced) and:

| Attack | Weight | Telegraph | Details |
|--------|--------|-----------|---------|
| **Rain of Soldiers** | 30 | 1000 ms | 3 glyphs across the arena, then 2 Imps + 1 Raider fall. Boss is shielded (damage ×0.4) while 2+ minions are alive |
| Stomp Wave | 20 | 600 ms | Three sequential shockwaves, one every 0.5 s |

**Phase 3 (33% to 0%): "Hollow Fury"**
Speeds all telegraphs by ×0.8 (still readable), cooldown ×0.75. Adds:

| Attack | Weight | Telegraph | Details |
|--------|--------|-----------|---------|
| Rampage Charge | 25 | 800 ms | Charges across the arena twice, bounces off walls, damage 20, knockback high |
| Dark Rain | 25 | 700 ms | Arrows fall from the sky in 5 columns over 2 s (shadow markers 0.6 s before) |
| Desperation Roar | once at 15% HP | n/a | Brief invulnerable roar (2 s), pushes hero back, spawns 2 Imps, then vulnerable |

Phase transitions: the boss roars (1.5 s), is invulnerable during the transition, clears all projectiles, camera shakes, hero gets a free +20 HP and +30 Prana. Phase change also flips arena lighting (dusk → blood-red).

### 12.2 Boss fairness rules
- Every attack is telegraphed with sound **and** visual.
- No attack chains more than 2 hits without a recovery window.
- There is always at least one **safe spot** for any arena-wide attack (clear rule: the Dark Rain leaves one column empty).
- Boss and minions together obey the attack-token cap of 3.

---

## 13. Death scenes and FX

**This is a headline feature.** Every kill should feel satisfying and every elite/boss kill should feel like a moment. Kills are **stylized, not graphic**: dark purple "ichor", ash, embers, soul wisps. Provide a `reducedEffects` setting that removes flashes, slow-mo, and heavy particles.

### 13.1 Kill types
`KillType = 'slash' | 'arrow' | 'lightning' | 'crush' | 'generic'`, derived from the killing `DamageInfo.kind`:
- sword/melee finisher → `slash`
- arrow (incl. deflected) → `arrow`
- Thunder Bolt/Clap → `lightning`
- Brute slam, boss slam, Clap on the ground → `crush`
- everything else (ally hits, contact) → `generic`

### 13.2 Universal death sequence (all enemies, about 0.9 s)
1. **Hit-flash:** sprite turns solid white for 60 ms.
2. **Hit-stop** per kill type (see the table below).
3. **Death animation** selected by kill type (13.3).
4. **Dissolve:** after the animation, the body burns away using the **dissolve shader** (13.6) over 500 ms, leaving embers and a **soul wisp** that flies toward the Rally HUD position (visual reward for the Rally gain).
5. **Coins and drops** pop out at the moment of dissolve (not at the moment of the killing blow).
6. Corpse does not block movement and is removed/pooled at the end.

### 13.3 Kill-type variants

| KillType | Sequence | Hit-stop / Shake |
|----------|----------|------------------|
| **slash** | White diagonal **slash-line** sprite flashes across the body for 70 ms. The body is **cut in two halves** along the slash angle (two cropped sprites). Halves slide apart with a slight rotation, fall, then dissolve. Dark ichor spray particles along the cut line | 70 ms / medium |
| **arrow** | Arrow **sticks into the body**. Body is thrown back along the arrow's direction. If a wall or ground is within 120 px behind, the body **pins to the wall** for 1.2 s (arrow stuck into terrain), then dissolves | 50 ms / light |
| **lightning** | **X-ray flash:** for 140 ms the sprite is inverted/bright blue-white and a **skeleton silhouette overlay** shows (a bone texture swapped in via tint or a pre-made overlay sprite). Body trembles (±2 px shake), then **bursts into ash** that scatters upward. A scorch decal stays on the ground for 6 s. Chained targets die in a **staggered cascade** (60 ms between each) | 80 ms / medium |
| **crush** | Body is **flattened and launched**, with a ground-crack decal and a dust ring. Slow dissolve | 90 ms / heavy |
| **generic** | Ragdoll-ish arc: knockback velocity + angular velocity (random ±360°/s), lands, 300 ms later dissolves | 40 ms / light |

Implementation hints:
- **Split halves:** create two Images from the enemy's current frame. Half A: `setCrop` of one side of the slash line, Half B: the other. For non-axis-aligned cuts use a **geometry mask** (a rotated rectangle) on each half. Rotate and tween apart with gravity.
- **Ragdoll arc:** a pooled `DeathBody` object using a simple Arcade body (gravity, bounce 0.2, drag) and a spin tween. Do not build a full physics ragdoll.

### 13.4 Elite and finisher moments
- **Brute / Sky Caller death:** slow-mo `0.25` for 350 ms, camera zoom-punch to 1.12 (recover over 400 ms), heavy shake, shockwave ring sprite, **coin fountain** (8 to 12 coins).
- **Last enemy of an encounter (any type):** "kill cam": slow-mo `0.3` for 500 ms + 1.08 zoom. Triggers `encounter:cleared` event.
- **Multi-kill:** if 3+ enemies die within 600 ms, show a "MULTI!" popup (UI event `combo:multi`), extra coin burst, rally bonus +5.

### 13.5 Ally death/expiry
Soldiers dissolve into gold dust rising to the sky. No shake, no slow-mo. Low-volume chime. They must not look like enemy deaths (gold vs. dark purple).

### 13.6 Dissolve shader (`DissolvePipeline`)
- Phaser `PostFXPipeline` applied per-sprite on death.
- Fragment shader: sample a **noise texture** (generate procedurally in BootScene: 256×256 value noise into a `CanvasTexture`). Uniform `uProgress ∈ [0, 1]`. Pixels where `noise < uProgress` are discarded. Pixels within `edgeWidth` (0.06) above the threshold are drawn in **ember orange/white** emissive color.
- Tween `uProgress` 0 → 1 over 500 ms (Brute 900 ms, boss 2500 ms).
- **Fallback** (if WebGL pipeline fails): alpha fade + particle burst. The fallback must exist and be tested via a debug toggle.

### 13.7 Player death scene
1. Hero takes the killing blow: hit-stop 120 ms, screen desaturates over 300 ms.
2. Slow-mo 0.3 for 800 ms; hero falls to his knees, then forward (death animation), weapon drops and sticks in the ground.
3. Camera slowly zooms to 1.25 on the hero. Nearby soldiers (if any) dissolve into gold dust.
4. Vignette closes. After 1.5 s, the **GameOver overlay** appears: "Retry from shrine" (default) / "Main menu".
5. On retry: fade, respawn at the last checkpoint with full HP/Prana, lose **10% of coins** (rounded down, recoverable? **No**, keep it simple), enemies in the current district **keep their state** (defeated stay defeated, banner damage stays), captives freed stay freed.

### 13.8 Boss death cinematic (`BossDeathCinematic`): about 9 s, skippable after 2 s by holding any key for 0.5 s

| t (s) | Beat |
|-------|------|
| 0.0 | Killing blow lands: **hit-stop 400 ms**, white flash (reduced in reduced-effects mode), all music ducks to silence. Input locked. All projectiles/minions removed. Minions dissolve at once |
| 0.4 | `slowMo(0.15, 2500 ms, priority 100)`. Camera zooms to 1.5 on the boss over 1.2 s. Screen desaturates and a dark vignette closes in |
| 0.8 | Boss roars, drops to his knees. **Cracks of golden light** spread across his body (an animated crack overlay sprite plus a pulsing additive glow) |
| 2.0 | Hero and boss exchange a final look (hero faces the boss). Wind, distant villager voices fade in. **Soul wisps** from every enemy ever killed in the level stream out of the boss upward (reuse pooled wisp particles) |
| 3.0 | Time returns to `0.6`. The boss's body **shatters into light** (dissolve shader, 2500 ms, gold-white edges). A huge shockwave ring expands and **all remaining banners across the level burn away** (cut to a quick montage of 3 camera shots: banner burning, village lights turning on, villagers cheering) |
| 6.0 | Return to hero. The camera pulls back to 1.0. A loot chest of coins bursts out of the dissolve. The sun rises (lighting tween from dusk to dawn) |
| 8.0 | Title "VILLAGE LIBERATED" (UI event `victory:title`), then the Victory scene (stats: time, deaths, villagers rescued, coins) |

All timings are in `balance.bossDeath` so they can be tuned. Cinematic must be deterministic (scripted timeline using a small `Timeline` helper: list of `{ at: number, run: () => void }` using real-time clock).

---

## 14. Village liberation loop

### 14.1 Structure
The village is **one continuous side-scrolling map** split into 4 **districts**. Each has a garrison, captives, loot, a banner, and a checkpoint shrine.

| # | District | World x range | Theme | Enemy mix |
|---|----------|---------------|-------|-----------|
| 1 | **Gate & Outskirts** | 0 to 2400 | Broken gate, farms, torches | Raiders, a couple of Bone Archers. Tutorial pacing |
| 2 | **Market Street** | 2400 to 4800 | Stalls, rooftops, rain | + Mire Hexers, first Sky Caller, vertical rooftops |
| 3 | **Temple Hill** | 4800 to 7200 | Stairs, shrine ruins, fog | + Brutes, combined arms, multi-level platforms |
| 4 | **Chieftain's Hall** | 7200 to 9000 | Fortress courtyard | Mini-wave, then boss arena |

### 14.2 District state machine

`Occupied → (enter trigger) Combat → Garrison Cleared → Banner Vulnerable → Liberated`

1. **Occupied:** district is under a dark-red tint, fog, and enemy banners. Villager windows are dark.
2. **Combat:** entering the district start-trigger spawns **waves** (see §16). A district's exit gate is closed (portcullis or barricade) until cleared.
3. **Garrison Cleared:** all required waves defeated. The objective text changes to "Destroy the banner".
4. **Banner Vulnerable:** the **Occupation Banner** (a tall enemy standard, 150 HP, hit by any weapon, it doesn't move) loses its shield. It was invulnerable (shown with a dark barrier) until this point.
5. **Liberated:** banner destroyed → burst of flames, **loot shower** (district coin bonus 40/60/80/120 coins), exit gate opens, tint lifts to warm light, lamps light up, **captured villagers who were freed run to houses and wave**, fog clears, the shrine becomes active, the music shifts to a hopeful layer. Emits `district:liberated`.

Captives are **optional** (not required for liberation), but each one rescued grants Rally and squad upgrades, which makes the boss easier.

### 14.3 Captives
- 3 per district in districts 1 to 3 (9 total) and 3 in the Chieftain's Hall (12 total) in cages. The last 3 are in the hall, reachable before the boss arena.
- **Interact:** press `E` within 70 px to open the cage (hold 0.6 s, radial fill shown by `prompt:show` progress or UI). Interrupted if the hero takes damage.
- Reward: +15 Rally, + heal 10 HP, squad upgrade thresholds (see 10.3), and the freed villager runs to the nearest "safe house" anchor and stays as ambient NPC (sprite + wave animation).
- Some cages are guarded (spawn trigger on approach, an ambush wave).
- Count is shown as `rescued / 12`.

### 14.4 Shrines (checkpoints and shop)
- One per district start, plus one before the boss arena. Activating (press `E`) sets the respawn point, **fully heals** the hero, refills Prana and Arrows. It also **respawns nothing**.
- **Shrine menu** (opens as a simple overlay, placeholder now): spend coins on upgrades. Game continues paused while the menu is open.

### 14.5 Upgrades (economy)

| Upgrade | Effect per tier | Tiers | Costs |
|---------|-----------------|-------|-------|
| **Might** | Sword and arrow damage +10% | 3 | 40 / 80 / 140 |
| **Vitality** | Max HP +20 | 3 | 40 / 80 / 140 |
| **Quiver** | Max arrows +10 | 2 | 30 / 70 |
| **Prana** | Max Prana +20, regen +1/s | 3 | 40 / 80 / 140 |
| **Rally** | Ally HP +25%, Rally per kill +1 | 3 | 50 / 90 / 150 |

The economy is tuned so a player who clears everything and opens chests can afford about 70% of the upgrades. Total coin supply lives in `balance.economy`.

### 14.6 Chests
Hidden or side-path chests contain 25 to 40 coins, or a health orb + arrow bundle. Opening takes `E` (instant). One chest per district is on a slightly hidden platform, teaching exploration.

---

## 15. Level data

Levels are **data-driven JSON** (`village.level.json`), validated by `levelSchema.ts` (runtime validation with clear errors). Tiled import is post-MVP.

```ts
interface LevelData {
  width: number; height: number;            // world px (e.g. 9000 × 1200)
  groundY: number;                          // default ground top
  solids:     Rect[];                       // static ground/walls {x,y,w,h}
  oneWays:    Rect[];                       // jump-through platforms
  hazards?:   Rect[];                       // optional (pits kill → respawn at checkpoint with 10 dmg)
  districts:  DistrictDef[];
  parallax:   ParallaxLayer[];              // key, scrollFactor, y
  lighting:   { occupied: LightPreset; liberated: LightPreset; bossP3: LightPreset };
}
interface DistrictDef {
  id: DistrictId; name: string;
  bounds: { x0: number; x1: number };
  startTrigger: Rect;
  exitGate: { x: number; y: number; h: number };
  shrine: { x: number; y: number };
  banner: { x: number; y: number; hp: number };
  captives: { x: number; y: number; guarded?: boolean }[];
  chests: { x: number; y: number; loot: LootSpec }[];
  waves: WaveDef[];
  ambient: AmbientProp[];                   // purely visual
  weather?: 'none' | 'rain' | 'fog';
}
interface WaveDef {
  id: string;
  trigger: 'onEnter' | { afterWave: string } | { x: number };
  spawns: { type: EnemyType; x: number; y: number; delayMs?: number; elite?: boolean }[];
  requiredToClear: boolean;
}
```

**Level rules**
- World height 1200 px; camera follows vertically in districts 2 and 3 (rooftops, hill), and is locked to the ground band in districts 1 and 4.
- Ground tiles: use solid rects rendered as placeholder shapes. One-way platforms use `body.checkCollision` or a `processCallback` (collide only when falling and the feet were above the platform top last frame).
- Gaps ≤ 96 px horizontally for the player's base jump, and platform height steps ≤ 120 px (jump height is about 105 px, tune so all jumps are reachable, add a debug check that warns on unreachable platforms).
- No bottomless pits in the vertical slice except small "spike pits" that deal 10 damage and respawn the hero at the last safe ground (emit `player:hazard`).

---

## 16. Spawn director and encounter tables

`SpawnDirector` handles waves. Rules:
- A wave starts when its trigger fires. Enemies spawn **off-screen** by default (from behind doors, from the camera edge ± 80 px), or at fixed points if defined. Sky Callers and portal spawns use visual spawn effects.
- If the active-enemy cap (12) is reached, spawns queue.
- A wave is cleared when all its enemies are dead. `requiredToClear` waves gate the district.
- Enemies carry over between waves only if alive.

**Default encounter table (tune in `village.level.json`)**

| District | Wave | Composition | Notes |
|----------|------|-------------|-------|
| 1 | 1a | 3 Raiders | Teaches melee and dash |
| 1 | 1b | 2 Raiders + 1 Bone Archer | Teaches deflect/bow |
| 1 | 1c (guarded captive) | 4 Raiders | Ambush at the cage |
| 1 | 1d | 2 Archers + 3 Raiders | Clear → banner |
| 2 | 2a | 2 Raiders + 1 Hexer | First slow. Teaches "kill Hexer" |
| 2 | 2b | 1 Sky Caller + 2 Archers (rooftops) | Teaches Rain of Soldiers |
| 2 | 2c | 3 Raiders + Hexer + Archer | Rain weather, staff synergy |
| 2 | 2d | 1 Brute (intro) | First elite |
| 3 | 3a | 2 Brutes (staggered) | Staircase fight |
| 3 | 3b | 2 Sky Callers + 2 Hexers | Chaos: slow + rain |
| 3 | 3c | Brute + 3 Raiders + 2 Archers | Combined arms |
| 3 | 3d | 1 Brute + Sky Caller + Hexer | Pre-banner |
| 4 | 4a | Horde: 4 Raiders + 2 Archers + 1 Brute | Hall entry |
| 4 | 4b | Boss | See §12 |

Target: a competent player uses about 2 to 3 summons total in the run. A district-2 player without summon should still be able to win (summon helps, doesn't gate).

---

## 17. Camera

`CameraDirector` owns all camera behavior.

- **Follow:** `startFollow(player, true, 0.12, 0.08)`, deadzone 80 × 40, **look-ahead** 80 px in facing direction (smoothed over 250 ms).
- **Bounds:** per district (soft transition between districts over 600 ms). Hard lock in the boss arena.
- **Shake:** presets in §9.6, scaled by user setting.
- **Zoom:** default 1.0. `punch(zoom, inMs, outMs)` for finishers, `lockZoom` for the boss death.
- **Aim look:** while aiming a bow/staff, shift the camera toward the aim point by up to 60 px.
- **Transitions:** fade to black 300 ms on respawn.
- **Parallax:** 4 layers (sky 0.05, far hills 0.15, mid buildings 0.4, near foreground props 1.15 drawn above gameplay with 40% alpha).
- Pixel snapping: round camera scroll to whole pixels if `ART_STYLE === 'pixel'`.

---

## 18. Art pipeline and placeholder strategy

### 18.1 Phase A: placeholder (required, playable with zero files)
Generate all textures at boot via `Graphics.generateTexture` or `CanvasTexture`:
- Hero: 28×52 blue rectangle with a head circle and a colored weapon line.
- Each enemy: a distinct **silhouette and color** (Raider red, Archer bone-white, Hexer purple, Sky Caller teal with a halo, Brute large dark red, Imp small orange, Boss huge black-gold).
- Soldiers gold-tinted. Captive cages brown boxes. Banners tall dark-red rectangles. Shrines blue-gold obelisks.
- Text labels over entities in debug mode.
All keys and frame names come from `assets/manifest.ts`.

### 18.2 Phase B: real assets (drop-in)
`manifest.ts` maps `key → { type: 'spritesheet'|'image'|'atlas'|'audio', path, frameConfig }`. If a path exists, load it. Otherwise fall back to the procedural generator for that key. **Swapping an asset must require zero code changes.**

### 18.3 Animation naming convention
`<entity>_<state>[_<variant>]`, e.g. `hero_idle`, `hero_run`, `hero_sword_1`, `hero_sword_2`, `hero_sword_3`, `hero_bow_charge`, `hero_bow_release`, `hero_staff_charge`, `hero_staff_release`, `hero_summon`, `hero_dash`, `hero_hurt`, `hero_death`, `raider_walk`, `raider_telegraph`, `raider_cleave`, `raider_hurt`, `raider_death_slash`, `raider_death_arrow`, `raider_death_lightning`, `raider_death_generic`.
Animation data (frame rate, loop, frame events) is stored in `assets/animations.ts`. **Gameplay timing is driven by timers/balance data, not by animation length**, so art changes don't break combat timing. Animation events (e.g. `hitbox_on`) are optional.

### 18.4 Art direction (until `UI_DESIGN.md` arrives)
Mythic hill-village fantasy with South Indian / Kerala-inspired architecture (tiled slanted roofs, wooden pillars, brass lamps, temple stone). Hero: broad-shouldered warrior, red-and-gold. Monsters: **Asura** army: horned, bone armor, smoldering eyes, each with a unique silhouette (readability over detail). Palette: occupied = desaturated reds/purples, liberated = warm gold/green. **This is a suggestion. The owner's UI/art doc overrides it.**

---

## 19. Audio

`AudioManager` wraps Phaser sound with categories `music`, `sfx`, `ui`, `voice` and volumes (master/music/sfx) from settings.

- **Music layers:** `explore` (occupied, tense), `combat` (added when enemies are aggro'd, crossfade 800 ms), `liberated` (hopeful, after a banner falls), `boss` (3 stems per phase), `victory`.
- **SFX list (minimum):** footsteps (3 surfaces), jump, land, dash, sword swing ×3, sword hit, deflect, arrow draw, arrow release, arrow hit, bolt cast, thunder strike, prana-dry, summon horn, soldier spawn, enemy telegraph cues (per type, distinct), enemy hit, enemy death (per kill type), slow applied, slow cleansed, coin pickup, health pickup, cage open, shrine activate, banner burn, gate open, boss roar, boss slam, boss death, UI click.
- **Audio ducking:** music ducks −6 dB on heavy kills, to silence for the boss death.
- Placeholder: generate simple tones via WebAudio (or leave silent stubs) so the code path works. **Record any sourced audio in `CREDITS.md`.** Only CC0 or properly licensed.
- Respect browser autoplay: start audio on first user input in MainMenu.

---

## 20. UI integration contract

The owner will supply **`docs/UI_DESIGN.md`** later. Until then, build a minimal **placeholder HUD** and structure the code so the real UI can replace it without touching gameplay.

**Rules**
1. All UI lives in `UIScene` + `src/ui/`. Gameplay code **never** references UI objects.
2. UI reads from `GameStore` and subscribes to `GameEvents` (§5.3). **No polling of entities.**
3. Define `interface UIAdapter { init(scene): void; destroy(): void; }` and put the placeholder HUD behind it so the real HUD can be a second implementation selected by a constant.
4. All user-facing text comes from `config/strings.ts`.
5. Menus (main, pause, game-over, victory, shrine, settings) are also behind adapters, with the placeholder versions being plain text + rectangles.

**Placeholder HUD elements (to be replaced)**

| Element | Data |
|---------|------|
| Health bar | `player:hp` |
| Prana bar | `player:prana` |
| Weapon slots 1/2/3 + highlight + arrow count | `player:weapon`, `player:ammo` |
| Dash cooldown pip | `player:dash` |
| Status icons (Slow) | `player:status` |
| Rally meter + "Summon ready" flash + squad timer | `rally:changed`, `summon:*` |
| Coins | `coins:changed` |
| Rescued `n/12` | `rescue:changed` |
| District name card + objective text | `district:changed`, `objective:changed` |
| Banner health bar (when vulnerable and nearby) | `banner:damaged` |
| Boss bar with phase ticks | `boss:*` |
| Interact prompt (+ hold progress) | `prompt:*` |
| Floating damage numbers | `damage:number` |
| Screens: Main Menu, Pause, Game Over, Victory, Shrine (shop), Settings | n/a |

**Settings screen (required):** master/music/sfx volume, screen shake %, reduced effects (flashes / slow-mo), key rebinding (keyboard), show damage numbers, fullscreen toggle.

When `UI_DESIGN.md` arrives, **do not guess at layout, fonts, colors, or animations**. Follow the doc exactly. Flag gaps in `DECISIONS.md`.

---

## 21. Save and settings

`SaveManager` (localStorage, key `bheem.save.v1`, versioned with migration stub):
```ts
interface SaveData {
  version: 1;
  settings: { master: number; music: number; sfx: number; shake: number; reducedEffects: boolean; damageNumbers: boolean; bindings: Record<ActionId, string[]> };
  progress?: {                 // written at each shrine activation
    checkpointId: string; districtStates: Record<DistrictId, 'occupied'|'liberated'>;
    coins: number; upgrades: Record<UpgradeId, number>; rescued: string[]; bannersDestroyed: string[];
    deaths: number; playtimeMs: number;
  };
  bestClear?: { timeMs: number; deaths: number; rescued: number };
}
```
- Main menu: **New Game** and **Continue** (if progress exists).
- Wrap all storage in try/catch (private mode, quota). Fall back to memory.
- Never crash on corrupted saves: discard and start fresh, log a warning.

---

## 22. Debug tools (dev builds only, stripped from production via `import.meta.env.DEV`)

Toggle overlay with `F3`: FPS, entity counts, pooled objects, current states (player, nearest enemy), attack-token holders, time scale.
Debug hotkeys (while overlay is open):
- `F4` hitbox/hurtbox/attack-range drawing
- `F5` god mode
- `F6` spawn enemy at cursor (cycle type with `[` `]`)
- `F7` fill Prana/Arrows/Rally
- `F8` teleport to the next district start / boss arena
- `F9` kill all enemies
- `F10` toggle dissolve-shader fallback
- `F11` replay boss death cinematic
Also a `?debug=1` URL flag to enable in preview builds, and `?seed=1234` for deterministic RNG.

---

## 23. Performance and quality bar

- Stable **60 FPS** on a mid-range laptop (integrated GPU) with 12 enemies + 4 allies + particles on screen.
- **Pool** everything created often: projectiles, hitboxes, particles, damage numbers, death bodies, pickups, soul wisps, glyph markers. No `new` in hot paths in `update`.
- Particle emitters are created once per type and reused (`emitParticleAt`).
- Off-screen enemies (> 1.5 screens from the camera) are "sleeping": no AI, no animation updates, until aggro trigger or wave spawn.
- Initial load under 3 s on broadband (placeholder build < 2 MB after gzip including Phaser).
- Use `Phaser.Math.Clamp`, avoid allocations in loops, reuse `Vector2`s.
- Console must be free of errors and warnings during a full playthrough.
- Support window resize and fullscreen without breaking mouse aim (use the scale manager).
- Accessibility basics: flash limiter (no more than 3 full-screen flashes per second, less when `reducedEffects`), rebindable keys, pause on blur.

---

## 24. Testing

**Unit (Vitest), pure logic only, no Phaser runtime:**
- Damage formula (armor, min damage 1, multipliers, upgrade scaling).
- Status effects: Slow refresh (no stacking), removal when the source Hexer dies, Shocked immunity rules.
- Cooldowns and prana/ammo math, bow charge interpolation.
- Attack token allocation (max 2 melee, release on recover, boss max 3).
- Target selection weights (shield taunt, distance).
- Rally gain/cost, summon gating, squad composition by rescued count.
- Economy: upgrade cost/tier, coin loss on death (10% floor).
- Level JSON schema validation (valid passes, broken fails with a clear message), plus a reachability checker for platforms.
- `TimeController` priority and expiry.
- SaveManager round-trip and corrupted-data recovery.

**E2E (Playwright smoke):** page loads, no console errors, press Start, hero moves, attack fires, `?debug=1&seed=1` spawns an enemy, kill it, pause/unpause, reach the GameOver screen by damaging the hero (via a debug hook), and retry.

**Manual QA checklist** is in §26. Record results in `docs/QA.md`.

---

## 25. Milestones

Each milestone ends with `npm run lint && npm run test && npm run build` passing, a commit/PR, and a short GIF/screenshots in the PR description.

| # | Milestone | Deliverables | Definition of Done |
|---|-----------|--------------|--------------------|
| **M0** | Scaffolding | Vite + TS + Phaser, scenes, config files, lint/test/CI, placeholder texture generator, `balance.ts`, `GameEvents`, `GameStore`, `TimeController` | Boots to Main Menu → Game scene with a colored rectangle hero on a ground rect. No console errors. |
| **M1** | Movement and camera | `InputManager` (keyboard/mouse/gamepad), player FSM: run, jump (coyote, buffer, variable), crouch/drop-through, dash with i-frames. `CameraDirector`, parallax | Movement feels tight. Test level has gaps, one-ways, a wall |
| **M2** | Weapons and combat core | Sword combo + deflect, Bow charge + pooled arrows, Thunder Bolt/Clap, `CombatSystem`, hitboxes, hit-stop, shake, status system, training dummy | Every weapon works on a dummy. Unit tests for damage/status pass |
| **M3** | Enemies | Raider, Bone Archer, Mire Hexer (slow), Sky Caller (Rain of Soldiers), Imp, Brute. FSM AI, telegraphs, attack tokens, targeting, drops | Each enemy fightable in a test arena, readable telegraphs |
| **M4** | Summon system | Rally meter, summon cast, soldiers (3 types + AI), ally targeting, enemy target weights, squad upgrades | Summon works, soldiers fight, expire, die properly |
| **M5** | Village loop | Level JSON + loader, 4 districts, waves via `SpawnDirector`, captives, banners, gates, shrines, upgrades shop (placeholder UI), chests, loot, save/continue | Play districts 1 to 3 start to finish with liberation beats |
| **M6** | Boss and death scenes | Kaalasura (3 phases), arena lock, **DeathFX** (all kill types), dissolve shader + fallback, player death scene, boss death cinematic, Victory scene | Full game is beatable start → victory. All kill types visibly distinct |
| **M7** | Juice and audio | Particles, trails, decals, lighting tweens, all SFX/music hooks, settings menu, reduced-effects mode | Reduced-effects mode removes flashes and slow-mo |
| **M8** | UI integration | Implement `UI_DESIGN.md` (once supplied) via the adapters | UI matches the doc. No gameplay code changed |
| **M9** | Balance, QA and ship | Tune `balance.ts`, playtest 3 full runs, perf pass, e2e test, README, production build, deploy guide | Acceptance checklist (§26) fully green |

---

## 26. Acceptance checklist

**Core**
- [ ] A new player can move, jump, attack, and understand the goal within 30 seconds of starting.
- [ ] Full run (menu → victory) is possible with keyboard+mouse **and** with a gamepad.
- [ ] Bow, sword, and staff are each clearly useful. No single weapon trivializes the game.
- [ ] Summon works, soldiers fight, expire, and can die. Rescuing villagers visibly upgrades the squad.
- [ ] All five enemy types plus Imp behave as specified, with readable telegraphs (no unavoidable hits).
- [ ] Slow from the Hexer is obvious (visuals + audio), refreshes without stacking, and is removed when that Hexer dies.
- [ ] Sky Caller's Rain of Soldiers is telegraphed, interruptible, and its imps dissolve when the caller dies.
- [ ] Enemies shoot arrows that can be dodged, deflected with the sword, or blocked by the Shieldbearer.
- [ ] Each district can be liberated (waves → banner → gate) and the world visibly changes.
- [ ] Captives, chests, shrines, and upgrades work. Coins persist across respawns (minus 10%).
- [ ] Boss fight has 3 distinct phases, is fair, and is beatable.

**Spectacle**
- [ ] Slash, arrow, lightning, crush, and generic kills are **visibly different**.
- [ ] Elite and last-enemy kills trigger slow-mo and camera punch.
- [ ] The boss death cinematic plays fully, is skippable, and ends in Victory.
- [ ] Player death scene plays and returns cleanly to the last shrine.

**Technical**
- [ ] 60 FPS under the stress scenario (§23). No console errors or warnings in a full run.
- [ ] All numbers are in `balance.ts`. Nothing is hard-coded in entities.
- [ ] Lint, unit tests, and e2e pass in CI. `npm run build` output runs from a static host in a subfolder.
- [ ] Settings and save/continue work, including corrupted-save recovery.
- [ ] `UIScene` can be replaced without touching gameplay (verified by swapping in a blank adapter).

---

## 27. Assumptions and open questions

Devin: use the **Default**, record it in `DECISIONS.md`, and keep it easy to change.

| # | Question | Default |
|---|----------|---------|
| 1 | Pixel-art or HD hand-drawn style? | HD/vector-friendly (`pixelArt: false`). Flip `ART_STYLE` if the UI doc says pixel |
| 2 | Logical resolution | 960 × 540, FIT scaling |
| 3 | Death penalty | Lose 10% coins, respawn at last shrine |
| 4 | Is the village setting Indian/Kerala-inspired? | Yes, per §18.4, overridden by the owner's doc |
| 5 | Mobile/touch controls | Not in MVP. Architecture-ready |
| 6 | Real art and audio supplier | Placeholder now. Owner will supply or approve sources |
| 7 | Gore level | Stylized ichor/ash, with a reduced-effects toggle |
| 8 | Phaser version | Latest stable 3.x, pinned |
| 9 | Hosting | Static build (itch.io / Netlify / GitHub Pages compatible) |

---

## 28. Working rules for Devin

1. **Plan before coding.** After reading this spec, write a short `docs/PLAN.md` (architecture summary, risks, anything you'd change) and proceed without waiting unless truly blocked.
2. **Small, reviewable commits.** One logical change per commit. Message format `feat(combat): ...`, `fix(ai): ...`.
3. **Never** hard-code balance numbers, magic strings for events, or asset keys. Use `balance.ts`, `GameEvents`, `manifest.ts`.
4. **Every system with logic gets unit tests**, especially anything in §24.
5. **Show your work:** at each milestone attach a GIF or screenshots and a short "what to try" list.
6. **Do not expand scope.** Record good ideas in `docs/IDEAS.md` instead.
7. **Ask only when blocked.** When the spec is ambiguous, use the Default ([Section 27](#27-assumptions-and-open-questions)) and log it.
8. **When the UI doc arrives, stop and integrate it (M8) before polishing.** The UI spec wins over any placeholder decision here.
9. Keep the game **always runnable** on the main branch.

---

*End of specification. Name of the game: **Bheem**.*
