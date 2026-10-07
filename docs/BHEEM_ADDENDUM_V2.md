# BHEEM: Addendum v2 (Leaderboards, 2 New Bosses, Lava + Sky Arenas)

> **Read order for Devin:** `BHEEM_PROJECT_SPEC.md` → the Creative/Mobile prompt → **this addendum** → `UI_DESIGN.md` (visuals).
> This file **extends** the spec. Section numbers like "spec §12" refer to `BHEEM_PROJECT_SPEC.md`. Section numbers like "§A3" refer to this file.

### Paste this to Devin

```
Read BHEEM_PROJECT_SPEC.md, then BHEEM_ADDENDUM_V2.md, and implement the addendum on top of the existing game.
Rules: the addendum overrides the spec ONLY where §A0 says so. All numbers go in balance.ts. Everything must work on desktop and on a phone (touch).
Build in the milestone order in §A12 (M10 to M14). Keep main always runnable. Do not expand scope; log ideas in docs/IDEAS.md.
For the leaderboard, the game MUST be fully playable with no backend (local leaderboard fallback). Never put secrets in client code.
```

---

## A0. What this addendum adds, and what it overrides

| # | Addition | Where it lives |
|---|----------|----------------|
| 1 | **Leaderboard system** (local + online) with anti-cheat basics | §A2 to §A5 |
| 2 | **Boss 3: Garjana, the Storm Archer** (flying, thunder, Wither-style phases) | §A7 |
| 3 | **Boss 4: Nishachara, the Veiled Blade** (invisible ninja, shadow clones) | §A8 |
| 4 | **Two new arenas:** **Lava Forge** (lava floor) and **Sky Citadel** (battle in the sky) | §A6 |
| 5 | **Boss Trials:** ranked time-attack mode (this is what the leaderboards rank) | §A4 |

**Overrides of earlier documents (and only these):**
1. Spec §12 and the Creative prompt said "do not invent new bosses." That is lifted **for exactly the two bosses below**. Kaalasura and the Brute mini-boss are unchanged.
2. Spec §15's rule "no bottomless pits in the vertical slice" does **not** apply to the two new arenas. They use the safe-fall rules in §A6.
3. Spec §12.2's "×0.8 telegraph in phase 3" gets a **floor**: no boss attack telegraph may drop below **350 ms** (melee) or **450 ms** (ranged) after phase scaling.
4. Story mode is **unchanged**. Kaalasura is still the final boss of the story. The new bosses and arenas appear in **Creative Mode** and **Boss Trials** (and in Sandbox arena choices). Do not insert them into the story campaign.

Everything else in the spec still applies: placeholder-first art, `balance.ts` for all numbers, telegraphs for every attack, pooling, 60 FPS, reduced-effects mode, UI via `UIAdapter`.

---

## A1. New files and folders

```
src/
├─ shared/                     # code used by BOTH the game and the leaderboard server
│  ├─ boards.ts                # board ids, sort rules, plausibility limits
│  ├─ scoring.ts               # score + trial-time formulas (pure functions)
│  └─ types.ts                 # request/response types
├─ leaderboard/
│  ├─ LeaderboardService.ts    # facade used by the game
│  ├─ LocalProvider.ts         # localStorage, always available
│  ├─ RemoteProvider.ts        # fetch() to the Worker API
│  ├─ SubmitQueue.ts           # offline queue + retry
│  └─ RunSession.ts            # run start/stop, tamper flags, stats collection
├─ entities/boss/
│  ├─ bossRegistry.ts          # EXTEND: add garjana, nishachara
│  ├─ garjana/ (Garjana.ts, GarjanaPhases.ts, StormOrb.ts, LightningArrow.ts, ThunderColumn.ts, WindBarrier.ts)
│  └─ nishachara/ (Nishachara.ts, NishacharaPhases.ts, ShadowClone.ts, Kunai.ts, SmokeCloud.ts, VeilController.ts)
├─ level/arenas/
│  ├─ lava_forge.level.json
│  ├─ sky_citadel.level.json
│  └─ training_yard.level.json
├─ world/hazards/
│  ├─ LavaZone.ts, Geyser.ts, CrumblingPlatform.ts, MovingPlatform.ts
│  ├─ VoidZone.ts, UpdraftVent.ts, WindGust.ts, GrappleAnchor.ts
│  └─ EnvironmentalKill.ts
├─ modes/trials/ (TrialsMode.ts, TrialResultPanel.ts)
├─ ui/leaderboard/ (LeaderboardScreen.ts, NameEntry.ts, SubmitPrompt.ts)   # visuals from UI_DESIGN.md
server/                        # separate deployable (Cloudflare Worker), imports ../src/shared
├─ src/index.ts, src/validate.ts, src/rateLimit.ts, src/profanity.ts
├─ schema.sql, wrangler.toml, .env.example
docs/LEADERBOARD.md            # API + deploy guide
```

---

## A2. Leaderboard system: overview

### A2.1 Principles
- **The game never depends on the server.** No backend configured → the leaderboard screen works with a **local** board (top 20 per board on this device). Backend down → keep playing, queue the submission.
- **No accounts, no personal data.** An anonymous `deviceId` (random UUID in localStorage) plus a display name (3 to 12 chars). Do not store IP addresses. For rate limiting use a short-lived hash of the IP (TTL ≤ 1 h) and never persist it.
- **Fairness first:** Creative Mode, cheats, and debug tools can **never** reach a leaderboard (§A5).
- **Honest security:** a browser game cannot be 100% cheat-proof. We do "trust but verify" (§A5): signed run tokens, server-side recomputation and plausibility limits, rate limiting. Say this plainly in `docs/LEADERBOARD.md`.

### A2.2 Boards

| Board id | Ranks | Sort | Tie-break | Eligible mode |
|----------|-------|------|-----------|---------------|
| `story_score` | Total story score (spec/prompt §5) | **desc** | lower `timeMs` | Story, full clear only (boss defeated) |
| `trial_kaalasura` | Adjusted time | **asc** | fewer hits taken | Boss Trials |
| `trial_garjana` | Adjusted time | **asc** | fewer hits taken | Boss Trials |
| `trial_nishachara` | Adjusted time | **asc** | fewer hits taken | Boss Trials |
| `trial_brute` | Adjusted time | **asc** | fewer hits taken | Boss Trials |

**Periods:** `all` (all-time) and `week` (ISO week, resets Monday 00:00 UTC). Only the player's **best** entry per board per period is kept (upsert only if better).

