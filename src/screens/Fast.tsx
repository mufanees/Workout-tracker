import { useState } from 'preact/hooks'
import { activeFast, fasts, saveSettings, settings } from '../store'
import { back, navigate } from '../router'
import type { Fast as FastT } from '../types'
import { DAY, HOUR, STAGES, dayKey, endFast, fastStats, fastsByDay, hShort, hm, nextStage, protocolLabel, saveFastEdit, stageAt, startFast } from '../fasting'
import { FastEditor, FastRow, ProtocolSheet, StageRing, TimeSheet, draftPastFast, useNow, whenLabel } from '../ui/Fasting'
import { Icon } from '../ui/icons'
import { Toggle } from '../ui/inputs'
import { startOfDay } from '../util'

export function Fast() {
  const f = activeFast.value
  const now = useNow(1000)
  const goal = f ? f.goal : settings.value.fastGoal
  const [proto, setProto] = useState(false)
  const [picker, setPicker] = useState<null | 'start-new' | 'start-edit' | 'end'>(null)
  const [editing, setEditing] = useState<{
    fast: FastT
    isNew?: boolean
  } | null>(null)
  const [all, setAll] = useState(false)

  const done = fasts.value.filter((x) => x.end != null)
  const last = done[0]
  const stats = fastStats(fasts.value, now)
  const elapsed = f ? now - f.start : 0
  const hours = elapsed / HOUR
  const stage = stageAt(hours)
  const next = nextStage(hours)
  const left = goal * HOUR - elapsed

  const pickProtocol = async (g: number) => {
    await saveSettings({ fastGoal: g })
    if (f) await saveFastEdit({ ...f, goal: g })
  }
  const finish = async (at = Date.now()) => {
    if (!f) return
    const saved = await endFast(f, at)
    navigate(`/fast/done/${saved.id}`)
  }

  // eating window (idle)
  const sinceEat = last ? now - last.end! : null
  const windowLeft = last && goal < 24 ? last.end! + (24 - goal) * HOUR - now : null

  // last 7 days
  const byDay = fastsByDay(fasts.value, now)
  const today = startOfDay(new Date(now))
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = startOfDay(new Date(today - (6 - i) * DAY + DAY / 2))
    return { d, v: byDay.get(d) }
  })
  const top = Math.max(goal, 20, ...week.map((x) => (x.v?.ms || 0) / HOUR))

  return (
    <div class="screen fast-screen">
      <header class="page-head sub">
        <button class="icon-btn" onClick={() => back('/body')} aria-label="Back">
          <Icon name="left" />
        </button>
        <span class="page-title">Fasting</span>
        <button class="proto-pill" onClick={() => setProto(true)} aria-label={`Fasting plan ${protocolLabel(goal)}. Change`}>
          {protocolLabel(goal)} <Icon name="pencil" size={13} />
        </button>
      </header>

      <section class={'fast-hero' + (f ? ' on' : '')}>
        <StageRing elapsed={elapsed} goal={goal} idle={!f}>
          {f ? (
            <>
              <span class="sr-label">Fasting for</span>
              <b class="sr-big">{hm(elapsed).replace(/ 0?(\d+m)/, ' $1')}</b>
              <span class="sr-sec">{String(Math.floor(elapsed / 1000) % 60).padStart(2, '0')}s</span>
              <span class="sr-rule" />
              <span class="sr-label">{left > 0 ? 'Remaining' : 'Goal reached'}</span>
              <b class="sr-mid">{left > 0 ? hm(left) : `+${hm(-left)}`}</b>
            </>
          ) : (
            <>
              <span class="sr-label">{last ? 'Eating window' : 'Ready when you are'}</span>
              <b class="sr-big">{sinceEat != null ? hm(sinceEat) : protocolLabel(goal)}</b>
              {windowLeft != null && (
                <>
                  <span class="sr-rule" />
                  <span class="sr-label">{windowLeft > 0 ? 'Next fast in' : 'Window closed'}</span>
                  <b class="sr-mid">{windowLeft > 0 ? hm(windowLeft) : `${hm(-windowLeft)} ago`}</b>
                </>
              )}
            </>
          )}
        </StageRing>

        {f ? (
          <>
            <div class="fast-times">
              <button onClick={() => setPicker('start-edit')}>
                <span>Started</span>
                <b>
                  {whenLabel(f.start)} <Icon name="pencil" size={13} />
                </b>
              </button>
              <div>
                <span>Goal</span>
                <b>{whenLabel(f.start + f.goal * HOUR)}</b>
              </div>
            </div>
            <button class="btn btn-primary btn-block btn-lg" onClick={() => finish()}>
              End fast
            </button>
            <button class="link-btn" onClick={() => setPicker('end')}>
              Ate earlier? Set the end time
            </button>
          </>
        ) : (
          <>
            <button class="btn btn-primary btn-block btn-lg" onClick={() => startFast(Date.now(), goal)}>
              Start {protocolLabel(goal)} fast
            </button>
            <button class="link-btn" onClick={() => setPicker('start-new')}>
              Finished eating earlier? Set the start time
            </button>
          </>
        )}
      </section>

      {f && (
        <section class="card stage-card">
          <span class="stage-icon">
            <Icon name={stage.icon} size={22} />
          </span>
          <div>
            <b>{stage.name}</b>
            <p>{stage.text}</p>
            {next && (
              <small>
                Next: {next.name.toLowerCase()} in {hm(next.at * HOUR - elapsed)}
              </small>
            )}
          </div>
        </section>
      )}

      <div class="stat-grid">
        <div>
          <b>
            {stats.streak}
            {stats.streak > 0 && <Icon name="flame" size={16} class="flame" />}
          </b>
          <span>day streak</span>
        </div>
        <div>
          <b>{stats.best}</b>
          <span>best streak</span>
        </div>
        <div>
          <b>{stats.count7 ? hShort(stats.avg7) : '–'}</b>
          <span>7-day average</span>
        </div>
        <div>
          <b>{stats.longest ? hShort(stats.longest.end! - stats.longest.start) : '–'}</b>
          <span>longest</span>
        </div>
        <div>
          <b>{stats.hitRate != null ? `${Math.round(stats.hitRate * 100)}%` : '–'}</b>
          <span>goals hit, 30 days</span>
        </div>
        <div>
          <b>{stats.total}</b>
          <span>fasts · {Math.round(stats.totalMs / HOUR)} h</span>
        </div>
      </div>

      <section class="card">
        <div class="fast-head">
          <span class="eyebrow">Last 7 days</span>
          <button class="btn-text small inline-link" onClick={() => navigate('/history?view=calendar')}>
            Calendar <Icon name="right" size={14} />
          </button>
        </div>
        <div class="fweek" role="list">
          {week.map(({ d, v }) => {
            const h = (v?.ms || 0) / HOUR
            return (
              <button
                role="listitem"
                class="fw"
                onClick={() => navigate(`/day/${dayKey(d)}`)}
                aria-label={`${new Date(d).toLocaleDateString(undefined, { weekday: 'long' })}: ${v ? hm(v.ms) : 'no fast'}`}
              >
                <small class="fw-val">{v ? hShort(v.ms) : ''}</small>
                <span class="fw-track">
                  <span class={'fw-fill' + (v?.hit ? ' hit' : '') + (v?.live ? ' live' : '')} style={{ height: `${Math.min(100, (h / top) * 100)}%` }} />
                  <span class="fw-goal" style={{ bottom: `${(goal / top) * 100}%` }} />
                </span>
                <small class={d === today ? 'on' : ''}>
                  {new Date(d).toLocaleDateString(undefined, {
                    weekday: 'narrow',
                  })}
                </small>
              </button>
            )
          })}
        </div>
      </section>

      <div class="section-head">
        <h2>Fasts</h2>
        <button class="btn btn-secondary btn-sm" onClick={() => setEditing({ fast: draftPastFast(Date.now()), isNew: true })}>
          <Icon name="plus" size={16} /> Add past fast
        </button>
      </div>
      <section class="card fast-list">
        {!fasts.value.length && <p class="muted small">Your fasts show up here. Start one when you finish eating, or add one you forgot to log.</p>}
        {(all ? fasts.value : fasts.value.slice(0, 10)).map((x) => (
          <FastRow f={x} now={now} onEdit={() => setEditing({ fast: x })} />
        ))}
        {fasts.value.length > 10 && (
          <button class="show-all" onClick={() => setAll(!all)}>
            {all ? 'Show less' : `Show all ${fasts.value.length}`}
          </button>
        )}
      </section>

      <h2 class="section-title">Stages</h2>
      <section class="card stage-list">
        {STAGES.map((s) => {
          const on = !!f && stage.at === s.at
          return (
            <div class={'stage-row' + (on ? ' on' : '') + (f && hours >= s.at ? ' passed' : '')}>
              <span class="stage-icon sm">
                <Icon name={s.icon} size={16} />
              </span>
              <div>
                <b>{s.name}</b>
                <span>{s.text}</span>
              </div>
              <small>{s.at} h</small>
            </div>
          )
        })}
        <p class="muted small">A rough guide. Timing varies with what you ate, how active you are and your metabolism.</p>
      </section>

      <div class="settings-group">
        <div class="setting">
          <span>
            Eating window reminder
            <small>30 minutes before it closes (needs notifications on)</small>
          </span>
          <Toggle label="Eating window reminder" checked={settings.value.fastRemind !== false} onChange={(v) => saveSettings({ fastRemind: v })} />
        </div>
      </div>

      <ProtocolSheet open={proto} value={goal} onPick={pickProtocol} onClose={() => setProto(false)} />
      <TimeSheet
        open={picker != null}
        title={picker === 'end' ? 'When did you eat?' : 'When did you finish eating?'}
        initial={picker === 'start-edit' && f ? f.start : Date.now()}
        min={picker === 'end' && f ? f.start : last ? last.end! : undefined}
        confirm={picker === 'end' ? 'End fast' : picker === 'start-new' ? 'Start fast' : 'Save'}
        onPick={(t) => {
          if (picker === 'start-new') void startFast(t, goal)
          else if (picker === 'start-edit' && f) void saveFastEdit({ ...f, start: t })
          else if (picker === 'end') void finish(t)
        }}
        onClose={() => setPicker(null)}
      />
      <FastEditor fast={editing?.fast || null} isNew={editing?.isNew} onClose={() => setEditing(null)} />
    </div>
  )
}
