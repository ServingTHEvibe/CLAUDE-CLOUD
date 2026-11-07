# STV Locate — Claude handoff

Start here. This package contains the actual recovered app source, not just a mockup or specification.

## Package provenance

- Owner: Dwight Brown / Serving The Vibe Media.
- App: https://stv-locate.brannu5235.chatgpt.site
- Source commit: e61570771e2b1d85094248f63939ef92faab5129
- Current Sites version reported at export: 15. Retrieved November 6, 2026 (America/Chicago).
- Source is the repository HEAD recovered during export. Its exact equivalence to the deployed build was not independently compared.
- No app code was changed for this handoff. No fresh build, test run or phone field test was performed during export. Existing test reports describe earlier checks and are historical evidence.
- Source, static dependencies, migrations, tests and existing documentation are included. Git history, credentials, installed dependencies, generated build caches and production equipment/photo/database records are excluded.

## Owner's intended product

A premium, simple, sellable field equipment locator, standalone now with future VendDoctorAI integration. Arrive at a location, use GPS or enter an address, inspect aerial/God's Eye view, select and outline the correct building, confirm it, place multiple independent equipment pins, take photos, save, and reliably return later. Multiple machines must work at the same coordinates and in different parts/floors of the same building. Every machine needs its own details and photos. Remove clutter from the main workflow.

The owner's recurring reports: GPS does not visibly mark a useful pin, first pins do not persist, multiple machines are confusing or unavailable, save/reopen loses context, address results are inaccurate, the app refreshes unexpectedly, photo capture is hard to find, and the 3D integrations have not delivered the expected experience. Treat these as issues to reproduce, not proven fixed by earlier notes.

## Claude starting prompt

Continue this existing STV Locate application from the included source. First read this handoff, source/INTEGRATION.md, source/FIELD_TEST_GUIDE.md, source/REPAIR_NOTES.md and source/TEST_REPORT.md, then inspect the actual implementation. Keep the app focused on arriving at a building, locating it with GPS or address, confirming its roof, placing multiple independent machine pins, taking photos and saving/reopening everything. Diagnose the owner's reported issues before adding features. Make the phone workflow clear and premium. Use the existing architecture and preserve data compatibility unless a migration is necessary. Implement and verify the fixes; don't stop at a proposal. Explain which field steps were actually tested and which still require the owner's phone. Never claim a photo automatically becomes a measured 3D model. Keep current authentication and record ownership intact. Produce source changes, setup instructions and concise validation evidence. Do not deploy over the existing app or migrate production data without an explicit deployment instruction.

## Code map

| Area | Files in source/ |
| --- | --- |
| Main field experience | app/page.tsx, components/field-workspace.tsx |
| Building and machine records | lib/location.ts, lib/asset.ts, lib/field-store.ts |
| Aerial mapping / Google setup | components/asset-map-3d.tsx, lib/google-maps.ts, components/maps-setup.tsx, app/settings/maps/page.tsx |
| Roof boundaries / geocoding | lib/building-outline.ts, lib/geocode-result.ts, app/api/building-footprint/route.ts, app/api/geocode/route.ts |
| Interior capture and saved models | components/building-interior.tsx, components/model-viewer.tsx, lib/model-file.ts, app/api/models/route.ts |
| Floor plan and modeled interior | components/interior-studio.tsx, components/plan-viewport.tsx, lib/interior-layout.ts |
| Photos / backup | lib/capture-photo.ts, lib/export.ts, app/api/files/route.ts |
| Identity / persistence | app/chatgpt-auth.ts, app/api/session/route.ts, app/api/assets/route.ts, app/api/locations/route.ts, db/, drizzle/ |
| Regression coverage | tests/, vitest.config.ts, scripts/test-assets.mjs, scripts/test-database.mjs |

## Architecture and startup

