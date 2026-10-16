// Two hostnames on one server: the main site shows the landing page, the app lives on its own subdomain.
//   SITE_HOST=gloop.novas.my       → / is the landing page (dist/welcome/index.html)
//   APP_HOST=app.gloop.novas.my    → the app, as before
// Unset (the default), nothing changes: the app is at / and the landing page at /welcome/.
// /api and /mcp answer on both hosts, so connectors, old links and older Android builds keep working.
import fs from 'node:fs'
import path from 'node:path'

const hostOf = (req) =>
  String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim()
    .replace(/:\d+$/, '')
    .toLowerCase()

// The main site's own service worker: retires the app's old one (from when the app lived here), clears its
// caches and reloads open pages, so they get the landing page and from there the app on its new host.
const RETIRE_SW = `self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k)
  await self.registration.unregister()
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url)
})()))
`

export function createSite({ dist, siteHost, appHost }) {
  const site = String(siteHost || '').toLowerCase()
  const app = String(appHost || '').toLowerCase()
  const on = !!(site && app && site !== app)
  // https behind Coolify's proxy (it says so); plain http when run locally
  const scheme = (req) => (String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || (req.socket?.encrypted ? 'https' : 'http'))

  function landing(res, req, appUrl) {
    let html
    try {
      html = fs.readFileSync(path.join(dist, 'welcome', 'index.html'), 'utf8')
    } catch {
      return false
    }
    // where the page's buttons and its "already a user" hop go
    html = html.replace('<head>', `<head>\n<script>window.GLOOP_APP=${JSON.stringify(appUrl)}</script>`)
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' })
    res.end(req.method === 'HEAD' ? undefined : html)
    return true
  }

  /** Handles the request when it's about the landing page or a move between hosts; false to carry on as usual. */
  return function route(req, res, url) {
    if (!on) return false
    const host = hostOf(req)
    const { pathname } = url
    const appUrl = `${scheme(req)}://${app}`
    if (host === app) {
      // the landing page has one home now
      if (pathname === '/welcome' || pathname.startsWith('/welcome/')) {
        res.writeHead(301, { location: `${scheme(req)}://${site}/` })
        res.end()
        return true
      }
      return false
    }
    if (host !== site) return false
    // Android builds from before the move load this host in their WebView: keep giving them the app
    if (/; wv\)/.test(String(req.headers['user-agent'] || ''))) return false
    if (pathname === '/' || pathname === '/index.html') return landing(res, req, appUrl)
    if (pathname === '/welcome' || pathname.startsWith('/welcome/')) {
      res.writeHead(301, { location: '/' })
      res.end()
      return true
    }
    if (pathname === '/sw.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' })
      res.end(RETIRE_SW)
      return true
    }
    // files the landing page uses (icons, fonts) are served as they are; any other page moved to the app
    if (path.extname(pathname)) return false
    res.writeHead(301, { location: appUrl + pathname + url.search })
    res.end()
    return true
  }
}
