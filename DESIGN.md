# Reps design system

One set of tokens drives every screen. They live at the top of `src/styles.css`; components use the tokens, never raw pixel values. If a value you need isn't a token, use the next step up (more air, never less) rather than inventing one.

## Principles

- **Glanceable mid-set.** The numbers you act on (weight, reps, time, rest) are the largest thing on screen, in tabular figures.
- **One accent.** Lime (`--accent`) means "do this" or "done": primary buttons, completed sets, the active tab, closed rings. Everything else is neutral.
- **Space groups things.** Tight inside a group, open between groups: the gap between groups is at least twice the gap inside one.
- **Motion explains, and the lime is liquid.** One arrival curve, quicker exits, nothing that slows logging a set. Shapes never morph; lime particles carry the liveliness: droplets off a tap, motes off the active tab (see Goo).

## Color

Dark-first, with a light theme that follows the phone. Defined once on `:root`, redefined for light.

| Token | Dark | Use |
|---|---|---|
| `--bg` | #0b0c0f | Screen background |
| `--surface` / `-2` / `-3` | #15171c / #1e2128 / #282c35 | Cards, inputs, pressed and tracks |
| `--line` | #262a32 | Hairline borders and dividers |
| `--text` / `--muted` / `--faint` | #f3f4f6 / #8d939e / #7c828d | Primary, secondary, tertiary text |
| `--accent` / `--accent-ink` | #c6f432 / #0b0c0f | Primary action, done, active |
| `--accent-text` | #c6f432 (light: #4b7300) | Accent used as text (readable on light) |
| `--blue` | #6aa8ff | Fasting |
| `--ring-z2` | #ff8a3d | Zone 2 |
| `--gold` | #ffc94a | Records, milestones, weigh-ins |
| `--warn` / `--danger` | #ffb547 / #ff6464 | Behind pace, too hard / hurt, delete |
| `--ink` | #111214 | Always-dark surfaces: tab bar, hero cards |

Supersets take their colour from `SUPERSET_COLORS` in `src/util.ts` (`--ss`).

## Type

- **Space Grotesk** (display and UI): headings, labels, buttons, every number.
- **Inter** (`--font-read`, reading and secondary text): exercise lists, notes, checklists, coach replies, hints, captions, meta lines and descriptions under 15px. Anything you read rather than scan.
- Space Grotesk keeps headings, buttons and chips, uppercase eyebrows, units beside big numbers and chart axes.

