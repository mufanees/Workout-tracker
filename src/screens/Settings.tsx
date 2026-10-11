import { useEffect, useState } from 'preact/hooks'
import { Collapse } from '../ui/Collapse'
import { settings, saveSettings, reloadFromDb, workouts, routines, exercises } from '../store'
import { back } from '../router'
import { syncState, syncNow, getToken, setToken } from '../sync'
import * as db from '../db'
import { Icon } from '../ui/icons'
import { Segmented, Toggle } from '../ui/inputs'
import { AccentPicker, GooSettings } from './GooSettings'
import { actionSheet, confirmDialog, Sheet, toast } from '../ui/overlay'
import { REST_OPTIONS } from '../ui/WorkoutEditor'
import { fmtRest } from '../util'
import { budgetOf, type Budget } from '../../shared/budget.mjs'
import { QuoteText } from '../ui/Quote'
import { disablePush, enablePush, pushOn, pushSupported } from '../push'
import { scheduleTrainingReminder } from '../workout'
import { notifyAllowed, resetLiveDismissed } from '../liveNotify'
import { connectHR, disconnectHR, hrName, hrStatus, hrSupported, ZONE_COLORS, ZONE_NAMES, zoneRange } from '../hr'
import type { StoreName } from '../types'
import { isNative } from '../native'
import { NativeLiveSettings, PhoneSettings } from './PhoneSettings'
import { sanitize } from '../validate'
import { googleClientId } from '../account'
import { AccountSection, ConnectorLink, PeopleSection } from './Account'
import { BUILD, buildState, checkBuild, updateApp, versionLabel } from '../version'
import { checkCoach, coachMode, coachProblemText, coachStatus, coachTest, runCoachTest } from '../coach'

const STATUS: Record<string, [string, string]> = {
  checking: ['Connecting…', 'muted'],
  syncing: ['Syncing…', 'muted'],
  synced: ['Synced', 'good'],
  offline: ['Offline · saved on this device', 'muted'],
  locked: ['Sync key needed', 'warn'],
  signin: ['Not signed in', 'warn'],
  local: ['This device only', 'muted'],
  error: ['Sync problem', 'warn'],
  cloud: ['Saved to your Claude account', 'good'],
}

const statusOf = (s: string) => STATUS[s === 'locked' && googleClientId.value ? 'signin' : s]

export function SyncBadge() {
  const s = syncState.value.status
  // with accounts, the sign-in card on Train says it instead
  if ((s !== 'locked' || googleClientId.value) && s !== 'error') return null
  return (
    <a class="sync-badge" href="#/settings">
      <Icon name="cloud" size={14} /> {STATUS[s][0]}
    </a>
  )
}

