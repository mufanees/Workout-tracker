// The coach's training knowledge: evidence-based principles written for this app (not copied
// from any one source). A short core goes into every request (KNOWLEDGE_CORE); the detailed
// sections are looked up with the training_knowledge tool. The athlete's own material (videos,
// PDFs, notes) lives in their library and is searched with searchLibrary().

export const KNOWLEDGE_CORE = `Training principles (look up detail with training_knowledge):
- Volume: muscle growth rises with hard sets per muscle per week, with diminishing returns. Roughly: 1–4 hard sets a week gets well over half of what 10+ sets gets, 5–9 sets most of it, 10–20 is the usual target for growth. Splitting a muscle's sets over 2+ days a week works a little better than one day. Strength needs less: a few heavy sets (1–6 reps) per lift per week give most of the strength gain. Health benefits plateau around 30–60 minutes of lifting a week.
- Effort: count only hard sets (within about 0–3 reps of failure). The less volume, the closer each set should be to failure. Compounds 1–2 reps in reserve, isolation exercises can go to failure. Returning lifters start at 2–3 in reserve and get closer over a few weeks.
- Minimalist methods for short sessions: a heavy top set plus a lighter back-off set; drop sets and myo-reps on isolation work; supersets of non-competing muscles (push with pull, upper with lower) instead of resting; rests of 1–2 min shrinking gradually as fitness improves; a 3–5 minute warm-up plus 1–2 ramp-up sets for the first lift only.
- Progression: double progression (reach the top of the rep range on every set, then add the smallest load jump). With capped dumbbells keep progressing with more reps (sets to 20–30 reps still build muscle when close to failure), slower lowering (3–4 s), pauses, 1½ reps, single-limb versions, shorter rests and band resistance; time heavier dumbbells for when those run out.
- Deload every 6–8 weeks or when performance stalls 2+ sessions with poor recovery: about half the sets, same weights, 1 week.
- Recovery and food: sleep 7–9 h, protein about 1.6–2.2 g/kg a day spread over the eating window; strength gains slow in a big deficit, so keep the deficit moderate while chasing a strength goal; train close to the eating window when fasting if performance suffers.
- Pain (physio rules): pain up to about 3/10 during exercise that settles within 24 h is acceptable; sharp, pinching or worsening pain means modify (range, grip, load, tempo) or swap; worsening week to week or night pain means a physio. Never diagnose.`

