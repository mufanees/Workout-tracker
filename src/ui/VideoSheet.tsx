// One sheet for exercise videos, opened from anywhere:
// - with a link (shared to Gloop, pasted, or from the coach): pick which exercise it's for;
// - with an exercise: paste or type a link, choose the preferred one, remove old ones.
import { signal } from '@preact/signals'
import { useEffect, useState } from 'preact/hooks'
import { exMap } from '../store'
import { findUrl, guessExercises, removeVideo, saveVideo, searchUrl, videoTitle } from '../videos'
import type { Exercise } from '../types'
import { ExercisePicker } from './ExercisePicker'
import { Icon } from './icons'
import { Sheet, toast } from './overlay'

const req = signal<{ url?: string; title?: string; exerciseId?: string } | null>(null)

/** Open the sheet: give a link to choose its exercise, or an exercise to manage its videos. */
export function openVideoSheet(o: { url?: string; title?: string; exerciseId?: string }) {
  req.value = o
}

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\.|^m\./, '')
  } catch {
    return u
  }
}

async function readClipboard(): Promise<string | null> {
  try {
    return findUrl(await navigator.clipboard.readText())
  } catch {
    return null
  }
}

export function VideoSheetHost() {
  const r = req.value
  const [title, setTitle] = useState<string | null>(null)
  const [picker, setPicker] = useState(false)
  const [typed, setTyped] = useState('')
  const [, bump] = useState(0)
  useEffect(() => {
    setTitle(r?.title || null)
    setTyped('')
    if (r?.url && !r.title) void videoTitle(r.url).then((t) => req.value?.url === r.url && setTitle(t))
  }, [r?.url, r?.exerciseId])
  const close = () => (req.value = null)
  const ex = r?.exerciseId ? exMap.value.get(r.exerciseId) : undefined

  const assign = async (target: Exercise, url: string, t: string | null) => {
    await saveVideo(target, url, { title: t || undefined })
    toast(`Now the video for ${target.name}`)
    close()
  }

  // Mode 1: a link, which exercise?
  if (r?.url && !ex) {
    const guesses = guessExercises(title)
    return (
      <>
        <Sheet open={!picker} onClose={close} title="Save this video" label="Save this video">
          <div class="video-card">
            <Icon name="video" size={20} />
            <span class="grow">
              <b>{title || 'Video'}</b>
              <small>{host(r.url)}</small>
            </span>
          </div>
          <p class="muted small vs-ask">Which exercise is it for? It becomes that exercise’s video.</p>
          <div class="vs-list">
            {guesses.map((g) => (
              <button class="pick-row" onClick={() => assign(g, r.url!, title)}>
                <span class="pick-badge" aria-hidden="true">
                  {g.name.slice(0, 1)}
                </span>
                <span class="pick-text">
                  <span class="pick-name">{g.name}</span>
                  <span class="pick-meta">
                    {g.muscle} · {g.equipment}
                    {g.videos?.length ? ` · replaces your current video` : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <button class="btn btn-secondary btn-block" onClick={() => setPicker(true)}>
            <Icon name="search" size={18} /> {guesses.length ? 'Something else' : 'Find the exercise'}
          </button>
        </Sheet>
        <ExercisePicker
          open={picker}
          single
          title="Which exercise?"
          onClose={() => setPicker(false)}
          onPick={(ids) => {
            setPicker(false)
            const target = exMap.value.get(ids[0])
            if (target) void assign(target, r.url!, title)
          }}
        />
      </>
    )
  }

  // Mode 2: an exercise, its videos
  const add = async (url: string | null) => {
    if (!ex) return
    if (!url) return toast('That doesn’t look like a link')
    await saveVideo(ex, url)
    toast('Saved as the video for ' + ex.name)
    bump((n) => n + 1)
    setTyped('')
    void videoTitle(url).then((t) => {
      const cur = exMap.value.get(ex.id)
      if (t && cur) void saveVideo(cur, url, { title: t, preferred: cur.videos?.[0]?.url === url })
    })
  }
  const vids = ex?.videos || []
  return (
    <Sheet open={!!ex} onClose={close} title={ex ? `Videos · ${ex.name}` : 'Videos'} label="Exercise videos">
      {ex && (
        <>
          <div class="vs-paste">
            <button class="btn btn-primary grow" onClick={async () => add(await readClipboard())}>
              <Icon name="copy" size={18} /> Paste link
            </button>
            <a class="btn btn-secondary" href={searchUrl(ex.video || ex.name + ' exercise form')} target="_blank" rel="noopener">
              <Icon name="search" size={18} /> Find one
            </a>
          </div>
          <div class="row gap vs-type">
            <input class="grow" type="url" inputMode="url" placeholder="Or type / paste a link here" value={typed} onInput={(e) => setTyped(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && add(findUrl(typed))} />
            <button class="btn btn-secondary" disabled={!findUrl(typed)} onClick={() => add(findUrl(typed))}>
              Save
            </button>
          </div>
          <p class="muted small">Tip: in YouTube tap Share, then Gloop, and pick the exercise. No copying needed.</p>
          {vids.length > 0 && (
            <ul class="vs-videos">
              {vids.map((v, i) => (
                <li class={i === 0 ? 'preferred' : ''}>
                  <button
                    class="icon-btn sm"
                    aria-label={i === 0 ? 'Preferred video' : 'Make this the preferred video'}
                    aria-pressed={i === 0}
                    onClick={async () => {
                      if (i) await saveVideo(ex, v.url)
                      bump((n) => n + 1)
                    }}
                  >
                    <Icon name="star" size={18} />
                  </button>
                  <a class="grow" href={v.url} target="_blank" rel="noopener">
                    <b>{v.title || host(v.url)}</b>
                    <small>
                      {i === 0 ? 'Preferred · ' : ''}
                      {host(v.url)}
                    </small>
                  </a>
                  <button
                    class="icon-btn sm"
                    aria-label="Remove this video"
                    onClick={async () => {
                      await removeVideo(ex, v.url)
                      bump((n) => n + 1)
                      toast('Video removed', { label: 'Undo', run: () => void saveVideo(exMap.value.get(ex.id)!, v.url, { title: v.title, preferred: i === 0 }) })
                    }}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Sheet>
  )
}
