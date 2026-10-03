# Handoff: Reps workout tracker

Everything a new person or a new Claude session needs to pick this up cold. Read this first, then `README.md` (deployment and user-facing docs).

## Where things stand (2 Oct 2026)

| | |
|---|---|
| Repo | `mufanees/workout-tracker` |
| Branch | `ccr-82a33bbf-3kimrv`. It is the repo's only branch (and its default), so a plain `git clone` gets everything. No `main` yet, no PR. |
| Get the code | `git clone https://github.com/mufanees/workout-tracker.git && cd workout-tracker && npm install` (or `git pull` in an existing clone) |
| Design system | `DESIGN.md` (rules) and `design-system/` (generator + generated files). Also a private Claude Design System artifact: https://claude.ai/artifact/DmFNNgMBC8PN5woMDfjcdk |
| Hosted preview | Private Claude artifact: https://claude.ai/artifact/Cg23G2PSbJtSp6GNDqv4Sb (the owner's current Claude account only; see "The Claude-hosted copy" and "Switching Claude accounts" below) |
| Production | **Not deployed yet.** Target is the owner's self-hosted Coolify instance (Dockerfile build). |
| Owner's phone | Android, Chrome. Trains with dumbbells at home. Garmin HRM-Dual strap. Zone 2 = 120–145 bpm. |

### Next steps, in order

