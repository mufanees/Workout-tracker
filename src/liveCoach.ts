// The live coach on the workout screen: runs the pure engine (shared/liveCoach.mjs) on the phone after
// every tick, rest end and heart-rate sample, writes the next sets' targets as grey values (cw / cr,
// never over anything typed), keeps one line of coaching at a time (older lines fold away), proposes one
// time fix when the workout is heading past its budget (Apply / Undo), and asks a language model for a
// short extra line at the start and after each exercise: Chrome's on-device model when it's ready, else
// the server's coach, else nothing (the engine's own lines stand). Nothing here waits on the network.
import { signal } from '@preact/signals'
import * as LC from '../shared/liveCoach.mjs'
import type { LCExercise, LCState, SetPlan } from '../shared/liveCoach.mjs'
import { QUICK } from '../shared/coachSpec.mjs'
import { aiPrompt, isNative } from './native'
import { kindOf } from '../shared/budget.mjs'
import { active, exMap, routines, settings, updateActive, workouts } from './store'
import { sessionsByExercise, matchPrevious, previousSets } from './stats'
import { pace6w } from './timing'
import { bpm } from './hr'
import { openGoals } from './goals'
import { musclesOf, muscleStatusAt, regionName, type RegionId } from './fatigue'
import { checkCoach, coachOn, profile, quick } from './coach'
import { adjustRest, restTimer, setTimer, stopRest } from './workout'
import { budgetFor, estimate, fitWorkout, lineSeconds, planFor } from './timeplan'
import { fmtExWeight, loadOf, uid } from './util'
import { nextUp, placeholderFor } from './ui/WorkoutEditor'
import type { CoachLine, CoachLive, Routine, WExercise, Workout } from './types'

export type { CoachLine }

/** Ticks once a second while the workout screen is open, so the time line stays current. */
export const coachClock = signal(Date.now())

const MAX_LINES = 20
const working = (s: { kind: string }) => s.kind !== 'warmup'

// ---------------------------------------------------------------- state for the engine

/** Heaviest dumbbell they own: a lift goal's equipment cap, else "to 24 kg" in their profile, else 24. */
function equipmentMax(): number {
  const caps = openGoals.value.map((g) => g.spec.equipmentMax).filter((v): v is number => typeof v === 'number' && v > 0)
  if (caps.length) return Math.max(...caps)
  const m = (profile.value.equipment || '').match(/(\d+(?:\.\d+)?)\s*kg/gi)
  if (m) return Math.max(...m.map((x) => parseFloat(x)))
  return 24
}

/** Max heart rate: the profile's, else from age (208 − 0.7 × age), else just above the top of zone 4. */
function maxHr(): number {
  const p = profile.value
  if (p.maxHr) return p.maxHr
  if (p.age) return Math.round(208 - 0.7 * p.age)
  return settings.value.hrZones[3] + 10
}

function exerciseState(we: WExercise, excludeId?: string): LCExercise {
  const ex = exMap.value.get(we.exerciseId)
  const hist = (sessionsByExercise.value.get(we.exerciseId) || [])
    .filter((s) => s.workout.id !== excludeId)
    .slice(0, 3)
    .map((s) => ({ start: s.workout.start, sets: s.sets.map((x) => ({ kind: x.kind, weight: x.weight, reps: x.reps, rir: x.rir ?? null })) }))
  const p = pace6w.value.byEx.get(we.exerciseId)
  const k = kindOf({ name: ex?.name || '', muscle: ex?.muscle || '' })
  return {
    id: we.id,
    exerciseId: we.exerciseId,
    name: ex?.name || 'Exercise',
    muscle: ex?.muscle,
    equipment: ex?.equipment,
    type: ex?.type || 'weight_reps',
    bodyweight: ex?.equipment === 'Bodyweight',
    load: loadOf(ex),
    accessory: k.role !== 'compound',
    pattern: k.pattern,
    regions: musclesOf(we.exerciseId),
    target: we.target || '',
    rest: we.rest,
    superset: we.superset,
    sets: we.sets,
    history: hist,
    pace: p && p.sets >= 2 ? p.avg : null,
  }
}

/** Muscle fatigue by region now (shared/fatigue.mjs), with short names for the coach's words. */
function fatigueNow(): Record<string, { fatigue: number; name: string }> {
  const out: Record<string, { fatigue: number; name: string }> = {}
  for (const [id, r] of Object.entries(muscleStatusAt())) out[id] = { fatigue: r.fatigue, name: regionName(id as RegionId, true) }
  return out
}

