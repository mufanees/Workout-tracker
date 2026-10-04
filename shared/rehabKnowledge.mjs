// The coach's physiotherapy and occupational therapy knowledge: stretching and mobility, each body
// region, common aches, desk and daily-life ergonomics, pacing and red flags. Written for this app
// from widely taught clinical guidance (not copied from any one source); it is general guidance,
// never a diagnosis. Also the rehab and mobility exercises the main exercise library lacks, with
// steps and doses, and findStretches(), which picks stretches and exercises for an area or problem
// from these and from the public-domain stretch catalogue (shared/stretches.json).
import STRETCHES from './stretches.json' with { type: 'json' }

export const REHAB_CORE = `Physio and OT (look up detail with training_knowledge; pick stretches with find_stretches):
- Stretching: static holds of 20–45 s, 2–4 times, most days improve range over weeks; before lifting use dynamic moves and warm-up sets instead of long static holds. Mobility you don't load fades: add strength through the new range.
- Aches without injury: keep moving within tolerable discomfort, change positions often, load gradually; rest alone rarely fixes tendon, back or neck pain. Pacing beats boom-and-bust.
- Red flags (stop and see a doctor promptly, urgently for the first three): numbness in the groin or buttocks, new bladder or bowel trouble, or weakness spreading in the legs; chest pain, fainting or severe breathlessness; pain after a fall or big impact with swelling or inability to bear weight; unexplained weight loss, fever, night sweats or constant night pain; a hot, red, swollen joint; pain spreading down an arm or leg with numbness, pins and needles or weakness.`

