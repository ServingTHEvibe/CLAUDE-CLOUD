> **November 2026:** the Add equipment flow was rebuilt. See `FIELD_FIXES_2026-11.md` for the current steps; button names below are from earlier versions.

# STV Locate — field pilot

For October 8, 2026. Open https://stv-locate.brannu5235.chatgpt.site in the same phone browser you will use in the field.

## Start

1. Tap **Log in** (top right) for your private cloud workspace. Login uses ChatGPT, not a new STV password.
2. If cloud login fails, tap **Add equipment → Start device capture**. This records new equipment locally without accessing any cloud records. Do not clear browser data or switch browsers before backing up/syncing.
3. Tap **Add equipment**, enter the business address, then search. If the provider has no match, use **Choose building on map**. Or **Use my GPS near the building** when on-site: GPS is approximate, so verify the roof/address yourself.
4. Complete the business name, address and type. Save the building. On its aerial map, zoom in, tap **Add spot**, then tap the equipment's position.
5. Choose the equipment type; add its room/model/tag and notes. Tap **Save pin & add next**. Add another machine or tap **Finish**.

## Repair workflow

Open a saved equipment card → **Update / repair notes** → change its status and enter what you fixed → **Save equipment**. Directions opens the saved coordinates. Saved buildings reopens the location map so you can add or move pins.

Photos are available in cloud mode. Device capture currently stores text, repair history, buildings and coordinate pins, not photos. Aerial tiles, address lookup and the first page load need an internet connection. This is not a fully offline installed app.

## Keep the records safe

**Export device backup** downloads a field JSON backup. **Restore device backup** makes independent copies without overwriting existing records. If cloud login works, **Sync to my account** asks you to confirm the receiving account. Partial failures preserve the entire queue; retries use stable IDs. The cloud endpoints reject a sync if the account changes. A successful sync removes only unchanged uploaded items from the queue.

## Before relying on it tomorrow

Make one clearly labeled FIELD TEST business and equipment pin. Save, finish, reopen the record, add a repair note, refresh, and check that both the position and note remain. In device mode, export the backup as well. In cloud mode, reopen in another signed-in browser to verify actual cloud persistence.

## Release status

This is a field-pilot build, not a certified bug-free or sale-ready SaaS release. Automated UI tests use mocked network/map inputs; API tests use in-memory SQL. Live account login, production save/reopen, real phone camera/GPS and aerial imagery still require confirmation on the actual device. Recent live requests lacked the required Site user-ID header; no authentication bypass was added. Payments, customer onboarding, team roles and commercial service/support terms are not implemented.


## Connect Google Maps (October 17 update)

1. Open `/settings/maps` using Maps setup in the app.
2. In Google Cloud, enable Maps JavaScript API and Geocoding API and allow both in this key’s API restrictions. Choose Websites and allow `https://stv-locate.brannu5235.chatgpt.site/*`. Billing must be active. Map Tiles API is not used by this browser integration.
3. Paste the restricted browser key in the masked field. Select Remember only on a trusted device, then Save & connect Google Maps. Session storage is used otherwise. This applies to this browser only.
4. Enter your complete actual address in the test section. Select the result, check the roof in Satellite, then try God’s Eye · Google 3D. Approximate / partial matches require special care. The test creates no inventory. Google can still return an incorrect candidate.
5. Return to Add equipment, find and confirm the building, save it, add a spot, tap the actual equipment position, fill equipment details and save. Reopen the saved building to check the pin.
6. If changing the key after Maps has loaded, save the replacement and reload. A Google-derived saved location needs a Google key to display its map. Removing a key does not delete inventory. Browser keys are visible to the browser and must remain restricted; never enter a private backend key here.


## Several machines in the same area

1. Open a saved building, select Add spot and tap the equipment location. Fill the machine’s own name, equipment type, model/serial, room/floor, status and notes. Save pin & add next.
2. For a machine beside it, select Add another at last spot. This starts a separate empty info sheet at the same coordinates. Give it its own equipment name/tag and save. Repeat for as many machines as needed.
3. Select the map’s equipment pins button to search all saved pins. When a map marker has neighbors within 15 m, selecting it opens the nearby chooser. Pick a machine by its name, tag, floor and room. Coordinates remain unchanged.
4. In the building planner, a saved pin opens its info sheet. Select Edit info sheet to update that machine, Move pin to reposition only that record, or Add another pin here to create another independent record at the same spot. Existing photos/history appear when present.
5. Reopen the building to verify each machine’s separate sheet and coordinates. Cloud saves require sign-in; device capture remains in this browser until explicitly synced.