/** Words for a stored weight, the way this person reads weights (a pair shows as the total by default). */
const fmt = { w: (kg: number, ex: LCExercise) => fmtExWeight(exMap.value.get(ex.exerciseId), kg) }

function budgetOfWorkout(w: Workout) {
  const r = w.routineId ? routines.value.find((x) => x.id === w.routineId) : undefined
  return budgetFor({ budget: r?.budget ?? null })
}

/** Everything the engine needs, from the active workout and the store. */
export function stateOf(w: Workout, now = Date.now()): LCState {
  const checks = w.checks || {}
  const warm = (w.warmup || []).map((l, i) => ({ l, on: !!checks['w' + i] }))
  const cool = (w.cooldown || []).map((l, i) => ({ l, on: !!checks['c' + i] }))
  const fresh = bpm.value
  const last = w.hr?.[w.hr.length - 1]
  const hrNow = fresh ?? (last && now - (w.start + last[0] * 1000) < 15000 ? last[1] : null)
  const r = pace6w.value.rest
  return {
    now,
    start: w.start,
    exercises: w.exercises.map((we) => exerciseState(we, w.id)),
    budget: budgetOfWorkout(w),
    warmup: { open: warm.some((x) => !x.on), secs: warm.filter((x) => !x.on).reduce((a, x) => a + lineSeconds(x.l), 0) },
    cooldown: { done: cool.length > 0 && cool.every((x) => x.on), secs: cool.filter((x) => !x.on).reduce((a, x) => a + lineSeconds(x.l), 0) },
    // one estimate on screen: the app's (timeplan.ts), for the workout as it stands now
    plan: estimate({ exercises: w.exercises, warmup: w.warmup, cooldown: w.cooldown }),
    canFit: true,
    restRun: w.restRun || null,
    restOverrun: r && r.n >= 3 ? r.overrun : 0,
    hr: { samples: w.hr || [], now: hrNow, max: maxHr(), zones: settings.value.hrZones },
    equipment: { step: 1, max: equipmentMax() },
    fmt,
    fatigue: fatigueNow(),
  }
}

/** The engine's plans, 10% lighter where they took the fatigue advice (first sets only: later sets follow what was lifted). */
function plansNow(st: LCState, w: Workout): SetPlan[] {
  const light = String(w.coachLive?.seen.lighter || '').split(',').filter(Boolean)
  return LC.plansFor(st).map((p) => {
    const ex = st.exercises.find((e) => e.id === p.weId)
    return ex && light.includes(p.weId) && !ex.sets.some((s) => s.done) ? LC.lighter(p, ex, st)! : p
  })
}

/** Strength sessions only: not cardio, not a mobility session, and something to lift. */
export const coachable = (w: Workout | null): w is Workout => !!w && !w.cardio && !w.mobility && w.exercises.some((e) => e.sets.some(working))
/** The same, as a plain yes / no (no type narrowing). */
export const isCoached = (w: Workout | null): boolean => coachable(w)

// ---------------------------------------------------------------- lines

function live(x: Workout): CoachLive {
  return (x.coachLive ||= { lines: [], seen: {} })
}

function say(kind: CoachLine['kind'], text: string, o: { src?: CoachLine['src']; action?: CoachLine['action'] } = {}) {
  const w = active.value
  if (!w || !text) return
  const prev = w.coachLive?.lines.at(-1)
  if (prev && prev.text === text && !o.action === !prev.action) return
  updateActive((x) => {
    const c = live(x)
    const line: CoachLine = { id: uid('cl'), at: Date.now(), kind, text, src: o.src || 'engine', ...(o.action ? { action: o.action } : {}) }
    const top = c.lines[c.lines.length - 1]
    // a model's line never covers one that's waiting on a tap: it goes just under it (tap to see)
    if (kind === 'llm' && top?.action && Date.now() - top.at < 120000) c.lines = [...c.lines.slice(0, -1), line, top].slice(-MAX_LINES)
    else c.lines = [...c.lines, line].slice(-MAX_LINES)
  })
}

function mark(key: string, v: string | number | boolean) {
  updateActive((x) => void (live(x).seen[key] = v))
}