React 19 + TypeScript, Vinext/Vite, Next-compatible app routes, Tailwind, Cloudflare Workers, D1 database binding DB and R2 file binding BUCKET. Maps use Leaflet/Esri and optional Google Maps; Cesium and Three.js are present. Read package.json and the original README for the exact dependency versions and runtime behavior.

Use a compatible modern Node runtime (package declares >=22.13; the database check uses node:sqlite). A clean checkout defaults to the portable execution profile. The package has no installed dependencies.

Typical starting commands from source/:

```sh
npm ci --prefer-offline --no-audit --no-fund
npm run dev
```

Use the checked-in lockfile. If installation reports a runtime or peer mismatch, resolve and document it rather than silently forcing dependencies. The original README explains portable local mock login and worker storage setup. Local /signin-with-chatgpt?return_to=/ simulates identity only in supported loopback development. Production sign-in comes from Sites dispatch.

Available checks, after installing dependencies:

```sh
npx tsc --noEmit
npx vitest run
node scripts/test-assets.mjs
node scripts/test-database.mjs
npm run build
```

These are commands for the receiving developer; they were not run during this export. There is no npm test script in the recovered package.

## Environment and portability

- .openai/hosting.json preserves the existing Site identity and D1/R2 binding names as source configuration. It is not a database export or a deployment credential.
- Live cloud records/photos do not travel with this ZIP. Use the app's owner-authorized backup/export for actual inventory migration, preserving original data until verified.
- A Google browser key must be configured and restricted for the chosen host. No key is included. The existing setup page describes the current integration.
- A deployment outside Sites needs a real replacement for dispatch-owned identity and Cloudflare bindings or equivalent services. Do not trust arbitrary client-supplied identity headers on an unprotected public origin.
- VendDoctorAI synchronization and technician team roles remain future work; do not assume they exist.

## 3D scope — keep the claims accurate

The app has interior reference-photo capture, reconstruction export, a manually modeled plan/interior viewer, and a private GLB upload/view endpoint. Current model validation accepts self-contained GLB 2 files up to 24 MB and rejects external resources and certain compression extensions; inspect lib/model-file.ts before changing it.

The intended external resources are wesbos/3d-model-anything (LiDAR/RoomPlan and scan-to-threejs workflow) and the Unreal Home Wizard workflow. Existing provenance/licenses are under source/public/licenses and source/INTEGRATION.md. Their full upstream toolchains are not supplied by this ZIP. Inspect actual integration points before claiming a complete connection. Ordinary reference photography, measured LiDAR scans, manually traced geometry and finished reconstructed GLB models must be clearly labeled. Camera/photo capture and imported model placement must remain useful even when native scanning is unavailable.

## Acceptance checklist for fixes

1. Real phone: GPS allowed, denied and unavailable all produce clear states; accepted coordinates visibly center/mark the map without silently becoming an equipment save.
2. Address: select a candidate, inspect the correct roof, outline or trace it, explicitly confirm it, and preserve the building's original point independently from the viewport.
3. Create at least three separate machines in one area, including two sharing coordinates, then machines in another room/floor. Select each through an overlap chooser and open the correct sheet.
4. Take/upload up to three machine photos, add model/serial, room/floor and notes; handle failed uploads without losing the form.
5. Save, leave, reload, sign back in and reopen. Confirm all machine IDs, coordinates, photos, building boundaries and interior placements survive.
6. Move one machine, cancel a move, edit another record, and verify neighbors remain unchanged. No accidental map taps create records.
7. Verify cloud owner isolation and device capture behavior separately. Never describe device-only records as cloud synced before successful sync.
8. Import a supported GLB, reopen it, place/select equipment indoors, and verify independent aerial versus indoor coordinates. Unsupported models get usable errors.
9. Exercise phone touch interactions, camera, orientation changes and memory behavior. Automated map/GPU doubles do not prove real imagery, GPS or GPU behavior.
10. Run appropriate regression checks and record exact outcomes. Keep the main field flow short; optional advanced tools belong behind secondary controls.
