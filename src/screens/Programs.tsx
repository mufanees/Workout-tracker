// The program library: ready-made programs anyone can start, with what's inside each.
import { useState } from 'preact/hooks'
import { back, navigate, route } from '../router'
import { routines, settings } from '../store'
import { Icon } from '../ui/icons'
import { actionSheet, confirmDialog, toast } from '../ui/overlay'
import { catalog, COMEBACK, hasProgram, isFollowing, startCatalogProgram } from '../programs'
import { programStatus } from '../program'
import { planStatus } from '../plan'
import type { CatalogProgram } from '../../shared/programs.mjs'

type PlanRoutine = { folder?: string; name: string; exercises: { name: string; sets?: number; reps?: string; notes?: string }[] }

export function Programs() {
  const [open, setOpen] = useState<string | null>(route.value.query.get('open'))
  const following = programStatus.value?.program.name || (planStatus.value ? 'Dumbbell Comeback' : null)
  return (
    <div class="screen">
      <header class="page-head sub">
        <button class="icon-btn" onClick={() => back('/train')} aria-label="Back">
          <Icon name="left" />
        </button>
        <span class="page-title">Programs</span>
        <span class="icon-btn" aria-hidden="true" />
      </header>
      <p class="page-intro">Start one and Train shows the next workout each day, moving through its phases by week. Its routines land under Routines, where you can change anything.</p>
      {catalog.map((p) => (
        <ProgramEntry key={p.id} p={p} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} following={following} />
      ))}
      <section class="program-own">
        <h2>Your own</h2>
        <p>Group your routines into a program from a folder’s menu on Train, import a plan, or ask your coach to build one around your time and equipment.</p>
        <div class="row gap">
          <button class="btn btn-secondary grow" onClick={() => navigate('/import')}>
            <Icon name="upload" size={18} /> Import a plan
          </button>
          <button class="btn btn-secondary grow" onClick={() => navigate(`/coach?ask=${encodeURIComponent('Build me a program that fits my time and equipment.')}`)}>
            <Icon name="coach" size={18} /> Ask coach
          </button>
        </div>
      </section>
    </div>
  )
}

function ProgramEntry({ p, open, onToggle, following }: { p: CatalogProgram; open: boolean; onToggle: () => void; following: string | null }) {
  const [busy, setBusy] = useState(false)
  const on = isFollowing(p)
  const added = hasProgram(p)
  const start = async (week = 1) => {
    if (busy) return
    if (following && following !== p.name && !(await confirmDialog({ title: `Switch to ${p.name}?`, message: `Train will follow ${p.name} instead of ${following}. ${following}’s routines and your history stay.`, confirm: 'Switch' }))) return
    setBusy(true)
    try {
      toast(await startCatalogProgram(p.id, week))
      navigate('/train')
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const startLater = () => {
    let from = 1
    actionSheet({
      title: 'Start at',
      message: 'Lifting for a while already? Skip ahead.',
      actions: p.phases.map((ph) => {
        const week = from
        from += ph.weeks
        return { label: ph.folder, hint: `Week ${week}`, onSelect: () => void start(week) }
      }),
    })
  }
  const routinesOf = (folder: string): PlanRoutine[] => {
    if (p.plan) return (p.plan.routines as PlanRoutine[]).filter((r) => r.folder === folder)
    // built-in plans: show the routines on Train when they're there
    return routines.value.filter((r) => r.program === p.name && r.folder === folder).map((r) => ({ name: r.name, exercises: [] }))
  }
  return (
    <section class={'catalog-card' + (on ? ' on' : '')}>
      <button class="catalog-head" onClick={onToggle} aria-expanded={open}>
        <span class="catalog-title">
          <b>{p.name}</b>
          <small>
            {p.weeks} weeks · {p.daysPerWeek} days a week{p.minutes ? ` · ~${p.minutes} min` : ''}
            {p.by ? ` · ${p.by}` : ''}
          </small>
        </span>
        {on && <span class="tag tag-on">Following</span>}
        <Icon name="down" size={18} class={'chev' + (open ? ' open' : '')} />
      </button>
      <p class="catalog-summary">{p.summary}</p>
      <p class="catalog-equip">
        <Icon name="dumbbell" size={14} /> {p.equipment}
      </p>
      {open && (
        <ol class="catalog-phases">
          {p.phases.map((ph) => (
            <li key={ph.folder}>
              <b>{ph.folder}</b>
              <span>
                {ph.days} days a week{ph.summary ? ` · ${ph.summary}` : ''}
              </span>
              {routinesOf(ph.folder).map((r) => (
                <div class="catalog-day" key={r.name}>
                  <i>{r.name}</i>
                  {r.exercises.length > 0 && <span>{r.exercises.map((e) => `${e.name} ${e.sets ?? ''}×${e.reps ?? ''}`).join(' · ')}</span>}
                </div>
              ))}
            </li>
          ))}
        </ol>
      )}
      <div class="row gap">
        {on ? (
          <button class="btn btn-secondary grow" onClick={() => navigate('/train')}>
            <Icon name="check" size={18} /> Following · go to Train
          </button>
        ) : (
          <button class="btn btn-primary grow" disabled={busy} onClick={() => start(1)}>
            <Icon name="play" size={18} /> {added ? 'Follow' : 'Start'} {p.id === COMEBACK ? 'the plan' : 'from week 1'}
          </button>
        )}
        {p.phases.length > 1 && !on && (
          <button class="btn btn-secondary" disabled={busy} onClick={startLater}>
            Later phase
          </button>
        )}
      </div>
      {on && settings.value.program && <p class="catalog-note">Change the week from the program card’s menu on Train.</p>}
    </section>
  )
}