| Token | Size | Typical use |
|---|---|---|
| `--fs-11` | 11 | Uppercase eyebrows and column heads (letter-spacing 0.06–0.14em) |
| `--fs-12` / `--fs-13` | 12 / 13 | Captions, meta, hints |
| `--fs-14` / `--fs-15` | 14 / 15 | Secondary text, chips, buttons (small) |
| `--fs-16` / `--fs-17` | 16 / 17 | Body, inputs (16+ so iOS doesn't zoom), card titles |
| `--fs-20` / `--fs-22` | 20 / 22 | Section titles, sheet titles |
| `--fs-28` / `--fs-34` | 28 / 34 | Stat numbers, screen titles |
| `--fs-44` / `--fs-48` | 44 / 48 | Hero numbers (weight, timers) |

Headings use negative tracking (about -0.03em); numbers use `font-variant-numeric: tabular-nums`.

## Spacing

A 4px scale, with 2 and 6 only for tight control internals.

| Token | px | | Token | px |
|---|---|---|---|---|
| `--sp-0-5` | 2 | | `--sp-5` | 20 |
| `--sp-1` | 4 | | `--sp-6` | 24 |
| `--sp-1-5` | 6 | | `--sp-8` | 32 |
| `--sp-2` | 8 | | `--sp-10` | 40 |
| `--sp-3` | 12 | | `--sp-12` | 48 |
| `--sp-4` | 16 | | | |

**Layout roles** (use these first):

| Role | Token | Value |
|---|---|---|
| Screen edge | `--gutter` | 16 |
| Inside a card | `--pad-card` | 20 |
| Between things inside a card | `--gap-in-card` | 12 |
| Between sibling cards | `--gap-list` | 12 |
| Between sections of a screen | `--gap-section` | 32 |
| Inside a superset block | | 6 (so the 16px between blocks reads as separation) |

## Radius

Concentric: an inner element's radius is the outer radius minus the padding between them (a superset block of 28 with 6px padding holds cards of 22).

| Token | px | Use |
|---|---|---|
| `--r-xs` | 4 | Tiny marks, bars |
| `--r-sm` | 8 | Tags, small chips |
| `--r-md` | 12 | Inputs, set cells, list rows |
| `--r-lg` | 16 | Inner panels, toasts |
| `--r-xl` (`--radius`) | 22 | Cards |
| `--r-2xl` | 28 | Hero cards, superset blocks |
| `--r-pill` | 999 | Buttons, pills, tab bar |

Squircle cards: where the browser supports `corner-shape: squircle` (Chrome / Android 139+), cards, sheets and hero blocks use a continuous squircle corner and the card radii grow so it reads (`--r-lg` 30, `--r-xl` 46, `--r-2xl` 58). Other browsers (Safari today) keep the round radii above. One `@supports` block in `styles.css` holds the list.

## Sizes

Touch targets are at least 44px: `--h-sm` 36 (secondary chips only), `--h-md` 44 (buttons, icon buttons), `--h-lg` 54 (primary actions). Set rows are 56px tall with 46px inputs and a 50px check.

## Motion

- Arrivals: `300ms cubic-bezier(0.2, 0, 0, 1)` (`--ease`), from `opacity 0`, `translateY(12px)`, `blur(4px)`.
- Exits: `150ms ease-out`, quieter (fade, small move).
- Press: `scale: 0.96` over 150ms.
- Icon swaps (a set's check): from `scale 0.25`, `blur(4px)`.
- Screens and the tab pill: View Transitions API (`transition()` in `src/router.ts`). The old screen stays fully opaque underneath (it only slides) and the new one fades in on top, and both snapshots get the page colour as a solid background, so every frame is a true blend of the two pictures: no dip toward the background (a fade-out under a slower fade-in flashed, worst in light mode) and no double exposure. No blend modes (some web views lack `plus-lighter`). Tab switches crossfade; going deeper slides from the right; back slides the other way. Checked by measuring screen brightness on every frame of a recording in both themes.
- Only transform, opacity and filter animate. `prefers-reduced-motion` drops movement and keeps colour and press feedback.

## Goo

The gooey layer (`src/ui/Goo.tsx`, the "goo" block at the end of `styles.css`). All of it is decoration: `aria-hidden`, `pointer-events: none`, off under `prefers-reduced-motion`.

- **Metaball filters** (`<GooDefs />`, mounted once in App): blur, then a hard alpha cut, so nearby blobs melt into one shape. `#goo` (blur 7) for the set splash and celebration burst, `#goo-sm` (blur 3.2) for tap droplets, `#goo-soft` (blur 14) for lava. `#goo-merge` / `#goo-merge-sm` follow the classic recipe (blur, alpha cut, then `feMerge` the crisp original back on top), so separate shapes keep their own edges and only grow liquid bridges where they come close: used for the tab pill and the coach dots.
- **Gooey morphs are separate shapes, not distorted ones.** A morph is several shapes inside one goo filter moving on slightly offset timings (GSAP): the gaps stay small enough (well under ~20px) for the filter to bridge them, so a neck stretches and snaps. Big delays make shapes fly apart and read as separate blobs.
- **No squash-and-stretch.** The owner tried squash-and-stretch presses, a jelly tab pill and blob-shaped chip corners and found them abrupt and oddly shaped. Presses stay `scale: 0.96`; chips settle with a slight scale and keep their corners.
- **GooTrack** (`src/ui/Goo.tsx`): the shared gooey move for anything that marks one selected thing. A highlight plus blobs under `#goo-merge-lg`. Buttery by design: one family of curves shaped by Settings → Goo → Easing (`glideCurve()`: cubic-bezier(0.25 + 0.32d, 0, 0.22 − 0.09d, 1), d = 0 soft … 2 very dramatic, default 1.3: a slow push off, a fast sweep, a long slow landing; never overshooting, since reversing reads as a jolt), a glide of 0.85 + 0.25d seconds (landing bulges timed to its arrival), lumps and puddle on sine curves, a soft settle wobble. When everything has finished it rests as an exact copy of the target (extras hidden, radius in px: GSAP keeps a CSS percentage unit if you pass a bare number, which once made the pill's corners elliptical). A new move clears the previous move's extras first. `gsap.ticker.lagSmoothing(100, 16)`: after a stall (the browser pauses drawing while it swaps screens) motion continues instead of jumping ahead. Works in any direction; sizes scale with height (designed at 48px); `appear`, `hide`, `settle` (follows layout changes, never cuts a glide short).
- **Goo groups**: put `data-goo` on any container whose direct children are options (one `.on`) and the selection travels between them as a GooTrack: check-in, fasting day and offset chips, plans, lengths, effort, feedback, segmented controls, the Log view toggle, the shoulder scale, exercise types, chart metric chips, the clock's hour / minute boxes and AM / PM. A tap starts the goo at once (before the app re-renders). The options' backgrounds move to a `::before` under the goo (colours read from the real styles, so each group keeps its own), and their text turns 230ms in, as the goo arrives. Translucent selected backgrounds don't survive the filter's alpha cut, so they need solid colours (the clock box uses `color-mix`). Not for horizontally scrolling rows.
- **Clock knob** (`Clock.tsx`): hand, pivot, knob, four drops and three bulges in one `#goo-merge` layer, moved by GSAP along the dial. A tap or hour → minute switch glides the knob round with drops strung out along the arc and lands lumpy; dragging leaves a short trail behind the finger.
- **Toggles** (`Toggle` in `inputs.tsx`): the white knob is a GooTrack, so it slides across with a trail and lands lumpy.
- **Scrolling rows** (`data-goo` on a horizontal scroller, e.g. the muscle filter): the goo layer spans the whole scroll width.
- **Sheets** (`SheetJelly`): as a sheet lands, blobs of the sheet's colour well up out of its top edge (bridged to it by the filter) and wobble back in.
- **Settings → Goo** (`src/gooConfig.ts`, `src/screens/GooSettings.tsx`): on/off, Gooeyness (filter blur 0.4–1.8×), Speed (0.5–2×), Easing (soft → very dramatic), Lumpiness, Wobble (elastic period), Trail (drop lag), tap droplets, motes, lava, with a live preview; everything reads the values at the moment it animates. **Accent colour** (`src/accent.ts`): seven presets or any colour; `--accent-ink` and `--accent-text` are worked out for 4.5:1 contrast in each theme; accent tints in CSS use `color-mix` with `var(--accent)`.
- **Tab pill** (`TabGoo`, GSAP, filter `#goo-merge-lg`, blur 10): the lime pill lives in the tab bar, not in a tab, and starts moving on the tap itself (`gooTab(i)` before `navigate`, aiming at the tab's predicted size) so it never waits for the next screen to render. It moves on a CustomEase (`goo-move`: a short ramp-up so it doesn't jerk off the mark, a long soft deceleration, ~5% overshoot that eases back; 0.75s) while its width eases without overshoot (`goo-size`, 0.6s), so it settles rather than stops dead; everything else fades or shrinks on sine curves, never pops; the tab it leaves bulges into three lumps that are pulled after it and thin to nothing, a puddle there is sucked thin, a tail and four drops string out behind and catch up, and it lands lumpy: three blobs bulge past its edges and wobble back in (`elastic.out(0.9, 0.55)`, 1.1s) until it settles into a clean pill. All shapes are separate; the filter makes them one liquid. A first version (0.5s, two drops) showed goo for ~150ms and read as a plain slide, so judge motion from a real-time recording (Playwright `recordVideo` + ffmpeg frames), not only a frozen clock. Its `view-transition-name` is `tab-goo` with the old snapshot hidden, so it animates live during the screen transition. Tab labels take their width at once and fade in. Reduced motion: it jumps.
- **Tap droplets** (`gooTap`, a capture-phase click listener in `GooDefs`): tapping any button, link or tab buds a small bead on the control's top edge (above the finger, never over the label) and 6–9 droplets of 4–11px break off and drift up and away, each at its own pace (0.9–1.6 s). Skipped for text fields, the set check (it has its own splash) and `[data-no-goo]`; at most four at once.
- **Motes** (`<Motes />` in the active tab): five tiny lime particles keep rising off the top of the tab pill on 2.8–4.1 s loops.
- **Splash** (`gooSplash(el, host)`): ticking a set throws seven lime droplets out of the check that melt back in (~720ms), drawn inside the exercise card so it scrolls with the row.
- **Lava**: four slow blobs drifting behind the plan / program card on training days (opacity .55, 11–19s loops).
- **Burst**: blobs rise and merge behind the celebration hero. **Dots** (GSAP): the coach's "thinking" indicator is three drops that rise off a bar one after another (`back.out(2)`) and sink back into it.

## Components

- **Card**: `--surface`, 1px `--line`, `--radius`, `--pad-card`.
- **Hero card** (quote, celebration): `--ink` with lime diagonal stripes, `--r-2xl`; stays dark in light mode.
- **Routine card**: name (17, bold) over an Inter exercise list (15, up to 3 lines), actions on the right.
- **Superset block**: tinted with `--ss`, header "Superset N · 1a → 1b, then rest", member cards inside, one rest button at the bottom.
- **Set row**: set number, previous (tap to copy), weight, reps, check; done rows tint lime.
- **Buttons**: pill. Primary (lime) for the one main action per screen; secondary (surface-2); ink for actions on lime.
- **Tab bar**: floating ink pill; the active tab is a lime pill with its label.
- **Sheets**: slide up from the bottom, footer actions pinned.
