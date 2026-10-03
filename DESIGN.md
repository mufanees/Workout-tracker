# Reps design system

One set of tokens drives every screen. They live at the top of `src/styles.css`; components use the tokens, never raw pixel values. If a value you need isn't a token, use the next step up (more air, never less) rather than inventing one.

## Principles

- **Glanceable mid-set.** The numbers you act on (weight, reps, time, rest) are the largest thing on screen, in tabular figures.
- **One accent.** Lime (`--accent`) means "do this" or "done": primary buttons, completed sets, the active tab, closed rings. Everything else is neutral.
- **Space groups things.** Tight inside a group, open between groups: the gap between groups is at least twice the gap inside one.
- **Motion explains, and the lime is liquid.** One arrival curve, quicker exits, nothing that slows logging a set. Lime things behave like goo: they squash when pressed, wobble back, and melt into each other (see Goo).

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
- Screens and the tab pill: View Transitions API (`transition()` in `src/router.ts`). Tab switches fade; going deeper slides from the right; back slides the other way.
- Only transform, opacity and filter animate. `prefers-reduced-motion` drops movement and keeps colour and press feedback.

## Goo

The gooey layer (`src/ui/Goo.tsx`, the "goo" block at the end of `styles.css`). All of it is decoration: `aria-hidden`, `pointer-events: none`, off under `prefers-reduced-motion`.

- **Metaball filters** (`<GooDefs />`, mounted once in App): blur, then a hard alpha cut, so nearby blobs melt into one shape. `#goo` (blur 7) for splashes and bursts, `#goo-sm` (blur 3.2) for small things such as the coach dots, `#goo-soft` (blur 14, no edge composite) for lava.
- **Spring**: `--spring`, a CSS `linear()` curve that overshoots about 16% and settles. Used for the jelly release, the tab pill and the ooze on chips.
- **Jelly press**: lime buttons and the set check squash to `scale: 1.05 0.9` while held and spring back; a check that turns on wobbles.
- **Ooze**: selected chips (check-in, effort, feedback, fasting day and plan chips) swell and settle with the spring.
- **Splash** (`gooSplash(el, host)`): ticking a set throws seven lime droplets out of the check that melt back in (~720ms). Drawn inside the exercise card so it scrolls with the row.
- **Tab pill**: the lime pill stretches across to the new tab (view transition `tab-pill`, 520ms on the spring) and jiggles on arrival.
- **Lava**: four slow blobs drifting behind the plan / program card on training days (opacity .55, 11–19s loops).
- **Burst**: blobs rise and merge behind the celebration hero. **Dots**: the coach's "thinking" indicator is three blobs that merge and split.

## Components

- **Card**: `--surface`, 1px `--line`, `--radius`, `--pad-card`.
- **Hero card** (quote, celebration): `--ink` with lime diagonal stripes, `--r-2xl`; stays dark in light mode.
- **Routine card**: name (17, bold) over an Inter exercise list (15, up to 3 lines), actions on the right.
- **Superset block**: tinted with `--ss`, header "Superset N · 1a → 1b, then rest", member cards inside, one rest button at the bottom.
- **Set row**: set number, previous (tap to copy), weight, reps, check; done rows tint lime.
- **Buttons**: pill. Primary (lime) for the one main action per screen; secondary (surface-2); ink for actions on lime.
- **Tab bar**: floating ink pill; the active tab is a lime pill with its label.
- **Sheets**: slide up from the bottom, footer actions pinned.
