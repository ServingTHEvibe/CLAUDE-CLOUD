# Technical spec (Blender 5.1+)

## Scene
| Setting | Value |
|---|---|
| Unit system | Metric, length = Centimeters, unit scale = 0.01 (1 BU = 1 cm) |
| Resolution | 1080 × 1350 (4:5), 100 % |
| Frame rate | 30 fps |
| Colour management | AgX (default), look "Base Contrast" or "Medium High Contrast" |
| World | Neutral grey ~0.05–0.1 strength so the backdrop is lit by lights, not the world |

## Studio (step 1)
- **Cyc backdrop**: plane ~300 × 300 cm, back edge extruded up 200 cm, the floor-to-wall
  corner bevelled with radius ~60 cm, 12+ segments, shade smooth. Pure white diffuse
  (base colour 0.9, roughness 0.6) so it renders light grey-white, not blown out.
- **Key**: area light, size 100–150 cm, left of camera ~45°, slightly above product,
  aimed at product. ~40–80 kW. Blender light falloff ignores unit scale, so at
  1 BU = 1 cm lights sit "70 m" away and need very high wattage.
- **Rim**: area light, rectangle ~10 × 120 cm (thin strip), behind and slightly right of
  the product, aimed back toward the camera side. ~15–25 kW.
- **Camera**: 85 mm lens, at product mid-height (default 10 cm until the product exists),
  ~60–90 cm back, aimed at product centre via a Track To constraint on an empty.

- Tested headless in Blender 5.2: `scripts/studio_setup.py` + `scripts/turntable.py`
  produce a lit cyc, 3 check stills and a looping MP4.

## Model (step 2)
- Measure the product in the photo in pixels → scale so total height = stated cm.
- Round products: draw the half-profile and use a Screw modifier (360°, 64 steps) or
  a cylinder with loop cuts; boxes: cube + Bevel modifier.
- Split into `Product_Body`, `Product_Lid`, `Product_Label` (label = thin shell 0.02 cm
  outside the body over the label band). Parent all to an empty `Product` at the base
  centre, origin at z = 0.
- Front render: camera straight on, 135 mm lens. ¾ render: 35–45° around, slightly above.

## Material presets (step 3) — Principled BSDF
| Look | Base colour | Metallic | Roughness | Other |
|---|---|---|---|---|
| Clear glass | white | 0 | 0.02–0.05 | Transmission 1, IOR 1.45–1.5; add solidify thickness 0.2–0.4 cm |
| Frosted glass | white | 0 | 0.25–0.4 | Transmission 1, IOR 1.5 |
| Matte ceramic | product colour | 0 | 0.55–0.7 | Coat 0.05 for a faint glaze |
| Glazed ceramic | product colour | 0 | 0.15 | Coat 0.6, coat roughness 0.05 |
| Brushed metal | 0.8 grey | 1 | 0.3 | Anisotropic 0.6 + subtle noise bump |
| Frosted plastic | product colour | 0 | 0.45 | Subsurface weight 0.1 |
| Paper label | label image | 0 | 0.6 | — |

- Add a faint Noise texture (scale ~200, strength 0.02–0.05) into Bump to kill the
  "too perfect" look; small roughness variation via the same noise (±0.05).
- Bevel every hard edge 0.05–0.2 cm (Bevel modifier, 3 segments, limit by angle 30°).
- Label UVs: unwrap the band as a rectangle; set its aspect to match the image
  (width/height = label image px ratio) — otherwise it stretches.
- Eevee: enable ray tracing (screen-space reflections/refraction) and shadows; for glass
  set the material's render method to "Blended" / enable raytraced transmission.
- Contact shadow: product must touch z = 0 exactly. Raise light size for softer shadow.

## Turntable (step 4)
- 6 s × 30 fps = **180 frames**, render range 1–180.
- Keyframe Z rotation 0° at f1 and 360° at f181, interpolation **Linear** → f180 → f1
  loops seamlessly (f181 would duplicate f1).
- Camera push: dolly ~5–8 % closer peaking at f90, eased (Bezier) back to start at f181,
  so the camera also loops.
- Engine Eevee, samples 64; motion blur off for clean loops (or on with shutter 0.5).
- Output: FFmpeg, MPEG-4 container, H.264, quality "High", encoding speed "Good",
  no audio. A 6 s 1080×1350 clip lands ~5–20 MB.

## Ad scene (step 5)
- 8 s = **240 frames**.
- Camera DoF on, focus object = product, f-stop 2.8–4.
- Push-in: camera moves ~15–25 % closer over 240 frames, ease in/out.
- Light sweep: an area/spot light keyframed to travel across the label between
  f180–f240; only the label's highlight should visibly move.
- Morning light = warm sun (≈4500 K, angle 2–5°) through a window-ish angle; kitchen
  = warm key + bounce; water = HDRI-free cool sky + caustic-looking spot gobo.

## Output names
`<brand>_<product>_spin_v01.mp4`, `<brand>_<product>_scene_v01.mp4`, stills as
`<name>_f0001.png`.
