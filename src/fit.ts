// Reads a .FIT activity file (Wahoo, Garmin, Zwift, Strava exports) into a workout:
// sport, start, length, calories and the heart rate trace. A small reader for the parts
// of the FIT protocol we need, so the app doesn't carry the whole SDK.
import type { Workout } from './types'

const FIT_EPOCH = 631065600 // 1989-12-31T00:00:00Z in Unix seconds

const SPORTS: Record<number, string> = {
  0: 'Workout', 1: 'Run', 2: 'Ride', 4: 'Cardio', 5: 'Swim', 10: 'Training', 11: 'Walk', 15: 'Row', 17: 'Hike',
}
const SUB_SPORTS: Record<number, string> = {
  1: 'Treadmill', 5: 'Spin', 6: 'Indoor ride', 14: 'Indoor row', 15: 'Elliptical', 16: 'Stair climber',
  20: 'Strength', 26: 'Cardio', 27: 'Indoor walk', 43: 'Yoga', 45: 'Indoor run', 70: 'HIIT',
}

const MAKERS: Record<number, string> = {
  1: 'Garmin', 23: 'Suunto', 32: 'Wahoo', 40: 'Concept2', 123: 'Polar', 260: 'Zwift', 265: 'Strava', 294: 'COROS', 305: 'WHOOP', 340: 'Peloton',
}

export interface FitActivity {
  name: string
  source: string | null // the app or device that wrote the file
  start: number // ms
  end: number // ms
  calories: number | null
  distance: number | null // metres
  avgHr: number | null
  maxHr: number | null
  hr: [number, number][] // [seconds since start, bpm], one per second as recorded
}

interface FieldDef {
  num: number
  size: number
  type: number
}
interface Def {
  global: number
  little: boolean
  fields: FieldDef[]
  devSize: number
}

