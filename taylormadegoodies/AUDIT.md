# Audit and implementation report

## What was available

The handoff describes an existing build (`taylormadegoodies-scrollfilm-deploy.zip`,
`taylormadegoodies-scrollfilm.zip`, 434 extracted frames, two source videos). None of that was
in this session:

- The repository contained only `research/` (unrelated lead-gen notes).
- Uploads: the Scroll-Film Studio skill zip and the dessert/logo footage (Video B: 1404×1476,
  24fps, 10.04s, 241 frames). The Atlanta mural footage (Video A: 1916×1080, 24fps, 8.04s,
  193 frames) arrived in a later upload and is now the film's opening chapter. The earlier
  build was never uploaded.

So items 1–9 below describe this build, not the missing one. The creative direction was
kept exactly as specified: the cinematic scroll film, the Taylor Made Goodies portal, the
cream/black/gold/pink palette, the concierge, and no invented business facts. The narrative
is ATLANTA WALL → TAYLOR MADE GOODIES → INTO THE GOODIES: the mural pushes into the lettering,
a cookie flies into the lens, and a circular portal opens out of it into the dessert film.

## 1. Stack
Static HTML/CSS/ES modules, with GSAP 3.15 + ScrollTrigger and Lenis 1.3 vendored in
`public/vendor/`. Vercel Node serverless functions in `api/`. No framework and no build step:
nothing in the brief needed one, and it keeps the deploy trivial.

## 2. Structure
`index.html` sections: 01 film (hero + "into the goodies" chapters), 03 Signature Goodies
(image/copy, copy/image, full-bleed), 04 Custom Orders (4-step rail), 05 Our Story, 06 FAQ,
07 Order CTA, 08 Footer, plus the concierge dialog. JS is split by system: `film.js`,
`film-config.js`, `main.js` (scroll/motion), `concierge.js` (UI), `lib/orders.js` (API).

## 3. Hero
A sticky 100svh stage inside a tall scroll driver (940vh desktop, 680vh mobile). Sticky is used
instead of a GSAP pin, so there's no pin-spacer refresh ordering and it behaves better with
mobile address-bar resizes. Layers, back to front:
- blurred backdrop (a 16px copy of the current frame, upscaled; background plane ≈0.2×) and its dim layer
- the mural canvas, full-bleed (extra push-in that accelerates through the portal, then fades)
- light and gradient scrims
- the dessert canvas in a feathered "portal" (product plane). It opens as a growing circle
  from the centre of the screen, then pushes in and drifts
- gold dust particles (foreground FX plane, fastest)
- vignette + animated grain
- beat typography, chapter readout, scroll cue, loader

## 4. GSAP / ScrollTrigger
One loop: Lenis runs inside `gsap.ticker` and `lenis.on('scroll', ScrollTrigger.update)`, with
`lagSmoothing(0)`. The film uses a ScrollTrigger for raw progress, and the ticker eases toward it
and redraws only when the value changes. Everything below the film is in
`gsap.matchMedia()` desktop/mobile contexts, so parallax amounts drop to 45% on mobile and are
reverted automatically on breakpoint change. The modules run once (no framework double-mount),
so StrictMode-style duplication doesn't apply.

## 5. Frame sequence
`scripts/extract-frames.sh`: native 24fps, WebP. Mural: 125 frames, 1600w desktop (13 MB) /
960w mobile (6.5 MB). Desserts: 241 frames, 1080w (13 MB) / 720w (7.8 MB). Each chapter draws
to its own canvas, and each canvas holds its boundary frame so both images are ready during
the portal. Loading order: opening run (24 desktop / 12 mobile) → every 8th → 4th → 2nd →
the rest, idle-paced with `requestIdleCallback`. Frames just ahead of the playhead jump the
queue after a fast scroll. Decoding uses an `ImageBitmap` sliding window (48 ahead / 30 behind
desktop, 28/14 mobile) so draws are blits, not main-thread decodes. The nearest loaded frame
stands in for any missing one, and a breakpoint change swaps the set and closes old bitmaps.
Canvas DPR is capped at 1.5 and at 1.2× the source width.

## 6. Performance risks (measured)
- The **CSS `filter: blur()` on the full-screen backdrop** was the largest cost (headless p50
  100ms → 33ms without it). Replaced with a downsample blur (16px canvas upscaled), with the
  darkening moved into the overlay. p50 halved.
- Remaining frame times in this container (no GPU, software raster: p50 ≈50ms, p95 ≈130ms while
  forcing a 60px jump every frame) are dominated by rasterizing a ~900×940 canvas plus overlays
  on the CPU. Real devices composite these on the GPU. Still worth checking on a mid-range
  Android and an iPhone once it's deployed.
- Backdrop-filter glass is limited to the nav, launcher and ghost buttons.
- Payload: about 26 MB of frames on desktop and 14 MB on mobile, streamed progressively and
  cached immutably. First paint needs only mural frame 0 (preloaded per breakpoint), and the
  first dessert frame loads early so the portal is never empty.
- Fonts are self-hosted (87 KB, preloaded), so there's no Google Fonts round-trip.

## 7. Mobile
The footage is near-square. Cover-cropping it would cut the logo on a laptop and about half of
every frame on a phone. It plays in a feathered portal instead: top-aligned on mobile with copy
below, and to the right of the copy on desktop. Mobile also gets:
- its own type scale
- shorter scroll distance and less parallax
- a smaller frame set, a smaller decode window and fewer particles
- no pointer effects, no readout, and a full-screen concierge sheet
- a burger menu with large tap targets

## 8. Broken / incomplete (found and fixed during verification)
- 34px of real horizontal scroll from a bleeding editorial image → `overflow-x: clip` on root.
- `[hidden]` contact buttons still rendered (a `.btn` display override) → global `[hidden]` rule.
- `?jump` captures were mid-lerp → the playhead settles on jump.
- Hero and finale headlines collided with the logo or wrapped badly → resized.
- The cookie still contained the logo and the incoming cake slice → dedicated 5:4 crop.
- The logo cut-out from the footage never keyed cleanly. Following the skill's one-attempt rule,
  the nav and footer use a live-type lockup, and the real logo appears in the film itself.

## 9. UI/UX opportunities (next)
- Real product photography, names and pricing, which unlocks a checkout step in the concierge.
- A social/event proof section once there are real posts or photos (deliberately absent).
- A founder story in Our Story.

## 10. Verification run
- `npm test`: 10/10 API tests pass (validation, honeypot, 405/400/503/502, webhook delivery).
- `scripts/verify.mjs` at 1440×900, 1728×1117, 1920×1080, 1024×1366, 834×1194, 390×844,
  393×852 and 430×932: no page errors and 0px horizontal overflow at every size. The film
  scrubs through both chapters and the portal. Earlier runs showed intermittent
  `ERR_TOO_MANY_RETRIES` errors; request logging traced every one to Google Fonts through
  this sandbox's proxy. Fonts are now self-hosted, and the final runs are clean at all 8 sizes.
- Portrait tablets (1024×1366, 834×1194) use the mobile composition, so the 16:9 mural isn't
  crushed behind desktop copy.
- `scripts/e2e-concierge.mjs`: the full order (every field, photo upload, edit from review)
  arrived at the webhook with the correct payload. With no channel configured, the fallback
  path keeps the draft and offers copy/email/text.
- Reduced motion: the static poster hero renders on desktop and mobile with no errors.
- Scroll-Film Studio `copy-gate.js`: clean.
