import { useEffect } from 'preact/hooks'
import { route, navigate } from './router'
import { active, ready, settings } from './store'
import { Train, MiniBar } from './screens/Train'
import { Live } from './screens/Live'
import { History, WorkoutDetail, EditWorkout } from './screens/History'
import { Exercises, ExerciseDetail } from './screens/Exercises'
import { RoutineEditor } from './screens/RoutineEditor'
import { Settings } from './screens/Settings'
import { Body } from './screens/Body'
import { Icon } from './ui/icons'
import { OverlayHost } from './ui/overlay'

const TABS = [
  { path: '/train', label: 'Train', icon: 'dumbbell' },
  { path: '/history', label: 'History', icon: 'history' },
  { path: '/exercises', label: 'Exercises', icon: 'list' },
  { path: '/body', label: 'Body', icon: 'activity' },
]

export function App() {
  const theme = settings.value.theme
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b0c0f' : '#f6f6f3')
  }, [theme])

  if (!ready.value) return <div class="boot" />

  const r = route.value
  const [a, b] = r.parts
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
  else if (a === 'body') (screen = <Body />), (tab = '/body')
  else (screen = <Train />), (tab = '/train')

  const isLive = a === 'live'
  const showTabs = tab != null || (!isLive && !['routine', 'edit', 'settings'].includes(a))

  return (
    <div class={'app' + (showTabs ? ' has-tabs' : '') + (active.value && !isLive && showTabs ? ' has-mini' : '')}>
      {screen}
      {!isLive && showTabs && <MiniBar />}
      {showTabs && (
        <nav class="tabbar" aria-label="Main">
          {TABS.map((t) => {
            const on = (tab || '/' + a) === t.path
            return (
              <button class={'tab' + (on ? ' on' : '')} aria-current={on ? 'page' : undefined} onClick={() => navigate(t.path, { replace: tab != null })}>
                <Icon name={t.icon} size={22} stroke={on ? 2.4 : 2} />
                <span>{t.label}</span>
              </button>
            )
          })}
        </nav>
      )}
      <OverlayHost />
    </div>
  )
}
