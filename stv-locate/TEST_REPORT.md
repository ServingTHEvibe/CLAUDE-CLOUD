# STV Locate verification — October 7, 2026

## October 17 address accuracy and 3D follow-up

The exact home address reported as incorrect has not been supplied or reproduced. These changes are safeguards and viewer work, not proof of a corrected home address.

The provider now receives structured street/city/state/postal fields when appropriate and requests address details. Explicitly conflicting house numbers and ZIP codes are rejected. Results without house-number detail are labeled approximate street/area candidates. Selecting a result opens a map with a visible candidate pin; the user can move it and must confirm its building position before saving. No default city center is silently saved as a searched address.

The map now has a switch between lightweight 2D and the retained Cesium/God's Eye-derived 3D aerial globe, with only one renderer mounted at a time. Tilt uses a look-at target at the requested coordinates, avoiding the prior camera-offset behavior. Failed WebGL/module/render initialization falls back to 2D. The 3D globe uses Esri imagery on an ellipsoid: photorealistic 3D buildings, terrain, Google place search and the full upstream OSINT application are not configured. The upstream repo documents separate provider credentials for photorealistic 3D. No Google credentials have been added and no Google billable API is called by these changes.

73 automated tests pass, with TypeScript checks. Added structured-query/conflict-filter tests, mandatory candidate confirmation, renderer switching/cleanup/fallback and a mocked Cesium adapter test for exact camera target preservation through tilt. The Cesium test uses a test double and does not verify actual WebGL rendering. Real browser/GPU, live Google imagery and the reported home-address lookup remain unverified.

Provider reference: https://nominatim.org/release-docs/latest/api/Search/ . Photorealistic provider setup: https://developers.google.com/maps/documentation/tile/usage-and-billing .

## October 16 client-pilot preparation

### Physical-address and aerial-map follow-up

Physical address is now a prominent section with street/full address, optional city, state/region and ZIP/postal fields. GPS and typed coordinates are not required when an address result is available. Advanced coordinate entry remains collapsed; GPS and map picking remain alternatives. Edited addresses clear obsolete results and focus; stale completed searches are ignored. The address example in automated tests uses a provider fixture, not a claim that the real provider indexes that specific address.

63 tests pass, including physical-address query assembly and selection, stale-result removal, real Leaflet zoom/view callbacks, satellite/street tile switching and saved marker selection. Existing tests cover saved viewport persistence and pin movement. Mobile placement now scrolls back to the map when adding/moving a pin and to its details after placement.

Live provider check: Esri World Imagery returned HTTP 200 JPEG tiles at zoom 17 (18,626 bytes) and zoom 19 (13,000 bytes) around central Des Moines. This verifies provider responses for those tiles, not all locations or real-phone rendering. The active map is a lightweight 2D renderer using God's Eye View's chosen imagery source; the full original Cesium/3D viewer is not the active map. Supported interactive browser QA is still unavailable under the Sites skill.

59 tests in 11 suites and TypeScript compilation pass. Added read-only deployment status and an in-app client pilot checklist. The checklist tests backend connectivity, the tester's real session and private inventory/building reads, then explicitly requires manual save/reopen, photo and second-browser acceptance checks. It does not falsely label a read-only check as a write test.

Fixed a conditional-upsert ownership edge case: ownership is now enforced in the SQL conflict update itself for both equipment and buildings, and a blocked update returns 403 rather than false save success. Regression tests simulate a stale ownership preflight. Private equipment/building reads now explicitly send Cache-Control: no-store.

Live HTTP verification with the supported Site service credential: `/` returned 200; `/api/session` returned 200 with signedIn:false; `/api/assets` returned 401. This is expected service-caller isolation, not evidence of a broken human login. Service access does not supply a visitor identity. No production user records were created or changed. No recent failed Worker requests were returned for the prior seven-day log window; absence of errors does not prove a working user flow.

Client access: get_site confirmed owner-private access and that external invitations are supported. Tester email addresses are still required; no audience change or invitations have been made. The supported browser QA capability is unavailable in this managed environment under the Sites skill, so actual user login, cloud save/reopen and phone imagery/GPS remain unverified. This is a private pilot candidate, not a certified production release.