// ---------------------------------------------------------------- targets as grey values

/** Write the plans as the sets' coach targets. Typed values are never touched (they always show over these). */
function writePlans(plans: SetPlan[]) {
  const w = active.value
  if (!w) return
  const ids = new Map<string, SetPlan>()
  for (const p of plans) for (const id of p.setIds) ids.set(id, p)
  const differs = w.exercises.some((we) => we.sets.some((s) => !s.done && ids.has(s.id) && (s.cw !== ids.get(s.id)!.weight || s.cr !== ids.get(s.id)!.reps || !s.cl)))
  if (!differs) return
  updateActive((x) => {
    for (const we of x.exercises)
      for (const s of we.sets) {
        const p = ids.get(s.id)
        if (!p || s.done) continue
        s.cw = p.weight
        s.cr = p.reps
        s.cl = true
      }
  })
}

/** The next set to do and how it reads: "Floor Press 28 kg × 8". */
export function nextText(w: Workout): { name: string; text: string; weId: string } | null {
  let we: WExercise | undefined
  let i = -1
  for (const e of w.exercises) {
    const k = e.sets.findIndex((s) => s.id === nextUp.value && !s.done)
    if (k >= 0) {
      we = e
      i = k
      break
    }
  }
  if (!we) {
    for (const e of w.exercises) {
      const k = e.sets.findIndex((s) => !s.done)
      if (k >= 0) {
        we = e
        i = k
        break
      }
    }
  }
  if (!we || i < 0) return null
  const ex = exMap.value.get(we.exerciseId)
  const s = we.sets[i]
  const ph = placeholderFor(we.sets, i, matchPrevious(we.sets, previousSets(we.exerciseId, w.id)))
  const weight = s.weight ?? ph.weight
  const reps = s.reps ?? ph.reps
  const secs = s.seconds ?? ph.seconds
  const name = ex?.name || 'Next'
  const parts = ex?.type === 'duration' ? (secs != null ? `${secs} s` : '') : [weight != null && ex?.equipment !== 'Bodyweight' ? fmtExWeight(ex, weight) : '', reps != null ? `${weight != null && ex?.equipment !== 'Bodyweight' ? '× ' : ''}${reps}${weight != null && ex?.equipment !== 'Bodyweight' ? '' : ' reps'}` : ''].filter(Boolean).join(' ')
  return { name, text: parts, weId: we.id }
}

// ---------------------------------------------------------------- moments

const doneCount = (w: Workout) => w.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done && working(s)).length, 0)
const nameOf = (w: Workout, weId: string) => exMap.value.get(w.exercises.find((e) => e.id === weId)?.exerciseId || '')?.name || 'Next'

/** The opening line: the time plan and today's focus. */
function onStart(w: Workout) {
  const st = stateOf(w)
  const brief = LC.startBrief(st)
  writePlans(plansNow(st, w))
  mark('start', true)
  say('start', brief.text, brief.action ? { action: { id: brief.action.id, label: brief.action.kind === 'fit' ? 'Fit it' : 'Apply', kind: 'time' } } : {})
  const fa = LC.fatigueAdvice(st)
  if (fa) say('start', fa.text, { action: { id: 'lighter', label: 'Apply', kind: 'fatigue' } })
  else if (brief.action) updateActive((x) => Object.assign(live(x).seen, { timeAt: Date.now(), timeId: brief.action!.id, timeOver: brief.result.time.over, behind: true }))
  void askModel('start')
}

/** A set was just ticked (by hand or by its timer). */
function onTick(w: Workout, setId: string) {
  const we = w.exercises.find((e) => e.sets.some((s) => s.id === setId))
  if (!we) return
  const st = stateOf(w)
  const r = { ...LC.liveCoach(st), plans: plansNow(st, w) }
  writePlans(r.plans)
  const open = we.sets.some((s) => working(s) && !s.done)
  const allDone = !w.exercises.some((e) => e.sets.some((s) => working(s) && !s.done))
  if (allDone) {
    if (!w.coachLive?.seen.finish) {
      mark('finish', true)
      say('finish', LC.finishVerdict(stateOf(active.value!)))
    }
    return
  }
  if (open) {
    const p = r.plans.find((x) => x.weId === we.id)
    if (p) say('set', p.reason)
    return
  }
  // the exercise is done: point at the next one, with its first set
  const nx = nextText(w)
  const p = nx && r.plans.find((x) => x.weId === nx.weId)
  if (nx && p) say('set', `Next, ${nx.name}: ${p.reason.charAt(0).toLowerCase() + p.reason.slice(1)}`)
  void askModel('exercise', we.id)
}

