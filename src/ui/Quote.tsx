import { useEffect, useMemo, useState } from 'preact/hooks'
import { Icon } from './icons'
import { settings } from '../store'
import type { Quote } from '../types'
import { startOfDay } from '../util'

/** Words written in CAPITALS (2+ letters) are emphasised, the way the quotes were written. */
export function QuoteText({ text }: { text: string }) {
  const parts = text.split(/((?:\b[A-Z][A-Z0-9'&]+\b[\s,.!?:;-]*){1,})/g)
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <em class="q-em">{p}</em> : p))}
    </>
  )
}

/** Pick a quote: the same one all day (seeded by date + salt), optionally from one tag. */
export function quoteOfTheDay(salt = 0, tag?: string): Quote | null {
  const all = settings.value.quotes || []
  const pool = tag ? all.filter((q) => q.tag === tag) : all
  const list = pool.length ? pool : all
  if (!list.length) return null
  const day = Math.floor(startOfDay(new Date()) / 86400000)
  return list[(day * 7 + salt) % list.length]
}

export function randomQuote(): Quote | null {
  const all = settings.value.quotes || []
  return all.length ? all[Math.floor(Math.random() * all.length)] : null
}

/** `seed` keeps different screens from showing the same quote on the same day. */
export function QuoteCard({ tag, compact, seed = 0 }: { tag?: string; compact?: boolean; seed?: number }) {
  const [salt, setSalt] = useState(seed)
  if (!settings.value.showQuotes) return null
  const q = quoteOfTheDay(salt, tag)
  if (!q) return null
  return (
    <button class={'quote-card' + (compact ? ' compact' : '')} onClick={() => setSalt(salt + 1)} aria-label="Show another quote">
      <span class="q-text">
        <QuoteText text={q.text} />
      </span>
      {q.author && <span class="q-author">{q.author}</span>}
    </button>
  )
}

const ROTATE_MS = 12000

/**
 * The big one: a bold, rotating quote at the top of Train. Changes every 12 seconds (tap for the
 * next one), starting from today's quote, in a shuffled order so it doesn't feel like a list.
 */
export function HeroQuote({ tag }: { tag?: string }) {
  const all = settings.value.quotes || []
  const order = useMemo(() => {
    const pool = tag ? all.filter((q) => q.tag === tag) : []
    const rest = all.filter((q) => !pool.includes(q))
    const shuffle = (xs: Quote[]) => xs.map((q) => [Math.random(), q] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1])
    const first = quoteOfTheDay(0, tag)
    const list = [...shuffle(pool), ...shuffle(rest)]
    return first ? [first, ...list.filter((q) => q !== first)] : list
  }, [all.length, tag])
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused || order.length < 2) return
    const t = setTimeout(() => setI((n) => (n + 1) % order.length), ROTATE_MS)
    return () => clearTimeout(t)
  }, [i, paused, order.length])
  useEffect(() => {
    const onVis = () => setPaused(document.visibilityState !== 'visible')
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])
  if (!settings.value.showQuotes || !order.length) return null
  const q = order[i % order.length]
  const long = q.text.length > 90
  return (
    <button class="hero-quote" onClick={() => setI((n) => (n + 1) % order.length)} aria-label="Next quote" aria-live="polite">
      <Icon name="quote" size={26} class="hq-mark" stroke={2.5} />
      <span class={'hq-text' + (long ? ' long' : '')} key={i}>
        <QuoteText text={q.text} />
      </span>
      <span class="hq-foot">
        <span class="hq-author">{q.author || q.tag || 'Keep going'}</span>
        <span class="hq-count">
          {(i % order.length) + 1}/{order.length}
        </span>
      </span>
      {order.length > 1 && !paused && <span class="hq-timer" key={'t' + i} style={{ animationDuration: ROTATE_MS + 'ms' }} />}
    </button>
  )
}
