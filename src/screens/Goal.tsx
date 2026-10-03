// Goals: a card on Train, a list of every open goal, and a page per goal with its trend,
// milestones and (for lift goals) every lift. The coach sets and updates goals; you approve.
import { saveCoachItem } from '../store'
import { back, navigate } from '../router'
import { STATE_LABEL, fmtPace, fmtValue, fmtWhen, openGoals, type GoalStatus } from '../goals'
import { Icon } from '../ui/icons'
import { confirmDialog, toast } from '../ui/overlay'
import { coachItems } from '../store'
import { activeBlock, phaseLine, type BlockStatus } from '../blocks'

const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const WEEK = 7 * 86400000

const askCoach = (text: string) => navigate(`/coach?ask=${encodeURIComponent(text)}`)

function Bar({ pct }: { pct: number }) {
  return (
    <div class="gc-bar" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(3, pct * 100)}%` }} />
    </div>
  )
}

function StatePill({ g }: { g: GoalStatus }) {
  return <span class={'goal-state ' + g.state}>{STATE_LABEL[g.state]}</span>
}

const nowText = (g: GoalStatus) => (g.current == null ? '–' : fmtValue(g.current, g.spec, g.perHand))

/** Train screen: your first goal at a glance, or a nudge to set one. */
export function GoalCard() {
  const list = openGoals.value
  const g = list[0]
  if (!g)
    return (
      <button class="goal-card empty" onClick={() => askCoach('I want to set a goal. Help me pick a good one and break it into milestones.')}>
        <span class="eyebrow">
          <Icon name="trophy" size={14} /> Goal
        </span>
        <p class="gc-empty">Set a goal with your coach: a lift, a body weight, zone 2 minutes. It’ll track your pace and the milestones on the way.</p>
      </button>
    )
  const next = g.milestones.find((m) => !m.reachedAt)
  return (
    <button class="goal-card" onClick={() => navigate(list.length > 1 ? '/goals' : `/goals/${g.item.id}`)}>
      <div class="gc-top">
        <span class="eyebrow">
          <Icon name="trophy" size={14} /> {list.length > 1 ? `Goals · ${list.length}` : 'Goal'}
        </span>
        <StatePill g={g} />
      </div>
      <b class="gc-title">{g.item.text || g.title}</b>
      {g.spec.metric !== 'custom' && g.target != null && (
        <>
          <div class="gc-lift">
            <span>{g.liftName || g.title}</span>
            <span>
              {nowText(g)} <small>of {fmtValue(g.target, g.spec, g.perHand)}</small>
            </span>
          </div>
          <Bar pct={g.pct} />
          <div class="gc-meta">
            <span>{fmtPace(g)}</span>
            <span>{g.state === 'reached' ? 'Done' : g.eta ? `~${fmtWhen(g.eta)}` : next ? `Next: ${next.label}` : ''}</span>
          </div>
        </>
      )}
    </button>
  )
}

export function GoalsScreen() {
  const list = openGoals.value
  const done = coachItems.value.filter((x) => x.kind === 'goal' && x.status === 'done')
  return (
    <div class="screen">
      <header class="page-head sub">
        <button class="icon-btn" onClick={() => back('/train')} aria-label="Back">
          <Icon name="left" />
        </button>
        <span class="page-title">Goals</span>
      </header>
      {!list.length && <p class="empty-note">No goals yet. Your coach can help you set one and plan the milestones.</p>}
      <div class="goal-list">
        {list.map((g) => (
          <button class="card goal-row" onClick={() => navigate(`/goals/${g.item.id}`)}>
            <div class="gc-top">
              <b class="gc-title">{g.item.text || g.title}</b>
              <StatePill g={g} />
            </div>
            {g.target != null && g.spec.metric !== 'custom' && (
              <>
                <Bar pct={g.pct} />
                <div class="gc-meta">
                  <span>
                    {nowText(g)} of {fmtValue(g.target, g.spec, g.perHand)}
                  </span>
                  <span>{g.eta && g.state !== 'reached' ? `~${fmtWhen(g.eta)}` : fmtPace(g)}</span>
                </div>
              </>
            )}
          </button>
        ))}
      </div>
      <button class="btn btn-primary btn-block btn-lg" onClick={() => askCoach('I want to set a new goal. Help me pick a good one and break it into milestones.')}>
        <Icon name="coach" size={20} /> Set a goal with your coach
      </button>
      {done.length > 0 && (
        <>
          <div class="section-head">
            <h2>Achieved</h2>
          </div>
          <section class="card goal-milestones">
            {done.map((d) => (
              <div class="gm-row done">
                <span class="gm-dot">
                  <Icon name="check" size={14} stroke={3} />
                </span>
                <span class="gm-text">
                  <b>{d.text}</b>
                  {d.outcome && <small>{d.outcome}</small>}
                </span>
                <span class="gm-when">{dateFmt.format(new Date(d.updatedAt))}</span>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  )
}

export function GoalDetail({ id }: { id: string }) {
  const g = openGoals.value.find((x) => x.item.id === id)
  if (!g)
    return (
      <div class="screen">
        <header class="page-head sub">
          <button class="icon-btn" onClick={() => back('/goals')} aria-label="Back">
            <Icon name="left" />
          </button>
          <span class="page-title">Goal</span>
        </header>
        <p class="empty-note">This goal isn’t open any more.</p>
      </div>
    )
  const s = g.spec
  const measured = s.metric !== 'custom' && g.target != null
  const capMs = g.milestones.find((m) => m.cap)
  const nearCap = capMs && g.current != null && g.current >= capMs.value * 0.92 && !g.milestones.every((m) => m.reachedAt)

  const finish = async (status: 'done' | 'dropped') => {
    const ok = await confirmDialog({
      title: status === 'done' ? 'Mark as achieved?' : 'Drop this goal?',
      message: status === 'done' ? 'It moves to Achieved.' : 'Your coach stops tracking it. Your training data stays.',
      confirm: status === 'done' ? 'Achieved' : 'Drop goal',
      danger: status === 'dropped',
    })
    if (!ok) return
    await saveCoachItem({ ...g.item, status })
    toast(status === 'done' ? 'Goal achieved' : 'Goal dropped')
    navigate('/goals', { replace: true })
  }

  return (
    <div class="screen goal-screen">
      <header class="page-head sub">
        <button class="icon-btn" onClick={() => back('/goals')} aria-label="Back">
          <Icon name="left" />
        </button>
        <span class="page-title">Goal</span>
      </header>

      <section class="goal-hero">
        <div class="gh-top">
          <span class="gh-eyebrow">{g.title}</span>
          <StatePill g={g} />
        </div>
        <b class="gh-title">{g.item.text || g.title}</b>
        {measured && (
          <div class="gh-bar-wrap">
            <div class="gh-bar">
              <span style={{ width: `${Math.max(3, g.pct * 100)}%` }} />
            </div>
            <div class="gh-bar-labels">
              <span>
                {g.liftName ? `${g.liftName} · ` : ''}
                {nowText(g)}
              </span>
              <span>{fmtValue(g.target!, s, g.perHand)}</span>
            </div>
          </div>
        )}
      </section>

      {measured && (
        <div class="goal-stats">
          <div>
            <span>Now</span>
            <b>{nowText(g)}</b>
            <small>{s.metric === 'lift' ? `est. for ${s.reps || 1} rep${(s.reps || 1) === 1 ? '' : 's'}` : s.metric === 'bodyweight' ? '7-day average' : s.metric === 'zone2' || s.metric === 'workouts' ? '4-week average' : 'recent best'}</small>
          </div>
          <div>
            <span>Pace</span>
            <b>{g.slope == null ? '–' : fmtPace(g).replace(/ (per hand )?a week$/, '')}</b>
            <small>{g.slope == null ? fmtPace(g) : g.perHand ? 'per hand a week' : 'a week'}</small>
          </div>
          <div>
            <span>{g.due ? `Due ${fmtWhen(g.due)}` : 'At this pace'}</span>
            <b>{g.state === 'reached' ? 'Done' : g.eta ? fmtWhen(g.eta) : '–'}</b>
            <small>{g.eta && g.state !== 'reached' ? `${Math.max(1, Math.round((g.eta - Date.now()) / WEEK))} weeks` : ' '}</small>
          </div>
        </div>
      )}

      {measured && g.series.length > 0 && (
        <section class="card goal-chart-card">
          <span class="eyebrow">Trend{g.liftName ? ` · ${g.liftName}` : ''}</span>
          <GoalChart g={g} />
          <p class="field-hint">
            {s.metric === 'lift' ? `Each dot is your best set that session, turned into what you could lift for ${s.reps || 1} rep${(s.reps || 1) === 1 ? '' : 's'}. ` : ''}
            The dashed line continues your last 8 weeks in a straight line. Progress usually slows as you get stronger, so dates more than a few months out are optimistic; your coach adjusts the milestones as you go.
          </p>
        </section>
      )}

      {nearCap && (
        <section class="card goal-note">
          <Icon name="alert" size={20} />
          <p>You’re reaching your heaviest dumbbells. Keep progressing with more reps, slower lowering and pauses until you get heavier ones. Ask your coach when to make the switch.</p>
        </section>
      )}

      {g.milestones.length > 0 && (
        <>
          <div class="section-head">
            <h2>Milestones</h2>
          </div>
          <section class="card goal-milestones">
            {g.milestones.map((m) => {
              const late = !m.reachedAt && m.due && (m.due < Date.now() || (m.eta && m.eta > m.due))
              return (
                <div class={'gm-row' + (m.reachedAt ? ' done' : '') + (late ? ' late' : '')}>
                  <span class="gm-dot">{m.reachedAt ? <Icon name="check" size={14} stroke={3} /> : null}</span>
                  <span class="gm-text">
                    <b>{m.label}</b>
                    <small>
                      {[m.cap ? 'Your heaviest dumbbells' : m.value === g.target ? 'The goal' : '', capMs && !m.cap && m.value > capMs.value ? 'Needs heavier dumbbells' : '', m.due ? `Due ${dateFmt.format(new Date(m.due))}` : '']
                        .filter(Boolean)
                        .join(' · ') || ' '}
                    </small>
                  </span>
                  <span class="gm-when">{m.reachedAt ? dateFmt.format(new Date(m.reachedAt)) : m.eta ? `~${fmtWhen(m.eta)}` : '–'}</span>
                </div>
              )
            })}
          </section>
        </>
      )}

      {g.lifts && g.lifts.length > 1 && (
        <>
          <div class="section-head">
            <h2>Your lifts</h2>
          </div>
          <section class="card goal-lifts">
            {g.lifts.map((l) => (
              <div class="gl-row">
                <span class="gl-name">
                  <b>{l.name}</b>
                  <small>
                    {fmtValue(l.current, s, true)}
                    {l.slope != null ? ` · ${l.slope >= 0 ? '+' : '−'}${Math.abs(Math.round((l.slope / 2) * 10) / 10)} kg per hand a week` : ''}
                  </small>
                </span>
                <span class="gl-bar">
                  <span style={{ width: `${Math.max(3, l.pct * 100)}%` }} />
                </span>
                <span class="gl-pct">{Math.round(l.pct * 100)}%</span>
              </div>
            ))}
          </section>
        </>
      )}

      <button class="btn btn-primary btn-block btn-lg" onClick={() => askCoach(`How am I tracking on my goal “${g.item.text || g.title}”? What are the next milestones, and what should my training look like to get there?`)}>
        <Icon name="coach" size={20} /> Ask coach about this goal
      </button>
      <div class="row gap">
        <button class="btn btn-secondary grow" onClick={() => void finish('done')}>
          <Icon name="check" size={18} /> Achieved
        </button>
        <button class="btn btn-ghost-danger grow" onClick={() => void finish('dropped')}>
          Drop goal
        </button>
      </div>
    </div>
  )
}

/** Values over time, the trend projected forward, the target and (lifts) your dumbbells' limit. */
function GoalChart({ g }: { g: GoalStatus }) {
  const W = 320
  const H = 170
  const pad = { l: 38, r: 10, t: 14, b: 22 }
  const now = Date.now()
  const pts = g.series.slice(-30)
  const t0 = pts[0].t
  const moving = g.slope != null && g.eta && g.state !== 'reached'
  const t1 = Math.max(moving ? Math.min(g.eta!, now + 26 * WEEK) : now, g.due && g.due < now + 52 * WEEK ? g.due : 0, t0 + 14 * 86400000)
  const proj = moving && g.current != null ? g.current + (g.slope! * (t1 - now)) / WEEK : null
  const vals = [...pts.map((p) => p.v), g.target ?? pts[0].v, ...(proj != null ? [proj] : [])]
  const capM = g.milestones.find((m) => m.cap)
  let lo = Math.min(...vals)
  let hi = Math.max(...vals)
  const span = Math.max(1, hi - lo)
  lo = Math.max(0, lo - span * 0.12)
  hi = hi + span * 0.1
  const x = (t: number) => pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b)
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const lab = (v: number) => (g.spec.metric === 'lift' && g.perHand ? `${Math.round(v / 2)}` : `${Math.round(v)}`)
  const tickStep = niceStep((hi - lo) / 4)
  const ticks: number[] = []
  for (let v = Math.ceil(lo / tickStep) * tickStep; v <= hi; v += tickStep) ticks.push(v)
  return (
    <svg class="goal-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Now ${nowText(g)}, target ${fmtValue(g.target!, g.spec, g.perHand)}`}>
      {ticks.map((v) => (
        <>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} class="gch-grid" />
          <text x={pad.l - 6} y={y(v) + 4} class="gch-label" text-anchor="end">
            {lab(v)}
          </text>
        </>
      ))}
      {g.target != null && (
        <>
          <line x1={pad.l} x2={W - pad.r} y1={y(g.target)} y2={y(g.target)} class="gch-goal" />
          <text x={W - pad.r} y={y(g.target) - 5} class="gch-tag goal" text-anchor="end">
            Goal {fmtValue(g.target, g.spec, g.perHand)}
          </text>
        </>
      )}
      {capM && capM.value > lo && capM.value < hi && (
        <>
          <line x1={pad.l} x2={W - pad.r} y1={y(capM.value)} y2={y(capM.value)} class="gch-cap" />
          <text x={pad.l + 4} y={y(capM.value) - 5} class="gch-tag">
            Your dumbbells
          </text>
        </>
      )}
      {g.due && g.due > t0 && g.due <= t1 && <line x1={x(g.due)} x2={x(g.due)} y1={pad.t} y2={H - pad.b} class="gch-cap" />}
      {proj != null && g.current != null && <path d={`M${x(now).toFixed(1)},${y(g.current).toFixed(1)} L${x(t1).toFixed(1)},${y(proj).toFixed(1)}`} class="gch-proj" />}
      <path d={line} class="gch-line" />
      {pts.map((p) => (
        <circle cx={x(p.t)} cy={y(p.v)} r={3.5} class="gch-dot" />
      ))}
      <text x={pad.l} y={H - 6} class="gch-label">
        {dateFmt.format(new Date(t0))}
      </text>
      <text x={W - pad.r} y={H - 6} class="gch-label" text-anchor="end">
        {dateFmt.format(new Date(t1))}
      </text>
    </svg>
  )
}

