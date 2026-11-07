"use client";
import { newId } from "../lib/id.mjs";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Box, Play, Pause, Check, X, Plus, MapPin } from "lucide-react";
import type { Location } from "../lib/location";
import { newAsset, type Asset } from "../lib/asset";
import {
  interiorLayoutSchema,
  layoutBounds,
  starterLayout,
  type InteriorLayout,
  type InteriorRoom,
} from "../lib/interior-layout";
import EquipmentInfo from "./equipment-info";
import PlanViewport from "./plan-viewport";
import { readApiResponse } from "../lib/api-response";

const Scene = lazy(() => import("./interior-scene"));
const demoRoomIds = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
];
function sampleLayout() {
  const l = starterLayout();
  l.rooms = l.rooms.map((r, i) => ({ ...r, id: demoRoomIds[i] }));
  l.pins = [
    { assetId: "20000000-0000-4000-8000-000000000001", roomId: demoRoomIds[1], x: 0.8, z: 0.36 },
    { assetId: "20000000-0000-4000-8000-000000000002", roomId: demoRoomIds[1], x: 0.8, z: 0.65 },
    { assetId: "20000000-0000-4000-8000-000000000003", roomId: demoRoomIds[2], x: 0.75, z: 0.6 },
  ];
  return l;
}
function sampleAssets(): Asset[] {
  return ["Drink vending machine", "Coffee machine", "Water cooler"].map((name, i) => ({
    ...newAsset(),
    id: `20000000-0000-4000-8000-00000000000${i + 1}`,
    name,
    site: "Sample workplace",
    address: "Demo — fictional interior",
    room: i === 2 ? "Service room" : "Breakroom",
    floor: "Ground floor",
    tag: `DEMO-0${i + 1}`,
    serial: "Sample record",
    notes: "Demo equipment. This record is not part of your saved inventory.",
    equipmentType: name,
    updated: "2026-10-20",
  }));
}

