# Robot build rules

Standing brief for every robotic object or creature built from a reference image,
in three.js, entirely in code. Corrections from review go into the **Corrections**
section at the bottom and override anything above them.

## The look
- White shells with clearcoat and an environment map.
- Green as a sparse accent only: tips, rims, edge lines, a bezel, joint rings.
  Never dots sprinkled over a shell.
- Dark mechanism in 2 levels: big parts (gears, rings, actuators) and about 260 small
  ones (pistons, hoses, screws, wiring). Cut windows into the shells so the dark mass shows.
- Eyes: glossy black lenses with a thin green bezel and a small pupil.
- Membranes: milky and frosted with thin veins.
- Every limb has its own pose and segment lengths, never a row of identical parts.
- Bristles and spikes thin and short: 0.15 to 0.25 of the limb's thickness. They read as
  hair at thumbnail size, never as quills.
- One main set of limbs per creature.
- Near-white studio, soft floor shadow.

## Before the first line of code
1. Measure the reference: its main proportions (body height, head, jaw or limb length,
   gape) as shares of its length.
2. Write the checklist for this picture in `<model>/CHECKLIST.md`: about 12 numbered lines
   a reader could check, each with a number where one applies. Use "never" for the
   default you must not fall back to (e.g. "never a solid white shell").
3. If no approved build has a body close to this one, flag it to the user before starting.

## The still loop
1. Render a still at 1600x900 posed like the reference.
2. Stack the reference, the still and the approved still side by side, plus a thumbnail of
   the same stack 900 px wide.
3. Grade every checklist line yes, partial or no, one line each, against the picture and
   not against memory of what was built. Correct misreadings both ways: look again before
   shrinking or growing a feature.
4. Grade one more line every round: at the 900 px thumbnail, does it look as dense as the
   approved still?
5. Measure density, don't eyeball it: crop the reference and the still to the object's
   bounding box and count the share of dark pixels (luma under 80). Ours must reach 0.8
   of the reference's. Raise it by breaking white surfaces into separate plates with gaps
   over the mechanism. Adding dots doesn't count.
6. Measure proportions the same way, against the numbers in the checklist.
7. Fix the no's, then the partials.
8. Stop after round 2 and show the user the stack and the grades. Wait for their notes
   before round 3. The film waits for their yes.

## Running builds
- Each build gets its own fresh agent with this file, the reference and its checklist.
- At most 2 builds at a time, reviewed after round 2.

## The film
- Port the approved film of the build whose body is closest, 1:1: the same beat times and
  moves, distances scaled to the object. Change the body only. Map its 5 parts onto this
  object's 5 slots.
- Each part opens in about 1 s, holds with its parts still spinning, and closes in 0.5 s.
- Then a full explode on a 330 degree turntable, a fast reassembly while it turns, and an exit.
- Page: an invented product name and title, one pill button per part that a cursor clicks,
  live cards that move with the parts.
- The film is one script file, `{"duration": .., "script": [{"t": .., "act": ..}]}`, read by
  the object, the page and the sound. A new cut is one edited file and one render. Cut dull
  beats.
- Short version (10 s) is its own script: the opening, one part, the explode, the exit,
  played faster to land on 10 s. Never the full film trimmed and crossfaded. Each short
  gets its own opening and exit.
- Before showing the film, put its frames at 1.5, 4.5 and 12.4 s next to the approved film's.
  If it looks smaller, flatter or blurrier, it doesn't ship.
- Render frame by frame: render(t) is a pure function of time. Capture 1600x900 at device
  pixel ratio 2.4, downscale to 1920x1080, 60 fps, lanczos, H.264, yuv420p, faststart.
  Never a screen recording.
- Sound in code from the same script: a music bed, a quiet click per button, a short accent
  on every part that moves. Master to -14 LUFS. For a sped-up short, score the scene's script
  and time-stretch by the same factor.

## Publishing
- Every build gets its own new Vercel project and its own domain. Never deploy into another build's
  project or share a domain between builds. Default domain: `<product-name>-<code>.vercel.app`
  (e.g. `sphyrna-hx4-hammerhead.vercel.app`). A custom domain is bought only when the user asks.

## The camera (film)
- Frame 0 is the front 3/4 hero view, the object big and already moving.
- Every teardown gets its own side, height and distance, aimed at the part itself,
  pushing in while it hangs open: an eye in macro, a tail from behind, a back from
  above, a jaw from below.
- The part being opened stays in view; the rest of the object may run off the frame.
- Smooth paths only: the camera never copies a wing beat or a footstep.
- Visible wing beats stay slow, 1.5 to 2.5 Hz.

## Tooling in this folder
- `tools/measure.py <png>` — object frame, height/length, dark-pixel share, green share,
  height profile in 10 slices.
- `tools/render.mjs <model> <out.png> [query]` — headless still of `<model>/index.html`.
- `tools/sheet.py <prefix> ref still [approved]` — writes `<prefix>_stack.png` and
  `<prefix>_thumb900.png`.
- Approved stills live in `approved/`. Until one exists, the density line is graded
  against the reference and the sheet says so.

## Corrections
One line per mistake. Each one is already folded into the rules above; this list is the why.
- Tarantula: bristles read as quills. Bristles now have a thickness in numbers.
- Octopus: a rule to keep the whole object in frame flattened the camera and curled the arms
  in. Now only the part being opened has to stay in view.
- Moth, hydra, fly: graded themselves dense and read as clean white diagrams. Density is now
  measured (luma under 80, at least 0.8 of the reference), not graded.
- Piranha: passed density and still read as a crocodile (jaws 0.52 of length vs 0.37).
  Proportions are measured off the picture before the first line of code.
- Flying octopus, scorpion-squid: 2 sets of limbs. One main set per creature.
- Piranha film: the camera parked (every teardown 20 to 50 degrees, same side, height and
  distance). Every beat gets its own side, aimed at its own part.
- Fly: misread the eyes as too busy, shrank them, and the head came back a disco ball. Look
  at the picture again before changing a feature's size.
- Glass octopus film: another animal's choreography plus a framing rule came back far, flat and
  tucked in. Port the closest approved film 1:1 and change the body only.
- Scarab: no close body; 4 rounds and ~450k tokens and still busy and cheap. A subject with
  no close body gets flagged before it starts.
- 2026-11-07 hammerhead: no checklist written before code, and density measured at luma
  under 90 instead of 80. Checklist first; luma under 80.
- 2026-11-08 hammerhead: publishing. Each build gets its own Vercel project and its own domain.
