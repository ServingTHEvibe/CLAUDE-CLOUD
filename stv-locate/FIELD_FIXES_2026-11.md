# STV Locate — November 2026 field fixes

Not deployed. Review these changes before publishing them to https://stv-locate.brannu5235.chatgpt.site.

## The new path on a phone

**Add equipment → Find building → Confirm → Add machines → Finish**

1. **Find building.** Tap **Use my GPS** or type the street address. GPS shows a blue "you are here" dot with an accuracy circle, centers the map and fills in the nearest address (marked approximate). Every address result is labeled **Exact address** or **Approximate — check the roof**. If you already saved a building at that spot, the app offers to open it.
2. **Confirm.** Tap the correct roof to move the pin. The outline loads in green when one is on file. You can **Trace outline**, **Redraw**, or **Clear** it. The outline is optional. Fill in the name and address, then tap **Confirm building**. Switch between 2D and God's Eye 3D at the top of the map.
3. **Add machines.** Tap the map where the machine is. Tapping an existing pin uses its exact spot. Pick the type, give it a name, room and floor, then **Take photo** or **Upload** (up to 3 photos). Tap **Save & add another**. The next machine starts at the same spot with the same room, floor and directions. Tap the map to move it somewhere else. **More details** holds status, model, serial, tag and notes.
4. **Capture this area** takes wider room photos. They're saved on the building and linked to the machines in that room.
5. Tap a pin or a list row to open that machine's sheet. Pins that overlap open a chooser. From a sheet you can **Edit**, **Move pin** (saving requires a new tap), **Add another here**, or get **Directions**.
6. **Finish** shows "N machines saved at <building>".

Secondary actions: **Indoor plan & 3D** and **Building options** (edit the building or outline, save the map view, switch building).

## What was wrong, and the fix

| Reported | Root cause found | Fix |
| --- | --- | --- |
| App refreshes / sends me back / loses the first pin | The building being confirmed and the unsaved machine existed only in React memory. A reload wiped them. iOS often reloads the page when the camera opens. Sign-in redirects did too. Two Leaflet maps stayed mounted at once (the home overview map stayed loaded under the planner), which adds to that memory pressure. | The whole session (stage, building, machine draft, pending photos) is saved on every change, per account. Photo bytes waiting to upload are kept in IndexedDB. Reopening the app resumes exactly where you were and shows a "restored" notice. The overview map now unmounts while the planner is open. |
| GPS gave no useful pin | There was no "you are here" marker, no address lookup, and the pin was hidden behind map overlays. | Blue dot plus accuracy circle, map centers on it, nearest-address lookup (new `/api/geocode?lat=&lng=` reverse lookup, or Google when a key is set). The map stays on top with the sheet below. |
| Couldn't mark several machines | Each save ended placement, and there was no "same spot again" flow. | **Save & add another**. Same-spot reuse. Overlap chooser shown as a bottom sheet (it used to be clipped off-screen on phones). |
| Couldn't find photo capture | Photo buttons were buried and failures were silent. | **Take photo / Upload** on the form, each with an Uploading, Attached or Not attached + **Retry** state. **Capture this area** is on the building screen. |
| Inaccurate address | Street-level geocoder results looked like building matches. GPS sites had no address. | Approximate results are labeled and zoom out. The building is saved where you tap, not at the geocoder point. GPS fills the nearest address. |
| Duplicates on retry | New building IDs were created at save time, so a retry after a lost reply made a second building. Rapid taps could double-submit. | IDs are fixed when the draft starts, saves are upserts, and a lock blocks re-entry. Tested with a reply the server stored but the client never received. |
| LiDAR / Unreal didn't deliver | Neither path could bring a result back in a usable or labeled form. | Measured RoomPlan scans import directly as a floor plan (see below). GLB uploads are labeled **Measured scan / Photo-guided reconstruction / Estimated**. Machines marked inside a model can be tapped and identified. Step-by-step guide inside the app. |

Data compatibility: no migration. New fields are optional: area photo `room`/`assetIds`/`taken`, model `kind`/`uploaded`, layout `source`. Area photos per building were raised from 12 to 24. Existing records, owner checks and private file keys are unchanged.

## Indoor plan & 3D — what's real

