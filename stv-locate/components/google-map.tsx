"use client";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import type AerialMap from "./asset-map";
import { isBuildingPin } from "../lib/building-pin";
import { loadGoogleMaps, mapZoom, mapHeight } from "../lib/google-maps";
type Props = ComponentProps<typeof AerialMap> & {
  apiKey: string;
  threeD: boolean;
  onUnavailable: () => void;
};
export default function GoogleMap(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<any>(null),
    library = useRef<any>(null),
    markers = useRef<any[]>([]),
    callbacks = useRef(props);
  callbacks.current = props;
  const [ready, setReady] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    const cleanups: (() => void)[] = [];
    setReady(false);
    setError("");
    const fail = () => {
      if (!disposed) {
        setError("Google Maps could not load. Check your key, billing, website restriction and connection.");
        if (props.threeD) callbacks.current.onUnavailable();
      }
    };
    window.addEventListener("stv-google-auth-error", fail);
    cleanups.push(() => window.removeEventListener("stv-google-auth-error", fail));
    async function boot() {
      try {
        const g = await loadGoogleMaps(props.apiKey);
        const lib = await g.importLibrary(props.threeD ? "maps3d" : "maps");
        if (disposed) return;
        const markerLib = await g.importLibrary("marker");
        if (disposed) return;
        library.current = { ...g, ...lib, ...markerLib };
        const focus = callbacks.current.focus || { lat: 41.5868, lng: -93.625, zoom: 9000 };
        if (props.threeD) {
          const m = new lib.Map3DElement({
            center: { lat: focus.lat, lng: focus.lng },
            range: Math.max(9000, focus.zoom || 1800),
            tilt: callbacks.current.topDown ? 0 : 45,
            heading: 0,
            mode: "HYBRID",
            gestureHandling: "COOPERATIVE",
          });
          m.style.width = "100%";
          m.style.height = "100%";
          host.current!.append(m);
          map.current = m;
          const click = (e: any) => {
            const p = e.position;
            if (callbacks.current.picking && p && Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
              e.preventDefault();
              callbacks.current.onPick(p.lat, p.lng);
            }
          };
          const moved = () => {
            const c = m.center;
            if (c)
              callbacks.current.onViewChange?.({
                lat: c.lat,
                lng: c.lng,
                zoom: Math.max(30, Math.min(20000000, m.range || 1800)),
              });
          };
          m.addEventListener("gmp-click", click);
          m.addEventListener("gmp-error", fail);
          m.addEventListener("gmp-centerchange", moved);
          m.addEventListener("gmp-rangechange", moved);
          cleanups.push(() => {
            m.removeEventListener("gmp-click", click);
            m.removeEventListener("gmp-error", fail);
            m.removeEventListener("gmp-centerchange", moved);
            m.removeEventListener("gmp-rangechange", moved);
            m.remove();
          });
        } else {
          const m = new lib.Map(host.current, {
            center: { lat: focus.lat, lng: focus.lng },
            zoom: mapZoom(focus.zoom, focus.lat),
            mapTypeId: "satellite",
            mapTypeControl: true,
            mapTypeControlOptions: { position: g.ControlPosition?.RIGHT_TOP },
            streetViewControl: false,
            fullscreenControl: false,
            tilt: 0,
            clickableIcons: false,
            gestureHandling: "cooperative",
          });
          map.current = m;
          const clicked = m.addListener("click", (e: any) => {
            if (callbacks.current.picking && e.latLng)
              callbacks.current.onPick(e.latLng.lat(), e.latLng.lng());
          });
          const moved = m.addListener("idle", () => {
            const c = m.getCenter();
            if (c)
              callbacks.current.onViewChange?.({
                lat: c.lat(),
                lng: c.lng(),
                zoom: mapHeight(m.getZoom() || 18, c.lat()),
              });
          });
          cleanups.push(() => {
            clicked.remove();
            moved.remove();
            g.event.clearInstanceListeners(m);
          });
        }
        setReady(true);
      } catch {
        fail();
      }
    }
    void boot();
    return () => {
      disposed = true;
      markers.current.forEach((m) => (m.setMap ? m.setMap(null) : m.remove()));
      markers.current = [];
      cleanups.forEach((f) => f());
      map.current = null;
    };
  }, [props.apiKey, props.threeD]);
  useEffect(() => {
    if (!ready || !map.current) return;
    const lib = library.current,
      m = map.current;
    markers.current.forEach((x) => (x.setMap ? x.setMap(null) : x.remove()));
    markers.current = [];
    props.assets.forEach((a) => {
      const building = isBuildingPin(a);
      if (props.threeD) {
        const Marker = lib.Marker3DInteractiveElement || lib.MarkerInteractiveElement;
        if (!Marker) return;
        const marker = new Marker({
          position: { lat: a.lat, lng: a.lng },
          altitudeMode: "CLAMP_TO_GROUND",
          label: building ? "Building · " + a.name : a.tag || a.name,
          title: building ? "Building pin: " + a.name : a.name,
          drawsWhenOccluded: true,
        });
        marker.addEventListener("gmp-click", (e: Event) => {
          e.stopPropagation();
          callbacks.current.onSelect(a.id);
        });
        if (building && lib.PinElement)
          marker.append(
            new lib.PinElement({
              background: "#3675cf",
              borderColor: "#ffffff",
              glyphText: "B",
              glyphColor: "#ffffff",
            }),
          );
        m.append(marker);
        markers.current.push(marker);
      } else {
        const marker = new lib.Marker({
          map: m,
          position: { lat: a.lat, lng: a.lng },
          title: building ? "Building pin: " + a.name : a.name,
          icon: building
            ? {
                path: "M 0,-16 L 13,0 L 0,16 L -13,0 Z",
                fillColor: "#3675cf",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 3,
              }
            : undefined,
          label: {
            text: building ? "B" : a.tag || a.name,
            color: building ? "#ffffff" : "#173d32",
            fontWeight: "700",
          },
          draggable: a.id === props.editablePinId,
          zIndex: building ? 0 : a.id === props.selected ? 100 : 1,
        });
        marker.addListener("click", () => {
          callbacks.current.onSelect(a.id);
        });
        marker.addListener("dragend", (e: any) => {
          if (e.latLng) callbacks.current.onPick(e.latLng.lat(), e.latLng.lng());
        });
        markers.current.push(marker);
      }
    });
  }, [props.assets, props.selected, ready, props.threeD, props.editablePinId]);
  useEffect(() => {
    if (!ready || !map.current || !props.buildingOutline?.length) return;
    const lib = library.current,
      m = map.current;
    let shape: any;
    if (props.threeD) {
      if (!lib.Polygon3DElement) return;
      shape = new lib.Polygon3DElement({
        altitudeMode: "CLAMP_TO_GROUND",
        fillColor: "#22c55e26",
        strokeColor: "#22c55e",
        strokeWidth: 3,
        drawsOccludedSegments: true,
      });
      shape.outerCoordinates = props.buildingOutline;
      m.append(shape);
    } else {
      shape = new lib.Polygon({
        map: m,
        paths: props.buildingOutline,
        strokeColor: "#22c55e",
        strokeWeight: 3,
        fillColor: "#22c55e",
        fillOpacity: 0.15,
        clickable: false,
      });
    }
    return () => {
      if (shape.setMap) shape.setMap(null);
      else shape.remove();
    };
  }, [ready, props.threeD, props.buildingOutline]);
  useEffect(() => {
    const u = props.userPosition;
    if (!ready || !map.current || !u || props.threeD) return;
    const lib = library.current;
    if (!lib.Circle || !lib.Marker) return;
    const circle = new lib.Circle({
      map: map.current,
      center: { lat: u.lat, lng: u.lng },
      radius: Math.min(u.accuracy || 0, 2000),
      strokeColor: "#2f7fe0",
      strokeWeight: 1,
      fillColor: "#2f7fe0",
      fillOpacity: 0.12,
      clickable: false,
    });
    const dot = new lib.Marker({
      map: map.current,
      position: { lat: u.lat, lng: u.lng },
      title: "You are here (GPS)",
      clickable: false,
      zIndex: 1000,
      icon: {
        path: 0,
        scale: 8,
        fillColor: "#2f7fe0",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 3,
      },
    });
    return () => {
      circle.setMap(null);
      dot.setMap(null);
    };
  }, [ready, props.threeD, props.userPosition]);
  useEffect(() => {
    if (!ready || !props.focus || !map.current) return;
    const f = props.focus,
      m = map.current;
    if (props.threeD) {
      m.flyCameraTo({
        endCamera: {
          center: { lat: f.lat, lng: f.lng },
          altitudeMode: "CLAMP_TO_GROUND",
          range: f.zoom || 1800,
          tilt: props.topDown ? 0 : 45,
          heading: 0,
        },
        durationMillis: 0,
      });
    } else {
      m.setCenter({ lat: f.lat, lng: f.lng });
      m.setZoom(mapZoom(f.zoom, f.lat));
    }
  }, [props.focus, ready, props.threeD]);
  useEffect(() => {
    if (ready && props.threeD && props.picking && map.current) map.current.tilt = 0;
  }, [ready, props.threeD, props.picking]);
  return (
    <div className={"map-shell google-map " + (props.picking ? "picking" : "")}>
      <div
        className="globe"
        ref={host}
        aria-label={
          props.threeD ? "Google photorealistic 3D equipment map" : "Google satellite equipment map"
        }
      />
      {!ready && !error && (
        <div className="google-loading" role="status">
          Connecting to Google Maps…
        </div>
      )}
      <div className="map-label">
        {props.picking
          ? props.pickLabel || "TAP TO PLACE EQUIPMENT"
          : props.threeD
            ? "GOD’S EYE · GOOGLE 3D"
            : "GOOGLE SATELLITE"}
        <small>
          {props.threeD
            ? "Photorealistic buildings where Google has coverage"
            : "Check the roof before saving your pin"}
        </small>
      </div>
      {error && (
        <div className="google-map-error" role="alert">
          {error} <a href="/settings/maps">Open Maps setup</a>
        </div>
      )}
    </div>
  );
}
