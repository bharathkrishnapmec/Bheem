# BHEEM: Boss Buff Addendum v3 (Stronger, Longer, Still Fair)

> **Read order for Devin:** `BHEEM_PROJECT_SPEC.md` → `BHEEM_ADDENDUM_V2.md` → **this file**.
> **Where this file conflicts with those two, this file wins.** Everything it does not mention stays as written.
> "Spec §N" = `BHEEM_PROJECT_SPEC.md`. "V2 §AN" = `BHEEM_ADDENDUM_V2.md`. "§BN" = this file.

### Paste this to Devin

```
Read BHEEM_BOSS_BUFF_V3.md and apply it on top of the existing game. It makes all four bosses (Kaalasura, Garjana,
Nishachara, Brute Champion) much stronger and longer to defeat by adding a 4th phase to each, a Guard Gauge system,
new attacks, arena pressure, and higher HP and damage. It also keeps the fights fair: telegraph floors, phase heals,
supply drops, and phase checkpoints in Story mode. All numbers go in balance.ts. Build the boss simulator in §B9 and
tune HP until the modelled and playtested fight times land inside the target ranges in §B1. Do not remove any telegraph.
```

---

## B0. Design goal and the rule against "HP sponges"

**Goal:** a boss fight should be a *long, escalating duel* that takes **about 5 to 6 minutes** for a mid-skill player (roughly 3× longer than v2), and should feel **stronger**, not just spongier.

Four levers are used, in this priority order. **HP is the weakest lever and is used last.**

| # | Lever | What it does |
|---|-------|--------------|
| 1 | **A 4th phase** for every boss (thresholds 100 / 75 / 50 / 25 %) | New attacks and arena pressure every phase keep long fights fresh |
| 2 | **Guard Gauge** (§B3) | Adds a skill layer: you must break the boss's guard to get big damage |
| 3 | **New attacks, objectives and arena pressure** (§B4 to §B7) | Pylons, banners, clones, collapsing islands, rising lava |
| 4 | **Higher HP, armor, and damage** (§B2) | Raw stats, tuned last with the simulator (§B9) |

**Pacing rules (apply to every boss):**
1. Every phase lasts **60 to 100 seconds** for a mid-skill player.
2. Every phase has **at least 3 distinct vulnerability windows** (Guard Break, recovery after a big attack, a special objective, etc.), each **≥ 3 seconds** long.
3. **No new phase may be "the same attacks with bigger numbers."** Each phase adds at least one new attack **or** one new arena/objective mechanic.
4. The hero must always be able to see **what is coming** (spec telegraph rules and V2 §A0 floors: ≥ 350 ms melee, ≥ 450 ms ranged after scaling). **Nothing in this file lowers those floors.**

---

## B1. Targets (the numbers that decide whether the tuning is correct)

Measured as **fight time from first control to the killing blow**, excluding pauses and the death cinematic. "Mid-skill" = a player on their 2nd to 4th attempt using the intended tools.

| Boss | HP (v2 → v3) | Phases (v2 → v3) | Mid-skill target | Skilled target | Acceptable mid-skill range |
|------|--------------|------------------|------------------|----------------|----------------------------|
| **Kaalasura, the Hollow King** | 900 → **3600** | 3 → **4** | **6:00** | 3:45 | 5:00 to 7:00 |
| **Garjana, the Storm Archer** | 1100 → **2600** | 3 → **4** | **5:30** | 3:30 | 4:30 to 6:30 |
| **Nishachara, the Veiled Blade** | 850 → **2600** | 3 → **4** | **5:00** | 3:15 | 4:00 to 6:00 |
| **Brute Champion** (mini-boss) | 160 → **900** | 1 → **2** | **1:45** | 1:00 | 1:15 to 2:15 |

HP numbers above are **starting values**. The **time targets are authoritative.** After playtesting, adjust HP (and only HP) until a 3-run average lands in range (§B9, §B10).