export function Settings() {
  const st = settings.value
  const sync = syncState.value
  const [key, setKey] = useState('')
  const [checking, setChecking] = useState(false)

  const connect = async () => {
    setChecking(true)
    setToken(key.trim())
    await syncNow() // waits for any sync already in flight, then one with the new key
    setChecking(false)
    if (syncState.value.status === 'synced') {
      setKey('')
      toast('Connected. Your data is synced.')
    } else if (syncState.value.status === 'locked') toast('That key didn’t work')
  }

  // Built ahead of time so "Copy backup" can write to the clipboard inside the tap itself (Safari requires it).
  const [backup, setBackup] = useState('')
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')
  useEffect(() => {
    void buildBackup().then(setBackup)
  }, [workouts.value, routines.value, exercises.value])

  const copyBackup = () => {
    if (!backup) return
    navigator.clipboard
      .writeText(backup)
      .then(() => toast('Backup copied. Paste it into a note to keep it safe.'))
      .catch(() => toast('Couldn’t copy. Use Export backup instead.'))
  }

  const exportData = async () => {
    const name = `gloop-backup-${new Date().toISOString().slice(0, 10)}.json`
    const json = await buildBackup()
    // Installed iOS apps can't download blobs; the share sheet lets you save to Files instead.
    const file = new File([json], name, { type: 'application/json' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Gloop backup' })
        return
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
      }
    }
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const importData = async (file: File) => importText(await file.text())

  const importText = async (text: string) => {
    try {
      const json = JSON.parse(text)
      let data = json?.data as Record<StoreName, { id: string }[]> | undefined
      // Also accept the server's /api/export format: { records: [{ store, id, data }] }
      if (!data && Array.isArray(json?.records)) {
        data = { exercises: [], routines: [], workouts: [], settings: [], body: [], fasts: [], readings: [], coach: [], days: [] }
        for (const r of json.records) if (r && data[r.store as StoreName]) data[r.store as StoreName].push({ ...r.data, id: r.id })
      }
      if (!data || typeof data !== 'object') throw new Error('bad file')
      const n = (data.workouts || []).length
      const ok = await confirmDialog({
        title: 'Import backup?',
        message: `${n} workouts and ${(data.routines || []).length} routines. Records with the same ID are replaced; everything else is kept.`,
        confirm: 'Import',
      })
      if (!ok) return
      const now = Date.now()
      const items: { store: db.Store; key: string; value: unknown }[] = []
      for (const s of ['exercises', 'routines', 'workouts', 'settings', 'body', 'fasts', 'readings', 'coach', 'days'] as StoreName[]) {
        for (const raw of Array.isArray(data[s]) ? data[s] : []) {
          const r = sanitize(s, raw)
          if (!r || r.deleted) continue
          items.push({ store: s, key: r.id as string, value: { ...r, updatedAt: now } })
          items.push({ store: 'dirty', key: `${s}:${r.id as string}`, value: { store: s, id: r.id } })
        }
      }
      await db.putMany(items)
      await reloadFromDb()
      void syncNow()
      toast(`Imported ${n} workouts`)
    } catch {
      toast('That file isn’t a Gloop backup')
    }
  }

  const keyInput = (
    <div class="setting column">
      <label class="field" style={{ margin: 0 }}>
        <span>{getToken() && sync.status !== 'locked' ? 'Change sync key' : 'Sync key'}</span>
        <div class="row gap">
          <input
            type="password"
            class="grow"
            value={key}
            placeholder="The APP_TOKEN from your server"
            autoComplete="current-password"
            onInput={(e) => setKey(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && key && connect()}
          />
          <button class="btn btn-primary" onClick={connect} disabled={!key.trim() || checking}>
            {checking ? '…' : 'Connect'}
          </button>
        </div>
      </label>
    </div>
  )
  return (
    <div class="screen">
      <header class="page-head sub">
        <button class="icon-btn" onClick={() => back('/train')} aria-label="Back">
          <Icon name="left" />
        </button>
        <span class="page-title">Settings</span>
        <span class="icon-btn" aria-hidden="true" />
      </header>

      <h2 class="section-title">Workout</h2>
      <div class="settings-group">
        <div class="setting">
          <span>Units</span>
          <Segmented label="Units" value={st.unit} options={[['kg', 'kg'], ['lb', 'lb']]} onChange={(v) => saveSettings({ unit: v })} />
        </div>
        <div class="setting">
          <span>
            Dumbbell pairs
            <small>{(st.weightView ?? 'total') === 'total' ? 'Both dumbbells together: two 6s = 12' : 'One dumbbell: two 6s = 6'}</small>
          </span>
          <Segmented label="Dumbbell pairs" value={st.weightView ?? 'total'} options={[['total', 'Total'], ['each', 'Each']]} onChange={(v) => saveSettings({ weightView: v })} />
        </div>
        <button
          class="setting"
          onClick={() =>
            actionSheet({
              title: 'Default rest timer',
              message: 'Used for exercises you add. Each exercise can have its own.',
              actions: REST_OPTIONS.map((r) => ({ label: fmtRest(r), selected: r === st.defaultRest, onSelect: () => saveSettings({ defaultRest: r }) })),
            })
          }
        >
          <span>Default rest</span>
          <span class="setting-value">
            {fmtRest(st.defaultRest)} <Icon name="right" size={16} />
          </span>
        </button>
        <div class="setting">
          <span>Sound when rest ends</span>
          <Toggle label="Sound when rest ends" checked={st.sound} onChange={(v) => saveSettings({ sound: v })} />
        </div>
        <div class="setting">
          <span>
            Time budget on the workout screen
            <small>Planned minutes and whether you’re on pace</small>
          </span>
          <Toggle label="Time budget on the workout screen" checked={st.showPace !== false} onChange={(v) => saveSettings({ showPace: v })} />
        </div>
        <div class="setting">
          <span>Keep screen on while training</span>
          <Toggle label="Keep screen on while training" checked={st.keepAwake} onChange={(v) => saveSettings({ keepAwake: v })} />
        </div>
        <div class="setting">
          <span>
            Show program card on Train
            <small>More in Train → Customize home</small>
          </span>
          <Toggle
            label="Show program card on Train"
            checked={st.showPlan && !st.home?.hidden?.includes('program')}
            onChange={(v) => {
              const hidden = (st.home?.hidden || []).filter((x) => x !== 'program')
              void saveSettings({ showPlan: v, home: { ...st.home, hidden: v ? hidden : [...hidden, 'program'] } })
            }}
          />
        </div>
        <div class="setting">
          <span>
            Shoulder check-in
            <small>Rate stiffness 0–10 when you finish</small>
          </span>
          <Toggle label="Shoulder check-in" checked={st.askShoulder} onChange={(v) => saveSettings({ askShoulder: v })} />
        </div>
      </div>

      <h2 class="section-title">Training</h2>
      <BudgetSettings />

      <h2 class="section-title">Motivation</h2>
      <QuoteSettings />

      <h2 class="section-title">Coach</h2>
      <CoachSettings />

      <h2 class="section-title">Notifications</h2>
      <div class="settings-group">
        {pushSupported ? (
          <>
            <div class="setting">
              <span>
                Notifications
                <small>Rest over, fast complete and training days, even with the app closed</small>
              </span>
              <Toggle label="Notifications" checked={pushOn.value} onChange={async (v) => (v ? toast(await enablePush()) : void disablePush())} />
            </div>
            <div class="setting">
              <span>
                Training-day reminder
                <small>{st.reminderTime ? 'Every other day on the plan, otherwise daily' : 'Off'}</small>
              </span>
              <input
                id="reminder-time"
                class="time-input"
                type="time"
                value={st.reminderTime || ''}
                disabled={!pushOn.value}
                aria-label="Reminder time"
                onChange={async (e) => {
                  await saveSettings({ reminderTime: e.currentTarget.value || null })
                  scheduleTrainingReminder()
                }}
              />
            </div>
            {(pushOn.value || notifyAllowed()) && (
              <>
                <div class="setting">
                  <span>
                    Fasting in the notification shade
                    <small>Time fasted and your goal while a fast runs</small>
                  </span>
                  <Toggle
                    label="Fasting in the notification shade"
                    checked={st.liveFast !== false}
                    onChange={async (v) => {
                      await saveSettings({ liveFast: v })
                      if (v) void resetLiveDismissed()
                    }}
                  />
                </div>
                <div class="setting">
                  <span>
                    Heart rate in the notification shade
                    <small>Bpm and zone while Gloop is in the background</small>
                  </span>
                  <Toggle
                    label="Heart rate in the notification shade"
                    checked={st.liveHR !== false}
                    onChange={async (v) => {
                      await saveSettings({ liveHR: v })
                      if (v) void resetLiveDismissed()
                    }}
                  />
                </div>
                <p class="setting-note">
                  Android lets you swipe these away. They update while Gloop runs in the background; the fasting one also every 15 minutes when it’s closed.
                </p>
              </>
            )}
          </>
        ) : isNative ? (
          <NativeLiveSettings />
        ) : (
          <p class="setting-note">Notifications work in the installed app from your server (Chrome on Android, or Safari on iPhone after Add to Home Screen).</p>
        )}
      </div>

      <h2 class="section-title">Heart rate</h2>
      <HRSettings />

      {isNative && (
        <>
          <h2 class="section-title">Phone</h2>
          <PhoneSettings />
        </>
      )}

      <h2 class="section-title">Appearance</h2>
      <div class="settings-group">
        <div class="setting">
          <span>Theme</span>
          <Segmented
            label="Theme"
            value={st.theme}
            options={[
              ['system', 'Auto'],
              ['light', 'Light'],
              ['dark', 'Dark'],
            ]}
            onChange={(v) => saveSettings({ theme: v })}
          />
        </div>
        <AccentPicker />
      </div>

      <AnimationSettings />

      {googleClientId.value && (
        <>
          <h2 class="section-title">Account</h2>
          <AccountSection keyFallback={keyInput} />
          <ConnectorLink />
          <PeopleSection />
        </>
      )}

      <h2 class="section-title">Sync</h2>
      <div class="settings-group">
        <div class="setting">
          <span>Status</span>
          <span class={'sync-status ' + statusOf(sync.status)[1]}>
            <span class="dot" /> {statusOf(sync.status)[0]}
          </span>
        </div>
        {!googleClientId.value && (sync.status === 'locked' || getToken()) && keyInput}
        {sync.status !== 'local' && (
          <button class="setting" onClick={() => syncNow().then(() => syncState.value.status === 'synced' && toast('Up to date'))}>
            <span>Sync now</span>
            <span class="setting-value">{sync.at ? new Date(sync.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</span>
          </button>
        )}
        {sync.status === 'local' && <p class="setting-note">No sync server found. Everything is saved on this device. Deploy the server (see README) to back up and sync.</p>}
        {sync.status === 'error' && sync.message && <p class="setting-note">{sync.message}</p>}
      </div>

      <h2 class="section-title">Data</h2>
      <div class="settings-group">
        <button class="setting" onClick={exportData}>
          <span>Export backup</span>
          <Icon name="download" size={18} />
        </button>
        <button class="setting" onClick={copyBackup} disabled={!backup}>
          <span>
            Copy backup
            <small>Paste it into a note or message to keep it</small>
          </span>
          <Icon name="copy" size={18} />
        </button>
        <button class="setting" onClick={() => (setPasted(''), setPasting(true))}>
          <span>Paste a backup</span>
          <Icon name="note" size={18} />
        </button>
        <label class="setting">
          <span>Import backup file</span>
          <Icon name="upload" size={18} />
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.currentTarget.files?.[0]
              if (f) void importData(f)
              e.currentTarget.value = ''
            }}
          />
        </label>
      </div>
      <Sheet
        open={pasting}
        onClose={() => setPasting(false)}
        title="Paste a backup"
        footer={
          <button
            class="btn btn-primary btn-block"
            disabled={!pasted.trim()}
            onClick={() => {
              setPasting(false)
              void importText(pasted)
            }}
          >
            Import
          </button>
        }
      >
        <label class="field">
          <span>Backup text (from Copy backup)</span>
          <textarea id="paste-backup" rows={8} value={pasted} onInput={(e) => setPasted(e.currentTarget.value)} placeholder='{"app":"reps", ...}' />
        </label>
      </Sheet>
      <h2 class="section-title">About</h2>
      <VersionGroup />
      <p class="about">Gloop · your data lives on this device{sync.status === 'synced' ? ' and your server' : ''}.</p>
    </div>
  )
}

async function buildBackup(): Promise<string> {
  const data: Record<string, unknown[]> = {}
  for (const s of ['exercises', 'routines', 'workouts', 'settings', 'body', 'fasts', 'readings', 'coach', 'days'] as StoreName[]) data[s] = (await db.getAll(s)).filter((r) => !(r as { deleted?: boolean }).deleted)
  return JSON.stringify({ app: 'reps', version: 1, exportedAt: new Date().toISOString(), data })
}

function HRSettings() {
  const st = settings.value
  const status = hrStatus.value
  const [draft, setDraft] = useState<string[]>(st.hrZones.map(String))
  useEffect(() => setDraft(st.hrZones.map(String)), [st.hrZones.join()])

  const commit = () => {
    const nums = draft.map((v) => Math.round(Number(v)))
    const ok = nums.every((n, i) => Number.isFinite(n) && n > 40 && n < 230 && (i === 0 || n > nums[i - 1]))
    if (!ok) {
      setDraft(st.hrZones.map(String))
      return toast('Each zone has to end higher than the one before')
    }
    if (nums.join() !== st.hrZones.join()) void saveSettings({ hrZones: nums as [number, number, number, number] })
  }

  return (
    <div class="settings-group">
      {hrSupported ? (
        <div class="setting">
          <span>
            {status === 'off' ? 'Heart rate strap' : hrName.value}
            <small>
              {status === 'connected' ? 'Connected' : status === 'reconnecting' ? 'Reconnecting…' : status === 'connecting' ? 'Looking…' : 'Garmin HRM-Dual or any Bluetooth strap'}
            </small>
          </span>
          {status === 'off' || status === 'connecting' ? (
            <button class="btn btn-secondary btn-sm" disabled={status === 'connecting'} onClick={() => connectHR().then((ok) => ok && toast(`Connected to ${hrName.value}`))}>
              Connect
            </button>
          ) : (
            <button class="btn btn-secondary btn-sm" onClick={disconnectHR}>
              Disconnect
            </button>
          )}
        </div>
      ) : (
        <p class="setting-note">Heart rate straps connect over Bluetooth, which works in Chrome on Android. This browser doesn’t support it.</p>
      )}
      <div class="setting column">
        <span>Zones (bpm)</span>
        <div class="zone-editor">
          {[1, 2, 3, 4, 5].map((z) => (
            <div class="ze-row">
              <i style={{ background: ZONE_COLORS[z - 1] }} />
              <span class="ze-name">
                Zone {z} <small>{ZONE_NAMES[z - 1]}</small>
              </span>
              {z < 5 ? (
                <label class="ze-input">
                  <span>{z === 1 ? 'up to' : `${Number(draft[z - 2]) + 1 || '…'} to`}</span>
                  <input
                    id={`zone-${z}`}
                    type="text"
                    inputMode="numeric"
                    value={draft[z - 1]}
                    aria-label={`Zone ${z} top bpm`}
                    onInput={(e) => {
                      const next = [...draft]
                      next[z - 1] = e.currentTarget.value.replace(/\D/g, '')
                      setDraft(next)
                    }}
                    onBlur={commit}
                  />
                </label>
              ) : (
                <span class="ze-range">{zoneRange(5, draft.map(Number) as [number, number, number, number])}</span>
              )}
            </div>
          ))}
        </div>
      </div>
      <button
        class="setting"
        onClick={() =>
          actionSheet({
            title: 'Target zone for workouts',
            message: 'Zone 2 cardio always targets zone 2. This sets the target for other workouts.',
            actions: [
              { label: 'None (just show zones)', selected: !st.targetZone, onSelect: () => saveSettings({ targetZone: null }) },
              ...[1, 2, 3, 4, 5].map((n) => ({ label: `Zone ${n} · ${ZONE_NAMES[n - 1]}`, hint: zoneRange(n), selected: st.targetZone === n, onSelect: () => saveSettings({ targetZone: n }) })),
            ],
          })
        }
      >
        <span>Target zone for strength</span>
        <span class="setting-value">
          {st.targetZone ? `Zone ${st.targetZone}` : 'None'} <Icon name="right" size={16} />
        </span>
      </button>
    </div>
  )
}

function QuoteSettings() {
  const st = settings.value
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [author, setAuthor] = useState('')
  const [open, setOpen] = useState(false)
  const quotes = st.quotes || []
  const save = async () => {
    const t = text.trim()
    if (!t) return
    await saveSettings({ quotes: [...quotes, { text: t, author: author.trim() || undefined, tag: 'Mine' }] })
    setText('')
    setAuthor('')
    setAdding(false)
    toast('Quote added')
  }
  return (
    <div class="settings-group">
      <div class="setting">
        <span>
          Show quotes
          <small>On Train, after workouts and in reminders</small>
        </span>
        <Toggle label="Show quotes" checked={st.showQuotes} onChange={(v) => saveSettings({ showQuotes: v })} />
      </div>
      <button class="setting" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>Your quotes</span>
        <span class="setting-value">
          {quotes.length} <Icon name="down" size={16} class={'chev' + (open ? ' open' : '')} />
        </span>
      </button>
      <Collapse open={open}>
        <div class="setting column">
          <p class="field-hint">Write a word in CAPITALS to make it stand out.</p>
          <ul class="quote-list">
            {quotes.map((q, i) => (
              <li>
                <span>
                  <QuoteText text={q.text} />
                  {q.author && <small> — {q.author}</small>}
                </span>
                <button
                  class="icon-btn sm"
                  aria-label="Delete quote"
                  onClick={async () => {
                    const next = quotes.filter((_, j) => j !== i)
                    await saveSettings({ quotes: next })
                    toast('Quote removed', { label: 'Undo', run: () => void saveSettings({ quotes }) })
                  }}
                >
                  <Icon name="trash" size={16} />
                </button>
              </li>
            ))}
          </ul>
          {adding ? (
            <div class="stack">
              <textarea id="new-quote" rows={3} value={text} placeholder="KEEP SHOWING UP!" onInput={(e) => setText(e.currentTarget.value)} class="input-like autotext" />
              <input id="new-quote-author" type="text" value={author} placeholder="Who said it (optional)" onInput={(e) => setAuthor(e.currentTarget.value)} class="plain-input" />
              <div class="row gap">
                <button class="btn btn-secondary grow" onClick={() => setAdding(false)}>
                  Cancel
                </button>
                <button class="btn btn-primary grow" onClick={save} disabled={!text.trim()}>
                  Add quote
                </button>
              </div>
            </div>
          ) : (
            <button class="btn btn-secondary btn-block" onClick={() => setAdding(true)}>
              <Icon name="plus" size={18} /> Add a quote
            </button>
          )}
        </div>
      </Collapse>
    </div>
  )
}

/** Which API the coach runs on, whether it works, and a one-tap real test. */
function CoachSettings() {
  const [testing, setTesting] = useState(false)
  useEffect(() => {
    void checkCoach()
  }, [])
  const s = coachStatus.value
  const t = coachTest.value
  const problem = coachProblemText()
  const ago = (at: number) => {
    const m = Math.round((Date.now() - at) / 60000)
    return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : new Date(at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
  }
  if (coachMode.value === 'claude')
    return (
      <div class="settings-group">
        <p class="setting-note">The coach runs on Claude here (inside the Claude app), so there’s nothing to set up.</p>
      </div>
    )
  const state = !s ? 'Checking…' : problem ? problem.title : t?.ok ? `working (${(t.ms / 1000).toFixed(1)} s)` : s.lastOk ? 'working' : 'not tested yet'
  const tone = !s ? '' : problem ? 'bad' : t?.ok || s.lastOk ? 'good' : ''
  const test = async () => {
    setTesting(true)
    try {
      const r = await runCoachTest()
      toast(r.ok ? `Coach answered in ${(r.ms / 1000).toFixed(1)} s` : 'The coach test failed')
    } finally {
      setTesting(false)
    }
  }
  return (
    <div class="settings-group coach-health">
      <div class="setting">
        <span>
          {s?.label || 'Coach'}
          {s?.model ? ` · ${s.model}` : ''}
          <small>
            {s?.planModel && s.planModel !== s.model ? `Planning and weekly review: ${s.planModel}` : s?.reach === 'ok' ? 'Chat, targets, takeaways and weekly review' : ''}
            {s?.todayCalls ? ` · ${s.todayCalls} API call${s.todayCalls === 1 ? '' : 's'} today` : ''}
          </small>
        </span>
        <span class={'coach-state ' + tone}>
          <span class="dot" /> {state}
        </span>
      </div>
      {problem && <p class="setting-note coach-problem">{problem.detail}</p>}
      {s?.reach === 'ok' && s.enabled && (
        <button class="setting" onClick={test} disabled={testing}>
          <span>
            Test coach
            <small>Sends one tiny message (“Reply with OK”) through your server</small>
          </span>
          {testing ? <span class="spinner" aria-label="Testing" /> : <Icon name="right" size={18} />}
        </button>
      )}
      {t && !t.ok && t.error && (!problem || t.error !== problem.detail) && <p class="setting-note coach-problem">Test: {t.error}</p>}
      {t?.ok && t.reply && <p class="setting-note">Test reply: “{t.reply}”</p>}
      {s?.lastError && (
        <p class="setting-note">
          Last error ({ago(s.lastError.at)}
          {s.lastError.status ? `, HTTP ${s.lastError.status}` : ''}){problem?.detail === s.lastError.message ? '' : `: ${s.lastError.message}`}
          {s.lastOk && s.lastOk > s.lastError.at ? ` Working again since ${ago(s.lastOk)}.` : ''}
        </p>
      )}
    </div>
  )
}

/** Settings → Training → Time budget: total, warm-up and cool-down minutes every workout is planned to. */
function BudgetSettings() {
  const b = budgetOf(settings.value.timeBudget)
  const set = (patch: Partial<Budget>) => {
    const next = { ...b, ...patch }
    // the warm-up and cool-down always leave at least 5 minutes of lifting
    if (next.warmup + next.cooldown > next.total - 5) {
      if (patch.total != null) next.total = next.warmup + next.cooldown + 5
      else return
    }
    void saveSettings({ timeBudget: next })
  }
  const rows: [keyof Budget, string, string, number, number, number][] = [
    ['total', 'Whole workout', 'Warm-up and cool-down included', 15, 60, 5],
    ['warmup', 'Warm-up', 'Part of the whole', 0, 15, 1],
    ['cooldown', 'Cool-down', 'Part of the whole', 0, 15, 1],
  ]
  return (
    <div class="settings-group budget-settings">
      <p class="budget-intro">
        Time budget: every routine is planned to fit {b.total} min, {b.total - b.warmup - b.cooldown} of them lifting. Over it? The routine editor and the workout offer to fit it: heavier sets of fewer reps, supersets, shorter rests.
      </p>
      {rows.map(([k, label, hint, min, max, step]) => (
        <div class="setting">
          <span>
            {label}
            <small>{hint}</small>
          </span>
          <div class="stepper">
            <button class="icon-btn step" aria-label={`${label}: ${step} min less`} disabled={b[k] <= min} onClick={() => set({ [k]: Math.max(min, b[k] - step) })}>
              <Icon name="minus" />
            </button>
            <b aria-live="polite">{b[k]} min</b>
            <button class="icon-btn step" aria-label={`${label}: ${step} min more`} disabled={b[k] >= max} onClick={() => set({ [k]: Math.min(max, b[k] + step) })}>
              <Icon name="plus" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Goo and motion tweaks, folded away: the live preview is distracting while you're changing other settings. */
function AnimationSettings() {
  const [open, setOpen] = useState(false)
  return (
    <section class={'settings-fold' + (open ? ' open' : '')}>
      <button class="settings-fold-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>
          Animation
          <small>Goo effects and motion</small>
        </span>
        <Icon name="down" size={18} class={'chev' + (open ? ' open' : '')} />
      </button>
      <Collapse open={open}>
        <GooSettings />
      </Collapse>
    </section>
  )
}

/** Which build is running, and a reload when the server has a newer one. */
function VersionGroup() {
  useEffect(() => void checkBuild(), [])
  const st = buildState.value
  const built = new Date(BUILD.time).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return (
    <div class="settings-group">
      <div class="setting">
        <span>
          Version
          <small>Built {built}</small>
        </span>
        <span class="setting-value version-id">{versionLabel}</span>
      </div>
      {st === 'update' ? (
        <button class="setting" onClick={() => void updateApp()}>
          <span>
            Update available
            <small>Reload to get the latest build</small>
          </span>
          <span class="sync-status warn">
            <Icon name="refresh" size={18} />
          </span>
        </button>
      ) : (
        <button class="setting" onClick={() => void checkBuild()}>
          <span>{st === 'latest' ? 'Up to date' : st === 'checking' ? 'Checking…' : 'Couldn’t check for updates'}</span>
          <span class={'sync-status ' + (st === 'latest' ? 'good' : 'muted')}>
            <span class="dot" /> {st === 'latest' ? 'Latest' : 'Check'}
          </span>
        </button>
      )}
    </div>
  )
}