/** Detailed sections, merged into the training_knowledge topics. */
export const REHAB_KNOWLEDGE = {
  stretching: `STRETCHING AND FLEXIBILITY
- Static stretching: ease into a position of mild-to-moderate tension (about 3–5/10, never pain), hold 20–45 s, breathe slowly, repeat 2–4 times. About 5–10 minutes per muscle group per week, spread over most days, improves range in 4–8 weeks. Gains fade within weeks if stopped.
- Much of the gain is tolerance (the nervous system allowing more range) rather than longer muscle, so consistency matters more than force. Never bounce into end range.
- Before training: long static holds (60 s+) can slightly reduce strength and power straight after; short holds (under 30 s) inside a dynamic warm-up are fine. Best warm-up: 3–5 minutes of easy movement, dynamic moves through the ranges you'll use, then lighter ramp-up sets.
- After training or in the evening is a good time for static stretching; it does not prevent next-day soreness or injury on its own.
- PNF (contract-relax): stretch, then push gently against the stretch (about 20–30% effort) for 5 s, relax, then ease a little further; 2–4 rounds. Gives slightly faster range gains.
- Loaded stretching: strength work through full range (deep goblet squats, Romanian deadlifts, Bulgarian split squats, deficit push-ups, slow lowering) improves flexibility about as well as stretching, and builds strength there too. For capped dumbbells this is a double win.
- Who should go gently: hypermobile people (easily bend past normal) need strength and control more than stretching; after recent injury or surgery follow the clinician's limits.`,

  mobility: `MOBILITY ROUTINES
- Mobility = range you can control. Combine: a stretch or dynamic move to open the range, then a strength or control drill in that range (e.g. 90/90 hip switches, then hip airplanes; open book, then prone Y raises).
- Daily 5–10 minute routine for desk workers: cat-cow ×8, thoracic open book ×6/side, chin tucks ×10, doorway pec stretch 30 s/side, hip flexor stretch 30 s/side, 90/90 hip switches ×8, calf stretch 30 s/side, wrist flexor and extensor stretch 20 s each.
- Before lifting (3–5 min): arm circles and band pull-aparts, cat-cow, world's greatest stretch ×3/side, bodyweight squats to depth ×10, hip hinges ×10, glute bridges ×10, then ramp-up sets.
- Sessions of 10–15 min, 3+ days a week, show clear change in 4–8 weeks; log them like workouts (duration exercises) so progress is visible.`,

  warmup: `WARM-UP AND COOL-DOWN
- Warm-up: 3–5 min raising temperature (brisk walk, easy bike, skipping), 2–4 dynamic drills for the day's joints, then 1–3 ramp-up sets of the first lift (about 50%, 70%, 85% of the working weight, few reps).
- Cool-down is optional for performance; use it for the stretches you're working on and a few slow breaths to wind down.`,

  neck: `NECK
- Most neck pain is non-specific and settles in weeks with movement, posture variety and strengthening. Keep moving it gently through comfortable range several times a day.
- Desk neck: screen top at about eye level, screen an arm's length away, laptop on a stand with a separate keyboard, phone held higher. Change position every 30–45 min; no single "perfect posture".
- Exercises: chin tucks (deep neck flexors), neck rotations and side-bends through comfortable range, upper trapezius and levator scapulae stretches 20–30 s, scapular setting and rows for the upper back, prone Y/T raises. Build to deep neck flexor holds of 10 s ×10.
- See someone if: pain or pins and needles down the arm, weakness in the hand, dizziness, visual or speech changes, or pain after trauma.`,

  shoulder: `SHOULDER
- Common pictures: rotator cuff related pain (pain lifting the arm to the side or overhead, lying on it at night), stiffness, or pain from pressing too much and pulling too little.
- Principles: keep it moving below the pain threshold, then load it. Rotator cuff and scapular strength is the main treatment: side-lying and band external rotation, isometric external rotation against a wall (30–45 s, 5 reps), scapular wall slides, prone Y/T/W, rows and face pulls at least as much volume as pressing.
- Modify pressing: neutral grip, elbows 30–45° from the body, floor press, landmine or half-kneeling single-arm press; avoid painful arcs and behind-the-neck positions. Build back overhead range gradually.
- Stretches: doorway pec stretch, cross-body stretch (careful if it pinches at the front), sleeper stretch only gently and only if it doesn't pinch, thoracic extension over a foam roller or chair back.
- Frozen-shoulder-like stiffness (both active and passive rotation very limited, slow onset, often 40–60 years) or a painful weakness after a fall needs assessment.`,

  elbow: `ELBOW (tennis and golfer's elbow)
- Tennis elbow: pain on the outer elbow with gripping and lifting with palm down. Golfer's elbow: inner elbow, with gripping and palm-up curling. Both are tendinopathies that respond to load, usually over 6–12 weeks.
- Plan: reduce aggravating grips (use neutral grip, straps, thicker handles, lighter load), then: isometric wrist extension (or flexion for golfer's) 30–45 s ×5 at about 70% effort for pain relief, then slow eccentric wrist extension/flexion with a light dumbbell (3–4 s lowering) 3×15, then normal wrist curls and grip work. Pain up to 3/10 settling by the next day is fine.
- Wrist extensor and flexor stretches 20–30 s, and forearm massage, help symptoms. A strap below the elbow can ease pain during activity.`,

  wrist_hand: `WRIST AND HAND (occupational therapy)
- Desk and phone: wrists straight (not bent up) when typing, keyboard at elbow height, mouse close, use voice and keyboard shortcuts to share load, alternate hands for the phone, rest the hands between bursts.
- Exercises: wrist circles, flexor and extensor stretches 20 s, tendon glides (straight hand, hook fist, full fist, tabletop, straight fist; 5 each, several times a day), median nerve glides for tingling in thumb to ring finger, putty or rubber band finger extensions and grip work.
- Carpal tunnel signs: tingling or numbness in thumb, index and middle fingers, worse at night; a neutral wrist splint at night, nerve glides and fewer sustained grips help; weakness or constant numbness needs a clinician.
- De Quervain's (thumb-side wrist pain with thumb use): rest from pinching and thumb-heavy phone use, thumb splint, then gradual strengthening.
- Lifting: wrist wraps or neutral-grip handles if wrists ache in pressing; strengthen with wrist curls, reverse curls and farmer's carries.`,

  upper_back: `UPPER BACK (thoracic) AND POSTURE
- Stiff upper back and rounded shoulders are common with desks and screens; they are not damage. Movement variety, upper-back strength and extension mobility help both comfort and pressing.
- Drills: thoracic open book ×6/side, cat-cow, thread the needle, foam roller extensions (move the roller, keep the lower back still), quadruped thoracic rotation, prone Y raises, band pull-aparts, rows with a pause at the top.
- "Good posture" is the next posture: change position often; strength makes positions comfortable for longer.`,

  low_back: `LOWER BACK
- Most low back pain is non-specific, not serious, and improves within 6 weeks; it often recurs, and staying active is the best treatment (guideline-backed). Bed rest slows recovery. Imaging rarely helps without red flags.
- Acute flare: keep walking short and often, find comfortable positions (side-lying with a pillow between the knees, lying with legs up on a chair), gentle movement (knee rocks, cat-cow, pelvic tilts), heat for comfort. Modify lifting for 1–2 weeks rather than stopping all training: lighter, smaller range, avoid what provokes it.
- Building back: walking, then core endurance (McGill curl-up, side plank, bird dog: short holds, many reps), glute bridges, hip hinging with a dowel, then Romanian deadlifts, goblet squats and carries building load gradually. Strength and confidence matter more than one "right" exercise.
- Stretches: knee-to-chest, child's pose, hip flexor stretch, figure-4 glute stretch, hamstring stretch with a neutral back. Avoid long sustained bending stretches during a flare if they make leg symptoms worse.
- Sciatica (pain below the knee, often with tingling): keep moving, find positions that ease leg pain, sciatic nerve glides gently; see a clinician if weakness, numbness spreading, or not improving in 4–6 weeks. Red flags in the core section mean urgent care.`,

  hip: `HIP
- Hip flexors stiffen with sitting: half-kneeling hip flexor stretch with the glute squeezed (30–45 s), couch stretch for more.
- Glute strength helps knees and back: glute bridges, hip thrusts, clamshells and side-lying abduction, lateral band walks, single-leg Romanian deadlifts, step-ups.
- Rotation: 90/90 hip switches, figure-4 and pigeon stretches, hip airplanes for control.
- Outer hip pain lying on the side (gluteal tendinopathy, often 40+): avoid crossing legs and hanging on one hip, avoid deep stretches across the body (they compress the tendon), sleep with a pillow between the knees, strengthen with isometric abduction then side-lying and standing abduction.
- Groin pain: adductor strength (Copenhagen planks short lever, adductor squeezes with a ball or pillow) is the evidence-backed fix; groin pain with clicking or locking needs assessment.`,

  knee: `KNEE
- Front-of-knee pain (patellofemoral, common with squats, stairs, running): reduce the provoking load, keep training around it; strengthen quads and hips: Spanish squats or wall sits (isometric 30–45 s), box squats to a comfortable depth, step-ups, leg extensions or band TKEs, glute bridges and side-lying abduction. Build depth and load over 6–12 weeks.
- Patellar tendinopathy (pain at the bottom of the kneecap with jumping and deep squats): isometrics first (Spanish squat 5×45 s), then slow heavy squats/split squats (3 s down, 3 s up), then faster loading.
- Knee osteoarthritis: exercise is first-line treatment; strengthening plus walking or cycling reduces pain as much as many medicines. Some discomfort during exercise is acceptable if it settles within 24 h.
- Locking, giving way, a big swollen knee after a twist, or unable to straighten it needs assessment.
- Stretches: quad stretch, calf stretch, hamstring stretch; foam rolling the quads and outer thigh for comfort (rolling the IT band itself does little).`,

  ankle_foot: `ANKLE AND FOOT
- Plantar heel pain (first steps in the morning hurt): calf and plantar fascia stretches (20–30 s, several times a day, especially before getting up), high-load calf raises with the toes on a rolled towel (3 s up, 2 s hold, 3 s down, build to 3×12 every other day), supportive shoes, avoid barefoot on hard floors for a while, reduce long standing. Improves over 2–6 months.
- Achilles pain: calf raises are the treatment: isometric holds, then slow double then single-leg raises, then off a step, then faster. Pain up to 3/10 settling next day is fine. Don't stretch hard into a painful Achilles.
- Ankle sprain: early movement and weight-bearing as tolerated, then balance work (single-leg stance 30 s, eyes closed when easy), calf raises and hops before returning to sport; a brace for sport in the first months cuts re-sprains.
- Ankle mobility for squats: knee-to-wall dorsiflexion drill, calf stretches bent-knee and straight-knee; raise the heels on plates meanwhile.
- Toes and arch: toe yoga, towel scrunches, short foot.`,

  tendons: `TENDONS
- Tendons adapt to load slowly (weeks to months). Painful tendons usually need the right load, not rest: isometrics (30–45 s holds at 50–70% effort, 4–5 reps) calm pain; heavy slow resistance (3 s up, 3 s down, 3–4 sets of 6–15, every other day) rebuilds capacity; then add speed and spring.
- Use the 24-hour rule: pain during up to about 3/10, and it's no worse the next morning, means continue; if it's worse next morning, drop the load or volume.
- Avoid big sudden jumps in volume, compression positions for that tendon (e.g. deep hip adduction for the outer hip), and stretching hard into a painful tendon.`,

  nerves: `NERVES (pins and needles, tingling)
- Nerves like movement; irritated nerves dislike long stretch or compression. Nerve glides (flossing) move the nerve without stretching it hard: gentle, 10 slow reps, no lasting symptoms.
- Median nerve (thumb to ring finger, carpal tunnel): arm out to the side, palm up, extend wrist, then tilt the head away and back. Ulnar (ring and little finger): "OK sign" goggles move. Sciatic (back of leg): sitting slump, extend the knee as you look up, bend it as you look down.
- Constant numbness, weakness, symptoms in both arms or legs, or bladder/bowel changes need a clinician.`,

  desk: `DESK, WORK AND DAILY LIFE (occupational therapy)
- Set-up: feet flat, hips a little above knees, back supported, elbows about 90° and close at the sides, keyboard and mouse at elbow height, screen top at eye level an arm's length away, laptop on a stand with separate keyboard. For a standing desk, alternate sitting and standing every 30–60 min rather than standing all day.
- Microbreaks: every 30–45 min stand up, walk to get water, 1–2 min of movement (chin tucks, shoulder rolls, doorway stretch, hip flexor stretch, wrist stretches). Movement snacks (10 squats, a flight of stairs) add up.
- Phone: bring it up to eye level, alternate hands, use voice typing for long messages.
- Lifting at home and work: get close to the load, wide stance, hinge at the hips and bend the knees, brace, avoid twisting with heavy loads (turn the feet), carry close to the body, split heavy loads.
- Driving: seat close enough that knees stay bent at full pedal, lumbar support, breaks every 1–2 hours.`,

  pacing: `PACING, ENERGY AND GRADED ACTIVITY (occupational therapy)
- Boom-and-bust (doing a lot on a good day, then crashing) keeps pain and fatigue cycling. Pacing: find a baseline you can do even on a bad day (time or reps), work at about 80% of it, increase by about 10% a week if it goes well.
- Break tasks into chunks with rests before you need them; alternate heavy and light, sitting and standing tasks; plan the week so demanding days are spread out.
- Energy conservation (the 4 Ps): prioritise, plan, pace, position (sit for tasks where you can, keep often-used things between hip and shoulder height).
- Graded return: after time off or illness, return at about half the previous training volume and build back over 2–4 weeks (see returning).`,

  joint_protection: `JOINT PROTECTION AND ARTHRITIS (occupational therapy)
- Exercise is a core treatment for osteoarthritis: strength 2–3 times a week, aerobic activity most days, range-of-motion daily. Expect some discomfort; pain should settle within 24 hours.
- Spread load over larger or more joints (carry bags on the forearm or both hands, push doors with the body), use the strongest joint for the job, avoid sustained tight grip (use thicker handles, jar openers, built-up grips), change positions often.
- Morning stiffness: warm shower, gentle range-of-motion before getting up or straight after.
- A hot, red, swollen joint, or several joints swollen with long morning stiffness (over 30–60 min), needs a doctor (inflammatory arthritis is treated differently).`,

  red_flags: `RED FLAGS: WHEN TO STOP AND SEE A PROFESSIONAL
- Emergency now: chest pain or pressure, fainting, severe breathlessness; numbness in the groin or saddle area, new bladder or bowel problems, or rapidly spreading leg weakness with back pain; sudden severe headache; signs of stroke.
- See a doctor soon: unexplained weight loss, fever or night sweats with pain, constant night pain not eased by position, a hot red swollen joint, pain after a significant fall or accident, history of cancer with new back pain, calf pain with swelling and warmth (possible clot).
- See a physio or doctor: pain not improving after 4–6 weeks, numbness or pins and needles that persist, weakness, joint locking or giving way, swelling after an injury, pain getting worse week to week despite modifying training.
- The coach gives general guidance only and never diagnoses; when in doubt, recommend getting it checked.`,
}

