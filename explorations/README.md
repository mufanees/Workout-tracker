# Design explorations

Everything made while designing Gloop that isn't the app itself: mockups (finished and unfinished), comparison sheets, published artifact copies, motion recordings, UX walkthrough screenshots, QA screenshots and the throwaway scripts that produced them. Collected on 6 Oct 2026 from the build session's scratch space before switching Claude accounts, so nothing is lost.

This folder lives only on the `design-exploration` branch. The app code on this branch is the same as `main` at the time of collection (commit `959bb08`, "Warm-ups read as moves, saved exercise videos, share to Gloop"). `main` stays the deploy branch.

Status words used below: **Shipped** (in the app), **Decided** (a choice was made from the options), **Open** (explored, not decided or not built), **Reference** (kept for comparison or history).

## What's where

| Folder | What | Status |
| --- | --- | --- |
| `artifacts/` | Copies of the published Claude artifacts | Reference |
| `mockups/tab-bar/` | Five label and icon options for the second tab | Decided |
| `mockups/menu-icon/` | Icon options for cardio-machine workouts (elliptical) | **Open** |
| `mockups/squircle/` | Squircle corners vs round corners, strength k2 to k4 | Shipped |
| `mockups/time-picker/` | Scroll wheels vs clock dial | Shipped (both kept) |
| `motion/` | Screen-change and tab-pill recordings, frame grabs, brightness analysis | Shipped (fixes), Reference |
| `ux-review/` | 94 screenshots walking through first launch, workouts, routines, history, settings, light mode, lb units and small screens, used for the UX review | Reference |
| `qa-screens/` | Every QA screenshot from the build, by round | Reference |
| `styles-history/` | The stylesheet before the design-system pass and before the goo pass | Reference |
| `scripts/` | The Playwright and helper scripts that made the above | Reference |

### `artifacts/`

