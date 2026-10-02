// Turns a workout plan in "Reps plan" JSON into routines, matching exercise names to the library.
// Shared by the app (paste import) and the server (MCP import_plan tool). Plain JS so both can load it.

/**
 * @typedef {{ name: string, sets?: number, reps?: string|number, weight?: number|null, seconds?: number|null,
 *   rest?: number, superset?: string|number|null, notes?: string,
 *   type?: 'weight_reps'|'reps'|'duration', muscle?: string, equipment?: string }} PlanExercise
 * @typedef {{ name: string, notes?: string, exercises: PlanExercise[] }} PlanRoutine
 * @typedef {{ folder?: string, routines: PlanRoutine[] }} Plan
 * @typedef {{ id: string, name: string, muscle: string, equipment: string, type: string }} LibExercise
 */

export const PLAN_FORMAT = `{
  "folder": "Plan name (routines are grouped under it)",
  "routines": [
    {
      "name": "Phase 1 · Workout A",
      "notes": "Schedule or cues for the whole session (optional)",
      "warmup": ["Cat-cow x 8", "Scap push-ups x 10"],     // checklist ticked off at the start (optional)
      "cooldown": ["Hamstring stretch 30 s / side"],       // checklist at the end (optional)
      "exercises": [
        {
          "name": "Goblet Squat",          // use a name from the exercise list when one fits
          "sets": 3,
          "reps": "10-12",                 // target as text: "8", "8-10", "8 / side", "30 s"
          "weight": null,                  // kg per dumbbell, or null to leave blank
          "seconds": null,                 // for timed exercises (planks): planned seconds per set
          "rest": 60,                      // seconds to rest after this exercise (or after the superset round)
          "superset": "1",                 // same value = done back to back (1a/1b pairs); omit for straight sets
          "notes": "1 s pause at bottom",  // variation or cue (optional)
          "equipment": "Dumbbell",         // always: Dumbbell Barbell Kettlebell Cable Machine Bodyweight Band Other
          "type": "weight_reps",           // only for new exercises: weight_reps | reps | duration
          "muscle": "Legs"                 // only for new exercises: Chest Back Shoulders Arms Legs Glutes Core Full Body Cardio Mobility
        }
      ]
    }
  ]
}`

/** The prompt to give an assistant along with a plan (file, screenshot or text). */
export function planPrompt(exerciseNames) {
  return `Convert the workout plan I'm sharing into JSON for my workout app, Reps. Reply with only the JSON, no commentary.

Format (the // comments are explanations, leave them out of your answer):
${PLAN_FORMAT}

Rules:
- One routine per distinct workout day. If the plan has phases, make one routine per phase and day, named like "Phase 1 · Workout A".
- Pairs like 1a/1b are supersets: give both the same "superset" value. Put the rest after the pair on the last exercise of the pair.
- Use the closest name from the exercise list below. Put variations ("1 s pause", "neutral grip", "heavy") in "notes" rather than in the name, so progress carries across phases.
- Always include "equipment" (what the plan uses: a dumbbell plan means Dumbbell, even when the plan just says "row"). It picks the right variant.
- Only invent a new exercise when nothing in the list fits; then also include type and muscle.
- Warm-up and cool-down drills go in the routine's "warmup" and "cooldown" lists (one short line each), not as exercises.
- If the plan gives a set count that changes by week, use the most common one and mention the rest in the routine notes.

Exercise list:
${exerciseNames.join('; ')}`
}

