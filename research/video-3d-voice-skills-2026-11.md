# 11 free Claude Code skills for video, 3D and voice

Source: a social post ("No After Effects. No Blender. Claude Code built every frame of this video").
Checked on 2026-11-11. The post's links were cut off, so each one below was matched to its real GitHub
repo, cloned, and checked: the `SKILL.md` files, the LICENSE file and anything that needs installing.

## Catalog

| # | Category | Repo | What it does | Skills inside | License | Needs |
|---|----------|------|--------------|---------------|---------|-------|
| 1 | Voice | [debpalash/VoiceStudio](https://github.com/debpalash/VoiceStudio) | Local ElevenLabs-style app: voice cloning, voice design, dubbing, transcription | `voicestudio` (+ `voicestudio-maintainer`, which only maintainers need) | **AGPL-3.0** | The VoiceStudio desktop app/backend running on `localhost:3900`. MCP endpoint at `http://localhost:3900/mcp` |
| 2 | Films | [mromidev/claude-animated-shorts](https://github.com/mromidev/claude-animated-shorts) | ~60 s vertical cartoon shorts: 2D characters in a 3D ink-lined town | `cartoon-3d-short` | MIT | Node, Remotion, three.js |
| 3 | Films | [tuzhechen2005/opus-video-skills](https://github.com/tuzhechen2005/opus-video-skills) | Watercolour/ink cartoons (p5.brush) and kinetic-typography reels | `painted-animation`, `kinetic-reel` | MIT* | Node, headless Chrome, ffmpeg |
| 4 | Films | [Moessif/code-video-showcase](https://github.com/Moessif/code-video-showcase) | 30–90 s showcase films cut to a beat; the music is generated with numpy too | `code-video-showcase` | MIT | Playwright, Python (numpy/scipy), ffmpeg. SKILL.md is in Chinese |
| 5 | Motion | [NiazMorshed2007/reanimate](https://github.com/NiazMorshed2007/reanimate) | Rebuilds an animation from a URL, video, GIF or Lottie file, then checks it frame by frame against the original | `reanimate` | MIT | Browser recording + ffmpeg |
| 6 | Motion | [rossark0/rossark-motion-skill](https://github.com/rossark0/rossark-motion-skill) | Makes SVG illustrations come alive (blinks, breathing, acting) at 60 fps | `rossark-motion-skill` | MIT | Targets React Native and SwiftUI |
| 7 | Motion | [nolangz/pixel2motion](https://github.com/nolangz/pixel2motion) | Raster logo → clean SVG → animated logo reveal (HTML/GIF/video) | `pixel2motion` | MIT | Node / browser |
| 8 | 3D | [img2threejs/img2threejs](https://github.com/img2threejs/img2threejs) | Reference photo → procedural three.js model written in code | `img2threejs` | Apache-2.0 | three.js |
| 9 | 3D | [elvarofficial/teardown](https://github.com/elvarofficial/teardown) | Interactive 3D sim of a machine you can pull apart, plus a 60 fps tour film | `teardown` | MIT | Browser + ffmpeg (for the film) |
| 10 | Blender & CAD | [EL4CTEO/blender-skills](https://github.com/EL4CTEO/blender-skills) | 28 Blender 5.2 workflows: modeling, UVs, PBR, baking, rigging, animation, export, QA | 28 (`blender-core` and others) | MIT | Blender 5.2. Ships a Claude plugin marketplace |
| 11 | Blender & CAD | [earthtojake/text-to-cad](https://github.com/earthtojake/text-to-cad) | Parametric CAD (build123d), PCBs, stress checks (FEA), drawings, renders, 3D-print slicing | 8 (`cad`, `pcb`, `fea`, `render`, …) | MIT | Its own local CAD server + viewer (uv/Python). Ships a Claude plugin |

\* GitHub shows "NOASSERTION" for opus-video-skills, but its LICENSE file is plain MIT. The bundled
`painted-animation` template comes from JohnHeibel/ClaudeAnimationBase, which is also MIT.

## Corrections to the post

- **VoiceStudio does ship a skill.** `skills/voicestudio/SKILL.md` teaches Claude to use the
  app's REST API and MCP endpoint. The post is right that the app itself is AGPL and that the skill
  does nothing unless the app is running.
- **text-to-cad is more than a skill.** It needs its own CAD server and viewer. The official setup is
  `curl -fsSL https://texttocad.dev/install.sh | sh`. Read that script before running it, or follow
  the step-by-step guide in `docs/install.md` instead.
- **The install name for claude-animated-shorts is `cartoon-3d-short`**, not the repo name.
- Licenses: 9 MIT, 1 Apache-2.0 (img2threejs), 1 AGPL-3.0 (VoiceStudio). This matches the post.

## Safety scan

I read every `SKILL.md` and searched all `.md`/`.sh` files for `curl | sh`, `sudo`, `rm -rf /` and
API-key handling. None of the skill files tell Claude to run a remote script or send data anywhere.
The only `curl | sh` lines are in the README/CONTRIBUTING docs of VoiceStudio and text-to-cad, and
they install the app itself. VoiceStudio's API has no authentication on loopback, so don't expose
port 3900 to your network unless you set `OMNIVOICE_API_KEY`.

## Install (on your own machine)

The skills CLI flags used below come from `npx skills add --help`. `-g` installs for your user
account, `-a claude-code` installs only for Claude Code, and `-s` picks skills by name.

```bash
# Single-skill repos
npx skills add mromidev/claude-animated-shorts   -g -a claude-code -y
npx skills add Moessif/code-video-showcase       -g -a claude-code -y
npx skills add NiazMorshed2007/reanimate         -g -a claude-code -y
npx skills add rossark0/rossark-motion-skill     -g -a claude-code -y
npx skills add nolangz/pixel2motion              -g -a claude-code -y
npx skills add img2threejs/img2threejs           -g -a claude-code -y
npx skills add elvarofficial/teardown            -g -a claude-code -y

# Multi-skill repos (list first with -l, then pick with -s or take all with '*')
npx skills add tuzhechen2005/opus-video-skills   -g -a claude-code -s '*' -y
npx skills add EL4CTEO/blender-skills            -g -a claude-code -s '*' -y

# VoiceStudio: install the app first (see its README), then add only the user-facing skill
npx skills add debpalash/VoiceStudio             -g -a claude-code -s voicestudio -y
claude mcp add --transport http voicestudio http://localhost:3900/mcp

# text-to-cad: use its installer or docs/install.md (it sets up the server, skills and plugin together)
```

blender-skills and text-to-cad also ship `.claude-plugin/marketplace.json`, so in Claude Code you can
install them as plugins instead: `/plugin marketplace add EL4CTEO/blender-skills` (or
`earthtojake/text-to-cad`), then `/plugin install`.

## Overlap with skills already in this account

| New skill | Already have | Verdict |
|-----------|--------------|---------|
| teardown | `exploded-view` | Close overlap. teardown adds live gauges, an auto tour and a 60 fps film. Worth comparing on one machine |
| cartoon-3d-short, kinetic-reel | `remotion`, `viral-video-monster`, `motion-monster` | These add specific looks that are proven to work (ink-lined 3D town, editorial type reel) |
| blender-skills | `blender-product-video`, `blender-3d-web-objects` | Those are pipelines for one task. blender-skills is a general Blender 5.2 reference. They work well together |
| img2threejs | `threejs-scene`, `3d-threejs-pipeline` | Fills a gap: photo → model |
| reanimate, pixel2motion, rossark-motion | `motion-design`, `gsap` | Fills gaps: cloning a reference animation, vectorizing a logo, animating characters |
| VoiceStudio | HIGGSFIELD voice/dubbing (paid credits) | Local alternative that costs nothing per generation |
| text-to-cad | none | New capability |

## Best first picks for client work

1. **pixel2motion**: animated logo reveals are an easy upsell for every brand-site and reel client.
2. **img2threejs + teardown**: interactive 3D product heroes with no model files to license.
3. **cartoon-3d-short / painted-animation**: faceless story shorts with no generation credits spent.
4. **VoiceStudio**: narration and dubbing for those shorts on your own machine, without per-minute fees.
