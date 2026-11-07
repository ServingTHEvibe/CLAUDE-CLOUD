# Checklist: robot hammerhead (ref/reference.png)

Written after round 2. It should have been written before the first line of code
(see the Corrections in ROBOT_RULES.md). Numbers are shares of the object's on-screen
length L = 1718 px, measured off the reference.

1. A heavy, chunky shark, head on the left and tail on the right, seen front 3/4 from
   slightly above. Silhouette height/length 0.52. Body height without fins 0.18 at its
   deepest point. Never a slim torpedo.
2. The hammer is a big block spanning 0.51 of L on screen and 0.07 thick at the tips,
   turned enough toward the camera that both eye lenses face it. Never a thin white bar
   seen edge-on.
3. Eyes: glossy black lenses 0.05 of L across at both hammer tips, a thin green bezel
   and a small pupil. Both read as near-round discs.
4. The top of the hammer is broken into plates with two windows on each side showing
   gears. Never one unbroken white surface.
5. Mouth: a wide grin under the hammer centre, 0.08 of L wide with a gape of 0.035,
   about 14 pointed teeth top and bottom in a visible row, and dark gears at the jaw
   corners.
6. Head-to-shoulder region (the first 0.35 of L) is plates with gaps over dark
   mechanism: cheek, jaw hinge and shoulder all show machine.
7. Mid-body (0.35 to 0.65 of L): white frames around open bays of gunmetal gears
   stacked on shafts along the body, with pistons and hoses between them.
8. The tail stalk (0.65 to 0.85 of L) is an exposed spine of rings, gears and pistons,
   0.05 of L thick, with only thin plates on it. Never a solid shell.
9. Fins: dorsal 0.17 tall and swept back. Pectorals 0.23 (near, pointing down and back)
   and 0.19 (far, pointing down and forward). Tail 0.30 tall overall, upper lobe about
   twice the lower.
10. Membranes: milky and frosted, branching veins from the root, a white rigid spar on
    the leading edge, and a mechanical joint at the root.
11. Green: thin lines on the outer ~15% of each fin edge, eye bezels, a small mark on the
    cheek. About 0.35% of object pixels. Never dots on a shell.
12. Near-white studio. A soft shadow directly under the body, inside the frame, offset
    slightly right.
13. Dark share (luma under 80) in the object's bounding box is at least 0.8 of the
    reference's (reference: 0.081).
14. At the 900 px thumbnail it reads as dense as the reference: grey and busy from
    head to tail.

## Round 2 grades (round2_1600.png, luma < 80)

| # | Grade | Against the picture |
|---|---|---|
| 1 | partial | silhouette h/L 0.54 is fine, but the body reads slim; deepest body without fins about 0.14, not 0.18 |
| 2 | no | the hammer reads as a thin white bar seen edge-on |
| 3 | partial | near eye is right; far eye hidden |
| 4 | partial | windows are there but small; foreshortened to slits |
| 5 | partial | a row of teeth reads, but under the far half of the hammer, not centred, and there is no dark mechanism at the corners in view |
| 6 | no | the front third is bare white |
| 7 | yes | gear bays with frames, pistons and hoses |
| 8 | yes | exposed spine with rings and pistons |
| 9 | partial | dorsal and tail OK; near pectoral too long and spear-like; far pectoral mostly hidden |
| 10 | yes | |
| 11 | yes | 0.53% vs 0.35%, all on tips, bezels and gill lines |
| 12 | no | shadow falls out of frame |
| 13 | yes, on the line | 0.065 vs 0.081 = 0.80 |
| 14 | no | reads as a white torpedo with one black band |

## Round 3 grades (round3.png, luma < 80)

What changed: a ~680-part kitbash layer under every shell (merged per material). Torso and
hammer re-tiled into plates in 3 sizes with ~0.09 gaps and bulged middles. Body deepened to
max ry 1.1. Chin dropped so the grin sits under the hammer. Camera higher with the nose
tilted down 0.06 rad. Near pectoral 0.68, dorsal 0.8, caudal 0.8. Floor raised so the shadow
lands in frame.

| # | R2 | R3 | Against the picture |
|---|---|---|---|
| 1 | partial | partial | body now deep and heavy; silhouette h/L 0.563 vs 0.516, too tall (dorsal and tail reach the frame top) |
| 2 | no | yes | the hammer reads as a plated block seen from the front and above |
| 3 | partial | partial | near eye right; far eye only a sliver at the far tip |
| 4 | partial | yes | two windows each side with gears, plates around them |
| 5 | partial | partial | a row of teeth now shows under the hammer; the grin is narrow and the corners are cluttered |
| 6 | no | partial | the shoulder shows machine through gaps and a window; cheek and hinge still read white |
| 7 | yes | yes | |
| 8 | yes | yes | |
| 9 | partial | partial | pectorals right; dorsal and tail still too tall for the silhouette |
| 10 | yes | yes | |
| 11 | yes | yes | 0.43% vs 0.35% |
| 12 | no | partial | shadow in frame, but at the bottom edge and faint |
| 13 | yes (0.80) | yes (1.03) | 0.084 vs 0.081 |
| 14 | no | partial | reads as a machine now, but in hard black-and-white bands where the reference is grey and silver |

Parts: 160 big, ~290 small discrete + ~680 kitbash micro-parts.

## Round 4 grades (round4.png, luma < 80)

What changed: gears lightened to grey/silver (0x686e74, 0xa9afb4). Dorsal 0.7, tail 0.68.
Near pectoral droops less. Jaw opens 0.32 rad with 11 + 10 teeth per side. Hinge pistons
removed from the mouth corners. Cheek split into a plate and a window. Shoulder middle row
cut into smaller plates.

| # | R3 | R4 | Against the picture |
|---|---|---|---|
| 1 | partial | partial | heavy body; h/L 0.540 vs 0.516, 0.024 over |
| 2 | yes | yes | |
| 3 | partial | partial | far eye still a sliver |
| 4 | yes | yes | |
| 5 | partial | partial | both rows of teeth read and the grin is wider; the far corner is still a dark knot |
| 6 | partial | partial | shoulder shows machine; the new cheek window sits behind the eye and pectoral from this camera |
| 7 | yes | yes | gears now grey and silver |
| 8 | yes | yes | |
| 9 | partial | yes | dorsal, tail and pectorals in proportion |
| 10 | yes | yes | |
| 11 | yes | yes | 0.42% vs 0.35% |
| 12 | partial | partial | shadow in frame, faint, at the bottom edge |
| 13 | yes (1.03) | yes (1.05) | 0.085 vs 0.081 |
| 14 | partial | partial | greyer mid-body; the white ribs still make hard vertical bands and the hammer is mostly white |