## Completed automated verification

52 Vitest checks in nine suites pass in the field-pilot update. TypeScript compilation, asset-schema checks and SQL migration checks also pass. The publication helper performs the production build before pushing and packaging.

- Field dashboard: visible top-level login and add-equipment entry, explicit device-storage choice, building and exact pin capture, repair updates, reload persistence, denied GPS, cloud save recovery and truthful cloud connection status.
- Device storage: stable IDs on edits and retries, quota failure without false save success, failed/partial sync preservation, account-change rejection, concurrent-edit preservation and backup restore with remapped IDs.
- Session: missing user ID is not accepted as authorization; session responses are uncached; external sign-in return paths are rejected. Sync writes are bound to the confirmed owner at each API call.

- Map-first UI: building selection/search/save, business-specific and custom equipment, sequential pin placement with coordinate persistence, pin movement without duplication, map center/zoom persistence, save-error recovery.
- Existing UI: loading/filtering without refetch loops, record editing, photo upload, service notes, QR label creation, confirmation before deletion, cloud retry behavior.
- Actual API handlers against an in-memory SQLite database: create/read/update, user isolation, unauthorized access, cross-origin writes, foreign image references, coordinate and URL validation, saved building views.
- File/geocoding handlers with isolated storage/provider doubles: upload/download, oversized and unsupported files, missing files, owner isolation, explicit address lookup, rate limits and provider failure.
- Actual Leaflet renderer in a simulated DOM: initialization, one instance across updates, marker updates, cleanup on unmount, coordinate dispatch from map clicks, no WebGL canvas.
- Real ZIP restore: new IDs for restored buildings/assets, remapped links, exact coordinates preserved, malformed archive rejection, incomplete export rejection.

## Refresh investigation and mitigation

No application reload timer, router refresh call or automatic navigation loop was found. The original normal map loaded Cesium/WebGL; the new planner initially risked keeping a second map active behind it. The normal renderer now uses lightweight Leaflet raster aerial tiles, disables tile animations, retains only a small tile buffer, and unmounts the background map while the planner is open. The inactive original 3D adapter remains in source but is not imported by the active application.

This is mitigation of a plausible memory-pressure cause, not proof of the user's reported refresh cause.

## Verification limits

No supported interactive browser QA was available in the managed workspace. Tests do not verify live iOS Safari/WebView stability, rendered mobile layout, live aerial tile coverage, actual production sign-in, production D1/R2 reads/writes or third-party network availability. Mock network calls are used in UI tests; SQL route tests use in-memory SQLite. No user production records were created, edited or deleted during testing.

## Manual acceptance flow on the user's device

Open app → Log in (or explicitly choose device capture) → Add equipment → search/select business or GPS/manual building-map selection → choose business type → Save building & open aerial view → zoom in → Add spot → tap spot → name equipment → Save pin & add next → repeat → Save map view → Finish. Reopen Saved buildings and verify the map view and every pin. Open a record to update repair notes/status. Device captures must be exported or explicitly synced; photos require cloud mode. See FIELD_TEST_GUIDE.md for the October 8 field-pilot checklist.

Recent live inventory requests returned 401 without the required Site user-ID header. The UI now makes top-level login explicit, but a successful real-account cloud save/reopen has not been observed. Device capture is a separate local workflow, not an authentication bypass or a claim that cloud identity has been fixed. First page load, imagery and geocoding still need internet. No usage video was recorded.


## Google Maps browser setup — October 17, 2026

Story: Maps setup → website-restricted browser key → official Maps JavaScript loader → Google Geocoding service → Google satellite / photorealistic 3D map → confirmed building / equipment saved through the existing account-isolated inventory API.

