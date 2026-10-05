// Share to Gloop: the installed app is a share target (manifest share_target → /share?title&text&url).
// Share a video from YouTube (or anywhere) and Gloop opens asking which exercise it's for.
import { active } from './store'
import { findUrl } from './videos'
import { openVideoSheet } from './ui/VideoSheet'
import { toast } from './ui/overlay'

let pending: { url: string | null; title: string | null } | null = null

/** Before the app renders: read a share and put the address back to a normal screen. */
export function takeShare() {
  if (location.pathname !== '/share') return
  const p = new URLSearchParams(location.search)
  const url = findUrl(p.get('url')) || findUrl(p.get('text')) || findUrl(p.get('title'))
  const t = (p.get('title') || '').trim()
  pending = { url, title: t && !/^https?:\/\//i.test(t) ? t : null }
  history.replaceState(null, '', '/' + (location.hash || '#/train'))
}

/** Once the library has loaded: ask which exercise it's for. */
export function handleShare() {
  if (!pending) return
  const { url, title } = pending
  pending = null
  if (!url) return toast('Nothing to save: share a video link')
  if (active.value && location.hash !== '#/live') location.hash = '#/live'
  openVideoSheet({ url, title: title || undefined })
}