const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(dumbbell|db|db's|dumbbells)\b/g, 'dumbbell')
    .replace(/\b(\w+?)s\b/g, '$1')
    .trim()

export const slug = (name) =>
  'x-' + String(name).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * Find the library exercise for a name. Candidates are exercises whose name contains every word;
 * an exact name, a matching equipment hint and a shorter name all rank higher.
 */
export function matchExercise(name, library, equipment) {
  const n = norm(name)
  if (!n) return null
  const words = n.split(' ')
  const eq = equipment ? String(equipment).toLowerCase() : ''
  let best = null
  let bestScore = -Infinity
  for (const e of library) {
    const en = norm(e.name)
    const exact = en === n || e.id === slug(name)
    if (!exact && !words.every((w) => en.includes(w))) continue
    let score = exact ? 10 : 0
    // A bodyweight hint is weak (most moves can be done without weight), so it only nudges.
    if (eq && e.equipment.toLowerCase() === eq) score += eq === 'bodyweight' ? 3 : 12
    if (eq && eq !== 'barbell' && /barbell/.test(en) && !words.includes('barbell')) score -= 6
    if (e.video || e.custom) score += 1 // hand-picked or your own
    score -= (en.length - n.length) / 20
    if (score > bestScore) {
      bestScore = score
      best = e
    }
  }
  return best
}

/** Pull the first JSON object out of text that may include ```json fences or prose. */
export function extractJson(text) {
  const t = String(text).trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fence ? fence[1] : t
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('No JSON found. Paste the whole answer, including the { and }.')
  // Allow // comments if the assistant kept them.
  const cleaned = body.slice(start, end + 1).replace(/^\s*\/\/.*$/gm, '').replace(/([^:"'])\/\/[^\n"]*$/gm, '$1')
  return JSON.parse(cleaned)
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null)

/**
 * Resolve a plan against the library. Returns routines ready to save, any new exercises,
 * and a readable list of how each name was matched.
 * @param {Plan} plan
 * @param {LibExercise[]} library
 * @param {() => string} makeId
 */
export function resolvePlan(plan, library, makeId, now = Date.now()) {
  if (!plan || !Array.isArray(plan.routines) || !plan.routines.length) throw new Error('The plan has no routines.')
  const folder = String(plan.folder || '').trim()
  const lib = [...library]
  const newExercises = []
  const matches = []
  const routines = plan.routines.map((r, ri) => {
    if (!r || !Array.isArray(r.exercises)) throw new Error(`Routine ${ri + 1} has no exercises.`)
    const groups = new Map()
    const exercises = r.exercises
      .filter((e) => e && String(e.name || '').trim())
      .map((e) => {
        const name = String(e.name).trim()
        let ex = matchExercise(name, lib, e.equipment)
        if (!ex) {
          ex = {
            id: slug(name) + '-' + makeId().slice(-4),
            name: name.replace(/\b\w/g, (c) => c.toUpperCase()),
            muscle: e.muscle || 'Full Body',
            equipment: e.equipment || 'Other',
            type: ['weight_reps', 'reps', 'duration'].includes(e.type) ? e.type : 'weight_reps',
            custom: true,
          }
          lib.push(ex)
          newExercises.push(ex)
          matches.push({ from: name, to: ex.name, created: true })
        } else if (!matches.some((m) => m.from === name)) {
          matches.push({ from: name, to: ex.name, created: false })
        }
        let group = null
        if (e.superset != null && e.superset !== '') {
          const key = String(e.superset)
          if (!groups.has(key)) groups.set(key, `${makeId()}-ss`)
          group = groups.get(key)
        }
        const sets = Math.max(1, Math.min(10, Math.round(num(e.sets) ?? 3)))
        const reps = e.reps == null ? '' : String(e.reps).trim()
        const plannedReps = /^\d+$/.test(reps) ? Number(reps) : null
        const weight = num(e.weight)
        const seconds = num(e.seconds) ?? (ex.type === 'duration' ? num((reps.match(/(\d+)\s*s/) || [])[1]) : null)
        const weId = makeId()
        return {
          id: weId,
          exerciseId: ex.id,
          notes: String(e.notes || ''),
          target: reps,
          rest: Math.max(0, Math.round(num(e.rest) ?? 60)),
          superset: group,
          sets: Array.from({ length: sets }, (_, i) => ({
            id: `${weId}-s${i}`,
            kind: 'normal',
            weight,
            reps: plannedReps,
            seconds,
            done: false,
          })),
        }
      })
    // In a superset only the round's last exercise rests; carry the longest rest there.
    for (const g of new Set(exercises.map((e) => e.superset).filter(Boolean))) {
      const members = exercises.filter((e) => e.superset === g)
      const rest = Math.max(...members.map((e) => e.rest))
      members.forEach((m, i) => (m.rest = i === members.length - 1 ? rest : 0))
    }
    return {
      id: makeId(),
      name: String(r.name || `Workout ${ri + 1}`).trim(),
      folder,
      notes: String(r.notes || ''),
      warmup: Array.isArray(r.warmup) ? r.warmup.map(String).filter((x) => x.trim()) : [],
      cooldown: Array.isArray(r.cooldown) ? r.cooldown.map(String).filter((x) => x.trim()) : [],
      order: now / 1e9 + ri, // after existing routines, in plan order
      exercises,
    }
  })
  return { folder, routines, newExercises, matches }
}
