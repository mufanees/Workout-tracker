// The muscle map: front and back views, each region coloured by recovery or by this week's volume.
// Tap a region (or a row under the map) for its fatigue, when it's fresh, sets this week, when it was
// last trained and the exercises behind it. The model lives in shared/fatigue.mjs, wired in src/fatigue.ts.
import { useState } from 'preact/hooks'
import { exMap } from '../store'
import { navigate } from '../router'
import { muscleStatusAt, REGIONS, regionName, volumeLevel, workoutRegions, type RegionId, type RegionStatus } from '../fatigue'
import { BACK, FRONT, VIEW_H, VIEW_W, type Part } from './bodyPaths'
import { Segmented } from './inputs'
import { Icon } from './icons'
import { useNow } from './Fasting'
import { fmtNum, relDays, startOfDay } from '../util'
import type { Workout } from '../types'

export type MapMode = 'fatigue' | 'volume' | 'worked'
type Levels = Partial<Record<RegionId, number>>

const MIRROR = `matrix(-1 0 0 1 ${VIEW_W} 0)`

/** Fill for a fatigue value: a continuous ramp, barely tinted while fresh (under 25 %), through amber
 * while recovering, to red when fatigued (CSS .bm-fatigue.lo / .hi mix by --bm-t). */
export function fatigueFill(f: number): { cls: string; style: Record<string, string> } {
  const t = f < 0.25 ? (f / 0.25) * 22 : f < 0.5 ? 40 + ((f - 0.25) / 0.25) * 60 : Math.min(100, 35 + ((f - 0.5) / 0.3) * 65)
  return { cls: f < 0.5 ? 'lo' : 'hi', style: { '--bm-t': String(Math.round(t)) } }
}

/** Front and back figures. `levels` 0–4 per region (volume, worked) or `fatigue` 0–1 per region; `onSelect` makes regions buttons. */
export function BodyFigure({
  levels = {},
  fatigue,
  mode,
  selected,
  onSelect,
  labelOf,
  compact,
}: {
  levels?: Levels
  fatigue?: Partial<Record<RegionId, number>>
  mode: MapMode
  selected?: RegionId | null
  onSelect?: (id: RegionId) => void
  labelOf?: (id: RegionId) => string
  compact?: boolean
}) {
  const tabbed = new Set<string>()
  const view = (parts: Part[], name: 'Front' | 'Back') => {
    const byRegion = new Map<string, Part[]>()
    const inert: Part[] = []
    for (const p of parts) p.r ? byRegion.set(p.r, [...(byRegion.get(p.r) || []), p]) : inert.push(p)
    const both = (p: Part, cls: string, key: string) => [
      <path key={key} class={cls} d={p.d} />,
      p.c ? null : <path key={key + 'm'} class={cls} d={p.d} transform={MIRROR} />,
    ]
    return (
      <figure class="bm-view">
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role={onSelect ? 'group' : 'img'} aria-label={`${name} view`}>
          {inert.map((p, i) => both(p, 'bm-body', 'i' + i))}
          {[...byRegion.entries()].map(([r, ps]) => {
            const id = r as RegionId
            const on = selected === id
            const ff = fatigue ? fatigueFill(fatigue[id] || 0) : null
            const cls = `bm-m bm-${mode} ${ff ? ff.cls : 'l' + (levels[id] || 0)}${on ? ' sel' : ''}`
            if (!onSelect)
              return (
                <g key={r} style={ff?.style}>
                  {ps.map((p, i) => both(p, cls, r + i))}
                </g>
              )
            // one tab stop per region (the first view that draws it)
            const first = !tabbed.has(id)
            tabbed.add(id)
            const select = () => onSelect(id)
            return (
              <g
                key={r}
                style={ff?.style}
                class="bm-btn"
                role="button"
                tabIndex={first ? 0 : -1}
                aria-hidden={first ? undefined : 'true'}
                aria-label={labelOf ? labelOf(id) : regionName(id)}
                aria-pressed={on}
                onClick={select}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), select())}
              >
                {/* a wider, invisible outline makes small regions easier to hit */}
                {ps.map((p, i) => both(p, 'bm-hit', r + 'h' + i))}
                {ps.map((p, i) => both(p, cls, r + i))}
              </g>
            )
          })}
        </svg>
        {!compact && <figcaption>{name}</figcaption>}
      </figure>
    )
  }
  return (
    <div class={'bm-figure' + (compact ? ' compact' : '')}>
      {view(FRONT, 'Front')}
      {view(BACK, 'Back')}
    </div>
  )
}

