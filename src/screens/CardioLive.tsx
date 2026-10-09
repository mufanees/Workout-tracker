// The live screen for a cardio session: one clock, heart rate as the hero, live time in every zone,
// and the phase you're in (warm-up → main → cool-down stretches). Laid out for a phone in a gym
// holder too: in landscape the heart rate fills one half and everything else sits in the other.
import { useEffect, useRef, useState } from 'preact/hooks'
import { active, settings } from '../store'
import { navigate } from '../router'
import { alertPause, alertText, bpm, hrStatus, hrSupported, summarizeHR, zone, zoneAlert, ZONE_COLORS, ZONE_NAMES, zoneRange } from '../hr'
import { cardioPhase, finishCardio, mainHR, mainStartOf, phaseStart, resumeMain, startCooldown, startMain, type CardioPhase } from '../cardio'
import { armSetTimer, cancelSetTimer, finishSetTimer, logLine, pauseSetTimer, resumeSetTimer, setTimer, startSetTimer, type SetTimer } from '../workout'
import { HRConnect, ZoneBreakdown, ZoneScale } from '../ui/HR'
import { CardioSetupSheet } from '../ui/CardioSetup'
import { MoveText } from '../ui/MoveList'
import { Icon } from '../ui/icons'
import { parseMove } from '../moves'
import { fmtClock, haptic, timeDose } from '../util'
import type { Workout } from '../types'
import '../cardio.css'

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

// Same as the workout screen's: Bluetooth stops when the screen turns off.
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let dead = false
    const get = async () => {
      try {
        if (document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen')
        if (dead) void lock?.release()
      } catch {
        /* denied or unsupported */
      }
    }
    const onVis = () => document.visibilityState === 'visible' && get()
    void get()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      dead = true
      document.removeEventListener('visibilitychange', onVis)
      void lock?.release()
    }
  }, [on])
}

export function CardioLive() {
  const w = active.value
  const now = useNow()
  const [setup, setSetup] = useState(false)
  useWakeLock(!!w && settings.value.keepAwake)
  useEffect(() => {
    if (setTimer.value) armSetTimer()
  }, [])
  if (!w?.cardio) return null
  const c = w.cardio
  const phase = cardioPhase(w, now)!
  const target = w.targetZone ?? null
  const alert = zoneAlert.value
  const z = zone.value

  return (
    <div class={`cardio phase-${phase}` + (alert ? ' alert' : '')} style={z ? { '--zc': ZONE_COLORS[z - 1] } : undefined}>
      <header class="cardio-head">
        <button class="icon-btn" onClick={() => navigate('/train')} aria-label="Minimize session">
          <Icon name="down" size={24} />
        </button>
        <div class="cardio-title">
          <b>{c.activity}</b>
          <span>{target ? `Zone ${target} · ${zoneRange(target)}` : 'Free cardio'}</span>
        </div>
        <PhaseSteps w={w} phase={phase} now={now} />
        <button class="icon-btn" onClick={() => setSetup(true)} aria-label="Session settings">
          <Icon name="sliders" size={22} />
        </button>
        <button class={'btn btn-sm ' + (phase === 'cooldown' ? 'btn-primary' : 'btn-secondary')} onClick={finishCardio}>
          Finish
        </button>
      </header>

      <div class="cardio-grid">
        <Hero w={w} phase={phase} now={now} />
        <div class="cardio-side">
          <Clocks w={w} phase={phase} now={now} />
          {phase === 'cooldown' ? <Stretches w={w} /> : <Zones w={w} now={now} />}
          <PhaseAction w={w} phase={phase} />
          {phase === 'cooldown' && (
            <div class="cz-after">
              <Zones w={w} now={now} />
            </div>
          )}
        </div>
      </div>

      <CardioSetupSheet open={setup} onClose={() => setSetup(false)} mode="session" />
    </div>
  )
}

/** Warm-up · main · cool-down: where you are, how far through. */
function PhaseSteps({ w, phase, now }: { w: Workout; phase: CardioPhase; now: number }) {
  const c = w.cardio!
  const order: CardioPhase[] = ['warmup', 'main', 'cooldown']
  const at = order.indexOf(phase)
  const fill = (p: CardioPhase) => {
    const i = order.indexOf(p)
    if (i < at) return 100
    if (i > at) return 0
    if (p === 'main') return 100
    const mins = p === 'warmup' ? c.warmupMin : c.cooldownMin
    return mins ? Math.min(100, ((now - phaseStart(w, now)) / (mins * 60000)) * 100) : 100
  }
  const label = { warmup: 'Warm-up', main: c.activity, cooldown: 'Cool-down' }
  return (
    <ol class="cardio-steps" aria-label="Session phases">
      {order.map((p, i) => (
        <li class={(i < at ? 'done ' : '') + (i === at ? 'on' : '')} aria-current={i === at ? 'step' : undefined}>
          <span class="cs-label">{label[p]}</span>
          <span class="cs-track">
            <span style={{ width: fill(p) + '%' }} />
          </span>
        </li>
      ))}
    </ol>
  )
}