Board definitions live in `src/shared/boards.ts` and are the single source of truth for both client and server. Adding a boss to the registry with `trialEligible: true` must automatically create its `trial_<id>` board (generate the board list from the registry).

### A2.3 Provider interface

```ts
// src/leaderboard/LeaderboardService.ts
export interface LeaderboardProvider {
  getTop(board: BoardId, period: Period, limit: number, offset: number): Promise<BoardPage>;
  getMine(board: BoardId, period: Period): Promise<MyRank | null>;     // rank + neighbours (±3)
  startRun(board: BoardId): Promise<RunTicket>;                        // returns signed token (remote) or a local id
  submit(ticket: RunTicket, result: RunResult, name: string): Promise<SubmitOutcome>;
}
// Selection: if import.meta.env.VITE_LEADERBOARD_URL is set → RemoteProvider (with LocalProvider as mirror for personal bests)
// otherwise → LocalProvider only. The UI shows an "Offline / This device only" label in local mode.
```

`LocalProvider` always records the player's **personal best** per board, even when online (so offline play still feels rewarding).

---

## A3. Leaderboard UX

**Entry points:** Main Menu → **LEADERBOARD** button (touch friendly, same size class as the other menu buttons). Result screens (Story victory, Trial result) show **Submit** (§A3.3) and **View Leaderboard**.

### A3.1 Leaderboard screen
- **Tabs (horizontal scroll on mobile):** Story · Kaalasura · Garjana · Nishachara · Brute. Generated from the board list.
- **Period toggle:** All-Time / This Week.
- **List:** rank, name, value (score, or `m:ss.mmm` time), "hits" for trials. Top 50 loaded in pages of 25 (infinite scroll or "Load more").
- **"You" row:** your best rank is pinned at the bottom, highlighted (**rank, name, value**). If you are outside the top 50, show the 3 entries above and below you.
- Top 3 get a distinct treatment (gold/silver/bronze, per `UI_DESIGN.md`).
- **States (all required):** loading skeleton, empty ("Be the first!"), offline/error with a **Retry** button, local-only label.
- Refresh button, plus pull-to-refresh is **not** used (conflicts with the touch rules).
- Fully usable by touch, keyboard, and gamepad (focus ring on rows, tabs reachable with LB/RB).

