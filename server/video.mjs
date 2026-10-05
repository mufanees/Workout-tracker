// A video's title from its provider's public oEmbed endpoint (YouTube, Vimeo, TikTok). Only these
// known hosts are asked, so the server never fetches arbitrary addresses for a client.
const PROVIDERS = [
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, (u) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}`],
  [/(^|\.)vimeo\.com$/, (u) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(u)}`],
  [/(^|\.)tiktok\.com$/, (u) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(u)}`],
]
const cache = new Map()

export async function videoInfo(url) {
  let u
  try {
    u = new URL(String(url))
  } catch {
    return { title: null }
  }
  if (!/^https?:$/.test(u.protocol)) return { title: null }
  const p = PROVIDERS.find(([re]) => re.test(u.hostname))
  if (!p) return { title: null }
  if (cache.has(u.href)) return cache.get(u.href)
  try {
    const r = await fetch(p[1](u.href), { signal: AbortSignal.timeout(5000) })
    const j = r.ok ? await r.json() : {}
    const out = { title: typeof j.title === 'string' ? j.title.slice(0, 200) : null, author: typeof j.author_name === 'string' ? j.author_name.slice(0, 100) : null }
    if (cache.size > 500) cache.clear()
    cache.set(u.href, out)
    return out
  } catch {
    return { title: null }
  }
}
