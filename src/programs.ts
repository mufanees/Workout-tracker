// The program library: start a ready-made program (adds its routines and follows it).
import { PROGRAM_CATALOG, type CatalogProgram } from '../shared/programs.mjs'
import { resolvePlan } from '../shared/planImport.mjs'
import { exercises, routines, saveExercise, saveRoutine, saveSettings, settings, workouts } from './store'
import { seedRoutines } from './seed'
import type { Exercise, ExType } from './types'
import { startOfWeek } from './util'

export const catalog: CatalogProgram[] = PROGRAM_CATALOG

export const COMEBACK = 'comeback'

/** Is this catalogue program's set of routines on Train already? */
export function hasProgram(p: CatalogProgram): boolean {
  if (p.id === COMEBACK) return routines.value.some((r) => r.id.startsWith('r-comeback-'))
  return routines.value.some((r) => r.program === p.name)
}

/** Is it the one Train follows? */
export function isFollowing(p: CatalogProgram): boolean {
  const cur = settings.value.program
  if (p.id === COMEBACK) return !cur && hasProgram(p)
  return !!cur && (cur.catalog === p.id || cur.name === p.name)
}

/** Add a catalogue program's routines (unless they're there) without following it. */
export async function addCatalogRoutines(p: CatalogProgram): Promise<number> {
  if (hasProgram(p)) return 0
  if (p.id === COMEBACK) {
    // Fixed ids, so workouts logged against the plan before stay linked to it.
    const list = seedRoutines()
    for (const r of list) await saveRoutine({ ...r, updatedAt: 0 })
    return list.length
  }
  if (!p.plan) throw new Error('This program has no routines')
  // Ids are fixed per program so two devices adding it end up with the same routines.
  let n = 0
  const result = resolvePlan(p.plan, exercises.value, () => `p-${p.id}-${++n}`)
  for (const e of result.newExercises) await saveExercise({ id: e.id, name: e.name, muscle: e.muscle, equipment: e.equipment, type: e.type as ExType, custom: true, updatedAt: 0 } as Exercise)
  for (const r of result.routines) await saveRoutine({ ...r, updatedAt: 0 })
  return result.routines.length
}

/**
 * Start (or switch to) a catalogue program from its first week: adds the routines and makes Train follow it.
 * `week` starts it part-way through (e.g. skip phase 1).
 */
export async function startCatalogProgram(id: string, week = 1): Promise<string> {
  const p = catalog.find((x) => x.id === id || x.name.toLowerCase() === String(id).toLowerCase())
  if (!p) throw new Error(`There's no program “${id}” in the library`)
  await addCatalogRoutines(p)
  const monday = startOfWeek(Date.now())
  const start = new Date(monday)
  start.setDate(start.getDate() - 7 * (Math.max(1, week) - 1))
  if (p.id === COMEBACK) {
    // The Comeback plan has its own card; it shows whenever no other program is followed.
    const before = workouts.value.some((w) => w.routineId?.startsWith('r-comeback-'))
    await saveSettings({ program: null, showPlan: true, ...(before && week === 1 && settings.value.planStart ? {} : { planStart: start.getTime() }) })
    return `${p.name} is on Train`
  }
  await saveSettings({
    program: {
      name: p.name,
      routineIds: [],
      daysPerWeek: p.daysPerWeek,
      minutes: p.minutes,
      summary: p.summary,
      start: start.getTime(),
      phases: p.phases.map(({ folder, weeks, days }) => ({ folder, weeks, days })),
      catalog: p.id,
    },
  })
  return `${p.name} started: week ${Math.max(1, week)}`
}

/** Follow a program of your own (routines you grouped under a program name): its folders become its phases. */
export async function followOwnProgram(name: string, weeksPerFolder = 0): Promise<string> {
  const list = routines.value.filter((r) => r.program === name).sort((a, b) => a.order - b.order)
  if (!list.length) throw new Error('This program has no routines yet')
  const folders = [...new Set(list.map((r) => r.folder))]
  const weeksIn = (f: string) => {
    const m = f.match(/weeks?\s*(\d+)\s*[–-]\s*(\d+)/i)
    return m ? Number(m[2]) - Number(m[1]) + 1 : weeksPerFolder || 4
  }
  await saveSettings({
    program: {
      name,
      routineIds: [],
      daysPerWeek: Math.max(...folders.map((f) => list.filter((r) => r.folder === f).length)),
      start: startOfWeek(Date.now()),
      phases: folders.map((f) => ({ folder: f, weeks: weeksIn(f), days: list.filter((r) => r.folder === f).length })),
    },
  })
  return `Following ${name}`
}
