import { useState } from 'preact/hooks'
import { active, routines, saveRoutine, remove, saveSettings, exMap } from '../store'
import { navigate } from '../router'
import { startCardio, startEmpty, startRoutine } from '../workout'
import { planStatus } from '../plan'
import { Icon } from '../ui/icons'
import { actionSheet, confirmDialog, toast } from '../ui/overlay'
import type { Routine } from '../types'
import { uid, startOfWeek } from '../util'
import { SyncBadge } from './Settings'
import { HeroQuote } from '../ui/Quote'
import { recentWin } from '../stats'
import { workouts, unit } from '../store'
import { fmtDay as fmtDayU, fmtNum, fmtSeconds, toDisplay } from '../util'
import { Elapsed } from './Live'
import { TodayRings } from '../ui/Rings'
import { BlockCard, GoalCard } from './Goal'
import { CheckinCard } from '../ui/Checkin'

export function Train() {
  const groups = new Map<string, Routine[]>()
  for (const r of routines.value) {
    const k = r.folder || ''
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(r)
  }
  const keys = [...groups.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))

  return (
    <div class="screen">
      <header class="page-head">
        <h1>Train</h1>
        <SyncBadge />
        <button class="icon-btn" onClick={() => navigate('/settings')} aria-label="Settings">
          <Icon name="sliders" />
        </button>
      </header>

      <TodayRings />
      <CheckinCard />
      <GoalCard />
      <BlockCard />
      <HeroQuote tag={daysSinceLast() >= 3 ? 'Action & Consistency' : undefined} />
      {!active.value && <PlanCard />}
      <WinCard />

      <div class="quick-starts">
        <button class="btn btn-secondary btn-lg grow" onClick={startEmpty}>
          <Icon name="plus" /> Empty workout
        </button>
        <button class="btn btn-secondary btn-lg grow" onClick={() => startCardio(2)}>
          <Icon name="heart" /> Zone 2 cardio
        </button>
      </div>

      <div class="section-head">
        <h2>Routines</h2>
        <div class="row">
          <button class="btn btn-text" onClick={() => navigate('/import')}>
            <Icon name="upload" size={18} /> Import
          </button>
          <button class="btn btn-text" onClick={() => navigate('/routine/new')}>
            <Icon name="plus" size={18} /> New
          </button>
        </div>
      </div>
      {!routines.value.length && <p class="empty-note">No routines yet. Build one you can start with a tap.</p>}
      {keys.map((k) => (
        <Folder key={k} name={k} list={groups.get(k)!} />
      ))}
    </div>
  )
}

function Folder({ name, list }: { name: string; list: Routine[] }) {
  const plan = planStatus.value
  const isPlan = list.some((r) => r.id.startsWith('r-comeback-'))
  const [open, setOpen] = useState(!isPlan)
  const shown = open ? list : isPlan && plan ? list.filter((r) => r.id.startsWith(`r-comeback-${plan.phase.n}`)) : []
  if (!name) return <div class="routine-list">{list.map((r) => <RoutineCard r={r} />)}</div>
  return (
    <section class="folder">
      <button class="folder-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon name="folder" size={18} />
        <span>{name}</span>
        <span class="folder-count">{list.length}</span>
        <Icon name="down" size={18} class={'chev' + (open ? ' open' : '')} />
      </button>
      <div class="routine-list">
        {shown.map((r) => (
          <RoutineCard r={r} />
        ))}
        {!open && isPlan && plan && (
          <button class="show-all" onClick={() => setOpen(true)}>
            Showing Phase {plan.phase.n}. Show all {list.length}
          </button>
        )}
      </div>
    </section>
  )
}