/** Every few seconds: heart rate during the rest, the clock, the last exercise. */
function pulse() {
  const w = active.value
  if (!coachable(w) || !w.coachLive) return
  const st = stateOf(w)
  const time = LC.timeStatus(st)
  const seen = w.coachLive.seen
  const open = w.exercises.some((e) => e.sets.some((s) => working(s) && !s.done))
  if (!open) return

  // adaptive rest: recovered early while time is tight → offer to go now (once per rest)
  if (w.restRun && Date.now() < w.restRun.end && seen.go !== w.restRun.start) {
    const cue = LC.restCue(st, time)
    if (cue) {
      mark('go', w.restRun.start)
      say('hr', cue.text, { action: { id: 'go-now', label: 'Go now', kind: 'extend' } })
      return
    }
  }

  // during a set: heart rate very high, or still easy (each once per set)
  if (!w.restRun && w.mark && !seen['cue-' + w.mark.at]) {
    const t = setTimer.value
    const cue = LC.setCue(st, { since: w.mark.at, timed: !!t && t.target.kind === 'set' })
    if (cue) {
      mark('cue-' + w.mark.at, cue.key)
      say('hr', cue.text)
      return
    }
  }

  // heart rate still up 60 s into a rest: once per rest
  if (w.restRun && seen.hr !== w.restRun.start) {
    const nx = nextText(w)
    const plan = nx ? LC.plansFor(st).find((p) => p.weId === nx.weId) || null : null
    const adv = LC.hrAdvice(st, time, plan)
    const age = (Date.now() - w.restRun.start) / 1000
    if (adv) {
      mark('hr', w.restRun.start)
      if (adv.reps != null && adv.extend === 0) lowerNextReps(w, adv.reps)
      say('hr', adv.text, adv.extend ? { action: { id: 'extend-30', label: '+30 s', kind: 'extend' } } : {})
      return
    }
    if (age >= 65) mark('hr', w.restRun.start)
  }

  // the clock: behind (rate-limited), back on pace, out of lifting time
  const r = LC.timeActions(st, time)
  const best =
    r.find((a) => {
      const d = w.coachLive!.dismissed?.[a.id]
      return !(d != null && time.over < d + 120)
    }) || null
  const lastAt = Number(seen.timeAt || 0)
  const lastOver = Number(seen.timeOver || 0)
  // a new suggestion after 90 s; the same one again only after 4 min and 3 more minutes over
  const fresh = seen.timeId !== best?.id ? Date.now() - lastAt > 90000 : Date.now() - lastAt > 240000 && time.over > lastOver + 180
  if ((time.state === 'over' || time.state === 'out') && best && fresh) {
    updateActive((x) => {
      const s = live(x).seen
      s.timeAt = Date.now()
      s.timeOver = time.over
      s.timeId = best.id
      s.behind = true
    })
    const lead = time.state === 'out' ? `${LC.clock(Math.max(0, time.left))} left, cool-down next` : `${Math.max(1, Math.round(time.over / 60))} min over`
    say('time', `${lead}: ${best.short}?`, { action: { id: best.id, label: 'Apply', kind: 'time' } })
    return
  }
  if (time.state === 'on' && seen.behind) {
    mark('behind', false)
    say('time', `Back on pace: ${LC.clock(time.left)} left`)
    return
  }

  // the last exercise
  const nx = nextText(w)
  const remaining = w.exercises.filter((e) => e.sets.some((s) => working(s) && !s.done))
  if (nx && remaining.length === 1 && w.exercises.length > 1 && seen.last !== nx.weId && doneCount(w) > 0) {
    mark('last', nx.weId)
    const b = budgetOfWorkout(w)
    say('last', `Last one: ${nx.name}. ${LC.clock(Math.max(0, time.left))} left, ${b.cooldown} min of it for the cool-down.`)
  }
}

/** Behind and not recovered: the next set gets fewer reps instead of more rest. */
function lowerNextReps(w: Workout, reps: number) {
  const id = nextUp.value
  if (!id) return
  updateActive((x) => {
    for (const we of x.exercises) for (const s of we.sets) if (s.id === id && !s.done && s.reps == null) (s.cr = reps), (s.cl = true)
  })
  void w
}

