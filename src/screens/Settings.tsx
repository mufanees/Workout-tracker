import { useState } from 'preact/hooks'
import { settings, saveSettings, reloadFromDb } from '../store'
import { back } from '../router'
import { syncState, syncNow, getToken, setToken } from '../sync'
import * as db from '../db'
import { Icon } from '../ui/icons'
import { Segmented, Toggle } from '../ui/inputs'
import { actionSheet, confirmDialog, toast } from '../ui/overlay'
import { REST_OPTIONS } from '../ui/WorkoutEditor'
import { fmtRest } from '../util'
import type { StoreName } from '../types'

const STATUS: Record<string, [string, string]> = {
  checking: ['Connecting…', 'muted'],
  syncing: ['Syncing…', 'muted'],
  synced: ['Synced', 'good'],
  offline: ['Offline · saved on this device', 'muted'],
  locked: ['Sync key needed', 'warn'],
  local: ['This device only', 'muted'],
  error: ['Sync problem', 'warn'],
}

export function SyncBadge() {
  const s = syncState.value.status
  if (s !== 'locked' && s !== 'error') return null
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
    await syncNow()
    setChecking(false)
    if (syncState.value.status === 'synced') {
      setKey('')
      toast('Connected. Your data is synced.')
    } else if (syncState.value.status === 'locked') toast('That key didn’t work')
  }

  const exportData = async () => {
    const data: Record<string, unknown[]> = {}
    for (const s of ['exercises', 'routines', 'workouts', 'settings'] as StoreName[]) data[s] = (await db.getAll(s)).filter((r) => !(r as { deleted?: boolean }).deleted)
    const blob = new Blob([JSON.stringify({ app: 'reps', version: 1, exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `reps-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const importData = async (file: File) => {
    try {
      const json = JSON.parse(await file.text())
      const data = json?.data as Record<StoreName, { id: string }[]> | undefined
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
      for (const s of ['exercises', 'routines', 'workouts', 'settings'] as StoreName[]) {
        for (const r of data[s] || []) {
          if (!r || typeof r.id !== 'string') continue
          items.push({ store: s, key: r.id, value: { ...r, updatedAt: now } })
          items.push({ store: 'dirty', key: `${s}:${r.id}`, value: { store: s, id: r.id } })
        }
      }
      await db.putMany(items)
      await reloadFromDb()
      void syncNow()
      toast(`Imported ${n} workouts`)
    } catch {
      toast('That file isn’t a Reps backup')
    }
  }

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
          <span>Keep screen on while training</span>
          <Toggle label="Keep screen on while training" checked={st.keepAwake} onChange={(v) => saveSettings({ keepAwake: v })} />
        </div>
        <div class="setting">
          <span>Show Comeback plan card</span>
          <Toggle label="Show Comeback plan card" checked={st.showPlan} onChange={(v) => saveSettings({ showPlan: v })} />
        </div>
        {'Notification' in window && (
          <div class="setting">
            <span>
              Rest notifications
              <small>When the app is in the background</small>
            </span>
            <Toggle
              label="Rest notifications"
              checked={Notification.permission === 'granted'}
              onChange={async () => {
                if (Notification.permission === 'granted') return toast('Turn notifications off in your phone’s settings')
                const p = await Notification.requestPermission()
                toast(p === 'granted' ? 'Notifications on' : 'Notifications are blocked for this app')
              }}
            />
          </div>
        )}
      </div>

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
      </div>

      <h2 class="section-title">Sync</h2>
      <div class="settings-group">
        <div class="setting">
          <span>Status</span>
          <span class={'sync-status ' + STATUS[sync.status][1]}>
            <span class="dot" /> {STATUS[sync.status][0]}
          </span>
        </div>
        {(sync.status === 'locked' || getToken()) && (
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
        )}
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
        <label class="setting">
          <span>Import backup</span>
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
      <p class="about">Reps · your data lives on this device{sync.status === 'synced' ? ' and your server' : ''}.</p>
    </div>
  )
}
