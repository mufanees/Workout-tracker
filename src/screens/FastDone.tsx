import { useState } from 'preact/hooks'
import { fasts } from '../store'
import { navigate } from '../router'
import { HOUR, fastStats, hShort, hm, protocolLabel, stageAt } from '../fasting'
import { milestonesFor } from '../milestones'
import { ringsFor } from '../rings'
import { Confetti, MilestoneList, RingStack } from '../ui/Rings'
import { FastEditor } from '../ui/Fasting'
import { QuoteCard } from '../ui/Quote'
import { Icon } from '../ui/icons'
import { startOfDay } from '../util'

/** Shown right after ending a fast. */
export function FastDone({ id }: { id: string }) {
  const f = fasts.value.find((x) => x.id === id)
  const [editing, setEditing] = useState(false)
  if (!f || f.end == null) {
    navigate('/fast', { replace: true })
    return null
  }
  const len = f.end - f.start
  const hit = len >= f.goal * HOUR
  const stage = stageAt(len / HOUR)
  const stats = fastStats()
  const isLongest = stats.longest?.id === f.id && stats.total > 1
  const day = ringsFor([startOfDay(new Date(f.end))])[0]
  const short = f.goal * HOUR - len
  const done = () => navigate('/train', { replace: true })

  return (
    <div class="screen celebrate-screen">
      {hit && <Confetti />}
      <header class="page-head sub">
        <button class="icon-btn" onClick={done} aria-label="Close">
          <Icon name="x" />
        </button>
      </header>
      <section class={'celebrate fast-celebrate' + (hit ? ' hit' : '')}>
        <RingStack
          size={168}
          stroke={18}
          check={day.showedUp}
          rings={[
            { pct: len / (f.goal * HOUR), cls: 'r-fast', label: 'Fast' },
            { pct: day.moveMin / day.moveGoal, cls: 'r-move', label: 'Move' },
          ]}
        />
        <h1>{hit ? 'Fast complete' : 'Fast logged'}</h1>
        <p class="cel-big">{hm(len)}</p>
        <p>
          {hit
            ? `${protocolLabel(f.goal)} goal reached${len - f.goal * HOUR >= 30 * 60000 ? `, ${hm(len - f.goal * HOUR)} past it` : ''}.`
            : `${hm(short)} short of ${protocolLabel(f.goal)}. ${Math.floor(len / HOUR)} hours of discipline still counts.`}
        </p>
        <div class="cel-chips">
          <span class="cel-chip">
            <Icon name={stage.icon} size={14} /> Reached {stage.name.toLowerCase()}
          </span>
          {stats.streak > 0 && hit && (
            <span class="cel-chip">
              <Icon name="flame" size={14} /> {stats.streak}-day streak
            </span>
          )}
          {isLongest && (
            <span class="cel-chip gold">
              <Icon name="medal" size={14} /> Longest fast yet
            </span>
          )}
        </div>
      </section>

      <MilestoneList list={milestonesFor(f.id)} />

      <div class="stat-grid">
        <div>
          <b>{stats.count7 ? hShort(stats.avg7) : '–'}</b>
          <span>7-day average</span>
        </div>
        <div>
          <b>{stats.hitRate != null ? `${Math.round(stats.hitRate * 100)}%` : '–'}</b>
          <span>goals hit, 30 days</span>
        </div>
        <div>
          <b>{stats.total}</b>
          <span>fasts logged</span>
        </div>
      </div>

      <QuoteCard compact seed={7} />

      <div class="stack">
        <button class="btn btn-secondary btn-block" onClick={() => setEditing(true)}>
          <Icon name="sticky" size={18} /> {f.note ? 'Edit note' : 'Add a note'}
        </button>
        <button class="btn btn-primary btn-block btn-lg" onClick={done}>
          Done
        </button>
      </div>
      <FastEditor fast={editing ? f : null} onClose={() => setEditing(false)} />
    </div>
  )
}