export function parseFit(buf: ArrayBuffer): FitActivity {
  const v = new DataView(buf)
  if (v.byteLength < 14) throw new Error('Not a FIT file')
  const headerSize = v.getUint8(0)
  const dataSize = v.getUint32(4, true)
  if (String.fromCharCode(v.getUint8(8), v.getUint8(9), v.getUint8(10), v.getUint8(11)) !== '.FIT') throw new Error('Not a FIT file')
  const endAt = Math.min(v.byteLength, headerSize + dataSize)

  const defs = new Map<number, Def>()
  let p = headerSize
  let lastTs = 0
  const records: [number, number][] = [] // [unix s, bpm]
  let session: Record<number, number> | null = null
  let sport: Record<number, number> | null = null
  let maker: number | null = null

  const read = (f: FieldDef, little: boolean): number | null => {
    // Only single numeric values matter here; arrays and strings are skipped.
    const base = f.type & 0x1f
    const at = p
    switch (f.size) {
      case 1: {
        const x = v.getUint8(at)
        if (base === 1) return x === 0x7f ? null : v.getInt8(at)
        return x === 0xff ? null : x
      }
      case 2: {
        const x = v.getUint16(at, little)
        if (base === 3) return x === 0x7fff ? null : v.getInt16(at, little)
        return x === 0xffff ? null : x
      }
      case 4: {
        if (base === 8) return v.getFloat32(at, little)
        const x = v.getUint32(at, little)
        if (base === 5) return x === 0x7fffffff ? null : v.getInt32(at, little)
        return x === 0xffffffff ? null : x
      }
      default:
        return null
    }
  }

  while (p < endAt) {
    const h = v.getUint8(p++)
    if (h & 0x80) {
      // Compressed timestamp header: data message with a 5-bit time offset.
      const def = defs.get((h >> 5) & 3)
      if (!def) throw new Error('Damaged FIT file')
      const off = h & 0x1f
      let ts = (lastTs & ~0x1f) + off
      if (off < (lastTs & 0x1f)) ts += 0x20
      lastTs = ts
      p = message(def, ts)
      continue
    }
    const local = h & 0x0f
    if (h & 0x40) {
      // Definition message.
      p++ // reserved
      const little = v.getUint8(p++) === 0
      const global = v.getUint16(p, little)
      p += 2
      const n = v.getUint8(p++)
      const fields: FieldDef[] = []
      for (let i = 0; i < n; i++, p += 3) fields.push({ num: v.getUint8(p), size: v.getUint8(p + 1), type: v.getUint8(p + 2) })
      let devSize = 0
      if (h & 0x20) {
        const nd = v.getUint8(p++)
        for (let i = 0; i < nd; i++, p += 3) devSize += v.getUint8(p + 1)
      }
      defs.set(local, { global, little, fields, devSize })
    } else {
      const def = defs.get(local)
      if (!def) throw new Error('Damaged FIT file')
      p = message(def, null)
    }
  }

  function message(def: Def, compressedTs: number | null): number {
    const vals: Record<number, number> = {}
    for (const f of def.fields) {
      const x = read(f, def.little)
      if (x != null) vals[f.num] = x
      p += f.size
    }
    p += def.devSize
    if (vals[253] != null) lastTs = vals[253]
    const ts = compressedTs ?? vals[253]
    if (def.global === 20 && ts != null && vals[3]) records.push([ts, vals[3]])
    else if (def.global === 18 && !session) session = vals
    else if (def.global === 12 && !sport) sport = vals
    else if (def.global === 0 && maker == null && vals[1] != null) maker = vals[1]
    return p
  }

  const s = session as Record<number, number> | null
  const sp = sport as Record<number, number> | null
  const firstTs = records[0]?.[0]
  const startS = s?.[2] ?? firstTs
  if (startS == null) throw new Error('No activity in this file')
  const elapsed = s?.[7] != null ? s[7] / 1000 : records.length ? records[records.length - 1][0] - startS : 0
  const sportNum = s?.[5] ?? sp?.[0]
  const subNum = s?.[6] ?? sp?.[1]
  const name = (subNum != null && SUB_SPORTS[subNum]) || (sportNum != null && SPORTS[sportNum]) || 'Cardio'
  const start = (startS + FIT_EPOCH) * 1000
  return {
    name,
    source: (maker != null && MAKERS[maker]) || null,
    start,
    end: start + Math.round(elapsed) * 1000,
    calories: s?.[11] ?? null,
    distance: s?.[9] != null && s[9] > 0 ? s[9] / 100 : null,
    avgHr: s?.[16] ?? null,
    maxHr: s?.[17] ?? null,
    hr: records.map(([t, bpm]) => [t - startS, bpm] as [number, number]).filter(([t]) => t >= 0),
  }
}

/** The app keeps one heart rate value per 5 s; average each 5-second window. */
export function downsample(hr: [number, number][], step = 5): [number, number][] {
  const out: [number, number][] = []
  let bucket = -1
  let sum = 0
  let n = 0
  for (const [t, bpm] of hr) {
    const b = Math.floor(t / step)
    if (b !== bucket && n) {
      out.push([bucket * step, Math.round(sum / n)])
      sum = n = 0
    }
    bucket = b
    sum += bpm
    n++
  }
  if (n) out.push([bucket * step, Math.round(sum / n)])
  return out
}

/** A finished cardio workout from a FIT activity. The id comes from the start time, so importing the same file twice replaces it. */
export function fitToWorkout(a: FitActivity): Workout {
  const bits = [`Imported from ${a.source || 'a FIT file'}`]
  if (a.calories) bits.push(`${a.calories} kcal`)
  if (a.distance) bits.push(`${(a.distance / 1000).toFixed(2)} km`)
  return {
    id: `w-fit-${Math.round(a.start / 1000)}`,
    name: a.name,
    routineId: null,
    start: a.start,
    end: a.end,
    notes: bits.join(' · '),
    exercises: [],
    hr: downsample(a.hr),
    targetZone: null,
    updatedAt: Date.now(),
  }
}
