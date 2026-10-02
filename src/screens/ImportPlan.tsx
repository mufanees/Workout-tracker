import { useMemo, useState } from 'preact/hooks'
import { exercises, exMap, saveExercise, saveRoutine } from '../store'
import { back, navigate } from '../router'
import { extractJson, planPrompt, resolvePlan } from '../../shared/planImport.mjs'
import { Icon } from '../ui/icons'
import { toast } from '../ui/overlay'
import { uid } from '../util'
import type { Exercise, ExType } from '../types'

type Result = ReturnType<typeof resolvePlan>

export function ImportPlan() {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [saving, setSaving] = useState(false)
  const prompt = useMemo(() => planPrompt(exercises.value.map((e) => e.name)), [exercises.value])

  const copyPrompt = () =>
    navigator.clipboard
      .writeText(prompt)
      .then(() => toast('Prompt copied. Paste it into Claude with your plan.'))
      .catch(() => toast('Couldn’t copy. Select the prompt text below instead.'))

  const preview = () => {
    setError('')
    try {
      setResult(resolvePlan(extractJson(text), exercises.value, () => uid()))
    } catch (e) {
      setResult(null)
      setError((e as Error).message || 'That doesn’t look like a Reps plan.')
    }
  }

  const save = async () => {
    if (!result || saving) return
    setSaving(true)
    for (const e of result.newExercises) {
      await saveExercise({ id: e.id, name: e.name, muscle: e.muscle, equipment: e.equipment, type: e.type as ExType, custom: true, updatedAt: 0 } as Exercise)
    }
    for (const r of result.routines) await saveRoutine({ ...r, updatedAt: 0 })
    toast(`Added ${result.routines.length} routine${result.routines.length > 1 ? 's' : ''}`)
    navigate('/train', { replace: true })
  }

  return (
    <div class="screen">
      <header class="page-head sub">
        <button class="icon-btn" onClick={() => back('/train')} aria-label="Back">
          <Icon name="left" />
        </button>
        <span class="page-title">Import a plan</span>
        <span class="icon-btn" aria-hidden="true" />
      </header>

      {!result ? (
        <>
          <ol class="steps">
            <li>
              <b>Copy the prompt</b>
              <span>It tells Claude the format Reps needs and lists the exercises you already have.</span>
              <button class="btn btn-secondary btn-sm" onClick={copyPrompt}>
                <Icon name="copy" size={16} /> Copy prompt
              </button>
            </li>
            <li>
              <b>Ask Claude</b>
              <span>Paste the prompt into Claude along with your plan: the file, a screenshot or the text.</span>
            </li>
            <li>
              <b>Paste the answer here</b>
              <span>Reps matches each exercise to your library and shows you the routines before adding them.</span>
            </li>
          </ol>
          <label class="field">
            <span>Claude’s answer</span>
            <textarea id="plan-json" rows={10} value={text} placeholder={'{\n  "folder": "My plan",\n  "routines": [ … ]\n}'} onInput={(e) => setText(e.currentTarget.value)} />
            {error && <span class="field-error">{error}</span>}
          </label>
          <button class="btn btn-primary btn-block btn-lg" disabled={!text.trim()} onClick={preview}>
            Preview routines
          </button>
          <p class="field-hint">
            Connected Claude to your server with MCP? Then just ask it to “import this plan into Reps” and the routines appear here on their own. See the README.
          </p>
        </>
      ) : (
        <>
          <div class="import-summary">
            <b>
              {result.routines.length} routine{result.routines.length > 1 ? 's' : ''}
            </b>
            {result.folder && (
              <span>
                <Icon name="folder" size={14} /> {result.folder}
              </span>
            )}
            {result.newExercises.length > 0 && <span>{result.newExercises.length} new exercises</span>}
          </div>
          {result.routines.map((r) => (
            <section class="detail-ex">
              <div class="detail-ex-name">{r.name}</div>
              {r.notes && <p class="detail-ex-note">{r.notes}</p>}
              <ul class="import-list">
                {r.exercises.map((e) => {
                  const lib = exMap.value.get(e.exerciseId) || result.newExercises.find((n) => n.id === e.exerciseId)
                  const isNew = result.newExercises.some((n) => n.id === e.exerciseId)
                  return (
                    <li>
                      <span class="il-sets">{e.sets.length} ×</span>
                      <span class="il-name">
                        {lib?.name}
                        {e.target && <small> · {e.target}</small>}
                        {e.notes && <small class="il-note">{e.notes}</small>}
                      </span>
                      {e.superset && <span class="tag ss-tag-plain">SS</span>}
                      {isNew && <span class="tag tag-new">New</span>}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
          {result.matches.some((m) => m.from.toLowerCase() !== m.to.toLowerCase() && !m.created) && (
            <details class="matches">
              <summary>How names were matched</summary>
              <ul>
                {result.matches
                  .filter((m) => !m.created && m.from.toLowerCase() !== m.to.toLowerCase())
                  .map((m) => (
                    <li>
                      “{m.from}” is now <b>{m.to}</b>
                    </li>
                  ))}
              </ul>
            </details>
          )}
          <div class="row gap">
            <button class="btn btn-secondary grow" onClick={() => setResult(null)}>
              Back
            </button>
            <button class="btn btn-primary grow" onClick={save} disabled={saving}>
              Add routines
            </button>
          </div>
        </>
      )}
      {!result && (
        <details class="matches">
          <summary>Show the prompt</summary>
          <pre class="prompt-text">{prompt.slice(0, 2400)}…</pre>
        </details>
      )}
    </div>
  )
}
