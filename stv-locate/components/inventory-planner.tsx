"use client";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Camera,
  Check,
  ChevronRight,
  Crosshair,
  ImagePlus,
  Images,
  Layers3,
  Loader2,
  LocateFixed,
  MapPin,
  Move,
  Navigation,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { newId } from "../lib/id.mjs";
import { reverseAddress, searchAddress, useGoogleKey } from "../lib/google-maps";
import { readApiResponse } from "../lib/api-response";
import { preparePhoto, uploadPreparedPhoto } from "../lib/capture-photo";
import { photoSource } from "../lib/field-store";
import AssetMap from "./equipment-map";
import { buildingPin, isBuildingPin } from "../lib/building-pin";
import { containsPoint, outlineSchema, validOutline, type Point } from "../lib/building-outline";
import BuildingInterior from "./building-interior";
import { newPinAt } from "../lib/pin-area";
import { assetSchema, newAsset, type Asset } from "../lib/asset";
import { equipmentByBusiness, equipmentCategory, type AreaPhoto, type Location } from "../lib/location";
import { metresBetween, readGps } from "../lib/geolocate";
import {
  clearPlannerSession,
  draftHasWork,
  readPlannerSession,
  writePlannerSession,
  type BuildingCandidate,
  type GpsFix,
  type PendingPhoto,
  type PlannerSession,
} from "../lib/planner-session";
import { dropPendingPhoto, keepPendingPhoto, readPendingPhoto } from "../lib/pending-photos";
import { importRoomPlan } from "../lib/roomplan";
const InteriorStudio = lazy(() => import("./interior-studio"));

type View = { lat: number; lng: number; zoom: number };
type AddressResult = {
  place_id?: string | number;
  display_name: string;
  name?: string;
  lat: string | number;
  lon: string | number;
  location_hint?: string;
  provider?: string;
};
export type PlannerStorage = {
  loadLocations: () => Promise<Location[]>;
  saveLocation: (l: Location) => Promise<Location>;
  saveAsset: (a: Asset) => Promise<Asset>;
  deviceOnly?: boolean;
};
export type PlannerSummary = { saved: number; building?: string };
type Stage = PlannerSession["stage"];
type Panel = "overview" | "indoor" | "options";
const SIGN_IN = "/signin-with-chatgpt?return_to=%2F%3Fresume%3D1";
const MAX_MACHINE_PHOTOS = 3;
const MAX_AREA_PHOTOS = 24;
const BUSINESS_TYPES = Object.keys(equipmentByBusiness);
const DEFAULT_VIEW: View = { lat: 41.5868, lng: -93.625, zoom: 4000 };

