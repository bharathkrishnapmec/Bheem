# QA

## Automated

```bash
npm run lint      # ESLint
npm run test      # Vitest: damage/armor, statuses, cooldowns, rally/summon, targeting, tokens,
                  # district FSM, economy/loot, boss phases & attack choice, RNG, TimeController, SaveManager, level
npm run test:e2e  # Playwright: smoke (boot → menu → new game → move → attack → pause, zero console errors)
                  # + full flow (4 districts liberated → Kaalasura → Victory) + death → game over → retry
npm run build     # tsc --noEmit + vite build
```

## Manual checklist

- [ ] Menu: New Game / Continue (only with a save) / Settings, keyboard + mouse + gamepad
- [ ] Movement: run, coyote jump, jump-cut, crouch, drop-through (S+Space), dash (i-frames)
- [ ] Sword 3-hit combo, air attack, crouch attack, deflects arrows
- [ ] Bow charge (full-charge flash, pierce), ammo pickups and regen
- [ ] Staff bolt chains + Shocked; Thunderclap telegraph, cost, stun
- [ ] Each district: waves → banner shield drops → destroy banner → gold liberation, celebrants, gate opens
- [ ] Captives (hold E), shrine heal + checkpoint + upgrade shop, chests
- [ ] Rally fills on kills; R summons squad; composition grows with rescues
- [ ] Death → game over → retry from last checkpoint (coin penalty)
- [ ] Boss: arena locks, intro, 3 phases, Dark Rain safe column, desperation, death cinematic, victory stats
- [ ] Settings: volumes, reduced effects, key rebinding persist after reload
- [ ] F3 debug overlay

## v2/v3 boss, Trials and leaderboard pass
Automated: `npx tsc --noEmit -p .`, `npm run lint`, `npm run test` (unit + Worker API with an in-memory store), `npm run build`, `npm run check:secrets`, `npm run boss:sim`, `npm run test:e2e` (desktop, Pixel 7, iPhone 14 emulation). E2E boss kills use the `window.__BHEEM__` hooks, not real combat.

Boss tuning: HP was tuned with `npm run boss:sim` (mid-skill profile inside every target range). The v3 rule "three first-time players finish inside the target" still needs human playtesters.

Manual checklist:
- [ ] Each boss (Kaalasura, Garjana, Nishachara, Brute Champion) reaches every phase, Guard breaks and recovers, phase heals and supply crates arrive, soft enrage starts on time
- [ ] Creative Boss Select: four cards fit, Boss strength Classic/Normal/Legendary and HP/damage sliders change the card HP and the fight
- [ ] Boss Trials: fixed loadout, Tab/Backspace/B do nothing, death ends the attempt, Retry < 1 s, result shows fight time / hits (+6 s) / adjusted / PB
- [ ] `?debug=1` trial saves a "(practice)" local entry; Submit stays disabled
- [ ] Leaderboard screen: board and period switching, empty state, "Offline / This device only" label; with a Worker URL: loading, error + Refresh, populated list, pinned "You" row
- [ ] Real phones (not just emulation): touch controls in all three arenas, Safari audio unlock, rotate overlay
