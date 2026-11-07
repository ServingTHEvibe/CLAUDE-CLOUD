"use client";
import { newId } from "../lib/id.mjs";

import { lazy, Suspense, useEffect, useState, useRef, useMemo } from "react";
import { MapPin, Plus, Search, X, Check, Building2, Loader2 } from "lucide-react";
import { searchAddress, useGoogleKey } from "../lib/google-maps";
import { readApiResponse } from "../lib/api-response";
import { capturePhoto as storePhoto } from "../lib/capture-photo";
import { photoSource } from "../lib/field-store";
import AssetMap from "./equipment-map";
import { buildingPin } from "../lib/building-pin";
import { containsPoint, validOutline, outlineSchema, type Point } from "../lib/building-outline";
import BuildingInterior from "./building-interior";
import EquipmentInfo from "./equipment-info";
import { newPinAt } from "../lib/pin-area";
import { newAsset, type Asset } from "../lib/asset";
import { equipmentByBusiness, equipmentCategory, type Location } from "../lib/location";
const InteriorStudio = lazy(() => import("./interior-studio"));
type View = { lat: number; lng: number; zoom: number; mapProvider?: "google" };
export type PlannerStorage = {
  loadLocations: () => Promise<Location[]>;
  saveLocation: (l: Location) => Promise<Location>;
  saveAsset: (a: Asset) => Promise<Asset>;
  deviceOnly?: boolean;
};
export default function InventoryPlanner({
  assets,
  onSaved,
  onClose,
  storage,
}: {
  assets: Asset[];
  onSaved: (a: Asset) => void;
  onClose: () => void;
  storage?: PlannerStorage;
}) {
  const [editingBuilding, setEditingBuilding] = useState<Location | null>(null);
  const [outline, setOutline] = useState<Location["outline"]>(),
    [corners, setCorners] = useState<Point[]>([]),
    [tracing, setTracing] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [outlineBusy, setOutlineBusy] = useState(false),
    [outlineHint, setOutlineHint] = useState("Click the building to select its outline.");
  const outlineVersion = useRef(0);
  const [studioOpen, setStudioOpen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const googleKey = useGoogleKey();
  const panel = useRef<HTMLElement>(null),
    searchVersion = useRef(0);
  const [city, setCity] = useState(""),
    [stateCode, setStateCode] = useState(""),
    [postal, setPostal] = useState("");
  const [choosing, setChoosing] = useState(false);
  const [candidateHint, setCandidateHint] = useState("");
  const [manualLat, setManualLat] = useState(""),
    [manualLng, setManualLng] = useState("");
  const [locations, setLocations] = useState<Location[]>([]),
    [location, setLocation] = useState<Location | null>(null),
    [stage, setStage] = useState<"building" | "map">("building"),
    [search, setSearch] = useState(""),
    [results, setResults] = useState<any[]>([]),
    [building, setBuilding] = useState({
      name: "",
      address: "",
      businessType: Object.keys(equipmentByBusiness)[0],
    }),
    [found, setFound] = useState<View | null>(null),
    [focus, setFocus] = useState<View | null>(null),
    [mapView, setMapView] = useState<View | null>(null),
    [pin, setPin] = useState<Asset | null>(null),
    [placing, setPlacing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia === "function" && window.matchMedia("(max-width: 640px)").matches) {
      const target = placing
        ? document.querySelector<HTMLElement>(".planner-map")
        : pin
          ? panel.current
          : null;
      target?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }
  }, [pin?.id, placing]);
  useEffect(() => {
    (storage
      ? storage.loadLocations()
      : fetch("/api/locations").then(async (r) => (await readApiResponse(r)).locations)
    )
      .then(setLocations)
      .catch((e) => setError(e.message || "Could not load saved buildings."))
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    if (!pin || showInfo) return;
    const before = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [Boolean(pin), showInfo]);
  useEffect(() => {
    if (found && stage === "building")
      document
        .querySelector<HTMLElement>(".simple-building-map")
        ?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [found, stage]);
  useEffect(
    () => () => {
      outlineVersion.current++;
      searchVersion.current++;
    },
    [],
  );
  const previewAsset = useMemo(
    () =>
      found
        ? {
            ...newAsset(),
            id: "building-preview",
            name: "Check this building position",
            lat: found.lat,
            lng: found.lng,
            mapProvider: found.mapProvider,
          }
        : null,
    [found],
  );
  const physicalAddress = [
    search.trim(),
    city.trim(),
    [stateCode.trim(), postal.trim()].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  function addressChanged() {
    setBusy(false);
    setEditingBuilding(null);
    outlineVersion.current++;
    setOutlineBusy(false);
    setOutline(undefined);
    setCorners([]);
    setTracing(false);
    setConfirmed(false);
    setOutlineHint("Click the building to select its outline.");
    setOutlineBusy(false);
    setChoosing(false);
    setBuilding((b) => ({ ...b, name: "", address: "" }));
    setCandidateHint("");
    searchVersion.current++;
    setFound(null);
    setFocus(null);
    setResults([]);
    setError("");
  }
  const siteAssets = useMemo(
    () =>
      location
        ? assets.filter(
            (a) =>
              a.siteId === location.id ||
              (!a.siteId && a.site === location.name && a.address === location.address),
          )
        : [],
    [assets, location],
  );
  const savedBuildingPin = useMemo(() => (location ? buildingPin(location) : null), [location]);
  const mapAssets = useMemo(
    () => [
      ...(savedBuildingPin ? [savedBuildingPin] : []),
      ...siteAssets.filter((a) => a.id !== pin?.id),
      ...(pin ? [pin] : []),
    ],
    [savedBuildingPin, siteAssets, pin],
  );
  const suggestions = equipmentByBusiness[location?.businessType || building.businessType] || [
    "Custom equipment",
  ];
  function useGPS() {
    const version = ++searchVersion.current;
    outlineVersion.current++;
    setOutline(undefined);
    setConfirmed(false);
    setTracing(false);
    setOutlineBusy(false);
    setCandidateHint("GPS position is approximate. Check and adjust the building pin.");
    if (!navigator.geolocation) {
      setError("GPS is unavailable. Enter a physical address above, or choose the building on the map.");
      return;
    }
    setBusy(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (version !== searchVersion.current) return;
        if (
          !Number.isFinite(p.coords.latitude) ||
          !Number.isFinite(p.coords.longitude) ||
          Math.abs(p.coords.latitude) > 85 ||
          Math.abs(p.coords.longitude) > 180
        ) {
          setError("GPS returned an invalid position. Choose an address or place the pin manually.");
          setBusy(false);
          return;
        }
        setCandidateHint(
          Number.isFinite(p.coords.accuracy)
            ? "GPS accuracy about " +
                Math.round(p.coords.accuracy) +
                " metres. Tap the building to adjust the pin."
            : "Check and adjust the GPS position before saving.",
        );
        setFound({ lat: p.coords.latitude, lng: p.coords.longitude, zoom: 230 });
        setFocus({ lat: p.coords.latitude, lng: p.coords.longitude, zoom: 230 });
        setChoosing(true);
        setBuilding((b) => ({ ...b, address: physicalAddress || b.address }));
        setMessage("GPS is approximate. Verify the roof and address before saving.");
        setBusy(false);
      },
      () => {
        if (version !== searchVersion.current) return;
        setError(
          "GPS permission denied or unavailable. Enter a physical address above, or choose the building on the map.",
        );
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }

  async function startAtPosition() {
    if (!found || busy) return;
    setBusy(true);
    setError("");
    try {
      const address =
        building.address.trim() ||
        physicalAddress ||
        "GPS " + found.lat.toFixed(6) + ", " + found.lng.toFixed(6);
      const saved = await persistLocation({
        ...building,
        ...found,
        id: newId(),
        name: building.name.trim() || "Field site " + new Date().toLocaleDateString(),
        address,
        updated: new Date().toISOString(),
      });
      openLocation(saved);
      setPin(newPinAt(saved, saved));
      setShowInfo(false);
      setMessage(
        "GPS site saved. Name this machine, take photos and save. Add another machine here for each separate record.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function capturePhoto(file: File, label: string) {
    if (!pin) return;
    setBusy(true);
    setError("");
    try {
      const key = await storePhoto(file, Boolean(storage?.deviceOnly));
      setPin((current) =>
        current
          ? {
              ...current,
              photos: [...current.photos.filter((photo) => photo.label !== label), { label, key }].slice(-3),
            }
          : current,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function openLocation(l: Location) {
    outlineVersion.current++;
    setOutlineBusy(false);
    searchVersion.current++;
    setLocation(l);
    setShowInfo(false);
    setFocus(l.mapView || { lat: l.lat, lng: l.lng, zoom: l.zoom });
    setMapView(null);
    setStage("map");
    setPin(null);
    setPlacing(false);
    setError("");
    setMessage(
      "Your original building pin is saved. Add equipment at this pin or tap Add equipment pin for another spot.",
    );
  }
  async function searchBuilding() {
    if (busy) return;
    outlineVersion.current++;
    setOutlineBusy(false);
    setOutline(undefined);
    setConfirmed(false);
    setTracing(false);
    setCorners([]);
    if (physicalAddress.length > 250) {
      setError("Keep the complete physical address under 250 characters.");
      return;
    }
    const version = ++searchVersion.current;
    setBusy(true);
    setError("");
    setFound(null);
    setFocus(null);
    setResults([]);
    try {
      const j = {
        results: await searchAddress(physicalAddress, search, postal, {
          street: search,
          city,
          state: stateCode,
          postalcode: postal,
        }),
      };
      if (version !== searchVersion.current) return;
      setResults(j.results);
      if (!j.results.length)
        setError(
          "This address is not in the search provider. Choose building on map below, or search a nearby street to orient yourself.",
        );
    } catch (e) {
      if (version === searchVersion.current) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function persistLocation(l: Location) {
    const j: any = storage
      ? { location: await storage.saveLocation(l) }
      : await readApiResponse(
          await fetch("/api/locations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(l),
          }),
        );
    setLocations((prev) => [j.location, ...prev.filter((x) => x.id !== l.id)]);
    return j.location as Location;
  }
  async function saveBuilding() {
    if (!found || !outline || !confirmed || tracing) return;
    setBusy(true);
    setError("");
    try {
      openLocation(
        await persistLocation({
          ...editingBuilding,
          ...building,
          ...found,
          outline,
          mapView: undefined,
          id: editingBuilding?.id || newId(),
          updated: new Date().toISOString(),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function selectBuilding(lat: number, lng: number) {
    if (busy || outlineBusy) return;
    setConfirmed(false);
    if (tracing) {
      setCorners((points) => (points.length < 200 ? [...points, { lat, lng }] : points));
      return;
    }
    const version = ++outlineVersion.current;
    setFound({ lat, lng, zoom: 230, ...(googleKey ? { mapProvider: "google" as const } : {}) });
    setOutline(undefined);
    setCorners([]);
    setOutlineBusy(true);
    setOutlineHint("Looking up the selected building outline…");
    setBuilding((b) => ({
      ...b,
      address: b.address || physicalAddress,
      name: b.name || physicalAddress.split(",")[0],
    }));
    setError("");
    try {
      const j = await readApiResponse(
        await fetch("/api/building-footprint?" + new URLSearchParams({ lat: String(lat), lng: String(lng) })),
      );
      if (version !== outlineVersion.current) return;
      const parsed = outlineSchema.safeParse(j.outline);
      if (parsed.success && containsPoint(parsed.data.points, { lat, lng })) {
        setOutline(parsed.data);
        setOutlineHint("Building outlined in green. Check the address and roof below.");
      } else {
        setOutlineHint(
          "No building outline is available here. Choose Trace roof corners to outline this building.",
        );
      }
    } catch {
      if (version === outlineVersion.current)
        setOutlineHint("Automatic outline unavailable. Choose Trace roof corners to outline this building.");
    } finally {
      if (version === outlineVersion.current) setOutlineBusy(false);
    }
  }
  function finishOutline() {
    if (!found || !validOutline(corners) || !containsPoint(corners, found)) {
      setError("Trace at least three corners around your selected building pin, without crossing edges.");
      return;
    }
    setOutline({ source: "manual", points: corners });
    setTracing(false);
    setConfirmed(false);
    setOutlineHint("Your building outline is green. Check the address and building before continuing.");
    setError("");
  }
  function place(lat: number, lng: number) {
    if (!location || busy) return;
    setPin((p) => (p ? { ...p, lat, lng } : newPinAt(location, { lat, lng })));
    setShowInfo(false);
    setPlacing(false);
    setMessage("Pin placed. Complete this equipment’s info sheet and save it.");
  }
  async function savePin() {
    if (!pin) return;
    setBusy(true);
    setError("");
    try {
      const j: any = storage
        ? { asset: await storage.saveAsset(pin) }
        : await readApiResponse(
            await fetch("/api/assets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(pin),
            }),
          );
      onSaved(j.asset);
      setPin(j.asset);
      setShowInfo(true);
      setPlacing(false);
      setMessage(
        storage?.deviceOnly
          ? "Saved on this device with photos. Add another machine here, or add a pin in a different area."
          : "Equipment saved. Tap a pin to open it, or select Add equipment.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function startAnotherArea() {
    if (pin && !showInfo && !confirm("Discard unsaved changes and add equipment?")) return;
    setPin(null);
    setShowInfo(false);
    setPlacing(true);
    setMessage("Tap the new equipment area on the map. Add a room or area name to its record.");
  }
  function addAnotherHere(a: Asset) {
    if (!location) return;
    if (pin && !showInfo && !confirm("Discard unsaved changes and add another pin here?")) return;
    setPin(newPinAt(location, a));
    setShowInfo(false);
    setPlacing(false);
    setError("");
    setMessage("New independent pin at the same location. Complete its own equipment details.");
  }
  function editSaved(a: Asset) {
    if (pin && !showInfo && !confirm("Discard unsaved pin changes?")) return;
    setPin(structuredClone(a));
    setShowInfo(true);
    setPlacing(false);
    setFocus({ lat: a.lat, lng: a.lng, zoom: 130 });
  }
  function close() {
    if (pin && !showInfo && !confirm("Discard the unsaved pin? Saved pins and buildings will remain."))
      return;
    onClose();
  }
  return (
    <section className="planner" aria-label="Map-first inventory workspace">
      <header className="planner-header">
        <div>
          <p className="eyebrow">MAP-FIRST INVENTORY</p>
          <h2>{stage === "building" ? "Find your location" : location?.name}</h2>
        </div>
        <span className="planner-steps">
          {storage?.deviceOnly ? "Device capture" : "Private equipment workspace"}
        </span>
        <button className="secondary" disabled={busy} onClick={close}>
          <X size={17} />
          Finish
        </button>
      </header>
      <ol className="workflow-steps" aria-label="Equipment capture steps">
        <li aria-current={stage === "building" ? "step" : undefined}>1 · Site</li>
        <li aria-current={stage === "map" && !showInfo ? "step" : undefined}>2 · Machine & photos</li>
        <li aria-current={showInfo ? "step" : undefined}>3 · Saved</li>
      </ol>
      {stage === "building" ? (
        <div className="simple-location-layout">
          <aside className="simple-location-panel">
            <h3>Where is the equipment?</h3>
            <button className="primary full" disabled={busy} onClick={useGPS}>
              Use my GPS location
            </button>
            <p className="muted">
              Use GPS or enter the site address. Save a separate record and photos for each machine.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void searchBuilding();
              }}
            >
              <label className="field">
                Physical address
                <input
                  aria-label="Business or building address"
                  autoComplete="street-address"
                  required
                  minLength={3}
                  maxLength={200}
                  placeholder="Street address, city, state, ZIP"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    addressChanged();
                  }}
                />
              </label>
              <details>
                <summary>Add city, state or ZIP separately</summary>
                <label className="field">
                  City (optional if included above)
                  <input
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value);
                      addressChanged();
                    }}
                  />
                </label>
                <div className="form-grid">
                  <label className="field">
                    State / region
                    <input
                      value={stateCode}
                      onChange={(e) => {
                        setStateCode(e.target.value);
                        addressChanged();
                      }}
                    />
                  </label>
                  <label className="field">
                    ZIP / postal code
                    <input
                      value={postal}
                      onChange={(e) => {
                        setPostal(e.target.value);
                        addressChanged();
                      }}
                    />
                  </label>
                </div>
              </details>
              <button className="primary full" disabled={busy}>
                {busy ? <Loader2 size={17} className="spin" /> : <Search size={17} />}Find address
              </button>
            </form>
            <div className="building-results">
              {results.map((r) => (
                <button
                  key={r.place_id}
                  onClick={() => {
                    setEditingBuilding(null);
                    outlineVersion.current++;
                    setOutline(undefined);
                    setCorners([]);
                    setTracing(false);
                    setConfirmed(false);
                    setOutlineHint("Click the building to select its outline.");
                    setCandidateHint(
                      r.location_hint === "building_address"
                        ? "Check that this is the correct building."
                        : "Approximate result: check the roof and move the pin if needed.",
                    );
                    setChoosing(true);
                    setFound({
                      lat: Number(r.lat),
                      lng: Number(r.lon),
                      zoom: 230,
                      ...(r.provider === "google" ? { mapProvider: "google" as const } : {}),
                    });
                    setFocus({
                      lat: Number(r.lat),
                      lng: Number(r.lon),
                      zoom: r.location_hint === "building_address" ? 230 : 3500,
                    });
                    setBuilding((b) => ({
                      ...b,
                      address: r.display_name.slice(0, 250),
                      name: b.name || r.name || r.display_name.split(",")[0],
                    }));
                    setResults([]);
                  }}
                >
                  <MapPin size={17} />
                  {r.display_name}
                </button>
              ))}
            </div>
            <small className="muted">
              {googleKey
                ? "Address results from Google Maps"
                : "Address results © OpenStreetMap contributors"}
            </small>
            {found && (
              <section className="gps-quick-start">
                <label className="field">
                  Site name
                  <input
                    maxLength={250}
                    value={building.name}
                    placeholder="Building or business name"
                    onChange={(event) => setBuilding({ ...building, name: event.target.value })}
                  />
                </label>
                <p>Each machine gets its own pin, room notes and photos.</p>
              </section>
            )}
            {found && (
              <form
                className="simple-building-confirm"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveBuilding();
                }}
              >
                <p className="outline-status" role="status">
                  {outlineHint}
                </p>
                <div className="outline-tools">
                  <button
                    type="button"
                    className="secondary"
                    disabled={outlineBusy || busy}
                    onClick={() => {
                      outlineVersion.current++;
                      setOutline(undefined);
                      setCorners([]);
                      setTracing(true);
                      setConfirmed(false);
                      setOutlineHint(
                        "Tap each roof corner in order, then Finish outline. Keep the selected pin inside.",
                      );
                    }}
                  >
                    Trace roof corners
                  </button>
                  {tracing && (
                    <>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setCorners((c) => c.slice(0, -1))}
                      >
                        Undo corner
                      </button>
                      <button
                        type="button"
                        className="primary"
                        disabled={corners.length < 3}
                        onClick={finishOutline}
                      >
                        Finish outline ({corners.length} corners)
                      </button>
                    </>
                  )}
                </div>
                <p className="address-match-warning">
                  {candidateHint || "Check the pin is on the correct roof. Tap the map to adjust it."}
                </p>
                <label className="field">
                  Business name *
                  <input
                    required
                    maxLength={250}
                    value={building.name}
                    onChange={(e) => setBuilding({ ...building, name: e.target.value })}
                  />
                </label>
                <details open>
                  <summary>Building details</summary>
                  <label className="field">
                    Address *
                    <input
                      required
                      maxLength={250}
                      value={building.address}
                      onChange={(e) => {
                        setConfirmed(false);
                        setBuilding({ ...building, address: e.target.value });
                      }}
                    />
                  </label>
                  <label className="field">
                    Business type
                    <select
                      value={building.businessType}
                      onChange={(e) => setBuilding({ ...building, businessType: e.target.value })}
                    >
                      {Object.keys(equipmentByBusiness).map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                </details>
                <p>
                  <strong>Confirm address:</strong> {building.address}
                </p>
                <label className="building-confirm-check">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={!outline || tracing || outlineBusy}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  This address and building are correct
                </label>
                <button
                  className="primary full"
                  disabled={busy || outlineBusy || !outline || !confirmed || tracing}
                >
                  <Check size={18} />
                  Use this building
                </button>
              </form>
            )}
            <details className="simple-location-options">
              <summary>Use GPS or choose manually</summary>
              <button className="secondary full" disabled={busy} onClick={useGPS}>
                Use my GPS near the building
              </button>
              <button
                className="secondary full"
                onClick={() => {
                  setChoosing(true);
                  setBuilding((b) => ({ ...b, address: physicalAddress || b.address }));
                }}
              >
                Choose building on map
              </button>
              <div className="form-grid">
                <label className="field">
                  Latitude
                  <input
                    type="number"
                    step="any"
                    value={manualLat}
                    onChange={(e) => setManualLat(e.target.value)}
                  />
                </label>
                <label className="field">
                  Longitude
                  <input
                    type="number"
                    step="any"
                    value={manualLng}
                    onChange={(e) => setManualLng(e.target.value)}
                  />
                </label>
              </div>
              <button
                className="secondary"
                onClick={() => {
                  const lat = Number(manualLat),
                    lng = Number(manualLng);
                  if (
                    !manualLat.trim() ||
                    !manualLng.trim() ||
                    !Number.isFinite(lat) ||
                    !Number.isFinite(lng) ||
                    Math.abs(lat) > 85 ||
                    Math.abs(lng) > 180
                  ) {
                    setError("Enter valid building coordinates.");
                    return;
                  }
                  outlineVersion.current++;
                  setOutline(undefined);
                  setConfirmed(false);
                  setTracing(false);
                  setOutlineBusy(false);
                  setFound({ lat, lng, zoom: 230 });
                  setFocus({ lat, lng, zoom: 230 });
                  setChoosing(true);
                  setBuilding((b) => ({ ...b, address: physicalAddress || b.address }));
                }}
              >
                Use these coordinates
              </button>
            </details>
            <h4 className="simple-saved-title">Or open a saved building</h4>
            {!loaded ? (
              <p>Loading buildings…</p>
            ) : !locations.length ? (
              <p className="muted small">Your saved buildings will appear here.</p>
            ) : (
              locations.map((l) => (
                <button key={l.id} className="saved-building" onClick={() => openLocation(l)}>
                  <Building2 size={19} />
                  <span>
                    <strong>{l.name}</strong>
                    <small>{l.address}</small>
                    <small>{assets.filter((a) => a.siteId === l.id).length} equipment pins</small>
                  </span>
                  <Chevron />
                </button>
              ))
            )}
            <a className="map-setup-link" href="/settings/maps">
              Google Maps settings
            </a>
          </aside>
          <div className="simple-building-map">
            {found || choosing ? (
              <>
                <AssetMap
                  assets={previewAsset ? [previewAsset] : []}
                  selected="building-preview"
                  pickLabel={tracing ? "TAP ROOF CORNERS" : "CLICK TO SELECT BUILDING"}
                  onSelect={() => {
                    if (found && !tracing) void selectBuilding(found.lat, found.lng);
                  }}
                  requiresGoogle={found?.mapProvider === "google"}
                  picking
                  topDown
                  buildingOutline={tracing ? corners : outline?.points}
                  onPick={(lat, lng) => {
                    void selectBuilding(lat, lng);
                  }}
                  focus={focus || found}
                />
                <div className="simple-building-tip">
                  {tracing ? (
                    <p>Tap roof corners in order, then Finish outline.</p>
                  ) : (
                    <>
                      <p>Check the location pin. Tap your building to adjust it.</p>
                      {found && (
                        <button
                          className="primary full"
                          disabled={busy}
                          onClick={() => void startAtPosition()}
                        >
                          Use this position & add first machine
                        </button>
                      )}
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="simple-map-start">
                <MapPin size={45} />
                <h3>Start with an address.</h3>
                <p>Search on the left or open a saved building. Your equipment map will appear here.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="planner-map-layout">
          <div className="planner-map">
            <AssetMap
              buildingOutline={location?.outline?.points}
              editablePinId={pin && !showInfo ? pin.id : undefined}
              excludeFromPicker={pin && !siteAssets.some((a) => a.id === pin.id) ? pin.id : undefined}
              requiresGoogle={location?.mapProvider === "google"}
              assets={mapAssets}
              selected={pin?.id || savedBuildingPin?.id || ""}
              onSelect={(id) => {
                if (busy) return;
                if (id === savedBuildingPin?.id) {
                  if (pin && !showInfo && !confirm("Discard unsaved equipment changes?")) return;
                  setPin(null);
                  setPlacing(false);
                  setFocus({ lat: location!.lat, lng: location!.lng, zoom: location!.zoom });
                  return;
                }
                const a = siteAssets.find((a) => a.id === id);
                if (a) editSaved(a);
              }}
              onPick={place}
              picking={placing}
              focus={focus}
              onViewChange={setMapView}
              topDown
            />
            <div className="planner-map-bar">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  if (pin && !showInfo && !confirm("Discard unsaved changes?")) return;
                  setEditingBuilding(null);
                  setStage("building");
                  setPin(null);
                  setPlacing(false);
                }}
              >
                Change building
              </button>
              <button className="primary" disabled={busy} onClick={startAnotherArea}>
                <Plus size={19} />
                Add equipment pin
              </button>
              {placing && (
                <button
                  className="secondary"
                  onClick={() => {
                    setPlacing(false);
                    setMessage("Placement cancelled. Select a saved machine or add equipment.");
                  }}
                >
                  Cancel placement
                </button>
              )}
              <details className="simple-map-options">
                <summary>Map options</summary>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (location) setFocus({ lat: location.lat, lng: location.lng, zoom: location.zoom });
                  }}
                >
                  Return to saved pin
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (!location) return;
                    if (pin && !showInfo && !confirm("Discard unsaved equipment changes?")) return;
                    setEditingBuilding(location);
                    setBuilding({
                      name: location.name,
                      address: location.address,
                      businessType: location.businessType,
                    });
                    setFound({
                      lat: location.lat,
                      lng: location.lng,
                      zoom: location.zoom,
                      mapProvider: location.mapProvider,
                    });
                    setFocus({ lat: location.lat, lng: location.lng, zoom: location.zoom });
                    setOutline(location.outline);
                    setCorners([]);
                    setTracing(false);
                    setConfirmed(false);
                    setPin(null);
                    setPlacing(false);
                    setStage("building");
                    setOutlineHint(
                      location.outline
                        ? "Review the saved outline, or trace new roof corners."
                        : "Click this building to select its outline.",
                    );
                  }}
                >
                  Edit building outline
                </button>
                <button
                  className="secondary"
                  disabled={busy || !mapView}
                  onClick={async () => {
                    if (!location || !mapView) return;
                    setBusy(true);
                    try {
                      const l = await persistLocation({ ...location, mapView });
                      setLocation(l);
                      setMessage("Map view saved.");
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Save map view
                </button>
              </details>
            </div>
            <div className={"placement-tip " + (placing ? "active-placement" : "")}>
              {placing ? (
                <>
                  <MapPin size={18} />
                  <b>
                    {pin
                      ? "Move this pin: tap its new position"
                      : "Tap the equipment position to drop a new pin"}
                  </b>
                </>
              ) : (
                message || "Tap a saved pin to open its info sheet."
              )}
            </div>
          </div>
          <aside className="pin-panel" ref={panel}>
            {location && (
              <BuildingInterior
                onBusy={setBusy}
                key={location.id}
                location={location}
                assets={siteAssets}
                deviceOnly={storage?.deviceOnly}
                save={async (l) => {
                  setLocation(await persistLocation(l));
                }}
              />
            )}
            {pin && showInfo ? (
              <>
                <div className="simple-saved-status">
                  <Check size={16} />
                  {storage?.deviceOnly ? "Saved on this device" : "Saved to your account"}
                </div>
                <EquipmentInfo asset={pin} />
                <div className="pin-sheet-actions">
                  <button className="primary" disabled={busy} onClick={() => setShowInfo(false)}>
                    Edit details
                  </button>
                  <button className="secondary" disabled={busy} onClick={() => addAnotherHere(pin)}>
                    <Plus size={16} />
                    Add another machine here
                  </button>
                  <button className="secondary" disabled={busy} onClick={startAnotherArea}>
                    Add in another area
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      setShowInfo(false);
                      setPlacing(true);
                      setMessage("Tap a new position for this pin.");
                    }}
                  >
                    Move pin
                  </button>
                  <button className="text-button" onClick={() => setPin(null)}>
                    Close info sheet
                  </button>
                </div>
              </>
            ) : pin ? (
              <form
                className="simple-pin-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void savePin();
                }}
              >
                <p className="eyebrow">
                  {siteAssets.some((a) => a.id === pin.id) ? "EDIT EQUIPMENT" : "NEW EQUIPMENT PIN"}
                </p>
                <h3>What equipment is here?</h3>
                <label className="field">
                  Equipment type
                  <select
                    aria-label="Equipment for this business"
                    value={suggestions.includes(pin.equipmentType || "") ? pin.equipmentType : ""}
                    onChange={(e) => {
                      const type = e.target.value;
                      setPin({
                        ...pin,
                        equipmentType: type,
                        name: pin.name || type,
                        category: equipmentCategory(type),
                      });
                    }}
                  >
                    <option value="">Choose a type or enter below</option>
                    {suggestions.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                {!suggestions.includes(pin.equipmentType || "") && (
                  <label className="field">
                    Specific equipment type *
                    <input
                      required
                      maxLength={250}
                      placeholder="e.g. Drink vending machine"
                      value={pin.equipmentType || ""}
                      onChange={(e) => setPin({ ...pin, equipmentType: e.target.value })}
                    />
                  </label>
                )}
                <label className="field">
                  Equipment name *
                  <input
                    aria-label="Name / label on map *"
                    required
                    maxLength={250}
                    placeholder="e.g. Breakroom drinks"
                    value={pin.name}
                    onChange={(e) => setPin({ ...pin, name: e.target.value })}
                  />
                </label>
                <label className="field">
                  Room / exact spot
                  <input
                    aria-label="Exact room / position"
                    maxLength={250}
                    placeholder="e.g. Breakroom, beside the door"
                    value={pin.room}
                    onChange={(e) => setPin({ ...pin, room: e.target.value })}
                  />
                </label>
                <fieldset className="machine-photo-capture">
                  <legend>Photograph this machine and its area</legend>
                  {["Equipment", "Entrance", "Route"].map((label) => (
                    <label className="secondary full" key={label}>
                      {pin.photos.some((photo) => photo.label === label) ? "Replace" : "Take"}{" "}
                      {label.toLowerCase()} photo
                      <input
                        aria-label={label + " camera photo"}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        capture="environment"
                        disabled={busy}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void capturePhoto(file, label);
                          event.target.value = "";
                        }}
                      />
                    </label>
                  ))}
                  {pin.photos.map((photo) => (
                    <img
                      className="field-equipment-photo"
                      key={photo.key}
                      src={photoSource(photo.key)}
                      alt={photo.label + " preview"}
                    />
                  ))}
                </fieldset>
                <p>
                  Capture the machine, entrance and route. Add a room or area name to distinguish equipment
                  inside the same building.
                </p>
                <label className="field">
                  Notes
                  <textarea
                    maxLength={5000}
                    value={pin.notes}
                    onChange={(e) => setPin({ ...pin, notes: e.target.value })}
                  />
                </label>
                <details className="simple-more-details">
                  <summary>More details · model, serial, floor & status</summary>
                  <div className="form-grid">
                    <label className="field">
                      Asset tag
                      <input
                        maxLength={250}
                        value={pin.tag}
                        onChange={(e) => setPin({ ...pin, tag: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      Floor
                      <input
                        maxLength={250}
                        value={pin.floor}
                        onChange={(e) => setPin({ ...pin, floor: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      Model
                      <input
                        maxLength={250}
                        value={pin.model}
                        onChange={(e) => setPin({ ...pin, model: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      Serial number
                      <input
                        maxLength={250}
                        value={pin.serial}
                        onChange={(e) => setPin({ ...pin, serial: e.target.value })}
                      />
                    </label>
                  </div>
                  <label className="field">
                    Status
                    <select
                      value={pin.status}
                      onChange={(e) => setPin({ ...pin, status: e.target.value as Asset["status"] })}
                    >
                      {["Operational", "Needs service", "Offline"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <small className="muted">
                    Saved pin: {pin.lat.toFixed(7)}, {pin.lng.toFixed(7)}
                  </small>
                </details>
                <p className="simple-pin-help">
                  {placing
                    ? "Tap the new position, or cancel placement."
                    : "Need to adjust it? Drag the selected pin in 2D, or choose Move pin."}
                </p>
                <div className="pin-buttons">
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy || placing}
                    onClick={() => setPlacing(true)}
                  >
                    Move pin
                  </button>
                  <button className="primary" disabled={busy || placing}>
                    {busy ? <Loader2 className="spin" size={17} /> : <Check size={17} />}Save equipment pin
                  </button>
                </div>
                <button
                  className="text-button"
                  disabled={busy}
                  type="button"
                  onClick={() => {
                    setPin(null);
                    setPlacing(false);
                  }}
                >
                  Cancel changes
                </button>
              </form>
            ) : (
              <>
                <section className="saved-building-pin-card" aria-label="Saved building pin">
                  <p className="eyebrow">YOUR ORIGINAL PIN · SAVED</p>
                  <h3>
                    <Building2 size={21} />
                    {location?.name}
                  </h3>
                  <p>{location?.address}</p>
                  <small>
                    {location?.lat.toFixed(7)}, {location?.lng.toFixed(7)}
                  </small>
                  <button
                    className="primary full"
                    disabled={busy}
                    onClick={() => {
                      if (location) {
                        setPin(newPinAt(location, location));
                        setShowInfo(false);
                        setPlacing(false);
                        setError("");
                        setMessage("Add equipment details at your original saved pin.");
                      }
                    }}
                  >
                    <Plus size={17} />
                    Add equipment at this pin
                  </button>
                </section>
                <h3>{siteAssets.length} equipment pins</h3>
                <p className="muted">
                  {placing
                    ? "Tap the map where the equipment is."
                    : "Select a machine below to open its info sheet. Use Add equipment pin for a new machine."}
                </p>
                <div className="site-pin-list">
                  {siteAssets.map((a) => (
                    <button key={a.id} onClick={() => editSaved(a)}>
                      <MapPin size={18} />
                      <span>
                        <strong>{a.name}</strong>
                        <small>
                          {a.tag || a.equipmentType || a.category} · {a.room || "Room not set"}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <section className="bonus-interior-launch">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  if (
                    pin &&
                    !showInfo &&
                    !confirm("Discard unsaved equipment edits before opening the interior?")
                  )
                    return;
                  setPin(null);
                  setStudioOpen(true);
                }}
              >
                Room plan & scans
              </button>
              <small>Optional room tools · floor plans, area photos and sketches.</small>
            </section>
          </aside>
        </div>
      )}
      {error && (
        <div className="planner-error" role="alert">
          {error}
          {/sign in/i.test(error) && (
            <a href="/signin-with-chatgpt?return_to=%2F" target="_top">
              Sign in again
            </a>
          )}
          <button onClick={() => setError("")} aria-label="Dismiss error">
            <X size={16} />
          </button>
        </div>
      )}
      {studioOpen && location && (
        <Suspense fallback={<div className="interior-modal">Loading interior studio…</div>}>
          <InteriorStudio
            location={location}
            assets={siteAssets}
            deviceOnly={storage?.deviceOnly}
            save={async (l) => {
              setLocation(await persistLocation(l));
            }}
            onClose={() => setStudioOpen(false)}
          />
        </Suspense>
      )}
    </section>
  );
}
function Chevron() {
  return <span aria-hidden="true">›</span>;
}
