import { newId } from "./id.mjs";
import JSZip from "jszip";
import { remapInteriorPins } from "./interior-layout";
import { locationSchema, type Location } from "./location";
import { assetSchema, type Asset } from "./asset";
import { photoSource } from "./field-store";
const mediaName = (key: string) =>
  key
    .split("/")
    .pop()!
    .replace(/^device-photo:/, "device-photo-");
const mediaPath = (key: string) =>
  key.includes("/model-") ? "/api/models?key=" + encodeURIComponent(key) : photoSource(key);
export function download(data: Blob, name: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export async function exportAssets(assets: Asset[], unreal = false) {
  const zip = new JSZip();
  const locationsResponse = await fetch("/api/locations");
  if (!locationsResponse.ok) throw new Error("Could not include saved building maps. Try again.");
  const locationsData = (await locationsResponse.json()) as { locations: Location[] };
  const locations = unreal
    ? locationsData.locations.filter((l) => assets.some((a) => a.siteId === l.id))
    : locationsData.locations;
  const keys = [
    ...new Set(
      [
        ...assets.flatMap((a) => [a.plan, ...a.photos.map((p) => p.key)]),
        ...locations.flatMap((l) => [
          ...(l.interior?.photos.map((p) => p.key) || []),
          l.interior?.section?.key || "",
          l.interior?.model?.key || "",
          l.layout?.reference?.key || "",
        ]),
      ].filter(Boolean),
    ),
  ];
  for (const key of keys) {
    const r = await fetch(mediaPath(key));
    if (!r.ok) throw new Error("Could not include a photo. Export was cancelled.");
    zip.file("media/" + mediaName(key), await r.blob());
  }
  zip.file(
    "assets.json",
    JSON.stringify(
      { schema: "stv-locate/v1", exportedAt: new Date().toISOString(), assets, locations },
      null,
      2,
    ),
  );
  zip.file(
    "README.md",
    "# STV Locate export\nStable asset IDs, WGS84 coordinates, floor-plan pins (0–100 percent), and equipment records. Media files are in media/. Import this ZIP into STV Locate to restore copies. VendDoctorAi integration is not connected yet.\n",
  );
  if (unreal) {
    const workflow = await fetch("/licenses/unreal-home-wizard-workflow.md");
    if (!workflow.ok) throw new Error("Reconstruction workflow could not be included.");
    zip.file("UNREAL_WORKFLOW.md", await workflow.text());
    const license = await fetch("/licenses/unreal-home-wizard.txt");
    if (license.ok) zip.file("UNREAL_LICENSE.txt", await license.text());
    const a = assets[0];
    zip.file(
      "HOME_PROJECT_BRIEF.md",
      `# Equipment location reconstruction\n\nWorkflow: https://github.com/amirmushichge/unreal-home-wizard\n\nSite: ${a.site}\nAsset: ${a.name}\nAddress: ${a.address}\nFloor/room: ${a.floor} / ${a.room}\nRoute: ${a.entrance}\nNotes: ${a.notes}\n\nMode: STRICT RECONSTRUCTION\nRights: Must be confirmed by the owner before construction.\nMeasurements: Not supplied; do not infer exact dimensions.\nReferences: media/ and assets.json. Missing views must be marked unknown.\nRequired review gates: rough layout approval; matched-camera review; physical logic audit; manual walkthrough; final approval before launchable build. Critical or major defects block release.\nDeliverable: a reviewed walkable Unreal project and optional hosted tour. This export is a preparation package, not a generated 3D model. Unreal installation, Epic sign-in and rendering hardware are separate requirements.\n`,
    );
  }
  download(
    await zip.generateAsync({ type: "blob" }),
    unreal ? "STV-Unreal-Handoff.zip" : "STV-Locate-Backup.zip",
  );
}
export async function importAssets(file: File) {
  if (file.size > 80000000) throw new Error("Backup must be smaller than 80 MB.");
  const zip = await JSZip.loadAsync(file);
  const content = zip.file("assets.json");
  if (!content) throw new Error("This ZIP is not an STV Locate backup.");
  const parsed = JSON.parse(await content.async("string"));
  if (parsed.schema !== "stv-locate/v1" || !Array.isArray(parsed.assets) || parsed.assets.length > 200)
    throw new Error("Unsupported backup.");
  const list: Asset[] = parsed.assets.map((a: unknown) => assetSchema.parse(a));
  const restoredLocations = new Map<string, string>();
  const buildingList = parsed.locations || [];
  if (!Array.isArray(buildingList) || buildingList.length > 200)
    throw new Error("Unsupported building backup.");
  const validBuildings = buildingList.map((l: unknown) => locationSchema.parse(l));
  const restoredAssets = new Map(list.map((a) => [a.id, newId()]));
  const keys = new Map<string, string>();
  async function restoreMedia(old: string) {
    if (keys.has(old)) return keys.get(old)!;
    const entry = zip.file("media/" + mediaName(old));
    if (!entry) throw new Error("Backup is missing a photo.");
    const bytes = await entry.async("uint8array");
    if (bytes.length > 24000000) throw new Error("Photo too large.");
    const isModel = bytes[0] === 103 && bytes[1] === 108 && bytes[2] === 84 && bytes[3] === 70;
    const type = isModel
      ? "model/gltf-binary"
      : bytes[0] === 137
        ? "image/png"
        : bytes[0] === 255
          ? "image/jpeg"
          : "image/webp";
    const form = new FormData();
    form.append("file", new Blob([bytes as BlobPart], { type }), "restored");
    const r = await fetch(isModel ? "/api/models" : "/api/files", { method: "POST", body: form });
    if (!r.ok) throw new Error("Photo restore failed.");
    const key = ((await r.json()) as { key: string }).key;
    keys.set(old, key);
    return key;
  }
  for (const original of validBuildings) {
    const l = structuredClone(original);
    l.id = newId();
    l.layout = remapInteriorPins(l.layout, restoredAssets);
    if (l.layout?.reference) l.layout.reference.key = await restoreMedia(l.layout.reference.key);
    if (l.interior) {
      for (const p of l.interior.photos) p.key = await restoreMedia(p.key);
      if (l.interior.section) l.interior.section.key = await restoreMedia(l.interior.section.key);
      if (l.interior.model) l.interior.model.key = await restoreMedia(l.interior.model.key);
      l.interior.modelPins = l.interior.modelPins?.flatMap((p) =>
        restoredAssets.has(p.assetId) ? [{ ...p, assetId: restoredAssets.get(p.assetId)! }] : [],
      );
    }
    const r = await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(l),
    });
    if (!r.ok) throw new Error("Building restore failed. Already restored copies are preserved.");
    restoredLocations.set(original.id, l.id);
  }
  let count = 0;
  for (const original of list) {
    const a = structuredClone(original);
    a.id = restoredAssets.get(original.id)!;
    a.siteId = a.siteId ? restoredLocations.get(a.siteId) : undefined;
    for (const old of [a.plan, ...a.photos.map((p) => p.key)].filter(Boolean)) {
      await restoreMedia(old);
    }
    a.plan = keys.get(a.plan) || "";
    a.photos = a.photos.map((p) => ({ ...p, key: keys.get(p.key)! }));
    const r = await fetch("/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(a),
    });
    if (!r.ok) throw new Error(`Restore stopped after ${count} records. Existing records were preserved.`);
    count++;
  }
  return count;
}

