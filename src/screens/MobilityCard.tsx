// Train: the coach's mobility plan. Today's add-ons (they join whatever workout you start), today's
// standalone session with a Start button, and the week at a glance.
import { useState } from 'preact/hooks'
import { activeMobility, moveDose, sessionDone } from '../mobility'
import { dayKey } from '../fasting'
import { navigate } from '../router'
import { saveCoachItem } from '../store'
import { startMobility } from '../workout'
import { Icon } from '../ui/icons'
import { actionSheet, toast } from '../ui/overlay'
import type { MobilityDay } from '../types'

const LABEL: Record<MobilityDay['intensity'], string> = { hard: 'Hard day', moderate: 'Moderate day', easy: 'Easy day', rest: 'Rest day' }
const weekday = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })

export function MobilityCard() {
  const item = activeMobility.value
  const [open, setOpen] = useState(false)
  const today = dayKey(Date.now())
  const days = (item?.mobility?.days || []).filter((d) => d.date >= today)
  if (!item || !days.length) return null
  const d = days[0].date === today ? days[0] : null
  const next = d ? days[1] : days[0]
  const done = d?.session ? sessionDone(d.date) : false
  const menu = () =>
    actionSheet({
      title: item.text || 'Mobility',
      actions: [
        { label: 'Ask coach to adjust it', icon: 'coach', onSelect: () => navigate(`/coach?ask=${encodeURIComponent('Can we adjust my mobility plan?')}`) },
        {
          label: 'Stop this plan',
          icon: 'x',
          danger: true,
          onSelect: async () => {
            await saveCoachItem({ ...item, status: 'done', outcome: 'Stopped' })
            toast('Mobility plan stopped')
          },
        },
      ],
    })
  return (
    <div class="goal-card mobility-card">
      <div class="gc-top">
        <span class="eyebrow">
          <Icon name="mobility" size={14} /> {item.mobility!.scope === 'week' ? 'Mobility this week' : 'Mobility today'}
        </span>
        <button class="icon-btn" aria-label="Mobility plan options" onClick={menu}>
          <Icon name="more" size={18} />
        </button>
      </div>
      {d ? (
        <>
          <b class="gc-title">
            {LABEL[d.intensity]}
            {d.focus ? ` · ${d.focus}` : ''}
          </b>
          {!!d.warmup?.length && (
            <p class="mob-line">
              <span>In your warm-up</span> {d.warmup.join(' · ')}
            </p>
          )}
          {!!d.cooldown?.length && (
            <p class="mob-line">
              <span>In your cool-down</span> {d.cooldown.join(' · ')}
            </p>
          )}
          {d.session && (
            <div class="mob-session">
              <div class="mob-session-head">
                <b>{d.session.name}</b>
                {d.session.minutes ? <small>{d.session.minutes} min</small> : null}
              </div>
              <ul>
                {d.session.moves.map((m) => (
                  <li>
                    {m.name} <small>{moveDose(m)}</small>
                  </li>
                ))}
              </ul>
              {done ? (
                <span class="mob-done">
                  <Icon name="check" size={16} /> Done today
                </span>
              ) : (
                <button class="btn btn-primary btn-block" onClick={() => startMobility(d)}>
                  <Icon name="play" size={18} /> Start {d.session.minutes ? `${d.session.minutes} min` : 'session'}
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <b class="gc-title">Nothing today{next ? ` · next: ${weekday(next.date)}` : ''}</b>
      )}
      {days.length > 1 && (
        <>
          <button class="btn-text small mob-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? 'Hide the week' : 'See the week'} <Icon name={open ? 'up' : 'down'} size={14} />
          </button>
          {open && (
            <ul class="mob-week">
              {days.map((x) => (
                <li class={x.date === today ? 'now' : ''}>
                  <b>{x.date === today ? 'Today' : weekday(x.date)}</b>
                  <span class={'mob-int ' + x.intensity}>{x.intensity}</span>
                  <small>
                    {[x.focus, x.warmup?.length ? `+${x.warmup.length} warm-up` : '', x.cooldown?.length ? `+${x.cooldown.length} cool-down` : '', x.session ? `${x.session.name}${x.session.minutes ? ` ${x.session.minutes} min` : ''}` : ''].filter(Boolean).join(' · ')}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
