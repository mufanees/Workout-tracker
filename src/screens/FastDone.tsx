import { useState } from 'preact/hooks'
import { fasts } from '../store'
import { navigate } from '../router'
import { HOUR, fastStats, hShort, hm, protocolLabel, stageAt } from '../fasting'
import { milestonesFor } from '../milestones'
import { ringsFor } from '../rings'
import { CelebrationHero, Confetti, MilestoneList } from '../ui/Rings'
import { FastEditor, FastTimes } from '../ui/Fasting'
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
      <div class={'fast-celebrate' + (hit ? ' hit' : '')}>
        <CelebrationHero
          eyebrow={`${hit ? 'Fast complete' : 'Fast logged'} · ${protocolLabel(f.goal)}`}
          badge={hit ? 'check' : 'fast'}
          parts={[
            [String(Math.floor(len / HOUR)), 'h'],
            [String(Math.floor(len / 60000) % 60).padStart(2, '0'), 'm'],
          ]}
          bar={{ pct: len / (f.goal * HOUR), left: `Goal ${f.goal}h`, right: hit ? (len - f.goal * HOUR >= 30 * 60000 ? `+${hm(len - f.goal * HOUR)}` : 'Reached') : `${hm(short)} to go`, done: hit }}
          line={hit ? 'You said you would, and you did.' : `${Math.floor(len / HOUR)} hours of discipline still counts. Next one’s yours.`}
        />
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
          {day.showedUp && (
            <span class="cel-chip">
              <Icon name="dumbbell" size={14} /> Trained today too
            </span>
          )}
        </div>
      </div>

      <FastTimes fast={f} />

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
