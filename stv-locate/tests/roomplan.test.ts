import { it, expect } from "vitest";
import JSZip from "jszip";
import { importRoomPlan, layoutFromRoomPlan } from "../lib/roomplan";

// A 4 m × 3 m room as RoomPlan reports it: walls centred on their transform, rotated 20° in the session frame.
function room(rotation = (20 * Math.PI) / 180) {
  const wall = (cx: number, cz: number, len: number, ang: number) => {
    const a = ang + rotation;
    return {
      dimensions: [len, 2.6, 0],
      transform: [
        Math.cos(a),
        0,
        -Math.sin(a),
        0,
        0,
        1,
        0,
        0,
        Math.sin(a),
        0,
        Math.cos(a),
        0,
        cx * Math.cos(rotation) + cz * Math.sin(rotation),
        1.3,
        -cx * Math.sin(rotation) + cz * Math.cos(rotation),
        1,
      ],
    };
  };
  return {
    walls: [wall(2, 0, 4, 0), wall(4, 1.5, 3, Math.PI / 2), wall(2, 3, 4, 0), wall(0, 1.5, 3, Math.PI / 2)],
    doors: [],
    openings: [],
  };
}
function extent(layout: ReturnType<typeof layoutFromRoomPlan>) {
  const pts = layout.sketch!.flat();
  const xs = pts.map((p) => p.x),
    zs = pts.map((p) => p.z);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)].sort((a, b) => b - a);
}
it("turns RoomPlan walls into a measured, axis-aligned plan labeled as a LiDAR scan", () => {
  const layout = layoutFromRoomPlan([room()]);
  expect(layout).toMatchObject({ basis: "measured", source: "roomplan-scan", rooms: [], pins: [] });
  const [w, d] = extent(layout);
  expect(w).toBeCloseTo(4, 2);
  expect(d).toBeCloseTo(3, 2);
  expect(layout.sketch).toHaveLength(1); // the four walls chain into one closed outline
});
it("imports the shared room .zip from the scanning app and rejects files without walls", async () => {
  const zip = new JSZip();
  zip.file("session/rooms/room-0.json", JSON.stringify(room(0)));
  zip.file("session/rooms/room-0-data.json", "{}");
  const file = new File([await zip.generateAsync({ type: "arraybuffer" })], "Breakroom.zip", {
    type: "application/zip",
  });
  const layout = await importRoomPlan(file);
  expect(extent(layout)[0]).toBeCloseTo(4, 2);
  expect(layout.floor).toBe("Breakroom");
  await expect(
    importRoomPlan(new File(['{"walls":[]}'], "x.json", { type: "application/json" })),
  ).rejects.toThrow(/no measured walls/);
  await expect(importRoomPlan(new File(["hello"], "x.zip", { type: "application/zip" }))).rejects.toThrow(
    /not a .zip/,
  );
});
