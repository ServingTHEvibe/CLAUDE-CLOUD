# October 7 repair

Story: Add inventory → locate a business → save building → tap aerial equipment spots → save and reopen records.

Implemented a direct building-map picker when address search has no result, without inventing coordinates or requiring users to obtain them elsewhere. It preserves the typed address and requires an explicit roof tap, business name and address confirmation before saving. Initial map position is disclosed as central Des Moines, not the submitted address.

Added robust client API response handling for plain-text unauthorized responses, redirects and gateway HTML. Editors retain unsaved changes after a failed request. Top-level sign-in recovery links are shown for expired/missing sessions. Mobile equipment selection scrolls the details panel into view.

Address service now bounds provider requests to ten seconds, validates coordinate results and catches database/throttle failures. It continues to throttle explicit submitted queries; no autocomplete or background retries are introduced.

Verification: 35 automated tests pass, including exact submitted address/no-match/manual-roof selection, error recovery, pin coordinates, move/update, saved map viewport, private API isolation, uploads, backups and real Leaflet lifecycle. These tests use mocked UI network/map inputs or an in-memory database and do not prove production user authentication or real aerial tile availability.

Live boundary: Recent Worker logs show GET /api/assets responding 401 with no oai-authenticated-user-id header. The expected Site identity remains required; no email fallback, identity spoofing, public sharing, or service-token user impersonation was added. Production saving cannot be called verified until an authenticated browser flow supplies the expected user identity and a save/reopen succeeds.

The submitted Des Moines address has not been confirmed as a successful geocoder result. Direct map selection is a user-confirmed fallback, not a claimed geocoding fix. No usage video was recorded.
