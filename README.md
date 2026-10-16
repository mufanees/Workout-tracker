# Gloop

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
2. **Create the app.** In Coolify: **Projects → (your project) → + New → Private Repository (with GitHub App)**, or **Public Repository** if the repo is public. Pick `mufanees/workout-tracker` and the branch **`main`**.
3. **Build settings.** Build pack **Dockerfile** (Coolify finds `Dockerfile` in the root). **Ports Exposes: `3000`**.
4. **Domain.** In **Domains**, enter `https://reps.yourdomain.com`. Coolify gets the HTTPS certificate for you. HTTPS is required for installing the app, notifications and Bluetooth.
5. **Environment variables** (Configuration → Environment Variables):
   - `APP_TOKEN` = a long random string. This is your sync key, like a password. Generate one with `openssl rand -hex 24`.
   - `GEMINI_API_KEY` = your free key from aistudio.google.com → Get API key (optional, turns on the AI coach). To run the coach on another API instead (DeepSeek, OpenRouter, Claude…), see **Choosing a coach model** below.
   - `TZ` = your time zone, e.g. `America/Toronto` (optional, used for reminders and the Sunday review until the app tells the server).
   - `GOOGLE_CLIENT_ID` and `ADMIN_EMAIL` (optional) turn on accounts: Google sign-in and invites. See **Accounts** below.
6. **Storage.** Configuration → **Persistent Storage → + Add → Volume Mount**. Name: `reps-data`, Destination path: **`/data`**. Use a *Volume* mount, not a *Directory* mount. Without it your data is wiped on every redeploy.
7. **Deploy.** Click **Deploy** and wait for the build (about 2 minutes). The status turns green when the health check (`/api/health`) passes.
8. **Check it.** Open `https://reps.yourdomain.com/api/health`. You should see `{"ok":true,"auth":true}`. Then open `https://reps.yourdomain.com`.

To update later: push to the branch and click **Redeploy** (or turn on **Auto Deploy** in Coolify so every push deploys). Your data stays in the volume.

If the logs say "Gloop can't write to /data", the storage is a Directory mount owned by root; switch it to a Volume Mount (step 6).

If you'd rather use Docker Compose (Coolify supports that too): `APP_TOKEN=… docker compose up -d`.

### On your phone

1. Open your domain in Safari (iOS) or Chrome (Android).
2. **Share → Add to Home Screen** (iOS) or **Install app** (Android).
3. Open the app → **Settings** (sliders icon on Train) → paste your `APP_TOKEN` under **Sync key** → **Connect**.
4. Optional: **Settings → Notifications**, flip the switch on, for fast complete, eating window, rest timer and weekly review notifications.
5. If you used the Claude-hosted copy first: there, **Settings → Copy backup**; in the installed app, **Settings → Paste a backup**.

You can use the app before connecting; anything logged so far syncs as soon as you connect.

### Accounts (Google sign-in, invite only)

Optional. Without it the server is one person with `APP_TOKEN`. With it, each person signs in with Google and gets their own private log; nobody gets in without an invite link from you.

1. **Google Cloud Console** (console.cloud.google.com) → create a project (e.g. "Gloop").
2. **APIs & Services → OAuth consent screen** (Google Auth Platform → Branding): app name **Gloop**, your email as support and developer contact. Audience **External**. Click **Publish app** so it isn't limited to test users (sign-in only asks for name, email and picture, so Google doesn't need to review it).
3. **Credentials (Clients) → Create OAuth client ID** → type **Web application**. Under **Authorized JavaScript origins** add `https://gloop.yourdomain.com` (exactly your app's address, no trailing slash). No redirect URIs needed. Create, then copy the **Client ID** (`….apps.googleusercontent.com`; there's no secret to keep).
4. In Coolify, add env `GOOGLE_CLIENT_ID` = that ID and `ADMIN_EMAIL` = the Gmail you'll sign in with. Optional `COACH_DAILY_LIMIT` (default 60): coach messages per person per day, since everyone shares your coach API key; you're unlimited. **Redeploy**.
5. In the app: **Settings → Account → Continue with Google**. Signing in with `ADMIN_EMAIL` makes you the owner and opens your existing log (the one `APP_TOKEN` used, which keeps working).
6. **Settings → People → Invite**: makes a link (works once, lasts 14 days) and opens the share sheet. Your friend opens it, signs in with Google, and starts with an empty log of their own. From People you see who's in, their coach use today, and can turn someone's access off (their log is kept).

