// Moving hosts (gloop.novas.my → app.gloop.novas.my, see server/site.mjs): the landing page on the old host
// sends someone who was signed in there to /#handoff=<their key>&to=<route>. Keep the key only when it came
// from the parent domain and nothing is saved here yet, then drop it from the address bar and history.
// Imported first in main.tsx, before the router reads the hash.
const m = location.hash.match(/^#handoff=([^&]*)(?:&to=(.*))?$/)
if (m) {
  try {
    const from = document.referrer ? new URL(document.referrer).hostname : ''
    const token = decodeURIComponent(m[1])
    if (token && from && from !== location.hostname && location.hostname.endsWith('.' + from) && !localStorage.getItem('reps-token')) localStorage.setItem('reps-token', token)
  } catch {
    // a bad link: carry on signed out
  }
  let to = '#/train'
  try {
    const t = decodeURIComponent(m[2] || '')
    if (t.startsWith('#/')) to = t
  } catch {
    // keep the default
  }
  history.replaceState(null, '', location.pathname + to)
}
