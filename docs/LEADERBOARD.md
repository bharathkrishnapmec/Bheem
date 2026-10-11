# Leaderboard and Boss Trials

## How it works
- **Offline first.** With no `VITE_LEADERBOARD_URL` the game uses `LocalProvider` ("Offline / This device only"): top 20 per board and period in `localStorage`. With a URL set, `RemoteProvider` talks to the Worker and `LocalProvider` still mirrors personal bests.
- **Boards** (`src/shared/boards.ts`): `story_score` (desc, tie: lower time) and one `trial_<boss>` per trial-eligible boss (asc adjusted time, tie: fewer hits). Periods: `all` and `week` (ISO week, Monday 00:00 UTC). Only each device's best per board/period is kept.
- **Trials** (Main Menu → BOSS TRIALS): Normal strength, every upgrade at tier 1, 2 Spearmen + 1 Archer squad, no toolbox/reset/boss select, no checkpoints (death ends the attempt). Adjusted time = fight time + 6 s per hit taken. The clock stops at the killing blow and excludes pauses.
- **Practice runs** (`RunSession`): Creative mode, any modifier, a debug key, `?debug`/`?seed` URL flags, the tab hidden > 60 s during a trial, or a balance override. Practice runs save a local best marked "(practice)" and can never be submitted.
- **Offline queue** (`SubmitQueue`): failed submits are kept (max 20, 24 h, and never past the token expiry) and retried on start and on the `online` event.

## Honest security
A browser game cannot be made cheat-proof. The server "trusts but verifies":
- single-use HMAC run tokens (`HMAC_SHA256(secret, runId|board|issuedAt|build|nonce)`), 30 min for trials and 90 min for Story;
- wall-clock check: `now - issuedAt ≥ timeMs - 2 s`;
- plausibility floors (v3 §B8): Story ≥ 12:00; trials ≥ 90 / 80 / 70 / 25 s (Kaalasura / Garjana / Nishachara / Brute). These are deliberately conservative. Recalibrate to 60 % of the fastest legitimate time after playtesting;
- the Story score is recomputed on the server from reported stats with the same `scoring.ts`, and capped by `maxPossibleScore`;
- rate limits: 1 submit / 10 s per device, 30 submits / h and 60 starts / h per hashed IP (429 + `Retry-After`). IPs are hashed with an hourly salt and never stored;
- CORS allowlist, 4 KB body cap, unknown fields rejected, shared name filter (`src/shared/names.ts`, server extension list in `server/src/profanity.ts`).
Rejections are generic; the client never learns which rule failed.

## API (`server/src/index.ts`)
```
POST /v1/run/start   { board, deviceId, buildVersion }  → { runId, token, issuedAt, expiresAt }
POST /v1/run/submit  { runId, token, board, name, deviceId, buildVersion, result } → { status, rank?, best?, reason? }
GET  /v1/boards/:board?period=all|week&limit=25&offset=0 → { entries: [{rank,name,value,hits?,at}], total }
GET  /v1/boards/:board/me?period=all|week&deviceId=…     → { rank, entry, neighbours } | { rank: null }
GET  /v1/health → { ok: true, version }
```
The optional admin delete endpoint from v2 §A5.4 is not implemented. Remove rows with `wrangler d1 execute` instead.

## Deploy (needs your Cloudflare account)
```bash
cd server
npx wrangler d1 create bheem             # put the id into wrangler.toml
npx wrangler d1 execute bheem --remote --file=schema.sql
npx wrangler secret put RUN_TOKEN_SECRET # long random string
# edit ALLOWED_ORIGINS / BUILD_VERSIONS in wrangler.toml, then
npx wrangler deploy
```
Then set `VITE_LEADERBOARD_URL` (and `VITE_BUILD_VERSION`, matching `BUILD_VERSIONS`) in Vercel and redeploy. No secret is ever read by the client bundle.

## Tests
`tests/unit/leaderboard.test.ts`, `leaderboardClient.test.ts` and `server.test.ts` (in-memory store) cover scoring, boards, names, taint, the queue, the local board, tokens and every endpoint. `tests/e2e/trials.spec.ts` covers the Trials flow, the death and retry path, and practice taint via `?debug=1`.