0. **Before switching Claude accounts**, take your data out of the hosted copy (see "Switching Claude accounts"). The code is all on GitHub; the data is not.
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
- **Body tab:** body weight log (7-day average, week/month change, chart, target weight in `Settings.weightGoal`) and a compact fasting card that opens **`/fast`** (`src/screens/Fast.tsx`, logic in `src/fasting.ts`, shared pieces in `src/ui/Fasting.tsx`): plans (`PROTOCOLS`), stage ring (`STAGES`, rough timings), back-dated start/end (`TimeSheet`), plan picker, stats, last-7-days bars, all fasts (editable, with notes), add a past fast. A fast counts toward the day it ended. Starting never overlaps the previous fast. Push job `eat` fires 30 min before the eating window closes (`Settings.fastRemind`).
- **Calendar and day journal** (`src/screens/Calendar.tsx`): History has a list/calendar toggle (remembered in localStorage, `?view=calendar`). Month grid: workout days filled lime with the name, fast-hour pills in blue (solid when the goal was hit, striped while running), gold dot for a weigh-in, grey dot for a note. `/day/YYYY-MM-DD` shows that day's workouts, fasts, weight (log or edit for that day), morning check and a free-text note (synced store `days`). Workout detail has a muscle split card.
- **Morning check:** 60 s reading with the strap → resting HR + HRV (RMSSD from R-R intervals), 30-day baseline verdict, trend chart; manual entry fallback. Store `readings`.
- **Zone 2 weekly goal** ring on Body (setting `zone2Goal`, minutes).
- **Shoulder check-in** (0–10) in the finish sheet (`Workout.shoulder`), trend card on Body that flags a rise of ≥1 point vs the previous two weeks.
- **Stall detection** (`stats.ts stalledAt`): same top weight 3 sessions with no rep gain → "Stalled" tag → one-tap 70% / 2 sets.
- **Warm-up / cool-down checklists:** `Routine.warmup/cooldown` (string lists, editable in the routine editor, part of plan import); copied into the workout with tick state in `Workout.checks`. Seed version 3 refreshes unedited built-in routines.
- **Push notifications** (`server/push.mjs`, `src/push.ts`): dependency-free web push. VAPID keys generated once and kept in SQLite; jobs scheduled by key (`rest`, `fast`, `train`); the server sends an empty push and the service worker fetches the text from `/api/push/inbox` using its endpoint URL. Rest pushes are sent 2.5 s after the end and cancelled if the app beeped on screen.
- **Nightly backups:** `VACUUM INTO /data/backups/reps-YYYY-MM-DD.db`, newest 14 kept (`BACKUP_DAYS`).
- **AI coach** (`src/screens/Coach.tsx`, `src/coachContext.ts`, `server/coach.mjs`): the phone builds a text summary of the training data and sends it with the chat; the server adds the coach system prompt and streams Google Gemini's reply over SSE. It calls the Gemini REST endpoint `v1beta/models/<model>:streamGenerateContent?alt=sse` with `fetch` (no SDK, server has zero npm dependencies), skips `thought` parts, maps `assistant` to Gemini's `model` role, and turns Gemini errors (429 free-tier limit, bad key, unknown model) into readable messages. Env: `GEMINI_API_KEY` (required), `GEMINI_MODEL` (default `gemini-3.5-flash`), `GEMINI_BASE_URL` (testing). Owner chose Gemini over Claude because its free tier costs nothing. Without a key, tapping a question copies question + summary for pasting into Gemini or Claude. "Ask your coach about it" on the post-workout screen opens `/coach?review=<id>`.
- **Coach memory and tools** (`server/coach.mjs`, `src/coach.ts`, `src/screens/CoachMemory.tsx`): chat runs a Gemini function-calling loop (max 6 rounds; raw model parts, including thought signatures, are sent back unchanged; function responses go as role `user`). Tools: `recent_workouts`, `exercise_progress`, `body_stats`, `list_routines` (look-ups via the MCP handler), `remember`, `forget`, `set_commitment`, `resolve_commitment` (written server-side, deduped), and `propose_routine_targets`, `propose_goal`, `propose_profile_update` (sent to the app as SSE `proposal` events; applied on the phone only after Approve). `POST /api/coach/quick` with `kind` `pre` | `workout` | `condense` uses JSON mode (`responseSchema`). The weekly review runs on the server every 30 min and fires Sunday ≥ 18:00 in the profile's time zone (`WEEKLY_REVIEW_ANYDAY=1` bypasses the day check for testing).
- **Motivation:** `Settings.quotes` (seeded from `src/data/quotes.json`, the owner's list), shown as a big rotating hero card at the top of Train (`HeroQuote`: changes every 12 s or on tap, consistency quotes first after 3+ days off), the post-workout screen, Coach, and training-day notifications; capitalised words are highlighted. Progress card on Train (`stats.ts recentWin`).
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

- **Client:** Preact 10 + `@preact/signals`, Vite 7, TypeScript (strict). No router library: hash routes in `src/router.ts`. Icons: `lucide-preact` only (owner's rule: Lucide icons, no emojis). Fonts: Space Grotesk (display) and Inter (reading text), self-hosted via `@fontsource-variable/space-grotesk` and `@fontsource-variable/inter`.
- **Server:** zero npm dependencies. Node 22.13+ built-in `node:sqlite`. One table `records(store, id, updated_at, deleted, data, seq)` plus `meta(dbId)`.
- **Shared:** `shared/planImport.mjs` is plain JS used by both the app (Vite) and the server. Typings in `shared/planImport.d.mts`.

### Key files

| File | What it does |
|---|---|
| `src/store.ts` | Signals for all data, IndexedDB writes, seeding, active workout persistence (written in the same tick as each edit) |
| `src/sync.ts` | Push dirty records, pull changes since `syncSeq`, one IndexedDB transaction per apply, per-field merge for settings, DB-reset detection |
| `src/db.ts` | IndexedDB wrapper (DB `reps`, version 5) |
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
| `server/coach.mjs` | AI coach endpoint: Gemini REST streaming, system prompt, error mapping |
| `src/coachContext.ts` | Plain-text training summary sent to the coach |
| `src/ui/Quote.tsx`, `src/data/quotes.json` | Quotes and their display |
| `scripts/artifact.mjs` | Bundles `dist/` into one HTML file (used for the Claude-hosted copy) |
| `scripts/library.mjs` | Rebuilds `src/data/library.json` from free-exercise-db JSON |
| `scripts/icons.mjs` | Renders PNG icons from `public/favicon.svg` with Playwright |
| `src/cloud.ts`, `src/coachClaude.ts` | Claude-hosted copy: save to the Claude account, coach on Claude |
| `shared/coachSpec.mjs` | Coach system prompt, tools, memory format; shared by the Gemini server and the Claude path |
| `src/coach.ts`, `src/ui/Feedback.tsx` | Coach proposals (apply on Approve), workout feedback card |
| `src/timeplan.ts`, `src/ui/TimeCard.tsx` | Time budget: estimates, pace, planned vs actual |
| `src/rings.ts`, `src/ui/Rings.tsx`, `src/milestones.ts` | Daily rings, celebrations, milestones |
| `src/fasting.ts`, `src/screens/Fast.tsx`, `src/screens/Calendar.tsx` | Fasting, calendar, day journal |
| `src/styles.css` | All styles. Design tokens at the top; motion block near the end |
| `DESIGN.md`, `design-system/` | Design rules; design-system generator and generated files |
| `qa/` | Playwright UI walkthrough scripts and seed data (see Testing) |

### Data model (see `src/types.ts`)

Synced stores: `exercises`, `routines`, `workouts`, `settings` (single record id `settings`), `body`, `fasts`, `readings`, `coach`, `days` (`DayNote`, id = local date). Server-only tables: `push_subs`, `push_jobs`, `push_inbox`, `meta` (dbId, VAPID key). Every record has `id` and `updatedAt`; deletes are tombstones `{id, deleted: true, updatedAt}`.

- Weights are always stored in **kg**; lb is display-only (rounded to 0.5 lb).
- Dumbbell exercises log the weight of one dumbbell.
- `Workout.hr` is `[secondsSinceStart, bpm][]`, sampled every 5 s. `Workout.targetZone` is optional.
- `WSet.tw/tr/ts` are planned values copied from a routine, used only as placeholders.
- `Settings.hrZones` = upper bpm of zones 1–4 (default `[119, 145, 160, 175]`); `Settings.ft` = per-field change times for merging.
- `coach` records (`CoachItem`) have `kind`: `profile` (id `profile`, includes `tz` for the weekly review), `note`, `goal`, `commitment` (`status` open/done/missed/dropped, `due`, `outcome`), `insight` (`type` workout/weekly, `ref` = workout id or week start). The server writes coach records itself (tool calls, takeaways, weekly review) with a fresh seq, so they reach the phone on the next sync.
- `WSet.cw/cr` are coach targets for today (placeholders only); `Workout.coachPlan` holds the pre-workout card. Both are stripped on finish.
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
node qa/walk9.cjs       # hero quote rotation (dark + light), coach
node qa/walk14.cjs      # feedback → coach on Claude → approve routine rework (vite preview + fake-claude)
node qa/walk13.cjs      # artifact copy: data and workout in progress survive closing the page
node qa/walk12.cjs      # home rings, fast-done and workout-done celebrations, showed-up credit (run on fresh seeded data)
node qa/walk11.cjs      # fasting screen, plans, back-dated start, past fast, target weight, calendar, day journal
node qa/walk10.cjs      # coach memory, tool calls, proposals, weekly review, pre-workout targets, takeaway (needs a function-calling stand-in)
node qa/walk6.cjs       # MCP-imported folder, paste import, library search (run the MCP import in qa/ notes below first)
```

Scripts write screenshots to `qa/shots*/` (git-ignored). They default to `/opt/node22/lib/node_modules/playwright` and `/opt/pw-browsers/chromium`; override with `PLAYWRIGHT=` and `CHROMIUM=`. All use 390×844 at 2× with touch; `walk3.cjs` uses 360×760 light mode. `walk5.cjs` mocks `navigator.bluetooth` with a fake strap sending 8-bit HR values.

The coach can be tested without a key by pointing the server at a stand-in for the Gemini API that streams a canned reply in Gemini's SSE format: `GEMINI_API_KEY=fake GEMINI_BASE_URL=http://localhost:<port>`. The stand-in used in this session saved the request, which confirmed the endpoint, key header, roles and system instruction.

To exercise MCP import by hand:

```bash
node -e "const plan=require('./qa/plan.json');fetch('http://localhost:3000/mcp/testkey',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'import_plan',arguments:{plan}}})}).then(r=>r.json()).then(j=>console.log(j.result.content[0].text))"
```

## The Claude-hosted copy

Because the owner wanted to train before the server was deployed, the app is also published as a private Claude artifact (link above), built with `npm run single` (`dist/reps-single.html`, one self-contained file; fonts come from Google Fonts). Things to know:

- It lives in the owner's current claude.ai account. Another account can't open or update it unless the owner shares it from the artifact's Share menu.
- It is published with the artifact capabilities `db`, `user` and `sample`:
  - `db` + `user`: data is saved to the viewer's Claude account (`src/cloud.ts`), in a private `data/users/<user id>` collection, one document per record (`<store>~<id>`) plus `active` for the workout in progress. So it survives closing the page and is the same in the Claude app and the browser, for the same account. The Settings status reads "Saved to your Claude account".
  - `sample`: the coach runs on Claude through the artifact runtime (`src/coachClaude.ts`), no Gemini key needed.
- Blocked there: Bluetooth (no heart rate), file downloads (the Export backup button does nothing; use **Copy backup**), service worker (no offline), install to home screen, push notifications.
- To publish a fresh copy (new account, or after changes): `npm run build && npm run single`, then ask Claude to publish `dist/reps-single.html` as an artifact with capabilities `{"db": {}, "user": {}, "sample": {}}`. To update an existing one, publish to its URL.
- `qa/fake-claude.cjs` stands in for the artifact runtime (`window.claude` db, user, sample) so `walk13`/`walk14` can test this path locally.

## Switching Claude accounts

Code, docs and the design system are all in this repo. Two things are tied to the old Claude account and need moving by hand:

1. **Your training data** (the hosted copy saves to the account that opened it):
   1. In the old account, open the app → Settings → **Copy backup**. It copies one JSON text with everything (workouts, routines, fasts, body weight, readings, coach memory, day notes, settings).
   2. Paste it somewhere safe right away (a note, an email to yourself, or a file). Check the paste isn't empty.
   3. In the new account, publish a fresh copy (see above), open it → Settings → **Paste a backup** → Import. Or, once the Coolify server is up, paste it into the deployed app instead; it then syncs to the server.
   4. Only then stop using the old account. A workout in progress is **not** in the backup: finish it first.
2. **The artifacts.** The new account gets new URLs:
   - App: publish `dist/reps-single.html` as above.
   - Design system: run `python3 design-system/build.py`, then publish `design-system/project/` with the Design System artifact type (index file `project/design-system.json`, every other file under `project/` as supporting files). See `design-system/README.md`.
   - Or share the old artifacts with the new account from their Share menu before switching.

The Coolify deployment (when it exists) doesn't depend on any Claude account: its data is in `/data/reps.db` on the server.

## Owner preferences (keep these)

- Dead simple, minimal, exceptional UX. QA through real UI walkthroughs, plus adversarial reviews.
- No emojis anywhere in the UI. Icons from Lucide only (no hand-drawn icons).
- Space Grotesk for display, numbers and UI; **Inter** for reading text (exercise lists, notes, checklists, coach replies). The owner tried a serif (Source Serif 4) and asked for a sans instead: no serifs.
- One spacing system (`DESIGN.md`): generous spacing, cards 20px padding, 12px apart, sections 32px apart. Use tokens, never raw pixels.
- Big touch targets (44px minimum; set rows 56px) and clear grouping on the workout screen; supersets as one block with one rest timer after the round.
- Time matters most (dad and primary caregiver): keep the time budget, pace and "showed up" credit for short sessions.
- Motion: smooth, quick, never in the way (see `DESIGN.md` → Motion). Solid ring colours, no glow, no tick badge on rings.
- Space Grotesk; visual direction from the owner's references: lime (`#c6f432`) hero card, black pill tab bar, big numerals, uppercase micro-labels, dark default with a light theme.
- No coloured left border ("spine") on cards.
- Self-hosted over Supabase.
- Heart rate: all zones always visible; alerts only when a target zone is set (Zone 2 cardio sets it to 2; strength has none by default).

## Known gaps and ideas

- **Unverified:** the coach against the real Gemini API (Google's docs and API were unreachable from the build sandbox; the request follows the long-standing v1beta REST format and was tested with a stand-in, so if Gemini 3.5 changed something, the server shows Google's error message), whether the HRM-Dual sends R-R intervals over Bluetooth (if not, the morning check gives resting HR only), real push delivery through Google's push service (signing verified locally), a real HRM-Dual pairing, behaviour inside the Claude Android app's webview, `navigator.bluetooth.getDevices()` auto-reconnect after a page reload (Chrome may require re-picking the strap).
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
9. Made the coach stateful: memory (profile + notes), commitments checked after workouts, pre-workout targets, post-workout takeaways, Sunday weekly review with push, Gemini function calling (look-ups, memory writes, approval-gated proposals), condensing long chats. The app sends its routines with each request (`routines` field) because built-in routines only reach the server once edited.
10. Fuller fasting (stages, plans, back-dating, stats, past fasts, notes, eating-window reminder), target weight, History calendar with a day journal and day notes, muscle split on workouts. Owner's references: Easy Fast (fasting, journal, calendar) and Hevy (calendar, workout detail).
11. Daily rings on Train (`src/rings.ts`, `src/ui/Rings.tsx`): Fast, Move (`Settings.moveGoal`, default 30 min; any workout sets `showedUp`, shown as a check), Zone 2 weekly. Celebration screens: `/fast/done/<id>` (`src/screens/FastDone.tsx`) after ending a fast, and the workout summary (`WorkoutCelebration` in History.tsx) with confetti, rings and milestones (`src/milestones.ts`, each tied to the workout or fast that earned it). Warm-up/cool-down items link to a YouTube search (`movementVideoUrl`). Docker image built and run in the sandbox: health check passes, data survives a restart in a named volume; a root-owned bind mount fails with a clear message.
12. Claude-hosted copy saves to the viewer's Claude account (`src/cloud.ts`: artifact `db` capability, private `data/users/<id>` collection, one doc per changed record plus `active` for the workout in progress; `sync.ts` uses it when there's no sync key) and runs the coach on Claude (`src/coachClaude.ts`, artifact `sample` capability with page tools). Coach instructions, tools, memory format and structured prompts moved to `shared/coachSpec.mjs`, used by both the Gemini server and the Claude path. New `propose_routine_changes` (targets, swaps, removals, new warm-up/cool-down) and `search_exercises`. Workout feedback (`Workout.feedback`, `checkAt` tick times → warm-up/cool-down minutes) on the summary (`src/ui/Feedback.tsx`) with "Ask coach to adjust" (`/coach?adjust=<id>`). Rings use solid colours on a neutral track. QA: `qa/fake-claude.cjs` stands in for the artifact runtime; `walk13` (saving survives closing the page) and `walk14` (feedback → coach → approve) run against `npx vite preview --port 4173`.
13. Time budget (`src/timeplan.ts`: estimate from warm-up/cool-down lines, sets, rest and superset rounds; `Routine.budget` overrides; `Workout.timePlan` saved at start; pace on the live header, `TimeCard`/`TimeTrend` in `src/ui/TimeCard.tsx`, in the coach context). Workout screen: superset pairs render as one tinted block with the rest timer once after the round (`blocks()` in WorkoutEditor), 44–50px targets, 16px gaps between blocks. Reading text in Inter (`--font-read`), Space Grotesk for display and numbers. Motion per Jakub Krehel's interface skills (github.com/jakubkrehel/skills): one curve `cubic-bezier(0.2, 0, 0, 1)` at 300ms for arrivals, 150ms ease-out exits, press scale 0.96, icon swaps from 0.25 with blur; screens and the tab pill move with the View Transitions API (`transition()` in router.ts; names applied only while `html.vt` is set, because a view-transition-name creates a stacking context that traps sheets); `navPending()` stops the live screen's redirect from racing a deliberate navigation; reduced motion respected.
14. Design system: tokens for spacing (4px scale), layout roles (gutter, card padding, gaps), radius, type scale and control heights at the top of `src/styles.css`; the whole stylesheet was converted to them (556 spacing, 89 radius, 233 font-size values; in-between values rounded up for more air). Rules and tables in `DESIGN.md`. `design-system/build.py` generates a Design System artifact (tokens, fonts, 9 component previews) from the same values.
15. Reading text switched from Source Serif 4 to Inter at the owner's request (`--font-read`, `@fontsource-variable/inter`, Google Fonts in the single-file build). Design-system generator moved into the repo (`design-system/`) and updated. This handoff rewritten for an account switch.
16. Fasting time picker (`WhenPicker` in `src/ui/Fasting.tsx`) replaces the native date-and-time wheels, which were small and hard to use on iPhone: day chips (Today, Yesterday, two more days, Earlier with a date picker) and big custom wheels (`Wheel`/`TimeWheels`: 56px rows, five visible, CSS scroll-snap, hour / minute in 5-minute steps / AM-PM, or 24 h when the locale uses it). A value is picked when the scroll settles or by tapping a row; a time in the future is held at now and the wheel rolls back. The fast editor shows Started/Ended as rows that open one picker at a time, plus Length chips (14–24 h) that set the start from the end.
17. FIT import (`src/fit.ts`, button in the History header): a small FIT reader (definition/data messages, compressed timestamps, developer fields skipped) pulls sport/sub-sport, start, elapsed time, calories, distance, maker and 1 s heart rate records; checked against Garmin's `@garmin/fitsdk` on a real Wahoo file (2,135 of 2,135 samples identical). Saved as a finished cardio workout with no exercises, heart rate averaged into 5 s samples, id `w-fit-<start seconds>` so a re-import replaces it. This is the way to get heart rate into the Claude-hosted copy, where Bluetooth is blocked. Also fixed: a closed confirm dialog stayed mounted (invisible) and swallowed taps; it now unmounts after its exit animation and closing overlays have `pointer-events: none`.
18. Activity icons (`src/activity.ts`, `activityOf`): workout cards in History and the day journal show a tile with the session type: a lime dumbbell for strength (the workout has exercises), an orange heart-pulse for everything else (cardio, imported FIT files). The owner tried per-sport icons; no library has an elliptical and a hand-drawn one didn't land, so cardio is one icon. The back button falls back to the parent screen when the frame ignores `history.back()`; note fields keep their empty height while you type.
19. Hero quote height is fixed: every quote renders invisibly in one grid cell (`.hq-stack` / `.hq-sizer` in `HeroQuote`), so the card is as tall as the longest quote at the current width and rotating never shifts the page; the visible quote is centred.

Commit history on the branch tells the same story in more detail (`git log`).