Reference hero damage output used for the starting HP (mid-skill, boss targetable): about **25 DPS while attacking**, attacking about **45% of the fight** → **about 11 effective DPS** (Trials loadout, upgrades tier 1). Story with Might 3 is about 30% higher.

---

## B2. Global stat changes

### B2.1 New shared boss tuning block (`balance.bosses.global`)

| Setting | Value | Notes |
|---------|-------|-------|
| `damageScale` | **×1.25** | Applied to **every** boss and boss-summoned **projectile/attack damage** in spec §12 and V2 §A7/§A8 (rounded to nearest int, min 1). Does **not** apply to normal enemies, lava, or environmental hazards |
| `maxHitDamage` | **35** | No single avoidable boss hit may exceed 35 (35% of base hero HP). **Exception:** "safe-spot" ultimates (Judgment, Thousand Shadows, Last Stand) may deal up to **45** to anyone standing outside the safe area |
| `speedScale` | ×1.10 | Boss move/glide/dash speeds. Does **not** shorten telegraphs |
| `gapMs` (idle between attacks) | P1 **1800**, P2 **1500**, P3 **1200**, P4 **900** | Replaces the old flat "Choose" delay. The gap shrinks each phase, so the pace escalates |
| `armor` | see §B2.2 | |
| `comboRule` | **P1 to P2: max 1 attack per choice. P3: up to 2 chained. P4: up to 3 chained**, with ≥ 0.8 s between hits of a chain and a full recovery window after the chain | Each hit of a chain still has its own telegraph |
| Phase thresholds | **100 / 75 / 50 / 25 %** (4 phases) | Boss bar shows 4 segments. Update `boss:hp` and `boss:phase` event types to `1 \| 2 \| 3 \| 4`, and `BossDef.phases` to `1 \| 2 \| 3 \| 4` |

### B2.2 Per-boss base stats

| Boss | HP | Armor | Guard (per phase) | Notes |
|------|----|-------|-------------------|-------|
| Kaalasura | 3600 | **0.20** (was 0.15) | 350 | Immune stun/knockdown (Guard Break is separate, §B3) |
| Garjana | 2600 | 0.12 | 300 | Thunder ×0.2 stays. Guard ignored while the Wind Barrier is up |
| Nishachara | 2600 | 0.08 | 260 | Clone hits do not reduce Guard |
| Brute Champion | 900 | 0.25 | 200 | Super armor on windups stays; Guard Break overrides it |

### B2.3 Sustain for longer fights (so longer ≠ more frustrating)

