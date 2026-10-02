# Reps design system files

`DESIGN.md` at the repo root holds the rules. This folder turns the same values into a Claude **Design System** artifact (tokens, fonts, component previews), so the system can be browsed and reused for new designs.

- `build.py`: generates everything under `project/` from the app's real values (colours, type, spacing, radius, motion) plus `DESIGN.md`. Copies the fonts from `node_modules`, so run `npm install` first.
- `icons.json`: the Lucide icon paths used in the previews.
- `project/`: the generated files (committed, so you can publish without regenerating).
  - `design-system.json` (index), `tokens.json`, `README.md`
  - `components/bundle.css` and nine components, each with `README.md` and a static `preview.html`: Button, Card, RoutineCard, SetRow, SupersetBlock, TabBar, Chips, CelebrationHero, ActivityRings (plus a Cover)
  - `fonts/`: Space Grotesk and Inter

```bash
npm install
python3 design-system/build.py
```

## Publishing

Ask Claude to create a Design System artifact (from the Design System artifact type) and publish `design-system/project/` to it: `project/design-system.json` as the main file, every other file under `project/` as supporting files at the same paths, root `design-system/`.

The current one is private to the owner's old Claude account: https://claude.ai/artifact/DmFNNgMBC8PN5woMDfjcdk

## Keeping it in sync

The source of truth is `src/styles.css` (tokens at the top). When tokens change, update `DESIGN.md` and the values in `build.py`, rerun it, and republish. Previews are static renditions of the app's CSS, not live components.
