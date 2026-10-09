import { Fragment } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { active, routines, saveRoutine, remove, saveSettings, exMap, settings } from '../store'
import { navigate } from '../router'
import { startCardio, startEmpty, startRoutine } from '../workout'
import { planStatus } from '../plan'
import { programStatus } from '../program'
import { Icon } from '../ui/icons'
import { actionSheet, confirmDialog, Sheet, toast } from '../ui/overlay'
import { Toggle } from '../ui/inputs'
import { catalog, followOwnProgram, startCatalogProgram } from '../programs'
import { PLAN_FOLDER } from '../seed'
import { COMEBACK_PHASE_FOLDERS } from '../validate'
import { FastWidget } from '../ui/Fasting'
import type { Routine } from '../types'
import { uid, startOfWeek } from '../util'
import { SyncBadge } from './Settings'
import { SignInNudge } from './Account'
import { MobilityCard } from './MobilityCard'
import { HeroQuote } from '../ui/Quote'
import { recentWin } from '../stats'
import { workouts, unit } from '../store'
import { fmtDay as fmtDayU, fmtNum, fmtSeconds, toDisplay } from '../util'
import { Elapsed } from './Live'
import { TodayRings } from '../ui/Rings'
import { BlockCard, GoalCard } from './Goal'
import { CheckinCard } from '../ui/Checkin'
import { Lava } from '../ui/Goo'

/** Sections of the home screen, in their default order. Settings → home holds your order and hidden ones. */
export const HOME_SECTIONS: { id: string; label: string; hint?: string }[] = [
  { id: 'rings', label: 'Today’s rings' },
  { id: 'fast', label: 'Current fast', hint: 'Shows while a fast is running' },
  { id: 'checkin', label: 'Morning check-in', hint: 'Until you’ve answered it' },
  { id: 'goal', label: 'Goals' },
  { id: 'block', label: 'Training block' },
  { id: 'mobility', label: 'Mobility plan' },
  { id: 'quote', label: 'Quote' },
  { id: 'program', label: 'Program: next workout' },
  { id: 'win', label: 'Progress highlight' },
  { id: 'quick', label: 'Quick starts', hint: 'Empty workout, Zone 2 cardio' },
  { id: 'routines', label: 'Routines and programs' },
]

/** Your home layout: every section once, in your order (new sections land in their default spot). */
export function homeLayout(): { id: string; label: string; hint?: string; hidden: boolean }[] {
  const h = settings.value.home || {}
  const hidden = new Set(h.hidden || [])
  // The old "Show Comeback plan card" switch still hides the program card.
  if (settings.value.showPlan === false) hidden.add('program')
  const known = new Map(HOME_SECTIONS.map((x) => [x.id, x]))
  const order = (h.order || []).filter((id) => known.has(id))
  for (const [i, x] of HOME_SECTIONS.entries()) {
    if (order.includes(x.id)) continue
    // after the section that precedes it by default
    const prev = HOME_SECTIONS.slice(0, i).reverse().find((y) => order.includes(y.id))
    order.splice(prev ? order.indexOf(prev.id) + 1 : 0, 0, x.id)
  }
  return order.map((id) => ({ ...known.get(id)!, hidden: hidden.has(id) }))
}

export function Train() {
  const [customizing, setCustomizing] = useState(false)
  const section = (id: string) => {
    switch (id) {
      case 'rings':
        return <TodayRings />
      case 'fast':
        return <FastWidget />
      case 'checkin':
        return <CheckinCard />
      case 'goal':
        return <GoalCard />
      case 'block':
        return <BlockCard />
      case 'mobility':
        return <MobilityCard />
      case 'quote':
        return <HeroQuote tag={daysSinceLast() >= 3 ? 'Action & Consistency' : undefined} />
      case 'program':
        return !active.value && routines.value.length ? programStatus.value ? <ProgramCard /> : <PlanCard /> : null
      case 'win':
        return <WinCard />
      case 'quick':
        return (
          <div class="quick-starts">
            <button class="btn btn-secondary btn-lg grow" onClick={startEmpty}>
              <Icon name="plus" /> Empty workout
            </button>
            <button class="btn btn-secondary btn-lg grow" onClick={() => startCardio(2)}>
              <Icon name="heart" /> Zone 2 cardio
            </button>
          </div>
        )
      case 'routines':
        return <RoutinesSection />
    }
    return null
  }

  return (
    <div class="screen">
      <header class="page-head">
        <h1>Train</h1>
        <SyncBadge />
        <button class="icon-btn" onClick={() => navigate('/settings')} aria-label="Settings">
          <Icon name="sliders" />
        </button>
      </header>

      <SignInNudge />
      {!routines.value.length && !active.value && <StarterCard />}
      {homeLayout()
        .filter((x) => !x.hidden)
        .map((x) => (
          <Fragment key={x.id}>{section(x.id)}</Fragment>
        ))}
      <button class="btn btn-text customize-home" onClick={() => setCustomizing(true)}>
        <Icon name="sliders" size={16} /> Customize home
      </button>
      <HomeCustomizer open={customizing} onClose={() => setCustomizing(false)} />
    </div>
  )
}

