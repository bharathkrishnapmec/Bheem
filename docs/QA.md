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
