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
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
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
      if (!messages.length) messages = [{ title: 'Reps', body: 'Open the app for details.', tag: 'reps' }]
      for (const m of messages) {
        await self.registration.showNotification(m.title, {
          body: m.body,
          tag: m.tag || undefined,
          renotify: true,
          icon: 'icon-192.png',
          badge: 'icon-192.png',
          vibrate: [200, 100, 200],
        })
      }
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus()
      return self.clients.openWindow('./')
    }),
  )
})
