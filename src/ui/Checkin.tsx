// Morning check-in on Train: sleep, energy, stress in three taps. Hidden once today's is done.
import { dayNotes, saveCheckin } from '../store'
import { dayKey } from '../fasting'
import type { DayNote } from '../types'
import { Icon } from './icons'

type Field = 'sleep' | 'energy' | 'stress'
const ROWS: [Field, string, [string, string, string]][] = [
  ['sleep', 'Sleep', ['Poor', 'OK', 'Good']],
  ['energy', 'Energy', ['Low', 'OK', 'High']],
  ['stress', 'Stress', ['High', 'Some', 'Low']],
]

export function CheckinCard() {
  const id = dayKey(Date.now())
  const d: Partial<DayNote> = dayNotes.value.get(id) || {}
  if (d.sleep && d.energy && d.stress) return null
  return (
    <section class="card checkin">
      <div class="gc-top">
        <span class="eyebrow">
          <Icon name="sun" size={14} /> How are you today?
        </span>
        <span class="checkin-why">Helps your coach set today’s targets</span>
      </div>
      {ROWS.map(([f, label, words]) => (
        <div class="checkin-row" role="radiogroup" aria-label={label}>
          <span>{label}</span>
          <div class="checkin-opts">
            {words.map((w, i) => {
              const v = (i + 1) as 1 | 2 | 3
              return (
                <button role="radio" aria-checked={d[f] === v} class={'chip' + (d[f] === v ? ' on' : '')} onClick={() => void saveCheckin(id, { [f]: v })}>
                  {w}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}
