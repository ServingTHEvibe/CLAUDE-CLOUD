"use client";
import { newId } from "../lib/id.mjs";

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  Plus,
  MapPin,
  Building2,
  Search,
  RefreshCw,
  Check,
  ArrowLeft,
  Camera,
  Download,
  Cloud,
  Smartphone,
  Navigation,
  LogIn,
  Settings2,
  X,
  Loader2,
  Wrench,
} from "lucide-react";
import InventoryPlanner, { type PlannerStorage } from "./inventory-planner";
import { readPlannerSession, sessionOwner } from "../lib/planner-session";
import AssetMap from "./equipment-map";
const AdvancedWorkspace = lazy(() => import("../app/advanced-workspace"));
import type { Asset } from "../lib/asset";
import { readApiResponse } from "../lib/api-response";
import { capturePhoto } from "../lib/capture-photo";
import { photoSource } from "../lib/field-store";
import {
  readDeviceCapture,
  saveDeviceAsset,
  saveDeviceLocation,
  syncDeviceCapture,
  downloadDeviceBackup,
  importDeviceBackup,
} from "../lib/field-store";

type Session = { signedIn: boolean; user: { id: string; name: string; email: string } | null };
const signIn = "/signin-with-chatgpt?return_to=%2F";
const deviceStorage: PlannerStorage = {
  loadLocations: async () => readDeviceCapture().locations,
  saveLocation: saveDeviceLocation,
  saveAsset: saveDeviceAsset,
  deviceOnly: true,
};
export default function FieldWorkspace() {
  const [session, setSession] = useState<Session | null>(null),
    [cloud, setCloud] = useState<Asset[]>([]),
    [device, setDevice] = useState<Asset[]>([]),
    [deviceBuildings, setDeviceBuildings] = useState(0),
    [mode, setMode] = useState<"cloud" | "device">("cloud"),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [planner, setPlanner] = useState(false),
    [advanced, setAdvanced] = useState(false),
    [selected, setSelected] = useState<Asset | null>(null),
    [siteFilter, setSiteFilter] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All"),
    [tab, setTab] = useState<"list" | "map">("list"),
    [offline, setOffline] = useState(false),
    [draft, setDraft] = useState<Asset | null>(null),
    [serviceNote, setServiceNote] = useState("");
  const [entry, setEntry] = useState(false),
    [cloudReady, setCloudReady] = useState(false);
  const sheetState = useRef({ draft, busy });
  sheetState.current = { draft, busy };
  useEffect(() => {
    if (!entry && !selected) return;
    const previous = document.activeElement as HTMLElement | null;
    const sheet = document.querySelector<HTMLElement>(".field-sheet");
    const targets = () =>
      Array.from(
        sheet?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),a[href],input:not(:disabled),select,textarea",
        ) || [],
      );
    targets()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      const state = sheetState.current;
      if (e.key === "Escape" && !state.busy) {
        if (state.draft && !confirm("Discard unsaved equipment changes?")) return;
        setEntry(false);
        setSelected(null);
        setDraft(null);
        setServiceNote("");
      }
      if (e.key === "Tab") {
        const items = targets(),
          first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [entry, Boolean(selected)]);
  const refreshDevice = useCallback(() => {
    try {
      const data = readDeviceCapture();
      setDevice(data.assets);
      setDeviceBuildings(data.locations.length);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  // Reopen an unfinished Add-equipment session after a reload, camera crash or sign-in.
  const resumeChecked = useRef(false);
  useEffect(() => {
    if (loading || planner || resumeChecked.current) return;
    resumeChecked.current = true;
    try {
      if (new URLSearchParams(window.location.search).has("resume")) history.replaceState(null, "", "/");
    } catch {}
    if (mode === "cloud" && !session?.signedIn) return;
    if (readPlannerSession(sessionOwner(mode, session?.user?.id))) setPlanner(true);
  }, [loading, planner, mode, session]);
  const refresh = useCallback(async () => {
    setLoading(true);
    setCloudReady(false);
    setCloud([]);
    setError("");
    refreshDevice();
    try {
      const s = await readApiResponse(
        await fetch("/api/session", { cache: "no-store", signal: AbortSignal.timeout(12000) }),
      );
      setSession(s);
      if (s.signedIn) {
        const j = await readApiResponse(
          await fetch("/api/assets", { cache: "no-store", signal: AbortSignal.timeout(12000) }),
        );
        setCloud(j.assets);
        setCloudReady(true);
      } else {
        setCloud([]);
      }
    } catch (e) {
      setError((e as Error).message || "Cloud connection unavailable.");
      if (/sign in/i.test((e as Error).message)) setSession({ signedIn: false, user: null });
    } finally {
      setLoading(false);
    }
  }, [refreshDevice]);
  useEffect(() => {
    try {
      if (localStorage.getItem("stv-locate.mode") === "device") setMode("device");
    } catch {}
    void refresh();
    const online = () => setOffline(!navigator.onLine);
    const storage = () => refreshDevice();
    online();
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      window.removeEventListener("storage", storage);
    };
  }, [refresh, refreshDevice]);
  useEffect(() => {
    if (!draft) return;
    const before = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [draft]);
  const assets = mode === "device" ? device : cloud;
  const sites = [
    ...new Map(
      assets.map((asset) => [
        asset.siteId || asset.site + "|" + asset.address,
        { id: asset.siteId || asset.site + "|" + asset.address, name: asset.site },
      ]),
    ).values(),
  ];
  const shown = assets.filter(
    (a) =>
      (!siteFilter || (a.siteId || a.site + "|" + a.address) === siteFilter) &&
      (filter === "All" || a.status === filter) &&
      `${a.name} ${a.site} ${a.address} ${a.tag} ${a.equipmentType || ""} ${a.room} ${a.floor} ${a.model} ${a.serial}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  function start() {
    setSelected(null);
    setError("");
    setMessage("");
    if (mode === "cloud" && !session?.signedIn) {
      setEntry(true);
      return;
    }
    setPlanner(true);
  }
  function captureDevice() {
    setMode("device");
    setSelected(null);
    setError("");
    refreshDevice();
    try {
      localStorage.setItem("stv-locate.mode", "device");
    } catch {}
    setMessage(
      "Device capture enabled. Records stay in this browser until you explicitly sync. Do not clear browser data.",
    );
  }
  async function save(asset: Asset) {
    setBusy(true);
    setError("");
    try {
      const a =
        mode === "device"
          ? await saveDeviceAsset(asset)
          : (
              await readApiResponse(
                await fetch("/api/assets", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(asset),
                }),
              )
            ).asset;
      if (mode === "device") refreshDevice();
      else setCloud((prev) => [a, ...prev.filter((x) => x.id !== a.id)]);
      setSelected(a);
      setDraft(null);
      setServiceNote("");
      setMessage(
        mode === "device"
          ? "Saved on this device. Not yet backed up in the cloud."
          : "Equipment saved to your private cloud workspace.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function sync() {
    if (!session?.user) return;
    if (
      !confirm(
        `Upload ${device.length} equipment records and ${deviceBuildings} building listings from this device to ${session.user.email}? Records are assigned to this signed-in account.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const count = await syncDeviceCapture(session.user.id);
      setMode("cloud");
      try {
        localStorage.setItem("stv-locate.mode", "cloud");
      } catch {}
      setMessage(`${count} equipment records synced. Cloud copy saved; pending device queue cleared.`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      refreshDevice();
    } finally {
      setBusy(false);
    }
  }
  async function photo(file: File) {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const key = await capturePhoto(file, mode === "device");
      setDraft((d) =>
        d
          ? {
              ...d,
              photos: [...d.photos.filter((p) => p.label !== "Equipment"), { label: "Equipment", key }],
            }
          : d,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function open(a: Asset) {
    setSelected(a);
    setError("");
    setMessage("");
  }
  function leaveEdit() {
    if (draft && !confirm("Discard unsaved equipment changes?")) return;
    setDraft(null);
    setSelected(null);
    setServiceNote("");
  }
  if (advanced)
    return (
      <>
        <div className="field-return">
          <button
            onClick={() => {
              setAdvanced(false);
              void refresh();
            }}
          >
            <ArrowLeft size={16} />
            Back to field mode
          </button>
        </div>
        <Suspense fallback={<div className="field-empty">Loading full workspace…</div>}>
          <AdvancedWorkspace />
        </Suspense>
      </>
    );
  return (
    <main className="field-app">
      <div inert={planner} aria-hidden={planner}>
        <header className="field-top">
          <a className="brand" href="/">
            <span className="brand-mark">
              <MapPin size={24} />
            </span>
            <span>
              STV <b>Locate</b>
              <small>FIELD EQUIPMENT WORKSPACE</small>
            </span>
          </a>
          <div className="field-account">
            {session?.signedIn ? (
              <>
                <span className="field-account-name">
                  <Check size={15} />
                  {session.user?.name}
                </span>
                <a href="/signout-with-chatgpt?return_to=%2F" target="_top">
                  Sign out
                </a>
              </>
            ) : (
              <a className="primary" href={signIn} target="_top">
                <LogIn size={17} />
                Log in
              </a>
            )}
          </div>
        </header>
        <section className="field-hero">
          <div>
            <p className="eyebrow">SERVING THE VIBE · FIELD MODE</p>
            <h1>
              Your equipment,
              <br />
              <span>mapped.</span>
            </h1>
            <p>
              Find a building. Add a machine.
              <br />
              Keep its location and details together.
            </p>
          </div>
          <button className="primary field-add" disabled={busy} onClick={start}>
            <Plus size={24} />
            Add equipment
          </button>
        </section>

        <section className="field-connection" aria-label="Account and storage status">
          <div>
            <span
              className={
                "connection-dot " + (mode === "device" ? "device" : cloudReady ? "connected" : "disconnected")
              }
            />
            <strong>
              {mode === "device"
                ? "On-device capture"
                : loading
                  ? "Checking cloud session…"
                  : cloudReady
                    ? "Cloud workspace connected"
                    : session?.signedIn
                      ? "Cloud connection needs attention"
                      : "Cloud login needed"}
            </strong>
            <p>
              {mode === "device"
                ? "Records and photos are saved on this device. Sync or export a backup when connected."
                : loading
                  ? "Loading your private equipment records…"
                  : cloudReady
                    ? "Your equipment records use private cloud storage."
                    : session?.signedIn
                      ? "Your account is signed in, but cloud inventory could not load. Retry or use device capture."
                      : "Use Log in for cloud storage, or explicitly choose device capture to record equipment now."}
              {offline ? " You are offline. Map imagery and search need internet." : ""}
            </p>
          </div>
          <div className="field-connection-actions">
            {mode === "cloud" ? (
              <button className="secondary" onClick={captureDevice}>
                <Smartphone size={16} />
                Use device capture
              </button>
            ) : (
              <button
                className="secondary"
                onClick={() => {
                  setMode("cloud");
                  setSelected(null);
                  try {
                    localStorage.setItem("stv-locate.mode", "cloud");
                  } catch {}
                  void refresh();
                }}
              >
                <Cloud size={16} />
                Cloud workspace
              </button>
            )}
            <button
              className="icon-button"
              disabled={busy || loading}
              aria-label="Refresh workspace"
              onClick={() => void refresh()}
            >
              <RefreshCw size={19} />
            </button>
          </div>
        </section>
        {mode === "cloud" && !loading && !session?.signedIn && (
          <section className="field-login">
            <LogIn size={23} />
            <div>
              <h2>Start with your private workspace.</h2>
              <p>Login is through ChatGPT. No separate app password is needed.</p>
            </div>
            <a className="primary" href={signIn} target="_top">
              Continue with ChatGPT
            </a>
            <button
              className="secondary"
              onClick={() => {
                captureDevice();
                setPlanner(true);
              }}
            >
              Add equipment on this device
            </button>
          </section>
        )}
        {(device.length > 0 || deviceBuildings > 0) && (
          <section className="field-pending">
            <Smartphone size={19} />
            <div>
              <b>
                {device.length} equipment · {deviceBuildings} buildings on this device
              </b>
              <p>Records and photos are saved on this device. Sync to back them up to your account.</p>
            </div>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                setMode("device");
                setSelected(null);
              }}
            >
              View device records
            </button>
            {session?.signedIn ? (
              <button className="primary" disabled={busy} onClick={() => void sync()}>
                {busy ? <Loader2 className="spin" size={16} /> : <Cloud size={16} />}Sync to my account
              </button>
            ) : (
              <a className="secondary" href={signIn} target="_top">
                Log in to sync
              </a>
            )}
          </section>
        )}
        {error && (
          <div className="field-alert" role="alert">
            <span>{error}</span>
            {/sign in/i.test(error) && (
              <a className="secondary" href={signIn} target="_top">
                Log in again
              </a>
            )}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={18} />
            </button>
          </div>
        )}
        {message && (
          <div className="field-success" role="status">
            <Check size={17} />
            {message}
          </div>
        )}

        <section className="field-content">
          <div className="field-list-heading">
            <div>
              <p className="eyebrow">{mode === "device" ? "DEVICE RECORDS" : "YOUR EQUIPMENT"}</p>
              <h2>{assets.length} equipment spots</h2>
            </div>
            <button className="secondary" onClick={start}>
              <Building2 size={17} />
              Saved buildings
            </button>
          </div>
          {sites.length > 1 && (
            <nav className="site-filters" aria-label="Filter by site">
              <button aria-pressed={!siteFilter} onClick={() => setSiteFilter("")}>
                All sites
              </button>
              {sites.map((site) => (
                <button
                  key={site.id}
                  aria-pressed={siteFilter === site.id}
                  onClick={() => setSiteFilter(site.id)}
                >
                  {site.name}
                </button>
              ))}
            </nav>
          )}
          <div className="field-controls">
            <label className="field-search">
              <Search size={18} />
              <input
                aria-label="Search field equipment"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Machine, building, address or tag"
              />
            </label>
            <select
              aria-label="Filter field status"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              {["All", "Operational", "Needs service", "Offline"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <div className="field-toggle">
              <button className={tab === "list" ? "active" : ""} onClick={() => setTab("list")}>
                List
              </button>
              <button className={tab === "map" ? "active" : ""} onClick={() => setTab("map")}>
                Map
              </button>
            </div>
          </div>
          {loading && mode === "cloud" ? (
            <div className="field-empty">
              <Loader2 size={25} className="spin" />
              Loading your workspace…
            </div>
          ) : tab === "map" && !planner ? (
            <div className="field-overview-map">
              <AssetMap
                assets={shown}
                selected={selected?.id || ""}
                onSelect={(id) => {
                  const a = assets.find((a) => a.id === id);
                  if (a) open(a);
                }}
                onPick={() => {}}
                focus={selected || shown[0] || null}
                picking={false}
              />
            </div>
          ) : shown.length ? (
            <div className="field-cards">
              {shown.map((a) => (
                <button key={a.id} className="field-card" onClick={() => open(a)}>
                  <div className="field-card-top">
                    <span className="field-card-icon">
                      <Wrench size={22} />
                    </span>
                    <span className={"badge " + a.status.replaceAll(" ", "-")}>{a.status}</span>
                  </div>
                  <h3>{a.name}</h3>
                  <p>
                    <Building2 size={15} />
                    {a.site}
                  </p>
                  <small>
                    {a.equipmentType || a.category}
                    {a.tag ? " · " + a.tag : ""}
                  </small>
                  <div className="field-card-bottom">
                    <MapPin size={15} />
                    {a.room || "Exact room not recorded"}
                    <span>Open →</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="field-empty">
              <MapPin size={32} />
              <h3>{assets.length ? "No matching equipment" : "Your first field record starts here."}</h3>
              <p>Add a business, zoom into its aerial view, then tap where the equipment is.</p>
              <button className="primary" onClick={start}>
                <Plus size={18} />
                Add equipment now
              </button>
            </div>
          )}
        </section>
        <footer className="field-footer">
          <details>
            <summary>Setup, backups & other tools</summary>
            <a href="/settings/maps">Maps setup</a>
            <button onClick={() => setAdvanced(true)}>
              <Settings2 size={16} />
              Full workspace · photos, QR & backups
            </button>
            <div>
              <button
                onClick={() => {
                  try {
                    downloadDeviceBackup();
                    setMessage("Device backup downloaded. Keep it somewhere safe.");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <Download size={16} />
                Export device backup
              </button>
              <label>
                Restore device backup
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      await importDeviceBackup(f);
                      refreshDevice();
                      setMode("device");
                      setMessage("Backup restored as new device records.");
                    } catch (err) {
                      setError((err as Error).message);
                    }
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <a href="/interior-demo">Try the sample room</a>
          </details>
        </footer>
        <nav className="field-bottom-nav" aria-label="Field shortcuts">
          <button
            onClick={() => {
              setTab("list");
              setSelected(null);
              document.querySelector(".field-content")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <Wrench size={20} />
            Inventory
          </button>
          <button className="field-nav-add" onClick={start} aria-label="Add equipment from toolbar">
            <Plus size={22} />
            Add equipment
          </button>
          <button onClick={start}>
            <Building2 size={20} />
            Buildings
          </button>
        </nav>
        {entry && (
          <div className="field-sheet-backdrop">
            <section
              className="field-sheet field-start-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Choose equipment storage"
            >
              <header>
                <h2>Where should we save it?</h2>
                <button
                  className="icon-button"
                  aria-label="Close storage options"
                  onClick={() => setEntry(false)}
                >
                  <X />
                </button>
              </header>
              <p>
                Cloud records need a signed-in account. You can record equipment on this device now, then
                explicitly sync later.
              </p>
              <a className="primary full" href={signIn} target="_top">
                <LogIn size={18} />
                Log in for cloud storage
              </a>
              <button
                className="secondary full"
                onClick={() => {
                  captureDevice();
                  setEntry(false);
                  setPlanner(true);
                }}
              >
                <Smartphone size={18} />
                Start device capture
              </button>
              <p className="muted small">
                Records and photos stay in this browser. Export a backup or sync when connected. Map imagery
                needs internet.
              </p>
            </section>
          </div>
        )}
        {selected && (
          <div className="field-sheet-backdrop">
            <section
              className="field-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Field equipment profile"
            >
              <header>
                <div>
                  <p className="eyebrow">
                    {mode === "device" ? "SAVED ON DEVICE" : "PRIVATE EQUIPMENT RECORD"}
                  </p>
                  <h2>{selected.name}</h2>
                </div>
                <button
                  className="icon-button"
                  aria-label="Close equipment profile"
                  disabled={busy}
                  onClick={leaveEdit}
                >
                  <X />
                </button>
              </header>
              {draft ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const a = serviceNote.trim()
                      ? {
                          ...draft,
                          history: [
                            { id: newId(), date: new Date().toISOString(), text: serviceNote.trim() },
                            ...draft.history,
                          ].slice(0, 200),
                        }
                      : draft;
                    void save(a);
                  }}
                >
                  <label className="field">
                    Equipment name
                    <input
                      required
                      maxLength={250}
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    Equipment type
                    <input
                      maxLength={250}
                      value={draft.equipmentType || ""}
                      onChange={(e) => setDraft({ ...draft, equipmentType: e.target.value })}
                    />
                  </label>
                  <div className="form-grid">
                    <label className="field">
                      Status
                      <select
                        value={draft.status}
                        onChange={(e) => setDraft({ ...draft, status: e.target.value as Asset["status"] })}
                      >
                        {["Operational", "Needs service", "Offline"].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Asset tag
                      <input
                        maxLength={250}
                        value={draft.tag}
                        onChange={(e) => setDraft({ ...draft, tag: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      Model
                      <input
                        maxLength={250}
                        value={draft.model}
                        onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      Serial
                      <input
                        maxLength={250}
                        value={draft.serial}
                        onChange={(e) => setDraft({ ...draft, serial: e.target.value })}
                      />
                    </label>
                  </div>
                  <label className="field">
                    Room / exact position
                    <input
                      maxLength={250}
                      value={draft.room}
                      onChange={(e) => setDraft({ ...draft, room: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    Repair / service note
                    <textarea
                      maxLength={2000}
                      value={serviceNote}
                      onChange={(e) => setServiceNote(e.target.value)}
                      placeholder="What did you fix today?"
                    />
                  </label>
                  <label className="field">
                    Equipment notes
                    <textarea
                      maxLength={5000}
                      value={draft.notes}
                      onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                    />
                  </label>
                  {
                    <label className="secondary field-photo">
                      <Camera size={18} />
                      Add / replace equipment photo
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        capture="environment"
                        disabled={busy}
                        onChange={(e) => {
                          if (e.target.files?.[0]) void photo(e.target.files[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  }
                  {draft.photos.find((p) => p.label === "Equipment") && (
                    <img
                      className="field-equipment-photo"
                      src={photoSource(draft.photos.find((p) => p.label === "Equipment")!.key)}
                      alt="Equipment photo ready to save"
                    />
                  )}
                  <div className="field-sheet-actions">
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        if (confirm("Discard unsaved changes?")) {
                          setDraft(null);
                          setServiceNote("");
                        }
                      }}
                    >
                      Cancel edit
                    </button>
                    <button className="primary" disabled={busy}>
                      {busy ? <Loader2 className="spin" size={17} /> : <Check size={17} />}Save equipment
                    </button>
                  </div>
                </form>
              ) : (
                <div>
                  <p className="field-profile-place">
                    <Building2 size={18} />
                    <b>{selected.site}</b>
                  </p>
                  <p className="muted">{selected.address}</p>
                  <dl className="field-profile-details">
                    <div>
                      <dt>Equipment</dt>
                      <dd>{selected.equipmentType || selected.category}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{selected.status}</dd>
                    </div>
                    <div>
                      <dt>Room / position</dt>
                      <dd>{selected.room || "Not recorded"}</dd>
                    </div>
                    <div>
                      <dt>Model / serial</dt>
                      <dd>
                        {selected.model || "—"} / {selected.serial || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Exact saved pin</dt>
                      <dd>
                        {selected.lat.toFixed(7)}, {selected.lng.toFixed(7)}
                      </dd>
                    </div>
                  </dl>
                  <p className="note-text">{selected.notes}</p>
                  {selected.photos.map(({ label, key }) => (
                    <img
                      key={key}
                      className="field-equipment-photo"
                      src={photoSource(key)}
                      alt={label ? `${label} photo` : "Saved equipment photo"}
                      loading="lazy"
                    />
                  ))}
                  <div className="field-sheet-actions">
                    <button
                      className="primary"
                      onClick={() => {
                        setDraft(structuredClone(selected));
                        setServiceNote("");
                      }}
                    >
                      <Wrench size={18} />
                      Update / repair notes
                    </button>
                    <a
                      className="secondary"
                      href={
                        "https://www.google.com/maps/dir/?api=1&destination=" +
                        encodeURIComponent(selected.lat + "," + selected.lng)
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Navigation size={17} />
                      Directions
                    </a>
                  </div>
                  <div className="field-history">
                    {selected.history.slice(0, 10).map((h) => (
                      <article key={h.id}>
                        <small>{new Date(h.date).toLocaleString()}</small>
                        <p>{h.text}</p>
                      </article>
                    ))}
                  </div>
                </div>
              )}
              {error && (
                <p className="field-alert" role="alert">
                  {error}
                </p>
              )}
            </section>
          </div>
        )}
      </div>
      {planner && (
        <InventoryPlanner
          assets={assets}
          owner={sessionOwner(mode, session?.user?.id)}
          storage={mode === "device" ? deviceStorage : undefined}
          onSaved={(a) => {
            if (mode === "device") refreshDevice();
            else setCloud((prev) => [a, ...prev.filter((x) => x.id !== a.id)]);
          }}
          onClose={(summary) => {
            setPlanner(false);
            refreshDevice();
            if (summary?.saved)
              setMessage(
                `${summary.saved} ${summary.saved === 1 ? "machine" : "machines"} saved${summary.building ? " at " + summary.building : ""}${mode === "device" ? " on this device" : " to your account"}.`,
              );
          }}
        />
      )}
    </main>
  );
}