/** The heart rate, as big as the screen allows, with its zone and what to do about it. */
function Hero({ w, phase, now }: { w: Workout; phase: CardioPhase; now: number }) {
  const status = hrStatus.value
  const hr = bpm.value
  const z = zone.value
  const target = w.targetZone ?? null
  const alert = zoneAlert.value
  const pause = alertPause(w, now)
  const off = !hrSupported || status === 'off' || status === 'connecting'

  let line
  if (off) line = null
  else if (!hr) line = <p class="cd-status">{status === 'reconnecting' ? 'Reconnecting to your strap…' : 'Waiting for a signal…'}</p>
  else if (alert && target)
    line = (
      <p class="cd-status alert" role="alert">
        <Icon name={alert === 'above' ? 'downArrow' : 'up'} size={20} stroke={2.6} />
        {alertText(alert, target)}
      </p>
    )
  else if (pause?.reason === 'warmup') line = <p class="cd-status">Warming up · zone alerts from {fmtClock((pause.until - w.start) / 1000)}</p>
  else if (phase === 'warmup') line = <p class="cd-status">Warming up · take it easy</p>
  else if (phase === 'cooldown') line = <p class="cd-status">Cooling down · let it come down</p>
  else if (target && z === target)
    line = (
      <p class="cd-status good">
        <Icon name="check" size={18} stroke={2.6} /> In zone {target} · hold this pace
      </p>
    )
  else if (target && z) line = <p class="cd-status">{z < target ? `Below zone ${target}` : `Above zone ${target}`}</p>
  else line = <p class="cd-status">{z ? ZONE_NAMES[z - 1] : ''}</p>

  return (
    <section class="cardio-hero" aria-live="polite">
      <div class="cd-top">
        <Icon name="heart" size={22} class={'hr-heart' + (hr ? ' beat' : '')} />
        {z ? (
          <span class="cd-zone">
            Zone {z} <small>{ZONE_NAMES[z - 1]}</small>
          </span>
        ) : (
          <span class="cd-zone muted">Heart rate</span>
        )}
      </div>
      <div class="cd-bpm">
        <b>{hr ?? '--'}</b>
        <span>bpm</span>
      </div>
      <ZoneScale hr={hr} target={target} />
      {off ? hrSupported ? <HRConnect class="on-ink" /> : <p class="cd-status">Heart rate needs Chrome on Android or a desktop browser with Bluetooth.</p> : line}
    </section>
  )
}

/** Total time on one clock, and the current phase's time (counting down when it has a length). */
function Clocks({ w, phase, now }: { w: Workout; phase: CardioPhase; now: number }) {
  const c = w.cardio!
  const since = (now - phaseStart(w, now)) / 1000
  const mins = phase === 'warmup' ? c.warmupMin : phase === 'cooldown' ? c.cooldownMin : 0
  const left = mins * 60 - since
  const label = phase === 'warmup' ? 'Warm-up' : phase === 'cooldown' ? 'Cool-down' : c.activity
  const value = phase === 'main' ? (
    fmtClock(since)
  ) : left > 0 ? (
    <>
      {fmtClock(Math.ceil(left))}
      <small> left</small>
    </>
  ) : (
    <>
      {'+' + fmtClock(-left)}
      <small> {phase === 'cooldown' ? 'done' : 'over'}</small>
    </>
  )
  return (
    <div class="cardio-clocks">
      <div>
        <span class="stat-label">Total</span>
        <b class="cc-total">{fmtClock((now - w.start) / 1000)}</b>
      </div>
      <div>
        <span class="stat-label">{label}</span>
        <b>{value}</b>
      </div>
    </div>
  )
}

/** Live time in every zone this session, and how the main part is going. */
function Zones({ w, now }: { w: Workout; now: number }) {
  const all = summarizeHR(w.hr)
  const main = mainHR(w, now)
  const target = w.targetZone ?? null
  const mainSecs = main ? main.zoneSeconds.reduce((a, b) => a + b, 0) : 0
  const started = mainStartOf(w, now) != null
  return (
    <section class="cardio-zones">
      <div class="cz-head">
        <span class="stat-label">Time in each zone</span>
        {all && <span class="cz-avg">avg {all.avg} · max {all.max}</span>}
      </div>
      <ZoneBreakdown seconds={all?.zoneSeconds || [0, 0, 0, 0, 0]} target={target} current={zone.value} />
      <div class="cz-main">
        <div>
          <span class="stat-label">{w.cardio!.activity} avg</span>
          <b>
            {main?.avg ?? '--'}
            <small> bpm</small>
          </b>
        </div>
        {target ? (
          <div>
            <span class="stat-label">In zone {target}</span>
            <b>
              {main ? fmtClock(main.zoneSeconds[target - 1]) : started ? '0:00' : '--'}
              {main && mainSecs > 0 ? <small> {Math.round((main.zoneSeconds[target - 1] / mainSecs) * 100)}%</small> : null}
            </b>
          </div>
        ) : (
          <div>
            <span class="stat-label">{w.cardio!.activity} max</span>
            <b>{main?.max ?? '--'}</b>
          </div>
        )}
      </div>
    </section>
  )
}

