// Accounts in the app: sign in with Google, your account, the owner's People (invites, access),
// your Claude connector link, and the screen an invite link opens.
import { useEffect, useRef, useState } from 'preact/hooks'
import type { CoachPlan } from '../coach'
import { checkInvite, createInvite, googleClientId, inviteUrl, me, newConnectorLink, people, renderGoogleButton, revokeInvite, setAccess, setCoach, signIn, signOut, unsynced, type People } from '../account'
import { navigate } from '../router'
import { settings } from '../store'
import { syncState } from '../sync'
import { Icon } from '../ui/icons'
import { Toggle } from '../ui/inputs'
import { confirmDialog, toast } from '../ui/overlay'

const isDark = () => settings.value.theme === 'dark' || (settings.value.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
const firstName = (n: string) => n.split(' ')[0] || n
const dateFmt = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
})

async function copy(text: string, done = 'Copied') {
  try {
    await navigator.clipboard.writeText(text)
    toast(done)
  } catch {
    toast('Couldn’t copy. Press and hold to copy it instead.')
  }
}

/** Google's "Continue with Google" button. */
export function GoogleButton({ invite, onDone }: { invite?: string; onDone?: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!ref.current) return
    renderGoogleButton(
      ref.current,
      async (credential) => {
        setBusy(true)
        setError('')
        try {
          const u = await signIn(credential, invite)
          toast(`Signed in as ${firstName(u.name) || u.email}`)
          onDone?.()
        } catch (e) {
          setError((e as Error).message)
        } finally {
          setBusy(false)
        }
      },
      isDark(),
    ).catch((e) => setError((e as Error).message))
  }, [googleClientId.value, invite])
  return (
    <div class="google-signin">
      <div ref={ref} class={'google-btn' + (busy ? ' busy' : '')} />
      {busy && <p class="muted small">Signing you in…</p>}
      {error && <p class="signin-error">{error}</p>}
    </div>
  )
}

function Avatar({ src, name, size = 40 }: { src?: string; name: string; size?: number }) {
  const [broken, setBroken] = useState(false)
  return src && !broken ? (
    <img class="avatar" src={src} alt="" width={size} height={size} referrerpolicy="no-referrer" onError={() => setBroken(true)} />
  ) : (
    <span class="avatar avatar-letter" style={{ width: `${size}px`, height: `${size}px` }} aria-hidden="true">
      {(name || '?').slice(0, 1).toUpperCase()}
    </span>
  )
}

/** Settings → Account: who you are here, or the sign-in button. */
export function AccountSection({ keyFallback }: { keyFallback: preact.ComponentChildren }) {
  const user = me.value
  const [showKey, setShowKey] = useState(false)
  const out = async () => {
    const n = await unsynced()
    const ok = await confirmDialog({
      title: 'Sign out?',
      message:
        n && syncState.value.status !== 'synced'
          ? `${n} change${n === 1 ? '' : 's'} on this device haven’t reached the server yet and would be lost. Connect to the internet first if you can.`
          : 'Your log stays safe on the server. This device’s copy is cleared, so the next person to sign in here starts fresh.',
      confirm: 'Sign out',
      danger: !!n,
    })
    if (ok) await signOut()
  }
  if (user)
    return (
      <div class="settings-group">
        <div class="setting account-row">
          <Avatar src={user.picture} name={user.name} />
          <span class="grow">
            <b>{user.name || user.email}</b>
            <small>
              {user.email}
              {user.role === 'admin' ? ' · owner' : ''}
            </small>
          </span>
        </div>
        <button class="setting" onClick={out}>
          <span>Sign out</span>
          <Icon name="logout" size={18} />
        </button>
      </div>
    )
  return (
    <div class="settings-group">
      <div class="setting column signin-card">
        <span>
          <b>Sign in to back up and sync</b>
          <small>Your log is saved on this device until you sign in. New here? You need an invite link from the owner.</small>
        </span>
        <GoogleButton />
      </div>
      <button class="setting" onClick={() => setShowKey(!showKey)} aria-expanded={showKey}>
        <span>Use a sync key instead</span>
        <Icon name={showKey ? 'up' : 'down'} size={18} />
      </button>
      {showKey && keyFallback}
    </div>
  )
}