function RoutineCard({ r }: { r: Routine }) {
  const names = r.exercises.map((e) => exMap.value.get(e.exerciseId)?.name).filter(Boolean)
  const menu = () =>
    actionSheet({
      title: r.name,
      actions: [
        { label: 'Edit routine', icon: 'pencil', onSelect: () => navigate('/routine/' + r.id) },
        {
          label: 'Duplicate',
          icon: 'copy',
          onSelect: async () => {
            await saveRoutine({ ...structuredClone(r), id: uid('r'), name: r.name + ' (copy)', order: r.order + 0.5, updatedAt: 0 })
            toast('Routine duplicated')
          },
        },
        {
          label: 'Delete routine',
          icon: 'trash',
          danger: true,
          onSelect: async () => {
            const ok = await confirmDialog({ title: `Delete “${r.name}”?`, message: 'Past workouts stay in your history.', confirm: 'Delete', danger: true })
            if (!ok) return
            await remove('routines', r.id)
            toast('Routine deleted', { label: 'Undo', run: () => void saveRoutine(r) })
          },
        },
      ],
    })
  return (
    <div class="routine-card">
      <button class="routine-main" onClick={() => navigate('/routine/' + r.id)} aria-label={`Edit ${r.name}`}>
        <span class="routine-name">{r.name}</span>
        <span class="routine-ex">{names.length ? names.join(' · ') : 'No exercises yet'}</span>
      </button>
      <div class="routine-actions">
        <button class="icon-btn" onClick={menu} aria-label={`Options for ${r.name}`}>
          <Icon name="more" />
        </button>
        <button class="btn btn-primary btn-sm" onClick={() => startRoutine(r)} aria-label={`Start ${r.name}`}>
          Start
        </button>
      </div>
    </div>
  )
}

function PlanCard() {
  const p = planStatus.value
  if (!p || !p.routine) return null
  const pickWeek = () =>
    actionSheet({
      title: 'Which week are you on?',
      message: 'Missed time? Repeat the last week you completed.',
      actions: Array.from({ length: 12 }, (_, i) => i + 1).map((n) => ({
        label: `Week ${n}`,
        hint: n <= 3 ? 'Rebuild' : n <= 6 ? 'Build' : n <= 9 ? 'Strength' : 'Peak',
        selected: n === Math.min(p.week, 12),
        onSelect: () => {
          const monday = new Date(startOfWeek(Date.now()))
          void saveSettings({ planStart: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * (n - 1)).getTime() })
        },
      })),
    })
  return (
    <section class={'plan-card' + (p.restDay ? ' rest' : '')}>
      <div class="plan-top">
        <button class="plan-eyebrow" onClick={pickWeek} aria-label={`Week ${Math.min(p.week, 12)} of 12. Change week`}>
          Week {Math.min(p.week, 12)} of 12 <Icon name="down" size={14} />
        </button>
        <div class="plan-weeks" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <span class={i + 1 < p.week ? 'past' : i + 1 === p.week ? 'now' : ''} />
          ))}
        </div>
      </div>
      <h2 class="plan-title">Workout {p.day}</h2>
      <p class="plan-phase">
        Phase {p.phase.n} · {p.phase.name}
      </p>
      <p class="plan-note">{p.setsHint || p.phase.note}</p>
      <p class={'plan-status' + (p.restDay ? ' rest' : '')}>{p.finished ? 'You’ve finished the 12 weeks. Keep running Phase 4 or start over.' : p.status}</p>
      <button class="btn btn-block btn-lg" onClick={() => startRoutine(p.routine!)}>
        <Icon name="play" size={18} /> Start Workout {p.day}
      </button>
    </section>
  )
}

export function MiniBar() {
  const w = active.value
  if (!w) return null
  return (
    <button class="mini-bar" onClick={() => navigate('/live')}>
      <span class="mini-dot" aria-hidden="true" />
      <span class="mini-text">
        <b>{w.name}</b>
        <small>
          <Elapsed start={w.start} /> · Tap to resume
        </small>
      </span>
      <Icon name="up" size={18} />
    </button>
  )
}

function daysSinceLast() {
  const last = workouts.value[0]
  return last ? Math.floor((Date.now() - last.start) / 86400000) : 0
}

/** "Two weeks ago your body couldn't do what it just did." */
function WinCard() {
  const win = recentWin()
  if (!win) return null
  const ex = exMap.value.get(win.exerciseId)
  const u = unit.value
  const fmt = (v: number) => (win.unit === 'weight' ? `${fmtNum(toDisplay(v, u))} ${u}` : win.unit === 'time' ? fmtSeconds(v) : `${v} reps`)
  return (
    <button class="win-card" onClick={() => navigate('/exercises/' + win.exerciseId)}>
      <span class="eyebrow">
        <Icon name="up" size={14} /> Progress
      </span>
      <span class="win-line">
        <b>{ex?.name}</b>
        <span>
          {fmt(win.from)} <Icon name="right" size={14} /> <b class="win-to">{fmt(win.to)}</b>
        </span>
      </span>
      <span class="win-sub">Since {fmtDayU(win.since)}. Your body couldn’t do this back then.</span>
    </button>
  )
}
