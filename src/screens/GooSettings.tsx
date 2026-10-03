// Settings → Appearance: the accent colour, and Goo: tweaks for every gooey motion, with a
// live preview to try them on.
import { useState } from 'preact/hooks'
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

export function GooSettings() {
  const saved = { ...GOO_DEFAULTS, ...(settings.value.goo || {}) }
  // while a slider moves, the motion follows it live; it's saved when you let go
  const [live, setLive] = useState<GooTweaks | null>(null)
  const t = live || saved
  const [demo, setDemo] = useState('b')
  const [demoOn, setDemoOn] = useState(true)
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
        <div class="goo-preview">
          <span class="muted small">Try it</span>
          <Segmented
            label="Preview"
            value={demo}
            options={[
              ['a', 'Squish'],
              ['b', 'Ooze'],
              ['c', 'Melt'],
              ['d', 'Drip'],
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