- `gloop-artifact-published-2026-10-04.html`: the Claude-hosted Gloop as last published (https://claude.ai/artifact/Cg23G2PSbJtSp6GNDqv4Sb, version of 4 Oct). It predates accounts, the physio coach, mobility plans, structured warm-ups and saved videos; rebuild with `npm run build` (output `dist/reps-single.html`) to get the current one. It keeps its data in the viewer's Claude account (artifact `db` capability), so it starts empty under a new account.
- `dumbbell-comeback-plan.html`: the original 12-week plan page (https://claude.ai/artifact/3RPVvc54pvsvRm1ikKxMHg). It's where the Comeback routines, warm-up and cool-down in `src/seed.ts` came from: Barlow Condensed and IBM Plex, blue accent, YouTube search links per exercise.
- `lift-log.html`: the first logger prototype, before Reps/Gloop (https://claude.ai/artifact/TBPq7ccHWzgPaTBwUGcukK). Today / History / Progress tabs, rest timer, last-session prefill. Superseded by the app.
- The design system itself (https://claude.ai/artifact/DmFNNgMBC8PN5woMDfjcdk, "Reps Design System") is built from `design-system/` in the repo (`design-system/build.py` → `design-system/project/`). It's from before the goo work and the Gloop rename: regenerate it before relying on it.

### `mockups/tab-bar/`

`tabopts.html` / `tabopts.png` (made by `tabopts.mjs`): the second tab as History (then), A: Log, B: Calendar, C: Progress, D: Journal, each in the floating pill. `tabsheet.png`: the pill and the sheets together.
**Decided:** A, "Log" with the calendar-check icon (see `TABS` in `src/App.tsx`).

### `mockups/menu-icon/`

`ell.html`, `ell2.html`, `ell3.html` and their PNGs: icons for an elliptical / cardio-machine workout (made for workouts imported from Wahoo FIT files): 1 figure on machine, 2 figure on an elliptical path, 3 machine (bolder), 4 heartbeat (generic cardio). `ell-options.png` puts them side by side.
**Open:** no choice made. Imported FIT workouts don't have their own icon yet. Pick one, add it to `src/ui/icons.tsx` (Lucide only; options 1 to 3 would need a custom SVG, which breaks the Lucide-only rule, so 4 is the rule-abiding one).

### `mockups/squircle/`

`sbs*.html` side-by-sides and `sq*`/`squircle-*` PNGs: current round corners vs `corner-shape: squircle`, on Train, the log, the plan card, zoomed corners, and strengths k2, k3, k4.
**Shipped:** squircle where supported, with bigger radii (`--r-xl` 46 px), per `DESIGN.md`.

### `mockups/time-picker/`

`wheels.tsx.txt` (the scroll-wheel picker as it was before the clock), `w12clock.png`, `w12-save.png`.
**Shipped:** the Android-style clock dial is the default and the wheels stay as an option (a switch link under the picker in the fasting time sheets, saved as `settings.timePicker`), at the owner's request ("keep both").

### `motion/`

- `recordings/`: `light.webm`, `light2.webm`, `nav-light.webm`, `nav-dark.webm`, `full.webm`, `r5.webm` and one unnamed recording: screen changes and the tab pill, recorded in headless Chromium.
- `frames/f001.png` …: frame grabs used to check the screen-change flash frame by frame.
- `y.txt`, `y-light.txt`, `y-dark.txt`: per-frame brightness (ffmpeg signalstats) showing the flash gone in both themes.
- `back.png`, `blip.png`, `fw.png`, `rt.png`, `sheet.png`, `sheetj.png`, `dbg12.png`: stills from the motion work (back navigation, the blip, sheet jelly).
- `rec*.cjs`, `back*.cjs`, `motion*.cjs`, `light.cjs`, `live.cjs`: the scripts that recorded them.
**Shipped:** hand-made screen transitions in `src/router.ts` (ghost clone fades over the new screen; no View Transitions), GSAP tab pill. **Still unverified on the real phone**, especially inside the Claude Android app's web view (see `HANDOFF.md`, Known gaps).

### `ux-review/`

`01-first-launch-dark.png` to `81-light-home-after-discard.png`: first launch and a full first workout step by step (01–34: week picker, logging, rest timer, set types, exercise menu, replace, add, finish, summary), history and detail (35–39), a second workout (40–46), building a routine with a superset in light mode (50–62), settings and lb units (63–68), a small phone (70–78) and discarding (79–81). `s1.js` to `s31.js` are the walkthrough's steps (with `lib.js`, their shared Playwright helpers) and `undo.js` is the review's undo-toast probe. The browser profile the walk ran in was left out. The review's findings went into the app; the four not done are listed in `HANDOFF.md` (Known gaps, "From the UX review, not done").

### `qa-screens/`

- `repo/`: the screenshots the QA scripts in `qa/` write (they're git-ignored on `main`): accounts, coach, goals, mobility, videos, the goo preview (`shots-trygoo/`), numbered rounds 7 to 21, motion stills.
- `scratch/`: earlier rounds (`shots/`, `shots2/`, …) and `coachoff.png`.
All of these use seeded test data, not the owner's log.

### `styles-history/`

`styles.before.css` (before the design-system pass, 2 Oct) and `old.css` (before the goo layer, 3 Oct): to diff against `src/styles.css` when a look regresses.

### `scripts/`

The one-off scripts: Playwright walks for features as they were built (`coachqa`, `goalqa`, `progqa`, `fitui`, `when`, `warm`, `quote*`, `cal*`, …), stand-in AI servers (`fake-gemini*.mjs`, `fake-anthropic.mjs`, `fake-coach*.mjs`, `fake-goal.mjs`), the icon sheet generator (`icons.mjs`, `iconsheet.cjs`), `fit/` (Garmin/Wahoo FIT parsing experiments that became `src/fit.ts`), `wm-test.ts` (weight model checks), `Dockerfile.test` (the runtime-stage simulation used before the first Coolify deploy), `srv.py` (a one-off patch script for `server/server.mjs`). They have absolute paths from the build machine (`/home/user/Workout-tracker`, `/tmp/claude-0/...`): adjust before running. The maintained tests are in `qa/` on `main`.

## Left out on purpose

- **Personal data** (this repo is public): the owner's real workout database copies, the 3 Oct backup, the coach profile and library entries (including notes on Jeff Nippard's programs), a Wahoo workout with heart rate, and recorded coach requests that carried the owner's context. They stay with the owner, not in git.
- **Third-party downloads:** 35 MB of Iconify icon packs used to search for icons, two cloned skill repos (https://github.com/jakubkrehel/skills and a sibling), and three throwaway clones of this repo with `node_modules`.
- **Logs** from local servers and test runs.