/**
 * Rehab and mobility exercises the main library lacks (or has without instructions worth giving).
 * type matches the app's exercise types; dose is the usual starting prescription.
 */
export const REHAB_EXERCISES = [
  { name: 'Chin Tuck', areas: ['neck'], equipment: 'none', type: 'reps', dose: '10 reps, 5 s hold, several times a day', for: ['desk', 'neck pain', 'posture'], steps: ['Sit or stand tall, looking straight ahead.', 'Glide the head straight back, making a double chin, without tilting up or down.', 'Hold 5 s, feeling the back of the neck lengthen, then relax.'] },
  { name: 'Upper Trapezius Stretch', areas: ['neck', 'shoulders'], equipment: 'none', type: 'duration', dose: '20–30 s each side, 2–3 times', for: ['desk', 'neck pain', 'tension'], steps: ['Sit tall and hold the seat edge with your right hand to keep the shoulder down.', 'Tilt the left ear toward the left shoulder until you feel a stretch on the right side of the neck.', 'Optionally add light pressure with the left hand. Breathe and hold, then switch sides.'] },
  { name: 'Levator Scapulae Stretch', areas: ['neck', 'shoulders'], equipment: 'none', type: 'duration', dose: '20–30 s each side, 2–3 times', for: ['desk', 'neck pain'], steps: ['Sit tall, right hand holding the seat edge.', 'Turn your head 45° to the left and look down toward your left pocket.', 'Gently pull the head down with the left hand until you feel the stretch at the back right of the neck. Hold, then switch.'] },
  { name: 'Deep Neck Flexor Hold', areas: ['neck'], equipment: 'none', type: 'duration', dose: 'Build to 10 × 10 s', for: ['neck pain', 'headaches', 'posture'], steps: ['Lie on your back, knees bent, head resting on the floor.', 'Gently nod as if saying yes and make a small chin tuck, flattening the neck toward the floor.', 'Lift the head about 1 cm keeping the chin tucked; hold, then lower. Stop if the front of the neck strains.'] },
  { name: 'Scapular Setting', areas: ['shoulders', 'upper back'], equipment: 'none', type: 'reps', dose: '10 reps, 5–10 s hold', for: ['shoulder pain', 'posture', 'desk'], steps: ['Stand or sit tall with arms relaxed.', 'Draw the shoulder blades gently back and down, as if sliding them into back pockets, without arching the back.', 'Hold, then release slowly.'] },
  { name: 'Doorway Pec Stretch', areas: ['chest', 'shoulders'], equipment: 'doorway', type: 'duration', dose: '30 s, 2–3 times, elbows at 3 heights', for: ['desk', 'posture', 'pressing'], steps: ['Stand in a doorway with forearms on the frame, elbows at or a little below shoulder height.', 'Step one foot through and lean gently forward until you feel the chest stretch.', 'Keep ribs down and shoulders away from the ears. Try elbows lower and higher to change the stretch.'] },
  { name: 'Wall Slide', areas: ['shoulders', 'upper back'], equipment: 'wall', type: 'reps', dose: '2 × 10 slow reps', for: ['shoulder pain', 'overhead range', 'posture'], steps: ['Stand with forearms on a wall in front of you, elbows at shoulder width, little fingers touching the wall.', 'Slide the forearms up the wall as far as comfortable, letting the shoulder blades rotate up and keeping light outward pressure (or a band around the wrists).', 'Lift the hands slightly off the wall at the top, then slide back down slowly.'] },
  { name: 'Isometric External Rotation', areas: ['shoulders'], equipment: 'wall', type: 'duration', dose: '5 × 30–45 s at about 50–70% effort', for: ['shoulder pain', 'rotator cuff', 'tendinopathy'], steps: ['Stand side-on to a wall or door frame, elbow bent 90° and tucked at your side, a folded towel between elbow and body.', 'Press the back of the wrist outward into the wall without moving the arm.', 'Hold steadily, breathing normally, then relax. Should feel like work, not pain.'] },
  { name: 'Side-Lying External Rotation', areas: ['shoulders'], equipment: 'dumbbell', type: 'weight_reps', dose: '3 × 12–15 with a light dumbbell, slow', for: ['shoulder pain', 'rotator cuff', 'prehab'], steps: ['Lie on your side, top elbow bent 90° and resting on your side with a folded towel under it.', 'Holding a light dumbbell, rotate the forearm up toward the ceiling, keeping the elbow on the towel.', 'Lower over 3 s. Stop short of any pinch.'] },
  { name: 'Prone Y Raise', areas: ['shoulders', 'upper back'], equipment: 'none', type: 'reps', dose: '2–3 × 10, 2 s hold at the top', for: ['posture', 'shoulder health', 'upper back'], steps: ['Lie face down (or chest on an incline bench), arms overhead in a Y, thumbs up.', 'Squeeze the shoulder blades down and lift the arms a few centimetres.', 'Hold, then lower slowly. Add light dumbbells later.'] },
  { name: 'Cross-Body Shoulder Stretch', areas: ['shoulders'], equipment: 'none', type: 'duration', dose: '30 s each side, 2 times', for: ['shoulder stiffness'], steps: ['Bring one arm across the chest at shoulder height.', 'Use the other hand to ease it closer at the upper arm, keeping the shoulder down and back.', 'Stop if it pinches at the front of the shoulder.'] },
  { name: 'Thoracic Open Book', areas: ['upper back', 'chest'], equipment: 'none', type: 'reps', dose: '6–8 each side, slow', for: ['desk', 'posture', 'upper back stiffness'], steps: ['Lie on your side with hips and knees bent 90°, arms straight out in front, palms together.', 'Keeping the knees together on the floor, open the top arm up and over, following the hand with your eyes, rotating through the upper back.', 'Pause and breathe out, then return.'] },
  { name: 'Thread the Needle', areas: ['upper back', 'shoulders'], equipment: 'none', type: 'reps', dose: '6–8 each side', for: ['upper back stiffness', 'desk'], steps: ['Start on hands and knees.', 'Slide one arm under the body along the floor, letting the shoulder and side of the head lower toward the floor.', 'Then reach the same arm up to the ceiling, rotating the upper back. Repeat.'] },
  { name: 'Foam Roller Thoracic Extension', areas: ['upper back'], equipment: 'foam roller', type: 'reps', dose: '5–8 reps at 3–4 spots', for: ['desk', 'posture', 'overhead range'], steps: ['Lie with a foam roller across the upper back, hands supporting the head, hips on the floor.', 'Ribs down, gently extend back over the roller, then return.', 'Move the roller a few centimetres and repeat. Keep it in the upper back, not the lower back.'] },
  { name: 'Cat-Cow', areas: ['upper back', 'lower back'], equipment: 'none', type: 'reps', dose: '8–10 slow reps', for: ['back stiffness', 'warm-up', 'low back pain'], steps: ['Start on hands and knees, hands under shoulders, knees under hips.', 'Breathe in and let the belly drop, chest forward, looking slightly up.', 'Breathe out and round the whole spine toward the ceiling, tucking chin and tailbone. Move slowly, segment by segment.'] },
  { name: 'Pelvic Tilt', areas: ['lower back', 'core'], equipment: 'none', type: 'reps', dose: '10–15 gentle reps', for: ['low back pain', 'flare'], steps: ['Lie on your back with knees bent and feet flat.', 'Gently flatten the lower back into the floor by tilting the pelvis back, then let it arch slightly.', 'Small, comfortable movement only.'] },
  { name: 'Knee Rocks', areas: ['lower back', 'hips'], equipment: 'none', type: 'reps', dose: '10 each side', for: ['low back pain', 'flare', 'stiffness'], steps: ['Lie on your back, knees bent together, feet flat, arms out to the sides.', 'Let both knees sway slowly to one side as far as comfortable, keeping shoulders down.', 'Return through the middle and go to the other side.'] },
  { name: 'Knee to Chest Stretch', areas: ['lower back', 'hips'], equipment: 'none', type: 'duration', dose: '20–30 s, one or both knees, 2–3 times', for: ['low back stiffness'], steps: ['Lie on your back with knees bent.', 'Bring one knee (or both) toward the chest, holding behind the thigh.', 'Breathe and relax into it; keep the other foot on the floor for one-knee.'] },
  { name: 'McGill Curl-Up', areas: ['core'], equipment: 'none', type: 'duration', dose: '5–6 reps of 8–10 s holds, descending sets', for: ['low back pain', 'core endurance'], steps: ['Lie on your back, one knee bent and one leg straight, hands under the lower back to keep its natural curve.', 'Brace gently and lift the head and shoulders just off the floor as one unit, without tucking the chin or flattening the back.', 'Hold, breathing, then lower. Switch legs halfway.'] },
  { name: 'Clamshell', areas: ['hips'], equipment: 'band', type: 'reps', dose: '2–3 × 15 each side', for: ['hip pain', 'knee pain', 'glute strength'], steps: ['Lie on your side, hips and knees bent about 45°, feet together, a band above the knees if you have one.', 'Keeping feet together and the pelvis still (don\'t roll back), lift the top knee.', 'Lower slowly.'] },
  { name: 'Side-Lying Hip Abduction', areas: ['hips'], equipment: 'none', type: 'reps', dose: '2–3 × 12–15 each side', for: ['outer hip pain', 'knee pain', 'glute strength'], steps: ['Lie on your side, bottom knee bent, top leg straight in line with the body.', 'Lift the top leg up and slightly back, toes pointing forward, without rolling the hips back.', 'Lower over 2–3 s.'] },
  { name: 'Half-Kneeling Hip Flexor Stretch', areas: ['hips', 'quads'], equipment: 'none', type: 'duration', dose: '30–45 s each side, 2 times', for: ['desk', 'tight hips', 'low back'], steps: ['Kneel on one knee (pad under it), other foot in front, both knees about 90°.', 'Squeeze the glute of the kneeling side and tuck the pelvis slightly under.', 'Shift forward a little until you feel the front of the hip stretch. Reach the arm overhead for more.'] },
  { name: '90/90 Hip Switch', areas: ['hips'], equipment: 'none', type: 'reps', dose: '8–10 switches', for: ['hip mobility', 'warm-up'], steps: ['Sit with both knees bent 90°, one leg in front and one to the side.', 'Keeping feet on the floor, rotate both knees over to the other side.', 'Use hands behind you for support at first; sit taller as it gets easier.'] },
  { name: 'Figure-4 Glute Stretch', areas: ['hips', 'lower back'], equipment: 'none', type: 'duration', dose: '30 s each side, 2 times', for: ['tight glutes', 'low back stiffness'], steps: ['Lie on your back, knees bent. Cross the right ankle over the left knee.', 'Hold behind the left thigh and draw it toward you until you feel the stretch in the right buttock.', 'Keep the head down and shoulders relaxed. Switch sides.'] },
  { name: "World's Greatest Stretch", areas: ['hips', 'upper back', 'hamstrings'], equipment: 'none', type: 'reps', dose: '3–5 each side', for: ['warm-up', 'mobility'], steps: ['From a push-up position step the right foot outside the right hand into a deep lunge.', 'Drop the right elbow toward the instep, then rotate and reach the right arm to the ceiling.', 'Return the hand, straighten the front leg to stretch the hamstring, then step back and switch.'] },
  { name: 'Adductor Squeeze', areas: ['groin'], equipment: 'none', type: 'duration', dose: '5 × 10–30 s', for: ['groin pain', 'adductor strength'], steps: ['Lie on your back, knees bent, a ball or folded pillow between the knees.', 'Squeeze the knees together firmly and hold, breathing normally.', 'Build effort over the weeks.'] },
  { name: 'Copenhagen Plank (Short Lever)', areas: ['groin', 'core'], equipment: 'bench or chair', type: 'duration', dose: '3 × 10–20 s each side', for: ['groin strength', 'prehab'], steps: ['Lie on your side with the top knee resting on a bench or chair seat, bottom leg bent underneath, forearm on the floor.', 'Press the top knee into the bench and lift the hips into a straight line.', 'Hold, then lower. Progress to the foot on the bench later.'] },
  { name: 'Spanish Squat', areas: ['quads', 'knees'], equipment: 'band', type: 'duration', dose: '5 × 30–45 s', for: ['knee pain', 'patellar tendinopathy'], steps: ['Loop a heavy band around a fixed post and behind both knees; step back until it\'s taut.', 'Sit back into a squat with shins vertical, leaning into the band, to a comfortable depth (about 60–90° knee bend).', 'Hold, feeling the quads work. No band: a wall sit works similarly.'] },
  { name: 'Wall Sit', areas: ['quads', 'knees'], equipment: 'wall', type: 'duration', dose: '4–5 × 30–45 s', for: ['knee pain', 'quad strength'], steps: ['Lean the back against a wall and slide down until the knees are bent to a comfortable angle (aim for about 90° eventually).', 'Knees over the ankles, weight through the heels.', 'Hold, breathing steadily.'] },
  { name: 'Terminal Knee Extension', areas: ['quads', 'knees'], equipment: 'band', type: 'reps', dose: '3 × 15 each side', for: ['knee pain', 'after knee injury'], steps: ['Loop a band around a post and behind one knee, facing the post.', 'Start with the knee slightly bent, then straighten it fully against the band, squeezing the thigh.', 'Return slowly.'] },
  { name: 'Knee to Wall Ankle Mobility', areas: ['calves', 'ankles'], equipment: 'wall', type: 'reps', dose: '10 each side', for: ['squat depth', 'ankle stiffness', 'after sprain'], steps: ['Face a wall in a half-kneeling or split stance, front toes a few centimetres from the wall.', 'Keeping the heel down, drive the knee forward over the toes to touch the wall.', 'Move the foot back as it gets easier.'] },
  { name: 'Eccentric Heel Drop', areas: ['calves', 'ankles'], equipment: 'step', type: 'reps', dose: '3 × 15, bent and straight knee, every other day', for: ['achilles', 'calf strength'], steps: ['Stand on a step with the balls of the feet, holding a rail.', 'Rise up on both feet, then shift onto one foot and lower the heel slowly (3 s) below the step.', 'Use both feet to rise again. Add a backpack load as it gets easy.'] },
  { name: 'Calf Raise with Toe Towel', areas: ['calves', 'feet'], equipment: 'step', type: 'reps', dose: '3 × 8–12 slow (3 s up, 2 s hold, 3 s down), every other day', for: ['plantar heel pain', 'plantar fasciitis'], steps: ['Stand on one foot with a rolled towel under the toes so they bend up.', 'Rise onto the ball of the foot slowly, hold at the top, lower slowly.', 'Hold a dumbbell or wear a backpack when 12 is easy.'] },
  { name: 'Plantar Fascia Stretch', areas: ['feet'], equipment: 'none', type: 'duration', dose: '10 × 10 s, before first steps and through the day', for: ['plantar heel pain'], steps: ['Sit and cross the sore foot over the other knee.', 'Pull the toes back toward the shin until you feel the stretch in the arch.', 'Massage along the arch with the other thumb while holding.'] },
  { name: 'Single-Leg Balance', areas: ['ankles', 'hips'], equipment: 'none', type: 'duration', dose: '3 × 30 s each side', for: ['ankle sprain', 'falls prevention', 'balance'], steps: ['Stand on one leg near a support, knee soft.', 'Hold steady for 30 s. Progress: eyes closed, soft surface, reaching or head turns.'] },
  { name: 'Toe Yoga', areas: ['feet'], equipment: 'none', type: 'reps', dose: '10 each way', for: ['foot strength', 'bunions', 'arch'], steps: ['Seated or standing, lift only the big toe while keeping the others down.', 'Then press the big toe down and lift the other four.', 'Slow and controlled; use a hand to help at first.'] },
  { name: 'Wrist Flexor Stretch', areas: ['wrists', 'arms'], equipment: 'none', type: 'duration', dose: '20–30 s each side, 2–3 times', for: ['desk', "golfer's elbow", 'forearm tightness'], steps: ['Hold the arm straight in front, palm up.', 'With the other hand, gently pull the fingers back toward you.', 'Feel the stretch along the inner forearm.'] },
  { name: 'Wrist Extensor Stretch', areas: ['wrists', 'arms'], equipment: 'none', type: 'duration', dose: '20–30 s each side, 2–3 times', for: ['desk', 'tennis elbow', 'forearm tightness'], steps: ['Hold the arm straight in front, palm down.', 'With the other hand, gently bend the wrist down, fingers toward you.', 'Make a loose fist for a stronger stretch along the outer forearm.'] },
  { name: 'Isometric Wrist Extension', areas: ['wrists', 'arms'], equipment: 'none', type: 'duration', dose: '5 × 30–45 s at about 70% effort', for: ['tennis elbow', 'tendinopathy'], steps: ['Sit with the forearm on a table, palm down, hand off the edge.', 'Press the back of the hand up into your other hand (or under a table edge) without moving.', 'Hold steadily. For golfer\'s elbow do the same palm up, pressing up into flexion.'] },
  { name: 'Eccentric Wrist Extension', areas: ['wrists', 'arms'], equipment: 'dumbbell', type: 'weight_reps', dose: '3 × 15 with a light dumbbell, 3–4 s lowering, daily or every other day', for: ['tennis elbow', 'tendinopathy'], steps: ['Forearm on a table or thigh, palm down, light dumbbell in hand.', 'Use the other hand to help lift the wrist up.', 'Lower slowly on your own over 3–4 s. Some discomfort (up to 3/10) is fine.'] },
  { name: 'Tendon Glides', areas: ['wrists'], equipment: 'none', type: 'reps', dose: '5 of each position, 3–5 times a day', for: ['hand stiffness', 'carpal tunnel', 'desk'], steps: ['Start with fingers straight up.', 'Move through: hook fist (bend the top two finger joints), full fist, tabletop (bend only at the knuckles), straight fist (knuckles and middle joints bent, fingertips to palm base).', 'Return to straight between each; hold each 3 s.'] },
  { name: 'Median Nerve Glide', areas: ['wrists', 'arms', 'neck'], equipment: 'none', type: 'reps', dose: '10 gentle reps, 2–3 times a day', for: ['carpal tunnel', 'tingling fingers'], steps: ['Stand with the arm out to the side at shoulder height, elbow straight, palm up.', 'Bend the wrist back (fingers toward the floor) while tilting the head toward that arm.', 'Then bring the wrist up as you tilt the head away. Smooth, no lasting tingling.'] },
  { name: 'Sciatic Nerve Glide', areas: ['hamstrings', 'lower back'], equipment: 'chair', type: 'reps', dose: '10 gentle reps, 2–3 times a day', for: ['sciatica', 'tight hamstrings with tingling'], steps: ['Sit tall on a chair edge.', 'Straighten one knee and pull the toes up while looking up.', 'Bend the knee back down while looking down. Keep it gentle; symptoms shouldn\'t linger.'] },
  { name: 'Hip Airplane', areas: ['hips'], equipment: 'none', type: 'reps', dose: '5 each side, slow', for: ['hip control', 'balance'], steps: ['Stand on one leg holding a support, hinge forward until the torso is near horizontal, other leg behind.', 'Rotate the pelvis open toward the ceiling, then close it toward the standing leg.', 'Keep the standing knee soft and stable.'] },
]