function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 0.1))))
  const n = raw / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

// ---------- training block ----------

/** Train screen: this week of the active training block. */
export function BlockCard() {
  const b = activeBlock.value
  if (!b) return null
  const s = b.spec
  return (
    <button class="goal-card block-card" onClick={() => navigate('/block')}>
      <div class="gc-top">
        <span class="eyebrow">
          <Icon name="calendarDays" size={14} /> Training block
        </span>
        <span class={'goal-state' + (b.deload ? '' : ' on-track')}>{b.week === 0 ? 'Starts soon' : b.finished ? 'Finished' : b.deload ? 'Deload week' : `Week ${b.week} of ${s.weeks}`}</span>
      </div>
      <b class="gc-title">{b.item.text}</b>
      {b.phase && !b.finished && <span class="block-now">{phaseLine(b.phase)}</span>}
      <WeekDots b={b} />
    </button>
  )
}

function WeekDots({ b }: { b: BlockStatus }) {
  return (
    <div class="week-dots" aria-hidden="true">
      {Array.from({ length: b.spec.weeks }, (_, i) => (
        <span class={(i + 1 < b.week ? 'past' : i + 1 === b.week ? 'now' : '') + (b.spec.deloadWeek === i + 1 ? ' deload' : '')} />
      ))}
    </div>
  )
}