## Current simpler workflow (supersedes older button names above)

1. Add equipment → enter the full address → Find address → select the result. Inspect the large roof preview and select Use this building. Saved buildings reopen directly.
2. Choose Add equipment pin. Tap an empty map position. Pick a common equipment type (or enter a custom one), give it a name and room, and select Save equipment pin. Optional model/serial/floor/status fields are under More details.
3. Saving opens the saved sheet and stops placement. Tapping a saved marker opens its sheet; overlapping markers show a chooser. Blank-map taps do nothing until Add equipment pin or Move pin is selected. Cancel placement exits that mode.
4. To adjust a draft, drag its selected pin in 2D or select Move pin and tap the new position. Save equipment pin persists the draft. Cancel changes discards it.
5. For another machine at identical coordinates, open its saved neighbor and select Add another pin here. Supply the new machine’s own details and save.
6. Verify on the actual field device: select existing pins during Add mode, cancel placement, move and cancel a draft, save a move, reopen the building and confirm the correct record and point remain.


## Initial pin retention (October 18 update)

After Use this building, the original point stays on the map as a blue building pin. Its saved card shows the address and exact coordinates. Use Add equipment at this pin to create the first machine record at that same position, or Add equipment pin to place one nearby. Equipment records still need their own type/name and Save equipment pin.

Return to saved pin recenters the original building point after panning. Save map view now stores the viewport separately and does not move the original point. Reopen the listing from saved buildings to see the original building point and all equipment pins. Old listings remain compatible; previously overwritten coordinates are not automatically reconstructed.

## Building outline and interior workflow — October 18
1. Enter a complete address, Find address, and choose its result. Switch between 2D aerial and God’s Eye 3D as desired.
2. Click the actual building roof. Available OpenStreetMap footprints are outlined in green only when they contain the clicked position. If unavailable, choose Trace roof corners, click at least three corners in order around the selected pin, then Finish outline. Undo removes the last corner. Do not cross edges.
3. Review the visible address, name and business type; check “This address and building are correct,” then Use this building. The original building pin and green boundary stay on the equipment map. Edit building outline updates the same building ID.
4. Add equipment at the saved pin, or Add equipment pin and click another position. Fill in and save its own sheet. Add another pin here creates an independent machine record at exactly the same point. Each machine has separate room/floor/serial/status/notes; nearby pins have a chooser.
5. Open Interior photos & 3D section. Cloud mode supports camera capture or existing JPG/PNG/WebP files, up to 12 reference photos at 8 MB each. Describe room/views and known measurements, save notes and download the reconstruction package. Device mode retains text/map records; photo uploads require cloud login.
6. The reconstruction ZIP contains original media, outlined building/independent machine records, a project brief, Amir’s workflow and license. A suitable Unreal Engine workstation/operator is still required to construct and review the interior. Upload the reviewed section image once produced. A reference photo is not presented as a finished 3D interior.
7. Finish, reopen the building, and verify outline, original pin, all machines and interior images. Backup/restore remaps photo keys to the restoring owner before saving building references.

Phone camera behavior, real Google 3D/GPU rendering and upstream footprint coverage still require field validation on the intended device.

## Try the bonus interior feature — October 20

- Open /interior-demo from “Try 3D interior demo” on the dashboard. Use Plan sheet, Raise walls, Enter room, or the progress slider. Choose a room and select a sample machine for its independent info sheet. The demo edits do not save to inventory.
- Upload one of your existing floor-plan/safety-map photos in that demo. It stays in the browser preview. Use Crop & scale plan photo to remove phone-screen borders, then zoom in to inspect the equipment area.
- In your real saved building, choose Open interior plan & 3D. Upload a floor-plan image, photograph the posted map, or choose Sketch walls. Draw with a finger/mouse; Undo removes the latest stroke. For a 3D room, choose Trace room for 3D and drag a rectangle around the relevant area, then name it and check dimensions in Edit rooms & dimensions.
- Select Place beside a saved machine, tap its indoor spot, then Save interior layout. Multiple machines may share an area; the list always opens each separate sheet. Plan-only pins can be saved before tracing any 3D rooms. Save, leave and reopen to verify the original aerial pin, plan, sketches, room layout and indoor equipment placements.
- Cloud storage is required for saved plan photographs. On-device mode supports sketches/layout text. A photo does not supply measured geometry; set the scale and check it before relying on dimensions. Use a close, square-on photo of the relevant map area where possible. Perspective skew from an oblique photograph is not automatically corrected.