/** The rest ran out or was skipped: go, with the set and how heart rate looks. */
function onRestEnd() {
  const w = active.value
  if (!coachable(w) || !w.coachLive) return
  if (!w.exercises.some((e) => e.sets.some((s) => working(s) && !s.done))) return
  const nx = nextText(w)
  if (!nx) return
  const st = stateOf(w)
  const hr = LC.hrState(st)
  const tail = hr?.high ? ` HR ${hr.bpm}: ease into it.` : ''
  say('rest-end', `Go: ${nx.name}${nx.text ? ' ' + nx.text : ''}.${tail}`)
}

// ---------------------------------------------------------------- time actions

/** Apply a time action from the strip. Undo puts it back. */
export function applyAction(id: string) {
  const w = active.value
  if (!w) return
  if (id === 'extend-30') {
    adjustRest(30)
    say('applied', 'Added 30 s to the rest.')
    return
  }
  if (id === 'go-now') {
    stopRest()
    return
  }
  if (id === 'fit') {
    const budget = budgetOfWorkout(w).total
    const fit = fitWorkout(w, budget)
    if (!fit.changes.length) return say('applied', 'Nothing left to trim.')
    const before = { exercises: w.exercises, warmup: w.warmup, cooldown: w.cooldown, timePlan: w.timePlan }
    updateActive((x) => {
      x.exercises = fit.routine.exercises
      x.warmup = fit.routine.warmup
      x.cooldown = fit.routine.cooldown
      x.timePlan = planFor({ ...fit.routine, budget })
      live(x).undo = { label: `Fit it to ${budget} min`, kind: 'fit', data: before }
    })
    refreshNext()
    replan()
    say('applied', `Fitted to ~${fit.after} min: ${fit.changes.slice(0, 2).join('; ')}${fit.changes.length > 2 ? ` +${fit.changes.length - 2} more` : ''}.`)
    return
  }
  if (id === 'lighter') {
    const fa = LC.fatigueAdvice(stateOf(w))
    if (!fa) return say('applied', 'Nothing left to lighten: those lifts have started.')
    updateActive((x) => {
      const c = live(x)
      c.undo = { label: 'Go lighter', kind: 'lighter', data: c.seen.lighter ?? '' }
      c.seen.lighter = fa.weIds.join(',')
    })
    replan()
    say('applied', `Done: 10% lighter on ${fa.names.slice(0, 2).join(' and ')}${fa.names.length > 2 ? ` +${fa.names.length - 2}` : ''}.`)
    return
  }
  const a = LC.timeActions(stateOf(w)).find((x) => x.id === id)
  if (!a) return say('applied', 'That no longer fits: things moved on.')
  let undo: CoachLive['undo'] = null
  updateActive((x) => {
    if (a.kind === 'rest') {
      const prev: Record<string, number> = {}
      for (const we of x.exercises) if (a.weIds.includes(we.id)) (prev[we.id] = we.rest), (we.rest = a.restTo!)
      undo = { label: a.label, kind: 'rest', data: prev }
    } else if (a.kind === 'drop-sets') {
      const removed: { weId: string; index: number; set: unknown }[] = []
      for (const we of x.exercises)
        for (const sid of a.setIds || []) {
          const i = we.sets.findIndex((s) => s.id === sid && !s.done)
          if (i >= 0) removed.push({ weId: we.id, index: i, set: we.sets.splice(i, 1)[0] })
        }
      undo = { label: a.label, kind: 'drop-sets', data: removed }
    } else if (a.kind === 'superset') {
      const g = uid('ss')
      const prev: Record<string, string | null> = {}
      for (const we of x.exercises) if (a.weIds.includes(we.id)) (prev[we.id] = we.superset), (we.superset = g)
      undo = { label: a.label, kind: 'superset', data: prev }
    } else if (a.kind === 'skip') {
      const i = x.exercises.findIndex((e) => e.id === a.weIds[0])
      if (i >= 0) undo = { label: a.label, kind: 'skip', data: { index: i, we: x.exercises.splice(i, 1)[0] } }
    }
    live(x).undo = undo
  })
  refreshNext()
  replan()
  const left = LC.timeStatus(stateOf(active.value!))
  say('applied', `Done: ${a.short}. ${left.state === 'over' ? `Still ${Math.round(left.over / 60)} min over.` : 'Back inside the budget.'}`)
}

