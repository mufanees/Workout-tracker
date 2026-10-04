// Settings → Appearance: the accent colour, and Goo: tweaks for every gooey motion, with a
// live preview to try them on.
import { useEffect, useRef, useState } from 'preact/hooks'
import { saveSettings, settings } from '../store'
import { ACCENTS, DEFAULT_ACCENT } from '../accent'
import { GOO_DEFAULTS, setGoo, type GooTweaks } from '../gooConfig'
import { Segmented, Toggle } from '../ui/inputs'
import { Icon } from '../ui/icons'

export function AccentPicker() {
  const cur = (settings.value.accent || DEFAULT_ACCENT).toLowerCase()
  const custom = !ACCENTS.some(([c]) => c === cur)
  const pick = (c: string) => void saveSettings({ accent: c.toLowerCase() === DEFAULT_ACCENT ? null : c.toLowerCase() })
  return (
    <div class="setting accent-setting">
      <span>Accent colour</span>
      <div class="swatches" data-goo role="radiogroup" aria-label="Accent colour">
        {ACCENTS.map(([c, name]) => (
          <button role="radio" aria-checked={c === cur} aria-label={name} title={name} class={'swatch' + (c === cur ? ' on' : '')} style={{ '--sw': c }} onClick={() => pick(c)} />
        ))}
        <label class={'swatch swatch-custom' + (custom ? ' on' : '')} style={custom ? { '--sw': cur } : undefined} title="Any colour">
          <Icon name="plus" size={16} />
          <input type="color" aria-label="Pick any colour" value={cur} onInput={(e) => pick(e.currentTarget.value)} />
        </label>
      </div>
    </div>
  )
}

type Num = 'intensity' | 'speed' | 'drama' | 'lumps' | 'wobble' | 'trail'
const SLIDERS: [Num, string, number, number, (v: number) => string][] = [
  ['intensity', 'Gooeyness', 0.4, 1.8, (v) => (v < 0.75 ? 'Subtle' : v < 1.25 ? 'Gooey' : 'Molten')],
  ['speed', 'Speed', 0.5, 2, (v) => `${v.toFixed(1)}×`],
  ['drama', 'Easing', 0, 2, (v) => (v < 0.5 ? 'Soft' : v < 1 ? 'Smooth' : v < 1.5 ? 'Dramatic' : 'Very dramatic')],
  ['lumps', 'Lumpiness', 0, 2, (v) => (v < 0.05 ? 'None' : v < 0.75 ? 'A little' : v < 1.3 ? 'Lumpy' : 'Very lumpy')],
  ['wobble', 'Wobble', 0, 2, (v) => (v < 0.05 ? 'None' : v < 0.75 ? 'Gentle' : v < 1.3 ? 'Wobbly' : 'Jelly')],
  ['trail', 'Trail', 0, 2, (v) => (v < 0.05 ? 'None' : v < 0.75 ? 'Short' : v < 1.3 ? 'Long' : 'Stringy')],
]

const DEMO_ORDER = ['a', 'b', 'c', 'd']

type Style = 'squish' | 'ooze' | 'melt' | 'drip'
/** One-tap styles: each sets all six sliders. Ooze is the default. */
const STYLES: Record<Style, Pick<GooTweaks, Num>> = {
  squish: { intensity: 0.7, speed: 1.4, drama: 0.6, lumps: 0.5, wobble: 1.8, trail: 0.3 },
  ooze: { intensity: GOO_DEFAULTS.intensity, speed: GOO_DEFAULTS.speed, drama: GOO_DEFAULTS.drama, lumps: GOO_DEFAULTS.lumps, wobble: GOO_DEFAULTS.wobble, trail: GOO_DEFAULTS.trail },
  melt: { intensity: 1.6, speed: 0.7, drama: 1.6, lumps: 1.4, wobble: 0.4, trail: 1.4 },
  drip: { intensity: 1.2, speed: 0.85, drama: 1.9, lumps: 0.8, wobble: 0.8, trail: 2 },
}
const styleOf = (t: GooTweaks) => (Object.keys(STYLES) as Style[]).find((k) => (Object.keys(STYLES[k]) as Num[]).every((n) => Math.abs(t[n] - STYLES[k][n]) < 0.001))

