# STV Locate — integration contract

Standalone private app; no VendDoctorAi connection is currently configured.

October 7 update: saved buildings use `/api/locations` (owner-authorized GET/POST), a UUID, business type, address, map center and zoom. Assets optionally include `siteId`, `businessType` and `equipmentType`. ZIP backups include building views and restore new IDs with remapped asset links. The default map is now a lightweight Leaflet aerial renderer using the Esri source from the God's Eye mapping foundation; the original Cesium adapter is retained but inactive to reduce mobile memory pressure. See TEST_REPORT.md for verified scope and limitations.

## Portable records

`lib/asset.ts` is the validated v1 data contract. Each asset has a UUID, equipment tag, category, status, site, WGS84 coordinates, floor, room, model, serial, entrance, parking, notes, up to three photos, floor-plan image, normalized 0–100% floor-plan pin, optional HTTPS tour URL, and dated service notes. Backups contain `assets.json` (`schema: stv-locate/v1`) and media binaries. Imports create new IDs to preserve existing records.

## Existing authenticated endpoints

- GET /api/assets — signed-in owner's records
- POST /api/assets — create or update an owned record
- DELETE /api/assets?id=UUID — remove an owned record
- POST /api/files — multipart image upload to private storage
- GET /api/files?key=KEY — owner-authorized image read
- GET /api/geocode?q=ADDRESS — explicit submitted search; globally throttled

These endpoints require Sites identity. They are NOT public integration APIs. Do not expose them by changing the site to public or shipping a shared bearer secret in the browser.

## Future VendDoctorAi adapter

1. Confirm its backend, users, tenant ownership, API contracts and deployment.
2. Map VendDoctorAi tenant IDs and equipment IDs to these UUIDs in a dedicated integration table.
3. Add a server-only scoped service integration with tenant authorization, audit events, idempotency and conflict handling.
4. Keep coordinates, route notes and photos owned by the appropriate tenant. Do not use email as a permanent identity key.
5. Import a backup for initial migration; introduce incremental sync only after field ownership and deletion semantics are agreed.

## Source provenance

- God's Eye View, MIT, commit e685449a52550775a5279cef1b9090ef24d507a2. `lib/vendor/imagery.js` copied unchanged from `src/maps/imagery.js`; only mapping helpers used, not intelligence datasets or noncommercial assets.
- Unreal Home Wizard, Apache-2.0, commit f021ea665728b5b2ad6909665cf99e20ab78da04. Workflow copy and license in `public/licenses/`; reconstruction export follows strict fidelity, rights confirmation and manual review gates. Unreal itself is not run by this app.
- Cesium supplies the globe. Esri imagery and OpenStreetMap data retain provider terms and in-map credits. Public Nominatim is used only for explicit address submissions, never autocomplete or bulk geocoding.

## Verification and limitations

Cloud-backed D1 records and R2 media. Owner-private access. No live tracker hardware, shared technician roles, automatic 3D generation, or automatic VendDoctorAi synchronization. Uploaded files are retained when records are deleted. Production data is never included in Git. Browser QA unavailable in the managed environment for this build; compiler/build and schema checks are run separately.