- Added `/settings/maps` and visible Maps setup links from field mode, inventory planning, and map controls. Key input is masked and cleared after saving. Session storage is the default; persistent browser storage requires an explicit Remember choice. This is a public browser credential, not a private server secret. It is never included in equipment data, cloud requests or backups. Configuration applies to this browser, not every client.
- Browser integration uses Maps JavaScript API and Geocoding API, both enabled and allowed on the website-restricted key. It does not use Map Tiles API, Android or iOS SDKs. A separate backend geocoding key is unnecessary for this client-side integration.
- Google maps remain Google maps during 3D fallback. Google geocoded records retain mapProvider metadata through schema validation, device backup, sync and cloud saves. A missing key presents a setup prompt rather than displaying Google-derived data on an Esri basemap. Existing records remain compatible.
- Google's native 3D renderer uses the supported quarterly Maps JavaScript channel; the existing God’s Eye / Cesium globe remains available without a Google key. Native Google 3D is used for the website-restricted key instead of exposing a server Map Tiles credential. Google attribution is rendered by its own map controls.
- ROOFTOP results without partial_match are distinguished from approximate / partial results. Explicit house-number and ZIP conflicts are rejected. The existing user confirmation of the roof remains required before building save. Search failures never silently switch Google results to an unrelated provider.
- 3D click positions come from the native surface event; camera targeting clamps to local ground, avoiding sea-level offsets. 2D clicks and zoom conversions retain coordinate and map-view values.
- Added a no-write address test and satellite / 3D preview in setup, actionable denied-key / quota / connection errors, a remove-key control, reload instructions for key replacement, and maps terms / privacy information. Existing Site audience is unchanged.

Verification: TypeScript, the complete Vitest suite, asset validation and SQLite checks pass. New tests simulate official loader completion, geocoder responses, native Google map objects and map interaction; they cover key storage/removal, partial results, conflicts, request denial, zero matches, 2D/3D picking and cleanup, setup UI, provider isolation, and Google search → building save → equipment pin save.

Not verified: No real Google key was provided, so live Google authorization/billing, the user's home address, real Google imagery, GPU rendering and device compatibility remain unverified. No human browser QA was possible in the managed environment because the required control-browser skill is unavailable. Test doubles do not prove live map rendering or address accuracy. The setup preview gives the user a direct way to verify their own address without creating inventory. This private pilot's legal page inherits Site access; public sale still requires publicly accessible operator terms/privacy and a deliberate client credential/provisioning strategy.


## Multiple equipment pins and individual info sheets — October 17, 2026

- Multiple records can share identical latitude/longitude and the same building. Each has its own UUID, type, name, tag, serial, model, status, room, floor, notes and existing photo/service history references. No coordinates are offset to visually separate pins. No database migration or key configuration change is needed.
- After saving a pin, Add another at last spot starts a blank independent equipment record at the exact previous point. A saved pin’s info sheet also offers Add another pin here. Only location context (including floor and room) is copied; equipment identity, serial, photos, notes and service history start fresh.
- Selecting a mapped pin with neighbors within 15 m opens a chooser. All map engines receive the same selection handler. The searchable equipment pin directory gives access to covered markers, different floors and individual sheets, including while placement mode is active. Draft pins and the building preview are excluded from the saved-pin directory.
- Saved pin selection in the inventory planner now opens its information sheet, with Edit info sheet and Move pin controls. Serial and status are editable directly in the planner. Read-only sheets do not trigger a false unsaved-changes warning.
- The existing field-mode equipment profiles and advanced inventory remain available. Account ownership, device capture, backups, Google key settings and map provider isolation are preserved.

Validation: TypeScript and 88 tests in 16 suites pass. The new workflow saves two machines at precisely the same point with different serial numbers and notes, edits only one, then reopens the building and the other machine’s sheet. Tests cover exact coordinate retention, unique IDs, fresh sheet contents, nearby grouping, covered-pin selection, search and selection during placement. Build verification is performed before packaging.

Limit: no browser/GPU QA was available in this managed environment because the supported control-browser skill is unavailable. Google key and real maps are in the user’s browser; their successful Google setup was reported by the user, not retested by the agent.


## Simpler field workflow and pin interaction repair — October 17, 2026

Observed code problems: saving a pin automatically re-enabled placement, and marker click handlers treated existing equipment taps as placement while that mode was active. This could create a duplicate draft or move the wrong draft instead of opening a record. The address/building form also required scrolling through a long stacked wizard before the equipment map.

