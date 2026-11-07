---
name: blender-product-video
description: Turn one product photo into a sellable 3D product video in Blender through the Blender MCP connector, then pitch it to the brand. Seven-step pipeline - studio setup, photo-to-model, realistic materials, 6-second turntable loop, ad scene, the $500/month DM pitch, and fix-what-looks-fake QA. Use whenever the user wants a 3D product video, product render, turntable or spin video, Blender product ad, "one photo in, 3D model out", set up a Blender studio, make a product look real in Blender, or pitch product videos to small brands.
---

# Blender Product Video Studio

One product photo → a real-scale 3D model → a looping spin video and an ad scene → a DM that sells
4 videos a month for $500. Built for simple shapes: bottles, jars, candles, boxes, mugs, cans.

## Requirements (check first)

- Claude desktop app with the **Blender** connector on (Settings → Connectors → Blender).
- Free **Blender 5.1+**, open, with the **MCP add-on enabled** and its server started.
- If no Blender tools are available in this session, say so plainly, then hand the user the
  scripts in `scripts/` to paste into Blender's Scripting tab instead of pretending to run them.

## How to run it

Work through the steps in order. Each step ends with a short report and a checkpoint — stop and let
the user look before moving on. Fill the `[brackets]` from what the user gave you; ask only for
what's missing (product photo, real height in cm, materials, label image, output folder, scene, brand).

| # | Step | Goal | Output |
|---|------|------|--------|
| 1 | Set up the studio | Clean scene, cm units, 1080×1350, 30 fps, cyc backdrop, key + rim light, camera | Short list of what was set |
| 2 | One photo in, 3D model out | Real-size model matching outline, proportions, lid, label area | Front + ¾ renders, list of differences |
| 3 | Make it look real | Materials, label (no stretch), bevels, contact shadow, roughness | One frame + what still looks fake |
| 4 | The 6-second spin | 180-frame seamless turntable, slight camera push, Eevee MP4 | Stills of f1/90/180, then the MP4 |
| 5 | Put it where it sells | Real-scale ad scene, DoF, 8-s push-in, light sweep over label | Stills, then the MP4 |
| 6 | The pitch | DM under 70 words + the "how much for one?" reply | Copy ready to paste |
| 7 | Fix what looks fake | Targeted fix at a frame, nothing else touched | Fix + 5-point pre-send checklist |

The exact prompts (copy-paste versions with fill-ins) are in `references/prompts.md`.
Technical defaults for each step are in `references/technical-spec.md`. Read both before step 1.

## Step rules

1. **Studio** — First list every object in the open scene (name, type) so nothing is deleted
   blind, then clear it. Run `scripts/studio_setup.py` (via the Blender MCP code tool) or
   build the same thing by hand. Report in one short list.
2. **Model** — Build at real size from the stated height; derive every other dimension from the
   photo's proportions (measure in pixels, scale to the height). Separate objects for body, lid,
   label area. Revolve/lathe for round products, bevelled cube for boxes. No invented details.
   Render front (orthographic-feel, long lens) and ¾ view; list honestly what still differs.
3. **Materials** — Use the material presets in `references/technical-spec.md`. Map the label with
   UVs matched to the label image's aspect ratio (cylinder: unwrap the label band so
   width = circumference × coverage). Bevel 0.5–2 mm on every hard edge. Product sits exactly
   on the floor (z = 0) — contact shadow comes from that plus AO/shadows, never a fake decal.
4. **Spin** — Run `scripts/turntable.py`. Rotation is linear 0→360° over frames 1–181 while
   rendering 1–180, so frame 180 flows into frame 1 with no hitch and no eased stop. Camera
   push-in is small (≈5–8 % closer) and eases out and back so the loop closes. Render stills
   1, 90, 180 first and wait for approval before the full render.
5. **Ad scene** — Build the set at real scale around the product (marble shelf ~2 cm thick,
   counter ~4 cm, etc.). Product centred and sharp: DoF focus object = product, f-stop
   ~2.8–4 at product distance. 8 s = 240 frames: slow push-in, then a light (area or spot)
   sweeps across the label in the last ~2 s. Same render settings as step 4.
6. **Pitch** — Use `references/pitch.md`. Under 70 words, friendly, no pressure. Offer: this
   video free, then 4 new videos a month for $500. Include the single-video price reply.
7. **Fix** — Change only the named problem at the named frame; re-render that frame and show
   before/after. Then give the 5-point checklist from `references/qa-checklist.md`.

## Ground rules

- Real-world scale always (scene units cm, 1 unit = 1 cm via unit scale 0.01 m).
- Never delete or overwrite the user's scene without listing it first (step 1 does this).
- Show stills before any long render. Report render times and file paths.
- Be honest in "what still looks different / fake" — that list is the product.
- The MP4 must be H.264, under 100 MB, 1080×1350, 30 fps, so Instagram takes it.
- Don't put a brand's logo/label on a product unless the user supplied it (it's their client's asset).
