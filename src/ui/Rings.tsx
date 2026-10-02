import { useMemo } from 'preact/hooks'
import { saveSettings, settings } from '../store'
import { navigate } from '../router'
import { HOUR, dayKey, hm } from '../fasting'
import { MOVE_GOALS, moveGoal, nudge, ringsFor, thisWeekDays, zone2Minutes } from '../rings'
import type { Milestone } from '../milestones'
import { startOfDay } from '../util'
import { Icon } from './icons'
import { actionSheet } from './overlay'
import { useNow } from './Fasting'

export interface Ring {
  pct: number
  cls: string
  label: string
}

/** Concentric rings, outermost first. Over 100% stays full and glows. */
export function RingStack({ rings, size = 132, stroke = 14, gap = 3, check }: { rings: Ring[]; size?: number; stroke?: number; gap?: number; check?: boolean }) {
  const c = size / 2
  return (
    <div class="ring-stack" style={{ width: `${size}px`, height: `${size}px` }}>
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={rings.map((r) => `${r.label} ${Math.round(r.pct * 100)}%`).join(', ')}>
        {rings.map((r, i) => {
          const rad = c - stroke / 2 - i * (stroke + gap)
          const len = 2 * Math.PI * rad
          const p = Math.min(1, Math.max(0, r.pct))
          return (
            <g class={'rs ' + r.cls + (r.pct >= 1 ? ' closed' : '')}>
              <circle cx={c} cy={c} r={rad} class="rs-track" stroke-width={stroke} />
              {p > 0 && <circle cx={c} cy={c} r={rad} class="rs-fill" stroke-width={stroke} stroke-dasharray={len} stroke-dashoffset={len * (1 - Math.max(p, 0.015))} transform={`rotate(-90 ${c} ${c})`} />}
            </g>
          )
        })}
      </svg>
      {check && (
        <span class="rs-check" title="Showed up">
          <Icon name="check" size={Math.max(10, Math.round(size / 9))} stroke={3.2} />
        </span>
      )}
    </div>
  )
}

/** Home screen: today's rings, a nudge and the week at a glance. */
export function TodayRings() {
  const now = useNow(30000)
  const today = startOfDay(new Date(now))
  const week = useMemo(() => thisWeekDays(now), [today])
  const days = ringsFor(week, now)
  const t = days.find((d) => d.day === today) || ringsFor([today], now)[0]
  const z2 = zone2Minutes()
  const z2Goal = settings.value.zone2Goal || 150
  const fastPct = t.fastMs / t.fastGoalMs
  const movePct = t.moveMin / t.moveGoal

  const pickGoal = () =>
    actionSheet({
      title: 'Daily Move goal',
      message: 'Minutes of any workout, strength or cardio. Any workout earns the day, even if you have to stop early.',
      actions: MOVE_GOALS.map((m) => ({ label: `${m} minutes`, selected: m === moveGoal(), onSelect: () => saveSettings({ moveGoal: m }) })),
    })

  return (
    <section class="card today-rings">
      <div class="tr-top">
        <RingStack
          check={t.showedUp}
          rings={[
            { pct: fastPct, cls: 'r-fast', label: 'Fast' },
            { pct: movePct, cls: 'r-move', label: 'Move' },
            { pct: z2 / z2Goal, cls: 'r-z2', label: 'Zone 2 this week' },
          ]}
        />
        <div class="tr-legend">
          <button class="tr-row r-fast" onClick={() => navigate('/fast')}>
            <span class="tr-label">Fast</span>
            <b>
              {t.fastMs ? hm(t.fastMs).replace(/ 00m$/, '') : '0h'}
              <small> / {Math.round(t.fastGoalMs / HOUR)}h</small>
            </b>
            <span class="tr-sub">{t.fastLive ? (fastPct >= 1 ? 'Goal reached, still going' : 'Fasting now') : fastPct >= 1 ? 'Goal reached' : t.fastMs ? 'Ended' : 'Not started'}</span>
          </button>
          <button class="tr-row r-move" onClick={pickGoal}>
            <span class="tr-label">Move</span>
            <b>
              {Math.round(t.moveMin)}
              <small> / {t.moveGoal} min</small>
            </b>
            <span class="tr-sub">
              {t.showedUp ? (
                <>
                  <Icon name="check" size={12} stroke={3} /> {movePct >= 1 ? 'Closed' : 'Showed up'}
                </>
              ) : (
                'Strength or cardio'
              )}
            </span>
          </button>
          <button class="tr-row r-z2" onClick={() => navigate('/body')}>
            <span class="tr-label">Zone 2</span>
            <b>
              {Math.round(z2)}
              <small> / {z2Goal} min</small>
            </b>
            <span class="tr-sub">This week</span>
          </button>
        </div>
      </div>
      <p class="tr-nudge">{nudge(t, days, now)}</p>
      <div class="tr-week">
        {days.map((d) => (
          <button class={'tr-day' + (d.day === today ? ' today' : '')} disabled={d.day > today} onClick={() => navigate(`/day/${dayKey(d.day)}`)} aria-label={new Date(d.day).toLocaleDateString(undefined, { weekday: 'long' })}>
            <RingStack
              size={36}
              stroke={5}
              gap={1.5}
              check={d.showedUp}
              rings={[
                { pct: d.fastMs / d.fastGoalMs, cls: 'r-fast', label: 'Fast' },
                { pct: d.moveMin / d.moveGoal, cls: 'r-move', label: 'Move' },
              ]}
            />
            <small>{new Date(d.day).toLocaleDateString(undefined, { weekday: 'narrow' })}</small>
          </button>
        ))}
      </div>
    </section>
  )
}

/** CSS-only burst; hidden for people who prefer reduced motion. */
export function Confetti({ n = 28 }: { n?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => ({
        left: Math.round(Math.random() * 100),
        delay: Math.round(Math.random() * 600),
        dur: 1600 + Math.round(Math.random() * 1400),
        rot: Math.round(Math.random() * 360),
        cls: ['c1', 'c2', 'c3', 'c4'][i % 4],
      })),
    [],
  )
  return (
    <div class="confetti" aria-hidden="true">
      {bits.map((b) => (
        <i class={b.cls} style={{ left: `${b.left}%`, animationDelay: `${b.delay}ms`, animationDuration: `${b.dur}ms`, transform: `rotate(${b.rot}deg)` }} />
      ))}
    </div>
  )
}

export function MilestoneList({ list }: { list: Milestone[] }) {
  if (!list.length) return null
  return (
    <div class="milestones">
      {list.map((m) => (
        <div class="milestone">
          <span class="ms-icon">
            <Icon name={m.icon} size={20} />
          </span>
          <span>
            <small>New milestone</small>
            <b>{m.title}</b>
            <span>{m.text}</span>
          </span>
        </div>
      ))}
    </div>
  )
}
