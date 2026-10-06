// src/util.ts
var dayFmt = new Intl.DateTimeFormat(void 0, { weekday: "short", day: "numeric", month: "short" });
var dayYearFmt = new Intl.DateTimeFormat(void 0, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
var timeFmt = new Intl.DateTimeFormat(void 0, { hour: "numeric", minute: "2-digit" });
var monthFmt = new Intl.DateTimeFormat(void 0, { month: "long", year: "numeric" });
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// src/weightModel.ts
var DAY = 864e5;
function dailyWeighIns(list) {
  const by = /* @__PURE__ */ new Map();
  for (const b2 of list) {
    if (!(b2.kg > 0)) continue;
    const d = startOfDay(new Date(b2.date));
    const x = by.get(d);
    if (x) x.sum += b2.kg, x.n++, x.t = Math.min(x.t, b2.date);
    else by.set(d, { sum: b2.kg, n: 1, t: b2.date });
  }
  return [...by.entries()].sort((a2, b2) => a2[0] - b2[0]).map(([day, x]) => ({ day, kg: x.sum / x.n, t: x.t }));
}
var median = (xs) => {
  const s = [...xs].sort((a2, b2) => a2 - b2);
  const m2 = s.length >> 1;
  return s.length % 2 ? s[m2] : (s[m2 - 1] + s[m2]) / 2;
};
function scaleNoise(w) {
  const d = [];
  for (let i = 1; i < w.length; i++) if (Math.round((w[i].day - w[i - 1].day) / DAY) === 1) d.push(w[i].kg - w[i - 1].kg);
  if (d.length < 5) return 0.5;
  const m2 = median(d);
  const mad = median(d.map((x) => Math.abs(x - m2)));
  return Math.min(1.2, Math.max(0.15, 1.4826 * mad / Math.SQRT2));
}
var Q_LEVEL = 0.03 ** 2;
var Q_RATE = 4e-3 ** 2;
var predict = (x, P, dt) => {
  const xp = [x[0] + x[1] * dt, x[1]];
  const a2 = P[0][0] + dt * (P[1][0] + P[0][1]) + dt * dt * P[1][1];
  const b2 = P[0][1] + dt * P[1][1];
  const c = P[1][1];
  const q00 = Q_RATE * (dt ** 3 / 3) + Q_LEVEL * dt;
  const q01 = Q_RATE * (dt ** 2 / 2);
  const q11 = Q_RATE * dt;
  return [xp, [[a2 + q00, b2 + q01], [b2 + q01, c + q11]]];
};
function filter(w, R) {
  const steps = [];
  let x = [w[0].kg, 0];
  let P = [[R, 0], [0, 0.1 ** 2]];
  steps.push({ day: w[0].day, xf: x, Pf: P, xp: x, Pp: P, dt: 0 });
  for (let i = 1; i < w.length; i++) {
    const dt = (w[i].day - w[i - 1].day) / DAY;
    const [xp, Pp] = predict(x, P, dt);
    const S = Pp[0][0] + R;
    const k0 = Pp[0][0] / S;
    const k1 = Pp[1][0] / S;
    const y = w[i].kg - xp[0];
    x = [xp[0] + k0 * y, xp[1] + k1 * y];
    P = [
      [(1 - k0) * Pp[0][0], (1 - k0) * Pp[0][1]],
      [Pp[1][0] - k1 * Pp[0][0], Pp[1][1] - k1 * Pp[0][1]]
    ];
    steps.push({ day: w[i].day, xf: x, Pf: P, xp, Pp, dt });
  }
  return steps;
}
function smooth(steps) {
  const n = steps.length;
  const out = new Array(n);
  out[n - 1] = { x: steps[n - 1].xf, P: steps[n - 1].Pf };
  for (let i = n - 2; i >= 0; i--) {
    const { xf, Pf } = steps[i];
    const { xp, Pp, dt } = steps[i + 1];
    const PfFt = [
      [Pf[0][0] + dt * Pf[0][1], Pf[0][1]],
      [Pf[1][0] + dt * Pf[1][1], Pf[1][1]]
    ];
    const det = Pp[0][0] * Pp[1][1] - Pp[0][1] * Pp[1][0];
    const inv = [
      [Pp[1][1] / det, -Pp[0][1] / det],
      [-Pp[1][0] / det, Pp[0][0] / det]
    ];
    const C = [
      [PfFt[0][0] * inv[0][0] + PfFt[0][1] * inv[1][0], PfFt[0][0] * inv[0][1] + PfFt[0][1] * inv[1][1]],
      [PfFt[1][0] * inv[0][0] + PfFt[1][1] * inv[1][0], PfFt[1][0] * inv[0][1] + PfFt[1][1] * inv[1][1]]
    ];
    const nx = out[i + 1].x;
    const nP = out[i + 1].P;
    const dx = [nx[0] - xp[0], nx[1] - xp[1]];
    const x = [xf[0] + C[0][0] * dx[0] + C[0][1] * dx[1], xf[1] + C[1][0] * dx[0] + C[1][1] * dx[1]];
    const dP = [
      [nP[0][0] - Pp[0][0], nP[0][1] - Pp[0][1]],
      [nP[1][0] - Pp[1][0], nP[1][1] - Pp[1][1]]
    ];
    const CdP = [
      [C[0][0] * dP[0][0] + C[0][1] * dP[1][0], C[0][0] * dP[0][1] + C[0][1] * dP[1][1]],
      [C[1][0] * dP[0][0] + C[1][1] * dP[1][0], C[1][0] * dP[0][1] + C[1][1] * dP[1][1]]
    ];
    const P = [
      [Pf[0][0] + CdP[0][0] * C[0][0] + CdP[0][1] * C[0][1], Pf[0][1] + CdP[0][0] * C[1][0] + CdP[0][1] * C[1][1]],
      [Pf[1][0] + CdP[1][0] * C[0][0] + CdP[1][1] * C[0][1], Pf[1][1] + CdP[1][0] * C[1][0] + CdP[1][1] * C[1][1]]
    ];
    out[i] = { x, P };
  }
  return out;
}
function fastedBefore(list, t, hours = 24) {
  const from = t - hours * 36e5;
  let ms = 0;
  for (const f of list) {
    const a2 = Math.max(f.start, from);
    const b2 = Math.min(f.end ?? t, t);
    if (b2 > a2) ms += b2 - a2;
  }
  return ms / 36e5;
}
var WEEKDAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
var r1 = (x) => Math.round(x * 10) / 10;
var fmtKg = (x) => `${r1(Math.abs(x))} kg`;
var Z80 = 1.2816;
function weightModel({ list, fasts: fl = [], target = null, targetBy = null, now: now2 = Date.now() }) {
  const w = dailyWeighIns(list);
  if (!w.length) return null;
  const noise = scaleNoise(w);
  const R = noise ** 2;
  const steps = filter(w, R);
  const sm = smooth(steps);
  const last = steps[steps.length - 1];
  const spanDays = (w[w.length - 1].day - w[0].day) / DAY;
  const ready = w.length >= 6 && spanDays >= 10;
  const today = startOfDay(new Date(now2));
  const gap = Math.max(0, (today - last.day) / DAY);
  const [xNow, PNow] = gap ? predict(last.xf, last.Pf, gap) : [last.xf, last.Pf];
  const trend = xNow[0];
  const trendSd = Math.sqrt(PNow[0][0]);
  const rate = xNow[1] * 7;
  const rateSd = Math.sqrt(PNow[1][1]) * 7;
  const moving = Math.abs(rate) > 1.64 * rateSd;
  const pctPerWeek = rate / trend * 100;
  const series = sm.map((s, i) => ({ t: w[i].day, kg: s.x[0], sd: Math.sqrt(Math.max(0, s.P[0][0])) }));
  const forecast = [];
  if (ready) {
    const DAMP = 0.985;
    let x = xNow;
    let P = PNow;
    for (let d = 7; d <= 84; d += 7) {
      ;
      [x, P] = predict(x, P, 7);
      x = [x[0], x[1] * DAMP];
      const sd = Math.sqrt(P[0][0]);
      forecast.push({ t: today + d * DAY, kg: x[0], lo: x[0] - Z80 * sd, hi: x[0] + Z80 * sd });
    }
  }
  const at4 = forecast[3] || null;
  const at12 = forecast[11] || null;
  let eta = null;
  let etaLo = null;
  let etaHi = null;
  let needPerWeek = null;
  if (target != null && ready) {
    const toGo = target - trend;
    const when = (r) => r !== 0 && Math.sign(r) === Math.sign(toGo) ? today + toGo / r * 7 * DAY : null;
    const cap = (t) => t != null && t - today < 3 * 365 * DAY ? t : null;
    if (Math.abs(toGo) < 0.2) eta = today;
    else if (moving) {
      eta = cap(when(rate));
      const fast = when(rate + Math.sign(toGo) * Z80 * rateSd);
      const slow = when(rate - Math.sign(toGo) * Z80 * rateSd);
      etaLo = cap(fast);
      etaHi = cap(slow);
    }
    if (targetBy && targetBy > today) needPerWeek = toGo / ((targetBy - today) / (7 * DAY));
  }
  const patterns = [];
  const resid = w.map((x, i) => ({ ...x, r: x.kg - series[i].kg }));
  const latest = w[w.length - 1];
  const latestResid = resid[resid.length - 1].r;
  if (ready && Math.abs(latestResid) > Math.max(0.5, 1.5 * noise) && today - latest.day < 2 * DAY) {
    patterns.push({
      kind: "water",
      text: latestResid > 0 ? `Your latest reading is ${fmtKg(latestResid)} above your trend. That\u2019s water, salt or food in transit, not fat; the trend barely moves.` : `Your latest reading is ${fmtKg(latestResid)} below your trend, likely water. Don\u2019t bank it yet; the trend is the number to watch.`
    });
  }
  if (spanDays >= 21) {
    const byDay = Array.from({ length: 7 }, () => []);
    for (const x of resid) byDay[new Date(x.day).getDay()].push(x.r);
    let best = null;
    byDay.forEach((xs, d) => {
      if (xs.length < 2) return;
      const mean = xs.reduce((a2, b2) => a2 + b2, 0) / xs.length;
      const se = noise / Math.sqrt(xs.length);
      if (Math.abs(mean) >= 0.35 && Math.abs(mean) > 2.7 * se && (!best || Math.abs(mean) > Math.abs(best.mean))) best = { d, mean, se };
    });
    if (best) {
      const b2 = best;
      patterns.push({ kind: "weekday", text: `${WEEKDAYS[b2.d]} usually read ${fmtKg(b2.mean)} ${b2.mean > 0 ? "above" : "below"} your trend${b2.mean > 0 && (b2.d === 1 || b2.d === 0) ? " (the weekend shows up on the scale)" : ""}. Don\u2019t read much into them.` });
    }
  }
  if (fl.length) {
    const fasted = [];
    const fed = [];
    for (const x of resid) (fastedBefore(fl, x.t) >= 14 ? fasted : fed).push(x.r);
    if (fasted.length >= 4 && fed.length >= 4) {
      const m2 = (xs) => xs.reduce((a2, b2) => a2 + b2, 0) / xs.length;
      const diff = m2(fasted) - m2(fed);
      const se = noise * Math.sqrt(1 / fasted.length + 1 / fed.length);
      if (Math.abs(diff) >= 0.25 && Math.abs(diff) > 2 * se)
        patterns.push({ kind: "fast", text: diff < 0 ? `After a 14 h+ fast the scale reads about ${fmtKg(diff)} lower than your trend. Most of that is water and glycogen and comes back when you eat; the trend already accounts for it.` : `Oddly, mornings after a long fast read ${fmtKg(diff)} higher than your trend; worth checking what the refeed meal looks like.` });
    }
  }
  if (ready && spanDays >= 35) {
    const idx = steps.findIndex((s) => s.day >= last.day - 21 * DAY);
    const then = idx > 0 ? { x: steps[idx].xf, P: steps[idx].Pf } : null;
    if (then) {
      const rThen = then.x[1] * 7;
      const sdThen = Math.sqrt(then.P[1][1]) * 7;
      const wasMoving = Math.abs(rThen) > 1.64 * sdThen;
      const toward = target == null || Math.sign(rThen) === Math.sign(target - then.x[0]);
      if (wasMoving && toward && !moving) patterns.push({ kind: "plateau", text: `Your trend has flattened over the last three weeks after ${rThen < 0 ? "losing" : "gaining"} ${fmtKg(rThen)} a week. Plateaus are normal; if it holds another two weeks, it\u2019s time to adjust food or activity.` });
    }
  }
  if (ready && moving) {
    if (pctPerWeek < -1) patterns.push({ kind: "pace", text: `You\u2019re losing about ${r1(-pctPerWeek)}% of your body weight a week, on the fast side. Keep protein high and keep lifting so most of it comes off as fat.` });
    else if (pctPerWeek <= -0.25) patterns.push({ kind: "pace", text: `Losing about ${r1(-pctPerWeek)}% of your body weight a week: a sustainable pace that keeps muscle.` });
  }
  return { n: w.length, spanDays, ready, latest, trend, trendSd, rate, rateSd, moving, pctPerWeek, noise, series, forecast, at4, at12, target, eta, etaLo, etaHi, needPerWeek, patterns };
}
function weightModelText(m2) {
  if (!m2) return "No weigh-ins yet.";
  const d = (t) => new Date(t).toISOString().slice(0, 10);
  const L = [`${m2.n} weigh-in days over ${Math.round(m2.spanDays)} days; scale noise \xB1${r1(m2.noise)} kg day to day.`];
  L.push(`Trend weight now ${r1(m2.trend)} kg (latest scale ${r1(m2.latest.kg)} kg on ${d(m2.latest.day)}).`);
  if (!m2.ready) L.push("Not enough data yet for a reliable rate (needs ~6 weigh-ins over 10+ days).");
  else {
    L.push(`Rate ${m2.rate >= 0 ? "+" : ""}${r1(m2.rate)} \xB1 ${r1(m2.rateSd)} kg/week (${m2.moving ? m2.rate < 0 ? "clearly losing" : "clearly gaining" : "not distinguishable from holding steady"}; ${r1(m2.pctPerWeek)}% of body weight a week).`);
    if (m2.at4) L.push(`Forecast (80% range): in 4 weeks ${r1(m2.at4.kg)} kg (${r1(m2.at4.lo)}\u2013${r1(m2.at4.hi)}), in 12 weeks ${m2.at12 ? `${r1(m2.at12.kg)} kg (${r1(m2.at12.lo)}\u2013${r1(m2.at12.hi)})` : "?"}.`);
    if (m2.target != null) L.push(m2.eta ? `Target ${r1(m2.target)} kg: around ${d(m2.eta)}${m2.etaLo && m2.etaHi ? ` (likely ${d(m2.etaLo)} to ${d(m2.etaHi)})` : m2.etaLo ? ` (from ${d(m2.etaLo)}, could stall)` : ""}.` : `Target ${r1(m2.target)} kg: no date yet, ${m2.moving ? "moving away from it" : "holding steady"} at the moment.`);
  }
  for (const p of m2.patterns) L.push(`Pattern: ${p.text}`);
  return L.join("\n");
}

// ../../../tmp/claude-0/-home-user-Workout-tracker/7e553bdd-1e91-54a0-9d08-274537fd6744/scratchpad/wm-test.ts
var seed = 7;
var rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
var gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
var DAY2 = 864e5;
var now = new Date(2026, 9, 3, 9).getTime();
function sim(days, ratePerWeek, opts = {}) {
  const list = [], fasts = [];
  for (let i = days; i >= 0; i--) {
    const t = now - i * DAY2;
    const d = new Date(t);
    const elapsed = days - i;
    const r = opts.plateauFrom != null && elapsed > opts.plateauFrom ? 0 : ratePerWeek;
    const trueW = 90 + (ratePerWeek * Math.min(elapsed, opts.plateauFrom ?? 1e9) + r * Math.max(0, elapsed - (opts.plateauFrom ?? 1e9))) / 7;
    const fasted = i % 3 === 0;
    if (fasted) fasts.push({ id: "f" + i, start: t - 18 * 36e5, end: t + 36e5, goal: 16, updatedAt: 0 });
    if (rnd() < 0.25) continue;
    let kg = trueW + 0.6 * gauss();
    if (opts.mon && d.getDay() === 1) kg += opts.mon;
    if (opts.fast && fasted) kg += opts.fast;
    list.push({ id: "b" + i, date: t, kg: Math.round(kg * 10) / 10, updatedAt: 0 });
  }
  return { list, fasts };
}
var a = sim(60, -0.5, { mon: 0.6, fast: -0.7 });
var m = weightModel({ list: a.list, fasts: a.fasts, target: 85, now });
console.log("== losing 0.5/wk, Monday +0.6, fasted -0.7, target 85");
console.log(weightModelText(m));
console.log("rate", m.rate.toFixed(2), "\xB1", m.rateSd.toFixed(2), "| noise", m.noise.toFixed(2), "| true trend now", (90 - 0.5 * 60 / 7).toFixed(2));
var b = sim(70, -0.6, { plateauFrom: 45 });
console.log("\n== plateau after day 45, target 80");
console.log(weightModelText(weightModel({ list: b.list, fasts: [], target: 80, now })));
console.log("\n== 4 weigh-ins only");
console.log(weightModelText(weightModel({ list: a.list.slice(-4), fasts: [], target: 85, now })));
console.log("\n== flat, noisy");
console.log(weightModelText(weightModel({ list: sim(40, 0).list, now })));
