"use client";
import { useEffect, useRef, useState } from "react";
import { isBuildingPin } from "../lib/building-pin";
import type { Point } from "../lib/building-outline";
import type { Asset } from "../lib/asset";
import type * as Leaflet from "leaflet";
import { Plus, Minus, Layers, LocateFixed } from "lucide-react";
type View = { lat: number; lng: number; zoom?: number };
export default function AssetMap({
  assets,
  selected,
  onSelect,
  onPick,
  focus,
  picking,
  onViewChange,
  editablePinId,
  buildingOutline,
  pickLabel,
}: {
  assets: Asset[];
  selected: string;
  onSelect: (id: string) => void;
  onPick: (lat: number, lng: number) => void;
  focus: View | null;
  picking: boolean;
  onViewChange?: (v: { lat: number; lng: number; zoom: number }) => void;
  topDown?: boolean;
  editablePinId?: string;
  buildingOutline?: Point[];
  pickLabel?: string;
}) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<Leaflet.Map | null>(null),
    engine = useRef<typeof Leaflet | null>(null),
    markers = useRef<Leaflet.LayerGroup | null>(null),
    tiles = useRef<Leaflet.TileLayer | null>(null);
  const callbacks = useRef({ onSelect, onPick, picking, onViewChange });
  callbacks.current = { onSelect, onPick, picking, onViewChange };
  const [ready, setReady] = useState(false),
    [street, setStreet] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    let resize: ResizeObserver | undefined;
    import("leaflet")
      .then((L) => {
        if (stopped || !host.current) return;
        engine.current = L;
        const m = L.map(host.current, {
          zoomControl: false,
          attributionControl: true,
          zoomAnimation: false,
          fadeAnimation: false,
          markerZoomAnimation: false,
          maxZoom: 22,
          minZoom: 2,
        }).setView([41.5868, -93.625], 14);
        map.current = m;
        tiles.current = L.tileLayer(
          "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            maxNativeZoom: 19,
            maxZoom: 22,
            keepBuffer: 1,
            updateWhenIdle: true,
            attribution:
              "Powered by Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
          },
        ).addTo(m);
        tiles.current.on("tileerror", () =>
          setError(
            "Some imagery could not load. Switch to street map or retry later; saved pins are retained.",
          ),
        );
        markers.current = L.layerGroup().addTo(m);
        m.on("click", (e) => {
          if (callbacks.current.picking) callbacks.current.onPick(e.latlng.lat, e.latlng.lng);
        });
        const report = () => {
          const c = m.getCenter();
          callbacks.current.onViewChange?.({
            lat: c.lat,
            lng: c.lng,
            zoom: Math.max(
              30,
              (Math.cos((c.lat * Math.PI) / 180) * 40075016 * m.getSize().y) /
                (256 * Math.pow(2, m.getZoom())),
            ),
          });
        };
        m.on("moveend", report);
        resize = new ResizeObserver(() => m.invalidateSize({ pan: false }));
        resize.observe(host.current);
        setReady(true);
      })
      .catch(() => setError("Map could not load. Your records are still available in Inventory."));
    return () => {
      stopped = true;
      resize?.disconnect();
      map.current?.remove();
      map.current = null;
      markers.current = null;
    };
  }, []);
  useEffect(() => {
    if (!ready || !engine.current || !map.current || !markers.current) return;
    const L = engine.current;
    markers.current.clearLayers();
    assets.forEach((a) => {
      const building = isBuildingPin(a);
      const color = building
        ? "#3675cf"
        : a.status === "Needs service"
          ? "#d9a64c"
          : a.status === "Offline"
            ? "#8d989c"
            : "#bce87a";
      const marker = L.marker([a.lat, a.lng], {
        icon: L.divIcon({
          className:
            "equipment-map-marker" +
            (building ? " building-map-marker" : "") +
            (a.id === selected ? " chosen" : ""),
          html: `<span style="background:${color}"></span>`,
          iconSize: [28, 36],
          iconAnchor: [14, 34],
        }),
        keyboard: true,
        bubblingMouseEvents: false,
        title: building ? "Building pin: " + a.name : a.name || "New equipment spot",
        draggable: a.id === editablePinId,
        zIndexOffset: building ? -100 : a.id === selected ? 1000 : 0,
      });
      const label = document.createElement("span");
      label.textContent = a.tag || a.name || "New spot";
      marker.bindTooltip(label, { direction: "top", offset: [0, -30], permanent: assets.length < 35 });
      marker.on("click", () => {
        callbacks.current.onSelect(a.id);
      });
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        callbacks.current.onPick(p.lat, p.lng);
      });
      marker.addTo(markers.current!);
    });
  }, [assets, selected, ready, editablePinId]);
  useEffect(() => {
    if (!ready || !engine.current || !map.current || !buildingOutline?.length) return;
    const L = engine.current,
      m = map.current;
    const polygon = L.polygon(
      buildingOutline.map((p) => [p.lat, p.lng] as [number, number]),
      { color: "#22c55e", weight: 3, fillColor: "#22c55e", fillOpacity: 0.15, interactive: false },
    ).addTo(m);
    return () => {
      polygon.remove();
    };
  }, [ready, buildingOutline]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !focus) return;
    const height = Math.max(30, focus.zoom || 1800);
    const z = Math.log2(
      (Math.cos((focus.lat * Math.PI) / 180) * 40075016 * Math.max(300, m.getSize().y)) / (256 * height),
    );
    m.setView([focus.lat, focus.lng], Math.max(2, Math.min(22, Math.round(z))), { animate: false });
  }, [focus, ready]);
  function switchLayer() {
    if (!engine.current || !map.current) return;
    const L = engine.current;
    tiles.current?.remove();
    const url = street
      ? "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      : "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
    tiles.current = L.tileLayer(url, {
      maxNativeZoom: 19,
      maxZoom: 22,
      keepBuffer: 1,
      updateWhenIdle: true,
      attribution: street
        ? "Powered by Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
        : '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    }).addTo(map.current);
    tiles.current.on("tileerror", () =>
      setError("Map tiles are unavailable. Saved coordinates are still retained."),
    );
    setStreet(!street);
    setError("");
  }
  return (
    <div className={"map-shell lightweight-map " + (picking ? "picking" : "")}>
      <link rel="stylesheet" href="/leaflet/leaflet.css" />
      <div className="globe" ref={host} />
      <div className="map-label">
        <span className="live-dot" />
        {picking ? pickLabel || "TAP TO PLACE EQUIPMENT" : "BIRD’S-EYE LOCATION WORKSPACE"}
        <small>{street ? "Street map" : "Aerial imagery"} · saved equipment locations</small>
      </div>
      <div className="map-tools">
        <button aria-label="Zoom in" onClick={() => map.current?.zoomIn()}>
          <Plus size={19} />
        </button>
        <button aria-label="Zoom out" onClick={() => map.current?.zoomOut()}>
          <Minus size={19} />
        </button>
        <button aria-label="Switch satellite / street" onClick={switchLayer}>
          <Layers size={18} />
        </button>
        <button
          aria-label="Fit all assets"
          onClick={() => {
            if (assets.length && engine.current)
              map.current?.fitBounds(engine.current.latLngBounds(assets.map((a) => [a.lat, a.lng])), {
                padding: [65, 100],
                maxZoom: 19,
                animate: false,
              });
          }}
        >
          <LocateFixed size={19} />
        </button>
      </div>
      {error && (
        <div className="map-error" role="status">
          {error}
          <button aria-label="Dismiss map warning" onClick={() => setError("")}>
            {" "}
            ×
          </button>
        </div>
      )}
      <div className="map-footnote">STV Locate · Lightweight aerial map</div>
    </div>
  );
}
