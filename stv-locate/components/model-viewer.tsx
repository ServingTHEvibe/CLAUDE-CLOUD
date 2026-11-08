"use client";
import { useEffect, useRef, useState } from "react";
import type * as Three from "three";
import type { Asset } from "../lib/asset";
import type { Location } from "../lib/location";

type Point = { x: number; y: number; z: number };
type Props = { location: Location; assets: Asset[]; save: (location: Location) => Promise<void> };

export default function ModelViewer(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  live.current = props;
  const choice = useRef("");
  const markers = useRef<Three.Group | null>(null);
  const markerScale = useRef(0.1);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState("");
  const working = useRef(false);
  const [identified, setIdentified] = useState("");
  const view = useRef<{ orbit: any; camera: Three.PerspectiveCamera } | null>(null);
  const key = props.location.interior?.model?.key;
  const pins = props.location.interior?.modelPins || [];

  useEffect(() => {
    let disposed = false,
      frame = 0;
    let renderer: Three.WebGLRenderer | undefined, scene: Three.Scene | undefined;
    let controls: { dispose: () => void; update: () => void } | undefined;
    let resize: ResizeObserver | undefined;
    const abort = new AbortController();
    setReady(false);
    setError("");
    async function boot() {
      try {
        const [T, { GLTFLoader }, { OrbitControls }] = await Promise.all([
          import("three"),
          import("three/addons/loaders/GLTFLoader.js"),
          import("three/addons/controls/OrbitControls.js"),
        ]);
        const response = await fetch("/api/models?key=" + encodeURIComponent(key || ""), {
          signal: abort.signal,
        });
        if (!response.ok) throw Error("The saved model could not load. Sign in and retry.");
        const buffer = await response.arrayBuffer();
        const gltf = await new GLTFLoader().parseAsync(buffer, "");
        if (disposed) return;
        scene = new T.Scene();
        scene.background = new T.Color("#eef1e9");
        scene.add(gltf.scene);
        scene.add(new T.HemisphereLight(0xffffff, 0x405349, 2.5));
        const light = new T.DirectionalLight(0xffffff, 3);
        light.position.set(5, 10, 7);
        scene.add(light);
        const bounds = new T.Box3().setFromObject(gltf.scene),
          center = bounds.getCenter(new T.Vector3()),
          size = bounds.getSize(new T.Vector3());
        if (
          bounds.isEmpty() ||
          ![center.x, center.y, center.z, size.x, size.y, size.z].every(Number.isFinite)
        )
          throw Error("This model has no visible geometry.");
        const span = Math.max(size.x, size.y, size.z, 0.1);
        const camera = new T.PerspectiveCamera(45, 1, span / 1000, span * 1000);
        camera.position.copy(center).add(new T.Vector3(span, span * 0.8, span));
        renderer = new T.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
        renderer.outputColorSpace = T.SRGBColorSpace;
        const orbit = new OrbitControls(camera, renderer.domElement);
        controls = orbit;
        orbit.target.copy(center);
        view.current = { orbit, camera };
        orbit.enableDamping = true;
        orbit.minDistance = span * 0.02;
        orbit.maxDistance = span * 10;
        host.current!.appendChild(renderer.domElement);
        markers.current = new T.Group();
        scene.add(markers.current);
        markerScale.current = span * 0.012;
        const fit = () => {
          if (!host.current || !renderer) return;
          const width = host.current.clientWidth,
            height = host.current.clientHeight;
          renderer.setSize(width, height);
          camera.aspect = width / Math.max(height, 1);
          camera.updateProjectionMatrix();
        };
        resize = new ResizeObserver(fit);
        resize.observe(host.current!);
        fit();
        let down = { x: 0, y: 0 };
        renderer.domElement.addEventListener("pointerdown", (event) => {
          down = { x: event.clientX, y: event.clientY };
        });
        renderer.domElement.addEventListener("pointerup", async (event) => {
          if (working.current || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
          const rect = renderer!.domElement.getBoundingClientRect();
          const ray = new T.Raycaster();
          ray.setFromCamera(
            new T.Vector2(
              ((event.clientX - rect.left) / rect.width) * 2 - 1,
              -((event.clientY - rect.top) / rect.height) * 2 + 1,
            ),
            camera,
          );
          if (!choice.current) {
            // Identify a saved machine marker.
            const marker = markers.current ? ray.intersectObject(markers.current, true)[0] : undefined;
            setIdentified((marker?.object.userData.assetId as string) || "");
            return;
          }
          const hit = ray.intersectObject(gltf.scene, true)[0];
          if (!hit) return;
          const assetId = choice.current,
            location = live.current.location;
          const point: Point = { x: hit.point.x, y: hit.point.y, z: hit.point.z };
          working.current = true;
          setBusy(true);
          setError("");
          try {
            await live.current.save({
              ...location,
              interior: {
                notes: "",
                photos: [],
                ...location.interior,
                modelPins: [
                  ...(location.interior?.modelPins || []).filter((pin) => pin.assetId !== assetId),
                  { assetId, ...point },
                ],
              },
            });
            choice.current = "";
            setSelected("");
          } catch (error) {
            setError((error as Error).message);
          } finally {
            working.current = false;
            setBusy(false);
          }
        });
        const render = () => {
          if (disposed) return;
          orbit.update();
          renderer!.render(scene!, camera);
          frame = requestAnimationFrame(render);
        };
        render();
        setReady(true);
      } catch (error) {
        if (!disposed) setError((error as Error).message || "3D is unavailable on this device.");
      }
    }
    if (key) void boot();
    return () => {
      disposed = true;
      abort.abort();
      cancelAnimationFrame(frame);
      resize?.disconnect();
      controls?.dispose();
      scene?.traverse((object) => {
        const mesh = object as Three.Mesh;
        mesh.geometry?.dispose();
        for (const material of Array.isArray(mesh.material)
          ? mesh.material
          : mesh.material
            ? [mesh.material]
            : []) {
          for (const value of Object.values(material))
            if ((value as Three.Texture)?.isTexture) (value as Three.Texture).dispose();
          material.dispose();
        }
      });
      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer?.domElement.remove();
      markers.current = null;
    };
  }, [key]);

  useEffect(() => {
    let cancelled = false;
    void import("three").then((T) => {
      if (cancelled || !markers.current) return;
      const group = markers.current;
      for (const marker of [...group.children]) {
        group.remove(marker);
        const mesh = marker as Three.Mesh;
        mesh.geometry.dispose();
        (mesh.material as Three.Material).dispose();
      }
      for (const pin of pins) {
        const chosen = pin.assetId === identified;
        const marker = new T.Mesh(
          new T.SphereGeometry(markerScale.current * (chosen ? 1.6 : 1), 12, 8),
          new T.MeshBasicMaterial({ color: chosen ? 0x2f7fe0 : 0xd29b42, depthTest: false }),
        );
        marker.userData.assetId = pin.assetId;
        marker.position.set(pin.x, pin.y, pin.z);
        marker.renderOrder = 5;
        group.add(marker);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ready, props.location.interior?.modelPins, identified]);
  const named = (id: string) => props.assets.find((a) => a.id === id);
  const shown = identified ? named(identified) : undefined;
  function showMarker(id: string) {
    setIdentified(id);
    const pin = pins.find((p) => p.assetId === id);
    if (pin && view.current) {
      view.current.orbit.target.set(pin.x, pin.y, pin.z);
      view.current.orbit.update();
    }
  }

  return (
    <section className="saved-model" aria-label="Saved 3D location">
      <div className="saved-model-canvas" ref={host} />
      {!ready && !error && <p role="status">Loading your saved 3D location…</p>}
      <label className="field">
        Mark equipment in this model
        <select
          disabled={!ready || busy}
          value={selected}
          onChange={(event) => {
            choice.current = event.target.value;
            setSelected(event.target.value);
          }}
        >
          <option value="">Choose a machine</option>
          {props.assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name} · {asset.room || "Area not named"}
            </option>
          ))}
        </select>
      </label>
      <p>
        {busy
          ? "Saving indoor marker…"
          : selected
            ? "Tap the machine or its position in the model to save its marker."
            : "Drag to look around. Pinch or scroll to zoom. Equipment markers are saved separately from GPS pins."}
      </p>
      {shown && (
        <p className="model-identified" role="status">
          <b>{shown.name}</b> · {shown.equipmentType || shown.category} · {shown.room || "Area not named"}
          {shown.floor ? " · Floor " + shown.floor : ""}
        </p>
      )}
      {pins.length > 0 && (
        <div className="model-marked">
          <small>Marked in this model (tap a marker, or a name to find it):</small>
          {pins.map((p) => (
            <button
              key={p.assetId}
              type="button"
              className="fp-btn small"
              onClick={() => showMarker(p.assetId)}
            >
              {named(p.assetId)?.name || "Removed machine"}
            </button>
          ))}
        </div>
      )}
      <small>{pins.length} equipment markers saved · Model dimensions depend on the uploaded file.</small>
      {error && <p role="alert">{error}</p>}
      <a href={"/api/models?key=" + encodeURIComponent(key || "")} download>
        Download saved GLB
      </a>
    </section>
  );
}
