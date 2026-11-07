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
- Bristles and spikes thin and short: 0.15 to 0.25 of the limb's thickness.
- One main set of limbs per creature.
- Near-white studio, soft floor shadow.

## The order
1. Measure the reference first: its main proportions (height, head, jaw or limb length)
   as shares of its length.
2. Build the object and render one still posed like the reference.
3. Put the reference, the still and an approved still side by side and grade every line
   of the checklist: yes, partial or no. Grade against the picture, not against memory
   of what was built.
4. Grade one more line every round: at thumbnail size, does it look as dense as the
   approved still?
5. Measure it: the share of dark pixels in the object's frame, ours against the
   reference's. Below 0.8 of it is a no.
6. Stop after round 2 and show the user. The film waits for their yes.

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
- `tools/sheet.py` — reference | still | approved side-by-side sheet plus thumbnail row.
- Approved stills live in `approved/`. Until one exists, the density line is graded
  against the reference and the sheet says so.

## Corrections
_(none yet — each correction from review is added here with its date and the build it came from)_