/** Show, hide and reorder the home sections. */
function HomeCustomizer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const list = homeLayout()
  const save = (next: typeof list) => void saveSettings({ home: { order: next.map((x) => x.id), hidden: next.filter((x) => x.hidden).map((x) => x.id) }, ...(settings.value.showPlan === false ? { showPlan: true } : {}) })
  const move = (i: number, d: number) => {
    const next = [...list]
    const [x] = next.splice(i, 1)
    next.splice(i + d, 0, x)
    save(next)
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Customize home"
      footer={
        <button class="btn btn-secondary btn-block" onClick={() => void saveSettings({ home: { order: [], hidden: [] }, showPlan: true })}>
          Reset to default
        </button>
      }
    >
      <p class="sheet-hint">Turn sections on or off and move them up or down. Cards that have nothing to show stay out of the way on their own.</p>
      <ul class="home-sections">
        {list.map((x, i) => (
          <li class={x.hidden ? 'off' : ''} key={x.id}>
            <span class="hs-label">
              {x.label}
              {x.hint && <small>{x.hint}</small>}
            </span>
            <button class="icon-btn sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${x.label} up`}>
              <Icon name="up" size={18} />
            </button>
            <button class="icon-btn sm" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${x.label} down`}>
              <Icon name="downArrow" size={18} />
            </button>
            <Toggle label={`Show ${x.label}`} checked={!x.hidden} onChange={(on) => save(list.map((y) => (y.id === x.id ? { ...y, hidden: !on } : y)))} />
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

/** A new person (or a fresh start): pick a ready-made program or build your own. */
function StarterCard() {
  return (
    <section class="starter-card">
      <span class="eyebrow">
        <Icon name="library" size={14} /> Get started
      </span>
      <h2>Pick a program, or start from scratch</h2>
      <ul class="starter-list">
        {catalog.map((p) => (
          <li key={p.id}>
            <button class="starter-item" onClick={() => navigate('/programs?open=' + p.id)}>
              <b>{p.name}</b>
              <small>
                {p.weeks} weeks · {p.daysPerWeek} days a week{p.minutes ? ` · ~${p.minutes} min` : ''}
              </small>
            </button>
          </li>
        ))}
      </ul>
      <div class="row gap">
        <button class="btn btn-secondary grow" onClick={() => navigate('/routine/new')}>
          <Icon name="plus" size={18} /> Build a routine
        </button>
        <button class="btn btn-secondary grow" onClick={startEmpty}>
          <Icon name="dumbbell" size={18} /> Empty workout
        </button>
      </div>
    </section>
  )
}

/** Programs (each holding folders), then folders, then loose routines. */
function RoutinesSection() {
  const [naming, setNaming] = useState<{ title: string; value: string; hint?: string; done: (v: string) => void } | null>(null)
  const list = routines.value
  const programs = [...new Set(list.map((r) => r.program || '').filter(Boolean))].sort((a, b) => {
    const f = settings.value.program?.name
    return a === f ? -1 : b === f ? 1 : a.localeCompare(b)
  })
  const loose = list.filter((r) => !r.program)
  const folders = groupBy(loose, (r) => r.folder || '')
  const keys = [...folders.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
  const ask = (title: string, value: string, done: (v: string) => void, hint?: string) => setNaming({ title, value, done, hint })

  const newMenu = () =>
    actionSheet({
      title: 'Add',
      actions: [
        { label: 'New routine', icon: 'plus', onSelect: () => navigate('/routine/new') },
        { label: 'A program from the library', icon: 'library', hint: `${catalog.length}`, onSelect: () => navigate('/programs') },
        {
          label: 'New program of your own',
          icon: 'program',
          onSelect: () => ask('New program', '', (name) => navigate(`/routine/new?program=${encodeURIComponent(name)}&folder=${encodeURIComponent('Phase 1')}`), 'A program holds folders (phases or weeks), and folders hold routines. Next: its first routine.'),
        },
        { label: 'Import a plan', icon: 'upload', onSelect: () => navigate('/import') },
      ],
    })

  return (
    <>
      <div class="section-head">
        <h2>Routines</h2>
        <div class="row">
          <button class="btn btn-text" onClick={() => navigate('/programs')}>
            <Icon name="library" size={18} /> Programs
          </button>
          <button class="btn btn-text" onClick={newMenu}>
            <Icon name="plus" size={18} /> New
          </button>
        </div>
      </div>
      {!list.length && <p class="empty-note">No routines yet. Pick a program or build one you can start with a tap.</p>}
      {programs.map((name) => (
        <ProgramGroup key={'p:' + name} name={name} list={list.filter((r) => r.program === name)} ask={ask} />
      ))}
      {keys.map((k) => (
        <Folder key={'f:' + k} name={k} list={folders.get(k)!} ask={ask} />
      ))}
      <NameSheet state={naming} onClose={() => setNaming(null)} />
    </>
  )
}

function groupBy<T>(list: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const x of list) {
    const k = key(x)
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(x)
  }
  return m
}

type Ask = (title: string, value: string, done: (v: string) => void, hint?: string) => void

/** Write a field on many routines at once (moving folders between programs, renaming). */
async function retag(list: Routine[], patch: Partial<Routine>) {
  for (const r of list) await saveRoutine({ ...r, ...patch })
}

/** The folder of a program that Train is on right now (its current phase). */
function currentFolder(program: string): string | null {
  const s = programStatus.value
  if (s?.phase && s.program.name === program) return s.phase.folder
  if (!settings.value.program && program === PLAN_FOLDER && planStatus.value) return COMEBACK_PHASE_FOLDERS[planStatus.value.phase.n - 1]
  return null
}

function ProgramGroup({ name, list, ask }: { name: string; list: Routine[]; ask: Ask }) {
  const followed = settings.value.program?.name === name || (!settings.value.program && name === PLAN_FOLDER && !!planStatus.value)
  const [open, setOpen] = useState(followed)
  const folders = groupBy([...list].sort((a, b) => a.order - b.order), (r) => r.folder || '')
  const cur = currentFolder(name)
  const fromCatalog = catalog.find((p) => p.name === name)
  const menu = () =>
    actionSheet({
      title: name,
      message: fromCatalog?.summary,
      actions: [
        ...(followed
          ? []
          : [
              {
                label: 'Follow this program',
                icon: 'play',
                onSelect: async () => toast(fromCatalog ? await startCatalogProgram(fromCatalog.id) : await followOwnProgram(name)),
              },
            ]),
        {
          label: 'Add a folder',
          icon: 'folder',
          onSelect: () => ask('New folder', `Phase ${folders.size + 1}`, (f) => navigate(`/routine/new?program=${encodeURIComponent(name)}&folder=${encodeURIComponent(f)}`), 'Next: the folder’s first routine.'),
        },
        { label: 'Rename program', icon: 'pencil', onSelect: () => ask('Rename program', name, async (v) => {
          await retag(list, { program: v })
          const p = settings.value.program
          if (p?.name === name) await saveSettings({ program: { ...p, name: v } })
        }) },
        {
          label: 'Ungroup',
          icon: 'unlink',
          hint: 'Folders stay',
          onSelect: async () => {
            const folderNames = new Set(list.map((r) => r.folder))
            await retag(list, { program: undefined })
            if (settings.value.program?.name === name && settings.value.program.phases) await saveSettings({ program: null })
            toast(`${folderNames.size} folder${folderNames.size === 1 ? '' : 's'} moved out of ${name}`, { label: 'Undo', run: () => void retag(list, { program: name }) })
          },
        },
        {
          label: 'Delete program',
          icon: 'trash',
          danger: true,
          onSelect: async () => {
            if (!(await confirmDialog({ title: `Delete “${name}”?`, message: `Its ${list.length} routines go too. Past workouts stay in your history.`, confirm: 'Delete', danger: true }))) return
            for (const r of list) await remove('routines', r.id)
            if (settings.value.program?.name === name) await saveSettings({ program: null })
            toast('Program deleted', { label: 'Undo', run: () => void (async () => { for (const r of list) await saveRoutine(r) })() })
          },
        },
      ],
    })
  return (
    <section class={'program-group' + (followed ? ' followed' : '')}>
      <div class="program-head">
        <button class="program-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          <Icon name="program" size={18} />
          <span class="program-name">
            {name}
            <small>
              {folders.size} folder{folders.size === 1 ? '' : 's'} · {list.length} routine{list.length === 1 ? '' : 's'}
              {followed ? ' · Following' : ''}
            </small>
          </span>
          <Icon name="down" size={18} class={'chev' + (open ? ' open' : '')} />
        </button>
        <button class="icon-btn" onClick={menu} aria-label={`Options for ${name}`}>
          <Icon name="more" />
        </button>
      </div>
      {open && (
        <div class="program-body">
          {[...folders.keys()].map((f) => (
            <Folder key={f} name={f} list={folders.get(f)!} program={name} current={f === cur} ask={ask} />
          ))}
        </div>
      )}
    </section>
  )
}

function Folder({ name, list, program, current, ask }: { name: string; list: Routine[]; program?: string; current?: boolean; ask: Ask }) {
  const [open, setOpen] = useState(program ? !!current : true)
  // A new phase starting opens its folder.
  useEffect(() => {
    if (current) setOpen(true)
  }, [current])
  if (!name) return <div class="routine-list">{list.map((r) => <RoutineCard r={r} />)}</div>
  const programs = [...new Set(routines.value.map((r) => r.program || '').filter((p) => p && p !== program))]
  const menu = () =>
    actionSheet({
      title: name,
      actions: [
        { label: 'Add a routine here', icon: 'plus', onSelect: () => navigate(`/routine/new?folder=${encodeURIComponent(name)}${program ? `&program=${encodeURIComponent(program)}` : ''}`) },
        { label: 'Rename folder', icon: 'pencil', onSelect: () => ask('Rename folder', name, (v) => void retag(list, { folder: v })) },
        ...programs.map((p) => ({ label: `Move into ${p}`, icon: 'program', onSelect: () => void retag(list, { program: p }) })),
        { label: 'Move into a new program', icon: 'program', onSelect: () => ask('New program', '', (p) => void retag(list, { program: p }), `“${name}” becomes its first folder.`) },
        ...(program ? [{ label: `Take out of ${program}`, icon: 'unlink', onSelect: () => void retag(list, { program: undefined }) }] : []),
      ],
    })
  return (
    <section class={'folder' + (current ? ' current' : '')}>
      <div class="folder-row">
        <button class="folder-head" onClick={() => setOpen(!open)} aria-expanded={open}>
          <Icon name="folder" size={18} />
          <span>{name}</span>
          <span class="folder-count">{list.length}</span>
          {current && <span class="folder-now">Now</span>}
          <Icon name="down" size={18} class={'chev' + (open ? ' open' : '')} />
        </button>
        <button class="icon-btn sm" onClick={menu} aria-label={`Options for folder ${name}`}>
          <Icon name="more" size={18} />
        </button>
      </div>
      {open && (
        <div class="routine-list">
          {list.map((r) => (
            <RoutineCard r={r} />
          ))}
        </div>
      )}
    </section>
  )
}

/** A small sheet that asks for a name. */
function NameSheet({ state, onClose }: { state: { title: string; value: string; hint?: string; done: (v: string) => void } | null; onClose: () => void }) {
  const [v, setV] = useState('')
  const [last, setLast] = useState(state)
  if (state !== last) {
    setLast(state)
    if (state) setV(state.value)
  }
  const ok = () => {
    const name = v.trim()
    if (!name || !state) return
    onClose()
    state.done(name)
  }
  return (
    <Sheet
      open={!!state}
      onClose={onClose}
      title={last?.title}
      footer={
        <button class="btn btn-primary btn-block btn-lg" disabled={!v.trim()} onClick={ok}>
          Save
        </button>
      }
    >
      {last?.hint && <p class="sheet-hint">{last.hint}</p>}
      <label class="field">
        <span>Name</span>
        <input class="big-input" type="text" value={v} autoFocus onInput={(e) => setV(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && ok()} />
      </label>
    </Sheet>
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

/** The coach-built program: next routine in the rotation, sessions this week. */
function ProgramCard() {
  const s = programStatus.value!
  const total = s.totalWeeks
  const pickWeek = () =>
    actionSheet({
      title: 'Which week are you on?',
      message: 'Missed time? Repeat the last week you completed.',
      actions: Array.from({ length: total || 12 }, (_, i) => i + 1).map((n) => ({
        label: `Week ${n}`,
        hint: s.program.phases ? phaseOfWeek(s.program.phases, n) : undefined,
        selected: n === Math.min(s.week, total || 99),
        onSelect: () => {
          const monday = new Date(startOfWeek(Date.now()))
          void saveSettings({ program: { ...s.program, start: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * (n - 1)).getTime() } })
        },
      })),
    })
  const menu = () =>
    actionSheet({
      title: s.program.name,
      message: s.program.summary,
      actions: [
        ...(total ? [{ label: 'Change week', icon: 'calendar', hint: `Week ${Math.min(s.week, total)}`, onSelect: pickWeek }] : []),
        { label: 'Switch program', icon: 'library', onSelect: () => navigate('/programs') },
        { label: 'Ask coach to adjust it', icon: 'coach', onSelect: () => navigate(`/coach?ask=${encodeURIComponent(`Let's review my program “${s.program.name}”. I'm in week ${s.week}${s.phase ? `, ${s.phase.folder}` : ''}. What should change?`)}`) },
        {
          label: 'Stop following',
          icon: 'x',
          onSelect: async () => {
            if (await confirmDialog({ title: 'Stop this program?', message: 'Its routines stay under Routines. You can follow it again from its menu.', confirm: 'Stop program' })) void saveSettings({ program: null })
          },
        },
      ],
    })
  const weeks = total || s.target
  return (
    <section class={'plan-card' + (s.restDay ? ' rest' : '')}>
      {!s.restDay && <Lava />}
      <div class="plan-top">
        <button class="plan-eyebrow" onClick={menu} aria-label={`Week ${s.week} of ${s.program.name}. Options`}>
          {total ? `Week ${Math.min(s.week, total)} of ${total}` : `Week ${s.week}`} · {s.phase ? `Phase ${s.phase.n}` : s.program.name} <Icon name="down" size={14} />
        </button>
        <div class="plan-weeks" aria-hidden="true">
          {total
            ? Array.from({ length: weeks }, (_, i) => <span class={i + 1 < s.week ? 'past' : i + 1 === s.week ? 'now' : ''} />)
            : Array.from({ length: s.target }, (_, i) => <span class={i < s.thisWeek ? 'now' : ''} />)}
        </div>
      </div>
      <h2 class={'plan-title' + (s.routine.name.length > 14 ? ' long' : '')}>{s.routine.name}</h2>
      <div class="plan-sub">
        <p class={'plan-status' + (s.restDay ? ' rest' : '')}>{s.status}</p>
        <p class="plan-note">
          {s.phase ? `${s.program.name} · ` : ''}
          {s.thisWeek} of {s.target} this week{s.program.minutes ? ` · about ${s.program.minutes} min` : ''}
        </p>
      </div>
      <button class="btn btn-block btn-lg" onClick={() => startRoutine(s.routine)}>
        <Icon name="play" size={18} /> Start {s.routine.name}
      </button>
    </section>
  )
}

function phaseOfWeek(phases: { folder: string; weeks: number }[], week: number): string {
  let from = 1
  for (const [i, ph] of phases.entries()) {
    if (week < from + ph.weeks) return `Phase ${i + 1}`
    from += ph.weeks
  }
  return `Phase ${phases.length}`
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
      {!p.restDay && <Lava />}
      <div class="plan-top">
        <button class="plan-eyebrow" onClick={pickWeek} aria-label={`Week ${Math.min(p.week, 12)} of 12, phase ${p.phase.n} ${p.phase.name}. Change week`}>
          Week {Math.min(p.week, 12)} of 12 · {p.phase.name} <Icon name="down" size={14} />
        </button>
        <div class="plan-weeks" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <span class={i + 1 < p.week ? 'past' : i + 1 === p.week ? 'now' : ''} />
          ))}
        </div>
      </div>
      <h2 class="plan-title">Workout {p.day}</h2>
      <div class="plan-sub">
        <p class={'plan-status' + (p.restDay ? ' rest' : '')}>{p.finished ? 'You’ve finished the 12 weeks. Keep running Phase 4 or start over.' : p.status}</p>
        <p class="plan-note">{(p.setsHint || p.phase.note).replace(/^Week \d+:\s*/, (m) => (p.setsHint ? '' : m)).replace(/^./, (c) => c.toUpperCase())}</p>
      </div>
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