/** Detailed sections for the training_knowledge tool. Keys are topics; text is plain, compact. */
export const KNOWLEDGE = {
  volume: `VOLUME AND FREQUENCY
- Count hard sets per muscle per week (sets within ~0–3 reps of failure). Compounds count for every muscle they train hard (a row counts for back and about half for biceps).
- Dose-response for growth (pooled studies, mostly untrained to intermediate): 1–4 sets/week ≈ 60–65% of the growth of 10+ sets; 5–9 ≈ 80–85%; 10–20 is the standard target; more than 20 helps some advanced lifters slightly. Low-volume programs work far better than people expect, especially with high effort.
- Frequency: hitting a muscle 2x a week (e.g. 2 full-body sessions) usually beats 1x for the same sets, mainly by spreading sets so each is higher quality.
- Strength: exposure to heavy loads (about 1–6 reps) matters most; 1–4 sets per lift per week capture most strength gains. Back-off sets add a little more.
- Maintenance needs far less: about a third or less of building volume holds muscle for months if effort stays high.
- Advanced lifters need more volume to keep progressing at the same rate, but can still progress on low volume with high effort.`,

  effort: `EFFORT (RIR = reps in reserve)
- RIR 0 = failure, RIR 2 = could have done 2 more. Most people underestimate how many reps they have left until they've tested failure on safe exercises a few times.
- Growth needs sets close to failure (about 0–3 RIR). Further than ~4 RIR counts as warm-up volume.
- Fewer sets → push each closer to failure. Minimalist programs live at 0–2 RIR; programs that cap at RIR 1–3 rely on more sets.
- Compounds with high injury/fatigue cost (squat patterns, RDLs, presses): 1–2 RIR, occasionally 0 on the last set when form is perfect. Isolation (curls, raises, extensions, calves): failure is fine, plus drop sets / myo-reps.
- Returning after time off: 2–3 RIR for the first 2–3 weeks while technique and tendons adapt, then move closer.
- Use RIR to progress: if the last set was RIR 3+, add reps or load next time; RIR 0 on early sets means the load is too heavy for the rep target.`,

  minimalist: `MINIMALIST / TIME-EFFICIENT TRAINING
- Prioritise: big compound per pattern (squat, hinge, push, pull) + a few isolation finishers for arms, delts, calves.
- Top set + back-off: one heavy set (e.g. 4–6 reps) then one lighter set (8–10 reps, about 10–15% lighter). Strength and size in two sets.
- Drop set: reach failure (or 0–1 RIR), immediately reduce the weight 25–50%, continue to failure. Best on isolation and dumbbell work (grab a lighter pair). Adds near-free volume.
- Myo-reps: an activation set of 12–20 reps near failure, rest 3–5 breaths, then mini-sets of 3–5 reps with the same weight and short breaths until reps drop off. Equivalent to several sets in a fraction of the time.
- Sensible supersets: pair exercises that don't compete (press + row, squat + curl, RDL + lateral raise). Don't superset two exercises for the same muscle if both matter.
- Rest: 1–3 min is standard for growth; shorter rest costs reps unless it's reduced gradually (e.g. 15 s less each week) as conditioning improves. Supersets give each muscle its rest while you keep working.
- Warm-up: 3–5 min general (brisk movement, joint circles, the athlete's shoulder prep), then 1–2 ramp-up sets of the first exercise only. Later exercises are warm already.
- Session template for 30 hard minutes: 4 min warm-up; 2–3 supersets of 2 exercises × 2 sets each; finisher drop set or myo-reps. That's 10–14 hard sets per session; 3 sessions ≈ 6–10 sets per major muscle per week, which captures most of the possible gains.`,

  progression: `PROGRESSION
- Double progression: pick a rep range (e.g. 8–12). Keep the weight until all working sets reach the top with the target RIR, then add the smallest jump (dumbbells: 1–2 kg per hand) and start again at the bottom of the range.
- Expected rates for a returning lifter: fast regains for the first 4–8 weeks (muscle memory), then lower body ~1–2 kg per dumbbell per month, upper body ~0.5–1 kg, slowing with time. Estimates of one-rep max rise faster early.
- When the dumbbells max out (e.g. 24 kg): raise the rep range (12–20, even 20–30 for hypertrophy near failure); slow the lowering to 3–4 s; add pauses at the hardest point; do 1½ reps; switch to single-limb versions (split squat → Bulgarian split squat, RDL → single-leg RDL, floor press → single-arm floor press); add a band over the dumbbell; shorten rest; add a drop set. Then plan heavier dumbbells: buy when reps at 24 kg exceed ~15 on the main lifts.
- Stall rule: same weight, no more reps for 3 sessions → check sleep/effort/frequency first; then a lighter week (~70–80%, fewer sets) or a variation change.
- Track the top set of the main lift: it's the signal for strength goals.`,

  dumbbells: `DUMBBELL + BAND + FLOOR EXERCISE MENU (no bench, no pull-up bar)
- Squat/knee: goblet squat (heels elevated on plates for quads), dumbbell squat, split squat, Bulgarian split squat (rear foot on a couch/chair), reverse lunge, step-up onto a sturdy step or stairs, cyclist squat.
- Hinge/hamstrings: dumbbell RDL, single-leg RDL, B-stance RDL, floor glute bridge / single-leg hip thrust with a dumbbell, slider or towel leg curl on a smooth floor, band leg curl (band anchored low, lying face down).
- Horizontal push: dumbbell floor press (shoulder-friendly: limits the bottom range), single-arm floor press, push-ups (deficit on dumbbell handles, feet elevated for upper chest, weighted with a band across the back).
- Vertical push: half-kneeling one-arm press, standing press, landmine-style angled press with a dumbbell; pike push-up.
- Horizontal pull: bent-over dumbbell row, one-arm row braced on a knee/couch, Kroc row (heavier, more reps), band row.
- Vertical pull (no bar): band lat pulldown (band anchored high in a door), kneeling single-arm band pulldown, dumbbell pullover on the floor, high-anchor band row.
- Shoulders: dumbbell lateral raise, lean-away lateral raise, band lateral raise, band face pull, rear delt fly, band pull-apart.
- Arms: dumbbell curl, hammer curl, incline-style curl lying on the floor, band curl; overhead dumbbell triceps extension, floor skull crusher, band pushdown, close-grip floor press.
- Calves: single-leg dumbbell calf raise on a step (pause at the bottom).
- Core: dead bug, plank variations, band Pallof press, band crunch, suitcase carry.
- Gym → home swaps: lat pulldown → band pulldown; T-bar/chest-supported row → bent-over or braced one-arm row; leg curl → slider/band leg curl; hack squat/leg press → heel-elevated goblet squat or Bulgarian split squat; Smith/incline press → feet-elevated push-up or single-arm floor press; cable/machine lateral raise → dumbbell or band lateral raise; cable triceps → overhead dumbbell extension or band pushdown; leg-press calf → single-leg calf raise; cable crunch → band crunch.`,

  programs: `PROGRAM DESIGN
- Choose the split from days available: 2 days → 2 full-body; 3 days → 3 full-body (A/B/C) or heavy-lower/heavy-upper/full; 4 → upper/lower ×2; 5 → upper/lower + push/pull/legs.
- Each session: one main compound per pattern in a rotation so each muscle gets 2+ exposures a week; heavy rep ranges (4–8) on the first lift, moderate (8–12) on the rest, high (12–20) on isolation.
- Fit the time: estimate ~2–2.5 min per straight set including rest, ~1.5 min per set when supersetted, plus warm-up. A 30-minute session holds about 10–14 hard sets.
- Keep exercises stable for 4–8 weeks so progress is measurable; change variations at block boundaries or for pain.
- Build around constraints: equipment caps, injuries (shoulder-friendly pressing), schedule (missed sessions just continue the rotation; never "make up" by doubling).
- Weekly check per muscle: chest, back, quads, hamstrings/glutes, shoulders, arms, calves each ≥4–6 hard sets for a minimalist plan, ≥10 for a standard one.
- Blending a structured plan into a minimalist one: keep its phase logic, shoulder prep and the lifts that serve the goal; cut sets to 2 per exercise near failure, superset non-competing pairs, add a drop set or myo-reps finisher, and drop the low-value extras.`,

  deload: `DELOADS AND BLOCKS
- Deload every 6–8 weeks, or early when performance drops for 2+ sessions alongside poor sleep/energy or achy joints: keep the weights, cut sets about in half, stop 3+ reps short of failure, one week.
- Blocks: 4–8 weeks with one focus (build volume, then heavier), then a deload, then reassess goals and maxes.
- After illness or 1–2 weeks off: repeat the last completed week at the same weights; after longer breaks, drop ~10–20% and ramp back over 2 weeks.`,

  recovery: `RECOVERY, SLEEP, NUTRITION, FASTING
- Sleep 7–9 h; short sleep lowers performance and gains. On a bad-sleep day keep the main lift, drop a set, avoid failure.
- Protein ~1.6–2.2 g per kg body weight per day, 3–4 feedings of 0.4 g/kg where possible. In a 16:8 fasting window: 2–3 protein-rich meals.
- Calories: a moderate deficit (~0.5% body weight per week) still allows strength gains for a returning lifter; aggressive deficits stall strength goals. Prioritise the goal: chasing a lift → maintenance or small deficit.
- Fasted training is fine for most; if strength drops, train nearer the eating window or break the fast after training with protein.
- Zone 2 cardio supports recovery and health; keep it separate from heavy leg sessions or after lifting.
- Stress and energy matter: several rough days explain a stall better than the program does.`,

  pain: `PAIN, INJURY AND PHYSIO RULES (not a diagnosis)
- Traffic light: 0–3/10 pain during exercise that settles by the next day = green, continue; 4–5/10 or lingering = amber, modify (less range, different grip/angle, lighter, slower tempo); sharp, pinching, worsening, numbness/tingling or night pain = red, stop that movement and see a physio.
- Shoulder-friendly pressing: neutral grip (palms facing), elbows about 30–45° from the body, floor press to limit the bottom range, single-arm and half-kneeling presses, avoid painful arcs; keep rows and rear-delt/face-pull work at least equal to pressing.
- Shoulder prep (2–3 min): band pull-aparts, external rotations, scapular push-ups, wall slides.
- Tendons respond to load: slow heavy reps and isometrics (30–45 s holds) often calm tendon pain; rest alone rarely fixes it.
- Stiffness that eases with warm-up is usually fine; stiffness rising week to week means reduce load and see a physio.
- Never diagnose; describe what to try and when to get it checked.`,

  returning: `RETURNING AFTER TIME OFF
- Muscle memory makes regains faster than first-time gains. Expect quick strength jumps for 4–8 weeks.
- Start with fewer sets (1–2 per exercise) at 2–3 RIR, add sets or effort weekly; joints and tendons lag muscles.
- Re-learn technique on the main lifts first; use the first weeks to find working weights rather than test maxes.`,
}

