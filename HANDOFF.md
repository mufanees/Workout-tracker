# Handoff: Reps workout tracker

Everything a new person or a new Claude session needs to pick this up cold. Read this first, then `README.md` (deployment and user-facing docs).

## Where things stand (2 Oct 2026)

| | |
|---|---|
| Repo | `mufanees/workout-tracker` |
| Branch | `ccr-82a33bbf-3kimrv` (all work is here; nothing merged to `main` yet, no PR opened) |
| Hosted preview | Private Claude artifact: https://claude.ai/artifact/Cg23G2PSbJtSp6GNDqv4Sb (owner's Claude account only; see "The Claude-hosted copy" below) |
| Production | **Not deployed yet.** Target is the owner's self-hosted Coolify instance (Dockerfile build). |
| Owner's phone | Android, Chrome. Trains with dumbbells at home. Garmin HRM-Dual strap. Zone 2 = 120–145 bpm. |

### Next steps, in order

1. **Deploy to Coolify** (README → "Deploy on Coolify"). Dockerfile build, port 3000, env `APP_TOKEN`, persistent volume at `/data`, HTTPS domain. The Docker image has **never been built** (no Docker daemon in the build sandbox), so the first deploy is its first real test. `npm run build` and the server do run fine on Node 22.
2. On the phone: open the domain in Chrome, install to home screen, Settings → paste `APP_TOKEN` → Connect.
3. Move data from the Claude-hosted copy: in the artifact, Settings → **Copy backup**; in the deployed app, Settings → **Paste a backup**.
4. Pair the HRM-Dual for real (only tested with a simulated strap so far).
5. Optionally add the MCP connector in Claude (README → "Importing a plan").
6. Optionally open a PR from the branch into `main` and point Coolify at `main`.

## What the app does

A PWA replacing Hevy for one person. Offline-first, self-hosted sync.

