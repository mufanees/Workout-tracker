# Generates the Reps design system files (project/...) from the app's real values.
import json, os, shutil, datetime
ROOT = os.path.dirname(os.path.abspath(__file__))
P = os.path.join(ROOT, 'project')
shutil.rmtree(P, ignore_errors=True)
os.makedirs(P)
ICONS = json.load(open(os.path.join(ROOT, 'icons.json')))
REPO = os.path.dirname(ROOT)
NM = os.path.join(REPO, 'node_modules/@fontsource-variable/')

def w(path, text):
    full = os.path.join(P, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    open(full, 'w').write(text)

def icon(name, size=20, stroke=2):
    return f'<svg class="i" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="{stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICONS[name]}</svg>'

# ---------- fonts ----------
os.makedirs(os.path.join(P, 'fonts'), exist_ok=True)
shutil.copy(NM + 'space-grotesk/files/space-grotesk-latin-wght-normal.woff2', os.path.join(P, 'fonts/SpaceGrotesk-Variable.woff2'))
shutil.copy(NM + 'inter/files/inter-latin-opsz-normal.woff2', os.path.join(P, 'fonts/Inter-Variable.woff2'))

# ---------- tokens ----------
C = lambda name, dark, light, usage: {"name": name, "value": {"dark": dark, "light": light}, "usage": usage}
colors = [
    C("bg", "#0b0c0f", "#f2f1ec", "Screen background. Every screen sits on it."),
    C("surface", "#15171c", "#ffffff", "Cards, sheets and settings groups."),
    C("surface-2", "#1e2128", "#e9e8e2", "Inputs, set cells, secondary buttons, chips."),
    C("surface-3", "#282c35", "#dddcd5", "Pressed states, ring tracks, the mini bar."),
    C("line", "#262a32", "#e2e1db", "1px card borders and list dividers."),
    C("text", "#f3f4f6", "#121316", "Primary text and numbers."),
    C("muted", "#8d939e", "#6b6f77", "Secondary text: meta, hints, the previous set."),
    C("faint", "#7c828d", "#868a91", "Tertiary text: column heads, disabled."),
    C("accent", "#c6f432", "#c6f432", "Lime. The one action or state that matters: primary buttons, done sets, the active tab, a closed ring. Never decoration."),
    C("accent-ink", "#0b0c0f", "#0b0c0f", "Text and icons on accent."),
    C("accent-text", "#c6f432", "#4b7300", "Accent used as text or an icon on surface (darker in light so it reads)."),
    C("accent-soft", "rgba(198, 244, 50, 0.12)", "rgba(132, 184, 0, 0.16)", "Tinted fill behind accent text: nudges, selected options."),
    C("ink", "#111214", "#111214", "Always-dark surfaces in both themes: the tab bar, hero and celebration cards."),
    C("blue", "#6aa8ff", "#2f6fe0", "Fasting: the Fast ring, fast pills in the calendar."),
    C("ring-move", "#c6f432", "#8fc400", "The Move ring (workout minutes). Darker lime in light so the ring holds on white."),
    C("ring-z2", "#ff8a3d", "#f07a2a", "Zone 2: the weekly Zone 2 ring and label."),
    C("gold", "#ffc94a", "#b7791f", "Personal records, milestones, weigh-ins."),
    C("gold-soft", "rgba(255, 201, 74, 0.14)", "rgba(225, 160, 40, 0.16)", "Fill behind record and milestone badges."),
    C("warn", "#ffb547", "#a35f00", "Behind pace, too hard, stalled. A state, never a brand colour."),
    C("danger", "#ff6464", "#d83a3a", "Delete, discard, an exercise that hurt."),
    C("danger-soft", "rgba(255, 100, 100, 0.12)", "rgba(216, 58, 58, 0.1)", "Fill behind danger text."),
]
sp = [("sp-0-5", 2, "Tight control internals only (tag padding, hairline offsets)."),
      ("sp-1", 4, "Icon-to-label inside small chips; tight stacks."),
      ("sp-1-5", 6, "Inside a superset block; small chip padding."),
      ("sp-2", 8, "Icon-to-label in buttons; gaps in dense rows."),
      ("sp-3", 12, "Default gap inside a card and between sibling cards."),
      ("sp-4", 16, "Screen gutter; gap between screen blocks; between superset blocks."),
      ("sp-5", 20, "Card padding."),
      ("sp-6", 24, "Large card padding, generous groups."),
      ("sp-8", 32, "Between sections of a screen."),
      ("sp-10", 40, "Large empty states."),
      ("sp-12", 48, "Hero spacing.")]
roles = [("gutter", 16, "Screen edge, left and right."),
         ("pad-card", 20, "Padding inside a card."),
         ("gap-in-card", 12, "Between things inside a card."),
         ("gap-list", 12, "Between sibling cards in a list."),
         ("gap-section", 32, "Between sections of a screen (a section title starts 32px below the previous block).")]
radius = [("r-xs", 4, "Bars, tiny marks."), ("r-sm", 8, "Tags, small chips."), ("r-md", 12, "Inputs, set cells, list rows, set number badges."),
          ("r-lg", 16, "Inner panels, toasts."), ("r-xl", 22, "Cards (the default card radius)."), ("r-2xl", 28, "Hero cards, superset blocks, the fasting card."),
          ("r-pill", 999, "Buttons, pills, chips, the tab bar.")]
tokens = {
    "name": "Reps", "version": 1,
    "color": {"themes": [{"id": "dark", "name": "Dark"}, {"id": "light", "name": "Light"}], "tokens": colors},
    "type": {
        "fonts": [
            {"family": "Space Grotesk", "file": "fonts/SpaceGrotesk-Variable.woff2", "weight": "300 700", "style": "normal"},
            {"family": "Inter", "file": "fonts/Inter-Variable.woff2", "weight": "100 900", "style": "normal"},
        ],
        "families": {
            "display": "\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, system-ui, sans-serif",
            "read": "Inter, -apple-system, \"Segoe UI\", Roboto, system-ui, sans-serif",
        },
        "groups": [
            {"name": "Display", "family": "display", "styles": [
                {"name": "hero-number", "fontSize": "48px", "lineHeight": 1, "fontWeight": 700, "letterSpacing": "-0.04em", "sample": "16h 12m", "usage": "The one number a screen is about: a fast, body weight, a celebration."},
                {"name": "screen-title", "fontSize": "34px", "lineHeight": 1.1, "fontWeight": 700, "letterSpacing": "-0.035em", "sample": "Train", "usage": "Top-level screen titles."},
                {"name": "stat", "fontSize": "28px", "lineHeight": 1.15, "fontWeight": 700, "letterSpacing": "-0.02em", "sample": "1,317 kg", "usage": "Summary stats (tabular numbers)."},
                {"name": "section-title", "fontSize": "22px", "lineHeight": 1.2, "fontWeight": 700, "letterSpacing": "-0.03em", "sample": "Routines", "usage": "Section headings inside a screen."},
                {"name": "card-title", "fontSize": "17px", "lineHeight": 1.25, "fontWeight": 750, "letterSpacing": "-0.01em", "sample": "Phase 1 · Workout A", "usage": "Routine and exercise names, card titles."},
            ]},
            {"name": "Interface", "family": "display", "styles": [
                {"name": "body", "fontSize": "16px", "lineHeight": 1.45, "fontWeight": 400, "sample": "Start a fast when you finish eating.", "usage": "Default UI text and inputs (16px+ so iOS never zooms)."},
                {"name": "button", "fontSize": "16px", "lineHeight": 1.2, "fontWeight": 650, "sample": "Start Workout B", "usage": "Buttons and tabs."},
                {"name": "label", "fontSize": "14px", "lineHeight": 1.3, "fontWeight": 650, "sample": "Session length", "usage": "Field labels, chips, small buttons."},
                {"name": "caption", "fontSize": "13px", "lineHeight": 1.35, "fontWeight": 500, "sample": "Today at 1:28 PM", "usage": "Meta and hints."},
                {"name": "eyebrow", "fontSize": "11px", "lineHeight": 1.2, "fontWeight": 700, "letterSpacing": "0.12em", "sample": "WEEK 6 OF 12", "usage": "Uppercase card eyebrows and column heads (set uppercase in CSS)."},
            ]},
            {"name": "Reading", "family": "read", "styles": [
                {"name": "read-body", "fontSize": "17px", "lineHeight": 1.5, "fontWeight": 400, "opticalSize": 17, "sample": "Your warm-up took most of the time. Here is a 30-minute version.", "usage": "Coach replies and longer notes."},
                {"name": "read-list", "fontSize": "15px", "lineHeight": 1.4, "fontWeight": 400, "opticalSize": 15, "sample": "Goblet Squat · One-Arm Dumbbell Row · Dumbbell Floor Press", "usage": "Exercise lists in routine cards, checklist items, hints."},
            ]},
        ],
    },
    "spacing": {"note": "A 4px scale, plus 2 and 6 for tight control internals. Use the layout roles first; round up, never down.",
                "tokens": [{"name": n, "value": f"{v}px", "usage": u} for n, v, u in sp] + [{"name": n, "value": f"{v}px", "usage": u} for n, v, u in roles]},
    "radius": {"note": "Concentric: an inner radius is the outer radius minus the padding between them.",
               "tokens": [{"name": n, "value": f"{v}px", "usage": u} for n, v, u in radius]},
    "shadow": {"tokens": [{"name": "shadow-float", "value": {"dark": "0 10px 40px rgba(0, 0, 0, 0.5)", "light": "0 10px 40px rgba(0, 0, 0, 0.14)"}, "usage": "Floating layers only: sheets, toasts, the tab bar, the mini bar. Cards use a 1px line, not a shadow."}]},
    "size": {"note": "Touch targets: 44px minimum for anything you tap mid-workout.",
             "tokens": [{"name": "h-sm", "value": "36px", "usage": "Secondary chips and tags only."},
                        {"name": "h-md", "value": "44px", "usage": "Buttons, icon buttons, list rows."},
                        {"name": "h-lg", "value": "54px", "usage": "The primary action on a screen."},
                        {"name": "set-row", "value": "56px", "usage": "One set in the workout table."},
                        {"name": "set-input", "value": "46px", "usage": "Weight and reps cells."},
                        {"name": "tab-bar", "value": "58px", "usage": "Floating tab bar height."}]},
    "meta": {"source": "github", "repo": "mufanees/workout-tracker", "ref": "ccr-82a33bbf-3kimrv", "paths": {"tokens": ["src/styles.css"], "fonts": ["@fontsource-variable/space-grotesk", "@fontsource-variable/inter"], "docs": ["DESIGN.md"]}, "synced": datetime.date.today().isoformat()},
}
w('tokens.json', json.dumps(tokens, indent=1))

# ---------- component styles (static renditions of the app's CSS, on the system's tokens) ----------
w('components/bundle.css', r"""
/* Static renditions of the Reps components, written on the design-system tokens. */
body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--font-display); font-size: 16px; line-height: 1.45; -webkit-font-smoothing: antialiased; }
.demo { padding: var(--sp-5); display: flex; flex-direction: column; gap: var(--sp-3); max-width: 420px; }
.row { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.i { display: block; flex: none; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sp-2); min-height: var(--h-md); padding: 0 20px; border-radius: var(--r-pill); border: 0; font: 650 16px/1.2 var(--font-display); white-space: nowrap; cursor: pointer; }
.btn-primary { background: var(--accent); color: var(--accent-ink); }
.btn-secondary { background: var(--surface-2); color: var(--text); }
.btn-ink { background: var(--ink); color: #fff; }
.btn-lg { min-height: var(--h-lg); font-size: 17px; }
.btn-sm { min-height: var(--h-sm); padding: 0 16px; font-size: 15px; }
.btn-block { width: 100%; }
.icon-btn { width: var(--h-md); height: var(--h-md); border-radius: var(--r-md); display: inline-grid; place-items: center; background: none; border: 0; color: var(--text); }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-xl); padding: var(--pad-card); display: flex; flex-direction: column; gap: var(--gap-in-card); }
.eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent-text); }
.muted { color: var(--muted); }
.read { font-family: var(--font-read); }
.routine-card { display: flex; align-items: center; gap: var(--sp-2); background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-xl); padding: var(--sp-2) var(--sp-4) var(--sp-2) 0; }
.routine-main { flex: 1; min-width: 0; padding: var(--sp-3) 0 var(--sp-3) var(--pad-card); display: flex; flex-direction: column; gap: var(--sp-1-5); }
.routine-name { font-weight: 700; font-size: 17px; }
.routine-ex { font-family: var(--font-read); font-size: 15px; line-height: 1.4; color: var(--muted); }
.chip { display: inline-flex; align-items: center; gap: var(--sp-1-5); min-height: var(--h-sm); padding: 0 13px; border-radius: var(--r-pill); background: var(--surface-2); color: var(--muted); font-size: 14px; font-weight: 650; }
.chip.on { background: var(--text); color: var(--bg); }
.tag { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: 13px; font-weight: 600; color: var(--muted); background: var(--surface-2); padding: 3px var(--sp-2); border-radius: var(--r-sm); min-height: 24px; }
.tag-up { background: var(--accent); color: var(--accent-ink); }
.tag-ss { color: var(--ss); background: color-mix(in srgb, var(--ss) 14%, transparent); }
.sets { --cols: 40px minmax(0, 1fr) 70px 60px 50px; display: flex; flex-direction: column; gap: var(--sp-1); }
.set-row { display: grid; grid-template-columns: var(--cols); gap: var(--sp-2); align-items: center; min-height: var(--set-row); padding: 0 var(--sp-1); border-radius: var(--r-md); }
.set-row.head { min-height: 26px; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; color: var(--faint); }
.set-row.done { background: color-mix(in srgb, var(--accent) 14%, var(--surface)); }
.set-kind { width: 40px; height: 44px; border-radius: var(--r-sm); display: grid; place-items: center; font-weight: 750; font-size: 14px; background: var(--surface-2); }
.set-row.done .set-kind { background: transparent; }
.prev { font-size: 14px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.num { height: var(--set-input); border-radius: var(--r-md); background: var(--surface-2); display: grid; place-items: center; font-weight: 700; font-size: 17px; font-variant-numeric: tabular-nums; }
.num.ph { color: var(--muted); font-weight: 600; }
.set-row.done .num { background: transparent; }
.check { width: 50px; height: var(--set-input); border-radius: var(--r-md); display: grid; place-items: center; background: var(--surface-2); color: var(--faint); }
.check.on { background: var(--accent); color: var(--accent-ink); }
.ex-card { background: var(--surface); border-radius: var(--r-xl); padding: var(--sp-3) var(--sp-3) var(--sp-2); display: flex; flex-direction: column; gap: var(--sp-2); }
.ex-head { display: flex; align-items: flex-start; gap: var(--sp-2); }
.ex-head h3 { margin: 0; font-size: 18px; font-weight: 750; flex: 1; }
.ss-group { --ss: #7c5cff; display: flex; flex-direction: column; gap: var(--sp-1-5); padding: var(--sp-1-5); border-radius: var(--r-2xl); background: color-mix(in srgb, var(--ss) 10%, var(--bg)); border: 1.5px solid color-mix(in srgb, var(--ss) 45%, transparent); }
.ss-head { display: flex; justify-content: space-between; align-items: center; padding: var(--sp-1-5) 10px var(--sp-0-5); }
.ss-badge { display: inline-flex; align-items: center; gap: var(--sp-1-5); font-size: 13px; font-weight: 750; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ss); }
.ss-hint { font-size: 13px; font-weight: 600; color: var(--muted); }
.ss-rest { display: flex; align-items: center; justify-content: center; gap: var(--sp-2); min-height: 48px; border-radius: var(--r-xl); font-weight: 650; font-size: 15px; color: var(--ss); background: color-mix(in srgb, var(--ss) 14%, var(--surface)); }
.tabbar { display: inline-flex; gap: var(--sp-1); padding: var(--sp-1-5); border-radius: var(--r-pill); background: var(--ink); border: 1px solid rgba(255, 255, 255, 0.08); }
.tab { height: 48px; min-width: 52px; padding: 0 14px; border-radius: var(--r-pill); display: flex; align-items: center; justify-content: center; gap: var(--sp-2); color: rgba(255, 255, 255, 0.62); font-weight: 650; font-size: 15px; }
.tab.on { background: var(--accent); color: var(--accent-ink); padding: 0 18px; }
.hero { position: relative; overflow: hidden; isolation: isolate; display: flex; flex-direction: column; gap: 14px; background: var(--ink); color: #fff; border-radius: var(--r-2xl); padding: var(--sp-5); }
.hero::before { content: ''; position: absolute; inset: -40% -20% auto auto; width: 80%; height: 170%; background: repeating-linear-gradient(115deg, rgba(198, 244, 50, 0.18) 0 14px, transparent 14px 34px); transform: rotate(8deg); z-index: -1; -webkit-mask-image: linear-gradient(to left, #000 20%, transparent 85%); mask-image: linear-gradient(to left, #000 20%, transparent 85%); }
.hero .eyebrow { color: var(--accent); }
.hero-num { display: flex; gap: 14px; align-items: baseline; font-size: 72px; font-weight: 700; letter-spacing: -0.05em; line-height: 0.9; font-variant-numeric: tabular-nums; }
.hero-num small { font-size: 0.42em; margin-left: 5px; color: rgba(255, 255, 255, 0.55); letter-spacing: -0.02em; }
.hero-bar { height: 12px; border-radius: var(--r-pill); background: rgba(255, 255, 255, 0.12); overflow: hidden; }
.hero-bar span { display: block; height: 100%; width: 100%; border-radius: var(--r-pill); background: var(--accent); }
.hero-labels { display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; color: rgba(255, 255, 255, 0.6); }
.hero-labels span:last-child { color: var(--accent); }
.hero p { margin: 0; font-size: 16px; font-weight: 600; color: rgba(255, 255, 255, 0.85); }
.rings { display: flex; align-items: center; gap: var(--sp-4); }
.legend { display: flex; flex-direction: column; gap: var(--sp-1-5); flex: 1; }
.legend div { display: flex; justify-content: space-between; align-items: baseline; }
.legend span { font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
.legend b { font-size: 20px; font-variant-numeric: tabular-nums; }
.legend b small { font-size: 13px; color: var(--muted); font-weight: 600; }
""")

# ---------- components ----------
def comp(name, group, height, summary, guide, html):
    w(f'components/{name}/README.md', f'# {name}\n\n{summary}\n\n{guide}\n\nHand-written from `src/styles.css` and the matching component in `src/` (static rendition).\n')
    w(f'components/{name}/preview.html', f'<!-- @dsCard group="{group}" height={height} -->\n<div class="demo">\n{html}\n</div>\n')

comp('Button', 'Actions', 200,
     'Pill buttons: one lime primary per screen, secondary for everything else, ink when it sits on lime.',
     '- **Primary** (`accent` on `accent-ink`): the one thing to do now. Start, Finish, Save.\n- **Secondary** (`surface-2`): other actions.\n- **Ink**: actions placed on a lime card (the plan card).\n- Heights: `h-md` 44 default, `h-lg` 54 for the main action, `h-sm` 36 only for chips.\n- Press feedback: `scale: 0.96` over 150ms ease-out.',
     f'''<div class="row"><button class="btn btn-primary">Start</button><button class="btn btn-secondary">{icon("plus",18)} Empty workout</button></div>
<button class="btn btn-primary btn-lg btn-block">{icon("check",20,2.5)} Finish workout</button>
<div style="background:var(--accent);padding:var(--sp-3);border-radius:var(--r-2xl)"><button class="btn btn-ink btn-block">Start Workout B</button></div>''')

comp('Card', 'Surfaces', 170,
     'The default container: surface fill, a 1px line, 22px radius and 20px padding.',
     '- Padding `pad-card` (20); content inside 12 apart (`gap-in-card`); sibling cards 12 apart (`gap-list`).\n- Cards use a line, not a shadow; shadows are only for floating layers.\n- Eyebrow first (11px, uppercase, `accent-text`), then the content.',
     '''<div class="card"><span class="eyebrow">Progress</span><div style="display:flex;justify-content:space-between;font-weight:700;font-size:17px"><span>One-Arm Dumbbell Row</span><span style="color:var(--accent-text)">15 kg</span></div><span class="muted read" style="font-size:15px">Since Sat, Aug 29. Your body couldn’t do this back then.</span></div>''')

comp('RoutineCard', 'Lists', 220,
     'A routine you can start: its name over a plain list of exercises, with options and Start on the right.',
     '- Name in `card-title`; exercises in `read-list` (Inter, 15px, up to 3 lines).\n- Start is the primary button; the ellipsis opens options.\n- Cards stack 12 apart.',
     f'''<div class="routine-card"><div class="routine-main"><span class="routine-name">Phase 1 · Workout A</span><span class="routine-ex">Goblet Squat · One-Arm Dumbbell Row · Dumbbell Floor Press · Glute Bridge · Dead Bug</span></div><button class="icon-btn">{icon("more")}</button><button class="btn btn-primary btn-sm">Start</button></div>
<div class="routine-card"><div class="routine-main"><span class="routine-name">Phase 1 · Workout B</span><span class="routine-ex">Dumbbell Romanian Deadlift · Bent-Over Dumbbell Row · Reverse Lunge · Side Plank</span></div><button class="icon-btn">{icon("more")}</button><button class="btn btn-primary btn-sm">Start</button></div>''')

comp('SetRow', 'Workout', 250,
     'One set in the workout table: number, previous (tap to copy), weight, reps and the check.',
     '- Rows are 56px (`set-row`) with 46px cells (`set-input`) and a 50px check: big enough to hit mid-set.\n- Grey numbers are suggestions (last time or the plan); typed numbers are full strength.\n- A done row tints lime and its check fills with `accent`; the check pops in from scale 0.25 with a 4px blur.\n- All numbers use tabular figures.',
     f'''<div class="sets"><div class="set-row head"><span style="text-align:center">SET</span><span>PREVIOUS</span><span style="text-align:center">KG</span><span style="text-align:center">REPS</span><span style="display:flex;justify-content:center">{icon("check",16,2.5)}</span></div>
<div class="set-row done"><span class="set-kind">1</span><span class="prev">17 × 10</span><span class="num">18</span><span class="num">10</span><span class="check on">{icon("check",18,3)}</span></div>
<div class="set-row"><span class="set-kind">2</span><span class="prev">17 × 11</span><span class="num ph">18</span><span class="num ph">10</span><span class="check">{icon("check",18,3)}</span></div>
<div class="set-row"><span class="set-kind">3</span><span class="prev">17 × 12</span><span class="num ph">18</span><span class="num ph">10</span><span class="check">{icon("check",18,3)}</span></div></div>''')

comp('SupersetBlock', 'Workout', 360,
     'Exercises done back to back, grouped in one tinted block with the rest timer once after the round.',
     '- The block takes the superset colour (`--ss`); its cards sit 6 apart inside and blocks sit 16 apart, so the group reads as one.\n- Concentric radius: block 28 with 6px padding, cards 22.\n- Header: "Superset N" and the order ("1a → 1b, then rest"); footer: the rest for the whole round.',
     f'''<div class="ss-group"><div class="ss-head"><span class="ss-badge">{icon("link",14)} Superset 1</span><span class="ss-hint">1a → 1b, then rest</span></div>
<div class="ex-card"><div class="ex-head"><h3>Goblet Squat</h3>{icon("video")}</div><div class="row"><span class="tag tag-ss">1a</span><span class="tag">{icon("target",13)} 8–10</span><span class="tag tag-up">{icon("up",13)} Go heavier</span></div></div>
<div class="ex-card"><div class="ex-head"><h3>One-Arm Dumbbell Row</h3>{icon("video")}</div><div class="row"><span class="tag tag-ss">1b</span><span class="tag">{icon("target",13)} 8–10 / side</span></div></div>
<div class="ss-rest">{icon("timer",16)} Rest 1:00 after each round</div></div>''')

comp('TabBar', 'Navigation', 120,
     'The floating tab bar: an ink pill with a lime pill for the active tab and its label.',
     '- Always `ink`, in both themes, floating 12px above the safe area.\n- Only the active tab shows its label; the lime pill glides between tabs (View Transitions, 300ms `cubic-bezier(0.2, 0, 0, 1)`) and sits under the icons.',
     f'''<div class="tabbar"><span class="tab on">{icon("dumbbell",22,2.4)} Train</span><span class="tab">{icon("history",22)}</span><span class="tab">{icon("list",22)}</span><span class="tab">{icon("activity",22)}</span><span class="tab">{icon("coach",22)}</span></div>''')

comp('Chips', 'Inputs', 150,
     'Pills for picking one option (filters, plans) and small tags that describe an exercise.',
     '- Chip: 36px pill, `surface-2`; selected inverts to `text` on `bg`.\n- Tag: 24px, 8px radius; the superset tag takes its colour; "Go heavier" uses `accent`.',
     f'''<div class="row"><span class="chip">13:11</span><span class="chip">14:10</span><span class="chip on">16:8</span><span class="chip">18:6</span></div>
<div class="row"><span class="tag tag-ss" style="--ss:#7c5cff">1a</span><span class="tag">{icon("target",13)} 8–10</span><span class="tag">{icon("timer",13)} 1:30</span><span class="tag tag-up">{icon("up",13)} Go heavier</span></div>''')

comp('CelebrationHero', 'Moments', 290,
     'The card that opens a finished workout or fast: an ink card with lime stripes, the result in huge numbers and a bar toward the goal.',
     '- Always dark (`ink`), stripes from `accent`, radius `r-2xl`.\n- Eyebrow says what happened; the number is the result; the bar shows the goal ("Goal 16h · Reached", or "Day earned" when you showed up but stopped early).\n- Arrives once: opacity, 12px rise and 4px blur at 300ms `cubic-bezier(0.2, 0, 0, 1)`.',
     '''<div class="hero"><span class="eyebrow">Fast complete · 16:8</span><div class="hero-num"><span>16<small>h</small></span><span>12<small>m</small></span></div><div><div class="hero-bar"><span></span></div><div class="hero-labels" style="margin-top:8px"><span>Goal 16h</span><span>Reached</span></div></div><p>You said you would, and you did.</p></div>''')

def ring_svg():
    rings = [("blue", 0.85), ("ring-move", 0.45), ("ring-z2", 0.3)]
    size, stroke, gap = 132, 14, 3
    c = size / 2
    out = [f'<svg width="{size}" height="{size}" viewBox="0 0 {size} {size}">']
    import math
    for i, (tok, pct) in enumerate(rings):
        r = c - stroke / 2 - i * (stroke + gap)
        L = 2 * math.pi * r
        out.append(f'<circle cx="{c}" cy="{c}" r="{r}" fill="none" stroke="var(--surface-3)" stroke-width="{stroke}"/>')
        out.append(f'<circle cx="{c}" cy="{c}" r="{r}" fill="none" stroke="var(--{tok})" stroke-width="{stroke}" stroke-linecap="round" stroke-dasharray="{L:.1f}" stroke-dashoffset="{L*(1-pct):.1f}" transform="rotate(-90 {c} {c})"/>')
    out.append('</svg>')
    return ''.join(out)
comp('ActivityRings', 'Moments', 210,
     'Today at a glance: Fast, Move and Zone 2 rings with their numbers.',
     '- Solid colours on a neutral `surface-3` track: `blue` for Fast, `ring-move` for Move, `ring-z2` for Zone 2. No glow.\n- Any workout earns the day (a check in the centre) even when the Move ring is short of 30 minutes.',
     f'''<div class="card"><div class="rings">{ring_svg()}<div class="legend"><div><span style="color:var(--blue)">Fast</span><b>14h<small> / 16h</small></b></div><div><span style="color:var(--accent-text)">Move</span><b>12<small> / 30 min</small></b></div><div><span style="color:var(--ring-z2)">Zone 2</span><b>45<small> / 150 min</small></b></div></div></div></div>''')

# ---------- cover ----------
stripes = []
for k in range(-6, 12):
    x = 496 + k * 32
    stripes.append(f'<line class="stripe" x1="{x}" y1="288" x2="{x + 120}" y2="0"/>')
w('components/Cover/preview.html', f'''<!-- @dsCard height=288 -->
<style>
  .cover {{ position: relative; width: 960px; height: 288px; background: var(--bg); overflow: hidden; }}
  .cover svg {{ position: absolute; inset: 0; }}
  .lime {{ fill: var(--accent); }}
  .slab {{ fill: var(--surface-3); }}
  .fast {{ fill: var(--blue); }}
  .z2 {{ fill: var(--ring-z2); }}
  .stripe {{ stroke: var(--accent-ink); stroke-width: 6; opacity: 0.18; }}
  .tile {{ rx: var(--r-2xl); }}
  .name {{ position: absolute; left: 40px; bottom: 64px; margin: 0; font: 700 120px/0.92 var(--font-display); letter-spacing: -0.05em; color: var(--text); }}
  .tag {{ position: absolute; left: 44px; bottom: 36px; margin: 0; font: 500 14px/1.3 var(--font-display); color: var(--muted); max-width: 420px; }}
</style>
<div class="cover">
  <svg viewBox="0 0 960 288" width="960" height="288" aria-hidden="true">
    <!-- blocks: accent (lime) slab 264x240 r-2xl as the identity colour; surface-3 slab bleeding right (stands in for ink, which vanishes on the dark ground);
         blue pill 120x56 (Fast) and ring-z2 disc r=28 (Zone 2) as satellites.
         arrangement: one tall lime slab with satellites to its right, the slab bleeding top and bottom like the plan card.
         pattern: diagonal stripes at a 32px pitch (sp-8) cut into the lime slab, the same speed stripes as the app's hero cards ("loud, bold, poster type").
         scales: sp-8 pitch, sp-6 margins, r-2xl corners, pill = half of 56. -->
    <defs><clipPath id="slab"><rect x="496" y="-28" width="264" height="344" rx="28"/></clipPath></defs>
    <rect class="lime tile" x="496" y="-28" width="264" height="344"/>
    <g clip-path="url(#slab)">{''.join(stripes)}</g>
    <rect class="slab tile" x="784" y="24" width="200" height="144"/>
    <rect class="fast" x="784" y="192" width="120" height="56" rx="28"/>
    <circle class="z2" cx="944" cy="220" r="28"/>
  </svg>
  <h1 class="name">Reps</h1>
  <p class="tag">Train, fast and show up. Numbers first, lime for what matters.</p>
</div>
''')

# ---------- README ----------
w('README.md', open(os.path.join(REPO, 'DESIGN.md')).read().replace('# Reps design system', '# Reps', 1) + '''
## Using this system

- Load `tokens.css` (generated from `tokens.json`); every token is a CSS variable of the same name (`--sp-4`, `--r-xl`, `--accent`).
- Fonts: Space Grotesk for display and UI (`--font-display`), Inter for reading text (`--font-read`). Both files are under `fonts/`.
- Icons: [Lucide](https://lucide.dev), 2px stroke (2.4 for the active tab), 20px in lists, 22px in the tab bar; `currentColor` so they follow the text.
- Components here are static renditions of the app's CSS (`components/bundle.css`); the source of truth is `src/styles.css` in mufanees/workout-tracker.

## Voice

Short, direct, encouraging without hype. Talk to someone between sets: "You showed up, and that counts." Name things the way a lifter would (sets, reps, RPE, superset, zone 2). Numbers carry the message; words frame them.
''')

# ---------- index ----------
now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')
w('design-system.json', json.dumps({
    "v": 3, "layout": "files", "createdOnFiles": {"v": 1, "at": now},
    "title": "Reps Design System", "namespace": "Reps", "libraries": [],
    "sections": {}, "groups": [], "assetGroups": {}, "blobs": {}, "docs": {"sections": []},
    "lastChange": {"by": "Mufhim", "at": now, "via": "Claude Code", "note": "Reading text switched from Source Serif 4 to Inter, to match the app."},
}, indent=1))
for dp, dn, fn in os.walk(P):
    for f in fn:
        print(os.path.relpath(os.path.join(dp, f), ROOT))