export default function InventoryPlanner({
  assets,
  onSaved,
  onClose,
  storage,
  owner: ownerProp,
}: {
  assets: Asset[];
  onSaved: (a: Asset) => void;
  onClose: (summary?: PlannerSummary) => void;
  storage?: PlannerStorage;
  /** Who this draft belongs to; drafts are only restored for the same owner. */
  owner?: string;
}) {
  const deviceOnly = Boolean(storage?.deviceOnly);
  const owner = ownerProp ?? (deviceOnly ? "device" : "cloud:");
  const restored = useRef<PlannerSession | null | undefined>(undefined);
  if (restored.current === undefined) restored.current = readPlannerSession(owner);
  const r = restored.current;
  const googleKey = useGoogleKey();

  const [locations, setLocations] = useState<Location[]>([]),
    [loaded, setLoaded] = useState(false);
  const [stage, setStage] = useState<Stage>(r?.stage === "site" ? "find" : r?.stage || "find");
  const [candidate, setCandidate] = useState<BuildingCandidate | undefined>(r?.candidate);
  const [location, setLocationState] = useState<Location | null>(null);
  const locationRef = useRef<Location | null>(null);
  const setLocation = (l: Location | null) => {
    locationRef.current = l;
    setLocationState(l);
  };
  const [draft, setDraft] = useState<Asset | undefined>(r?.draft);
  const [draftKind, setDraftKind] = useState<"new" | "edit" | undefined>(r?.draftKind);
  const [pending, setPending] = useState<PendingPhoto[]>(
    (r?.pending || []).map((p) =>
      p.status === "uploading" ? { ...p, status: "failed", error: "Upload was interrupted. Tap Retry." } : p,
    ),
  );
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [gps, setGps] = useState<GpsFix | undefined>(r?.gps);
  const [savedCount, setSavedCount] = useState(r?.savedCount || 0);
  const [areaLabel, setAreaLabel] = useState(r?.areaLabel || "");
  const [restoredNotice, setRestoredNotice] = useState(
    Boolean(r && (r.draft || r.candidate || r.locationId)),
  );
  const [focus, setFocus] = useState<View | null>(
    r?.candidate ? { lat: r.candidate.lat, lng: r.candidate.lng, zoom: r.candidate.zoom } : null,
  );
  const [mapView, setMapView] = useState<View | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [placing, setPlacing] = useState(false);
  const [moving, setMoving] = useState(false);
  const moveFrom = useRef<{ lat: number; lng: number } | null>(null);
  const [panel, setPanel] = useState<Panel>("overview");
  const [studioOpen, setStudioOpen] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false),
    [gpsError, setGpsError] = useState("");
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<AddressResult[]>([]),
    [searching, setSearching] = useState(false),
    [searched, setSearched] = useState(false);
  const [tracing, setTracing] = useState(false),
    [corners, setCorners] = useState<Point[]>([]),
    [outlineBusy, setOutlineBusy] = useState(false),
    [outlineHint, setOutlineHint] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [spotNote, setSpotNote] = useState("");
  const [buildingFilter, setBuildingFilter] = useState("");
  const [localSaved, setLocalSaved] = useState<Record<string, Asset>>({});
  const saving = useRef(false);
  const outlineVersion = useRef(0),
    lookupVersion = useRef(0);
  const sheet = useRef<HTMLDivElement>(null);

  // ---- Load saved buildings and resume a restored site session --------------------------------
  useEffect(() => {
    let live = true;
    (storage
      ? storage.loadLocations()
      : fetch("/api/locations", { cache: "no-store" }).then(
          async (res) => (await readApiResponse(res)).locations,
        )
    )
      .then((value: Location[] | undefined) => {
        if (!live) return;
        const list = Array.isArray(value) ? value : [];
        setLocations(list);
        const resume = restored.current;
        if (resume?.stage === "site" && resume.locationId) {
          const found = list.find((l) => l.id === resume.locationId);
          if (found) {
            setLocation(found);
            setStage("site");
            setFocus(focusFor(found, resume.draft));
            if (resume.draft && resume.draftKind === "edit") setSelectedId(resume.draft.id);
          } else if (resume.candidate) setStage("confirm");
        }
      })
      .catch((e) => live && setError(e.message || "Could not load saved buildings."))
      .finally(() => live && setLoaded(true));
    const outlines = outlineVersion,
      lookups = lookupVersion;
    return () => {
      live = false;
      outlines.current++;
      lookups.current++;
    };
    // Load once per planner session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Recreate previews for photos that were waiting when the page reloaded.
  useEffect(() => {
    let live = true;
    for (const p of pending)
      if (!previews[p.id])
        void readPendingPhoto(p.id).then((blob) => {
          if (live && blob) setPreviews((v) => ({ ...v, [p.id]: previewUrl(blob) }));
        });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Persist the session on every change ---------------------------------------------------
  const [storageWarning, setStorageWarning] = useState(false);
  useEffect(() => {
    if (!loaded && restored.current?.stage === "site") return; // wait until the site is resolved
    const ok = writePlannerSession({
      owner,
      stage,
      candidate,
      locationId: location?.id,
      draft,
      draftKind,
      pending,
      gps,
      savedCount,
      areaLabel: areaLabel || undefined,
    });
    setStorageWarning(!ok);
  }, [owner, stage, candidate, location?.id, draft, draftKind, pending, gps, savedCount, areaLabel, loaded]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    sheet.current?.scrollTo?.({ top: 0 });
  }, [stage, panel, selectedId, draft?.id]);

  // ---- Derived data --------------------------------------------------------------------------
  const siteAssets = useMemo(() => {
    if (!location) return [];
    const merged = new Map<string, Asset>();
    for (const a of assets)
      if (
        a.siteId === location.id ||
        (!a.siteId && a.site === location.name && a.address === location.address)
      )
        merged.set(a.id, a);
    for (const a of Object.values(localSaved)) if (a.siteId === location.id) merged.set(a.id, a);
    return [...merged.values()].sort((a, b) => (a.updated < b.updated ? 1 : -1));
  }, [assets, localSaved, location]);
  const selected = siteAssets.find((a) => a.id === selectedId) || null;
  const savedBuildingPin = useMemo(() => (location ? buildingPin(location) : null), [location]);
  const machinePending = pending.filter((p) => p.target === "asset");
  const areaPending = pending.filter((p) => p.target === "area");
  const uploading = pending.some((p) => p.status === "uploading");
  const draftDirty = draftKind === "new" ? draftHasWork(draft, machinePending) : Boolean(draft);
  const businessType = location?.businessType || candidate?.businessType || BUSINESS_TYPES[0];
  const suggestions = equipmentByBusiness[businessType] || equipmentByBusiness["Other business"];
  const userPosition = useMemo(
    () => (gps ? { lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy } : null),
    [gps],
  );
  const nearbySaved = useMemo(() => {
    const point = candidate || gps;
    if (!point) return [];
    return locations
      .filter(
        (l) =>
          l.id !== candidate?.id &&
          ((l.outline && containsPoint(l.outline.points, point)) ||
            metresBetween(l, point) < Math.max(60, (gps?.accuracy || 0) + 30)),
      )
      .slice(0, 3);
  }, [locations, candidate, gps]);

  // ---- Persistence helpers -------------------------------------------------------------------
  async function persistLocation(next: Location) {
    const saved: Location = storage
      ? await storage.saveLocation(next)
      : (
          await readApiResponse(
            await fetch("/api/locations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(next),
            }),
          )
        ).location;
    setLocations((prev) => [saved, ...prev.filter((x) => x.id !== saved.id)]);
    if (!locationRef.current || locationRef.current.id === saved.id) setLocation(saved);
    return saved;
  }
  async function persistAsset(next: Asset) {
    const saved: Asset = storage
      ? await storage.saveAsset(next)
      : (
          await readApiResponse(
            await fetch("/api/assets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(next),
            }),
          )
        ).asset;
    setLocalSaved((v) => ({ ...v, [saved.id]: saved }));
    onSaved(saved);
    return saved;
  }

  // ---- Step 1: find the building -------------------------------------------------------------
  async function locateWithGps() {
    if (gpsBusy) return;
    setGpsBusy(true);
    setGpsError("");
    setError("");
    const fix = await readGps();
    setGpsBusy(false);
    if (!fix.ok) {
      setGpsError(fix.message);
      return;
    }
    const at = { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, at: new Date().toISOString() };
    setGps(at);
    if (stage === "site") {
      setFocus({ lat: fix.lat, lng: fix.lng, zoom: 120 });
      return;
    }
    startCandidate(
      {
        lat: fix.lat,
        lng: fix.lng,
        source: "gps",
        approximate: true,
        hint: `Your GPS position (±${Math.round(fix.accuracy)} m). Tap the correct roof if the pin is off.`,
      },
      fix.accuracy > 80 ? 700 : 160,
    );
  }
  function startCandidate(
    c: Pick<BuildingCandidate, "lat" | "lng" | "source" | "approximate" | "hint"> &
      Partial<Pick<BuildingCandidate, "name" | "address" | "mapProvider">>,
    zoom = 260,
  ) {
    const next: BuildingCandidate = {
      id: newId(),
      name: c.name || "",
      address: c.address || "",
      businessType: candidate?.businessType || BUSINESS_TYPES[0],
      zoom: 230,
      ...c,
    };
    setCandidate(next);
    setFocus({ lat: c.lat, lng: c.lng, zoom });
    setStage("confirm");
    setTracing(false);
    setCorners([]);
    setResults([]);
    void lookupOutline(next.lat, next.lng);
    if (!next.address) void fillAddress(next.id, next.lat, next.lng);
  }
  async function fillAddress(id: string, lat: number, lng: number) {
    const version = ++lookupVersion.current;
    const found = await reverseAddress(lat, lng);
    if (!found || version !== lookupVersion.current) return;
    setCandidate((c) =>
      c && c.id === id && !c.address
        ? {
            ...c,
            address: found.address,
            name: c.name || found.name,
            hint:
              (c.hint ? c.hint + " " : "") +
              (found.exact
                ? "Nearest street address filled in."
                : "Nearest address is approximate — check it."),
          }
        : c,
    );
  }
  async function findAddress() {
    const q = query.trim();
    if (q.length < 3 || searching) return;
    setSearching(true);
    setSearched(false);
    setError("");
    setResults([]);
    try {
      setResults(await searchAddress(q, q.split(",")[0]));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
      setSearched(true);
    }
  }
  function chooseResult(res: AddressResult) {
    const exact = res.location_hint === "building_address";
    startCandidate(
      {
        lat: Number(res.lat),
        lng: Number(res.lon),
        source: "address",
        approximate: !exact,
        address: String(res.display_name).slice(0, 250),
        name: res.name || "",
        hint: exact
          ? "Address found. Check the pin is on the right roof."
          : "Approximate result — the pin may be on the street or a neighbor. Tap the actual roof.",
        ...(res.provider === "google" ? { mapProvider: "google" as const } : {}),
      },
      exact ? 150 : 700,
    );
  }
  function pickOnMap() {
    setCandidate(undefined);
    setStage("confirm");
    setFocus(
      gps ? { lat: gps.lat, lng: gps.lng, zoom: 400 } : locations[0] ? focusFor(locations[0]) : DEFAULT_VIEW,
    );
    setOutlineHint("");
  }
  function openBuilding(l: Location) {
    setLocation(l);
    setStage("site");
    setPanel("overview");
    setCandidate(undefined);
    setDraft(undefined);
    setDraftKind(undefined);
    setSelectedId("");
    setPlacing(false);
    setMoving(false);
    setFocus(focusFor(l));
    setError("");
  }

  // ---- Step 2: confirm the building ----------------------------------------------------------
  async function lookupOutline(lat: number, lng: number) {
    const version = ++outlineVersion.current;
    setOutlineBusy(true);
    setOutlineHint("Looking up the roof outline…");
    try {
      const j = await readApiResponse(
        await fetch("/api/building-footprint?" + new URLSearchParams({ lat: String(lat), lng: String(lng) })),
      );
      if (version !== outlineVersion.current) return;
      const parsed = outlineSchema.safeParse(j.outline);
      if (parsed.success && containsPoint(parsed.data.points, { lat, lng })) {
        setCandidate((c) => (c ? { ...c, outline: parsed.data } : c));
        setOutlineHint("Roof outlined in green. If it's wrong, tap another roof or trace it.");
      } else {
        setCandidate((c) => (c ? { ...c, outline: undefined } : c));
        setOutlineHint("No outline on file for this roof. You can trace it, or continue without one.");
      }
    } catch {
      if (version !== outlineVersion.current) return;
      setCandidate((c) => (c ? { ...c, outline: undefined } : c));
      setOutlineHint(
        "Automatic outline unavailable. You can trace the roof corners, or continue without one.",
      );
    } finally {
      if (version === outlineVersion.current) setOutlineBusy(false);
    }
  }
  function tapRoof(lat: number, lng: number) {
    if (tracing) {
      setCorners((pts) => (pts.length < 200 ? [...pts, { lat, lng }] : pts));
      return;
    }
    if (!candidate) {
      startCandidate(
        { lat, lng, source: "map", approximate: false, hint: "You picked this roof on the map." },
        230,
      );
      return;
    }
    const keepAddress = candidate.address.trim();
    setCandidate({
      ...candidate,
      lat,
      lng,
      outline: undefined,
      hint: "Pin moved to the roof you tapped." + (keepAddress ? " Check the address still matches." : ""),
      ...(googleKey ? { mapProvider: "google" as const } : {}),
    });
    void lookupOutline(lat, lng);
    if (!keepAddress) void fillAddress(candidate.id, lat, lng);
  }
  function finishTrace() {
    if (!candidate) return;
    if (!validOutline(corners) || !containsPoint(corners, candidate)) {
      setError("Tap at least three roof corners around the pin, in order, without crossing lines.");
      return;
    }
    setCandidate({ ...candidate, outline: { source: "manual", points: corners } });
    setTracing(false);
    setCorners([]);
    setOutlineHint("Your traced outline is saved with this building.");
    setError("");
  }
  async function confirmBuilding() {
    if (!candidate || busy || saving.current) return;
    if (!candidate.name.trim() || !candidate.address.trim()) {
      setError("Add the business name and address so you can find this building later.");
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const base = candidate.source === "edit" ? locations.find((l) => l.id === candidate.id) : undefined;
      const saved = await persistLocation({
        ...(base || {}),
        id: candidate.id,
        name: candidate.name.trim(),
        address: candidate.address.trim(),
        businessType: candidate.businessType || BUSINESS_TYPES[0],
        lat: candidate.lat,
        lng: candidate.lng,
        zoom: candidate.zoom,
        outline: candidate.outline,
        mapProvider: candidate.mapProvider,
        updated: new Date().toISOString(),
      } as Location);
      setLocation(saved);
      setCandidate(undefined);
      setStage("site");
      setPanel("overview");
      setFocus(focusFor(saved));
      if (base) setToast("Building updated. Machine pins were not moved.");
      else {
        setPlacing(true);
        setToast("Building saved. Now tap the map where the first machine is.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  function editBuilding() {
    if (!location || !guardDraft()) return;
    setCandidate({
      id: location.id,
      name: location.name,
      address: location.address,
      businessType: location.businessType,
      lat: location.lat,
      lng: location.lng,
      zoom: location.zoom,
      outline: location.outline,
      mapProvider: location.mapProvider,
      source: "edit",
      approximate: false,
      hint: "Tap the roof to move the building pin, or trace a new outline. Machine pins stay where they are.",
    });
    setOutlineHint(location.outline ? "Saved outline shown in green." : "No outline saved yet.");
    setFocus(focusFor(location));
    setStage("confirm");
  }

  // ---- Step 3: machines ----------------------------------------------------------------------
  function guardDraft() {
    if (!draftDirty) return true;
    if (!confirm("Discard the unsaved machine? Saved machines are not affected.")) return false;
    discardDraft();
    return true;
  }
  function discardDraft() {
    for (const p of machinePending) void dropPendingPhoto(p.id);
    setPending((v) => v.filter((p) => p.target !== "asset"));
    setDraft(undefined);
    setDraftKind(undefined);
    setMoving(false);
    setSpotNote("");
  }
  function startPlacing() {
    if (!location || !guardDraft()) return;
    setSelectedId("");
    setPanel("overview");
    setPlacing(true);
    setError("");
  }
  function newDraftAt(point: { lat: number; lng: number }, note: string, template?: Partial<Asset>) {
    if (!location) return;
    const d = newPinAt(location, {
      lat: point.lat,
      lng: point.lng,
      floor: template?.floor || "1",
      room: template?.room || "",
    });
    d.entrance = template?.entrance || "";
    setDraft(d);
    setDraftKind("new");
    setPlacing(false);
    setMoving(false);
    setSelectedId("");
    setPanel("overview");
    setSpotNote(note);
  }
  function mapTap(lat: number, lng: number) {
    if (stage === "find") {
      startCandidate(
        { lat, lng, source: "map", approximate: false, hint: "You picked this roof on the map." },
        230,
      );
      return;
    }
    if (stage === "confirm") return tapRoof(lat, lng);
    if (placing)
      return newDraftAt({ lat, lng }, "Pin dropped where you tapped. Tap the map again to adjust.");
    if (draft && (draftKind === "new" || moving)) {
      setDraft({ ...draft, lat, lng });
      setSpotNote(moving ? "New position set. Save to keep it." : "Pin moved. Tap again to adjust.");
    }
  }
  function markerTap(id: string) {
    if (stage !== "site") {
      if (id === "building-preview" && candidate) tapRoof(candidate.lat, candidate.lng);
      return;
    }
    if (isBuildingPin({ id })) {
      if (placing) newDraftAt(location!, "Placed on the building pin.");
      return;
    }
    const target = siteAssets.find((a) => a.id === id);
    if (!target) return;
    // While placing, tapping an existing machine means "same exact spot".
    if (placing) return newDraftAt(target, `Same spot as “${target.name}”.`, target);
    if (draft && draftKind === "new" && draft.id !== id) {
      setDraft({ ...draft, lat: target.lat, lng: target.lng });
      setSpotNote(`Same spot as “${target.name}”.`);
      return;
    }
    if (draft && draftKind === "edit") {
      if (draft.id === id) return;
      setToast("Save or cancel your changes to this machine first.");
      return;
    }
    if (draftDirty) {
      setToast("Save or cancel the new machine first.");
      return;
    }
    discardDraft();
    setSelectedId(id);
    setPanel("overview");
  }
  function chooseType(type: string) {
    if (!draft) return;
    const sameType = siteAssets.filter((a) => a.equipmentType === type && a.id !== draft.id).length;
    const previous = draft.equipmentType || "";
    const name = draft.name.trim();
    const autoName =
      !name ||
      name === previous ||
      (previous !== "" &&
        /^\d+$/.test(name.slice(previous.length).trim()) &&
        name.startsWith(previous + " "));
    setDraft({
      ...draft,
      equipmentType: type,
      category: equipmentCategory(type),
      name: autoName ? type + (sameType ? " " + (sameType + 1) : "") : draft.name,
    });
  }
  async function saveDraft(next: "another" | "done") {
    if (!draft || !location || saving.current) return;
    if (uploading) {
      setError("Wait for the photo upload to finish, then save.");
      return;
    }
    const failed = machinePending.filter((p) => p.status === "failed");
    if (
      failed.length &&
      !confirm(
        `${failed.length} photo did not upload. Save this machine without it? (Tap Cancel to retry the photo first.)`,
      )
    )
      return;
    const name = draft.name.trim() || draft.equipmentType?.trim() || "";
    if (!name) {
      setError("Pick an equipment type or type a name for this machine.");
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const candidateAsset = assetSchema.parse({
        ...draft,
        name,
        site: location.name,
        address: location.address,
        siteId: location.id,
        businessType: location.businessType,
        mapProvider: location.mapProvider,
      });
      const saved = await persistAsset(candidateAsset);
      for (const p of failed) void dropPendingPhoto(p.id);
      setPending((v) => v.filter((p) => p.target !== "asset"));
      const wasNew = draftKind === "new";
      if (wasNew) setSavedCount((n) => n + 1);
      setMoving(false);
      if (next === "another") {
        newDraftAt(
          saved,
          `Same spot as “${saved.name}”. Tap the map to place this one somewhere else.`,
          saved,
        );
        setToast(`✓ Saved “${saved.name}”. Add the next machine.`);
      } else {
        setDraft(undefined);
        setDraftKind(undefined);
        setSelectedId(saved.id);
        setToast(wasNew ? `✓ Saved “${saved.name}”.` : `✓ Changes to “${saved.name}” saved.`);
      }
    } catch (e) {
      setError((e as Error).message + " Your machine details are still here — tap Save again to retry.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  function editMachine(a: Asset, move = false) {
    moveFrom.current = { lat: a.lat, lng: a.lng };
    setDraft(structuredClone(a));
    setDraftKind("edit");
    setMoving(move);
    setSelectedId(a.id);
    setSpotNote(move ? "Tap the map at the machine's new position. Other machines will not move." : "");
    if (move) setFocus({ lat: a.lat, lng: a.lng, zoom: 90 });
  }
  function cancelDraft() {
    if (
      draftKind === "new" &&
      draftHasWork(draft, machinePending) &&
      !confirm("Discard this unsaved machine?")
    )
      return;
    const editing = draftKind === "edit" ? draft?.id : "";
    discardDraft();
    setSelectedId(editing || "");
  }

  // ---- Photos --------------------------------------------------------------------------------
  async function addPhoto(file: File | undefined, target: "asset" | "area") {
    if (!file) return;
    if (target === "asset") {
      if (!draft) return;
      if (draft.photos.length + machinePending.length >= MAX_MACHINE_PHOTOS) {
        setError(`Each machine keeps up to ${MAX_MACHINE_PHOTOS} photos. Remove one to add another.`);
        return;
      }
    } else if ((locationRef.current?.interior?.photos.length || 0) + areaPending.length >= MAX_AREA_PHOTOS) {
      setError(`This building already has ${MAX_AREA_PHOTOS} area photos. Remove one first.`);
      return;
    }
    setError("");
    let blob: Blob;
    try {
      blob = await preparePhoto(file, deviceOnly);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    const id = newId();
    const label =
      target === "asset"
        ? nextPhotoLabel(draft!.photos.map((p) => p.label).concat(machinePending.map((p) => p.label)))
        : (areaLabel.trim() || draft?.room.trim() || selected?.room.trim() || "Area photo").slice(0, 250);
    await keepPendingPhoto(id, blob);
    setPreviews((v) => ({ ...v, [id]: previewUrl(blob) }));
    setPending((v) => [...v, { id, label, status: "uploading", target }]);
    await sendPhoto(id, label, target, blob, draft?.id);
  }
  async function retryPhoto(p: PendingPhoto) {
    const blob = await readPendingPhoto(p.id);
    if (!blob) {
      setPending((v) =>
        v.map((x) =>
          x.id === p.id
            ? { ...x, error: "The photo is no longer on this phone. Remove it and take it again." }
            : x,
        ),
      );
      return;
    }
    setPending((v) => v.map((x) => (x.id === p.id ? { ...x, status: "uploading", error: undefined } : x)));
    await sendPhoto(p.id, p.label, p.target, blob, draft?.id);
  }
  async function sendPhoto(
    id: string,
    label: string,
    target: "asset" | "area",
    blob: Blob,
    draftId?: string,
  ) {
    try {
      const key = await uploadPreparedPhoto(blob, deviceOnly);
      if (target === "asset") {
        setDraft((d) =>
          d && d.id === draftId
            ? { ...d, photos: [...d.photos, { label, key }].slice(0, MAX_MACHINE_PHOTOS) }
            : d,
        );
      } else {
        const l = locationRef.current;
        if (!l) throw Error("Open the building again, then retry this photo.");
        const near = machinesInArea(siteAssetsRef.current, label, draftId ? undefined : selectedRef.current);
        const photo: AreaPhoto = {
          key,
          label,
          room: label,
          assetIds: near.map((a) => a.id).slice(0, 50),
          taken: new Date().toISOString(),
        };
        const interior = l.interior || { notes: "", photos: [] };
        await persistLocation({
          ...l,
          interior: { ...interior, photos: [...interior.photos, photo].slice(-MAX_AREA_PHOTOS) },
        });
        setToast("✓ Area photo saved to this building.");
      }
      setPending((v) => v.filter((x) => x.id !== id));
      void dropPendingPhoto(id);
    } catch (e) {
      setPending((v) =>
        v.map((x) => (x.id === id ? { ...x, status: "failed", error: (e as Error).message } : x)),
      );
    }
  }
  function removePending(p: PendingPhoto) {
    void dropPendingPhoto(p.id);
    setPending((v) => v.filter((x) => x.id !== p.id));
  }
  async function removeAreaPhoto(photo: AreaPhoto) {
    const l = locationRef.current;
    if (!l?.interior || !confirm("Remove this area photo from the building?")) return;
    setBusy(true);
    try {
      await persistLocation({
        ...l,
        interior: { ...l.interior, photos: l.interior.photos.filter((p) => p.key !== photo.key) },
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const siteAssetsRef = useRef(siteAssets);
  siteAssetsRef.current = siteAssets;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  // ---- Map view & finish ---------------------------------------------------------------------
  async function saveMapView() {
    const l = locationRef.current;
    if (!l || !mapView) return;
    setBusy(true);
    try {
      await persistLocation({ ...l, mapView });
      setToast("Map view saved. The building pin and machine pins did not move.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function finish() {
    if (draftDirty && !confirm("You have an unsaved machine. Leave without saving it?")) return;
    if (uploading && !confirm("A photo is still uploading. Leave anyway?")) return;
    for (const p of pending) void dropPendingPhoto(p.id);
    clearPlannerSession(owner);
    onClose({ saved: savedCount, building: location?.name });
  }
  function back() {
    if (stage === "confirm") {
      if (candidate?.source === "edit" && location) {
        setCandidate(undefined);
        setStage("site");
        return;
      }
      setCandidate(undefined);
      setTracing(false);
      setStage("find");
      return;
    }
    if (stage === "site") {
      if (panel !== "overview") return setPanel("overview");
      if (draft) return cancelDraft();
      if (selectedId) return setSelectedId("");
      if (placing) return setPlacing(false);
      if (!guardDraft()) return;
      setLocation(null);
      setStage("find");
      return;
    }
    finish();
  }
  async function importScan(file: File | undefined) {
    const l = locationRef.current;
    if (!file || !l) return;
    if (
      l.layout &&
      !confirm(
        "Replace the current indoor layout with this measured scan? Machine pins on the old layout will be removed.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const layout = await importRoomPlan(file);
      await persistLocation({ ...l, layout });
      setToast("Measured scan imported. Open the indoor plan to place your machines.");
      setStudioOpen(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ---- Map props per stage -------------------------------------------------------------------
  const previewPin = useMemo<Asset | null>(
    () =>
      candidate
        ? {
            ...newAsset(),
            id: "building-preview",
            name: candidate.name || "Selected building",
            tag: "Building",
            lat: candidate.lat,
            lng: candidate.lng,
            mapProvider: candidate.mapProvider,
          }
        : null,
    [candidate],
  );
  const draftOnMap = draft && (draftKind === "new" || moving);
  const mapAssets = useMemo(() => {
    if (stage !== "site") return previewPin ? [previewPin] : [];
    const list = [
      ...(savedBuildingPin ? [savedBuildingPin] : []),
      ...siteAssets.filter((a) => a.id !== draft?.id),
    ];
    if (draft) list.push(draft);
    return list;
  }, [stage, previewPin, savedBuildingPin, siteAssets, draft]);
  const picking = stage !== "site" || placing || Boolean(draftOnMap);
  const pickLabel =
    stage === "find"
      ? "TAP YOUR BUILDING"
      : stage === "confirm"
        ? tracing
          ? "TAP ROOF CORNERS IN ORDER"
          : "TAP THE CORRECT ROOF"
        : placing
          ? "TAP WHERE THE MACHINE IS"
          : moving
            ? "TAP THE NEW POSITION"
            : "TAP TO ADJUST THIS PIN";
  const outlinePoints =
    stage === "confirm" ? (tracing ? corners : candidate?.outline?.points) : location?.outline?.points;

  // ---- Render --------------------------------------------------------------------------------
  const title =
    stage === "find"
      ? "Find the building"
      : stage === "confirm"
        ? "Confirm the building"
        : location?.name || "Building";
  const stepIndex = stage === "find" ? 0 : stage === "confirm" ? 1 : 2;
  return (
    <section className="planner fp" aria-label="Add equipment">
      <header className="fp-header">
        <button className="fp-icon" aria-label="Back" onClick={back} disabled={busy}>
          <ArrowLeft size={22} />
        </button>
        <div className="fp-title">
          <p className="fp-steps" aria-label={`Step ${stepIndex + 1} of 3`}>
            Step {stepIndex + 1} of 3 · {["Find building", "Confirm building", "Add equipment"][stepIndex]}
          </p>
          <h2>{title}</h2>
        </div>
        <button className="fp-finish" onClick={finish} disabled={busy}>
          <Check size={18} />
          Finish
        </button>
      </header>
      <div className={"fp-body" + (stage === "site" && panel === "indoor" ? " compact" : "")}>
        <div className="fp-map">
          <AssetMap
            assets={mapAssets}
            selected={stage === "site" ? draft?.id || selectedId || "" : "building-preview"}
            onSelect={markerTap}
            onPick={mapTap}
            picking={picking}
            pickLabel={pickLabel}
            focus={focus}
            onViewChange={setMapView}
            topDown
            buildingOutline={outlinePoints}
            requiresGoogle={
              stage === "site" ? location?.mapProvider === "google" : candidate?.mapProvider === "google"
            }
            editablePinId={moving && draft ? draft.id : undefined}
            excludeFromPicker={draftKind === "new" ? draft?.id : undefined}
            userPosition={userPosition}
          />
          {(placing || (draftOnMap && spotNote)) && (
            <div className="fp-map-hint" role="status">
              <Crosshair size={17} />
              {placing ? "Tap where the machine is. Tap an existing pin to use its exact spot." : spotNote}
            </div>
          )}
        </div>
        <div className="fp-sheet" ref={sheet}>
          {restoredNotice && (
            <div className="fp-banner" role="status">
              <RotateCcw size={16} />
              <span>We restored your unsaved work from before the page reloaded.</span>
              <button aria-label="Dismiss" onClick={() => setRestoredNotice(false)}>
                <X size={16} />
              </button>
            </div>
          )}
          {storageWarning && (
            <div className="fp-banner warn" role="status">
              This browser is not keeping a backup of your draft (private mode or storage full). Save each
              machine before using the camera.
            </div>
          )}
          {error && (
            <div className="fp-error" role="alert">
              <span>{error}</span>
              {/sign in/i.test(error) && (
                <a className="fp-btn small" href={SIGN_IN} target="_top">
                  Sign in again — your draft is kept
                </a>
              )}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {stage === "find" && renderFind()}
          {stage === "confirm" && renderConfirm()}
          {stage === "site" && location && renderSite(location)}
        </div>
      </div>
      {toast && (
        <div className="fp-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
      {studioOpen && location && (
        <Suspense fallback={<div className="interior-modal">Loading indoor plan…</div>}>
          <InteriorStudio
            location={location}
            assets={siteAssets}
            deviceOnly={deviceOnly}
            save={async (l) => {
              await persistLocation(l);
            }}
            onClose={() => setStudioOpen(false)}
          />
        </Suspense>
      )}
    </section>
  );

  function renderFind() {
    const shown = locations.filter((l) =>
      `${l.name} ${l.address}`.toLowerCase().includes(buildingFilter.trim().toLowerCase()),
    );
    return (
      <div className="fp-stack">
        <button className="fp-btn primary big" onClick={() => void locateWithGps()} disabled={gpsBusy}>
          {gpsBusy ? <Loader2 className="spin" size={22} /> : <LocateFixed size={22} />}
          {gpsBusy ? "Getting your GPS position…" : "Use my GPS"}
        </button>
        {gpsError && (
          <div className="fp-card warn" role="alert">
            <strong>GPS isn&apos;t available</strong>
            <p>{gpsError}</p>
            <div className="fp-row">
              <button className="fp-btn" onClick={() => document.getElementById("fp-address")?.focus()}>
                Type the address
              </button>
              <button className="fp-btn" onClick={pickOnMap}>
                Pick building on map
              </button>
            </div>
          </div>
        )}
        <form
          className="fp-search"
          onSubmit={(e) => {
            e.preventDefault();
            void findAddress();
          }}
        >
          <label htmlFor="fp-address">Or type the street address</label>
          <div className="fp-row">
            <input
              id="fp-address"
              aria-label="Street address"
              autoComplete="street-address"
              enterKeyHint="search"
              maxLength={250}
              placeholder="123 Main St, City, ST 50309"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setResults([]);
                setSearched(false);
              }}
            />
            <button
              className="fp-btn primary"
              disabled={searching || query.trim().length < 3}
              aria-label="Find address"
            >
              {searching ? <Loader2 className="spin" size={18} /> : <Search size={18} />}
              Find
            </button>
          </div>
        </form>
        {results.length > 0 && (
          <ul className="fp-results" aria-label="Address results">
            {results.map((res) => (
              <li key={res.place_id || res.display_name}>
                <button onClick={() => chooseResult(res)}>
                  <MapPin size={18} />
                  <span>
                    {res.display_name}
                    <em className={res.location_hint === "building_address" ? "ok" : "approx"}>
                      {res.location_hint === "building_address"
                        ? "Exact address"
                        : "Approximate — check the roof"}
                    </em>
                  </span>
                  <ChevronRight size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {searched && !results.length && !searching && !error && (
          <div className="fp-card">
            <p>
              No match for that address. Check the spelling, add the city and ZIP, or pick the building on the
              map.
            </p>
            <button className="fp-btn" onClick={pickOnMap}>
              Pick building on map
            </button>
          </div>
        )}
        <button className="fp-link" onClick={pickOnMap}>
          <Crosshair size={16} /> Or tap your building on the map
        </button>
        <small className="fp-muted">
          {googleKey ? "Addresses from Google Maps." : "Addresses © OpenStreetMap contributors."}{" "}
          <a href="/settings/maps">Maps setup</a>
        </small>
        <section className="fp-section" aria-label="Saved buildings">
          <h3>Saved buildings</h3>
          {locations.length > 4 && (
            <input
              className="fp-filter"
              aria-label="Filter saved buildings"
              placeholder="Filter by name or address"
              value={buildingFilter}
              onChange={(e) => setBuildingFilter(e.target.value)}
            />
          )}
          {!loaded ? (
            <p className="fp-muted">Loading…</p>
          ) : !locations.length ? (
            <p className="fp-muted">
              Buildings you confirm will appear here so you can come back and add more.
            </p>
          ) : (
            <ul className="fp-list">
              {shown.map((l) => (
                <li key={l.id}>
                  <button onClick={() => openBuilding(l)}>
                    <Building2 size={20} />
                    <span>
                      <strong>{l.name}</strong>
                      <small>{l.address}</small>
                      <small>{countFor(l)} machines</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  function renderConfirm() {
    if (!candidate)
      return (
        <div className="fp-stack">
          <div className="fp-card">
            <strong>Tap your building on the map</strong>
            <p>Zoom in with two fingers, then tap the roof. You can adjust it after.</p>
          </div>
        </div>
      );
    const set = (patch: Partial<BuildingCandidate>) => setCandidate({ ...candidate, ...patch });
    return (
      <form
        className="fp-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void confirmBuilding();
        }}
      >
        <div className={"fp-card " + (candidate.approximate ? "warn" : "")}>
          <strong>
            {candidate.source === "gps"
              ? "GPS position"
              : candidate.source === "address"
                ? candidate.approximate
                  ? "Approximate address match"
                  : "Address match"
                : candidate.source === "edit"
                  ? "Edit building"
                  : "Picked on map"}
          </strong>
          <p>{candidate.hint || "Tap the correct roof if the pin is off."}</p>
          <p className="fp-muted small" role="status">
            {outlineBusy ? (
              <>
                <Loader2 className="spin" size={14} /> Looking up the roof outline…
              </>
            ) : (
              outlineHint || (candidate.outline ? "Roof outlined in green." : "")
            )}
          </p>
        </div>
        {nearbySaved.length > 0 && candidate.source !== "edit" && (
          <div className="fp-card">
            <strong>Already saved nearby</strong>
            {nearbySaved.map((l) => (
              <button type="button" key={l.id} className="fp-btn full" onClick={() => openBuilding(l)}>
                <Building2 size={18} /> Open {l.name} ({countFor(l)} machines)
              </button>
            ))}
          </div>
        )}
        <div className="fp-row wrap">
          {!tracing ? (
            <button
              type="button"
              className="fp-btn"
              onClick={() => {
                setTracing(true);
                setCorners([]);
                setOutlineHint("Tap each roof corner in order. Keep the pin inside.");
              }}
            >
              <Pencil size={16} /> {candidate.outline ? "Redraw outline" : "Trace outline"}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="fp-btn"
                onClick={() => setCorners((c) => c.slice(0, -1))}
                disabled={!corners.length}
              >
                Undo corner
              </button>
              <button
                type="button"
                className="fp-btn primary"
                onClick={finishTrace}
                disabled={corners.length < 3}
              >
                Done tracing ({corners.length})
              </button>
              <button
                type="button"
                className="fp-btn"
                onClick={() => {
                  setTracing(false);
                  setCorners([]);
                }}
              >
                Cancel
              </button>
            </>
          )}
          {candidate.outline && !tracing && (
            <button type="button" className="fp-btn" onClick={() => set({ outline: undefined })}>
              Clear outline
            </button>
          )}
        </div>
        <label className="fp-field">
          Business / building name
          <input
            required
            maxLength={250}
            value={candidate.name}
            placeholder="e.g. Acme Distribution"
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>
        <label className="fp-field">
          Address
          <input
            required
            maxLength={250}
            value={candidate.address}
            placeholder="Street, city, state"
            onChange={(e) => set({ address: e.target.value })}
          />
        </label>
        <label className="fp-field">
          Business type
          <select value={candidate.businessType} onChange={(e) => set({ businessType: e.target.value })}>
            {BUSINESS_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <small className="fp-muted">
          Building pin: {candidate.lat.toFixed(6)}, {candidate.lng.toFixed(6)}
          {!candidate.outline && " · no outline yet (optional)"}
        </small>
        <button className="fp-btn primary big" disabled={busy || tracing || outlineBusy}>
          {busy ? <Loader2 className="spin" size={20} /> : <Check size={20} />}
          {candidate.source === "edit" ? "Save building" : "Confirm building"}
        </button>
      </form>
    );
  }

  function renderSite(l: Location) {
    if (panel === "indoor") return renderIndoor(l);
    if (panel === "options") return renderOptions(l);
    if (draft) return renderForm(l, draft);
    if (selected) return renderMachine(l, selected);
    if (placing)
      return (
        <div className="fp-stack">
          <div className="fp-card accent">
            <strong>Tap where the machine is</strong>
            <p>Zoom in on the map and tap its spot. Several machines can share one spot.</p>
          </div>
          {gps && (
            <button
              className="fp-btn full"
              onClick={() => newDraftAt(gps, "Placed at your GPS position. Tap the map to adjust.")}
            >
              <LocateFixed size={18} /> Use my current GPS spot
            </button>
          )}
          <button
            className="fp-btn full"
            onClick={() => newDraftAt(l, "Placed on the building pin. Tap the map to adjust.")}
          >
            <Building2 size={18} /> Use the building pin
          </button>
          <button className="fp-btn full" onClick={() => void locateWithGps()} disabled={gpsBusy}>
            {gpsBusy ? <Loader2 className="spin" size={18} /> : <Crosshair size={18} />} Refresh my GPS
            position
          </button>
          {gpsError && <p className="fp-muted small">{gpsError}</p>}
          <button className="fp-link" onClick={() => setPlacing(false)}>
            Cancel
          </button>
        </div>
      );
    const groups = groupByArea(siteAssets);
    const areaPhotos = l.interior?.photos || [];
    return (
      <div className="fp-stack">
        <div className="fp-building">
          <Building2 size={20} />
          <div>
            <strong>{l.name}</strong>
            <small>{l.address}</small>
          </div>
        </div>
        <button className="fp-btn primary big" onClick={startPlacing}>
          <Plus size={22} /> Add equipment
        </button>
        <label className="fp-btn full fp-file">
          <Images size={18} /> Capture this area
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            aria-label="Capture this area"
            onChange={(e) => {
              void addPhoto(e.target.files?.[0], "area");
              e.target.value = "";
            }}
          />
        </label>
        <label className="fp-field compact">
          Area name for the next area photo
          <input
            maxLength={250}
            placeholder="e.g. 2nd floor breakroom"
            value={areaLabel}
            onChange={(e) => setAreaLabel(e.target.value)}
          />
        </label>
        <PhotoStrip pending={areaPending} previews={previews} onRetry={retryPhoto} onRemove={removePending} />
        <section className="fp-section">
          <h3>
            {siteAssets.length} {siteAssets.length === 1 ? "machine" : "machines"} here
            {savedCount > 0 && <small> · {savedCount} added this visit</small>}
          </h3>
          {!siteAssets.length && (
            <p className="fp-muted">Tap Add equipment, then tap the map where the first machine is.</p>
          )}
          {groups.map(([area, list]) => (
            <div key={area} className="fp-group">
              <h4>{area}</h4>
              <ul className="fp-list">
                {list.map((a) => (
                  <li key={a.id}>
                    <button onClick={() => markerTap(a.id)}>
                      {a.photos[0] ? (
                        <img className="fp-thumb" src={photoSource(a.photos[0].key)} alt="" loading="lazy" />
                      ) : (
                        <MapPin size={20} />
                      )}
                      <span>
                        <strong>{a.name}</strong>
                        <small>
                          {a.equipmentType || a.category}
                          {a.tag ? " · " + a.tag : ""} · {a.status}
                        </small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
        {areaPhotos.length > 0 && (
          <section className="fp-section">
            <h3>Area photos</h3>
            <div className="fp-photos">
              {areaPhotos.map((p) => (
                <figure key={p.key}>
                  <a href={photoSource(p.key)} target="_blank" rel="noopener noreferrer">
                    <img src={photoSource(p.key)} alt={"Area photo: " + p.label} loading="lazy" />
                  </a>
                  <figcaption>
                    {p.label}
                    {p.assetIds?.length ? ` · ${p.assetIds.length} machines` : ""}
                  </figcaption>
                  <button
                    className="fp-mini"
                    aria-label={"Remove area photo " + p.label}
                    onClick={() => void removeAreaPhoto(p)}
                  >
                    <Trash2 size={14} />
                  </button>
                </figure>
              ))}
            </div>
          </section>
        )}
        <div className="fp-row wrap secondary-actions">
          <button className="fp-btn" onClick={() => setPanel("indoor")}>
            <Layers3 size={18} /> Indoor plan & 3D
          </button>
          <button className="fp-btn" onClick={() => setPanel("options")}>
            <Settings2 size={18} /> Building options
          </button>
        </div>
      </div>
    );
  }

  function renderForm(l: Location, d: Asset) {
    const set = (patch: Partial<Asset>) => setDraft({ ...d, ...patch });
    const isNew = draftKind === "new";
    const moved = !moveFrom.current || moveFrom.current.lat !== d.lat || moveFrom.current.lng !== d.lng;
    const photoCount = d.photos.length + machinePending.length;
    const typeKnown = suggestions.includes(d.equipmentType || "");
    return (
      <form
        className="fp-stack"
        aria-label={isNew ? "New machine" : "Edit machine"}
        onSubmit={(e) => {
          e.preventDefault();
          void saveDraft(isNew ? "another" : "done");
        }}
      >
        <div className="fp-form-head">
          <p className="fp-eyebrow">
            {isNew ? `NEW MACHINE · ${l.name}` : moving ? "MOVE PIN" : "EDIT MACHINE"}
          </p>
          <p className="fp-spot">
            <MapPin size={15} />{" "}
            {spotNote ||
              (isNew
                ? "Pin placed. Tap the map to adjust."
                : `Pin at ${d.lat.toFixed(6)}, ${d.lng.toFixed(6)}`)}
          </p>
        </div>
        <fieldset className="fp-chips">
          <legend>Equipment type</legend>
          {suggestions.map((t) => (
            <button type="button" key={t} aria-pressed={d.equipmentType === t} onClick={() => chooseType(t)}>
              {t}
            </button>
          ))}
        </fieldset>
        <label className="fp-field">
          Other type
          <input
            maxLength={250}
            placeholder="Type another kind of equipment"
            value={typeKnown ? "" : d.equipmentType || ""}
            onChange={(e) =>
              set({ equipmentType: e.target.value, category: equipmentCategory(e.target.value) })
            }
          />
        </label>
        <label className="fp-field">
          Machine name
          <input
            maxLength={250}
            placeholder="e.g. Breakroom drinks"
            value={d.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>
        <div className="fp-grid">
          <label className="fp-field">
            Room / area
            <input
              maxLength={250}
              placeholder="e.g. Breakroom"
              value={d.room}
              onChange={(e) => set({ room: e.target.value })}
            />
          </label>
          <label className="fp-field">
            Floor
            <input
              maxLength={250}
              placeholder="1"
              value={d.floor}
              onChange={(e) => set({ floor: e.target.value })}
            />
          </label>
        </div>
        <fieldset className="fp-photo-field">
          <legend>
            Photos{" "}
            <small>
              {photoCount}/{MAX_MACHINE_PHOTOS}
            </small>
          </legend>
          <div className="fp-row">
            <label
              className={"fp-btn primary fp-file" + (photoCount >= MAX_MACHINE_PHOTOS ? " disabled" : "")}
            >
              <Camera size={18} /> Take photo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                aria-label="Take photo"
                disabled={photoCount >= MAX_MACHINE_PHOTOS}
                onChange={(e) => {
                  void addPhoto(e.target.files?.[0], "asset");
                  e.target.value = "";
                }}
              />
            </label>
            <label className={"fp-btn fp-file" + (photoCount >= MAX_MACHINE_PHOTOS ? " disabled" : "")}>
              <ImagePlus size={18} /> Upload
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Upload photo"
                disabled={photoCount >= MAX_MACHINE_PHOTOS}
                onChange={(e) => {
                  void addPhoto(e.target.files?.[0], "asset");
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <div className="fp-photos">
            {d.photos.map((p) => (
              <figure key={p.key}>
                <img src={photoSource(p.key)} alt={p.label + " of this machine"} />
                <figcaption className="ok">
                  <Check size={13} /> Attached
                </figcaption>
                <button
                  type="button"
                  className="fp-mini"
                  aria-label={"Remove " + p.label}
                  onClick={() => set({ photos: d.photos.filter((x) => x.key !== p.key) })}
                >
                  <Trash2 size={14} />
                </button>
              </figure>
            ))}
          </div>
          <PhotoStrip
            pending={machinePending}
            previews={previews}
            onRetry={retryPhoto}
            onRemove={removePending}
          />
        </fieldset>
        <label className="fp-field">
          How to find it
          <textarea
            maxLength={3000}
            rows={2}
            placeholder="e.g. Enter loading dock door, left past the time clock"
            value={d.entrance}
            onChange={(e) => set({ entrance: e.target.value })}
          />
        </label>
        <details className="fp-more">
          <summary>More details · status, model, serial, notes</summary>
          <label className="fp-field">
            Status
            <select value={d.status} onChange={(e) => set({ status: e.target.value as Asset["status"] })}>
              {["Operational", "Needs service", "Offline"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <div className="fp-grid">
            <label className="fp-field">
              Model
              <input maxLength={250} value={d.model} onChange={(e) => set({ model: e.target.value })} />
            </label>
            <label className="fp-field">
              Serial number
              <input maxLength={250} value={d.serial} onChange={(e) => set({ serial: e.target.value })} />
            </label>
          </div>
          <label className="fp-field">
            Asset tag
            <input maxLength={250} value={d.tag} onChange={(e) => set({ tag: e.target.value })} />
          </label>
          <label className="fp-field">
            Notes
            <textarea
              maxLength={5000}
              rows={3}
              value={d.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </label>
        </details>
        <div className="fp-actions sticky">
          {isNew ? (
            <>
              <button className="fp-btn primary big" disabled={busy || uploading}>
                {busy ? <Loader2 className="spin" size={20} /> : <Plus size={20} />} Save & add another
              </button>
              <button
                type="button"
                className="fp-btn big"
                disabled={busy || uploading}
                onClick={() => void saveDraft("done")}
              >
                <Check size={20} /> Save
              </button>
            </>
          ) : (
            <>
              <button className="fp-btn primary big" disabled={busy || uploading || (moving && !moved)}>
                {busy ? <Loader2 className="spin" size={20} /> : <Check size={20} />}{" "}
                {moving ? (moved ? "Save new position" : "Tap the map to move it") : "Save changes"}
              </button>
              {!moving && (
                <button
                  type="button"
                  className="fp-btn"
                  onClick={() => {
                    moveFrom.current = { lat: d.lat, lng: d.lng };
                    setMoving(true);
                    setSpotNote("Tap the map at the machine's new position. Other machines will not move.");
                  }}
                >
                  <Move size={18} /> Move pin
                </button>
              )}
            </>
          )}
          {uploading && <small className="fp-muted">Waiting for the photo to finish uploading…</small>}
          <button type="button" className="fp-link" onClick={cancelDraft} disabled={busy}>
            {isNew ? "Discard this machine" : "Cancel"}
          </button>
        </div>
      </form>
    );
  }

  function renderMachine(l: Location, a: Asset) {
    const inPhotos = (l.interior?.photos || []).filter((p) => p.assetIds?.includes(a.id));
    const neighbours = siteAssets.filter((x) => x.id !== a.id && x.lat === a.lat && x.lng === a.lng);
    return (
      <article className="fp-stack" aria-label={"Machine: " + a.name}>
        <div className="fp-form-head">
          <p className="fp-eyebrow">
            MACHINE · {deviceOnly ? "SAVED ON THIS DEVICE" : "SAVED TO YOUR ACCOUNT"}
          </p>
          <h3 className="fp-machine-name">{a.name}</h3>
          <p className="fp-muted">
            {a.equipmentType || a.category} ·{" "}
            <span className={"fp-status " + a.status.replaceAll(" ", "-")}>{a.status}</span>
          </p>
        </div>
        <dl className="fp-facts">
          <div>
            <dt>Where</dt>
            <dd>
              {[a.room || "Room not set", a.floor ? "Floor " + a.floor : ""].filter(Boolean).join(" · ")}
            </dd>
          </div>
          {a.entrance && (
            <div>
              <dt>How to find it</dt>
              <dd>{a.entrance}</dd>
            </div>
          )}
          {(a.model || a.serial || a.tag) && (
            <div>
              <dt>Model / serial / tag</dt>
              <dd>{[a.model || "—", a.serial || "—", a.tag || "—"].join(" / ")}</dd>
            </div>
          )}
          {a.notes && (
            <div>
              <dt>Notes</dt>
              <dd className="note-text">{a.notes}</dd>
            </div>
          )}
          <div>
            <dt>Pin</dt>
            <dd>
              {a.lat.toFixed(7)}, {a.lng.toFixed(7)}
              {neighbours.length > 0 && ` · shares this spot with ${neighbours.length} other`}
            </dd>
          </div>
        </dl>
        {a.photos.length > 0 ? (
          <div className="fp-photos large">
            {a.photos.map((p) => (
              <a key={p.key} href={photoSource(p.key)} target="_blank" rel="noopener noreferrer">
                <img src={photoSource(p.key)} alt={p.label + " of " + a.name} loading="lazy" />
              </a>
            ))}
          </div>
        ) : (
          <p className="fp-muted">No photos yet. Tap Edit to take one.</p>
        )}
        {inPhotos.length > 0 && (
          <>
            <h4>In area photos</h4>
            <div className="fp-photos">
              {inPhotos.map((p) => (
                <a key={p.key} href={photoSource(p.key)} target="_blank" rel="noopener noreferrer">
                  <img src={photoSource(p.key)} alt={"Area photo: " + p.label} loading="lazy" />
                </a>
              ))}
            </div>
          </>
        )}
        <div className="fp-actions">
          <button className="fp-btn primary big" onClick={() => editMachine(a)}>
            <Pencil size={18} /> Edit details & photos
          </button>
          <div className="fp-row wrap">
            <button className="fp-btn" onClick={() => editMachine(a, true)}>
              <Move size={18} /> Move pin
            </button>
            <button className="fp-btn" onClick={() => newDraftAt(a, `Same spot as “${a.name}”.`, a)}>
              <Plus size={18} /> Add another here
            </button>
            <a
              className="fp-btn"
              href={
                "https://www.google.com/maps/dir/?api=1&destination=" +
                encodeURIComponent(a.lat + "," + a.lng)
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              <Navigation size={18} /> Directions
            </a>
          </div>
          <button className="fp-link" onClick={() => setSelectedId("")}>
            Back to all machines
          </button>
        </div>
        <small className="fp-muted">Record ID {a.id}</small>
      </article>
    );
  }

  function renderOptions(l: Location) {
    return (
      <div className="fp-stack">
        <h3>Building options</h3>
        <p className="fp-muted">
          The building pin, the saved map view and every machine pin are stored separately. Panning the map
          never moves a pin.
        </p>
        <button className="fp-btn full" onClick={editBuilding}>
          <Pencil size={18} /> Edit name, address, roof pin or outline
        </button>
        <button className="fp-btn full" onClick={() => void saveMapView()} disabled={!mapView || busy}>
          <Check size={18} /> Save current map view for this building
        </button>
        <button className="fp-btn full" onClick={() => setFocus({ ...focusFor(l) })}>
          <Building2 size={18} /> Return to the building
        </button>
        <button className="fp-btn full" onClick={() => void locateWithGps()} disabled={gpsBusy}>
          <LocateFixed size={18} /> Show my GPS position
        </button>
        <button
          className="fp-btn full"
          onClick={() => {
            if (!guardDraft()) return;
            setLocation(null);
            setStage("find");
          }}
        >
          <Search size={18} /> Switch to another building
        </button>
        <button className="fp-link" onClick={() => setPanel("overview")}>
          Done
        </button>
      </div>
    );
  }

  function renderIndoor(l: Location) {
    const layout = l.layout;
    const model = l.interior?.model;
    const layoutLabel = !layout
      ? "None yet"
      : layout.source === "roomplan-scan"
        ? "Measured scan (LiDAR)"
        : layout.reference
          ? "Reference photo of a plan"
          : layout.basis === "measured"
            ? "Measured layout"
            : "Estimated layout (sketch)";
    return (
      <div className="fp-stack">
        <h3>Indoor plan & 3D</h3>
        <p className="fp-muted">Optional. Everything else works without it.</p>
        <div className="fp-card">
          <strong>Indoor floor plan</strong>
          <p>
            Current: <b>{layoutLabel}</b>
            {layout ? ` · ${(layout.planPins?.length || 0) + layout.pins.length} machines marked` : ""}
          </p>
          <button className="fp-btn primary full" onClick={() => setStudioOpen(true)}>
            <Layers3 size={18} /> {layout ? "Open indoor plan" : "Photograph a plan or sketch one"}
          </button>
          <ul className="fp-legend">
            <li>
              <b>Reference photo</b> — a photographed safety map or uploaded floor plan. Scale is what you
              enter.
            </li>
            <li>
              <b>Estimated layout</b> — rooms you sketch by hand. Not measured.
            </li>
            <li>
              <b>Measured scan</b> — walls from an iPhone/iPad LiDAR RoomPlan export (below).
            </li>
          </ul>
        </div>
        <div className="fp-card">
          <strong>Import a measured LiDAR scan</strong>
          <p>
            From the 3D Model Anything iPhone app (LiDAR iPhone/iPad, iOS 17+): open the room ›{" "}
            <i>Share room (.zip)</i> › save to Files, then choose that .zip here. A RoomPlan{" "}
            <code>room-N.json</code> or <code>structure.json</code> also works.
          </p>
          <label className="fp-btn full fp-file">
            <Layers3 size={18} /> Choose scan (.zip or .json)
            <input
              type="file"
              accept=".zip,.json,application/zip,application/json"
              aria-label="Import measured LiDAR scan"
              disabled={busy}
              onChange={(e) => {
                void importScan(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <div className="fp-card">
          <strong>3D model (GLB)</strong>
          <p>
            Current: <b>{model ? modelKindLabel(model.kind) + " · " + model.label : "None yet"}</b>
          </p>
          <BuildingInterior
            key={l.id + (model?.key || "")}
            location={l}
            assets={siteAssets}
            deviceOnly={deviceOnly}
            inline
            onBusy={setBusy}
            save={async (next) => {
              await persistLocation(next);
            }}
          />
        </div>
        <button className="fp-link" onClick={() => setPanel("overview")}>
          Back to machines
        </button>
      </div>
    );
  }

  function countFor(l: Location) {
    const ids = new Set<string>();
    for (const a of assets) if (a.siteId === l.id) ids.add(a.id);
    for (const a of Object.values(localSaved)) if (a.siteId === l.id) ids.add(a.id);
    return ids.size;
  }
}

function PhotoStrip({
  pending,
  previews,
  onRetry,
  onRemove,
}: {
  pending: PendingPhoto[];
  previews: Record<string, string>;
  onRetry: (p: PendingPhoto) => void;
  onRemove: (p: PendingPhoto) => void;
}) {
  if (!pending.length) return null;
  return (
    <div className="fp-photos">
      {pending.map((p) => (
        <figure key={p.id} className={p.status}>
          {previews[p.id] ? (
            <img src={previews[p.id]} alt={p.label + " (not yet attached)"} />
          ) : (
            <div className="fp-ph" />
          )}
          <figcaption>
            {p.status === "uploading" ? (
              <>
                <Loader2 className="spin" size={13} /> Uploading…
              </>
            ) : (
              <>Not attached</>
            )}
          </figcaption>
          {p.status === "failed" && (
            <div className="fp-photo-fail" role="alert">
              <small>{p.error || "Upload failed."}</small>
              <button type="button" className="fp-btn small primary" onClick={() => onRetry(p)}>
                <RotateCcw size={14} /> Retry
              </button>
              <button type="button" className="fp-btn small" onClick={() => onRemove(p)}>
                Remove
              </button>
            </div>
          )}
        </figure>
      ))}
    </div>
  );
}

function focusFor(l: Location, draft?: Asset): View {
  if (draft) return { lat: draft.lat, lng: draft.lng, zoom: 120 };
  return l.mapView || { lat: l.lat, lng: l.lng, zoom: Math.min(l.zoom, 150) };
}
function nextPhotoLabel(used: string[]) {
  for (let i = 1; i <= 10; i++) if (!used.includes("Photo " + i)) return "Photo " + i;
  return "Photo " + newId().slice(0, 4);
}
function groupByArea(list: Asset[]): [string, Asset[]][] {
  const map = new Map<string, Asset[]>();
  for (const a of list) {
    const key = [a.floor ? "Floor " + a.floor : "", a.room || "No room set"].filter(Boolean).join(" · ");
    map.set(key, [...(map.get(key) || []), a]);
  }
  return [...map.entries()];
}
/** Machines the area photo shows: same room name, else machines near the one being viewed. */
function machinesInArea(list: Asset[], label: string, near?: Asset | null) {
  const room = label.trim().toLowerCase();
  const byRoom = room ? list.filter((a) => a.room.trim().toLowerCase() === room) : [];
  if (byRoom.length) return byRoom;
  if (near) return list.filter((a) => metresBetween(a, near) <= 15);
  return [];
}
export function modelKindLabel(kind?: string) {
  return kind === "measured-scan"
    ? "Measured scan"
    : kind === "reconstruction"
      ? "Photo-guided reconstruction"
      : kind === "estimated"
        ? "Estimated model"
        : "3D model (source not labeled)";
}
function previewUrl(blob: Blob) {
  try {
    return typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : "";
  } catch {
    return "";
  }
}
