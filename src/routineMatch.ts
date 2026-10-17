// Which routine the coach means. It sees routines as "Program / Folder / Name" (routinesText), and in a program
// the same day name repeats in every phase ("Day 2 · Full Body"), so the full path decides first; a bare name
// that several routines share goes to the one in the program Train follows.
import type { Routine } from './types'

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export function pickRoutine(list: Routine[], label: string, followed?: string): Routine | undefined {
  const n = norm(label)
  if (!n) return undefined
  const path = (r: Routine, withProgram: boolean) => norm([withProgram ? r.program : '', r.folder, r.name].filter(Boolean).join(' '))
  const exact = list.find((r) => path(r, true) === n) || list.find((r) => path(r, false) === n)
  if (exact) return exact
  const byName = list.filter((r) => norm(r.name) === n)
  if (byName.length) return byName.find((r) => r.program === followed) || byName[0]
  // a path spelled a little differently: routines it ends with, scored by how much of their folder ("Phase 1"
  // of "Phase 1 · Full Body (weeks 1–3)") and program it names, then the followed program
  const head = (f?: string) => norm(String(f || '').split(/[·(]/)[0])
  const score = (r: Routine) => (head(r.folder) && n.includes(head(r.folder)) ? 2 : 0) + (r.program && n.includes(norm(r.program)) ? 2 : 0) + (r.program === followed ? 1 : 0)
  const tail = list.filter((r) => norm(r.name) && n.endsWith(norm(r.name))).sort((x, y) => score(y) - score(x) || norm(y.name).length - norm(x.name).length)
  if (tail.length) return tail[0]
  return list.find((r) => norm(r.name).includes(n))
}