/** Settings → Claude connector: your personal link for importing plans and letting Claude read your log. */
export function ConnectorLink() {
  const user = me.value
  const [tok, setTok] = useState(user?.mcpToken || '')
  useEffect(() => setTok(user?.mcpToken || ''), [user?.mcpToken])
  if (!user || !tok) return null
  const url = `${location.origin}/mcp/${tok}`
  const rotate = async () => {
    const ok = await confirmDialog({
      title: 'Make a new link?',
      message: 'The old link stops working; anything using it (like Claude) needs the new one.',
      confirm: 'New link',
    })
    if (!ok) return
    const r = await newConnectorLink()
    setTok(r.mcpToken)
    me.value = { ...user, mcpToken: r.mcpToken }
    toast('New link made')
  }
  return (
    <div class="settings-group">
      <div class="setting column">
        <span>
          <b>Claude connector</b>
          <small>Add this as a custom connector in Claude to import plans and let Claude read your log. Keep it private: it opens your data.</small>
        </span>
        <div class="row gap connector-row">
          <code class="grow">{url.replace(/\/mcp\/(.{6}).*/, '/mcp/$1…')}</code>
          <button class="btn btn-secondary btn-sm" onClick={() => copy(url, 'Connector link copied')}>
            <Icon name="copy" size={16} /> Copy
          </button>
        </div>
      </div>
      <button class="setting" onClick={rotate}>
        <span>Make a new link</span>
        <Icon name="recycle" size={18} />
      </button>
    </div>
  )
}

/** Settings → People (the owner): invite links, who's in, and turning access off. */
export function PeopleSection() {
  const user = me.value
  const [data, setData] = useState<People | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const load = () =>
    people()
      .then(setData)
      .catch((e) => toast((e as Error).message))
  useEffect(() => {
    if (user?.role === 'admin') void load()
  }, [user?.id])
  if (user?.role !== 'admin') return null
  const invite = async () => {
    try {
      const r = await createInvite(note.trim() || undefined)
      const url = inviteUrl(r.code)
      setFresh(url)
      setNote('')
      void load()
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'Join me on Gloop',
            text: 'Here’s your invite to Gloop, my workout tracker:',
            url,
          })
          return
        } catch {
          /* closed the share sheet: the link is shown below */
        }
      }
      await copy(url, 'Invite link copied')
    } catch (e) {
      toast((e as Error).message)
    }
  }
  const members = (data?.users || []).filter((u) => u.role !== 'admin')
  const mine = data?.users.find((u) => u.role === 'admin')?.coach
  return (
    <>
      <h2 class="section-title">People</h2>
      {data?.coachDefaults && mine && (
        <p class="setting-note coach-month">
          Coach this month: <b>${data.coachMonth.toFixed(2)}</b> for everyone, ${mine.spent.toFixed(2)} of it yours. New people get {MODEL_NAME[data.coachDefaults.model]} ({data.coachDefaults.effort}),{' '}
          {data.coachDefaults.budget < 0 ? 'no budget limit' : `$${data.coachDefaults.budget} a month`} and {data.coachDefaults.opus} Opus planning sessions.
        </p>
      )}
      <div class="settings-group people">
        <div class="setting column">
          <span>
            <b>Invite someone</b>
            <small>They open the link and sign in with Google. Each link works once and lasts 14 days. Their log is private to them.</small>
          </span>
          <div class="row gap">
            <input class="grow" type="text" value={note} placeholder="Who’s it for? (optional)" onInput={(e) => setNote(e.currentTarget.value)} />
            <button class="btn btn-primary" onClick={invite}>
              <Icon name="invite" size={18} /> Invite
            </button>
          </div>
          {fresh && (
            <div class="row gap connector-row">
              <code class="grow">{fresh}</code>
              <button class="btn btn-secondary btn-sm" onClick={() => copy(fresh, 'Invite link copied')}>
                <Icon name="copy" size={16} /> Copy
              </button>
            </div>
          )}
        </div>
        {data?.invites.map((i) => (
          <div class="setting">
            <span>
              {i.note || 'Invite link'}
              <small>Not used yet · expires {dateFmt.format(new Date(i.expires))}</small>
            </span>
            <span class="row gap">
              <button class="icon-btn" aria-label="Copy invite link" onClick={() => copy(inviteUrl(i.code), 'Invite link copied')}>
                <Icon name="copy" size={18} />
              </button>
              <button
                class="icon-btn"
                aria-label="Cancel this invite"
                onClick={async () => {
                  await revokeInvite(i.code)
                  toast('Invite cancelled')
                  void load()
                }}
              >
                <Icon name="trash" size={18} />
              </button>
            </span>
          </div>
        ))}
        {members.map((u) => (
          <div class={'setting person' + (u.disabled ? ' off' : '')}>
            <Avatar src={u.picture} name={u.name} size={36} />
            <span class="grow">
              {u.name || u.email}
              <small>
                {u.email} · joined {dateFmt.format(new Date(u.created))}
                {data ? ` · coach ${u.coachToday}/${data.coachLimit} today` : ''}
              </small>
            </span>
            <Toggle
              label={`${u.name || u.email}: access`}
              checked={!u.disabled}
              onChange={async (on) => {
                if (!on) {
                  const ok = await confirmDialog({
                    title: `Turn off ${firstName(u.name) || 'their'} access?`,
                    message: 'They’re signed out everywhere and can’t sign back in. Their log is kept; turn access back on any time.',
                    confirm: 'Turn off',
                    danger: true,
                  })
                  if (!ok) return
                }
                await setAccess(u.id, !on)
                void load()
              }}
            />
            {data?.coachDefaults && u.coach && <PersonCoach id={u.id} plan={u.coach} defaults={data.coachDefaults} onSaved={load} />}
          </div>
        ))}
        {data && !members.length && !data.invites.length && <p class="setting-note">Nobody else yet. Invite a friend and their log stays private to them.</p>}
      </div>
    </>
  )
}