export function GooSettings() {
  const saved = { ...GOO_DEFAULTS, ...(settings.value.goo || {}) }
  // while a slider moves, the motion follows it live; it's saved when you let go
  const [live, setLive] = useState<GooTweaks | null>(null)
  const t = live || saved
  const [demo, setDemo] = useState('b')
  const [demoOn, setDemoOn] = useState(true)
  // The preview plays itself while it's on screen, so a slider change shows straight away;
  // a tap takes over for a few seconds.
  const previewRef = useRef<HTMLDivElement>(null)
  const heldUntil = useRef(0)
  const hold = () => (heldUntil.current = Date.now() + 5000)
  useEffect(() => {
    const el = previewRef.current
    if (!el || !t.enabled || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let visible = false
    let step = 0
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.6 })
    io.observe(el)
    const id = setInterval(() => {
      if (!visible || document.hidden || Date.now() < heldUntil.current) return
      step++
      if (step % 3 === 0) setDemoOn((v) => !v)
      else setDemo((d) => DEMO_ORDER[(DEMO_ORDER.indexOf(d) + 1 + (step % 2)) % DEMO_ORDER.length])
    }, 1400)
    return () => {
      clearInterval(id)
      io.disconnect()
    }
  }, [t.enabled])
  const save = (patch: Partial<GooTweaks>) => {
    const next = { ...t, ...patch }
    setGoo(next)
    setLive(null)
    void saveSettings({ goo: next })
  }
  const slide = (k: Num, v: number) => {
    const next = { ...t, [k]: v }
    setLive(next)
    setGoo(next)
  }
  const isDefault = (Object.keys(GOO_DEFAULTS) as (keyof GooTweaks)[]).every((k) => t[k] === GOO_DEFAULTS[k])
  return (
    <div class="settings-group goo-settings">
      <div class="setting">
        <span>Gooey motion</span>
        <Toggle label="Gooey motion" checked={t.enabled} onChange={(v) => save({ enabled: v })} />
      </div>
      <div class={'goo-tweaks' + (t.enabled ? '' : ' off')}>
        <div class="setting column goo-style">
          <span>
            Style <small>{styleOf(t) ? 'Sets all the sliders below' : 'Custom: your own slider mix'}</small>
          </span>
          <Segmented
            label="Goo style"
            value={styleOf(t) || ''}
            options={[
              ['squish', 'Squish'],
              ['ooze', 'Ooze'],
              ['melt', 'Melt'],
              ['drip', 'Drip'],
            ]}
            onChange={(k) => k && save(STYLES[k as Style])}
          />
        </div>
        <div class="goo-preview" ref={previewRef} onPointerDown={hold}>
          <span class="muted small">Preview · tap to try</span>
          <Segmented
            label="Preview"
            value={demo}
            options={[
              ['a', 'Sets'],
              ['b', 'Reps'],
              ['c', 'Rest'],
              ['d', 'Time'],
            ]}
            onChange={setDemo}
          />
          <Toggle label="Preview switch" checked={demoOn} onChange={setDemoOn} />
        </div>
        {SLIDERS.map(([k, label, min, max, word]) => (
          <label class="goo-slider">
            <span>
              {label} <b>{word(t[k])}</b>
            </span>
            <input type="range" min={min} max={max} step={0.05} value={t[k]} disabled={!t.enabled} onInput={(e) => slide(k, Number(e.currentTarget.value))} onChange={(e) => save({ [k]: Number(e.currentTarget.value) })} />
          </label>
        ))}
        <div class="setting">
          <span>Droplets when you tap</span>
          <Toggle label="Droplets when you tap" checked={t.taps} onChange={(v) => save({ taps: v })} />
        </div>
        <div class="setting">
          <span>Motes on the tab bar</span>
          <Toggle label="Motes on the tab bar" checked={t.motes} onChange={(v) => save({ motes: v })} />
        </div>
        <div class="setting">
          <span>Lava in the plan card</span>
          <Toggle label="Lava in the plan card" checked={t.lava} onChange={(v) => save({ lava: v })} />
        </div>
        <button class="btn-text small" disabled={isDefault} onClick={() => save({ ...GOO_DEFAULTS })}>
          Reset goo to default
        </button>
      </div>
    </div>
  )
}
