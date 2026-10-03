# Reps

> **Picking this up?** Read [`HANDOFF.md`](HANDOFF.md) first (state, next steps, switching Claude accounts), then [`DESIGN.md`](DESIGN.md) for the design system. Get the code with `git clone https://github.com/mufanees/workout-tracker.git`.

A small, fast workout tracker you install on your phone. It covers the parts of Hevy you actually use: routines, logging sets with your last numbers pre-filled, a rest timer, supersets, history, personal records and per-exercise progress charts. Your 12-week **Dumbbell Comeback** plan comes preloaded.

It also does:

- **Import from Wahoo, Garmin, Zwift and others**: Log → upload button takes a `.fit` file and adds it as a cardio workout with its heart rate trace and zones (counts toward Move and Zone 2).
- **Heart rate** from a Bluetooth strap (Garmin HRM-Dual or any standard one) during any workout, with live zones, an optional target zone that buzzes when you drift out, time in each zone per workout, and weekly zone trends. Zone 2 cardio has its own quick start.
- **Body weight** with a 7-day average, weekly and monthly change, and a chart.
- **Intermittent fasting**: plans from 13:11 to OMAD and 36 h, a live ring with the metabolic stages (digesting, blood sugar falling, fat burning, ketosis…), back-dated start and end, past fasts with notes, streaks and stats, and a reminder before your eating window closes.
- **Time budget**: every routine has an estimated length (warm-up moves, sets, rest, cool-down), or set your own in the routine editor. During a workout the timer shows "of 30 min · 4 min behind"; afterwards you see planned vs actual, and the Log tab shows the trend. Turn it off in Settings.
- **Workout feedback**: after a workout, rate the session length, the warm-up and cool-down (their actual minutes are logged as you tick them) and each exercise (easy, right, hard, hurt), add a note, and tap **Ask coach to adjust**. The coach proposes a reworked routine (shorter warm-up, swaps for what hurt, new targets) that you approve with one tap, and remembers what matters.
- **Daily rings** on the Train screen: Fast (hours toward your plan), Move (minutes of any workout, strength or cardio, toward 30) and Zone 2 (minutes this week). Any workout earns the day, even five minutes when you have to stop early, and the week strip shows a check for every day you showed up.
- **Celebrations** when you finish a workout or a fast: rings, streaks, personal bests and milestones (first fast at goal, 25 workouts, a 4-week streak, your first 20-hour fast…).
- **How-to videos** for every exercise and every warm-up and cool-down movement (opens a YouTube search).
- **Calendar**: Log → calendar shows every month at a glance: workout days filled in with the workout name, hours fasted, weigh-ins and notes. Tap a day for its journal: workouts, fasts, weight, morning check and a note for the day.
- **Target weight** with start → target progress.
- **A library of about 930 exercises**, so you can build your own routines.
- **Morning check**: a one-minute resting heart rate and HRV (RMSSD) reading with the strap, compared with your 30-day baseline ("keep today easy" / "recovered").
- **Weekly zone 2 goal** (default 150 min) as a progress ring.
- **Shoulder check-in**: rate stiffness 0–10 when you finish; the Body tab flags it if it trends up.
- **Stall detection**: same weight for three sessions without more reps suggests the plan's lighter week (about 70%, 2 sets).
- **Warm-up and cool-down checklists** per routine (the Comeback plan's are built in).
- **Notifications** from your server: rest over, fast complete, training-day reminder, even with the app closed.
- **Nightly server backups**, 14 days kept.
- **Goals your coach coaches to**: tell the coach what you want ("lift 100 kg", "get to 80 kg", "150 min of zone 2") and it sets a measurable goal with milestones. The app tracks where you are, your pace over 8 weeks, a projected date, ahead or behind, and every lift that counts; the coach reports on it and adjusts your training.
- **A coach that builds your program**: tell it your days, minutes and equipment ("3 hard 30-minute days, dumbbells and bands") and it designs or reshapes the whole program (routines, supersets, top + back-off sets, drop sets); approve it and Train follows the rotation. It draws on a built-in training knowledge base (volume, effort, minimalist methods, progression with capped dumbbells, deloads, recovery, physio pain rules) and on **your library**: paste videos, programs and notes on the coach memory screen (or say "save this to my library" in chat).
- **Training blocks**: ask the coach for a plan and it proposes 4–8 weeks toward your goal (phases, rep ranges, how many reps to leave in the tank, a deload week). Approve it and Train shows which week you're in; pre-workout targets follow it.
- **Effort tap**: after an exercise's last set, tap Easy / Good / Max (reps left in the tank). The coach progresses you on it and goal estimates account for it.
- **Morning check-in**: sleep, energy and stress in three taps on Train, so the coach can tell a rough week from a stall and adjust today's targets.
- **AI coach** (Gemini on the server, Claude in the Claude-hosted copy) that reads your training and answers like a personal trainer: weekly reviews, what to change next session, recovery, progress on a lift, and a push when you don't feel like training.
- **Motivation**: your own quotes (editable, capitals are highlighted) as a big rotating quote card at the top of Train, after workouts and in reminders, plus a progress card showing what you can do now that you couldn't a few weeks ago.
- **Plan import**: give Claude a plan (a sheet like the Comeback plan, a screenshot, text) and get routines back, either by pasting its answer into the app or through MCP.

- **Offline-first.** Everything is saved on the phone (IndexedDB) the moment you type it, so a dead gym signal never loses a set.
- **Self-hosted sync.** A ~200-line Node server stores your data in a single SQLite file on your Coolify box and keeps devices in sync. It has no npm dependencies; it uses the SQLite built into Node 22.
- **Installable.** Add it to your home screen; it opens full-screen and works with no connection.

## Deploy on Coolify

You need: a Coolify server, a domain (or subdomain) pointed at it, and this repo on GitHub.

1. **DNS.** At your domain registrar, add an `A` record such as `reps.yourdomain.com` pointing to your Coolify server's IP. Wait until it resolves.
2. **Create the app.** In Coolify: **Projects → (your project) → + New → Private Repository (with GitHub App)**, or **Public Repository** if the repo is public. Pick `mufanees/workout-tracker` and the branch you deploy from.
3. **Build settings.** Build pack **Dockerfile** (Coolify finds `Dockerfile` in the root). **Ports Exposes: `3000`**.
4. **Domain.** In **Domains**, enter `https://reps.yourdomain.com`. Coolify gets the HTTPS certificate for you. HTTPS is required for installing the app, notifications and Bluetooth.
5. **Environment variables** (Configuration → Environment Variables):
   - `APP_TOKEN` = a long random string. This is your sync key, like a password. Generate one with `openssl rand -hex 24`.
   - `GEMINI_API_KEY` = your free key from aistudio.google.com → Get API key (optional, turns on the AI coach).
   - `TZ` = your time zone, e.g. `America/Toronto` (optional, used for reminders and the Sunday review until the app tells the server).
6. **Storage.** Configuration → **Persistent Storage → + Add → Volume Mount**. Name: `reps-data`, Destination path: **`/data`**. Use a *Volume* mount, not a *Directory* mount. Without it your data is wiped on every redeploy.
7. **Deploy.** Click **Deploy** and wait for the build (about 2 minutes). The status turns green when the health check (`/api/health`) passes.
8. **Check it.** Open `https://reps.yourdomain.com/api/health`. You should see `{"ok":true,"auth":true}`. Then open `https://reps.yourdomain.com`.

To update later: push to the branch and click **Redeploy** (or turn on **Auto Deploy** in Coolify so every push deploys). Your data stays in the volume.

If the logs say "Reps can't write to /data", the storage is a Directory mount owned by root; switch it to a Volume Mount (step 6).

If you'd rather use Docker Compose (Coolify supports that too): `APP_TOKEN=… docker compose up -d`.

### On your phone

1. Open your domain in Safari (iOS) or Chrome (Android).
2. **Share → Add to Home Screen** (iOS) or **Install app** (Android).
3. Open the app → **Settings** (sliders icon on Train) → paste your `APP_TOKEN` under **Sync key** → **Connect**.
4. Optional: **Settings → Notifications**, flip the switch on, for fast complete, eating window, rest timer and weekly review notifications.
5. If you used the Claude-hosted copy first: there, **Settings → Copy backup**; in the installed app, **Settings → Paste a backup**.

You can use the app before connecting; anything logged so far syncs as soon as you connect.

### Backups

- On the server: a copy of the database is written to `/data/backups/reps-YYYY-MM-DD.db` once a day and the newest 14 are kept (`BACKUP_DAYS` changes that; `0` turns it off). Restore by stopping the app and copying one over `/data/reps.db`.
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

## AI coach

In the Claude-hosted copy the coach runs on Claude (your Claude usage; the page asks once for permission) and your data is saved to your Claude account, so closing the page loses nothing. On your own server it runs on Gemini as below.

The Coach tab sends your question plus a text summary of your training (the last 8 weeks of totals, 4 weeks of workouts, progression per exercise, heart rate zones, morning readings, shoulder ratings, weight and fasts) to your server, which asks Google's Gemini (`gemini-3.5-flash` by default) and streams the answer back. To turn it on:

1. Create a free API key in Google AI Studio (aistudio.google.com → Get API key).
2. Add `GEMINI_API_KEY=...` to the server's environment in Coolify and redeploy.
3. Optional: `GEMINI_MODEL` to use a different Gemini model, and `GEMINI_PLAN_MODEL` for a stronger one (e.g. a Pro model) used only for planning questions (goals, training blocks) and the Sunday review. Busy or failed Gemini calls are retried twice before you see an error.

The free tier has per-minute and per-day request limits, which one person asking a coach won't normally hit. On Google's free tier, your prompts (including the training summary) may be used by Google to improve its products; a paid key doesn't have that.

Without a key the Coach tab still works: tapping a question copies it with your training summary so you can paste it into the Gemini or Claude app. Conversations are kept on the phone.

### What the coach remembers and does on its own

- **Memory** (Coach → Memory): a profile you fill in (goals, injuries, equipment, schedule, preferences, age, max HR), plus notes the coach saves when you tell it something lasting. Everything there is sent with each question; edit or delete any of it, or "Forget everything".
- **Commitments:** when you agree on something specific ("goblet squat 14 kg × 8–10 next session"), the coach records it with a due date, shows it under "Working on", and checks it after your next workout.
- **Before a workout:** starting a routine asks for today's targets. "Use these targets" puts them in the grey placeholder values; you still log what you actually did.
- **After a workout:** a one-line takeaway on the summary screen, saved under Reviews.
- **Sunday evening:** a week in review appears on the Coach tab, with a notification.
- **Proposals:** the coach can suggest new routine targets, a goal or a profile change. Nothing changes until you tap Approve.
- Long chats are condensed: before old messages drop off, the coach saves anything worth keeping as notes.

The memory lives in your server's database (synced store `coach`) and, like the training summary, is sent to Google with each request.

## Notifications

Settings → Notifications turns them on for that phone (installed app, Chrome on Android or Safari on iPhone 16.4+ after Add to Home Screen). The server schedules them and sends a standard web push, so they arrive with the app closed: rest over (only if the app didn't already beep), fast complete, eating window closing, and an optional training-day reminder at a time you choose (every other day on the plan, otherwise daily). Optional env: `PUSH_CONTACT=mailto:you@example.com`.

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
src/cloud.ts             Claude-hosted copy: saves to your Claude account
shared/coachSpec.mjs     coach prompt and tools (Gemini server and Claude)
DESIGN.md                design system rules (tokens, type, spacing, motion)
design-system/           design system generator (python3 design-system/build.py)
HANDOFF.md               full handoff: architecture, data model, testing, history
```

## Limits worth knowing

- **Rest timer in the background:** iOS pauses web apps in the background, so the end-of-rest sound plays when you come back to the app rather than on the lock screen. The countdown itself stays correct.
- **Conflicts:** if you edit the same workout on two devices while both are offline, the later edit wins.