const MODEL_NAME: Record<string, string> = { haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus' }

/** One person's coach: what it has cost this month, and their model, effort, budget and Opus sessions. */
function PersonCoach({ id, plan, defaults, onSaved }: { id: string; plan: CoachPlan; defaults: People['coachDefaults']; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const save = async (patch: Record<string, string | number | null>) => {
    try {
      await setCoach(id, patch)
      onSaved()
    } catch (e) {
      toast((e as Error).message)
    }
  }
  const c = plan.custom || {}
  const budget = plan.budget < 0 ? 'no limit' : `$${plan.budgetSpent.toFixed(2)} of $${plan.budget}`
  const over = plan.budget >= 0 && plan.budgetSpent >= plan.budget
  return (
    <div class="person-coach">
      <button class="person-coach-sum" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon name="coach" size={15} />
        <span class="person-coach-text">
          {MODEL_NAME[plan.model]} · {plan.effort} · {budget}
          {over ? ' · on Haiku' : ''} · Opus {plan.opusUsed}/{plan.opus}
        </span>
        <Icon name="down" size={15} class={open ? 'chev open' : 'chev'} />
      </button>
      {open && (
        <div class="person-coach-edit">
          <label>
            <span>Model</span>
            <select value={c.model || ''} onChange={(e) => save({ model: e.currentTarget.value || null })}>
              <option value="">Default ({MODEL_NAME[defaults.model]})</option>
              <option value="haiku">Haiku</option>
              <option value="sonnet">Sonnet</option>
              <option value="opus">Opus (full model)</option>
            </select>
          </label>
          <label>
            <span>Effort</span>
            <select value={c.effort || ''} onChange={(e) => save({ effort: e.currentTarget.value || null })}>
              <option value="">Default ({defaults.effort})</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
            </select>
          </label>
          <label>
            <span>Budget a month</span>
            <select
              value={c.budget == null ? '' : c.budget < 0 ? '-1' : String(c.budget)}
              onChange={(e) => save({ budget: e.currentTarget.value === '' ? null : Number(e.currentTarget.value) })}
            >
              <option value="">Default ({defaults.budget < 0 ? 'no limit' : `$${defaults.budget}`})</option>
              {[1, 2, 5, 10, 20, 50].map((n) => (
                <option value={String(n)}>${n}</option>
              ))}
              {c.budget != null && c.budget >= 0 && ![1, 2, 5, 10, 20, 50].includes(c.budget) && <option value={String(c.budget)}>${c.budget}</option>}
              <option value="-1">No limit</option>
            </select>
          </label>
          <label>
            <span>Opus planning sessions</span>
            <select value={c.opus == null ? '' : String(c.opus)} onChange={(e) => save({ opus: e.currentTarget.value === '' ? null : Number(e.currentTarget.value) })}>
              <option value="">Default ({defaults.opus} a month)</option>
              {[0, 1, 3, 5, 10, 20].map((n) => (
                <option value={String(n)}>{n} a month</option>
              ))}
            </select>
          </label>
          <small class="person-coach-note">
            ${plan.spent.toFixed(2)} this month
            {Object.entries(plan.byModel).length
              ? `: ${Object.entries(plan.byModel)
                  .map(([m, v]) => `${MODEL_NAME[m.replace('claude-', '').split('-')[0]] || m} $${v.usd.toFixed(2)} (${v.requests})`)
                  .join(', ')}`
              : ''}
            . Past the budget, answers come from Haiku; Opus sessions are separate, up to ${defaults.opusCap} each.
          </small>
        </div>
      )}
    </div>
  )
}

/** /join/<code>: the page an invite link opens. */
export function JoinScreen({ code }: { code: string }) {
  const [state, setState] = useState<'checking' | 'ok' | 'used' | 'expired' | 'missing'>('checking')
  useEffect(() => {
    checkInvite(code)
      .then((r) => setState(r.ok ? 'ok' : (r.reason as 'used' | 'expired' | 'missing') || 'missing'))
      .catch(() => setState('missing'))
  }, [code])
  const user = me.value
  return (
    <div class="screen join-screen">
      <img class="join-icon" src="/icon-192.png" alt="" width={96} height={96} />
      <h1>You’re invited to Gloop</h1>
      {user ? (
        <>
          <p class="muted">You’re already signed in as {user.name || user.email}.</p>
          <button class="btn btn-primary btn-block" onClick={() => navigate('/train', { replace: true })}>
            Open Gloop
          </button>
        </>
      ) : state === 'checking' ? (
        <p class="muted">Checking your invite…</p>
      ) : state === 'ok' ? (
        <>
          <p class="muted">A gooey little workout tracker for lifting, cardio and fasting, with a coach. Your log is private to you.</p>
          {googleClientId.value ? <GoogleButton invite={code} onDone={() => navigate('/train', { replace: true })} /> : <p class="muted">This server isn’t set up for sign-in yet.</p>}
        </>
      ) : (
        <>
          <p class="muted">{state === 'used' ? 'This invite has already been used.' : state === 'expired' ? 'This invite has expired.' : 'This invite link isn’t valid.'} Ask for a new one.</p>
          <p class="muted small">Already joined? Sign in from Settings.</p>
          <button class="btn btn-secondary btn-block" onClick={() => navigate('/settings', { replace: true })}>
            Go to Settings
          </button>
        </>
      )}
    </div>
  )
}

/** A small card on Train when this server has accounts and nobody is signed in on this device. */
export function SignInNudge() {
  if (!googleClientId.value || me.value || syncState.value.status === 'synced') return null
  return (
    <button class="card signin-nudge" onClick={() => navigate('/settings')}>
      <Icon name="cloud" size={20} />
      <span class="grow">
        <b>Sign in to back up your log</b>
        <small>It’s only on this phone until you do.</small>
      </span>
      <Icon name="right" size={18} />
    </button>
  )
}