const LEGEND: Record<MapMode, [number, string][]> = {
  fatigue: [
    [0, 'Fresh'],
    [2, 'Recovering'],
    [4, 'Fatigued'],
  ],
  volume: [
    [0, 'None'],
    [2, 'Building'],
    [4, 'On target'],
  ],
  worked: [
    [1, 'Light'],
    [4, 'Hard'],
  ],
}

export function MapLegend({ mode }: { mode: MapMode }) {
  return (
    <div class="bm-legend" aria-hidden="true">
      {LEGEND[mode].map(([lv, label]) => (
        <span>
          <i class={`bm-sw bm-${mode} l${lv}`} />
          {label}
        </span>
      ))}
    </div>
  )
}

// ---- words ------------------------------------------------------------------------------------

const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const hourFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric' })

/** When a region is fresh again: "now", "in 5 h", "tonight", "tomorrow 9 AM", "Tue 9 AM" (`short` drops the hour). */
export function freshWhen(s: RegionStatus, now: number, short = false) {
  if (!s.freshAt) return 'now'
  const h = (s.freshAt - now) / 3600000
  if (h < 10) return `in ${Math.max(1, Math.round(h))} h`
  const at = new Date(s.freshAt)
  const days = Math.round((startOfDay(at) - startOfDay(new Date(now))) / 86400000)
  if (days <= 0) return 'tonight'
  const day = days === 1 ? 'tomorrow' : weekday.format(at)
  return short ? day : `${day} ${hourFmt.format(at)}`
}
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
/** "Glutes, chest and quads" */
const listWords = (names: string[]) => {
  const l = names.map((n, i) => (i ? n.toLowerCase() : n))
  return l.length > 1 ? `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}` : l[0] || ''
}

const pct = (f: number) => Math.round(f * 100)
const STATE: Record<string, string> = { fresh: 'Fresh', recovering: 'Recovering', fatigued: 'Fatigued' }
const sets = (n: number) => fmtNum(n, 1)

const volumeLevels = (st: Record<RegionId, RegionStatus>): Levels => Object.fromEntries(REGIONS.map((r) => [r.id, volumeLevel(st[r.id].weekSets, r.target)]))
const fatigues = (st: Record<RegionId, RegionStatus>) => Object.fromEntries(REGIONS.map((r) => [r.id, st[r.id].fatigue])) as Partial<Record<RegionId, number>>

// ---- Body tab card ------------------------------------------------------------------------------

const MODE_KEY = 'gloop-muscle-mode'
const readMode = (): 'fatigue' | 'volume' => {
  try {
    return localStorage.getItem(MODE_KEY) === 'volume' ? 'volume' : 'fatigue'
  } catch {
    return 'fatigue'
  }
}

/** "Muscles" card on the Body tab. */
export function MuscleCard() {
  const now = useNow(60000)
  const [mode, setModeState] = useState<'fatigue' | 'volume'>(readMode)
  const [sel, setSel] = useState<RegionId | null>(null)
  const [all, setAll] = useState(false)
  const st = muscleStatusAt(now)
  const setMode = (m: 'fatigue' | 'volume') => {
    setModeState(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      /* private mode */
    }
  }
  const label = (id: RegionId) => {
    const s = st[id]
    return mode === 'volume' ? `${regionName(id)}, ${sets(s.weekSets)} sets this week` : `${regionName(id)}, ${pct(s.fatigue)}% fatigued`
  }
  const anyData = REGIONS.some((r) => st[r.id].last != null)
  const toggle = (id: RegionId) => setSel(sel === id ? null : id)

  return (
    <section class="card bm-card" aria-label="Muscles">
      <div class="bm-head">
        <span class="eyebrow">
          <Icon name="mobility" size={14} /> Muscles
        </span>
        <Segmented
          label="Map shows"
          value={mode}
          options={[
            ['fatigue', 'Recovery'],
            ['volume', 'Volume'],
          ]}
          onChange={setMode}
        />
      </div>
      {mode === 'volume' ? (
        <BodyFigure levels={volumeLevels(st)} mode="volume" selected={sel} onSelect={toggle} labelOf={label} />
      ) : (
        <BodyFigure fatigue={fatigues(st)} mode="fatigue" selected={sel} onSelect={toggle} labelOf={label} />
      )}
      <MapLegend mode={mode} />
      {!anyData ? (
        <p class="bm-note">Log a workout and this map shows which muscles are recovering and how much each one got this week.</p>
      ) : sel ? (
        <RegionDetail s={st[sel]} now={now} onClose={() => setSel(null)} />
      ) : (
        <RegionList st={st} mode={mode} now={now} all={all} setAll={setAll} onSelect={setSel} />
      )}
    </section>
  )
}