- **Reference photo**: photograph or upload a posted plan or safety map, crop it, set its size, and mark machines on it. Labeled "Reference photo · scale as entered".
- **Estimated layout**: rooms you sketch by hand. Labeled estimated.
- **Measured scan**: the **3D Model Anything** iPhone app (wesbos/3d-model-anything, `apps/house-capture`) exports a room `.zip` with RoomPlan `rooms/room-N.json`. STV Locate imports that `.zip`, a bare `room-N.json`, or `structure.json`. It aligns and chains the walls into a measured plan in metres. No computer is needed. That app is source-available and built in Xcode. It is **not on the App Store** and needs a LiDAR iPhone or iPad on iOS 17+.
- **3D model**: always made outside the app, then uploaded as a self-contained `.glb` (24 MB max, no Draco/Meshopt/Basis compression):
  - From a scan: open `rooms/room-N.usdz` in Blender → Export glTF Binary, Draco off.
  - From `scan-to-threejs`: export the scene with three.js GLTFExporter (`binary: true, embedImages: true`). That workflow produces an editable Three.js scene, not a GLB, so this export step is required.
  - From Unreal Home Wizard (Unreal Engine 5.8 on Windows or an Apple-silicon Mac): enable the glTF Exporter plugin → Export Selected → `.glb`. Or upload a rendered section image instead.
- A photo never becomes a measured model automatically. The rest of the app works without any 3D.

## What was tested

**Automated (`npx vitest run`): 123 tests pass, 23 files.** 19 tests written against the old planner screens were replaced by `tests/planner.test.tsx`, which has 16 tests covering the same behaviors plus resume-after-reload, owner isolation, lost-response retry, repeat taps and photo retry. One existing Google test was updated to the new screens. Also new: `tests/roomplan.test.ts` and a reverse-geocode test in `tests/storage.test.ts`. `tsc --noEmit`, `scripts/test-assets.mjs`, `scripts/test-database.mjs` and `npm run build` all pass. ESLint is clean on the new files. Whole-repo `npm run lint` aborts on the original code as well and was not fixed here.

**Browser, iPhone 13 viewport (`e2e/run-all.sh`): 56 checks pass.** These ran against the real dev server with local D1/R2 and the local mock sign-in. They passed on repeated fresh-database runs. Covered:

- GPS dot, address and outline
- Three machines in one area, two at identical coordinates, plus a fourth on floor 2 with directions
- Overlap chooser, and every machine opening its own sheet with its photo
- Moving one machine while the other machines and the building pin stay put
- Forced photo-upload failure, then reload, then Retry
- Forced save failure where the server stored the record but the reply was lost: retry gives no duplicate
- Triple-tap Save, which creates one record
- Area photo linked to the Breakroom machines
- Finish confirmation, then reload and reopen
- Denied GPS
- Approximate address, with the building saved where the roof was tapped
- 401, then sign in again, with the draft restored
- Floor-plan photo with a machine marked on it, reopened labeled
- RoomPlan JSON import (4 m × 3 m recovered)
- Bad GLB rejected; good GLB uploaded, marked, reopened and identified

**Simulated in those runs:** the sandbox blocks Esri/OSM imagery, Nominatim and Overpass. Address search, reverse lookup and roof outlines were stubbed. GPS was Playwright geolocation. The camera was file input. Sign-in was the local mock. The GLB and RoomPlan files were small synthetic fixtures.

**Still needs a physical iPhone, real credentials or a LiDAR device:**

- Real GPS accuracy and the Safari permission prompts
- Whether iOS actually reloads the page after the camera (the recovery path is what was tested)
- Real aerial imagery and God's Eye 3D (Cesium / Google 3D tiles)
- Real Nominatim/Overpass/Google results
- Production Sites sign-in and D1/R2
- A real 3D Model Anything export and a real Blender/Unreal GLB
- WebGL performance on a phone

## Setup steps for you

1. Review the diff on branch `claude/youthful-euler-d64o09`, folder `stv-locate/`.
2. Local run: `npm install` (pnpm lockfile) → `npm run build` once → apply `drizzle/*.sql` to local D1 (README) → `npm run dev` → `/signin-with-chatgpt?return_to=/`.
3. Optional Google Maps: Maps setup in the app. Enable Maps JavaScript API and Geocoding API (reverse lookup uses Geocoding), restrict the key to your site. Without a key, OpenStreetMap/Nominatim is used.
4. Before deploying, run `e2e/run-all.sh` and `npx vitest run`, then do the phone checklist above on your iPhone at a real site. No production data migration is needed.