- **Training:** routines with folders, live workout logging (previous values as grey placeholders, one-tap ✓ accepts them), set types (warm-up/normal/failure/drop), supersets, rest timer, swipe to delete with undo, notes, reorder/replace exercises, finish → summary with PRs, edit past workouts, save workout as routine.
- **Dumbbell Comeback plan** (from the owner's sheet) seeded as 8 routines (Phase 1–4 × A/B) in a folder, plus a plan card that tracks week 1–12, alternates A/B, flags rest days, and starts week 1 with 2 sets. Plan variations (e.g. "1 s pause") are stored as notes on the base exercise so progress carries across phases.
- **History:** week stats and streak, 12-week bars, workout cards with PR counts, workout detail.
- **Exercises:** ~930 exercises (75 curated + free-exercise-db), detail page with records and a progress chart, custom exercises.
- **Heart rate:** Web Bluetooth (standard Heart Rate Service), live zone display on every workout, optional target zone with a 15 s out-of-zone buzz, "Zone 2 cardio" quick start, HR stored with the workout, summary card (chart with zone bands, time in each zone), 12-week zone trends on History, editable zones.
- **Body tab:** body weight log (7-day average, week/month change, chart) and intermittent fasting timer (goal presets, ring, history bars, streak).
- **Morning check:** 60 s reading with the strap → resting HR + HRV (RMSSD from R-R intervals), 30-day baseline verdict, trend chart; manual entry fallback. Store `readings`.
- **Zone 2 weekly goal** ring on Body (setting `zone2Goal`, minutes).
- **Shoulder check-in** (0–10) in the finish sheet (`Workout.shoulder`), trend card on Body that flags a rise of ≥1 point vs the previous two weeks.
- **Stall detection** (`stats.ts stalledAt`): same top weight 3 sessions with no rep gain → "Stalled" tag → one-tap 70% / 2 sets.
- **Warm-up / cool-down checklists:** `Routine.warmup/cooldown` (string lists, editable in the routine editor, part of plan import); copied into the workout with tick state in `Workout.checks`. Seed version 3 refreshes unedited built-in routines.
- **Push notifications** (`server/push.mjs`, `src/push.ts`): dependency-free web push. VAPID keys generated once and kept in SQLite; jobs scheduled by key (`rest`, `fast`, `train`); the server sends an empty push and the service worker fetches the text from `/api/push/inbox` using its endpoint URL. Rest pushes are sent 2.5 s after the end and cancelled if the app beeped on screen.
- **Nightly backups:** `VACUUM INTO /data/backups/reps-YYYY-MM-DD.db`, newest 14 kept (`BACKUP_DAYS`).
- **AI coach** (`src/screens/Coach.tsx`, `src/coachContext.ts`, `server/coach.mjs`): the phone builds a text summary of the training data and sends it with the chat; the server adds the coach system prompt and streams Claude's reply over SSE using `@anthropic-ai/sdk` (`claude-opus-5-5`, adaptive thinking, effort medium, `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`, training data in a cached system block). Needs `ANTHROPIC_API_KEY` on the server; without it, tapping a question copies question + summary for pasting into Claude. "Ask your coach about it" on the post-workout screen opens `/coach?review=<id>`.
- **Motivation:** `Settings.quotes` (seeded from `src/data/quotes.json`, the owner's list), shown on Train (consistency quotes after 3+ days off), the post-workout screen, Coach, and training-day notifications; capitalised words are highlighted. Progress card on Train (`stats.ts recentWin`).
- **Plan import:** in-app (copy a prompt for Claude, paste the JSON back, preview, add) or via the MCP endpoint (`import_plan` tool).
- **Data:** Copy/Paste backup (clipboard), Export/Import backup file, server export at `GET /api/export`.

## Architecture

```
Phone (PWA)                                      Coolify container
┌──────────────────────────────┐                 ┌───────────────────────────────┐
│ Preact UI (signals)          │                 │ server/server.mjs (Node 22)   │
│ IndexedDB  ← every edit      │  POST /api/sync │  static dist/ + SPA fallback  │
│ dirty list → sync.ts ────────┼────────────────►│  /api/sync  (LWW, seq numbers)│
│ service worker (offline)     │◄────────────────┤  /api/export                  │
│ Web Bluetooth → hr.ts        │                 │  /mcp/<token> (server/mcp.mjs)│
└──────────────────────────────┘                 │  SQLite /data/reps.db         │
                                                 └───────────────────────────────┘
```

- **Client:** Preact 10 + `@preact/signals`, Vite 7, TypeScript (strict). No router library: hash routes in `src/router.ts`. Icons: `lucide-preact` only (owner's rule: Lucide icons, no emojis). Font: Space Grotesk (self-hosted via `@fontsource-variable/space-grotesk`).
- **Server:** zero npm dependencies. Node 22.13+ built-in `node:sqlite`. One table `records(store, id, updated_at, deleted, data, seq)` plus `meta(dbId)`.
- **Shared:** `shared/planImport.mjs` is plain JS used by both the app (Vite) and the server. Typings in `shared/planImport.d.mts`.

### Key files

| File | What it does |
|---|---|
| `src/store.ts` | Signals for all data, IndexedDB writes, seeding, active workout persistence (written in the same tick as each edit) |
| `src/sync.ts` | Push dirty records, pull changes since `syncSeq`, one IndexedDB transaction per apply, per-field merge for settings, DB-reset detection |
| `src/db.ts` | IndexedDB wrapper (DB `reps`, version 2) |
| `src/validate.ts` | Sanitises records from sync/import so malformed data can't crash the app |
| `src/seed.ts` | Builds the exercise library and the Comeback plan routines |
| `src/data/curated.json`, `src/data/library.json` | Exercise library rows `[name, muscle, equipment, type, video?]` |
| `src/workout.ts` | Start/finish workouts, routine diff/update, rest timer + sound |
| `src/stats.ts` | Previous sets, PR index, exercise records |
| `src/plan.ts` | Comeback plan week/phase/next-day logic |
| `src/hr.ts` | Bluetooth HR connect/reconnect, zones, 5 s sampling into the active workout, target-zone alerts, HR summaries |
| `src/ui/WorkoutEditor.tsx` | The set-logging editor used for live workouts, past-workout edits and routines |
| `src/ui/HR.tsx` | Live HR panel, HR summary card, HR chart, zone trends |
| `src/screens/*` | Train, Live, History (+ detail, edit), Exercises, RoutineEditor, Settings, Body, ImportPlan |
| `src/sw.js` | Service worker template; `vite.config.js` fills in the precache list at build time |
| `server/server.mjs` | HTTP server, auth, sync, export, static files |
| `server/mcp.mjs` | MCP (JSON-RPC over HTTP, JSON responses, no SSE) |
| `server/push.mjs` | Web push: VAPID signing, job scheduler, inbox for the service worker |
| `src/push.ts` | Subscribe/unsubscribe, schedule/cancel notifications |
| `src/screens/BodyCards.tsx` | Morning check (HR/HRV), zone 2 goal, shoulder trend |
| `server/coach.mjs` | AI coach endpoint (system prompt, streaming, error mapping) |
| `src/coachContext.ts` | Plain-text training summary sent to the coach |
| `src/ui/Quote.tsx`, `src/data/quotes.json` | Quotes and their display |
| `scripts/artifact.mjs` | Bundles `dist/` into one HTML file (used for the Claude-hosted copy) |
| `scripts/library.mjs` | Rebuilds `src/data/library.json` from free-exercise-db JSON |
| `scripts/icons.mjs` | Renders PNG icons from `public/favicon.svg` with Playwright |
| `qa/` | Playwright UI walkthrough scripts and seed data (see Testing) |

### Data model (see `src/types.ts`)

Synced stores: `exercises`, `routines`, `workouts`, `settings` (single record id `settings`), `body`, `fasts`, `readings`. Server-only tables: `push_subs`, `push_jobs`, `push_inbox`, `meta` (dbId, VAPID key). Every record has `id` and `updatedAt`; deletes are tombstones `{id, deleted: true, updatedAt}`.

- Weights are always stored in **kg**; lb is display-only (rounded to 0.5 lb).
- Dumbbell exercises log the weight of one dumbbell.
- `Workout.hr` is `[secondsSinceStart, bpm][]`, sampled every 5 s. `Workout.targetZone` is optional.
- `WSet.tw/tr/ts` are planned values copied from a routine, used only as placeholders.
- `Settings.hrZones` = upper bpm of zones 1–4 (default `[119, 145, 160, 175]`); `Settings.ft` = per-field change times for merging.
- Device-only (not synced): the active workout (`meta.active` in IndexedDB), rest timer and sync key (localStorage), paired HR strap id (localStorage).

### Sync protocol

`POST /api/sync` with `Authorization: Bearer <APP_TOKEN>`, body `{since, changes: [{store, id, updatedAt, deleted, data}]}`. The server keeps the newer `updatedAt` (last write wins), stamps each accepted write with an increasing `seq`, and returns `{seq, dbId, changes}`: everything with `seq > since`, plus the winning version of anything it rejected. If `dbId` changes or `seq` goes backwards (database replaced), the client re-uploads everything. Seed records use `updatedAt: 1` and are not synced unless edited; seed ids are deterministic slugs (`x-goblet-squat`, `r-comeback-1a`) so every device agrees.

### MCP

`POST /mcp/<APP_TOKEN>` (or `/mcp` with a Bearer header). Methods: `initialize`, `ping`, `tools/list`, `tools/call`; notifications get 202. Tools: `get_plan_format`, `search_exercises`, `import_plan`, `list_routines`, `recent_workouts`, `exercise_progress`, `body_stats`. `import_plan` writes exercises and routines straight into SQLite; the app picks them up on its next sync. The server reads `src/data/*.json` and `shared/` at runtime; the Dockerfile copies both into the image.

Plan JSON format and the matching rules live in `shared/planImport.mjs` (`PLAN_FORMAT`, `planPrompt`, `matchExercise`, `resolvePlan`). Matching scores exact names, an equipment hint (weak for "Bodyweight"), hand-picked exercises and name length.

## Running and testing

```bash
npm install
npm run build                       # tsc --noEmit + vite build
APP_TOKEN=testkey DATA_DIR=./data npm start    # http://localhost:3000
npm run dev                         # Vite on :5173, proxies /api to :3000
```

There are no unit tests. The owner asked for QA by **actual UI walkthrough**, so QA here means Playwright driving a phone-sized Chromium and reading the screenshots.

```bash
APP_TOKEN=testkey DATA_DIR=/tmp/reps-data node server/server.mjs &
node qa/seed.cjs        # 17 past Comeback workouts via the sync API
node qa/seed2.cjs       # body weights, fasts, cardio workouts with HR
node qa/walk4.cjs       # superset logging, undo, warm-up, finish sheet (SCHEME=light for light mode)
node qa/walk5.cjs       # simulated Bluetooth strap, zone 2 cardio, HR summary, Body tab
node qa/seed3.cjs       # stalled Hammer Curl, rising shoulder ratings, morning readings
node qa/walk7.cjs       # warm-up checklist, stall nudge, shoulder check-in, 60 s HRV reading, settings
node qa/walk8.cjs       # quotes, progress card, coach chat, coach review after a workout (needs a coach backend; see below)
node qa/walk6.cjs       # MCP-imported folder, paste import, library search (run the MCP import in qa/ notes below first)
```

Scripts write screenshots to `qa/shots*/` (git-ignored). They default to `/opt/node22/lib/node_modules/playwright` and `/opt/pw-browsers/chromium`; override with `PLAYWRIGHT=` and `CHROMIUM=`. All use 390×844 at 2× with touch; `walk3.cjs` uses 360×760 light mode. `walk5.cjs` mocks `navigator.bluetooth` with a fake strap sending 8-bit HR values.

The coach can be tested without an API key by pointing the server at a stand-in for the Anthropic API that streams a canned reply in the real event format: start one on a port and run the server with `ANTHROPIC_API_KEY=fake ANTHROPIC_BASE_URL=http://localhost:<port>`. The stand-in used in this session also saved the request body, which confirmed the model, beta header, fallbacks, thinking, effort and cache settings.

To exercise MCP import by hand:

```bash
node -e "const plan=require('./qa/plan.json');fetch('http://localhost:3000/mcp/testkey',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'import_plan',arguments:{plan}}})}).then(r=>r.json()).then(j=>console.log(j.result.content[0].text))"
```

## The Claude-hosted copy

Because the owner wanted to train before the server was deployed, the app is also published as a private Claude artifact (link above), built with `npm run single`. Things to know:

- It lives in the owner's claude.ai account; another account can't open or update it. A new account would publish its own copy from `dist/reps-single.html`.
- Data is stored only in that browser/app (per-artifact IndexedDB). No sync: the sync call is blocked there and the status shows offline.
- Blocked there: Bluetooth (no heart rate), file downloads (use Copy backup), service worker (no offline), install to home screen.
- The Claude Android app and Chrome keep **separate** copies of the data.

## Owner preferences (keep these)

- Dead simple, minimal, exceptional UX. QA through real UI walkthroughs, plus adversarial reviews.
- No emojis anywhere in the UI. Icons from Lucide only.
- Space Grotesk; visual direction from the owner's references: lime (`#c6f432`) hero card, black pill tab bar, big numerals, uppercase micro-labels, dark default with a light theme.
- No coloured left border ("spine") on cards.
- Self-hosted over Supabase.
- Heart rate: all zones always visible; alerts only when a target zone is set (Zone 2 cardio sets it to 2; strength has none by default).

## Known gaps and ideas

- **Unverified:** the coach against the real Claude API (no key in the build sandbox; tested with a stand-in that checks the request shape), whether the HRM-Dual sends R-R intervals over Bluetooth (if not, the morning check gives resting HR only), real push delivery through Google's push service (signing verified locally), Docker build, a real HRM-Dual pairing, behaviour inside the Claude Android app's webview, `navigator.bluetooth.getDevices()` auto-reconnect after a page reload (Chrome may require re-picking the strap).
- Bluetooth stops when Android turns the screen off; the app keeps the screen awake by default during workouts.
- iPhone: no Web Bluetooth (Bluefy browser would work). Rest-timer sound can't fire while iOS has the app backgrounded.
- From the UX review, not done: "add to routine?" wording when an exercise was replaced; equipment filter / dumbbell-first ordering in the exercise picker; plan card hides during an active workout; a bare "Squat" matches "Box Squat" in plan import.
- No accounts: one `APP_TOKEN` per server. Anyone with it (or the MCP URL) can read and write the data.
- Conflict handling is last-write-wins per record (per field for settings).

## History of the work

1. Built the app, server and sync; seeded the plan; Playwright walkthroughs; fixed issues found on screen.
2. Two adversarial reviews (code and UX) in parallel; fixed 13 code findings (undo stale closures, sync races, DB reset, DST week bug, import validation) and most UX findings.
3. Restyle to the owner's references (Space Grotesk, lime/black), removed the superset spine, switched to Lucide icons.
4. Published the Claude-hosted copy so the owner could train immediately; made active-workout saves immediate; added Copy/Paste backup.
5. Added Bluetooth HR, zones and trends, body weight, fasting.
6. Added the ~930-exercise library, in-app plan import and the MCP endpoint.
7. Added nightly backups, push notifications, shoulder check-in, stall detection, morning HR/HRV, zone 2 goal, warm-up/cool-down checklists.
8. Added the AI coach and motivation (quotes, progress card).

Commit history on the branch tells the same story in more detail (`git log`).