Each person's data lives in its own SQLite file (`/data/users/<id>.db`; yours stays `/data/reps.db`; accounts in `/data/accounts.db`). Each person's Claude connector link is in their Settings. Signing out, or a different person signing in on the same phone, clears that phone's copy.

### Backups

- On the server: a copy of each database is written to `/data/backups/` once a day (`reps-YYYY-MM-DD.db`, plus `users/<id>-…` and `accounts-…` with accounts on) and the newest 14 are kept (`BACKUP_DAYS` changes that; `0` turns it off). Restore by stopping the app and copying one over `/data/reps.db`.
- In the app: **Settings → Export backup** downloads a JSON file. **Import backup** merges one back in.
- On the server: `GET /api/export` with `Authorization: Bearer <APP_TOKEN>` returns everything. Or back up the `/data` volume (it's one SQLite file plus its WAL).

## Heart rate

Heart rate uses Web Bluetooth, which works in **Chrome on Android** (and desktop Chrome/Edge). iPhone browsers don't support it.

Tap **Connect heart rate** at the top of a workout (or in Settings → Heart rate), pick your strap, and it reconnects on its own after that. Readings are stored every 5 seconds with the workout. Zones are editable in Settings; the default puts zone 2 at 120–145 bpm. Keep the screen on during cardio (the app asks for this by default): Android pauses Bluetooth for web apps when the screen is off. The Android app (below) doesn't have that limit.

## Android app

An Android app (Capacitor 8) wraps the same site: it opens https://gloop.novas.my in a WebView, so every web deploy updates the app too, and adds native plugins for the things a web app can't do well on Android. The source is in `android/` and `capacitor.config.ts`; the bridge on the web side is `src/native.ts`. In a normal browser nothing changes.

**What's native, what's web**

| | In the app | In the browser / installed PWA |
|---|---|---|
| Heart rate strap | Android Bluetooth in a foreground service: keeps recording with the screen off or Gloop in the background, reconnects on its own, hands the page what it missed (with timestamps) when you come back, and keeps zone alerts going while the page is frozen | Web Bluetooth while the screen is on |
| Notifications | Truly ongoing (can't be swiped away while running); the elapsed time ticks natively; **the number (bpm, or hours fasted) is drawn into the status-bar icon**; the fast stays in the shade with Gloop closed and comes back after a reboot | Web notifications, refreshed by the page and server pushes; swipeable |
| Rest and set timers | Exact alarms: sound and vibration with the phone locked, plus a countdown in the shade | Server push a moment after the end |
| Screen on during workouts | Window flag | Wake Lock API |
| On-device AI line in the live coach | Gemini Nano through ML Kit's GenAI Prompt API (Pixel 10 and other supported phones), once downloaded in Settings → Phone | Chrome's built-in model, if present |
| Everything else (logging, sync, coach, fasting, history) | The website | The website |

Server pushes (training-day reminder, eating window, weekly review) don't reach the app yet: the WebView has no web push. Use the installed PWA for those, or ask for a native version.

**Install it (Android)**

1. GitHub → **Actions → Android** → the latest green run → **Artifacts → gloop-android** (download on the phone, or on a computer and copy it over). It's a zip with `gloop-<n>-debug.apk` (and `-release.apk` when signing secrets are set); `BUILD.txt` says whether on-device AI is in that build.
2. Open the APK. Android asks to allow **Install unknown apps** for the app you opened it from (Files or Chrome): allow it, go back, **Install**. Play Protect may warn about an unknown developer: **More details → Install anyway**.
3. Later builds install over the old one and keep your data, because every debug build is signed with the same key (`android/app/debug.keystore`). That key is committed on purpose: it's a debug key, public by design, and gives no access to anything. Don't use it for a store release.
4. First run: sign in or paste the sync key as on the web (the app has its own storage, so connect it once). The Google sign-in button may not work inside the app (Google blocks sign-in in embedded web views); use the sync key there.

**Permissions, first run**

- **Nearby devices** (Bluetooth scan/connect): asked the first time you tap **Connect heart rate**. A native list shows the straps it finds; the one you pick is remembered and reconnected without the list next time (Disconnect in Settings forgets it).
- **Notifications**: asked with the strap, or from **Settings → Phone**.
- **Alarms & reminders** (exact alarms): granted at install on Android 13+; on Android 12 allow it from Settings → Phone.
- **Run in the background** (battery optimisation exemption): **Settings → Phone → Run in the background → Allow**. Strongly recommended for heart rate with the screen off: without it Android may stop the strap service during long sessions.

**Settings → Phone** (only in the app) shows each of these with a button to fix it, and the on-device AI state with a **Download** button (about a gigabyte; it never downloads mid-workout).

**Builds (CI)**: `.github/workflows/android.yml` runs on pushes to `main` that touch `android/**`, `capacitor.config.ts`, `src/native.ts` or the workflow, and on **Run workflow**. JDK 21, Android SDK 36, `npm ci`, web build, `npx cap sync android`, `./gradlew assembleDebug`. ML Kit GenAI is a beta artifact: if the build with it fails, CI builds again with `-Pgloop.genai=false` (the app then says on-device AI is unavailable) instead of failing. For a release APK add the repository secrets `ANDROID_KEYSTORE_BASE64` (`base64 -w0 release.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. A release-signed APK can't install over a debug one (different key): uninstall first, once.

Local build (needs JDK 21 and the Android SDK): `npm run build && npx cap sync android && cd android && ./gradlew assembleDebug` → `android/app/build/outputs/apk/debug/app-debug.apk`.

**iPhone (next phase, not built)**: Capacitor iOS around the same site, with native plugins for Bluetooth heart rate in the background, a **Live Activity** (lock screen and Dynamic Island) for the fast, rest timer and heart rate, local notifications for timers, and **Apple Foundation Models** for the on-device coach line. Testers would install through **TestFlight**, which needs an Apple Developer account (99 USD a year) and a Mac with Xcode (or a cloud Mac in CI).

## Warm-ups and videos

**Warm-ups and cool-downs** are free text, one move per line, written however you like: `Cat–cow × 8`, `Doorway pec stretch · 30 s / side`, `World's greatest stretch x4 each side (slow)`, even a video link on the line. Underneath the box, each line shows how Gloop read it (move, dose, note) and whether it's linked to a library exercise (the link icon). Linked lines get that exercise's video and accurate timing. Tap a line to link it to a different exercise or keep it as plain text; the link is remembered by name, so it holds in every routine. **Add from library** writes the line for you.

**Videos.** Every exercise's video button opens a YouTube search until you save your own; then it opens yours (marked with a dot). Ways to save one, none of them needing an edit screen:

- **Share it to Gloop.** In YouTube (or anywhere) tap Share → Gloop. Gloop opens asking which exercise it's for, with its best guesses from the video's title (the exercise you're doing right now comes first). One tap. Works once Gloop is installed to the home screen (Android Chrome).
- **Paste it.** The ⋯ menu on an exercise in a workout or routine → **Save a video link**, or the star button on the exercise's page → **Paste link**.
- **Tell the coach.** "Use this for goblet squats: <link>".

An exercise can keep several videos; the starred one is preferred and the video button opens it. Star another to switch, or remove old ones.

## Importing a plan

**In the app:** Train → Routines → **Import**. Copy the prompt, paste it into Claude with your plan, paste Claude's answer back. You'll see every routine and how each exercise was matched before anything is saved.

**With MCP (Claude talks to your server directly):** the server exposes an MCP endpoint at `/mcp/<APP_TOKEN>`. With accounts on, each person copies their own link from **Settings → Claude connector**.

- Claude (web, desktop or mobile): Settings → Connectors → Add custom connector, URL `https://reps.yourdomain.com/mcp/<APP_TOKEN>`.
- Claude Code: `claude mcp add --transport http reps https://reps.yourdomain.com/mcp/<APP_TOKEN>`

Then ask, for example, "import this plan into Gloop" with the plan attached. Tools: `get_plan_format`, `search_exercises`, `import_plan`, `list_routines`, `recent_workouts`, `exercise_progress`, `body_stats`. The read tools let you ask things like "how has my floor press progressed?" The URL contains your sync key, so treat it like a password.

## AI coach

In the Claude-hosted copy the coach runs on Claude (your Claude usage; the page asks once for permission) and your data is saved to your Claude account, so closing the page loses nothing. On your own server it runs on Gemini by default, or on another API you choose (see **Choosing a coach model**).

The Coach tab sends your question plus a text summary of your training (the last 8 weeks of totals, 4 weeks of workouts, progression per exercise, heart rate zones, morning readings, shoulder ratings, weight and fasts) to your server, which asks Google's Gemini (`gemini-3.5-flash` by default) and streams the answer back. To turn it on:

1. Create a free API key in Google AI Studio (aistudio.google.com → Get API key).
2. Add `GEMINI_API_KEY=...` to the server's environment in Coolify and redeploy.
3. Optional: `GEMINI_MODEL` to use a different Gemini model, and `GEMINI_PLAN_MODEL` for a stronger one (e.g. a Pro model) used only for planning questions (goals, training blocks) and the Sunday review. Busy or failed calls are retried twice before you see an error.
4. Check it: **Settings → Coach** shows which API and model the server uses, whether it works ("working (1.2 s)", or the problem in plain words: no key, key rejected, model not found, free-tier limit reached, out of credits) and the last error. **Test coach** sends one tiny real message through the server. The same check is `GET /api/coach/status` and `POST /api/coach/test` (with your sync key).

The free tier has per-minute and per-day request limits, which one person asking a coach won't normally hit. On Google's free tier, your prompts (including the training summary) may be used by Google to improve its products; a paid key doesn't have that.

Without a key the Coach tab says so (and why) at the top, and can still copy your question with your training summary to paste into the Gemini or Claude app. Conversations are kept on the phone.

### Coach environment variables

| Variable | Default | What it does |
| --- | --- | --- |
| `COACH_PROVIDER` | `gemini` | `gemini`, `openai` (any OpenAI-compatible Chat Completions API: OpenRouter, DeepSeek, Groq, Together, Mistral, OpenAI…) or `anthropic` (Claude). |
| `COACH_API_KEY` | `GEMINI_API_KEY` for Gemini | The provider's API key. Also read: `GEMINI_API_KEY` (gemini), `ANTHROPIC_API_KEY` (anthropic), `OPENAI_API_KEY` (openai). |
| `COACH_BASE_URL` | per provider | API address, e.g. `https://openrouter.ai/api/v1`, `https://api.deepseek.com/v1`, `https://api.groq.com/openai/v1`. Defaults: Google's Gemini API, `https://api.openai.com/v1`, `https://api.anthropic.com`. |
| `COACH_MODEL` | `gemini-3.5-flash` / `claude-haiku-5-5` / `deepseek-chat` on DeepSeek | Model for chat, pre-workout targets, takeaways and live tips. Required for other OpenAI-compatible APIs. `GEMINI_MODEL` still works for Gemini. |
| `COACH_PLAN_MODEL` | `COACH_MODEL` | Optional stronger model for planning questions (goals, programs, blocks) and the Sunday review. `GEMINI_PLAN_MODEL` still works for Gemini. |
| `COACH_DEEP_MODEL` | `claude-opus-5-5` on Claude, else `COACH_PLAN_MODEL` | Model for the third choice in Settings → Coach → Model. The three are: `COACH_MODEL` for chat with `COACH_PLAN_MODEL` for planning (the default), `COACH_PLAN_MODEL` for everything, and this with more thinking. On Claude with the suggested values that reads Haiku / Sonnet / Opus. Live cues always use `COACH_MODEL`. |
| `COACH_PRICES` | built-in Claude list prices | JSON of extra or corrected prices for Settings → Coach → API spend, USD per million tokens: `{"model-id":[input, output, cacheRead]}`. Models without a price count tokens only. The ledger is `DATA_DIR/coach-usage.db`. |
| `COACH_DAILY_LIMIT` | `60` | Coach messages per invited person per day (you're unlimited). |
| `COACH_IDLE_MS`, `COACH_TOTAL_MS` | `90000`, `300000` | Give up when the API sends nothing for this long / when one reply takes longer than this. |
| `GEMINI_BASE_URL` | Google | Gemini only, for testing with a stand-in. |

### Choosing a coach model

Switching is env vars only: set them in Coolify and **Redeploy**, then **Settings → Coach → Test coach**. Every option gets the same coach: tools, memory, proposals, the weekly review. Prices change often; check the provider's pricing page.

**Gemini (default).** Free tier with per-minute and per-day limits (and your prompts may be used by Google); on a paid key `gemini-3.5-flash` is about $1.50 in / $9 out per million tokens.

```
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash
```

**Claude (Anthropic).** Small model for everyday chat, bigger one only for planning and the weekly review. `claude-haiku-5-5` is about $0.10 in / $0.50 out per million tokens, `claude-sonnet-5-5` about $2 / $10. The coach's instructions and tools are cached between requests, which cuts the input cost of follow-up rounds.

```
COACH_PROVIDER=anthropic
COACH_API_KEY=sk-ant-...
COACH_MODEL=claude-haiku-5-5
COACH_PLAN_MODEL=claude-sonnet-5-5
```

**DeepSeek** (OpenAI-compatible). Roughly $0.14–0.28 in / $0.28–0.42 out per million tokens per third-party sources; check their pricing page.

```
COACH_PROVIDER=openai
COACH_API_KEY=sk-...
COACH_BASE_URL=https://api.deepseek.com/v1
COACH_MODEL=deepseek-chat
```

**OpenRouter** (one key, almost any model; pay per model).

```
COACH_PROVIDER=openai
COACH_API_KEY=sk-or-...
COACH_BASE_URL=https://openrouter.ai/api/v1
COACH_MODEL=<model id>
COACH_PLAN_MODEL=<model id>
```

**Groq, Together, Mistral, OpenAI** (all OpenAI-compatible): same pattern.

```
COACH_PROVIDER=openai
COACH_API_KEY=...
COACH_BASE_URL=https://api.groq.com/openai/v1   # or https://api.together.xyz/v1, https://api.mistral.ai/v1, https://api.openai.com/v1
COACH_MODEL=<model id>
```

Pick a model that supports tool (function) calling; without it the coach can't look things up, remember or propose changes.

### What the coach remembers and does on its own

- **Memory** (Coach → Memory): a profile you fill in (goals, injuries, equipment, schedule, preferences, age, max HR), plus notes the coach saves when you tell it something lasting. Everything there is sent with each question; edit or delete any of it, or "Forget everything".
- **Commitments:** when you agree on something specific ("goblet squat 14 kg × 8–10 next session"), the coach records it with a due date, shows it under "Working on", and checks it after your next workout.
- **Before a workout:** starting a routine asks for today's targets. "Use these targets" puts them in the grey placeholder values; you still log what you actually did.
- **After a workout:** a one-line takeaway on the summary screen, saved under Reviews.
- **Sunday evening:** a week in review appears on the Coach tab, with a notification.
- **Proposals:** the coach can suggest new routine targets, a goal or a profile change. Nothing changes until you tap Approve.
- Long chats are condensed: before old messages drop off, the coach saves anything worth keeping as notes.

The memory lives in your server's database (synced store `coach`) and, like the training summary, is sent to Google with each request.

### Stretches, aches and daily life

The coach also knows physiotherapy and occupational therapy basics: stretching and mobility doses, each body region (neck, shoulder, elbow, wrist and hand, upper and lower back, hip, knee, ankle and foot), tendons and nerves, desk and lifting set-up, pacing and joint protection, and the red flags that mean seeing a doctor. Ask things like "my neck is stiff from the desk", "tennis elbow, what should I do?" or "stretches for squat depth". It picks 3–5 moves with doses and steps, and can turn them into a mobility routine. It gives general guidance, never a diagnosis.

Sources: the 123 stretches and their instructions come from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain; `node scripts/stretches.mjs exercises.json` rebuilds `shared/stretches.json`). The clinical guidance and 44 rehab exercises (chin tucks, nerve glides, tendon loading, Spanish squats and so on, also added to the exercise library) were written for this app in `shared/rehabKnowledge.mjs`. Add your own material (a physio's handout, notes) to the coach's library and it uses that too.

**Built into your training.** Ask "build this into today" or "plan my mobility this week" and the coach proposes a plan sized to each day: on hard days a few prep moves in the warm-up and a short cool-down; on easy and rest days a standalone 10–20 minute session (a Start button appears on Train); rehab loading spread over non-consecutive days; scaled down after a rough check-in. Approve it and the moves join the warm-up and cool-down of whatever you start that day, without changing your routines. The Train card shows today and the week; the coach sees what you did and adjusts.

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
src/native.ts            the Android app's native plugins (no-op in a browser)
android/                 Capacitor Android project; Kotlin plugins in app/src/main/java/my/novas/gloop/
capacitor.config.ts      the app loads https://gloop.novas.my
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
