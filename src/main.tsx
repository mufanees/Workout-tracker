import { render } from 'preact'
import { App } from './App'
import { init } from './store'
import { startAutoSync } from './sync'
import { loadAccount } from './account'
import { handleShare, takeShare } from './share'
import { reconnectSaved } from './hr'
import { scheduleTrainingReminder } from './workout'
import { startLiveNotifications } from './liveNotify'
import '@fontsource-variable/space-grotesk/wght.css'
import '@fontsource-variable/inter/opsz.css'
import './styles.css'

takeShare()
render(<App />, document.getElementById('app')!)

init()
  .then(() => {
    startAutoSync()
    void loadAccount()
    handleShare()
    void reconnectSaved()
    scheduleTrainingReminder()
    startLiveNotifications()
  })
  .catch((e) => {
    console.error(e)
    document.getElementById('app')!.innerHTML =
      '<p style="padding:24px;font:16px system-ui">Couldn’t open local storage. If you’re in private browsing, switch to a normal window.</p>'
  })

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
