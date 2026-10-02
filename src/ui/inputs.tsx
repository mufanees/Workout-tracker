import { useEffect, useRef, useState } from 'preact/hooks'
import { parseNum } from '../util'

function fmt(v: number | null): string {
  if (v == null) return ''
  return String(Math.round(v * 100) / 100)
}

/** Parse "90", "1:30" or "1m 30" into seconds. */
export function parseSeconds(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const m = t.match(/^(\d+)\s*[:m]\s*(\d{0,2})\s*s?$/)
  if (m) return Number(m[1]) * 60 + Number(m[2] || 0)
  const n = parseNum(t.replace(/s$/, ''))
  return n == null ? null : Math.round(n)
}

export function NumInput(props: {
  value: number | null
  placeholder?: string
  onChange: (v: number | null) => void
  decimal?: boolean
  seconds?: boolean
  label: string
  field: string
  class?: string
}) {
  const [text, setText] = useState(fmt(props.value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(fmt(props.value))
  }, [props.value])
  return (
    <input
      class={'num ' + (props.class || '')}
      data-f={props.field}
      type="text"
      inputMode={props.decimal ? 'decimal' : 'numeric'}
      enterKeyHint="next"
      autoComplete="off"
      value={text}
      placeholder={props.placeholder ?? ''}
      aria-label={props.label}
      onFocus={(e) => {
        focused.current = true
        const el = e.currentTarget
        // setSelectionRange is more reliable than select() on iOS Safari.
        requestAnimationFrame(() => {
          try {
            el.setSelectionRange(0, el.value.length)
          } catch {
            el.select()
          }
        })
      }}
      onBlur={() => {
        focused.current = false
        setText(fmt(props.value))
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          focusNext(e.currentTarget)
        }
      }}
      onInput={(e) => {
        const raw = e.currentTarget.value
        setText(raw)
        props.onChange(props.seconds ? parseSeconds(raw) : parseNum(raw))
      }}
    />
  )
}

function focusNext(el: HTMLInputElement) {
  const all = [...document.querySelectorAll<HTMLInputElement>('input.num')]
  const i = all.indexOf(el)
  if (i >= 0 && all[i + 1]) all[i + 1].focus()
  else el.blur()
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button class={'toggle' + (checked ? ' on' : '')} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
      <span />
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div class="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button role="radio" aria-checked={v === value} class={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  )
}