export function undoAction() {
  const w = active.value
  const u = w?.coachLive?.undo
  if (!w || !u) return
  updateActive((x) => {
    if (u.kind === 'rest') for (const we of x.exercises) if (we.id in (u.data as Record<string, number>)) we.rest = (u.data as Record<string, number>)[we.id]
    if (u.kind === 'superset') for (const we of x.exercises) if (we.id in (u.data as Record<string, string | null>)) we.superset = (u.data as Record<string, string | null>)[we.id]
    if (u.kind === 'drop-sets')
      for (const r of [...(u.data as { weId: string; index: number; set: WExercise['sets'][number] }[])].sort((a, b) => a.index - b.index)) {
        const we = x.exercises.find((e) => e.id === r.weId)
        if (we && !we.sets.some((s) => s.id === r.set.id)) we.sets.splice(Math.min(r.index, we.sets.length), 0, r.set)
      }
    if (u.kind === 'fit') Object.assign(x, u.data as Partial<Workout>)
    if (u.kind === 'lighter') live(x).seen.lighter = String(u.data || '')
    if (u.kind === 'skip') {
      const d = u.data as { index: number; we: WExercise }
      if (!x.exercises.some((e) => e.id === d.we.id)) x.exercises.splice(Math.min(d.index, x.exercises.length), 0, d.we)
    }
    const c = live(x)
    c.undo = null
    c.seen.timeAt = 0
  })
  refreshNext()
  replan()
  say('applied', `Undone: ${u.label.charAt(0).toLowerCase() + u.label.slice(1)}.`)
}

/** "Not now" on a time action: quiet until the overshoot grows by two more minutes. */
export function dismissAction(id: string) {
  const w = active.value
  if (!w) return
  const over = LC.timeStatus(stateOf(w)).over
  updateActive((x) => {
    const c = live(x)
    c.dismissed = { ...(c.dismissed || {}), [id]: over }
    const l = c.lines.at(-1)
    if (l?.action?.id === id) c.lines = [...c.lines.slice(0, -1), { ...l, action: undefined }]
  })
}

function refreshNext() {
  const w = active.value
  if (!w || (nextUp.value && w.exercises.some((e) => e.sets.some((s) => s.id === nextUp.value && !s.done)))) return
  for (const e of w.exercises) {
    const s = e.sets.find((x) => !x.done)
    if (s) return void (nextUp.value = s.id)
  }
  nextUp.value = null
}

function replan() {
  const w = active.value
  if (w) writePlans(plansNow(stateOf(w), w))
}

// ---------------------------------------------------------------- the language model (optional)

/** Chrome's built-in Prompt API, typed loosely (it isn't in TypeScript's DOM lib, and may never be there). */
interface LMSession {
  prompt(text: string, o?: { responseConstraint?: unknown; signal?: AbortSignal }): Promise<string>
  destroy?(): void
}
interface LMApi {
  availability(o?: unknown): Promise<string>
  create(o?: { initialPrompts?: { role: string; content: string }[]; signal?: AbortSignal }): Promise<LMSession>
}

const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))])

const ON_DEVICE_SYSTEM = 'You are a strength coach talking to someone mid-workout. Short, specific, plain words, no emojis. Reply with JSON only.'

/** JSON out of a small model's reply (it may wrap it in a code fence or add words around it). */
function looseJson(raw: string): unknown {
  const t = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(t)
  } catch {
    const m = t.match(/\{[\s\S]*\}/)
    if (m)
      try {
        return JSON.parse(m[0])
      } catch {
        /* fall through */
      }
    return { line: t }
  }
}

/** The Android app's Gemini Nano (ML Kit), only when already downloaded; null otherwise. */
async function onDeviceNative(state: Record<string, unknown>): Promise<{ line: string; adjust?: { exercise: string; weight_kg?: number; reps?: number } } | null> {
  if (!isNative) return null
  const raw = await aiPrompt({
    system: ON_DEVICE_SYSTEM,
    text: `${QUICK.live.prompt(state)}\n\nAnswer with one JSON object matching this schema, nothing else:\n${JSON.stringify(QUICK.live.schema)}`,
    maxTokens: 160,
    timeoutMs: 6000,
  })
  if (!raw) return null
  const clean = QUICK.live.clean(looseJson(raw))
  return clean.line ? clean : null
}