function RegionList({
  st,
  mode,
  now,
  all,
  setAll,
  onSelect,
}: {
  st: Record<RegionId, RegionStatus>
  mode: 'fatigue' | 'volume'
  now: number
  all: boolean
  setAll: (v: boolean) => void
  onSelect: (id: RegionId) => void
}) {
  const list = REGIONS.map((r) => st[r.id])
  let rows: RegionStatus[]
  let note: string
  if (mode === 'fatigue') {
    rows = list.filter((s) => s.state !== 'fresh').sort((a, b) => b.fatigue - a.fatigue)
    note = rows.length ? 'Tap a muscle for details.' : 'Everything is fresh. Train whatever you like.'
  } else {
    rows = list.filter((s) => s.weekSets > 0).sort((a, b) => b.weekSets - a.weekSets)
    const under = list.filter((s) => s.weekSets < s.target[0]).map((s) => regionName(s.id, true))
    note = under.length ? `Under target this week: ${under.join(', ')}.` : 'Every muscle is on target this week.'
  }
  const shown = all ? rows : rows.slice(0, 4)
  return (
    <div class="bm-list">
      {shown.map((s) => {
        const r = REGIONS.find((x) => x.id === s.id)!
        const fill = mode === 'fatigue' ? s.fatigue : Math.min(1, s.weekSets / r.target[1])
        const ff = mode === 'fatigue' ? fatigueFill(s.fatigue) : null
        const lv = ff ? ff.cls : 'l' + volumeLevel(s.weekSets, r.target)
        return (
          <button class="bm-row" onClick={() => onSelect(s.id)}>
            <span class="bm-row-name">{r.short || r.name}</span>
            <span class="bm-bar">
              <span class={`bm-${mode} ${lv}`} style={{ width: `${Math.max(4, fill * 100)}%`, ...ff?.style }} />
              {mode === 'volume' && <i class="bm-band" style={{ left: `${(r.target[0] / r.target[1]) * 100}%` }} />}
            </span>
            <span class="bm-row-val">
              {mode === 'fatigue' ? (
                <>
                  <b>{pct(s.fatigue)}%</b> <small>fresh {freshWhen(s, now, true)}</small>
                </>
              ) : (
                <>
                  <b>{sets(s.weekSets)}</b> <small>of {r.target[0]}–{r.target[1]}</small>
                </>
              )}
            </span>
          </button>
        )
      })}
      {rows.length > 4 && (
        <button class="show-all" onClick={() => setAll(!all)}>
          {all ? 'Show less' : `Show ${rows.length - 4} more`}
        </button>
      )}
      <p class="bm-note">{note}</p>
    </div>
  )
}

