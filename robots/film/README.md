# Sphyrna HX-4 — the robot hammerhead film

Ported 1:1 from the approved piranha film in the cutaway skill (`~/.claude/skills/cutaway`, MIT,
kit and green page copied here with its LICENSE). The beat times, moves and score are the piranha's.
Only the body changed (`hammer-shared/hammer.js` wraps the approved still `shark.js`, round 4).

| act | t (s) | part |
|---|---|---|
| optics | 3.0 | near eye: rings unscrew out along the axis, iris opens |
| leg | 5.7 | hammer: near wing telescopes, a servo spinning in each gap |
| thorax | 8.2 | flank: plates swing up on top hinges, drive gears slide out |
| abdomen | 10.8 | jaw drops off the hinge, teeth fly out |
| exploded / assemble | 13.3 / 16.5 | 330° turntable explode, fast reassembly |
| hero | 17.7 | wind-up and lunge at the lens |

Deviations from the piranha's tour, each because the body differs:
- hammer beat shot from the face side and above (the piranha's tail-from-behind looks nose-on at a front part)
- jaw beat closer and lower (smaller jaw)
- swim-in closer and higher (a long thin body read small and flat at the piranha's distances)
- camera push 0.6 and eye push 0.62 instead of 0.72 / 0.88 (parts smaller relative to the body)

## Build, check, render (from `robots/`)

```
S=~/.claude/skills/cutaway
node $S/sims/build.mjs ./film/hammer-film          # → cutaway-out/dist/hammer-film.html
node $S/sims/build.mjs ./film/hammer-demo          # 10 s short: hammer beat, explode, lunge
node $S/sims/capture.mjs hammer-film --size 1600x900 --dpr 1 --stills beats --timeline film/hammer-film/timeline.json --cols 4 --out cutaway-out/beats.png
node $S/sims/capture.mjs hammer-film --size 1600x900 --dpr 2.4 --out cutaway-out/hammer-4k.mp4
TL=$PWD/film/hammer-film/timeline.json OUT=$PWD/cutaway-out/hammer-score.wav python3 $S/run_sfx.py film/hammer-shared/score.py
ffmpeg -y -i cutaway-out/hammer-4k.mp4 -i cutaway-out/hammer-score.wav -map 0:v -map 1:a -vf scale=1920:1080:flags=lanczos -c:v libx264 -crf 16 -pix_fmt yuv420p -c:a aac -b:a 256k -shortest -movflags +faststart cutaway-out/hammer.mp4
```

Short version: `--to 10`-free; render `hammer-demo` the same way, score it with
`TL=film/hammer-demo/timeline.json` and stretch the sound with `-af atempo=1.12`.

Render speed: on a machine with a GPU, minutes. In a CPU-only cloud container (SwiftShader) about 13 s
per frame at dpr 1.2, so the full film is ~4.5 h at 1080p and far longer at dpr 2.4.
