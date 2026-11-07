"use client";
import { useEffect, useRef, useState } from "react";
import type { InteriorLayout } from "../lib/interior-layout";
import { layoutBounds, pinPosition } from "../lib/interior-layout";
import type { Asset } from "../lib/asset";

type Props = {
  layout: InteriorLayout;
  assets: Asset[];
  progress: number;
  roomId: string;
  onSelect: (id: string) => void;
  onUnavailable: () => void;
};
export default function InteriorScene(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    live = useRef(props);
  live.current = props;
  const [error, setError] = useState(""),
    [compatibility, setCompatibility] = useState(false);
  useEffect(() => {
    type Renderer = {
      domElement: HTMLElement | SVGElement;
      setSize: (w: number, h: number) => void;
      render: (s: import("three").Scene, c: import("three").Camera) => void;
      dispose?: () => void;
      forceContextLoss?: () => void;
    };
    let disposed = false,
      frame = 0,
      needsRender = true,
      resize: ResizeObserver | undefined,
      renderer: Renderer | undefined,
      scene: import("three").Scene | undefined,
      compatible = false;
    const cleanups: (() => void)[] = [];
    async function boot() {
      try {
        const T = await import("three");
        if (disposed || !host.current) return;
        try {
          const gpu = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
          gpu.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
          gpu.outputColorSpace = T.SRGBColorSpace;
          gpu.toneMapping = T.ACESFilmicToneMapping;
          gpu.toneMappingExposure = 1.3;
          renderer = gpu;
        } catch {
          const { SVGRenderer } = await import("three/addons/renderers/SVGRenderer.js");
          if (disposed) return;
          const svgRenderer = new SVGRenderer();
          svgRenderer.setQuality("low");
          svgRenderer.setPrecision(2);
          renderer = svgRenderer;
          compatible = true;
          setCompatibility(true);
        }
        renderer.domElement.setAttribute("aria-label", "Interactive 3D interior");
        renderer.domElement.setAttribute("role", "img");
        host.current.appendChild(renderer.domElement);
        scene = new T.Scene();
        scene.background = new T.Color("#e8e4d8");
        scene.fog = new T.Fog("#e8e4d8", 1000, 4000);
        const camera = new T.PerspectiveCamera(43, 1, 0.08, 5000),
          bounds = layoutBounds(props.layout),
          cx = bounds.width / 2,
          cz = bounds.depth / 2,
          span = Math.max(bounds.width, bounds.depth, 8);
        scene.add(new T.HemisphereLight("#fff9e9", "#6b776c", 2.3));
        if (compatible) scene.add(new T.AmbientLight("#ffffff", 0.78));
        const sun = new T.DirectionalLight("#ffe8c1", compatible ? 0.55 : 3.2);
        sun.position.set(-8, 14, -10);
        scene.add(sun);
        const walls: import("three").Mesh[] = [],
          materials: import("three").MeshStandardMaterial[] = [],
          pickable: import("three").Object3D[] = [];
        const ground = new T.Mesh(
          new T.PlaneGeometry(
            Math.max(bounds.width, bounds.depth) * 6 + 40,
            Math.max(bounds.width, bounds.depth) * 6 + 40,
          ),
          new T.MeshStandardMaterial({ color: "#d5d3c5", roughness: 1 }),
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.14;
        scene.add(ground);
        function box(
          w: number,
          h: number,
          d: number,
          x: number,
          y: number,
          z: number,
          color: string,
          metalness = 0,
        ) {
          const mesh = new T.Mesh(
            new T.BoxGeometry(w, h, d),
            new T.MeshStandardMaterial({ color, roughness: metalness ? 0.3 : 0.72, metalness }),
          );
          mesh.position.set(x, y, z);
          scene!.add(mesh);
          return mesh;
        }
        props.layout.rooms.forEach((r, index) => {
          const tint = r.finish === "oak" ? "#b18a61" : r.finish === "sage" ? "#a4b1a0" : "#ccc4b3";
          const floor = box(r.width, 0.13, r.depth, r.x + r.width / 2, -0.065, r.z + r.depth / 2, tint);
          materials.push(floor.material as import("three").MeshStandardMaterial);
          // Thin floor inlay keeps rooms readable even in plan view.
          for (let x = 0.45; x < r.width; x += Math.max(0.6, r.width / (compatible ? 6 : 30)))
            box(
              0.014,
              0.006,
              r.depth - 0.1,
              r.x + x,
              0.007,
              r.z + r.depth / 2,
              r.finish === "oak" ? "#876b4d" : "#b5b6a7",
            );
          function wall(w: number, d: number, x: number, z: number, h = r.height, y = h / 2) {
            const mesh = box(w, h, d, x, y, z, "#f0ebdd");
            mesh.userData.baseHeight = h;
            mesh.userData.baseY = y;
            walls.push(mesh);
            materials.push(mesh.material as import("three").MeshStandardMaterial);
          }
          // Doorways in front and rear walls remain open at walking height.
          const side = (r.width - 1.4) / 2;
          for (const z of [r.z, r.z + r.depth]) {
            wall(side, 0.16, r.x + side / 2, z);
            wall(side, 0.16, r.x + r.width - side / 2, z);
            const door = Math.min(2.2, r.height - 0.1);
            wall(1.4, 0.16, r.x + r.width / 2, z, r.height - door, door + (r.height - door) / 2);
          }
          wall(0.16, r.depth, r.x, r.z + r.depth / 2);
          wall(0.16, r.depth, r.x + r.width, r.z + r.depth / 2);
          // Window panel and a recessed equipment counter provide scale without inventing a survey.
          box(0.04, 1.2, r.depth * 0.38, r.x + 0.11, 1.7, r.z + r.depth * 0.52, "#a9c2bd", 0.25);
          box(1.1, 0.78, r.depth * 0.34, r.x + r.width - 1.0, 0.39, r.z + r.depth * 0.5, "#40584c");
          box(1.25, 0.09, r.depth * 0.36, r.x + r.width - 1.0, 0.83, r.z + r.depth * 0.5, "#ded9ca");
          if (index === 1) {
            box(2, 0.12, 1.05, r.x + 2, 0.85, r.z + r.depth * 0.52, "#855f40");
            for (const dx of [-0.7, 0.7])
              for (const dz of [-0.3, 0.3])
                box(0.07, 0.8, 0.07, r.x + 2 + dx, 0.4, r.z + r.depth * 0.52 + dz, "#333d34");
          }
          const pot = box(0.48, 0.55, 0.48, r.x + 0.7, 0.275, r.z + r.depth - 0.7, "#b88665");
          const leaves = new T.Mesh(
            new T.IcosahedronGeometry(0.52, 1),
            new T.MeshStandardMaterial({ color: "#507751", roughness: 0.95 }),
          );
          leaves.position.set(pot.position.x, 0.9, pot.position.z);
          scene!.add(leaves);
        });
        [
          ...props.layout.pins.filter((p) => !props.layout.planPins?.some((pp) => pp.assetId === p.assetId)),
          ...(props.layout.planPins || []).flatMap((p) => {
            const r = props.layout.rooms.find(
              (r) => p.x >= r.x && p.x <= r.x + r.width && p.z >= r.z && p.z <= r.z + r.depth,
            );
            return r
              ? [{ assetId: p.assetId, roomId: r.id, x: (p.x - r.x) / r.width, z: (p.z - r.z) / r.depth }]
              : [];
          }),
        ].forEach((pin) => {
          const a = props.assets.find((a) => a.id === pin.assetId),
            p = pinPosition(props.layout, pin);
          if (!a || !p) return;
          const color =
            a.status === "Needs service" ? "#d69c46" : a.status === "Offline" ? "#7b8580" : "#1e6652";
          const machine = new T.Group();
          machine.userData.assetId = a.id;
          const body = new T.Mesh(
            new T.BoxGeometry(0.78, 1.65, 0.72),
            new T.MeshStandardMaterial({ color: "#203d36", metalness: 0.35, roughness: 0.38 }),
          );
          body.position.y = 0.825;
          machine.add(body);
          const front = new T.Mesh(
            new T.BoxGeometry(0.65, 1.14, 0.03),
            new T.MeshStandardMaterial({ color: "#8db8ad", metalness: 0.25, roughness: 0.2 }),
          );
          front.position.set(0, 0.99, -0.38);
          machine.add(front);
          const shelfMaterial = new T.MeshStandardMaterial({ color: "#d8c491" });
          for (let row = 0; row < 3; row++)
            for (let col = 0; col < 3; col++) {
              const item = new T.Mesh(new T.BoxGeometry(0.12, 0.16, 0.03), shelfMaterial);
              item.position.set((col - 1) * 0.2, 0.65 + row * 0.3, -0.405);
              machine.add(item);
            }
          const marker = new T.Mesh(
            new T.SphereGeometry(0.16, 16, 12),
            new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 }),
          );
          marker.position.y = 2.05;
          machine.add(marker);
          machine.position.set(p.x, 0, p.z);
          scene!.add(machine);
          pickable.push(machine);
        });
        const raycaster = new T.Raycaster(),
          pointer = new T.Vector2();
        let down = { x: 0, y: 0 };
        const pointerDown = (e: PointerEvent) => {
          down = { x: e.clientX, y: e.clientY };
        };
        const click = (e: PointerEvent) => {
          if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
          const rect = renderer!.domElement.getBoundingClientRect();
          pointer.set(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            (-(e.clientY - rect.top) / rect.height) * 2 + 1,
          );
          raycaster.setFromCamera(pointer, camera);
          const hit = raycaster.intersectObjects(pickable, true)[0];
          if (hit) {
            let object = hit.object;
            while (object.parent && !object.userData.assetId) object = object.parent;
            if (object.userData.assetId) live.current.onSelect(object.userData.assetId);
          }
        };
        const lost = (e: Event) => {
          e.preventDefault();
          setError("3D paused on this device. The interactive floor plan is still available.");
          live.current.onUnavailable();
        };
        renderer.domElement.addEventListener("pointerdown", pointerDown as EventListener);
        renderer.domElement.addEventListener("pointerup", click as EventListener);
        renderer.domElement.addEventListener("webglcontextlost", lost);
        cleanups.push(() => {
          renderer?.domElement.removeEventListener("pointerdown", pointerDown as EventListener);
          renderer?.domElement.removeEventListener("pointerup", click as EventListener);
          renderer?.domElement.removeEventListener("webglcontextlost", lost);
        });
        function size() {
          if (!host.current || !renderer) return;
          const w = host.current.clientWidth,
            h = host.current.clientHeight;
          renderer.setSize(w, h);
          camera.aspect = w / Math.max(h, 1);
          camera.updateProjectionMatrix();
          needsRender = true;
        }
        resize = new ResizeObserver(size);
        resize.observe(host.current);
        size();
        let previous = -1,
          previousRoom = "";
        function draw() {
          if (disposed || !scene || !renderer) return;
          const { progress, roomId } = live.current;
          if (previous !== progress || previousRoom !== roomId) {
            previous = progress;
            previousRoom = roomId;
            const rise = Math.min(1, Math.max(0.005, progress / 0.28));
            walls.forEach((w) => {
              w.scale.y = rise;
              w.position.y = w.userData.baseY * rise;
            });
            materials.forEach((m) => {
              if (m.wireframe !== progress < 0.08) {
                m.wireframe = progress < 0.08;
                m.needsUpdate = true;
              }
            });
            needsRender = true;
            if (progress < 0.52) {
              const t = Math.min(1, progress / 0.42),
                e = t * t * (3 - 2 * t);
              camera.position.set(
                cx + span * 0.88 * e,
                span * (1.6 - 0.65 * e),
                cz - span * (0.001 + 0.83 * e),
              );
              camera.lookAt(cx, 0, cz);
            } else {
              const r = props.layout.rooms.find((r) => r.id === roomId) || props.layout.rooms[0];
              if (!r) {
                camera.position.set(cx, span * 1.6, cz - 0.01);
                camera.lookAt(cx, 0, cz);
              } else {
                const t = Math.max(0, Math.min(1, (progress - 0.52) / 0.48)),
                  e = t * t * (3 - 2 * t);
                const end = new T.Vector3(r.x + r.width * 0.5, 1.65, r.z + Math.min(1.25, r.depth * 0.25));
                camera.position.copy(
                  new T.Vector3(cx + span * 0.88, span * 0.95, cz - span * 0.83).lerp(end, e),
                );
                camera.lookAt(r.x + r.width * 0.6, 1.25, r.z + r.depth * 0.72);
              }
            }
          }
          if (needsRender) {
            renderer.render(scene, camera);
            needsRender = false;
          }
          frame = requestAnimationFrame(draw);
        }
        draw();
      } catch {
        if (!disposed) {
          setError("3D is unavailable here. Use the interactive floor plan below.");
          live.current.onUnavailable();
        }
      }
    }
    void boot();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize?.disconnect();
      cleanups.forEach((fn) => fn());
      const textures = new Set<import("three").Texture>();
      scene?.traverse((object) => {
        const mesh = object as import("three").Mesh;
        mesh.geometry?.dispose();
        if (mesh.material)
          for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            Object.values(material).forEach((v) => {
              if (v && typeof v === "object" && (v as import("three").Texture).isTexture)
                textures.add(v as import("three").Texture);
            });
            material.dispose();
          }
      });
      textures.forEach((t) => t.dispose());
      renderer?.dispose?.();
      renderer?.forceContextLoss?.();
      renderer?.domElement.remove();
    };
  }, [props.layout, props.assets]);
  return (
    <div className="interior-canvas" ref={host}>
      {compatibility && <span className="interior-compatibility">Compatibility 3D</span>}
      {error && <p role="status">{error}</p>}
    </div>
  );
}