/** A line from the on-device model, only when it's already downloaded (never starts a download mid-workout). */
async function onDevice(state: Record<string, unknown>): Promise<{ line: string; adjust?: { exercise: string; weight_kg?: number; reps?: number } } | null> {
  const native = await onDeviceNative(state).catch(() => null)
  if (native) return native
  const api = (globalThis as unknown as { LanguageModel?: LMApi }).LanguageModel
  if (!api || typeof api.availability !== 'function') return null
  let session: LMSession | null = null
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
  try {
    if ((await withTimeout(api.availability(), 1500)) !== 'available') return null
    session = await withTimeout(api.create({ initialPrompts: [{ role: 'system', content: ON_DEVICE_SYSTEM }], signal: ctrl?.signal }), 3000)
    const raw = await withTimeout(session.prompt(QUICK.live.prompt(state), { responseConstraint: QUICK.live.schema, signal: ctrl?.signal }), 5000)
    let out: unknown
    try {
      out = JSON.parse(raw)
    } catch {
      out = { line: raw }
    }
    const clean = QUICK.live.clean(out)
    return clean.line ? clean : null
  } catch {
    return null
  } finally {
    ctrl?.abort()
    try {
      session?.destroy?.()
    } catch {
      /* already gone */
    }
  }
}

/** What the model sees: compact, numbers in stored units. */
function modelState(w: Workout, moment: 'start' | 'exercise', weId?: string): Record<string, unknown> {
  const st = stateOf(w)
  const r = LC.liveCoach(st)
  const done = w.exercises
    .filter((e) => e.sets.some((s) => s.done))
    .map((e) => ({
      exercise: nameOf(w, e.id),
      sets: e.sets.filter((s) => s.done).map((s) => `${s.weight != null ? s.weight + '×' : ''}${s.reps ?? s.seconds ?? '?'}${s.rir != null ? ` @RIR${s.rir}` : ''}${s.work != null ? ` ${s.work}s` : ''}${s.rested != null ? ` rest ${s.rested}s` : ''}`),
    }))
  const hr = (w.hr || []).map((x) => x[1])
  return {
    moment,
    workout: w.name,
    just_finished: weId ? nameOf(w, weId) : undefined,
    done,
    next: r.plans.slice(0, 4).map((p) => ({ exercise: nameOf(w, p.weId), weight_kg: p.weight, reps: p.reps, why: p.reason })),
    time: { elapsed_min: Math.round(r.time.elapsed / 60), left_min: Math.round(r.time.left / 60), budget_min: Math.round(r.time.total / 60), projected_min: Math.round(r.time.projected / 60), state: r.time.state },
    engine_time_fix: r.best?.label,
    hr: hr.length ? { now: r.hr?.bpm ?? null, avg: Math.round(hr.reduce((a, b) => a + b, 0) / hr.length), peak: Math.max(...hr), max_hr: st.hr?.max, drop_first_60s_of_rest: r.hr?.drop60 ?? undefined } : undefined,
    heaviest_dumbbell_kg: st.equipment?.max,
  }
}

let asking = false
/** At the start and after each exercise: a short extra line, if a model answers in time. Never blocks. */
async function askModel(moment: 'start' | 'exercise', weId?: string) {
  const w = active.value
  if (!w || asking) return
  asking = true
  const wid = w.id
  const before = doneCount(w)
  const t0 = Date.now()
  try {
    const state = modelState(w, moment, weId)
    let src: CoachLine['src'] = 'on-device'
    let res = await onDevice(state)
    if (!res) {
      if (coachOn.value == null) await checkCoach().catch(() => undefined)
      if (!coachOn.value) return
      src = 'server'
      res = await withTimeout(quick<{ line: string; adjust?: { exercise: string; weight_kg?: number; reps?: number } }>({ kind: 'live', moment, state }), 20000).catch(() => null)
    }
    const now = active.value
    // stale: another workout, the workout moved on by more than a superset round, or it took too long
    if (!res?.line || !now || now.id !== wid || doneCount(now) - before > 2 || Date.now() - t0 > 120000) return
    say('llm', res.line, { src })
    if (res.adjust) applyAdjust(now, res.adjust)
  } finally {
    asking = false
  }
}

