# Fix what looks fake (step 7)

## Common fixes — change only this, nothing else

| Problem | Fix |
|---|---|
| Too shiny | Raise body roughness +0.1–0.2; lower coat; lower specular IOR level to ~0.4 |
| Floats above the floor | Set product origin to base, location z = 0; check bevel didn't lift it; increase shadow softness only if needed |
| Label is stretched | Re-unwrap the label band; match UV aspect to image px ratio; check modifier order (UV before Solidify/Subdivision) |
| Too dark | Raise key light power ~30 % or exposure +0.3; don't change light positions |
| Plastic-perfect | Add noise bump 0.02–0.05 and roughness variation ±0.05 |
| Loop hitch | Rotation must be Linear and 0→360° over f1→f181 with render range 1–180 |
| Flicker | Raise Eevee samples; enable "Shadows → Jittered" off for animation |

Process: re-render only the named frame, show before/after side by side, confirm the
rest of the scene is untouched (no other keyframes, lights, or materials changed).

## 5-point pre-send checklist

1. **Real size** — product height in Blender (N panel dimensions) equals the real cm
   height; it reads the right size next to the set props.
2. **Shadows** — it touches the floor (z = 0) with a soft contact shadow in every
   checked frame; nothing floats or clips.
3. **Label edges** — no stretching, seams hidden at the back, edges crisp and not
   z-fighting with the body at f1, mid, and last frame.
4. **Smooth loop** — play the last frame into the first (loop playback): no jump in
   rotation, camera or light.
5. **File under 100 MB** — H.264 MP4, 1080×1350, 30 fps, check size on disk. If over,
   drop quality to "Medium" or use constant bitrate ~8 Mbps.
