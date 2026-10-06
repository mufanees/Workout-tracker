const FIT_EPOCH = 631065600;
const SPORTS = {
  0: "Workout",
  1: "Run",
  2: "Ride",
  4: "Cardio",
  5: "Swim",
  10: "Training",
  11: "Walk",
  15: "Row",
  17: "Hike"
};
const SUB_SPORTS = {
  1: "Treadmill",
  5: "Spin",
  6: "Indoor ride",
  14: "Indoor row",
  15: "Elliptical",
  16: "Stair climber",
  20: "Strength",
  26: "Cardio",
  27: "Indoor walk",
  43: "Yoga",
  45: "Indoor run",
  70: "HIIT"
};
const MAKERS = {
  1: "Garmin",
  23: "Suunto",
  32: "Wahoo",
  40: "Concept2",
  123: "Polar",
  260: "Zwift",
  265: "Strava",
  294: "COROS",
  305: "WHOOP",
  340: "Peloton"
};
function parseFit(buf) {
  const v = new DataView(buf);
  if (v.byteLength < 14) throw new Error("Not a FIT file");
  const headerSize = v.getUint8(0);
  const dataSize = v.getUint32(4, true);
  if (String.fromCharCode(v.getUint8(8), v.getUint8(9), v.getUint8(10), v.getUint8(11)) !== ".FIT") throw new Error("Not a FIT file");
  const endAt = Math.min(v.byteLength, headerSize + dataSize);
  const defs = /* @__PURE__ */ new Map();
  let p = headerSize;
  let lastTs = 0;
  const records = [];
  let session = null;
  let sport = null;
  let maker = null;
  const read = (f, little) => {
    const base = f.type & 31;
    const at = p;
    switch (f.size) {
      case 1: {
        const x = v.getUint8(at);
        if (base === 1) return x === 127 ? null : v.getInt8(at);
        return x === 255 ? null : x;
      }
      case 2: {
        const x = v.getUint16(at, little);
        if (base === 3) return x === 32767 ? null : v.getInt16(at, little);
        return x === 65535 ? null : x;
      }
      case 4: {
        if (base === 8) return v.getFloat32(at, little);
        const x = v.getUint32(at, little);
        if (base === 5) return x === 2147483647 ? null : v.getInt32(at, little);
        return x === 4294967295 ? null : x;
      }
      default:
        return null;
    }
  };
  while (p < endAt) {
    const h = v.getUint8(p++);
    if (h & 128) {
      const def = defs.get(h >> 5 & 3);
      if (!def) throw new Error("Damaged FIT file");
      const off = h & 31;
      let ts = (lastTs & ~31) + off;
      if (off < (lastTs & 31)) ts += 32;
      lastTs = ts;
      p = message(def, ts);
      continue;
    }
    const local = h & 15;
    if (h & 64) {
      p++;
      const little = v.getUint8(p++) === 0;
      const global = v.getUint16(p, little);
      p += 2;
      const n = v.getUint8(p++);
      const fields = [];
      for (let i = 0; i < n; i++, p += 3) fields.push({ num: v.getUint8(p), size: v.getUint8(p + 1), type: v.getUint8(p + 2) });
      let devSize = 0;
      if (h & 32) {
        const nd = v.getUint8(p++);
        for (let i = 0; i < nd; i++, p += 3) devSize += v.getUint8(p + 1);
      }
      defs.set(local, { global, little, fields, devSize });
    } else {
      const def = defs.get(local);
      if (!def) throw new Error("Damaged FIT file");
      p = message(def, null);
    }
  }
  function message(def, compressedTs) {
    const vals = {};
    for (const f of def.fields) {
      const x = read(f, def.little);
      if (x != null) vals[f.num] = x;
      p += f.size;
    }
    p += def.devSize;
    if (vals[253] != null) lastTs = vals[253];
    const ts = compressedTs ?? vals[253];
    if (def.global === 20 && ts != null && vals[3]) records.push([ts, vals[3]]);
    else if (def.global === 18 && !session) session = vals;
    else if (def.global === 12 && !sport) sport = vals;
    else if (def.global === 0 && maker == null && vals[1] != null) maker = vals[1];
    return p;
  }
  const s = session;
  const sp = sport;
  const firstTs = records[0]?.[0];
  const startS = s?.[2] ?? firstTs;
  if (startS == null) throw new Error("No activity in this file");
  const elapsed = s?.[7] != null ? s[7] / 1e3 : records.length ? records[records.length - 1][0] - startS : 0;
  const sportNum = s?.[5] ?? sp?.[0];
  const subNum = s?.[6] ?? sp?.[1];
  const name = subNum != null && SUB_SPORTS[subNum] || sportNum != null && SPORTS[sportNum] || "Cardio";
  const start = (startS + FIT_EPOCH) * 1e3;
  return {
    name,
    source: maker != null && MAKERS[maker] || null,
    start,
    end: start + Math.round(elapsed) * 1e3,
    calories: s?.[11] ?? null,
    distance: s?.[9] != null && s[9] > 0 ? s[9] / 100 : null,
    avgHr: s?.[16] ?? null,
    maxHr: s?.[17] ?? null,
    hr: records.map(([t, bpm]) => [t - startS, bpm]).filter(([t]) => t >= 0)
  };
}
function downsample(hr, step = 5) {
  const out = [];
  let bucket = -1;
  let sum = 0;
  let n = 0;
  for (const [t, bpm] of hr) {
    const b = Math.floor(t / step);
    if (b !== bucket && n) {
      out.push([bucket * step, Math.round(sum / n)]);
      sum = n = 0;
    }
    bucket = b;
    sum += bpm;
    n++;
  }
  if (n) out.push([bucket * step, Math.round(sum / n)]);
  return out;
}
function fitToWorkout(a) {
  const bits = [`Imported from ${a.source || "a FIT file"}`];
  if (a.calories) bits.push(`${a.calories} kcal`);
  if (a.distance) bits.push(`${(a.distance / 1e3).toFixed(2)} km`);
  return {
    id: `w-fit-${Math.round(a.start / 1e3)}`,
    name: a.name,
    routineId: null,
    start: a.start,
    end: a.end,
    notes: bits.join(" \xB7 "),
    exercises: [],
    hr: downsample(a.hr),
    targetZone: null,
    updatedAt: Date.now()
  };
}
export {
  downsample,
  fitToWorkout,
  parseFit
};
