import { interiorLayoutSchema, type InteriorLayout } from "./interior-layout";

/**
 * Turns an Apple RoomPlan export into a measured indoor plan.
 *
 * Accepts the "Share room (.zip)" bundle from the 3D Model Anything iPhone app
 * (house-capture format: rooms/room-N.json, structure.json) or a bare RoomPlan
 * CapturedRoom/CapturedStructure JSON file. Only the measured wall, door and
 * window geometry is used; nothing is inferred or invented. Units are metres.
 */
type Surface = { dimensions?: number[]; transform?: number[] };
type Captured = {
  walls?: Surface[];
  doors?: Surface[];
  windows?: Surface[];
  openings?: Surface[];
  objects?: Surface[];
};
type Segment = { a: [number, number]; b: [number, number] };

function segments(list: Surface[] | undefined): Segment[] {
  const out: Segment[] = [];
  for (const s of list || []) {
    const m = s.transform,
      d = s.dimensions;
    if (!Array.isArray(m) || m.length !== 16 || !Array.isArray(d) || d.length < 1) continue;
    if (![...m, d[0]].every((n) => typeof n === "number" && Number.isFinite(n))) continue;
    // Column-major: x axis = m[0..2], translation = m[12..14]. Project onto the floor (x/z).
    const len = Math.hypot(m[0], m[2]) || 1;
    const ux = m[0] / len,
      uz = m[2] / len,
      half = Math.max(0, d[0]) / 2;
    out.push({ a: [m[12] - ux * half, m[14] - uz * half], b: [m[12] + ux * half, m[14] + uz * half] });
  }
  return out;
}

export function layoutFromRoomPlan(rooms: Captured[], floorName = "Scanned floor"): InteriorLayout {
  const walls = rooms.flatMap((r) => segments(r.walls));
  if (walls.length < 3)
    throw Error("This scan has no measured walls. Re-export the room from the scanning app.");
  const openings = rooms.flatMap((r) => [...segments(r.doors), ...segments(r.openings)]);
  // Align the dominant wall direction with the plan axes (walls run at θ + k·90°).
  let sx = 0,
    sy = 0;
  for (const w of walls) {
    const ang = Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]) * 4;
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    sx += Math.cos(ang) * len;
    sy += Math.sin(ang) * len;
  }
  const theta = Math.atan2(sy, sx) / 4,
    c = Math.cos(-theta),
    s = Math.sin(-theta);
  const rot = (p: [number, number]): [number, number] => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
  const all = [...walls, ...openings].map((w) => ({ a: rot(w.a), b: rot(w.b) }));
  const xs = all.flatMap((w) => [w.a[0], w.b[0]]),
    zs = all.flatMap((w) => [w.a[1], w.b[1]]);
  const minX = Math.min(...xs) - 1,
    minZ = Math.min(...zs) - 1;
  const width = Math.max(...xs) - minX + 1,
    depth = Math.max(...zs) - minZ + 1;
  if (width > 500 || depth > 500)
    throw Error("This scan is larger than 500 m. Import one floor or room at a time.");
  const place = (p: [number, number]) => ({ x: round(p[0] - minX), z: round(p[1] - minZ) });
  // Chain walls that meet into polylines (plans keep up to 30 lines).
  const lines = chain(all.slice(0, walls.length).map((w) => [place(w.a), place(w.b)]));
  const doorLines = all.slice(walls.length).map((w) => [place(w.a), place(w.b)]);
  const sketch = [...lines, ...doorLines].filter((l) => l.length >= 2).slice(0, 30);
  return interiorLayoutSchema.parse({
    version: 1,
    floor: floorName.slice(0, 80),
    basis: "measured",
    source: "roomplan-scan",
    rooms: [],
    pins: [],
    sketch,
    planPins: [],
  });
}
function round(n: number) {
  return Math.round(Math.min(500, Math.max(0, n)) * 100) / 100;
}
function chain(segs: { x: number; z: number }[][]) {
  const close = (p: { x: number; z: number }, q: { x: number; z: number }) =>
    Math.hypot(p.x - q.x, p.z - q.z) < 0.25;
  const left = [...segs],
    out: { x: number; z: number }[][] = [];
  while (left.length) {
    const line = [...left.shift()!];
    let grown = true;
    while (grown && line.length < 80) {
      grown = false;
      for (let i = 0; i < left.length; i++) {
        const [p, q] = left[i];
        if (close(line[line.length - 1], p)) line.push(q);
        else if (close(line[line.length - 1], q)) line.push(p);
        else if (close(line[0], q)) line.unshift(p);
        else if (close(line[0], p)) line.unshift(q);
        else continue;
        left.splice(i, 1);
        grown = true;
        break;
      }
    }
    out.push(line);
  }
  return out;
}

function captured(value: unknown): Captured[] {
  if (!value || typeof value !== "object") return [];
  const v = value as Captured & { rooms?: unknown };
  if (Array.isArray(v.walls)) return [v];
  return [];
}

export async function importRoomPlan(file: File): Promise<InteriorLayout> {
  if (file.size > 80_000_000) throw Error("Choose a single room export under 80 MB.");
  const name = file.name.toLowerCase();
  if (name.endsWith(".json") || file.type === "application/json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      throw Error("That JSON file could not be read.");
    }
    const rooms = captured(parsed);
    if (!rooms.length)
      throw Error("That JSON is not a RoomPlan room. Choose rooms/room-N.json or structure.json.");
    return layoutFromRoomPlan(rooms, file.name.replace(/\.json$/i, ""));
  }
  const { default: JSZip } = await import("jszip");
  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw Error("That file is not a .zip scan export. Choose the room .zip shared from the scanning app.");
  }
  const files = Object.values(zip.files).filter((f) => !f.dir);
  const structure = files.find((f) => /(^|\/)structure\.json$/i.test(f.name));
  const roomFiles = files.filter((f) => /(^|\/)rooms\/room-\d+\.json$/i.test(f.name));
  const sources = structure ? [structure] : roomFiles;
  if (!sources.length)
    throw Error(
      "No RoomPlan geometry found in this .zip. Export with “Share room (.zip)” from 3D Model Anything.",
    );
  const rooms: Captured[] = [];
  for (const f of sources) {
    try {
      rooms.push(...captured(JSON.parse(await f.async("string"))));
    } catch {
      /* skip unreadable room files */
    }
  }
  if (!rooms.length) throw Error("The scan's room files could not be read.");
  return layoutFromRoomPlan(rooms, file.name.replace(/\.zip$/i, "") || "Scanned floor");
}