const GENERIC = new Set(['pain', 'stiffness', 'tightness', 'strength', 'health', 'tight', 'after', 'with', 'the'])
const CATALOGUE_DOSE = { hold: 'Hold 20–45 s, 2–4 times', moving: '8–12 controlled reps or 30 s, 1–2 rounds', roll: 'Roll slowly 30–60 s, pausing on tender spots (comfort, not a fix)' }

const WORDS = (s) => String(s || '').toLowerCase().match(/[a-z0-9']+/g) || []

// Words people use → the areas the catalogue knows.
const AREA_WORDS = {
  neck: ['neck', 'cervical', 'headache', 'headaches', 'trapezius', 'traps'],
  shoulders: ['shoulder', 'shoulders', 'rotator', 'cuff', 'deltoid', 'overhead'],
  chest: ['chest', 'pec', 'pecs', 'pectoral'],
  'upper back': ['upper', 'thoracic', 'posture', 'hunch', 'rounded', 'lats', 'lat', 'midback', 'scapula', 'blade', 'blades'],
  'lower back': ['lower', 'lumbar', 'back', 'sciatica', 'spine'],
  core: ['core', 'abs', 'abdominal', 'oblique'],
  hips: ['hip', 'hips', 'glute', 'glutes', 'buttock', 'piriformis'],
  groin: ['groin', 'adductor', 'adductors'],
  hamstrings: ['hamstring', 'hamstrings', 'posterior'],
  quads: ['quad', 'quads', 'quadriceps', 'thigh', 'thighs'],
  knees: ['knee', 'knees', 'patella', 'patellar', 'kneecap'],
  calves: ['calf', 'calves', 'achilles', 'shin'],
  ankles: ['ankle', 'ankles', 'sprain', 'dorsiflexion'],
  feet: ['foot', 'feet', 'heel', 'plantar', 'arch', 'toe', 'toes', 'bunion'],
  arms: ['arm', 'arms', 'bicep', 'biceps', 'tricep', 'triceps', 'elbow', 'forearm', 'forearms', 'tennis', 'golfer', "golfer's"],
  wrists: ['wrist', 'wrists', 'hand', 'hands', 'finger', 'fingers', 'carpal', 'thumb', 'grip', 'typing'],
}
// Problems → areas, for when someone describes a situation rather than a body part.
const PROBLEM_AREAS = {
  desk: ['neck', 'upper back', 'chest', 'hips', 'wrists'],
  sitting: ['hips', 'upper back', 'neck'],
  posture: ['upper back', 'chest', 'neck'],
  running: ['calves', 'hips', 'quads', 'hamstrings'],
  squat: ['ankles', 'hips', 'groin'],
  overhead: ['shoulders', 'upper back', 'chest'],
}

/**
 * Stretches and rehab exercises for an area or problem: own rehab exercises first (they carry
 * doses), then catalogue stretches for the same areas. Skips partner stretches and anything
 * needing equipment the athlete said they don't have.
 */
export function findStretches({ area = '', goal = '', equipment = '', max = 8 } = {}) {
  const q = `${area} ${goal}`.toLowerCase()
  const qw = new Set(WORDS(q))
  const areas = new Set()
  for (const [a, ws] of Object.entries(AREA_WORDS)) if (ws.some((w) => qw.has(w))) areas.add(a)
  for (const [p, as] of Object.entries(PROBLEM_AREAS)) if (qw.has(p)) as.forEach((a) => areas.add(a))
  // "upper back" shouldn't also pull in the lower back
  if ((qw.has('upper') || qw.has('thoracic')) && !qw.has('lower') && !qw.has('lumbar')) areas.delete('lower back')
  // knees and feet lean on nearby muscles in the stretch catalogue
  if (areas.has('knees')) ['quads', 'hamstrings', 'calves'].forEach((a) => areas.add(a))
  if (areas.has('feet') || areas.has('ankles')) areas.add('calves')
  const have = String(equipment || '').toLowerCase()
  const usable = (eq) => {
    if (['none', 'wall', 'doorway', 'chair', 'step', 'bench or chair'].includes(eq)) return true
    if (!have) return true
    return have.includes(eq.split(' ')[0])
  }
  // a "for" tag counts when all its telling words are in the question ("pain" alone tells nothing)
  const telling = (f) => WORDS(f).filter((w) => !GENERIC.has(w))
  const goalScore = (ex) => (ex.for || []).reduce((s, f) => s + (telling(f).length && telling(f).every((w) => qw.has(w)) ? 3 : 0), 0)
  const rehab = REHAB_EXERCISES.filter((e) => usable(e.equipment) && (e.areas.some((a) => areas.has(a)) || goalScore(e) > 0))
    .map((e) => ({ e, s: goalScore(e) + e.areas.filter((a) => areas.has(a)).length }))
    .sort((a, b) => b.s - a.s)
    .map(({ e }) => e)
  // no jumping or lunging moves for someone who's sore
  const sore = ['pain', 'sore', 'hurts', 'ache', 'aches', 'injury', 'sciatica'].some((w) => qw.has(w))
  const cat = STRETCHES.filter((s) => !s.partner && usable(s.equipment) && s.areas.some((a) => areas.has(a)) && !(sore && /hop|lunge|kip|split squat/i.test(s.name)))
    .map((s) => ({ s, n: (areas.has(s.areas[0]) ? 3 : 0) + s.areas.filter((a) => areas.has(a)).length - (s.level === 'expert' ? 2 : 0) }))
    .sort((a, b) => b.n - a.n)
    .map(({ s }) => s)
  // a clear problem match (tennis elbow, heel pain) needs few extras from the catalogue
  const strong = rehab.filter((e) => goalScore(e) > 0).length
  const nCat = Math.min(cat.length, strong >= 3 ? 2 : Math.floor(max / 2))
  const picks = [...rehab.slice(0, max - nCat), ...cat.slice(0, nCat)].slice(0, max)
  if (!picks.length)
    return `No match for "${q.trim()}". Areas: ${Object.keys(AREA_WORDS).join(', ')}; problems: ${Object.keys(PROBLEM_AREAS).join(', ')}, or describe the pain (e.g. "tennis elbow", "plantar heel pain").`
  const lines = picks.map((x) => {
    const dose = x.dose || CATALOGUE_DOSE[x.kind] || CATALOGUE_DOSE.hold
    return `${x.name} [${x.areas.join(', ')}; ${x.equipment}] Dose: ${dose}\n  ${x.steps.map((s, i) => `${i + 1}. ${s}`).join(' ')}`
  })
  return `${lines.join('\n')}\n\nGive the athlete 3–5 of these with dose and the key cue; offer them as a routine (names above match the exercise library). If pain is the reason, add the 24-hour rule and when to get it checked (training_knowledge "red_flags").`
}

const MUSCLE_OF = { neck: 'Mobility', shoulders: 'Shoulders', chest: 'Chest', 'upper back': 'Back', 'lower back': 'Back', core: 'Core', hips: 'Glutes', groin: 'Legs', hamstrings: 'Legs', quads: 'Legs', knees: 'Legs', calves: 'Legs', ankles: 'Legs', feet: 'Legs', arms: 'Arms', wrists: 'Arms' }
const EQUIP_OF = { dumbbell: 'Dumbbell', band: 'Band', 'foam roller': 'Other' }

/** The rehab exercises as exercise-library rows: [name, muscle, equipment, type, video search]. */
export function rehabLibraryRows() {
  return REHAB_EXERCISES.map((e) => {
    const mobility = /stretch|glide|cat-cow|open book|thread|rocks|tilt|90\/90|world|mobility|thoracic/i.test(e.name) && e.type !== 'weight_reps'
    return [e.name, mobility ? 'Mobility' : MUSCLE_OF[e.areas[0]] || 'Mobility', EQUIP_OF[e.equipment] || 'Bodyweight', e.type, `${e.name.toLowerCase()} physio how to`]
  })
}
