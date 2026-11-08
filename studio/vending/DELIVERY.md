# Vending machine product videos: delivery notes

## The videos

| File | What it is | Specs |
|---|---|---|
| `vending_swing_v01.mp4` | Step 4: 6-second ±40° swing loop on a white studio backdrop | H.264, 1080×1350, 30 fps, 180 frames, 2.5 MB |
| `vending_ad_breakroom_v01.mp4` | Step 5: 8-second ad scene in an office break room, slow push-in, light sweep across the glass at the end | H.264, 1080×1350, 30 fps, 240 frames, 3.1 MB |

Source scenes: `vending_machine_swing.blend` and `vending_ad_breakroom.blend` (Blender 5.1+, Eevee set as the
render engine). Re-render on a laptop with a graphics card for full quality. The MP4s here were rendered with Cycles on
a processor only, at reduced samples.

## Step 6: the pitch

Who to send it to: a local vending operator, or a business that places machines, that posts its machines on
Instagram. Send them a video of *their* machine, made from a photo on their page.

**DM (64 words):**

> Hey [business name]! I made this video of one of your machines from a single photo on your page. It's yours
> free. Use it on your site, in ads or reels to land new locations. If you like it, I can make 4 new videos
> every month for $500 (new setups, new spots, promos). No pressure at all, just thought it fit your brand.

**When they ask "how much for just one?":**

> Totally fair! A single video is $200. The monthly plan works out to $125 each, and you get a fresh one every
> week without having to ask, but happy to start with one and go from there.

Follow up once after 3–4 days if there's no reply, then stop.

## Step 7: pre-send checklist (run on these videos)

| # | Check | Result |
|---|---|---|
| 1 | **Real size**: matches the real machine | Pass. Model measures 119 × 90 × 183 cm (W × D × H), a standard full-size glass-front machine |
| 2 | **Shadows**: touches the floor, no floating | Pass. Lowest point is exactly z = 0 (the feet); contact shadow visible in both videos |
| 3 | **Label edges**: no stretching or seams | Pass. Bottle label bands are clean, with no stretching. Note: these are plain colour bands, not real brand labels |
| 4 | **Smooth loop**: last frame flows into the first | Pass (swing). The frame 180 → 1 jump measured 4.74 vs 4.64 for a normal frame step. The ad scene is a one-way push-in, not a loop |
| 5 | **File under 100 MB** so Instagram takes it | Pass. Swing 2.5 MB; ad scene 3.1 MB |

## What still looks fake (fix before a paid job)

1. **Blue graphic panels are flat colour.** The real machine has an ice/water-splash graphic. Use the client's artwork
   if they have it.
2. **No brand logos on the drinks.** On purpose: only add real labels the client supplies.
3. **No clear dispensing coils** on the shelves, and no A1–F9 slot labels.
4. **Morning sun is subtle** in the break-room shot. The window light could be pushed brighter.
5. **Slight render grain** from the low-sample cloud render. A full-quality Eevee render on your machine removes it.

To fix one, use prompt 7: *"This part looks fake: [issue] at frame [number]. Fix only that and keep everything else the same."*
