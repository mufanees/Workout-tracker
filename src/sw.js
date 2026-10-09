/* Service worker. Built by vite.config.js, which fills in the version and file list. */
const VERSION = '__VERSION__'
const PRECACHE = __PRECACHE__
const CACHE = 'reps-' + VERSION

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('reps-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return

  // App shell: serve the cached page instantly, refresh it in the background.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match('./')
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put('./', res.clone())
            return res
          })
          .catch(() => cached)
        return cached || network
      }),
    )
    return
  }

  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok && url.pathname.startsWith('/assets/')) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})

// Text and badge drawing for live notifications (shared/live.mjs, pasted in at build time).
/* __LIVE__ */

// Which live notification the owner swiped away (kept in the Cache API so the page can read it too).
const LIVE_CACHE = 'gloop-live'
const DISMISSED = '/__live/dismissed'
async function readDismissed() {
  try {
    const r = await (await caches.open(LIVE_CACHE)).match(DISMISSED)
    return r ? await r.json() : {}
  } catch {
    return {}
  }
}
async function writeDismissed(patch) {
  try {
    const cur = await readDismissed()
    await (await caches.open(LIVE_CACHE)).put(DISMISSED, new Response(JSON.stringify({ ...cur, ...patch }), { headers: { 'content-type': 'application/json' } }))
  } catch {
    /* ignore */
  }
}

async function showFastLive(m) {
  const d = m.data
  const t = fastLiveText(d) // recomputed on the phone so it's current to the minute
  const [badge, icon] = await Promise.all([liveDataUrl(liveBadgeCanvas(t.hours)), liveDataUrl(liveIconCanvas(t.hours, 'HOURS', LIVE_FAST_COLOR, t.progress))])
  await self.registration.showNotification(t.title, {
    body: t.body,
    tag: 'gloop-fast',
    renotify: false,
    silent: true,
    icon: icon || 'icon-192.png',
    badge: badge || 'badge-96.png',
    data: { path: '/fast', kind: 'fast', start: d.start },
  })
}

// Pushes arrive empty; ask the server what to show (the subscription endpoint identifies this device).
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let messages = []
      try {
        const sub = await self.registration.pushManager.getSubscription()
        const res = await fetch('/api/push/inbox', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub && sub.endpoint }) })
        messages = (await res.json()).messages || []
      } catch {
        /* offline: fall through to a generic notice */
      }
      if (!messages.length) messages = [{ title: 'Gloop', body: 'Open the app for details.', tag: 'reps' }]
      for (const m of messages) {
        if (m.data && m.data.kind === 'fast') {
          try {
            await showFastLive(m)
            continue
          } catch {
            /* fall back to the server's text below */
          }
        }
        const live = !!m.data
        await self.registration.showNotification(m.title, {
          body: m.body,
          tag: m.tag || undefined,
          renotify: !live,
          silent: live,
          icon: 'icon-192.png',
          badge: 'badge-96.png',
          vibrate: live ? undefined : [200, 100, 200],
          data: live ? m.data : undefined,
        })
      }
    })(),
  )
})

// Swiped away: the fasting timer stays hidden for this fast (the app checks the same flag), and the
// server stops sending its updates. Heart rate is hidden for the rest of the session.
self.addEventListener('notificationclose', (event) => {
  const n = event.notification
  if (n.tag !== 'gloop-fast' && n.tag !== 'gloop-live-hr') return
  event.waitUntil(
    (async () => {
      if (n.tag === 'gloop-fast') {
        await writeDismissed({ fast: (n.data && n.data.start) || true })
        try {
          const sub = await self.registration.pushManager.getSubscription()
          if (sub) await fetch('/api/push/dismiss', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint, key: 'fast-live' }) })
        } catch {
          /* offline: the app cancels it next time it runs */
        }
      }
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of list) c.postMessage({ type: 'gloop-live-dismissed', tag: n.tag, start: n.data && n.data.start })
    })(),
  )
})

const PATHS = { 'gloop-fast': '/fast', 'gloop-live-hr': '/live', 'gloop-zone-alert': '/live', fast: '/fast', eat: '/fast' }

self.addEventListener('notificationclick', (event) => {
  const n = event.notification
  const path = (n.data && n.data.path) || PATHS[n.tag] || null
  // the live ones stay up (closing them would read as a swipe-away to nobody, but they'd vanish)
  if (n.tag !== 'gloop-fast' && n.tag !== 'gloop-live-hr') n.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          if (path) c.postMessage({ type: 'gloop-open', path })
          return c.focus()
        }
      }
      return self.clients.openWindow(path ? './#' + path : './')
    }),
  )
})