function RegionDetail({ s, now, onClose }: { s: RegionStatus; now: number; onClose: () => void }) {
  const r = REGIONS.find((x) => x.id === s.id)!
  const volPct = Math.min(100, (s.weekSets / r.target[1]) * 100)
  return (
    <div class="bm-detail" aria-live="polite">
      <div class="bm-detail-head">
        <h3>{r.name}</h3>
        <button class="icon-btn" onClick={onClose} aria-label="Close details">
          <Icon name="x" size={18} />
        </button>
      </div>
      <div class="bm-detail-stats">
        <div>
          <b class={`bm-state ${s.state}`}>{pct(s.fatigue)}%</b>
          <span>{STATE[s.state]}</span>
        </div>
        <div>
          <b>{cap(freshWhen(s, now))}</b>
          <span>{s.freshAt ? 'Fresh by' : 'Fresh'}</span>
        </div>
        <div>
          <b>{s.last ? relDays(s.last).replace(/^./, (c) => c.toUpperCase()) : 'Not yet'}</b>
          <span>Last trained</span>
        </div>
      </div>
      <div class="bm-vol">
        <div class="bm-vol-label">
          <span>Sets, last 7 days</span>
          <span>
            <b>{sets(s.weekSets)}</b> of {r.target[0]}–{r.target[1]}
          </span>
        </div>
        <span class="bm-bar">
          <span class={`bm-volume l${volumeLevel(s.weekSets, r.target)}`} style={{ width: `${Math.max(s.weekSets ? 4 : 0, volPct)}%` }} />
          <i class="bm-band" style={{ left: `${(r.target[0] / r.target[1]) * 100}%` }} />
        </span>
      </div>
      {s.top.length > 0 && (
        <ul class="bm-top">
          {s.top.slice(0, 3).map((t) => (
            <li>
              <button onClick={() => navigate('/exercises/' + t.exerciseId)}>
                <span>{exMap.value.get(t.exerciseId)?.name || 'Exercise'}</span>
                <small>{sets(t.sets)} sets</small>
                <Icon name="right" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---- compact maps ---------------------------------------------------------------------------------

/** Train home section: recovery at a glance; opens the Body tab. Hidden until there's training in the last 10 days. */
export function MuscleHome() {
  const now = useNow(60000)
  const st = muscleStatusAt(now)
  const recent = REGIONS.some((r) => st[r.id].last != null && now - st[r.id].last! < 10 * 86400000)
  if (!recent) return null
  const tired = REGIONS.map((r) => st[r.id])
    .filter((s) => s.state !== 'fresh')
    .sort((a, b) => b.fatigue - a.fatigue)
  const fresh = REGIONS.filter((r) => st[r.id].state === 'fresh' && ['chest', 'lats', 'quads', 'hamstrings', 'glutes', 'front_delts', 'side_delts'].includes(r.id))
  return (
    <button class="card bm-home" onClick={() => navigate('/body')} aria-label="Muscle recovery: open the Body tab">
      <BodyFigure fatigue={fatigues(st)} mode="fatigue" compact />
      <div class="bm-home-text">
        <span class="eyebrow">Recovery</span>
        {tired.length ? (
          <>
            <p>
              <b>{listWords(tired.slice(0, 3).map((s) => regionName(s.id, true)))}</b> {tired.length === 1 ? 'is' : 'are'} still recovering.
            </p>
            <small>
              {regionName(tired[0].id, true)} fresh {freshWhen(tired[0], now)}
            </small>
          </>
        ) : (
          <p>
            <b>Everything is fresh.</b>
          </p>
        )}
        {tired.length > 0 && fresh.length > 0 && <small>Ready: {listWords(fresh.slice(0, 3).map((r) => r.short || r.name))}</small>}
      </div>
      <Icon name="right" size={18} class="bm-home-go" />
    </button>
  )
}

/** Workout detail: the muscles this session worked. */
export function WorkedMap({ w }: { w: Workout }) {
  const load = workoutRegions(w)
  const ids = Object.keys(load) as RegionId[]
  if (!ids.length) return null
  // shade by effort-weighted sets: 4 or more hard sets is the darkest
  const levels: Levels = {}
  for (const id of ids) levels[id] = Math.max(1, Math.min(4, Math.ceil(load[id]!.eff)))
  const top = ids.sort((a, b) => load[b]!.eff - load[a]!.eff)
  return (
    <section class="card bm-worked-card">
      <span class="eyebrow">Muscles worked</span>
      <div class="bm-worked-body">
        <BodyFigure levels={levels} mode="worked" compact />
        <ul class="bm-worked-list">
          {top.slice(0, 5).map((id) => (
            <li>
              <i class={`bm-sw bm-worked l${levels[id]}`} />
              <span>{regionName(id, true)}</span>
              <b>{sets(load[id]!.sets)}</b>
            </li>
          ))}
          <li class="bm-worked-unit">sets (helpers count half)</li>
        </ul>
      </div>
    </section>
  )
}
