export interface CatalogPhase {
  folder: string
  weeks: number
  days: number
  summary?: string
}
export interface CatalogProgram {
  id: string
  name: string
  by?: string
  weeks: number
  daysPerWeek: number
  minutes?: number
  equipment: string
  summary: string
  phases: CatalogPhase[]
  /** Plan-import JSON: { program, routines: [{ folder, name, notes, warmup, cooldown, exercises }] }; missing for built-ins built in code. */
  plan?: { program: string; routines: unknown[] }
}
export const PROGRAM_CATALOG: CatalogProgram[]
export function programCatalogText(): string