export async function exportInterior(location: Location, assets: Asset[]) {
  const zip = new JSZip();
  const keys = [
    ...new Set(
      [
        ...(location.interior?.photos.map((p) => p.key) || []),
        location.interior?.section?.key || "",
        location.interior?.model?.key || "",
        location.layout?.reference?.key || "",
        ...assets.flatMap((a) => [a.plan, ...a.photos.map((p) => p.key)]),
      ].filter(Boolean),
    ),
  ];
  for (const key of keys) {
    const response = await fetch(mediaPath(key));
    if (!response.ok) throw new Error("Could not include a photo. Retry the download.");
    zip.file("media/" + mediaName(key), await response.blob());
  }
  for (const [url, name] of [
    ["/licenses/unreal-home-wizard-workflow.md", "UNREAL_WORKFLOW.md"],
    ["/licenses/unreal-home-wizard.txt", "UNREAL_LICENSE.txt"],
  ]) {
    const r = await fetch(url);
    if (!r.ok) throw new Error("Could not include the reconstruction workflow.");
    zip.file(name, await r.text());
  }
  zip.file(
    "assets.json",
    JSON.stringify(
      { schema: "stv-locate/v1", exportedAt: new Date().toISOString(), locations: [location], assets },
      null,
      2,
    ),
  );
  zip.file(
    "SCAN_TO_THREEJS_BRIEF.md",
    `# Photo-guided equipment location\nUse https://github.com/wesbos/3d-model-anything with its scan-to-threejs skill.\nInputs are camera photos in media/ and equipment metadata in assets.json. These are photo references, not a house-capture LiDAR export. Preserve unknown geometry and mark estimated dimensions. Use supplied measurements, matched-photo review and equipment labels. Export a self-contained GLB under 24 MB with standard geometry and embedded JPG/PNG textures for STV Locate. The asset IDs in assets.json identify the equipment to mark in the returned model.\n`,
  );
  zip.file(
    "HOME_PROJECT_BRIEF.md",
    `# Interior reconstruction handoff
Workflow: https://github.com/amirmushichge/unreal-home-wizard

Building: ${location.name}
Address: ${location.address}
Saved building pin: ${location.lat}, ${location.lng}
Interior notes and measurements (owner supplied): ${location.interior?.notes || "Not supplied"}
References: assets.json includes photo descriptions, the green building outline, and each machine’s independent info sheet. Original reference files are in media/.

Mode: STRICT RECONSTRUCTION. Confirm rights to the reference photos before construction. Do not treat roof coordinates as measured indoor positions. Missing dimensions, unseen walls and unphotographed rooms remain unknown. Never infer exact measurements from the aerial outline.
Required review gates: rough layout approval; matched-camera review; physical logic audit; manual walkthrough; final approval. Critical or major defects block release.
Deliverable: reviewed walkable Unreal project and an optional 3D section image to upload to STV Locate. This package contains references; it is not a generated 3D model. Unreal Engine, Epic sign-in, suitable rendering hardware and a reconstruction operator are required separately.
`,
  );
  download(await zip.generateAsync({ type: "blob" }), "STV-Interior-Reconstruction.zip");
}