### A3.2 Name entry
- First time a player submits: prompt for a name (3 to 12 chars, `A-Z a-z 0-9 space _ -`), prefilled with a generated name like `Bheem4821`. Stored in settings. Editable in Settings.
- On mobile, use a real `<input>` element overlay so the native keyboard works (a canvas can't open one).
- Reject names failing the profanity filter with a friendly message. The server enforces the same filter (never trust the client).

### A3.3 Submit flow
After a **Story victory** or **Trial victory**:
1. Show the result panel (score or time, hits taken, rank preview if online).
2. **First time:** ask "Submit to the global leaderboard?" with a "Don't ask again / Always submit" choice stored in settings. Later runs follow the stored choice.
3. Submission outcomes shown to the player: `New personal best!`, `Rank #N`, `Not your best (best: X)`, `Saved offline, will retry`, `Rejected` (generic wording, never reveal the validation rules).
4. Failed network → put in `SubmitQueue` (max 20 items, expiring after 24 h, since run tokens expire) and retry on next app start and when the connection returns (`online` event).

---

## A4. Boss Trials (the ranked mode)

**Why:** story scores are long and cheaty to compare. Trials give a short, fair, repeatable challenge with a fixed loadout. This is what makes the boss leaderboards meaningful.

### A4.1 Entry
Main Menu → **BOSS TRIALS** (separate from Creative). Boss cards come from `bossRegistry` where `trialEligible = true` (Kaalasura, Garjana, Nishachara, Brute). Card shows: your best adjusted time, your rank (if online), difficulty badge.

### A4.2 Fixed rules (identical for everyone)
| Rule | Value |
|------|-------|
| Loadout | Sword, Bow, Thunder Staff; **upgrades at tier 1 each** (`balance.trials.loadoutTier = 1`); full HP/Prana/arrows at start |
| Summon | Allowed (base squad: 2 Spearmen + 1 Archer, **Rally starts full**, one use) |
| Pickups | Boss arena drops Amrit orbs on a fixed schedule (`balance.trials.healDrops`: at 66% and 33% boss HP). No other healing |
| RNG | **Fixed seed per boss per build** (`balance.trials.seed[bossId]`), so patterns are identical for everyone |
| Cheats, toolbox, debug keys, slow-mo | **Disabled** |
| Retries | Unlimited; each attempt is a new run. Dying ends the attempt (no respawn); "Retry" restarts in < 1 s |
| Intro | Skip-able 1.5 s intro. Timer starts on the first **player control** after the intro |
| Pause | Allowed, but **the clock stops only while paused** (`performance.now()` delta excluded). Server also checks wall-clock (§A5) |

### A4.3 Result formula (pure function in `src/shared/scoring.ts`)

```ts
adjustedTimeMs = fightTimeMs + hitsTaken * balance.trials.hitPenaltyMs;   // 3000 ms per hit taken
// Lower is better. Hits taken counts every hero damage event (not i-frame-blocked hits).
// A dash through an attack that is i-framed does NOT count as a hit.
```
Show **Fight time**, **Hits taken (+penalty)**, **Adjusted time**, **Personal best** and **Rank**. Show a "NEW BEST" flourish.

### A4.4 Trial flow
`TrialsMode` (like `CreativeMode`) sets `GameContext.mode = 'trial'`, `modifiers = {}`, loads the boss's default arena, runs the fight with the **real death cinematic** (skippable; the clock stops at the killing blow, not at the end of the cinematic), then shows `TrialResultPanel` with **Submit / Retry / Boss Select / Leaderboard**.

---

## A5. Anti-cheat and server

### A5.1 Run tokens
1. Game calls `startRun(board)` → server returns `{ runId, issuedAt, expiresAt, token }`, where `token = HMAC_SHA256(secret, runId|board|issuedAt|buildVersion|nonce)`. `expiresAt = issuedAt + 45 min` (story) / `+ 15 min` (trials). Token is **single-use**.
2. On submit, the server verifies the HMAC, that it is unused and unexpired, and that `now - issuedAt` is **≥ the claimed `timeMs` minus 2 s tolerance** (you cannot finish a 3-minute run in 10 seconds of wall-clock).

### A5.2 Plausibility limits (`src/shared/boards.ts`, shared by client and server)
| Board | Rule |
|-------|------|
| `story_score` | `timeMs ≥ 360 000` (6 min); `score` ≤ `maxPossibleScore` computed from the level's enemy totals; Imp kills capped (`balance.score.impKillCap = 60`); recompute `score` **server-side from the reported stats** (kills by type, rescues, districts, chests, no-damage bonuses) using `scoring.ts`, and reject if it differs from the submitted score |
| `trial_kaalasura` | `fightTimeMs ≥ 25 000` |
| `trial_garjana` | `fightTimeMs ≥ 30 000` |
| `trial_nishachara` | `fightTimeMs ≥ 25 000` |
| `trial_brute` | `fightTimeMs ≥ 8 000` |
| All | `hitsTaken ≥ 0` integer, `buildVersion` is current or previous, name passes filter, stats sum consistently |

The minimums come from `bossHp / maxPlausibleDps` and must be tuned in `balance.ts` after playtesting (put a comment saying so). Use generous bounds. Rejecting honest players is worse than letting a slightly suspicious score in.

### A5.3 Run tamper flags (client side, `RunSession`)
A run is **tainted** (and cannot submit) if any of these happen: mode is `creative`, any `GameContext.modifiers` flag was ever true, any debug hotkey was used (even in dev builds), `?debug` or `?seed` URL flags present, the tab was hidden for more than 60 s during a trial, a custom `balance` override is detected. Tainted runs still save a **local** personal best, marked "(practice)".

### A5.4 Server rules
- **Rate limits:** 1 submit per 10 s per `deviceId`; 30 submits/hour per hashed-IP; 60 `startRun`/hour per hashed-IP. Return 429 with `Retry-After`.
- **CORS:** allow only the configured game origin(s).
- **Payload caps:** 4 KB body max. Reject unknown fields.
- **Name moderation:** basic denylist (English + a small configurable list), strip repeated characters, trim. Keep the list in `server/src/profanity.ts` and make it easy to extend.
- **Upsert only if better;** keep `createdAt` of the best run.
- **Moderation endpoint (admin, optional):** `DELETE /v1/admin/entry/:id` requires `ADMIN_KEY` secret. Document it, keep it off by default.
- **Never log** device IDs with IPs together. No analytics in this addendum.
- **Future (not now):** deterministic replay verification. The spec's seeded RNG makes this possible later. Do **not** build it, but keep `RunResult.inputLogHash?: string` as an optional field.

### A5.5 API (Cloudflare Worker, TypeScript; default stack)

> **Default:** Cloudflare Workers + D1 (same TypeScript stack, free tier friendly). Any equivalent (Supabase Edge Function + Postgres, etc.) is allowed if you log the decision in `DECISIONS.md` and keep the **same API contract**.

```
POST /v1/run/start     { board, deviceId, buildVersion }                      → { runId, token, issuedAt, expiresAt }
POST /v1/run/submit    { runId, token, board, name, deviceId, buildVersion,
                         result: RunResult }                                   → { status: 'accepted'|'not_best'|'rejected', rank?, best?, reason? }
GET  /v1/boards/:board?period=all|week&limit=25&offset=0                      → { entries: [{rank,name,value,hits?,at}], total }
GET  /v1/boards/:board/me?period=all|week&deviceId=…                          → { rank, entry, neighbours: Entry[] }
GET  /v1/health                                                                → { ok: true, version }
```

```ts
// src/shared/types.ts
interface RunResult {
  mode: 'story' | 'trial';
  timeMs: number;               // story: total run time; trial: fight time (excluding pauses)
  hitsTaken: number;
  score?: number;               // story only; server recomputes
  stats?: {                     // story only
    kills: Partial<Record<EnemyType | 'boss', number>>;
    rescued: number; districtsLiberated: number; chests: number; noDamageDistricts: number; deaths: number;
  };
  inputLogHash?: string;        // reserved
}
```

```sql
-- server/schema.sql
CREATE TABLE runs (
  run_id TEXT PRIMARY KEY, board TEXT NOT NULL, device_id TEXT NOT NULL,
  issued_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0,
  build TEXT NOT NULL
);
CREATE TABLE scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board TEXT NOT NULL, period_key TEXT NOT NULL,          -- 'all' or '2026-W41'
  device_id TEXT NOT NULL, name TEXT NOT NULL,
  value INTEGER NOT NULL,                                  -- score (desc) or adjusted ms (asc)
  hits INTEGER NOT NULL DEFAULT 0, time_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (board, period_key, device_id)
);
CREATE INDEX idx_scores_rank ON scores (board, period_key, value);
```
Rank is computed by `COUNT(*)` of strictly better rows + 1 (with the tie-break from §A2.2). Add the indexes needed to keep `GET` under 100 ms.

### A5.6 Config
`.env` (client): `VITE_LEADERBOARD_URL`, `VITE_BUILD_VERSION`. Worker secrets: `RUN_TOKEN_SECRET`, `ALLOWED_ORIGINS`, `ADMIN_KEY` (optional). Provide `.env.example`. **No secret may ever appear in the client bundle** (add a CI grep check for the secret names).

---

## A6. New arenas and hazards

Both arenas are loaded through the existing `LevelLoader` (extend the schema, §A6.4). They are used as: boss arenas, **Sandbox choices** in Creative Mode (Training Yard / Lava Forge / Sky Citadel), and Trial arenas.

### A6.1 Lava Forge (the floor is lava)

**Look:** a ruined demon forge. Dark basalt platforms over a glowing lava lake, chains and anvils, orange rim lighting, rising embers, heat shimmer (disabled in the mobile preset, replaced by a simple orange glow gradient).

**World:** 1800 × 900 px. Lava surface at `y = 780`. Platforms form 3 rows (low/mid/high). The main central platform is large (400 px) and **never crumbles** (safe anchor).

| Feature | Behavior |
|---------|----------|
| **Lava (`LavaZone`)** | Touching it: **15 damage**, applies **Scorch** (burn 4 dmg/s for 2 s, no stacking, refresh), and **auto-launches** the hero (vy = −640) in an arc toward the nearest safe platform with 0.8 s i-frames. This is a punishment, **not instant death**. (Spec: no frustration pits.) A "sizzle" FX and a 70 ms hit-stop play. Hero can dash out of the launch. |
| **Geysers (`Geyser`)** | Fixed vents on platforms. Cycle: idle 4 s → **glowing crack telegraph 1.0 s** → eruption 0.6 s (column 220 px tall × 56 px wide, **14 damage**, knock-up). Positions fixed per arena, phase-offset so they never all fire at once. |
| **Crumbling platforms** | After the hero stands on one for 0.6 s it shakes 0.6 s then **sinks into lava** and is gone for 4 s, then rises back (with a rising animation). Telegraph is visible (cracks + dust). Enemies/allies do not trigger crumbling, but fall with it. |
| **Moving platforms** | 2 platforms on a sine path (horizontal 240 px, period 6 s) and 1 vertical lift (160 px, period 5 s). Carry actors standing on them. |
| **Grapple anchors** | Ceiling anchor points (used by Nishachara's hook, §A8). Decorative chains for the hero. |
| **Environmental kill** | Regular enemies (not elites/bosses) knocked into lava die instantly with a **sizzle-and-char death** (§A6.5). Elites take 60 damage and are launched back. |

**Allies in Lava Forge:** soldiers spawn on the nearest platform, never path into lava (ledge-aware), and teleport-fade to the hero if stranded, as per spec §10.5 leash.

### A6.2 Sky Citadel (the whole battle is in the sky)

**Look:** ruined temple islands floating above a sea of clouds. Distant lightning in dark clouds, god-rays when the storm calms, wind-blown cloth banners, drifting cloud layers (parallax 5 layers, with a clear sky-gradient from storm purple at the top to golden-pink at the horizon). Weather intensity is driven by boss phase (§A7).

**World:** 2200 × 1400 px. **There is no ground.** Main island 520 px wide at `y = 1000`; 6 smaller islands at varied heights; 2 slow-drifting islands (±120 px, period 8 s). The bottom of the world (`y = 1400`) is the **void**.

| Feature | Behavior |
|---------|----------|
| **Void & Cloud Catch (`VoidZone`)** | If the hero falls below `y = 1250`: **15 damage**, "wind gust catches you" animation, and the hero is placed at the **nearest safe island** (precomputed `fallRespawnPoints`) with 1.0 s i-frames. Not a death. (Dying from falls alone is impossible unless HP ≤ 15; fine.) |
| **Updraft vents (`UpdraftVent`)** | 4 vents on islands with a visible swirling column. Hero entering gets **vy = −740** (about 380 px lift), air control retained, and can dash/attack in the air. This is how the hero reaches Garjana. Vents have a 600 ms re-trigger lock. |
| **Wind gusts (`WindGust`)** | Phase 3 of Garjana only: telegraphed horizontal gust (cloud streaks + whistle 1.0 s) pushes actors **±90 px/s** for 2 s. Never pushes the hero off an island on its own (cap the push so the hero can always stand against it with a held direction). |
| **Drifting islands** | Carry actors. Never drift to leave the camera bounds. |
| **Environmental kill** | Regular enemies knocked off an island fall through the clouds with a **tumbling-fall death** (§A6.5). Elites are caught by wind and take 60 damage. |
| **Camera** | Vertical follow enabled, bounds `1400` tall. Slight zoom-out to 0.9 in this arena for readability of vertical play. Zoom is fixed per arena (`arena.cameraZoom`). |

### A6.3 Training Yard (existing Sandbox arena, now one of three Sandbox choices)
Unchanged from the Creative prompt. Sandbox arena picker: **Training Yard / Lava Forge / Sky Citadel**. In Sandbox the hazards run with their normal rules and the toolbox **Hazards** toggle can pause geysers/crumbling/wind for experimentation.

### A6.4 Level schema extensions

```ts
// extend src/level/levelSchema.ts (all new fields optional so older levels stay valid)
interface LevelData {
  // …existing…
  arenaType?: 'story' | 'arena';          // arena maps may have districts: []
  cameraZoom?: number;                    // default 1.0
  lavaZones?: Rect[];
  voidZones?: { rect: Rect; fallRespawnPoints: Vec2[] }[];
  geysers?: { x: number; y: number; periodMs: number; phaseOffsetMs: number }[];
  crumblingPlatforms?: { rect: Rect; standMs: number; shakeMs: number; respawnMs: number }[];
  movingPlatforms?: { rect: Rect; path: 'sine-x' | 'sine-y'; amplitude: number; periodMs: number; phaseMs?: number }[];
  updrafts?: { rect: Rect; vy: number; relockMs: number }[];
  grappleAnchors?: Vec2[];
  bossSpawn?: Vec2;
  heroSpawn: Vec2;
  safeAnchors?: Vec2[];                   // always-safe platforms (used for ally spawn and respawn)
  skyPreset?: 'storm' | 'calm';           // sky arena lighting
}
```
Validation must check: every `fallRespawnPoint` and `safeAnchor` lies on solid ground; every platform is reachable with base jump, dash, or updraft (extend the spec's reachability checker to include vents and lava-launch arcs); no hazard overlaps a spawn point. The schema validator reports clear errors with the item index.

### A6.5 Environmental death scenes (new `KillType` values)
Add `'lava' | 'void'` to `KillType` (spec §13.1) and to `DeathFX`:
- **lava:** body ignites on contact (orange flash 60 ms), sizzles and chars to black in 250 ms, crumbles to ash that rises with the heat, steam puff, small lava splash. Hit-stop 40 ms, light shake. Dissolve skipped (already ash).
- **void:** body tumbles (spin 540°/s), shrinks with distance, a cloud ripple ring appears where it passes through the cloud layer, a faint "whoosh-fade" SFX. The camera does **not** follow the body.
Environmental kills give **+25 score** (cosmetic) and a "+25 ENVIRONMENT" popup. They count as normal kills for Rally. They add to `RunResult.stats.kills` as normal. **Bosses are immune** to environmental kills (they fly, grapple, or teleport back).

### A6.6 Hero hazard effects
- **Scorch** is a new status in `StatusEffectSystem`: 4 dmg/s for 2 s, refresh no stack, red-orange flicker on sprite + ember trail + HUD status icon (`player:status` includes `'scorch'`). Cannot be cleansed by dash. Extinguished by entering **water**? There is none, so it simply expires.
- Reduced-effects mode removes heat shimmer and screen flicker but keeps the telegraph glows (gameplay-critical).

---

## A7. BOSS 3: Garjana, the Storm Archer

**Fantasy:** a winged thunder-archer who rules the storm. He hovers above the arena, hurls lightning, and shields himself with wind when hurt. Think of a Wither-style fight: **ranged pressure, orbs to destroy, and a barrier phase where your usual tool stops working.**

**Arena:** Sky Citadel. **Registry:** `id: 'garjana'`, `arenas: ['sky_citadel']`, `trialEligible: true`, `phases: 3`.

### A7.1 Stats

| Stat | Value |
|------|-------|
| HP | **1100** (boss bar with 3 segments; ticks at 66% and 33%) |
| Armor | 0.10 |
| Immunities | Stun, knockdown, knockback, Slow. **Lightning resistance: Thunder Staff damage ×0.2** (he is thunder-born) |
| Size | about 120 × 140 px hurtbox, wings extend visuals |
| Flight | Hovering with a ±12 px bob. Altitude **260 to 380 px above the main island top**. Glides between 3 anchor points (x at 20%, 50%, 80% of arena width) after each attack (0.8 s glide) |
| Damage to hero | per attack table below |

**Weak points (weapon roles):**
- **Bow:** ×1.25 damage (he is airborne, the intended P1 tool) while the Wind Barrier is **down**.
- **Sword:** normal damage. Reach him with **updraft vents** (air attacks), or when he swoops low.
- **Thunder Staff:** ×0.2 damage to him, **but**: a Thunder Bolt that hits a **Storm Orb** absorbs it (+15 Prana, orb destroyed). The staff is a support weapon here, not a damage dealer.
- **Deflect (sword):** deflected Lightning Arrows deal **120 flat damage**, ignore the barrier, and make him flinch (see A7.3). This is the high-skill damage route.

### A7.2 Phases and attacks

FSM: `Hover → Choose → Telegraph → Attack → Recover → Glide`. Never repeats the same attack twice in a row. Bosses pick weighted attacks (rules from spec §12). Phase 3 telegraph scaling applies with the floors from §A0.

**Phase 1: "Gathering Clouds" (100% → 66%)**

| Attack | Weight | Telegraph | Details |
|--------|--------|-----------|---------|
| **Lightning Arrow** | 40 | 700 ms | Red aim line to the hero. Fires one arrow (speed 700, **12 dmg**, `deflectable`). On impact with anything: **Thunder Column** (radius 60, appears after 0.5 s with a ground marker, **14 dmg**). |
| **Thunder Rain** | 30 | 800 ms | 3 ground markers (one under the hero's x, two at ±180 px, +random jitter ≤ 40 px). After the telegraph, columns strike (radius 50, **16 dmg**, 0.3 s duration). Always leaves a safe gap of ≥ 140 px. |
| **Storm Orbs** | 30 | 900 ms | Spawns 3 **Storm Orbs** orbiting him for 1.2 s, then launches them one at a time (0.5 s apart) as slow homing projectiles (speed 200, turn rate 90°/s, lifetime 4 s, **10 dmg** on contact + 0.2 s stagger). Orbs have 20 HP: they can be shot, sworded, or **absorbed by Thunder Bolt for +15 Prana**. Orbs destroyed by the hero drop a Prana orb 30% of the time. |

**Phase 2: "Wind Barrier" (66% → 33%)**
Transition: Garjana ascends to 400 px, roars (1.5 s, invulnerable), clears projectiles, hero gets +20 HP and +30 Prana (spec §12.1 rule). Sky lighting darkens, rain begins.
- **WIND BARRIER (passive):** a swirling barrier surrounds him while hovering. **Arrows (hero and ally) are repelled for 0 damage.** Sword hits and Thunder deal damage as normal (staff ×0.2). A visible "ting" and a "BARRIER!" HUD hint (once, then silent) teach the rule.
- **Barrier drops** for **2.5 s** when: (a) he finishes a **Sky Dive** (he lands low and is **vulnerable at hero height**, all weapons including Bow), or (b) he is **staggered by a deflected arrow** (§A7.3). It flickers for 0.5 s before returning (telegraph).
- Adds to the P1 list (weights rebalanced: Lightning Arrow 25, Thunder Rain 20, Storm Orbs 20, **Sky Dive 20**, **Updraft Burst 15**):

| Attack | Weight | Telegraph | Details |
|--------|--------|-----------|---------|
| **Sky Dive** | 20 | 900 ms | Rises, flashes, then dives in a diagonal line to the hero's position at 900 px/s (**20 dmg**, passes through the island, leaves a **crackling thunder trail** for 1.5 s, 6 dmg/s). Ends low (hero height) → **Recover 2.2 s (punish window, barrier down)**. Never dives off-arena. |
| **Updraft Burst** | 15 | 700 ms | Forces all vents to **surge** (taller column, 2 s) so the hero can launch higher, **and** fires a 3-arrow thunder fan (±14°, **9 dmg** each, `deflectable`) at hero height. Reward/risk: air time is exposed. |

**Phase 3: "Eye of the Storm" (33% → 0%)**
Transition: as above. Storm cloud intensity max, lightning flashes (reduced-effects mode: no flashes, thin outline instead), arena darker, **Wind Gusts** begin (every 12 s).
- Telegraphs ×0.8 with floors. Attack cooldowns ×0.75. Barrier now **also drops for 1.2 s after every Thunder Rain** (so Bow remains useful).
- Adds:

| Attack | Weight | Telegraph | Details |
|--------|--------|-----------|---------|
| **Tempest Barrage** | 25 | 800 ms | Garjana spins, firing **rotating rings of 8 arrows** (3 rings, 0.6 s apart, ring 2 rotated 22.5°, gaps guaranteed ≥ 40°). **8 dmg** each, `deflectable`. |
| **Chain Storm** | 20 | 900 ms | A lightning bolt jumps between the hero, nearby allies, and the 3 closest platforms/vents in a chain, each hop telegraphed with a spark (0.3 s). 3 hops, **11 dmg** each to actors in a 70 px radius of the hop point. |
| **Thunder God's Judgment** (once at 15% HP) | n/a | **2.5 s** | Whole arena goes dark. **Three blue "safe pads"** glow on islands (random 3 of 5 `safeAnchors`). After 2.5 s, **all of the arena except the pads** is struck (**40 dmg**). Standing on a pad (radius 70) = **no damage**. Garjana is vulnerable (barrier down) for 4 s afterward. Fairness: pads are always reachable from the hero position within the telegraph (distance check at selection time, otherwise re-roll pads). |

### A7.3 Stagger by deflection (the skill moment)
When a **sword-deflected** Lightning Arrow, Orb, or Barrage arrow hits Garjana:
- Deals **120 damage flat** (Orb: 60), ignores the barrier.
- **Flinch:** he drops to 120 px above ground level for **1.5 s** (barrier down), a freeze-frame (90 ms) and a thunder "crack" ring. Large gold "PERFECT DEFLECT" popup + score +150 (cosmetic).
- Cooldown on this stagger: 8 s (prevents spam).

### A7.4 Death scene: "The Storm Breaks" (about 8 s, skippable after 2 s; `balance.garjanaDeath` timings)
| t (s) | Beat |
|-------|------|
| 0.0 | Killing blow: hit-stop 400 ms, music ducks, input locked, projectiles dissolve |
| 0.4 | `slowMo(0.15, 2500 ms)`, zoom 1.4 on him. His wings crack and **his own lightning arcs back through his body** (bone silhouette flashes, like the lightning kill) |
| 1.6 | Barrier shatters outward (shard sprites), armor plates fall away and plummet through the clouds |
| 3.0 | Time returns to 0.6. He **falls from the sky as a streak of lightning**, dissolve shader with blue-white edge, a **huge thunderclap ring** pushes the clouds apart |
| 5.0 | Storm clears: sky tween storm → calm, god-rays, birds, islands brighten. A rainbow sprite fades in |
| 7.0 | Camera pulls back. Reward chest of coins on the main island. Result panel / "STORM CALMED" title |

### A7.5 Balance intent
A competent player should clear in **about 2 to 3 minutes**. P1: shoot the Bow, learn orbs/columns. P2: learn to use updrafts + sword and deflects, using dive recoveries for the Bow. P3: dodge patterns, hit the 4 s window after Judgment. Tune in `balance.bosses.garjana`.

---

## A8. BOSS 4: Nishachara, the Veiled Blade

**Fantasy:** a night-walker assassin that **turns invisible, creates shadow copies, vanishes in smoke, and swings across the forge on chains**. The fight tests **observation**: finding the real one and reading telegraphs you can barely see.

**Arena:** Lava Forge. **Registry:** `id: 'nishachara'`, `arenas: ['lava_forge']`, `trialEligible: true`, `phases: 3`.

### A8.1 Stats

| Stat | Value |
|------|-------|
| HP | **850** |
| Armor | 0.05 |
| Immunities | Stun (Thunderclap does damage but no stun), knockdown. Knockback immune. Lava immune (grapples/teleports out) |
| Speed | Run 260, **Shadow Step** teleport (see below) |
| Size | about 30 × 56 px (hero-sized, hard to see when veiled) |
| Clone | 1 HP (any hit kills), 50% damage, same silhouette |

### A8.2 Signature mechanic: THE VEIL (invisibility)

`VeilController` manages three visibility levels:

| Level | Looks like | When |
|-------|-----------|------|
| **Visible** | Normal sprite | Default, and for 1.5 s after taking any damage |
| **Veiled** | **8% alpha body + a distortion outline** (wavy heat-haze edge), plus **soft footstep dust puffs** and cloth-ripple particles while moving | The main state during the fight |
| **Revealed (flash)** | Fully visible, with a purple outline, for 4 s | When caught in a **Thunder Bolt hit or Thunderclap blast** (lightning flash reveals shadows), radius 300 px around the strike |

Rules (fairness, **all required**):
1. **Every damaging attack from a veiled Nishachara has a mandatory tell** of at least **400 ms**: a blade **glint flash** (bright 80 ms flash + whisper SFX panned toward his position) **and** the veil outline flickers to 40% alpha. This is the "ambush warning".
2. An **off-screen direction pip** points to him when he is veiled and off-camera.
3. While veiled he still **casts a faint ground shadow** (see clones, A8.4: *the real one casts a shadow, clones do not*).
4. Veil duration **5 s** (P1), 6 s (P2), 7 s (P3); cooldown 8 s between veils (6 s in P3). He **cannot veil while Exposed** (A8.4).
5. **Accessibility setting "Mark the real Nishachara":** a small purple diamond hovers above the real one at all times, on by default for first-time players, toggle in Settings. Disabled in Boss Trials? **No. Keep the setting available in trials** (it is an accessibility option, not an advantage; do not penalize it).

**Ambush (veiled attack):** Shadow-steps to 120 px behind the hero (can't land inside walls or lava, picks the nearest valid platform spot), telegraph 400 ms (glint), then slashes (hit 1 of a 2-hit combo, **12 dmg**, hit 2 follows after 300 ms, **12 dmg**), then recovers 1.0 s (punish window).

### A8.3 Attacks (all phases unless noted)

| Attack | Phase | Weight | Telegraph | Details |
|--------|-------|--------|-----------|---------|
| **Kunai Fan** | 1+ | 30 | 500 ms | 3 kunai fan (±10°), speed 600, **8 dmg** each, `deflectable`. In P3: 5 kunai. |
| **Shadow Slash Dance** | 1+ | 25 | 350 ms first step | Dashes through the hero twice in a Z shape (dash 700 px/s), **10 dmg** each, 2 hits then **recover 1.1 s**. Both dashes are telegraphed by afterimage trails drawn 350 ms before. |
| **Ambush** | 1+ (needs Veil) | 25 | 400 ms (glint) | See A8.2. |
| **Smoke Bomb** | 2+ | 20 | 450 ms | Throws a bomb to a point. **Smoke cloud** (radius 220, 3.5 s) darkens vision (screen vignette, **not** blocking gameplay UI). Inside the smoke **all of his copies and the real one swap positions randomly** (the "shuffle", §A8.4). He does **not** attack from inside smoke for the first 1.0 s. Smoke does no damage. |
| **Lava Hook Swing** | 2+ | 20 | 600 ms | Grapples to a **ceiling anchor** (chain visual), swings across the arena in an arc and **kicks** at the bottom of the arc (**16 dmg**, knock-back), then lands on a platform. Hero can duck/jump the arc (hitbox only at the arc bottom). Recover 1.4 s. |
| **Shuriken Wheel** | 3 | 20 | 700 ms | Plants himself, then a ring of **8 spinning shuriken** expands outward over 1.5 s (speed 220), **9 dmg**, a rotating gap (≥ 45°) to dash through. Not `deflectable` (spinning blades), but **cuttable** by the sword (destroys a single shuriken). |
| **Thousand Shadows** (once at 15% HP) | 3 | **1.5 s** | A gong chime and the arena dims. **6 clones** + real spawn, all veiled but shimmering. After 1.5 s each attacks in turn (0.3 s apart, **10 dmg** clone / **16 dmg** real). **Thunderclap kills every clone in radius.** Real is "Exposed" for 4 s after the combo. |

### A8.4 Shadow Clones (phase 2+)

- **Phase 2:** summons **2 clones** (cooldown 12 s), up to 2 alive.
- **Phase 3:** **4 clones** (cooldown 10 s), up to 4 alive.
- Clones **mimic** his current attack with a random 0.15 to 0.35 s delay and ±60 px positional offset, so the attack pattern is "doubled" but the **real one's hits do full damage while clones deal 50%**.
- **Telling the real one (learnable):**
  1. The real one has a **ground shadow**. Clones do **not**.
  2. Clones have a **violet edge shimmer** that flickers; the real one has a steady outline.
  3. Clones make a **hollow "tick" footstep**, the real one a normal one.
  4. Accessibility "Mark the real Nishachara" shows a diamond over the real one.
- **Killing a clone:** any hit. It pops in a puff of violet smoke, **+4 Rally**, no loot.
  - **Clone Break reward:** kill **all** clones within 5 s of the summon → Nishachara is **Exposed**: veil dropped, **+30% damage taken, 4 s**, big "CLONE BREAK!" popup + score +100 (cosmetic).
- **Shuffle:** whenever the Smoke Bomb triggers, or when the **real one is hit while clones are alive** (30% chance), the real and clones swap positions randomly (smoke puff on each). Never swap into lava or into the hero.
- **Thunder Staff counter-play:** **Thunder Bolt** hitting any copy reveals all copies in 300 px for 4 s (flash). **Thunderclap** destroys all clones in its radius and reveals the real one for 4 s.
- **Mirror Swap (P3):** mid-attack, the real swaps places with the nearest clone (smoke puff, 0.2 s), keeping the attack going from the clone's position. This is telegraphed by a violet ring flash at both positions 0.3 s earlier.

### A8.5 Lava Forge integration
- He avoids lava. If he would end an action over lava he shadow-steps to the nearest platform.
- **Crumbling platforms** are his destination preference **when the hero is on one** (pressure).
- **Geysers** interact: if a clone is hit by a geyser it pops; the real one is unaffected (immune), showing the player that **geyser-popped clones = free clone kills** (a clever strategy to teach via a hint after the first time).
- Lava Hook Swing uses `grappleAnchors` from the level data.

### A8.6 Death scene: "The Veil Falls" (about 7 s, skippable after 2 s; `balance.nishacharaDeath`)
| t (s) | Beat |
|-------|------|
| 0.0 | Killing blow: hit-stop 350 ms, **he becomes fully visible** for the first time with a bright flash. All clones pop in a chain reaction, one after another (60 ms apart) |
| 0.5 | `slowMo(0.2, 2000 ms)`. He kneels on a crumbling platform. His mask cracks in two, revealing glowing eyes that dim |
| 2.0 | The veil drops from him like a cloak (cloth sprite sliding off) and **burns up in the lava glow** |
| 3.0 | Shadow strands unravel from his body (additive streaks), and his body **disintegrates into shadow smoke** that drifts upward (dissolve shader with violet edge) |
| 4.5 | The forge cools: lava glow tween from orange → dim red. Platforms stop crumbling (hazards paused). Embers settle |
| 6.0 | Reward coin chest rises on the main platform. "VEIL LIFTED" title, then result panel |

### A8.7 Balance intent
Clear in about 2 to 3 minutes. P1 teaches the Veil and its tell. P2 teaches clones and the shadow tell, rewarding Thunder Staff as a **reveal tool**. P3 stacks clone count + lava hook + shuriken wheel. Tune in `balance.bosses.nishachara`.

---

## A9. Registry update (`bossRegistry.ts`)

```ts
export interface BossDef {
  id: BossId;
  name: string; title: string;
  hp: number; phases: 1 | 2 | 3;
  thumbnailKey: string;
  arenas: ArenaId[];            // first = default
  trialEligible: boolean;
  difficulty: 1 | 2 | 3 | 4 | 5;
  factory: (scene: GameScene, spawn: Vec2) => Boss;
  introCard: { line: string };
  deathCinematic: () => Timeline;
}
// Entries (order = Boss Select order):
// kaalasura   | 900  | courtyard    | trial ✔ | difficulty 3
// garjana     | 1100 | sky_citadel  | trial ✔ | difficulty 4
// nishachara  | 850  | lava_forge   | trial ✔ | difficulty 4
// brute_mini  | 160  | courtyard, training_yard | trial ✔ | difficulty 2
```
The Boss Select UI (Creative **and** Trials) is generated from this registry. Cards show arena thumbnail, HP, phases, difficulty (pips), and best time. Adding the two new bosses requires **no UI code changes**, which is the acceptance test for the registry design.

**Creative Boss Select options (extend):** **Arena** picker only shows `arenas` for that boss. Start phase (1/2/3), Allies (none/auto-summon), Skip intro, plus **"Hazards on/off"** (Creative only). Garjana's **Start phase 2/3** sets HP to that phase's threshold and plays the transition. Nishachara's **Start phase 2/3** likewise.

---

## A10. Events, balance and strings to add

**`GameEvents` additions (do not rename existing ones):**
```
'boss:phase'           { id: BossId; phase: 1|2|3 }
'boss:barrier'         { up: boolean }                            // Garjana wind barrier
'boss:exposed'         { until: number }                          // Nishachara exposed / Garjana vulnerable windows
'boss:veil'            { level: 'visible'|'veiled'|'revealed' }
'boss:real-marker'     { x: number; y: number; visible: boolean }  // accessibility diamond
'deflect:perfect'      { damage: number }
'clone:break'          {}
'hazard:lava-hit'      {}
'hazard:fall-catch'    {}
'env:kill'             { type: EnemyType; via: 'lava' | 'void' }
'trial:started' | 'trial:finished'   { bossId: BossId; fightTimeMs?: number; hits?: number; adjustedMs?: number }
'leaderboard:submitted'  { board: BoardId; outcome: SubmitOutcome }
```
**`balance.ts` additions:** `balance.bosses.garjana`, `balance.bosses.nishachara`, `balance.arenas.lava`, `balance.arenas.sky`, `balance.trials` (`loadoutTier`, `hitPenaltyMs`, `seed`, `healDrops`, `minPlausibleMs`), `balance.leaderboard` (page size, name rules, queue limits, rate limits), `balance.garjanaDeath`, `balance.nishacharaDeath`, `balance.score.envKill = 25`, `balance.score.perfectDeflect = 150`, `balance.score.cloneBreak = 100`, `balance.score.impKillCap = 60`.
**`strings.ts`:** all new UI text (boss names/titles, intro lines, tab labels, states, error messages, submit outcomes).

---

## A11. Tests (add to the spec's test plan)

**Unit (Vitest):**
- `scoring.ts`: story score recomputation; imp cap; adjusted time = time + hits × penalty; tie-breaks.
- Board generation from registry (trial board auto-created for each `trialEligible` boss).
- Run token: HMAC create/verify, expiry, single-use, tolerance on wall-clock vs `timeMs`.
- Plausibility rejections (below min time, score mismatch, impossible stats) and acceptance of good runs.
- `RunSession` taint rules (creative, modifiers, debug key, URL flags).
- `SubmitQueue` (retry, expiry, ordering). `LocalProvider` top-20, personal best upsert.
- Name validation + profanity filter (client and server share the code).
- Lava: damage + launch target selection, Scorch no-stack. Void: Cloud Catch picks nearest safe point. Environmental kill rules (elite/boss exclusions).
- Garjana: barrier up/down schedule, deflect damage ignores barrier, stagger cooldown, Judgment safe-pad reachability re-roll, orb absorb prana.
- Nishachara: veil durations, tell ≥ 400 ms invariant (test that **no attack timeline from a veiled state has a telegraph < 400 ms**), clone caps, Clone Break window, shuffle never places into lava/hero, thunder reveal radius.
- Level schema validator accepts the 3 arenas and rejects: unreachable platform, spawn inside lava, missing fall respawn.

**Server (Vitest + Miniflare/`wrangler dev`):** all endpoints, rate limiting, CORS, malformed/oversized bodies, upsert-only-if-better, week key rollover.

**E2E (Playwright, desktop + mobile emulation):** Trials → pick Garjana → fight starts < 1 s → hero takes damage → die → retry; Leaderboard screen with a mocked server (states: loading, empty, error, populated); Nishachara trial with `?debug=1` is **tainted** and the Submit button is absent; Creative never shows Submit.

---

## A12. Milestones (continue from spec §25)

| # | Milestone | Deliverables | Definition of Done |
|---|-----------|--------------|--------------------|
| **M10** | Arenas and hazards | Schema extension + validator, `LavaZone`, `Geyser`, crumbling/moving platforms, `VoidZone`, `UpdraftVent`, `WindGust`, Scorch, lava/void death FX, `lava_forge`, `sky_citadel` levels, Sandbox arena picker, camera zoom per arena | Hero can explore both arenas, take lava/fall consequences, use updrafts. Enemies can be knocked into lava/void. Unit tests pass |
| **M11** | Garjana | Entity, all 3 phases, barrier, orbs, columns, Judgment, deflect-stagger, death cinematic, registry entry, Creative Boss Select integration | Beatable start → victory on touch and keyboard. Telegraph invariants pass |
| **M12** | Nishachara | Entity, `VeilController`, clones, smoke, hook swing, Shuriken Wheel, Thousand Shadows, death cinematic, registry entry | Beatable. Real-one tells work. "Mark the real one" setting works. Invariant tests pass |
| **M13** | Trials + Leaderboard | `TrialsMode`, result panel, `shared/` scoring + boards, `RunSession`, Local/Remote providers, `SubmitQueue`, leaderboard UI, Worker + D1, deploy guide | Local board works with **no** backend. With a backend, the full submit/rank flow works. Tainted runs can't submit |
| **M14** | Integration, balance, QA | Apply `UI_DESIGN.md` to new screens, mobile pass on all new content, balance tuning, perf pass (60 FPS on mid phones, sky/lava presets), docs (`LEADERBOARD.md`, README updates), full QA | Acceptance checklist (§A13) green |

Each milestone ends with lint + unit tests + build passing, a short GIF/screenshots, and a "what to try" list in the PR.

---

## A13. Acceptance checklist

**Arenas**
- [ ] Lava Forge: lava hurts and launches (never instant death), geysers telegraph, crumbling platforms telegraph and recover, moving platforms carry actors.
- [ ] Sky Citadel: no ground; falling is a Cloud Catch (15 dmg + respawn); updrafts let the hero reach Garjana; gusts never make the arena unplayable.
- [ ] Enemies knocked into lava/void die with distinct death scenes. Bosses are immune. Allies never walk into lava.
- [ ] Both arenas work in Sandbox (with the Hazards toggle) and on a phone at 60 FPS (mobile preset).

**Garjana**
- [ ] 3 distinct phases; the barrier makes arrows useless until it drops; deflected arrows ignore it.
- [ ] Storm Orbs can be destroyed or absorbed with Thunder Bolt for Prana.
- [ ] Thunder God's Judgment always has reachable safe pads.
- [ ] Death cinematic plays, is skippable, ends in the result panel.

**Nishachara**
- [ ] Veil is visible as a shimmer, every attack from the veil has a ≥ 400 ms tell + sound + off-screen pip.
- [ ] Real vs clone is distinguishable (ground shadow, edge shimmer, footstep sound) and the accessibility marker works.
- [ ] Clone Break and Thunder reveal work. Shuffle never puts anyone in lava.
- [ ] Death cinematic plays, is skippable, ends in the result panel.

**Leaderboard and Trials**
- [ ] With **no backend configured**, Trials and the leaderboard screen work with a local board labeled "This device only".
- [ ] With a backend: start-run token, submit, rank, week/all-time all work. Replaying a token fails. Submitting 1 s after start is rejected.
- [ ] Creative Mode, cheats, debug keys, and URL flags make a run **tainted** and unable to submit.
- [ ] Offline submit is queued and retried. The player is told "Saved offline."
- [ ] Names are filtered (client **and** server). No secrets in the client bundle (CI check passes).
- [ ] Leaderboard UI is usable by touch, keyboard, and gamepad, with loading/empty/error states.

**Shared**
- [ ] No gameplay numbers outside `balance.ts`; no new boss requires UI code changes (registry-driven).
- [ ] Reduced-effects mode removes flashes/shimmer without removing gameplay telegraphs.
- [ ] Everything is playable on a phone (touch), including Trials and the leaderboard screens.

---

## A14. Defaults and open questions (use the default, log in `DECISIONS.md`)

| # | Question | Default |
|---|----------|---------|
| 1 | Boss names (Garjana, Nishachara) | Placeholders drawn from Sanskrit/Malayalam roots (*garjana* = thunder roar, *nishachara* = night-walker). Owner may rename; names live in `strings.ts` and the registry only |
| 2 | Should the new bosses be in the story? | **No.** Creative + Trials only |
| 3 | Backend host | Cloudflare Workers + D1; the contract in §A5.5 is what matters |
| 4 | Weekly board reset | Monday 00:00 UTC |
| 5 | Hit penalty in Trials | 3000 ms per hit |
| 6 | Real-one marker in Trials | Allowed (accessibility), on by default |
| 7 | Lava damage | 15 + Scorch (4/s × 2 s), launch, never instant death |
| 8 | Fall damage in Sky | 15 + respawn on nearest island |
| 9 | Additional bosses | Out of scope. Log ideas in `docs/IDEAS.md` |

*End of Addendum v2.*