Changes:
- One full-address field, optional separate city/state/ZIP under a disclosure, a large building preview, and an explicit Use this building confirmation. GPS and typed coordinates are secondary options. Business type/address details remain editable; inaccurate search results still carry an approximation warning and can be corrected on the map.
- Equipment map with a clear Add equipment pin action, Cancel placement, a compact info/editor panel, and map-view saving under Map options. Standard equipment types prefill the name; custom type, room and notes are easy to reach. Optional asset tag/model/serial/floor/status are under More details.
- Save returns to the saved info sheet and browse mode. Blank-map taps then do nothing. A new pin requires an explicit Add action. Same-location duplicates remain an explicit Add another pin here action with independent IDs and blank machine details.
- Saved marker taps always select equipment in Leaflet, Google 2D, Google 3D and the Cesium fallback, including during placement. Leaflet marker click propagation is disabled to prevent an accompanying map click. Nearby selection retains the independent-pin chooser.
- Only the selected editable pin is draggable in 2D. Drag end updates its draft coordinates; Save persists the change, and Cancel discards the draft. 3D Move uses tap-to-place, with overhead orientation during placement. Camera/viewer settings and Google keys remain unchanged.
- Stale address previews are cleared on editing, and opening a saved building invalidates in-flight searches. Existing records, owner authorization, on-device captures and backup/sync APIs remain intact; no migration is needed.

Checks: TypeScript and 91 tests pass. Added regression tests exercise save → browse → blank-map tap, explicit placement/cancellation, saved marker selection while placing, selected-only dragging, and Google drag-end coordinates. Updated existing field/device/cloud/address tests to exercise the simplified controls and explicit roof confirmation. Existing owner isolation, backup and same-coordinate multi-record tests pass.

Limits: the managed environment lacks the supported control-browser skill, so no browser/GPU/device visual QA was possible. Real Google authorization and imagery remain in the user’s browser. These automated checks do not establish that the revised interaction feels good on their phone; field validation remains necessary.


## Retain the initial pin after building confirmation — October 18, 2026

Reported failure: a user placed an initial point, selected Use this building, and reached an equipment map with no visible pins. The coordinate was saved as a Location record but was not rendered in the equipment stage, which only rendered Asset records. Saving a map view also overwrote Location.lat/lng, mixing the camera center with the building anchor.

Fixes:
- Every opened/saved location renders a distinct blue building pin derived from its persisted Location ID and original lat/lng. It is selected immediately on entering the equipment stage and remains present alongside any equipment pins. The building card states that the original pin is saved and shows its address and coordinates. No blank/fake equipment record is inserted.
- Add equipment at this pin opens the existing equipment form at the original saved coordinates without asking the user to re-find the location. Add equipment pin remains available for additional nearby positions. A Return to saved pin button centers the map on the anchor. Selecting the building marker also returns to its card.
- Building pins are excluded from equipment counts and equipment overlap choosers; Leaflet and Google 2D render them blue, while the native 3D and Cesium views identify them as building pins as well.
- Optional Location.mapView stores camera center/zoom separately. Save map view preserves the anchor. New locations open at the chosen pin; existing listings can restore their explicitly saved viewport. Return to saved pin always centers the anchor. Old records without mapView remain compatible. Existing coordinates that were previously overwritten are not guessed or silently repaired.
- Google’s focus effect now honors an explicit repeated target command. This fixes the case where the user pans away, then requests the same saved coordinates again; equal numeric values no longer suppress the recenter action.
- Marker arrays in the planner are memoized so viewport updates do not rebuild every pin unnecessarily.

Validation: TypeScript and 95 tests across 16 suites pass. Regression coverage searches an address, manually adjusts the initial pin, confirms Use this building, checks that a visible saved marker and focus retain the exact original point, adds equipment at that point, then reopens the building and checks both markers. Other tests separate viewport/anchor coordinates, accept old listings, exclude building pins from equipment choosers, and repeat Google recenter commands. Existing account ownership, same-coordinate equipment records, device capture, backup and restore tests remain passing.

Limits: live Google authorization, rendering and phone touch interactions are not tested by the agent; the supported browser QA skill remains unavailable in this managed environment. No real user records were created or changed by these tests.

## Explicit outlined-building workflow and interior references — October 18, 2026