export function BlockScreen() {
  const b = activeBlock.value
  const end = async () => {
    if (!b) return
    const ok = await confirmDialog({ title: 'End this block?', message: 'Your coach stops planning around it. Your workouts stay.', confirm: 'End block' })
    if (!ok) return
    await saveCoachItem({ ...b.item, status: 'done', outcome: `Ended in week ${b.week}` })
    toast('Block ended')
    navigate('/train', { replace: true })
  }
  return (
    <div class="screen goal-screen">
      <header class="page-head sub">
        <button class="icon-btn" onClick={() => back('/train')} aria-label="Back">
          <Icon name="left" />
        </button>
        <span class="page-title">Training block</span>
      </header>
      {!b ? (
        <p class="empty-note">No training block running. Ask your coach to plan the next few weeks toward your goal.</p>
      ) : (
        <>
          <section class="goal-hero">
            <div class="gh-top">
              <span class="gh-eyebrow">
                {b.spec.weeks} weeks · from {dateFmt.format(new Date(b.spec.start))}
              </span>
              <span class="goal-state on-track">{b.week === 0 ? 'Starts soon' : b.finished ? 'Finished' : `Week ${b.week}`}</span>
            </div>
            <b class="gh-title">{b.item.text}</b>
            {b.spec.summary && <p class="gh-summary">{b.spec.summary}</p>}
            <WeekDots b={b} />
          </section>
          <div class="section-head">
            <h2>Phases</h2>
          </div>
          <section class="card goal-milestones">
            {b.spec.phases.map((p) => {
              const now = b.week >= p.from && b.week <= p.to
              const past = b.week > p.to
              return (
                <div class={'gm-row' + (past ? ' done' : '') + (now ? ' now' : '')}>
                  <span class="gm-dot">{past ? <Icon name="check" size={14} stroke={3} /> : null}</span>
                  <span class="gm-text">
                    <b>{p.focus}</b>
                    <small>{[p.reps ? `${p.reps} reps` : '', p.sets ? `${p.sets} sets` : '', p.effort || ''].filter(Boolean).join(' · ')}</small>
                    {p.notes && <small>{p.notes}</small>}
                  </span>
                  <span class="gm-when">{p.from === p.to ? `Wk ${p.from}` : `Wk ${p.from}–${p.to}`}</span>
                </div>
              )
            })}
            {b.spec.deloadWeek && (
              <div class={'gm-row' + (b.week > b.spec.deloadWeek ? ' done' : '') + (b.deload ? ' now' : '')}>
                <span class="gm-dot" />
                <span class="gm-text">
                  <b>Deload</b>
                  <small>Easier week to recover and come back stronger</small>
                </span>
                <span class="gm-when">Wk {b.spec.deloadWeek}</span>
              </div>
            )}
          </section>
          {!!b.spec.keyLifts?.length && (
            <>
              <div class="section-head">
                <h2>Key lifts</h2>
              </div>
              <section class="card goal-lifts">
                {b.spec.keyLifts.map((k) => (
                  <div class="gl-row">
                    <span class="gl-name">
                      <b>{k.exercise}</b>
                      <small>{k.progression}</small>
                    </span>
                  </div>
                ))}
              </section>
            </>
          )}
          <button class="btn btn-primary btn-block btn-lg" onClick={() => askCoach(`How is my training block going? I'm in week ${b.week}. Anything to adjust?`)}>
            <Icon name="coach" size={20} /> Ask coach about this block
          </button>
          <div class="row gap">
            <button class="btn btn-ghost-danger grow" onClick={() => void end()}>
              End block
            </button>
          </div>
        </>
      )}
    </div>
  )
}