| Aid | Rule |
|-----|------|
| **Phase transition reward** | Each transition: hero heals **+30 HP**, **arrows refilled**, **+60 Prana**, and **2 Amrit orbs** spawn on the arena (Trials: fixed positions, `balance.trials.healDrops` applies to **every** transition, not just two) |
| **Supply crate** | Every **45 s** of fight time, a crate falls onto a **safe anchor** and drops **1 arrow bundle + 1 Prana orb** (max 2 crates on the field; not during an ultimate telegraph). Same schedule in Trials, so it stays fair |
| **Story phase checkpoints** | If the hero dies in **Story mode**, the retry restarts **at the beginning of the current phase** (boss HP set to that phase's start, hero at full HP/Prana/arrows). The "Retry from phase" label shows the phase number. **Trials: no checkpoints** (death ends the attempt). **Creative:** unlimited Reset (V2/Creative prompt) |
| **Soft enrage (anti-stall)** | After `softEnrage.startMs` of fight time, attack gaps shrink by **8% per minute** (max **30%**). Kaalasura starts at 8:00, Garjana 7:30, Nishachara 7:00, Brute 2:30. This stops infinite kiting without a hard fail |

### B2.4 Creative-only "Boss strength" option

Add to Boss Select (Creative only): **Boss strength:** `Classic` (the v2 numbers, kept in `balance.bosses.presets.classic` for quick practice) / **`Normal`** (this document, **default**) / `Legendary` (HP ×1.5, damage ×1.25 on top, soft-enrage start −2:00). Plus two sliders: **Boss HP ×0.25 to ×4** and **Boss damage ×0 to ×2** (0 = harmless target practice). **Story and Trials always use Normal and cannot be changed.** Any non-Normal setting taints a run (V2 §A5.3), which is automatic because Creative is never submittable.

---

## B3. Guard Gauge (new shared system)

A **Guard Gauge** sits beneath the boss HP bar. It gives players a clear mini-goal and a spectacular payoff, and gives longer fights rhythm.

**Rules (`GuardSystem`, pure logic, unit-tested):**
1. Each phase starts with Guard = `guardMax` (§B2.2). The boss shows a faint shield aura while Guard > 0.
2. While Guard > 0, **HP damage taken is ×0.8** ("Guarded"). Every hit also deals **poise damage** to Guard.
3. When Guard hits 0 → **GUARD BREAK:** the boss is staggered for **4.0 s** and takes **×1.5 HP damage**. Current attack is cancelled (**except** ultimates and phase transitions, which cannot be cancelled and instead leave Guard at 25% afterward). A loud shatter SFX, 90 ms hit-stop, a camera punch, and "BREAK!" popup (+150 score in Story).
4. After the break window, Guard refills to 100% and the boss gains **Guard Recovery** for **8 s** (cannot be broken, shown with a pale shimmer), so the player cannot chain-break forever.
5. **Regeneration:** if the boss takes no Guard damage for **5 s**, Guard regenerates at **+30/s**.
6. **Tuned neutral:** with these numbers the average damage multiplier for mid-skill play is about 1.0, so the HP values in §B1 hold. The simulator (§B9) models this.
7. Phase transitions: Guard resets to full.

**Poise damage per source (`balance.guard.poise`):**

| Source | Poise damage |
|--------|--------------|
| Sword light / air / finisher (hit 3) | 10 / 12 / 18 |
| Arrow tap / full charge | 4 / 14 |
| Thunder Bolt (per target) | 6 |
| Thunderclap | 45 |
| **Deflected projectile** | **80** |
| Soldier hits | 3 each (Elite Captain 6) |
| Pole/hazard hits (geyser pops on clones, etc.) | 0 |

**Why this matters (counter-play):** it rewards the intended tools (deflects, Thunderclap, finisher hits) and makes weapon choice meaningful, instead of a pure HP bar.

**UI event:** `boss:guard { guard: number; max: number; broken: boolean; recoveryUntil?: number }`. The UI draws a bar under the boss HP (visual style from `UI_DESIGN.md`).

**Exceptions:** Garjana's Guard is **frozen** (no damage, no regen) while the Wind Barrier is up, and starts counting again when the barrier drops (§B5). Nishachara's Guard is only damaged by hits on the **real** one.

---

## B4. KAALASURA, the Hollow King (4 phases, 3600 HP)

Arena: Chieftain's Hall courtyard (1600 px). All v2 attacks stay but are **upgraded**; new items are marked **NEW**. All damage listed **already includes ×1.25**.

**Phase 1: "The Warlord" (100% → 75%)**

| Attack | Weight | Telegraph | Details |
|--------|--------|-----------|---------|
| Overhead Slam | 30 | 900 ms | **30 dmg**. Now a **Double Slam**: a second slam follows 0.7 s later, shown by a ground shadow where it will land. Shockwaves on both sides (jumpable). Recovery 1.6 s |
| Bone Bow Fan | 25 | 700 ms | **5 arrows** (±8°), **11 dmg** each, `deflectable` |
| Mire Orbs | 20 | 800 ms | **3** orbs, 3 s homing, Slow on hit (sword cuts them) |
| **NEW: Sweeping Cleave** | 25 | 800 ms | 180° front arc, **28 dmg**, knockback. Counter: dash through the boss (i-frames) or jump over the low arc. Recovery 1.2 s |

**Phase 2: "Call of the Horde" (75% → 50%)**
Adds Phase 1 attacks plus:

| Attack | Weight | Telegraph | Details |
|--------|--------|-----------|---------|
| Rain of Soldiers (upgraded) | 25 | 1000 ms | **3 Imps + 2 Raiders**. Boss takes **×0.3 damage** while 2+ minions are alive (was ×0.4) |
| Stomp Wave | 15 | 600 ms | **4** sequential shockwaves, 0.45 s apart |
| **NEW: Warbanner** | 15 | 900 ms | Plants a **Warbanner** (200 HP, destructible by any weapon). While it stands: **boss damage +20%**, and nearby minions gain +25% speed. **Max 2 banners.** Destroying one gives **+80 Guard damage to the boss** (a clear objective that matters) |

**Phase 3: "Hollow Fury" (50% → 25%)**
Telegraph speed ×0.8 (floors apply). Adds:

| Attack | Weight | Telegraph | Details |
|--------|--------|-----------|---------|
| Rampage Charge (upgraded) | 20 | 800 ms | Charges **3** times with wall bounces, **25 dmg**, stuns himself 1.5 s if he hits a wall mid-charge (**Guard −100**) |
| Dark Rain (upgraded) | 20 | 700 ms | **7** columns over 2.5 s, one safe column guaranteed. Shadow markers 0.6 s early |
| **NEW: Hollow Echo** | 20 | 900 ms | A **spectral copy** of Kaalasura appears for 6 s and **repeats his previous attack 1.0 s later** from a different side (drawn as a translucent ghost with its own telegraph). The echo **cannot be damaged**, but **deflecting its arrows** counts as deflect poise (80) on the real boss |
| Combos (see B2.1) | n/a | per hit | Up to 2 chained attacks, e.g. Slam → Cleave |

**Phase 4: "Hollow King Ascendant" (25% → 0%)**
Transition: hellfire ignites at the arena edges. **Arena pressure:** the outer **200 px on each side** become **Hellfire ground** (**6 dmg/s**, telegraphed by pulsing red cracks for 2 s first). Every **20 s** the hellfire creeps **100 px** inward, down to a minimum safe floor of **900 px**. The safe central area is always shown with a clear boundary line.
- Combos up to **3 chained attacks**. Gap between attacks 0.9 s.
- All Phase 3 attacks plus:

| Attack | Weight | Telegraph | Details |
|--------|--------|-----------|---------|
| **NEW: Hollow Meteor** | 20 | 1000 ms | Leaps off-screen, then **3 meteors** crash at the hero's x, ±220 px, after 0.8 s (shadow markers). **30 dmg**, small shockwave |
| **NEW: Chain of Echoes** | 15 | 900 ms | Two Hollow Echoes at once, 0.6 s apart |
| **Last Stand** (once at 10% HP) | n/a | **2.0 s** | Boss is **invulnerable for 4 s**, spawns **1 Brute + 2 Imps**, hellfire pulses once to the minimum floor, and the hero gets **+20 HP**. Then: **EXECUTION WINDOW**, **8 s** of **×1.5** damage with Guard auto-broken. This is the finishing DPS race, and it is intentionally generous so the final stretch feels climactic |

**Boss-specific rules:** Warbanners are cleared automatically on phase change. Echo ghosts and hellfire never block the hero's only path to the safe zone.

---

## B5. GARJANA, the Storm Archer (4 phases, 2600 HP)

Arena: Sky Citadel. Damage numbers **include ×1.25**. Barrier/deflect rules from V2 §A7 stay.

**Phase 1: "Gathering Clouds" (100% → 75%)**

| Attack | Weight | Telegraph | Details |
|--------|--------|-----------|---------|
| Lightning Arrow | 35 | 700 ms | **15 dmg**, `deflectable`. 40% of casts are a **2-arrow volley** (0.35 s apart). Thunder Column **17 dmg** |
| Thunder Rain | 30 | 800 ms | **4** markers (hero ±160 px, +jitter), **20 dmg** columns, safe gap ≥ 120 px |
| Storm Orbs | 35 | 900 ms | **4** orbs (20 HP each), homing speed 220, **12 dmg**. Absorbing with Thunder Bolt gives +15 Prana |

**Phase 2: "Wind Barrier and Pylons" (75% → 50%)**
Transition as V2. **Barrier rules from V2 §A7.2 apply**, plus:
- **NEW: Storm Pylons.** **3 Pylons** (150 HP each, weak to sword and bow, **Thunder immune**) rise on three different islands. **While any Pylon stands, the Wind Barrier stays up for 4 s longer** after every Sky Dive recovery drop window ends (i.e., the barrier returns **faster**: the open window is shortened from 2.5 s to **1.5 s**).
- **Destroying all 3 Pylons** → **"STORM DOWN"**: the barrier is **disabled for 14 s** and Garjana is **grounded at hero height** (immobile, he cannot fly or glide). **Guard is damaged ×1.5 during Storm Down.** Pylons respawn at the start of the next phase transition (not within the same phase).
- Sky Dive (**25 dmg**, recovery 2.2 s) and Updraft Burst (fan **11 dmg** each) as V2. Lightning Arrow/Orbs continue.
- Barrier Guard rule: Guard is frozen while the barrier is up (§B3).

**Phase 3: "Eye of the Storm" (50% → 25%)**
Wind Gusts every 12 s as V2. Adds:

| Attack | Weight | Telegraph | Details |
|--------|--------|-----------|---------|
| Tempest Barrage (upgraded) | 20 | 800 ms | **4** rings of 8 arrows (0.5 s apart, alternate 22.5° offsets), **10 dmg** each, gaps ≥ 40° |
| Chain Storm | 20 | 900 ms | **4 hops**, **14 dmg** each |
| **NEW: Storm Hawks** | 20 | 700 ms | Summons **2 Storm Hawks** (40 HP, flying, dive attack **12 dmg**, telegraph 500 ms). Hawks drop **Prana orbs** 50% of the time. Max 2 alive. **Killing both** gives a **Guard hit of 80** |
| Barrier drops | n/a | n/a | Barrier now also drops 1.2 s after every Thunder Rain (V2) and **after killing both Storm Hawks (3 s)** |

**Phase 4: "Tempest Ascendant" (25% → 0%)**
- **Arena pressure:** every **15 s** the **smallest remaining outer island crumbles** into the clouds (telegraph: cracks + falling debris for 2.5 s, then it falls). Maximum **3 islands** lost. Sky Citadel guarantees ≥ 5 islands remain, including the main island and all updraft vents.
- Gusts every **8 s**. Barrier drops **only** during Sky Dive recovery and Judgment now (the toughest phase).
- Combos up to 3 chained.
- **Thunder God's Judgment** now occurs **twice**: at **20%** and at **8%** HP. The second has **2 safe pads** instead of 3, a **3.0 s** telegraph, and **45 dmg** outside pads. The pad-reachability check (V2) stays.
- **NEW: Storm Surge** (weight 25, telegraph 1000 ms): the whole arena **pulses** 3 times (0.7 s apart) in expanding rings from Garjana; each ring is jumpable (height 60 px) or dashable. **18 dmg**.
- **Last Stand-style finish (at 8%):** after the second Judgment he is grounded and vulnerable for **8 s** (×1.5, Guard auto-broken).

---

## B6. NISHACHARA, the Veiled Blade (4 phases, 2600 HP)

Arena: Lava Forge. Damage numbers **include ×1.25**. All Veil fairness rules (V2 §A8.2: ≥ 400 ms tell, sound, off-screen pip, real-one marker) are **unchanged and mandatory.**

**Phase 1: "The Veil" (100% → 75%)**

| Attack | Weight | Telegraph | Details |
|--------|--------|-----------|---------|
| Kunai Fan | 30 | 500 ms | **4 kunai** (±8°), **10 dmg**, `deflectable` |
| Shadow Slash Dance | 30 | 350 ms | **12 dmg** ×2 (Z dash), recover 1.1 s |
| Ambush | 40 | 400 ms glint | **15 dmg** ×2 (300 ms apart), recover 1.0 s |

Veil duration 5 s, cooldown 8 s.

**Phase 2: "Echoes" (75% → 50%)**
- **3 clones** (cap 3, cooldown 12 s). Clones deal **50%** (post-scale), die in 1 hit, popping gives +4 Rally.
- Smoke Bomb, Lava Hook Swing (**20 dmg**) added as V2.
- **Clone Break** (kill all clones within 5 s): Exposed for **5 s** (×1.3 damage, was 4 s), **Guard −100**.
- **Mirror Swap** introduced (telegraphed ring flash 0.3 s early).

**Phase 3: "Shadow Storm" (50% → 25%)**
Adds Phase 2 and:

| Attack | Weight | Telegraph | Details |
|--------|--------|-----------|---------|
| Shuriken Wheel (upgraded) | 20 | 700 ms | **10** shurikens, **11 dmg**, gap ≥ 40° |
| Kunai Fan (P3) | 25 | 450 ms | **6** kunai |
| **NEW: Crimson Mark** | 20 | 800 ms | Marks the hero with a red kanji ring over the head for 4 s. **All clones prioritize the marked hero** and the real one "pulls" a ranged attack at 2 s. **Dash cancels the mark** (reward: it is cleansed and the boss recovers 1.0 s). Counter-play is clear and readable |
| **NEW: Platform Purge** | 15 | 1000 ms | **Crumbling-platform cascade:** 3 platforms (never the central safe platform) shake, then sink in sequence 0.6 s apart and respawn after 5 s. Geysers cycle **×1.3 faster** during the purge |
| 4 clones, Clone Break | n/a | n/a | Cap 4, cooldown 10 s |
| Combos (2 chained) | n/a | n/a | Ambush → Kunai Fan, Slash Dance → Ambush, etc. |

**Phase 4: "A Thousand Shadows" (25% → 0%)**
- **Arena pressure: the Lava Tide.** Every **20 s** the lava **rises 60 px** (telegraph: lava glow brightens + rumble for 2 s, platforms flash), **max 3 steps (180 px total)**. The central platform **never submerges** and every platform stays reachable (validator check at each tide step). The tide holds at its maximum and does not rise further.
- **6 clones** at once (cap 6, cooldown 12 s), but clones in P4 have **1 HP and die to Thunder Bolt chain** (chain-hits kill each clone along the chain).
- Veil lasts 7 s, cooldown 6 s. Combos up to 3 chained.
- **NEW: Eclipse Veil** (weight 15, telegraph 1.2 s): the arena dims, **all copies (real + 5 clones)** turn identical (no shimmer difference for 3 s, but the **real still casts the ground shadow** and the accessibility marker still works). Gong chime at start, soft chime when it ends.
- **Thousand Shadows** (V2) now occurs at **20%** and **8%** HP: **8 clones** (3 s total), real **Exposed for 5 s** after the combo. Thunderclap kills all clones in radius (unchanged).
- **Final Stand (at 8%):** real is Exposed for **8 s** (×1.5, Guard auto-broken) after the second Thousand Shadows.

---

## B7. BRUTE CHAMPION (mini-boss, 2 phases, 900 HP)

Arena: Courtyard or Training Yard. Uses the spec Brute stats with these changes.

**Phase 1 (100% → 50%):** Ground Slam (**28 dmg**, shockwave **18 dmg**, windup 800 ms, super armor), Charge (**25 dmg**, 700 ms telegraph, 1.2 s self-stun if it hits a wall, which also deals **Guard −80**). **NEW: Hammer Combo:** slam → backhand (telegraph 500 ms, **24 dmg**), recovery 1.4 s.
**Phase 2 "Berserk" (50% → 0%):** Brute glows. Adds **Double Charge** (two charges, 0.8 s apart), **Shockwave Triple** (3 waves, gaps ≥ 100 px), and on every **third** attack roars and **spawns 2 Imps**. Guard 200 per phase (Phase 2: 160). Soft enrage at 2:30.

---

## B8. Dependent changes (leaderboard, scoring, trials)

These keep the V2 leaderboard correct with the longer, harder fights. **Use these values instead of those in V2 §A4 and §A5.**

| Setting | V2 value | **V3 value** |
|---------|----------|--------------|
| `balance.trials.hitPenaltyMs` | 3000 | **6000** (a hit matters more on a 5-minute fight) |
| `balance.trials.healDrops` | at 66% and 33% | **every phase transition** (3 per fight, 2 Amrit each) plus the supply crates (§B2.3) |
| Trials run token expiry | 15 min | **30 min** |
| Story run token expiry | 45 min | **90 min** |
| Story minimum plausible time (`story_score`) | 6:00 | **12:00** |
| `trial_kaalasura` min fight time | 25 s | **90 s** |
| `trial_garjana` min fight time | 30 s | **80 s** |
| `trial_nishachara` min fight time | 25 s | **70 s** |
| `trial_brute` min fight time | 8 s | **25 s** |
| Boss kill score (Story) | 1000 | **3000** (Kaalasura). Also **+150 per Guard Break**, **+100 per Warbanner destroyed**, capped by `balance.score.maxGuardBreaks = 20` |
| `maxPossibleScore` | per V2 | **recomputed** from `scoring.ts` (the server uses the same function) |

> **Note on minimum times:** these are deliberately conservative, since they exist only to reject impossible runs. Recalibrate after skilled testers set real records: `floor = 60% of the fastest legitimate time`. Rejecting an honest speedrunner is worse than letting a borderline run in.

Story **phase checkpoints** (§B2.3) must **not** let players farm a run: a run that used a phase-retry keeps counting **deaths** and total time (as before). **Trials have no checkpoints**, so the board stays clean.

`bossRegistry` updates:
```
kaalasura   hp 3600 | phases 4 | difficulty 5
garjana     hp 2600 | phases 4 | difficulty 5
nishachara  hp 2600 | phases 4 | difficulty 5
brute_mini  hp 900  | phases 2 | difficulty 3   (name: "Brute Champion")
```
Boss Select cards: show estimated fight length ("About 5 to 7 min" generated from `balance.bosses.targets`).

---

## B9. Boss simulator and telemetry (required)

To avoid guesswork, build two small tools.

**1. `tools/bossSim.ts` (headless, no Phaser):** a model that estimates time-to-kill:
```
for each phase:
  effectiveDps = heroDps(skill) * attackUptime(phase) * guardModifier * armorModifier * bossModifiers(phase)
  phaseTime = phaseHp / effectiveDps + transitionMs + (windowsLost)
total = sum(phaseTime)
```
Inputs (`balance.bosses.sim`): hero skill profiles **Novice 6 / Mid 11 / Skilled 18** effective DPS (post-uptime), Guard break frequency per profile (Novice 0.5/min, Mid 1.5/min, Skilled 3/min), supply/transition times. A Vitest test **fails CI** if the Mid-skill modelled time for any boss is outside the "acceptable range" in §B1. Print a table (`npm run boss:sim`).

**2. In-game fight telemetry (dev builds only):** log per attempt to the console and a JSON download: boss id, phase times, guard breaks, hits taken by attack id, deaths, supply used, total time. Use this in the playtest in §B10 to find phases that run too long or attacks that deal too much damage. **No analytics leave the player's device.**

---

## B10. Tests and acceptance

**Unit (Vitest):**
- `GuardSystem`: break at 0, ×0.8 damage while guarded, ×1.5 in window, 4 s window, refill and 8 s recovery, 5 s regen delay, Garjana freeze rule, "ultimates cannot be cancelled", resets per phase.
- `damageScale` ×1.25 applied once (no double scaling), `maxHitDamage` cap (35, or 45 for safe-spot ultimates). A test iterates every boss attack definition and fails if any exceeds the cap.
- Telegraph floors: **every boss attack in every phase** has `telegraphMs ≥ 350 (melee) / 450 (ranged)` after phase scaling. Fails CI otherwise.
- Phase thresholds at 75/50/25 trigger transitions once each; transitions give the heals/refills; supply crate schedule (every 45 s, cap 2).
- Soft enrage curve (8%/min, cap 30%).
- Arena pressure: hellfire never reduces the safe floor below 900 px; sky never removes the main island or vents; lava tide never submerges the central platform and platforms stay reachable at every tide step (extend the V2 reachability validator).
- Warbanner (200 HP, ≤ 2, +20% damage, Guard hit on destroy); Storm Pylon logic (3 pylons, Storm Down 14 s, barrier window 1.5 s); Crimson Mark cleanse by dash; Hollow Echo repeat timing and deflect poise.
- Leaderboard constants updated (min times, penalty, token expiries); scoring changes; guard-break score cap.
- Boss simulator: Mid-skill time inside range for all four bosses.

**Playtest (manual, recorded in `docs/QA.md`):** **3 full runs per boss** by someone who hasn't seen the fight, plus 1 skilled run. Record time, deaths, hits taken. HP is tuned until the **3-run average** is within the §B1 range.

**Acceptance checklist**
- [ ] Every boss has **4 phases** (Brute: 2), each with its own new attack or arena mechanic. No phase is a "bigger numbers" copy.
- [ ] Guard Gauge works, is visible in the HUD, and is clearly explained by on-screen feedback the first time a Break happens.
- [ ] Mid-skill fight times land inside the ranges in §B1 (3-run average).
- [ ] No unavoidable damage: every attack telegraphs, **no hit above 35** (45 for safe-spot ultimates), safe spots always exist and are reachable.
- [ ] Phase transitions heal and refill; supply crates arrive on schedule; Story phase checkpoints work; Trials have none.
- [ ] Kaalasura Hellfire, Garjana island collapse, and Nishachara Lava Tide **pressure** the player but never make the fight impossible or trap the hero.
- [ ] Soft enrage never kills a run on its own.
- [ ] Creative has Classic / Normal / Legendary and the HP and damage sliders. Story and Trials are locked to Normal.
- [ ] Leaderboard still works with the new constants. Tainted-run rules unchanged.
- [ ] All of it plays on a phone (touch) with the boss HUD (HP, Guard, phase ticks) readable and nothing hidden under the thumb zones.

---

## B11. Milestone

| # | Milestone | Deliverables | Definition of Done |
|---|-----------|--------------|--------------------|
| **M15** | Boss buff and tuning pass | `GuardSystem` + HUD event, 4-phase refactor of all bosses (new thresholds, events, types), all §B4 to §B7 attacks and arena pressure, sustain systems (§B2.3), soft enrage, Creative boss-strength options, leaderboard constants (§B8), `bossSim` + telemetry (§B9), updated unit tests | §B10 checklist green. A 3-run playtest average for every boss falls inside its target range. Main stays runnable throughout |

If Devin has not yet built a boss (M6, M11, M12), implement **this document's version directly** instead of building the v2 version first. The v2 documents then act only as the reference for the shared mechanics (Veil, Barrier, deflect, clones, arenas).

---

## B12. Defaults and open questions (use the default, log in `DECISIONS.md`)

| # | Question | Default |
|---|----------|---------|
| 1 | Is a 5 to 6 minute boss fight too long for mobile players? | Keep it; mitigated by phase transition heals, supply crates, and Story phase checkpoints. Revisit after phone playtests |
| 2 | Should Story offer an easier option? | Not in this version. Creative offers Classic for practice. Log the request for an "Easy" mode in `IDEAS.md` |
| 3 | Boss HP vs time targets disagree after playtests | **Time targets win.** Adjust HP first, then Guard values, then attack gaps. Never shorten telegraphs |
| 4 | New attack names | Placeholders. They live in `strings.ts` |

*End of Boss Buff Addendum v3.*