Implements address → map style → clicked building / green boundary → visible address + explicit confirmation → independent equipment pins and info sheets. Footprint lookup uses a bounded, throttled, authenticated Overpass request and only accepts a valid closed building containing the click. It never substitutes a nearby roof. Missing outlines/timeouts have a manual roof-corner tracing path with undo, edge/area/extent validation and explicit completion. Saved boundaries render green in Leaflet, Google 2D, native Google 3D and the keyless Cesium globe. Original location pins and view separation remain intact. Existing buildings can add/revise their outline without changing their identity or losing linked equipment.

Cloud interior capture supports up to 12 private reference photos, view descriptions, measured-dimension notes and a separately labeled uploaded finished section image. No automatic 3D-generation API is fabricated: Amir’s upstream is a guided Unreal reconstruction workflow requiring its own installation/sign-in/hardware/operator. A reconstruction ZIP includes photos, a project brief, the building outline and machine records, upstream workflow and license. Backup/restore includes interior media and remaps file ownership before saving references; Location API rejects foreign media keys. Device-only capture explicitly requires cloud login for photo uploads. Map privacy text describes footprint lookup and reconstruction exports.

Validation includes actual API handlers/SQL, manual tracing in the field workflow, explicit confirmation gating, same-building outline editing, original pin retention/reopening, same-coordinate machines, private photo capture and failed upload handling, and interior backup restore. Automated Google API object doubles verify outline options and cleanup in 2D/3D; the real Leaflet DOM renderer verifies the green polygon. These checks do not substitute for live imagery or phone-camera QA. No real customer records are used.

Final automated result for this revision: TypeScript passes; 105 tests in 18 suites pass; asset schema checks and database/migration/owner-isolation checks pass. `git diff --check` is clean. Production build/package is the final publication gate.

## Optional floor plans, sketches and browser 3D — October 20, 2026

Added an optional Interior Studio to saved buildings, and a separate /interior-demo route with clearly fictional machines. The field dashboard links directly to the demo. No Maps key, reconstruction service or Unreal workstation is needed for this modeled viewer. Floor plan → rising walls → room-entry camera is generated from entered/traced room geometry. Equipment meshes and the plan open independent equipment info sheets. The feature is loaded separately from the aerial map.

Inputs: upload JPG/PNG/WebP plans (PDFs must first be exported as an image), take a camera photo of a posted safety/warehouse map, freehand sketch walls, or drag rectangular room/area boundaries. Photo crops, estimated/measured dimensions, floor name, finishes, sketches, room pins and independent source-plan pins save with the building. Indoor coordinates remain separate from aerial lat/lng. Up to 12 rooms, 30 sketch strokes and 200 machine placements are bounded by the schema. The source plan has zoom/pan controls. Photos save privately in R2 with owner-prefix checks; sketches and layouts also work in explicit on-device capture. Demo photos use temporary object URLs and never upload to the server. Backup/restore includes background media and remaps both indoor marker types to restored machine IDs.

Browser observations: the real /interior-demo route loaded in Chrome, rendered a three-room 3D cutaway, and changed to an eye-level breakroom view using the room/Enter controls. This cloud browser has WebGL disabled. An actual Three.js SVG renderer therefore provides compatibility 3D, with lighting and machine meshes, while the GPU renderer remains available on supported devices. The browser connection timed out during the file-chooser test and then became unavailable; the warehouse photograph was not verified as loaded through that browser. Upload/crop/save/failure recovery, sketch/trace gestures, indoor placement, reopening, demo-local photo lifetime, API ownership and backup remapping are covered by automated tests. Phone camera capture and the GPU-rendered path still require target-device checks.

This is a manually modeled equipment-area viewer. A photo is a reference background; freehand lines do not automatically become a surveyed model. Rooms must be traced and dimensions checked. Existing Amir/Unreal reference-photo capture and reconstruction exports remain available separately. No uploaded customer photos are embedded in the published demo.

Final automated checks: 114 tests across 20 suites pass; TypeScript, asset schema checks, database/migration/owner-isolation checks and `git diff --check` pass. Production build/package is the final publishing gate. Secure UUID generation includes an HTTP-preview-compatible getRandomValues path; source-plan zoom/pan, demo photo cleanup and restored indoor marker links are covered.