/** The one thing to tap next: end the warm-up, start cooling down, or finish. */
function PhaseAction({ w, phase }: { w: Workout; phase: CardioPhase }) {
  if (phase === 'warmup')
    return (
      <button class="btn btn-secondary btn-lg btn-block cardio-action" onClick={startMain}>
        <Icon name="play" size={16} /> Start {w.cardio!.activity.toLowerCase()} now
      </button>
    )
  if (phase === 'main')
    return (
      <button class="btn btn-primary btn-lg btn-block cardio-action" onClick={startCooldown}>
        Cool down
      </button>
    )
  return (
    <div class="cardio-action row gap">
      <button class="btn btn-secondary btn-lg" onClick={resumeMain} aria-label={`Back to ${w.cardio!.activity}`}>
        <Icon name="left" size={18} /> Back
      </button>
      <button class="btn btn-primary btn-lg grow" onClick={finishCardio}>
        Finish
      </button>
    </div>
  )
}

const timerLeft = (t: SetTimer, now: number) => Math.max(0, Math.ceil((t.left ?? t.end - now) / 1000))

/** Cool-down stretches: tick them, or run each one's timer; the next one starts when one finishes. */
function Stretches({ w }: { w: Workout }) {
  const items = w.cardio!.stretches || []
  const checks = w.checks || {}
  const t = setTimer.value
  const now = useNow(250)
  const chain = useRef(false)
  const lastKey = useRef<string | null>(null)

  // When a stretch's timer runs out (or Done), roll on to the next stretch with a time.
  useEffect(() => {
    const key = t?.target.kind === 'line' ? t.target.key : null
    const prev = lastKey.current
    lastKey.current = key
    if (key || !prev || !chain.current) return
    if (!checks[prev]) return void (chain.current = false) // cancelled
    const from = Number(prev.slice(1)) + 1
    for (let i = from; i < items.length; i++) {
      if (checks['c' + i]) continue
      const m = parseMove(items[i])
      const dose = timeDose(m.dose)
      if (!dose) break
      startSetTimer({ label: m.name, target: { kind: 'line', key: 'c' + i }, secs: dose.secs, sides: dose.sides })
      return
    }
    chain.current = false
  }, [t, checks])

  if (!items.length)
    return (
      <section class="cardio-stretches empty">
        <p>No stretches set. Add some in the session settings, or just walk it down.</p>
      </section>
    )
  const done = items.filter((_, i) => checks['c' + i]).length
  return (
    <section class="cardio-stretches">
      <div class="cz-head">
        <span class="stat-label">Stretches</span>
        <span class="cz-avg">
          {done}/{items.length}
        </span>
      </div>
      <ul>
        {items.map((line, i) => {
          const key = 'c' + i
          const on = !!checks[key]
          const m = parseMove(line)
          const dose = timeDose(m.dose)
          const mine = t?.target.kind === 'line' && t.target.key === key ? t : null
          const running = !!mine && mine.left == null
          const pct = mine ? Math.min(100, Math.max(0, ((mine.left ?? mine.end - now) / 1000 / mine.total) * 100)) : 0
          return (
            <li class={'cs-row' + (on ? ' on' : '') + (mine ? ' timing' : '') + (mine?.phase === 'switch' ? ' switch' : '')}>
              {mine && <span class="cs-fill" style={{ width: pct + '%' }} aria-hidden="true" />}
              <button
                class="cs-tick"
                aria-pressed={on}
                onClick={() => {
                  haptic(8)
                  if (mine) cancelSetTimer()
                  logLine(key, !on)
                }}
              >
                <span class="cl-box">{on && <Icon name="check" size={14} stroke={3} />}</span>
                {mine ? (
                  <span class="cs-live">
                    <b>{fmtClock(timerLeft(mine, now))}</b>
                    <span>{mine.phase === 'switch' ? 'Switch sides' : (mine.sides === 2 ? (mine.side === 1 ? 'Left · ' : 'Right · ') : '') + m.name}</span>
                  </span>
                ) : (
                  <MoveText m={m} />
                )}
              </button>
              {dose && !on && (
                <button
                  class={'icon-btn cs-timer' + (mine ? ' on' : '')}
                  aria-label={running ? `Pause: ${m.name}` : mine ? `Resume: ${m.name}` : `Start a ${m.dose} timer: ${m.name}`}
                  onClick={() => {
                    haptic(12)
                    if (running) return pauseSetTimer()
                    if (mine) return resumeSetTimer()
                    chain.current = true
                    startSetTimer({ label: m.name, target: { kind: 'line', key }, secs: dose.secs, sides: dose.sides })
                  }}
                >
                  <Icon name={running ? 'pause' : mine ? 'play' : 'timer'} size={20} />
                </button>
              )}
              {mine && (
                <button class="icon-btn cs-done" aria-label="Done: next stretch" onClick={() => (haptic(12), finishSetTimer())}>
                  <Icon name="check" size={20} stroke={2.6} />
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