export const KNOWLEDGE_TOPICS = Object.keys(KNOWLEDGE)

const words = (s) => String(s || '').toLowerCase().match(/[a-z0-9]+/g) || []

/** The best-matching knowledge sections for a topic name or free-text question. */
export function knowledgeLookup(query) {
  const q = String(query || '').toLowerCase().trim()
  if (KNOWLEDGE[q]) return KNOWLEDGE[q]
  const qw = new Set(words(q).filter((w) => w.length > 2))
  const scored = Object.entries(KNOWLEDGE)
    .map(([k, text]) => {
      const tw = words(text)
      let score = qw.has(k) ? 10 : 0
      for (const w of tw) if (qw.has(w)) score++
      return { k, text, score }
    })
    .sort((a, b) => b.score - a.score)
  const hits = scored.filter((x) => x.score > 0).slice(0, 2)
  return (hits.length ? hits : scored.slice(0, 1)).map((x) => x.text).join('\n\n') + `\n\n(Topics: ${KNOWLEDGE_TOPICS.join(', ')})`
}

/**
 * Search the athlete's library (coach items of kind "source": text = title, body = content)
 * for the passages that best match a question. Returns plain text with titles.
 */
export function searchLibrary(items, query, max = 6) {
  const sources = (items || []).filter((x) => x && x.kind === 'source' && !x.deleted && x.body)
  if (!sources.length) return 'The library is empty. The athlete can add videos, PDFs and notes on the coach memory screen or by pasting them in chat.'
  const qw = new Set(words(query).filter((w) => w.length > 2))
  const chunks = []
  for (const s of sources) {
    const paras = String(s.body)
      .split(/\n\s*\n|(?<=\.)\s{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
    // Merge short paragraphs into ~600-character passages.
    let buf = ''
    for (const p of paras) {
      buf = buf ? `${buf}\n${p}` : p
      if (buf.length > 600) chunks.push({ s, text: buf }), (buf = '')
    }
    if (buf) chunks.push({ s, text: buf })
  }
  const scored = chunks
    .map((c) => {
      let score = 0
      const tw = words(c.text)
      for (const w of tw) if (qw.has(w)) score++
      for (const w of words(c.s.text)) if (qw.has(w)) score += 3
      return { ...c, score: score / Math.sqrt(Math.max(20, tw.length)) }
    })
    .sort((a, b) => b.score - a.score)
  const hits = (qw.size ? scored.filter((c) => c.score > 0) : scored).slice(0, max)
  if (!hits.length) return `Nothing in the library matches "${query}". Titles: ${sources.map((s) => `[${s.id}] ${s.text}`).join('; ')}`
  return hits.map((h) => `From "${h.s.text}" [${h.s.id}]:\n${h.text.slice(0, 1200)}`).join('\n\n---\n\n')
}