/** The model's adjustment, only when it's sane: a not-started set, within 10% of the engine's, under the cap. */
function applyAdjust(w: Workout, a: { exercise: string; weight_kg?: number; reps?: number }) {
  const want = a.exercise.toLowerCase()
  const we = w.exercises.find((e) => nameOf(w, e.id).toLowerCase() === want)
  if (!we) return
  const cap = equipmentMax()
  updateActive((x) => {
    const t = x.exercises.find((e) => e.id === we.id)
    for (const s of t?.sets || []) {
      if (s.done || !working(s)) continue
      if (a.weight_kg != null && s.cw != null && Math.abs(a.weight_kg - s.cw) <= s.cw * 0.1 + 0.01 && a.weight_kg <= cap) s.cw = a.weight_kg
      if (a.reps != null && a.reps >= 1 && a.reps <= 30) s.cr = a.reps
      s.cl = true
    }
  })
}

// ---------------------------------------------------------------- the driver

/** Start the coach for the workout screen. Returns a stop function. */
export function startLiveCoach(): () => void {
  // what's been logged: ticks, values on done sets, effort taps
  const look = (w: Workout) => {
    let newest: { at: number; id: string } | null = null
    const parts: string[] = []
    for (const e of w.exercises)
      for (const s of e.sets)
        if (s.done) {
          parts.push(`${s.id}:${s.weight}:${s.reps}:${s.rir ?? ''}`)
          if (s.at && (!newest || s.at > newest.at)) newest = { at: s.at, id: s.id }
        }
    return { sig: parts.join('|'), newest }
  }
  // a reload doesn't re-announce what was already logged
  const first = active.value ? look(active.value) : null
  let sig = first?.sig ?? ''
  let lastAt = first?.newest?.at ?? 0
  let restWas = restTimer.value
  const check = () => {
    const w = active.value
    if (!coachable(w)) return
    if (!w.coachLive?.seen.start) {
      if (!w.exercises.some((e) => e.sets.some((s) => s.done))) return onStart(w)
      updateActive((x) => void (live(x).seen.start = true))
    }
    const { sig: now, newest } = look(w)
    if (now === sig) return
    sig = now
    if (newest && newest.at > lastAt) {
      lastAt = newest.at
      return onTick(w, newest.id)
    }
    replan()
  }
  check()
  // after the app has settled the tick (Live's afterSetDone points at the next set first)
  const off = active.subscribe(() => setTimeout(check, 0))
  const offRest = restTimer.subscribe((r) => {
    const was = restWas
    restWas = r
    if (was && !r) setTimeout(onRestEnd, 50)
  })
  const t1 = setInterval(() => (coachClock.value = Date.now()), 1000)
  const t2 = setInterval(pulse, 3000)
  return () => {
    off()
    offRest()
    clearInterval(t1)
    clearInterval(t2)
  }
}

// ---------------------------------------------------------------- outside workouts

/** For Train: the coach's one-line plan for a routine, from the engine (no network). */
export function routineLine(r: Routine): string {
  const exercises: WExercise[] = r.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, weight: null, reps: null, seconds: null, done: false, tw: s.weight, tr: s.reps, ts: s.seconds })) }))
  const now = Date.now()
  const st: LCState = {
    now,
    start: now,
    exercises: exercises.map((we) => exerciseState(we)),
    budget: budgetFor({ budget: r.budget ?? null }),
    warmup: { open: !!r.warmup?.length, secs: (r.warmup || []).reduce((a, l) => a + lineSeconds(l), 0) },
    cooldown: { done: false, secs: (r.cooldown || []).reduce((a, l) => a + lineSeconds(l), 0) },
    plan: estimate(r),
    canFit: true,
    restOverrun: pace6w.value.rest && pace6w.value.rest.n >= 3 ? pace6w.value.rest.overrun : 0,
    equipment: { step: 1, max: equipmentMax() },
    fmt,
    fatigue: fatigueNow(),
  }
  void workouts.value // recompute when history changes
  return LC.sessionLine(st)
}

/** The verdict for the finish sheet. */
export function verdictFor(w: Workout): string | null {
  if (!coachable(w) || !w.exercises.some((e) => e.sets.some((s) => s.done))) return null
  return LC.finishVerdict(stateOf(w))
}

