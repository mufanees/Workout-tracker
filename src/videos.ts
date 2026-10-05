// Videos for exercises: the ones you've saved (preferred first), else a YouTube search. Saving is
// meant to be one step from anywhere: share a video to Gloop, paste a link, or tell the coach.
import { active, exercises, exMap, saveExercise } from './store'
import { getToken } from './sync'
import type { Exercise } from './types'

/** The first web link in some text (a share often wraps it in words). */
export function findUrl(text: string | null | undefined): string | null {
  const m = String(text || '').match(/https?:\/\/[^\s<>"']+/i)
  if (!m) return null
  try {
    const u = new URL(m[0].replace(/[).,]+$/, ''))
    u.searchParams.delete('si') // YouTube's share tracking
    u.searchParams.delete('feature')
    return u.toString()
  } catch {
    return null
  }
}

export const searchUrl = (words: string) => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(words)

/** Where the video button goes: your preferred video, else a search. */
export const videoFor = (ex: Exercise) => ex.videos?.[0]?.url || searchUrl(ex.video || ex.name + ' exercise form')

export const hasOwnVideo = (ex: Exercise | null | undefined) => !!ex?.videos?.length

/** Save a video for an exercise. Preferred (default) puts it first; otherwise it's added after the others. */
export async function saveVideo(ex: Exercise, url: string, opts: { title?: string; preferred?: boolean } = {}) {
  const cur = (ex.videos || []).filter((v) => v.url !== url)
  const old = (ex.videos || []).find((v) => v.url === url)
  const v = { url, title: opts.title || old?.title, added: old?.added || Date.now() }
  const videos = opts.preferred === false ? [...cur, v] : [v, ...cur]
  return saveExercise({ ...ex, videos: videos.slice(0, 12) })
}

export async function removeVideo(ex: Exercise, url: string) {
  return saveExercise({ ...ex, videos: (ex.videos || []).filter((v) => v.url !== url) })
}

/** The video's title (YouTube and others that support oEmbed), via the server when there is one. */
export async function videoTitle(url: string): Promise<string | null> {
  try {
    const t = getToken()
    const r = await fetch('/api/video-info?url=' + encodeURIComponent(url), { headers: t ? { authorization: `Bearer ${t}` } : {} })
    if (r.ok) return (await r.json()).title || null
  } catch {
    /* no server (the Claude-hosted copy): try YouTube directly */
  }
  try {
    const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url))
    if (r.ok) return (await r.json()).title || null
  } catch {
    /* fine: we just won't know the title */
  }
  return null
}

const words = (s: string) => s.toLowerCase().replace(/['’]/g, '').match(/[a-z0-9]+/g) || []
const NOISE = new Set(['how', 'to', 'the', 'a', 'and', 'for', 'with', 'your', 'my', 'do', 'proper', 'form', 'exercise', 'tutorial', 'guide', 'best', 'perfect', 'correct', 'way', 'technique', 'tips', 'beginners', 'beginner', 'in', 'of', 'this', 'that', 'shorts', 'video', 'you', 'are', 'mistakes', 'stop', 'doing', 'why', 'is', 'on'])

/**
 * Which exercise a video is probably for: the exercises in the workout you're doing come first, then
 * the best word matches with the title (ones you've logged before win ties).
 */
export function guessExercises(title: string | null, max = 6): Exercise[] {
  const tw = new Set(words(title || '').filter((w) => !NOISE.has(w)))
  const inWorkout = new Set((active.value?.exercises || []).map((e) => e.exerciseId))
  const scored = exercises.value
    .filter((e) => !e.deleted)
    .map((e) => {
      const ew = words(e.name)
      const hit = ew.filter((w) => tw.has(w) || tw.has(w.replace(/s$/, '')) || tw.has(w + 's')).length
      const score = (hit && hit / ew.length) * 10 + hit + (inWorkout.has(e.id) ? (tw.size ? 4 : 20) : 0) + (e.videos?.length ? 0.5 : 0)
      return { e, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored.slice(0, max).map((x) => x.e)
}

export const exerciseById = (id: string) => exMap.value.get(id)
