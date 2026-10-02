# Reps

A small, fast workout tracker you install on your phone. It covers the parts of Hevy you actually use: routines, logging sets with your last numbers pre-filled, a rest timer, supersets, history, personal records and per-exercise progress charts. Your 12-week **Dumbbell Comeback** plan comes preloaded.

It also does:

- **Heart rate** from a Bluetooth strap (Garmin HRM-Dual or any standard one) during any workout, with live zones, an optional target zone that buzzes when you drift out, time in each zone per workout, and weekly zone trends. Zone 2 cardio has its own quick start.
- **Body weight** with a 7-day average, weekly and monthly change, and a chart.
- **Intermittent fasting**: start/end a fast, live progress toward your goal (16:8, 18:6…), history and streak.
- **A library of about 930 exercises**, so you can build your own routines.
- **Plan import**: give Claude a plan (a sheet like the Comeback plan, a screenshot, text) and get routines back, either by pasting its answer into the app or through MCP.

- **Offline-first.** Everything is saved on the phone (IndexedDB) the moment you type it, so a dead gym signal never loses a set.
- **Self-hosted sync.** A ~200-line Node server stores your data in a single SQLite file on your Coolify box and keeps devices in sync. It has no npm dependencies; it uses the SQLite built into Node 22.
- **Installable.** Add it to your home screen; it opens full-screen and works with no connection.

## Deploy on Coolify

1. **New resource → Public/Private repository** → pick this repo and branch.
2. **Build pack: Dockerfile.** Port: **3000**.
3. **Environment variables:** add `APP_TOKEN` set to a long random string (e.g. `openssl rand -hex 24`). This is your sync key.
4. **Persistent storage:** add a volume mounted at **`/data`**. The database is `/data/reps.db`. Without the volume, your synced data is wiped on every redeploy.
5. Add your domain (HTTPS is required for installing the app and for the service worker), then deploy.

Health check: `GET /api/health`. The Dockerfile already declares one.

If you'd rather use Docker Compose (Coolify supports that too): `APP_TOKEN=… docker compose up -d`.

### On your phone

1. Open your domain in Safari (iOS) or Chrome (Android).
2. **Share → Add to Home Screen** (iOS) or **Install app** (Android).
3. Open the app → **Settings** (sliders icon on Train) → paste your `APP_TOKEN` under **Sync key** → **Connect**.

You can use the app before connecting; anything logged so far syncs as soon as you connect.

### Backups

- In the app: **Settings → Export backup** downloads a JSON file. **Import backup** merges one back in.
- On the server: `GET /api/export` with `Authorization: Bearer <APP_TOKEN>` returns everything. Or back up the `/data` volume (it's one SQLite file plus its WAL).

## Heart rate

Heart rate uses Web Bluetooth, which works in **Chrome on Android** (and desktop Chrome/Edge). iPhone browsers don't support it.

Tap **Connect heart rate** at the top of a workout (or in Settings → Heart rate), pick your strap, and it reconnects on its own after that. Readings are stored every 5 seconds with the workout. Zones are editable in Settings; the default puts zone 2 at 120–145 bpm. Keep the screen on during cardio (the app asks for this by default): Android pauses Bluetooth for web apps when the screen is off.

## Importing a plan

**In the app:** Train → Routines → **Import**. Copy the prompt, paste it into Claude with your plan, paste Claude's answer back. You'll see every routine and how each exercise was matched before anything is saved.

**With MCP (Claude talks to your server directly):** the server exposes an MCP endpoint at `/mcp/<APP_TOKEN>`.

- Claude (web, desktop or mobile): Settings → Connectors → Add custom connector, URL `https://reps.yourdomain.com/mcp/<APP_TOKEN>`.
- Claude Code: `claude mcp add --transport http reps https://reps.yourdomain.com/mcp/<APP_TOKEN>`

Then ask, for example, "import this plan into Reps" with the plan attached. Tools: `get_plan_format`, `search_exercises`, `import_plan`, `list_routines`, `recent_workouts`, `exercise_progress`, `body_stats`. The read tools let you ask things like "how has my floor press progressed?" The URL contains your sync key, so treat it like a password.

## How sync works

Every record (exercise, routine, workout, settings) carries an `updatedAt` time. The phone keeps a list of records changed since the last sync and sends them to `POST /api/sync` along with the last server sequence number it saw. The server keeps whichever version is newer and replies with everything that changed since that sequence number. Deletes are kept as tombstones so they reach other devices. The workout you're in the middle of stays on the device until you finish it.

Sync runs when the app opens, comes back to the foreground or goes online, a second or so after any change, and every minute while it's open.

## The Comeback plan

The 8 routines (Phase 1–4 × Workout A/B) live in the **Dumbbell Comeback** folder. Variations like "Goblet squat, 1 s pause" are logged against the base exercise with the cue as a note, so your progress charts and records carry across all four phases.

The plan card on **Train** works out your week from your first plan workout (tap **Week N of 12** to change it), alternates A and B, and tells you when it's a rest day. When you hit the top of the target rep range on every set, the exercise shows a nudge to go heavier.

Weights for dumbbell exercises are per dumbbell.

## Develop

```bash
npm install
npm run build          # type-check + build the PWA into dist/
APP_TOKEN=dev npm start   # serves dist/ and the API on :3000
npm run dev            # Vite dev server on :5173 (proxies /api to :3000)
npm run icons          # re-render PNG icons from public/favicon.svg (needs Playwright)
npm run single         # one self-contained HTML file in dist/reps-single.html
node scripts/library.mjs exercises.json   # rebuild the library from free-exercise-db
```

Requires Node 22.13 or newer.

### Layout

```
server/server.mjs        HTTP server: static files, /api/sync, /api/export, SQLite
server/mcp.mjs           MCP endpoint (plan import + read tools)
shared/planImport.mjs    plan JSON → routines, exercise name matching (used by app and server)
src/data/                exercise library (curated + free-exercise-db, public domain)
src/hr.ts                Bluetooth heart rate, zones, recording
src/store.ts             in-memory state (signals) + IndexedDB writes
src/sync.ts              push/pull sync with the server
src/seed.ts              exercise library and the Comeback plan routines
src/workout.ts           start/finish workouts, rest timer
src/stats.ts             previous sets, personal records, exercise history
src/plan.ts              where you are in the 12-week plan
src/ui/WorkoutEditor.tsx the set-logging editor (used for live workouts, edits and routines)
src/screens/*            Train, Live, History, Exercises, Routine editor, Settings
src/sw.js                service worker (precache list is filled in at build time)
```

## Limits worth knowing

- **Rest timer in the background:** iOS pauses web apps in the background, so the end-of-rest sound plays when you come back to the app rather than on the lock screen. The countdown itself stays correct.
- **Conflicts:** if you edit the same workout on two devices while both are offline, the later edit wins.