type Props = {
  location?: Location;
  assets?: Asset[];
  save?: (l: Location) => Promise<void>;
  deviceOnly?: boolean;
  onClose?: () => void;
};
export default function InteriorStudio({ location, assets, save, deviceOnly, onClose }: Props) {
  const demo = !location;
  const demoAssets = useMemo(sampleAssets, []),
    equipment = assets || demoAssets;
  const [layout, setLayout] = useState<InteriorLayout>(() =>
    location?.layout
      ? structuredClone(location.layout)
      : demo
        ? sampleLayout()
        : { version: 1, floor: "Ground floor", basis: "estimated", rooms: [], pins: [], sketch: [] },
  );
  const [roomId, setRoomId] = useState(layout.rooms[0]?.id || ""),
    [progress, setProgress] = useState(0.32),
    [playing, setPlaying] = useState(false),
    [view, setView] = useState<"3d" | "plan">(layout.rooms.length ? "3d" : "plan"),
    [gpuFailed, setGpuFailed] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [placing, setPlacing] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [dirty, setDirty] = useState(false),
    [editing, setEditing] = useState(false);
  const [tool, setTool] = useState<"select" | "draw" | "room">("select"),
    [stroke, setStroke] = useState<{ x: number; z: number }[]>([]);
  const previewUrls = useRef<string[]>([]);
  const svg = useRef<SVGSVGElement>(null),
    drawing = useRef<{ x: number; z: number }[] | null>(null);
  const dialog = useRef<HTMLDivElement>(null),
    initialFocus = useRef<HTMLElement | null>(null);
  const selectedAsset = equipment.find((a) => a.id === selected),
    bounds = layoutBounds(layout),
    room = layout.rooms.find((r) => r.id === roomId) ||
      layout.rooms[0] || {
        id: "30000000-0000-4000-8000-000000000001",
        name: "Equipment area",
        x: 0,
        z: 0,
        width: 8,
        depth: 6,
        height: 3,
        finish: "stone" as const,
      };
  useEffect(
    () => () => {
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  const valid = interiorLayoutSchema.safeParse(layout),
    validation = valid.success ? "" : valid.error.issues[0]?.message;
  function change(next: InteriorLayout) {
    setLayout(next);
    setDirty(true);
    setMessage("");
    setPlaying(false);
  }
  function close() {
    if (busy) return;
    if (dirty && !demo && !confirm("Discard the unsaved interior layout changes?")) return;
    onClose?.();
  }
  useEffect(() => {
    if (!onClose) return;
    initialFocus.current = document.activeElement as HTMLElement;
    dialog.current?.focus();
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
      initialFocus.current?.focus();
    };
  }, [onClose]);
  useEffect(() => {
    if (!dirty || demo) return;
    const before = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty, demo]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0,
      previous = 0;
    const tick = (time: number) => {
      const delta = previous ? Math.min(time - previous, 100) : 0;
      previous = time;
      setProgress((p) => {
        const next = Math.min(1, p + delta / 14000);
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  useEffect(() => {
    if (progress >= 1) setPlaying(false);
  }, [progress]);
  function editRoom(patch: Partial<InteriorRoom>) {
    if (busy) return;
    change({
      ...layout,
      rooms: layout.rooms.length
        ? layout.rooms.map((r) => (r.id === room.id ? { ...r, ...patch } : r))
        : [{ ...room, ...patch }],
    });
    setRoomId(room.id);
  }
  async function persist() {
    if (!location || !save || !valid.success) return;
    setBusy(true);
    setError("");
    try {
      const ids = new Set(equipment.map((a) => a.id));
      const next = {
        ...valid.data,
        pins: valid.data.pins.filter((p) => ids.has(p.assetId)),
        planPins: valid.data.planPins?.filter((p) => ids.has(p.assetId)),
      };
      await save({ ...location, layout: next });
      setLayout(next);
      setDirty(false);
      setMessage(
        deviceOnly ? "Interior layout saved on this device." : "Interior layout saved to this building.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function uploadPlan(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8000000) {
      setError("Choose a JPG, PNG or WebP floor plan under 8 MB. Export a PDF plan as an image first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (deviceOnly)
        throw Error(
          "Sign in to cloud storage to upload a plan photo. You can sketch and save on this device.",
        );
      if (demo) {
        const key = URL.createObjectURL(file);
        previewUrls.current.push(key);
        change({
          ...layout,
          rooms: [],
          pins: [],
          planPins: [],
          reference: {
            key,
            label: file.name.slice(0, 250),
            width: 20,
            depth: 20,
            crop: { left: 0, top: 0, right: 1, bottom: 1 },
          },
        });
        setView("plan");
        setMessage(
          "Photo previewed in this demo only. Crop it, sketch and place sample machines here. Use a saved building to keep your real plan.",
        );
        return;
      }
      const form = new FormData();
      form.append("file", file);
      const { key } = await readApiResponse(await fetch("/api/files", { method: "POST", body: form }));
      change({
        ...layout,
        reference: {
          key,
          label: file.name.slice(0, 250),
          width: 20,
          depth: 20,
          crop: { left: 0, top: 0, right: 1, bottom: 1 },
        },
      });
      setView("plan");
      setMessage(
        "Plan photo loaded. Crop out phone borders, set the area size if known, then place equipment or trace rooms. Save the layout to keep it.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function point(e: React.PointerEvent<SVGSVGElement>) {
    const el = svg.current!;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(el.getScreenCTM()!.inverse());
    return {
      x: Math.round(Math.min(bounds.width, Math.max(0, p.x)) * 1000) / 1000,
      z: Math.round(Math.min(bounds.depth, Math.max(0, p.y)) * 1000) / 1000,
    };
  }
  function startDraw(e: React.PointerEvent<SVGSVGElement>) {
    if (tool === "select" || busy) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = [point(e)];
    setStroke(drawing.current);
  }
  function moveDraw(e: React.PointerEvent<SVGSVGElement>) {
    if (!drawing.current) return;
    const p = point(e),
      points = drawing.current;
    if (tool === "room") drawing.current = [points[0], p];
    else if (points.length < 80 && Math.hypot(p.x - points.at(-1)!.x, p.z - points.at(-1)!.z) > 0.08)
      drawing.current = [...points, p];
    setStroke(drawing.current);
  }
  function finishDraw() {
    const points = drawing.current;
    drawing.current = null;
    setStroke([]);
    if (!points || points.length < 2) return;
    if (tool === "draw") {
      if ((layout.sketch?.length || 0) >= 30) {
        setError("Maximum 30 strokes. Undo a stroke to draw more.");
        return;
      }
      change({ ...layout, sketch: [...(layout.sketch || []), points] });
    } else {
      if (layout.rooms.length >= 12) {
        setError("Maximum 12 rooms.");
        return;
      }
      const a = points[0],
        b = points.at(-1)!,
        r = {
          id: newId(),
          name: "Area " + (layout.rooms.length + 1),
          x: Math.min(a.x, b.x),
          z: Math.min(a.z, b.z),
          width: Math.abs(a.x - b.x),
          depth: Math.abs(a.z - b.z),
          height: 3,
          finish: "stone" as const,
        };
      if (r.width < 2 || r.depth < 2) {
        setError("Draw a room at least 2 × 2 m in this plan scale.");
        return;
      }
      const test = interiorLayoutSchema.safeParse({ ...layout, rooms: [...layout.rooms, r] });
      if (!test.success) {
        setError(test.error.issues[0].message);
        return;
      }
      change(test.data);
      setRoomId(r.id);
      setTool("select");
      setMessage("Room traced. Edit its name and dimensions, then view it in 3D.");
    }
    setError("");
  }
  function placeOnPlan(e: React.MouseEvent<SVGRectElement>) {
    if (busy || !placing || tool !== "select") return;
    const el = svg.current!,
      p = new DOMPoint(e.clientX, e.clientY).matrixTransform(el.getScreenCTM()!.inverse());
    const x = Math.max(0, Math.min(bounds.width, p.x)),
      z = Math.max(0, Math.min(bounds.depth, p.y)),
      r = layout.rooms.find((r) => x >= r.x && x <= r.x + r.width && z >= r.z && z <= r.z + r.depth);
    change({
      ...layout,
      pins: [
        ...layout.pins.filter((p) => p.assetId !== placing),
        ...(r
          ? [
              {
                assetId: placing,
                roomId: r.id,
                x: Math.max(0.05, Math.min(0.95, (x - r.x) / r.width)),
                z: Math.max(0.05, Math.min(0.95, (z - r.z) / r.depth)),
              },
            ]
          : []),
      ],
      planPins: [
        ...(layout.planPins?.filter((p) => p.assetId !== placing) || []),
        { assetId: placing, x, z },
      ],
    });
    setSelected(placing);
    setPlacing("");
    setMessage("Machine placed on the source plan. Save the interior layout to keep it.");
  }
  function place(e: React.MouseEvent<SVGRectElement>, r: InteriorRoom) {
    setRoomId(r.id);
    placeOnPlan(e);
  }
  function keyDialog(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
    if (e.key === "Tab" && onClose) {
      const items = Array.from(
          dialog.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled)",
          ) || [],
        ).filter((el) => el.getClientRects().length > 0),
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
  }
  return (
    <div className={onClose ? "interior-modal" : "interior-standalone"}>
      <div
        ref={dialog}
        role={onClose ? "dialog" : undefined}
        aria-modal={onClose ? true : undefined}
        aria-label="Interior walkthrough studio"
        tabIndex={-1}
        onKeyDown={keyDialog}
        className="interior-studio"
      >
        <header className="interior-header">
          <div>
            <p className="eyebrow">STV LOCATE · OPTIONAL INTERIOR STUDIO</p>
            <h1>{demo ? "Walk into the plan." : location.name}</h1>
            <p>{demo ? "Interactive sample workplace · no API key needed" : location.address}</p>
          </div>
          {onClose ? (
            <button className="secondary" disabled={busy} onClick={close}>
              <X size={18} />
              Back to equipment
            </button>
          ) : (
            <a className="secondary" href="/">
              ← Back to STV Locate
            </a>
          )}
        </header>
        <div className="interior-notice">
          <span>
            {demo
              ? "DEMO LAYOUT"
              : layout.basis === "measured"
                ? "OWNER-ENTERED DIMENSIONS"
                : "ESTIMATED LAYOUT"}
          </span>
          <p>
            {demo
              ? "Try the rising walls, enter a room and tap a machine. Demo edits stay in this preview."
              : "Model based on the rooms you enter. Check dimensions and machine positions on site."}
          </p>
        </div>
        <fieldset disabled={busy} className="interior-workspace">
          <section className="interior-visual" aria-label="Interior viewer">
            <div className="interior-view-tabs">
              <button
                aria-pressed={view === "3d"}
                disabled={gpuFailed || !layout.rooms.length}
                onClick={() => setView("3d")}
              >
                <Box size={16} />
                3D interior
              </button>
              <button
                aria-pressed={view === "plan"}
                onClick={() => {
                  setView("plan");
                  setPlaying(false);
                }}
              >
                Interactive plan
              </button>
              <span>
                {layout.floor} · {bounds.width.toFixed(1)} × {bounds.depth.toFixed(1)} m
              </span>
            </div>
            <div className="plan-source-tools">
              <label className="secondary">
                Upload floor plan
                <input
                  aria-label="Upload floor plan"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy || deviceOnly}
                  onChange={(e) => {
                    void uploadPlan(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              <label className="secondary">
                Photograph safety map
                <input
                  aria-label="Photograph safety map"
                  type="file"
                  capture="environment"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy || deviceOnly}
                  onChange={(e) => {
                    void uploadPlan(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                className="secondary"
                aria-pressed={tool === "draw"}
                onClick={() => {
                  setView("plan");
                  setTool("draw");
                  setPlacing("");
                }}
              >
                Sketch walls
              </button>
              <button
                className="secondary"
                aria-pressed={tool === "room"}
                disabled={layout.rooms.length >= 12}
                onClick={() => {
                  setView("plan");
                  setTool("room");
                  setPlacing("");
                }}
              >
                Trace room for 3D
              </button>
              <button
                className="secondary"
                aria-pressed={tool === "select"}
                onClick={() => setTool("select")}
              >
                Select / place pins
              </button>
              {Boolean(layout.sketch?.length) && (
                <button
                  className="secondary"
                  onClick={() => change({ ...layout, sketch: layout.sketch?.slice(0, -1) })}
                >
                  Undo sketch stroke
                </button>
              )}
            </div>
            <p className="plan-instructions">
              {tool === "room"
                ? "Drag a rectangle over a room or equipment area. Name it and check its dimensions in the editor."
                : tool === "draw"
                  ? "Draw walls with your finger or mouse. Use Trace room for 3D to turn an area into a room."
                  : !layout.rooms.length
                    ? "Upload a plan, photograph a posted map, or sketch the equipment area. Trace rooms when you want a 3D view."
                    : "Tap equipment for its info sheet. Use Place to set an indoor spot."}
              {deviceOnly
                ? " Photo uploads need cloud login; sketches save on this device."
                : demo
                  ? " Demo photos stay in this preview until you leave."
                  : ""}
            </p>
            {layout.reference && (
              <details className="plan-reference-settings">
                <summary>Crop & scale plan photo · {layout.reference.label}</summary>
                <p>
                  Crop out phone borders and unrelated areas. Set the area size before tracing rooms or
                  placing machines. A photo can be distorted; check measurements on site.
                </p>
                <div className="form-grid">
                  {(["left", "top", "right", "bottom"] as const).map((edge) => (
                    <label className="field" key={edge}>
                      {edge} crop (%)
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={Math.round(layout.reference!.crop[edge] * 100)}
                        onChange={(e) =>
                          change({
                            ...layout,
                            reference: {
                              ...layout.reference!,
                              crop: { ...layout.reference!.crop, [edge]: Number(e.target.value) / 100 },
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                  {(["width", "depth"] as const).map((axis) => (
                    <label className="field" key={axis}>
                      Plan {axis} (m)
                      <input
                        type="number"
                        min="2"
                        max="500"
                        value={layout.reference![axis]}
                        onChange={(e) =>
                          change({
                            ...layout,
                            reference: { ...layout.reference!, [axis]: Number(e.target.value) },
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
                <button
                  className="text-button"
                  onClick={() => {
                    if (
                      confirm(
                        "Remove the background photo? Your traced rooms, sketch and indoor pins stay in this layout.",
                      )
                    )
                      change({ ...layout, reference: undefined });
                  }}
                >
                  Remove photo background
                </button>
              </details>
            )}
            {view === "3d" ? (
              <Suspense fallback={<div className="interior-loading">Building your interior view…</div>}>
                <Scene
                  layout={layout}
                  assets={equipment}
                  progress={progress}
                  roomId={roomId}
                  onSelect={setSelected}
                  onUnavailable={() => {
                    setGpuFailed(true);
                    setView("plan");
                    setPlaying(false);
                    setMessage(
                      "This device could not keep 3D running. The interactive plan and saved layout still work.",
                    );
                  }}
                />
              </Suspense>
            ) : null}
            <div className={"interior-plan " + (view === "plan" ? "expanded" : "")}>
              <div className="interior-plan-heading">
                <strong>
                  {placing
                    ? "Tap the plan at the machine’s exact spot"
                    : tool === "select"
                      ? "Floor plan · tap a room or equipment marker"
                      : tool === "draw"
                        ? "Sketch walls with your finger"
                        : "Drag a rectangle around the room"}
                </strong>
                <span>Plan orientation ↑</span>
              </div>
              <PlanViewport>
                <svg
                  ref={svg}
                  style={{ touchAction: tool === "select" ? "auto" : "none" }}
                  onPointerDown={startDraw}
                  onPointerMove={moveDraw}
                  onPointerUp={finishDraw}
                  onPointerCancel={() => {
                    drawing.current = null;
                    setStroke([]);
                  }}
                  role="img"
                  aria-label="Interactive interior floor plan"
                  viewBox={`-1 -1 ${bounds.width + 2} ${bounds.depth + 2}`}
                >
                  {layout.reference && (
                    <svg
                      x="0"
                      y="0"
                      width={layout.reference.width}
                      height={layout.reference.depth}
                      viewBox={`${layout.reference.crop.left} ${layout.reference.crop.top} ${Math.max(0.05, layout.reference.crop.right - layout.reference.crop.left)} ${Math.max(0.05, layout.reference.crop.bottom - layout.reference.crop.top)}`}
                      preserveAspectRatio="none"
                      pointerEvents="none"
                    >
                      <image
                        href={
                          layout.reference.key.startsWith("blob:")
                            ? layout.reference.key
                            : "/api/files?key=" + encodeURIComponent(layout.reference.key)
                        }
                        x="0"
                        y="0"
                        width="1"
                        height="1"
                        preserveAspectRatio="none"
                      />
                    </svg>
                  )}
                  <rect
                    aria-label="Plan placement area"
                    x="0"
                    y="0"
                    width={bounds.width}
                    height={bounds.depth}
                    fill="transparent"
                    onClick={placeOnPlan}
                  />
                  {layout.rooms.map((r, i) => (
                    <g key={r.id}>
                      <rect
                        className={room.id === r.id ? "current-room" : ""}
                        x={r.x}
                        y={r.z}
                        width={r.width}
                        height={r.depth}
                        fillOpacity={layout.reference ? 0.15 : 1}
                        fill={r.finish === "oak" ? "#d8c4a1" : r.finish === "sage" ? "#cad7c8" : "#e6e0d2"}
                        onClick={(e) => place(e, r)}
                      />
                      <text x={r.x + 0.35} y={r.z + 0.65}>
                        {String(i + 1).padStart(2, "0")} · {r.name}
                      </text>
                      <text className="room-dimensions" x={r.x + 0.35} y={r.z + 1.13}>
                        {r.width} × {r.depth} m
                      </text>
                    </g>
                  ))}
                  {[...(layout.sketch || []), ...(tool === "draw" && stroke.length ? [stroke] : [])].map(
                    (s, i) => (
                      <polyline
                        key={i}
                        points={s.map((p) => p.x + "," + p.z).join(" ")}
                        fill="none"
                        stroke="#153f35"
                        strokeWidth=".09"
                        strokeLinecap="round"
                        pointerEvents="none"
                      />
                    ),
                  )}
                  {tool === "room" && stroke.length === 2 && (
                    <rect
                      x={Math.min(stroke[0].x, stroke[1].x)}
                      y={Math.min(stroke[0].z, stroke[1].z)}
                      width={Math.abs(stroke[1].x - stroke[0].x)}
                      height={Math.abs(stroke[1].z - stroke[0].z)}
                      fill="#b5e7be"
                      fillOpacity=".3"
                      pointerEvents="none"
                    />
                  )}
                  {layout.planPins?.map((p) => {
                    const a = equipment.find((a) => a.id === p.assetId);
                    return a ? (
                      <g
                        key={"plan-" + p.assetId}
                        className="interior-equipment-marker"
                        role="button"
                        tabIndex={0}
                        aria-label={"Open plan info: " + a.name}
                        onClick={() => setSelected(a.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelected(a.id);
                          }
                        }}
                      >
                        <circle cx={p.x} cy={p.z} r=".3" fill="#176950" />
                        <text x={p.x + 0.4} y={p.z + 0.12}>
                          {a.tag || a.name}
                        </text>
                      </g>
                    ) : null;
                  })}
                  {layout.pins
                    .filter((p) => !layout.planPins?.some((pp) => pp.assetId === p.assetId))
                    .map((p) => {
                      const r = layout.rooms.find((r) => r.id === p.roomId),
                        a = equipment.find((a) => a.id === p.assetId);
                      return r && a ? (
                        <g
                          key={p.assetId}
                          className="interior-equipment-marker"
                          role="button"
                          tabIndex={0}
                          aria-label={"Open interior info: " + a.name}
                          onClick={() => setSelected(a.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelected(a.id);
                            }
                          }}
                        >
                          <circle
                            cx={r.x + r.width * p.x}
                            cy={r.z + r.depth * p.z}
                            r={0.3}
                            fill={a.status === "Needs service" ? "#c27f26" : "#176950"}
                          />
                          <text x={r.x + r.width * p.x + 0.4} y={r.z + r.depth * p.z + 0.12}>
                            {a.tag || a.name}
                          </text>
                        </g>
                      ) : null;
                    })}
                </svg>
              </PlanViewport>
            </div>
            {view === "3d" && (
              <div className="interior-player">
                <div>
                  <button
                    className="primary"
                    onClick={() => {
                      if (progress >= 1) setProgress(0);
                      setPlaying((p) => !p);
                    }}
                  >
                    {playing ? <Pause size={16} /> : <Play size={16} />} {playing ? "Pause" : "Play reveal"}
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setProgress(0);
                      setPlaying(false);
                    }}
                  >
                    Plan sheet
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setProgress(0.4);
                      setPlaying(false);
                    }}
                  >
                    Raise walls
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setProgress(1);
                      setPlaying(false);
                    }}
                  >
                    Enter room
                  </button>
                </div>
                <label>
                  Plan → walls → room
                  <input
                    aria-label="Walkthrough progress"
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={Math.round(progress * 100)}
                    onChange={(e) => {
                      setPlaying(false);
                      setProgress(Number(e.target.value) / 100);
                    }}
                  />
                </label>
              </div>
            )}
            <div className="interior-room-stops">
              {layout.rooms.map((r, i) => (
                <button
                  key={r.id}
                  aria-pressed={roomId === r.id}
                  onClick={() => {
                    setRoomId(r.id);
                    setPlaying(false);
                    if (view === "3d") setProgress(1);
                  }}
                >
                  <span>{String(i + 1).padStart(2, "0")}</span> {r.name}
                </button>
              ))}
            </div>
          </section>
          <aside className="interior-controls">
            <p className="eyebrow">BUILDING INTERIOR</p>
            <h2>{selectedAsset ? selectedAsset.name : room.name}</h2>
            {selectedAsset ? (
              <>
                <EquipmentInfo asset={selectedAsset} />
                <button className="secondary" onClick={() => setSelected(null)}>
                  Back to room
                </button>
              </>
            ) : (
              <>
                <p>
                  {room.width} × {room.depth} m · {room.height} m ceiling
                </p>
                <p className="muted">
                  Select a machine below to open its individual info sheet. Use the plan to set its indoor
                  position.
                </p>
              </>
            )}
            <div className="interior-machine-list">
              {equipment.map((a) => (
                <div key={a.id}>
                  <button onClick={() => setSelected(a.id)}>
                    <MapPin size={17} />
                    <span>
                      {a.name}
                      <small>
                        {layout.rooms.find(
                          (r) => r.id === layout.pins.find((p) => p.assetId === a.id)?.roomId,
                        )?.name ||
                          (layout.planPins?.some((p) => p.assetId === a.id)
                            ? "Placed on source plan"
                            : "Not placed indoors")}
                      </small>
                    </span>
                  </button>
                  <button
                    className="secondary"
                    aria-label={"Place indoors: " + a.name}
                    onClick={() => {
                      setView("plan");
                      setPlaying(false);
                      setTool("select");
                      setPlacing(a.id);
                      setMessage("Tap the floor plan inside the room where this machine is located.");
                    }}
                  >
                    Place
                  </button>
                </div>
              ))}
            </div>
            {!equipment.length && (
              <p className="muted">
                Add and save equipment pins on the aerial map first. They’ll appear here for indoor placement.
              </p>
            )}
            {placing && (
              <button className="secondary" onClick={() => setPlacing("")}>
                Cancel indoor placement
              </button>
            )}
            <button className="secondary full" aria-expanded={editing} onClick={() => setEditing((e) => !e)}>
              {editing ? "Hide layout editor" : "Edit rooms & dimensions"}
            </button>
            {editing && (
              <div className="interior-editor">
                <label className="field">
                  Floor name
                  <input
                    maxLength={80}
                    value={layout.floor}
                    onChange={(e) => change({ ...layout, floor: e.target.value })}
                  />
                </label>
                <label className="field">
                  Dimension source
                  <select
                    value={layout.basis}
                    onChange={(e) => change({ ...layout, basis: e.target.value as InteriorLayout["basis"] })}
                  >
                    <option value="estimated">Estimated / needs checking</option>
                    <option value="measured">I entered measured dimensions</option>
                  </select>
                </label>
                <label className="field">
                  Room to edit
                  <select
                    aria-label="Room to edit"
                    value={room.id}
                    onChange={(e) => {
                      setRoomId(e.target.value);
                      setSelected(null);
                    }}
                  >
                    {layout.rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Room name
                  <input
                    maxLength={80}
                    value={room.name}
                    onChange={(e) => editRoom({ name: e.target.value })}
                  />
                </label>
                <div className="form-grid">
                  {(
                    [
                      ["width", "Width (m)"],
                      ["depth", "Depth (m)"],
                      ["height", "Ceiling (m)"],
                      ["x", "Left position (m)"],
                      ["z", "Top position (m)"],
                    ] as const
                  ).map(([field, label]) => (
                    <label className="field" key={field}>
                      {label}
                      <input
                        type="number"
                        step=".1"
                        min={field === "x" || field === "z" ? 0 : 2}
                        max={field === "height" ? 6 : field === "width" || field === "depth" ? 300 : 500}
                        value={room[field]}
                        onChange={(e) => editRoom({ [field]: Number(e.target.value) })}
                      />
                    </label>
                  ))}
                </div>
                <label className="field">
                  Floor finish
                  <select
                    value={room.finish}
                    onChange={(e) => editRoom({ finish: e.target.value as InteriorRoom["finish"] })}
                  >
                    <option value="stone">Warm stone</option>
                    <option value="oak">Natural oak</option>
                    <option value="sage">Sage concrete</option>
                  </select>
                </label>
                <div className="interior-editor-actions">
                  <button
                    className="secondary"
                    disabled={layout.rooms.length >= 12}
                    onClick={() => {
                      const r = {
                        ...room,
                        id: newId(),
                        name: "New room",
                        x: 0,
                        z: bounds.depth,
                        width: 8,
                        depth: 4,
                      };
                      change({ ...layout, rooms: [...layout.rooms, r] });
                      setRoomId(r.id);
                    }}
                  >
                    <Plus size={15} />
                    Add room
                  </button>
                  <button
                    className="text-button"
                    disabled={!layout.rooms.length}
                    onClick={() => {
                      if (
                        layout.pins.some((p) => p.roomId === room.id) &&
                        !confirm(
                          "Remove this room and its indoor placements? Aerial equipment records stay saved.",
                        )
                      )
                        return;
                      const rooms = layout.rooms.filter((r) => r.id !== room.id);
                      change({ ...layout, rooms, pins: layout.pins.filter((p) => p.roomId !== room.id) });
                      setRoomId(rooms[0]?.id || "");
                      if (!rooms.length) setView("plan");
                    }}
                  >
                    Remove room
                  </button>
                </div>
              </div>
            )}
            {validation && (
              <p className="interior-error" role="alert">
                {validation}
              </p>
            )}
            {save && (
              <button
                className="primary full"
                disabled={busy || !valid.success || !dirty}
                onClick={() => void persist()}
              >
                <Check size={17} />
                {busy ? "Saving interior…" : "Save interior layout"}
              </button>
            )}
            {dirty && (
              <small>
                {demo ? "Preview changes only · refresh to reset the demo" : "Unsaved interior changes"}
              </small>
            )}
            {message && (
              <p role="status" className="interior-message">
                {message}
              </p>
            )}
            {error && (
              <p role="alert" className="interior-error">
                {error}
              </p>
            )}
            <p className="interior-fineprint">
              Indoor placements are separate from your aerial GPS pins. Photos can be kept in the building’s
              Interior photos section.
            </p>
          </aside>
        </fieldset>
      </div>
    </div>
  );
}
