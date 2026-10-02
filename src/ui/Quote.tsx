import { useState } from 'preact/hooks'
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
