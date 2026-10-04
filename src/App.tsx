import { useEffect, useState } from 'preact/hooks'
import { route, navigate } from './router'
import { active, ready, settings } from './store'
import { Train, MiniBar } from './screens/Train'
import { Live } from './screens/Live'
import { History, WorkoutDetail, EditWorkout } from './screens/History'
import { Exercises, ExerciseDetail } from './screens/Exercises'
import { RoutineEditor } from './screens/RoutineEditor'
import { Settings } from './screens/Settings'
import { Body } from './screens/Body'
import { ImportPlan } from './screens/ImportPlan'
import { Coach } from './screens/Coach'
import { CoachMemory } from './screens/CoachMemory'
import { Fast } from './screens/Fast'
import { FastDone } from './screens/FastDone'
import { GooDefs, gooTab, Motes, repaintGoo, TabGoo } from './ui/Goo'
import { applyAccent } from './accent'
import { setGoo } from './gooConfig'
import { BlockScreen, GoalDetail, GoalsScreen } from './screens/Goal'
import { DayView } from './screens/Calendar'
import { Icon } from './ui/icons'
import { OverlayHost } from './ui/overlay'

const TABS = [
  { path: '/train', label: 'Train', icon: 'dumbbell' },
  { path: '/history', label: 'Log', icon: 'log' },
  { path: '/exercises', label: 'Exercises', icon: 'list' },
  { path: '/body', label: 'Body', icon: 'activity' },
  { path: '/coach', label: 'Coach', icon: 'coach' },
]

export function App() {
  const theme = settings.value.theme
  const accent = settings.value.accent ?? null
  // First open: let the home screen arrive in chunks, once.
  const [boot, setBoot] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setBoot(false), 1400)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b0c0f' : '#f6f6f3')
    applyAccent(accent, dark)
    requestAnimationFrame(repaintGoo)
    // follow the system between light and dark when on Auto
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => theme === 'system' && (applyAccent(accent, mq.matches), requestAnimationFrame(repaintGoo))
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [theme, accent])
  // after the app (and its goo filters) is on screen
  useEffect(() => setGoo(settings.value.goo), [JSON.stringify(settings.value.goo || {}), ready.value])

  if (!ready.value) return <div class="boot" />

  const r = route.value
  const [a, b, c] = r.parts
  let screen
  let tab: string | null = null
  if (a === 'live') screen = <Live />
  else if (a === 'history' && b) screen = <WorkoutDetail id={b} key={b} />
  else if (a === 'history') (screen = <History />), (tab = '/history')
  else if (a === 'edit' && b) screen = <EditWorkout id={b} key={b} />
  else if (a === 'exercises' && b) screen = <ExerciseDetail id={b} key={b} />
  else if (a === 'exercises') (screen = <Exercises />), (tab = '/exercises')
  else if (a === 'routine' && b) screen = <RoutineEditor id={b} key={b} />
  else if (a === 'settings') screen = <Settings />
  else if (a === 'import') screen = <ImportPlan />
  else if (a === 'coach' && b === 'memory') screen = <CoachMemory />
  else if (a === 'coach') (screen = <Coach />), (tab = '/coach')
  else if (a === 'body') (screen = <Body />), (tab = '/body')
  else if (a === 'fast' && b === 'done' && c) screen = <FastDone id={c} key={c} />
  else if (a === 'fast') screen = <Fast />
  else if (a === 'goals' && b) screen = <GoalDetail id={b} key={b} />
  else if (a === 'goals') screen = <GoalsScreen />
  else if (a === 'block') screen = <BlockScreen />
  else if (a === 'day' && b && /^\d{4}-\d{2}-\d{2}$/.test(b)) screen = <DayView id={b} key={b} />
  else (screen = <Train />), (tab = '/train')

  const isLive = a === 'live'
  const activeTab = tab || ({ fast: '/body', day: '/history', goals: '/train', block: '/train' } as Record<string, string>)[a] || '/' + a
  const showTabs = tab != null || (!isLive && !['routine', 'edit', 'settings', 'import'].includes(a) && !(a === 'fast' && b === 'done'))

  return (
    <div class={'app' + (boot ? ' boot' : '') + (showTabs ? ' has-tabs' : '') + (active.value && !isLive && showTabs ? ' has-mini' : '')}>
      {screen}
      {!isLive && showTabs && <MiniBar />}
      {showTabs && (
        <nav class="tabbar" aria-label="Main">
          <TabGoo index={TABS.findIndex((t) => t.path === activeTab)} />
          {TABS.map((t, i) => {
            const on = activeTab === t.path
            return (
              <button class={'tab' + (on ? ' on' : '')} style={{ viewTransitionName: `tab-${i}` }} aria-current={on ? 'page' : undefined} onClick={() => !on && (gooTab(i), navigate(t.path, { replace: tab != null }))}>
                {on && <Motes />}
                <Icon name={t.icon} size={22} stroke={on ? 2.4 : 2} />
                <span class="tab-label">{t.label}</span>
              </button>
            )
          })}
        </nav>
      )}
      <OverlayHost />
      <GooDefs />
    </div>
  )
}
