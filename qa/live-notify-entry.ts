// Test bundle for qa/live-notify-ui.cjs: exposes liveNotify and the store on window.__t.
import * as live from '../src/liveNotify'
import { init, fasts, settings, saveSettings } from '../src/store'
import { startFast, endFast } from '../src/fasting'
import { route } from '../src/router'
;(window as unknown as { __t: unknown }).__t = { live, init, fasts, settings, saveSettings, startFast, endFast, route }
