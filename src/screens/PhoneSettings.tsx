// Settings → Phone, shown only in the Android app (src/native.ts): what the phone allows Gloop to do
// (Bluetooth, notifications, exact alarms, running in the background) with a button to fix each,
// and the on-device AI model.
import { useEffect, useState } from 'preact/hooks'
import { settings, saveSettings } from '../store'
import { Toggle } from '../ui/inputs'
import { toast } from '../ui/overlay'
import { aiDownload, aiStatus, phoneOpen, phoneRequest, phoneStatus, type AIStatus, type PhoneStatus } from '../native'

const MB = 1024 * 1024

function Row(p: { title: string; note: string; ok: boolean; action?: string; onAction?: () => void }) {
  return (
    <div class="setting">
      <span>
        {p.title}
        <small>{p.note}</small>
      </span>
      {!p.ok && p.action ? (
        <button class="btn btn-secondary btn-sm" onClick={p.onAction}>
          {p.action}
        </button>
      ) : (
        <span class="setting-value">{p.ok ? 'On' : 'Off'}</span>
      )}
    </div>
  )
}

export function PhoneSettings() {
  const [st, setSt] = useState<PhoneStatus | null>(null)
  const [ai, setAi] = useState<{ status: AIStatus; error?: string } | null>(null)
  const [bytes, setBytes] = useState<number | null>(null)

  const refresh = async () => {
    setSt((await phoneStatus()) ?? null)
    setAi(await aiStatus())
  }
  useEffect(() => {
    void refresh()
    // coming back from a system settings page
    const onVis = () => document.visibilityState === 'visible' && void refresh()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const ask = async (what: 'bluetooth' | 'notifications') => {
    const next = await phoneRequest(what)
    if (next) setSt(next)
    // asked before and refused: Android won't ask again, so open the app's settings
    if (next && next[what] !== 'granted') void phoneOpen(what === 'notifications' ? 'notifications' : 'app')
  }

  const download = async () => {
    setAi({ status: 'downloading' })
    setBytes(0)
    const s = await aiDownload((b) => setBytes(b))
    setBytes(null)
    setAi({ status: s })
    toast(s === 'available' ? 'On-device AI is ready' : 'The download didn’t finish. Try again on Wi-Fi.')
  }

  if (!st) return <p class="setting-note">Checking the phone…</p>

  const aiNote: Record<AIStatus, string> = {
    available: 'Gemini Nano on this phone writes the live coach’s extra line, no internet needed',
    downloadable: 'Gemini Nano can run on this phone. Download it once (about a gigabyte, best on Wi-Fi)',
    downloading: bytes ? `Downloading… ${Math.round(bytes / MB)} MB` : 'Downloading…',
    unavailable: 'Not on this phone or this build. The coach uses your server instead',
  }

  return (
    <div class="settings-group">
      <Row
        title="Nearby devices"
        note={st.bluetoothOn ? 'Finds and connects your heart rate strap' : 'Bluetooth is off'}
        ok={st.bluetooth === 'granted' && st.bluetoothOn}
        action={st.bluetooth !== 'granted' ? 'Allow' : 'Turn on'}
        onAction={() => (st.bluetooth !== 'granted' ? ask('bluetooth') : phoneOpen('bluetooth'))}
      />
      <Row title="Notifications" note="Heart rate, fasting and timers in the shade; timer and zone alerts" ok={st.notifications === 'granted'} action="Allow" onAction={() => ask('notifications')} />
      <Row
        title="Exact alarms"
        note={st.exactAlarms ? 'Rest and set timers ring on time with the screen locked' : 'Timers may ring a little late with the screen locked'}
        ok={st.exactAlarms}
        action="Allow"
        onAction={() => phoneOpen('exactAlarms')}
      />
      <Row
        title="Run in the background"
        note={st.batteryUnrestricted ? 'Battery optimisation is off for Gloop' : 'Allow it so long heart rate sessions aren’t cut off with the screen off'}
        ok={st.batteryUnrestricted}
        action="Allow"
        onAction={() => phoneOpen('battery')}
      />
      <div class="setting">
        <span>
          On-device AI
          <small>{ai ? aiNote[ai.status] : 'Checking…'}</small>
        </span>
        {ai?.status === 'downloadable' ? (
          <button class="btn btn-secondary btn-sm" onClick={download}>
            Download
          </button>
        ) : (
          <span class="setting-value">{ai?.status === 'available' ? 'Ready' : ai?.status === 'downloading' ? '…' : 'Off'}</span>
        )}
      </div>
      <p class="setting-note">
        {st.model ? `${st.model} · Android API ${st.sdk}. ` : ''}Gloop keeps the screen on during workouts; with the screen off, heart rate keeps recording in the background and catches up when you come back.
      </p>
    </div>
  )
}

/** Notifications → the live switches, in the app (no web push there; the app posts its own). */
export function NativeLiveSettings() {
  const st = settings.value
  return (
    <>
      <div class="setting">
        <span>
          Fasting in the notification shade
          <small>Time fasted and your goal while a fast runs, even with Gloop closed</small>
        </span>
        <Toggle label="Fasting in the notification shade" checked={st.liveFast !== false} onChange={(v) => saveSettings({ liveFast: v })} />
      </div>
      <div class="setting">
        <span>
          Heart rate in the notification shade
          <small>Bpm in the status bar and your zone during workouts</small>
        </span>
        <Toggle label="Heart rate in the notification shade" checked={st.liveHR !== false} onChange={(v) => saveSettings({ liveHR: v })} />
      </div>
      <p class="setting-note">Rest and set timers ring through the phone’s alarms. Server reminders (training days, eating window) need the installed web app; they don’t reach the Android app yet.</p>
    </>
  )
}
