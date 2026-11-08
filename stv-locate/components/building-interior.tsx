"use client";
import { lazy, Suspense, useEffect, useState } from "react";
import type { Location } from "../lib/location";
import type { Asset } from "../lib/asset";
import { readApiResponse } from "../lib/api-response";
import { capturePhoto } from "../lib/capture-photo";
import { photoSource } from "../lib/field-store";
import { MAX_MODEL_BYTES, validateModel } from "../lib/model-file";
const ModelViewer = lazy(() => import("./model-viewer"));

type Props = {
  location: Location;
  assets: Asset[];
  save: (location: Location) => Promise<void>;
  deviceOnly?: boolean;
  onBusy?: (busy: boolean) => void;
  /** Render open inside the planner's Indoor plan & 3D panel (area photos are captured there instead). */
  inline?: boolean;
};
type ModelKind = "measured-scan" | "reconstruction" | "estimated";

export default function BuildingInterior({ location, assets, save, deviceOnly, onBusy, inline }: Props) {
  const [kind, setKind] = useState<ModelKind | "">("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notes, setNotes] = useState(location.interior?.notes || "");
  useEffect(() => {
    onBusy?.(busy);
    return () => onBusy?.(false);
  }, [busy, onBusy]);
  const interior = location.interior || { notes: "", photos: [] };
  async function uploadPhoto(file: File | undefined, section = false) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const key = await capturePhoto(file, Boolean(deviceOnly));
      const photo = { key, label: file.name.slice(0, 250) };
      await save({
        ...location,
        interior: {
          ...interior,
          notes,
          ...(section ? { section: photo } : { photos: [...interior.photos, photo] }),
        },
      });
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function uploadModel(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (file.size > MAX_MODEL_BYTES) throw Error("Choose a self-contained GLB under 24 MB.");
      validateModel(await file.arrayBuffer());
      const form = new FormData();
      form.append("file", file);
      const { key } = await readApiResponse(await fetch("/api/models", { method: "POST", body: form }));
      await save({
        ...location,
        interior: {
          ...interior,
          notes,
          model: {
            key,
            label: file.name.slice(0, 250),
            ...(kind ? { kind } : {}),
            uploaded: new Date().toISOString(),
          },
          modelPins: [],
        },
      });
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveNotes() {
    setBusy(true);
    setError("");
    try {
      await save({ ...location, interior: { ...interior, notes } });
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const Root = inline ? "div" : "details";
  return (
    <Root className={"building-interior" + (inline ? " inline" : "")}>
      {!inline && <summary>Interior photos & 3D section</summary>}
      {!inline && (
        <>
          <p>
            Capture each equipment area from several angles. Include the entrance, corners and machines. Add
            the area name and any measurements you know.
          </p>
          <label className="field">
            Interior notes / measured dimensions
            <textarea
              maxLength={5000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Area names, route from the entrance, measured wall lengths and missing views"
            />
          </label>
          <button className="secondary" disabled={busy} onClick={() => void saveNotes()}>
            Save interior notes
          </button>
          <div className="capture-actions">
            <label className="field">
              Take interior photo
              <input
                aria-label="Take interior photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                disabled={busy || interior.photos.length >= 12}
                onChange={(event) => {
                  void uploadPhoto(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
            <label className="field">
              Or choose an existing photo
              <input
                aria-label="Choose interior photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy || interior.photos.length >= 12}
                onChange={(event) => {
                  void uploadPhoto(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          <small>
            {interior.photos.length}/12 reference photos saved{" "}
            {deviceOnly ? "on this device" : "to this building"}
          </small>
          <div className="interior-photos">
            {interior.photos.map((photo, index) => (
              <figure key={photo.key}>
                <img src={photoSource(photo.key)} alt={photo.label} loading="lazy" />
                <label>
                  Room / view description
                  <input
                    maxLength={250}
                    defaultValue={photo.label}
                    disabled={busy}
                    onBlur={async (event) => {
                      const label = event.target.value;
                      if (label === photo.label) return;
                      setBusy(true);
                      setError("");
                      try {
                        await save({
                          ...location,
                          interior: {
                            ...interior,
                            notes,
                            photos: interior.photos.map((item, i) =>
                              i === index ? { ...item, label } : item,
                            ),
                          },
                        });
                      } catch (error) {
                        setError((error as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                </label>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await save({
                        ...location,
                        interior: {
                          ...interior,
                          notes,
                          photos: interior.photos.filter((item) => item.key !== photo.key),
                        },
                      });
                    } catch (error) {
                      setError((error as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Remove reference
                </button>
              </figure>
            ))}
          </div>
        </>
      )}
      <details className="reconstruction-tools" open={inline || undefined}>
        <summary>Build or import a 3D location</summary>
        <p>
          A 3D model is made outside this app, then imported here as a GLB. Pick the path that matches what
          you have. Your machines, photos and floor plan keep working without it.
        </p>
        <details className="reconstruction-guide">
          <summary>How to get a 3D model — step by step</summary>
          <h5>A · Measured scan (LiDAR iPhone Pro / iPad Pro)</h5>
          <ol>
            <li>
              Install the <b>3D Model Anything</b> iPhone app (github.com/wesbos/3d-model-anything,
              apps/house-capture). It is source-available and built with Xcode on a Mac; it is not on the App
              Store yet. Needs a LiDAR iPhone/iPad on iOS 17+.
            </li>
            <li>Scan the room, tap Finish room, then open it › Share room (.zip) › Save to Files.</li>
            <li>
              Instant floor plan: in STV Locate, Indoor plan & 3D › Import a measured LiDAR scan › choose that
              .zip. Walls come in measured, in metres.
            </li>
            <li>
              3D model: unzip on a computer, open <code>rooms/room-N.usdz</code> in Blender (File › Import ›
              Universal Scene Description), then File › Export › glTF 2.0 › Format “glTF Binary (.glb)”, Draco
              compression off. Upload below as “Measured scan”.
            </li>
          </ol>
          <h5>B · Photo-guided reconstruction (scan-to-threejs)</h5>
          <ol>
            <li>
              Capture this area photos from several angles, then tap Download reconstruction photos & brief.
            </li>
            <li>
              On a computer, clone github.com/wesbos/3d-model-anything and ask a coding agent to use the
              scan-to-threejs skill with the brief (or with a LiDAR export from path A for real measurements).
            </li>
            <li>
              Export the finished scene to one GLB with three.js GLTFExporter (binary: true, embedImages:
              true), or open it in Blender and export glTF Binary without Draco.
            </li>
            <li>
              Upload below as “Photo-guided reconstruction”. It is visual, not measured, unless built from a
              scan.
            </li>
          </ol>
          <h5>C · Unreal Home Wizard (Windows PC or Apple-silicon Mac with Unreal Engine 5.8)</h5>
          <ol>
            <li>
              Tap Download reconstruction photos & brief; the package includes the Unreal workflow notes.
            </li>
            <li>Run the Unreal Home Wizard skill in Codex and complete its review steps.</li>
            <li>
              In Unreal, enable the glTF Exporter plugin, select the room, File › Export Selected › .glb (no
              Draco). Upload below. Or upload a rendered section image instead.
            </li>
          </ol>
          <p>
            Accepted: a single self-contained .glb, under 24 MB, with embedded JPG/PNG textures. Draco,
            Meshopt and Basis-compressed files are rejected with a clear message.
          </p>
        </details>
        <button
          className="secondary"
          disabled={busy || !interior.photos.length}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const updated = { ...location, interior: { ...interior, notes } };
              await save(updated);
              const { exportInterior } = await import("../lib/export");
              await exportInterior(updated, assets);
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Download reconstruction photos & brief
        </button>
        {deviceOnly ? (
          <p>Sync this site to your account to upload a finished 3D model.</p>
        ) : (
          <>
            <label className="field">
              What is this model?
              <select
                aria-label="Model type"
                value={kind}
                onChange={(e) => setKind(e.target.value as ModelKind | "")}
              >
                <option value="">Choose before uploading</option>
                <option value="measured-scan">Measured scan (LiDAR / RoomPlan)</option>
                <option value="reconstruction">Photo-guided reconstruction</option>
                <option value="estimated">Estimated / hand-built model</option>
              </select>
            </label>
            <label className="field">
              Upload reconstructed 3D location
              <input
                aria-label="Upload reconstructed 3D location"
                type="file"
                accept=".glb,model/gltf-binary"
                disabled={busy || !kind}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (
                    file &&
                    interior.model &&
                    !confirm("Replace the current model and its indoor markers?")
                  ) {
                    event.target.value = "";
                    return;
                  }
                  void uploadModel(file);
                  event.target.value = "";
                }}
              />
            </label>
          </>
        )}
        <small>Self-contained GLB · up to 24 MB · keep the model scale from your reconstruction.</small>
        <label className="field">
          Upload a finished 3D section image
          <input
            aria-label="Upload finished 3D section"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(event) => {
              void uploadPhoto(event.target.files?.[0], true);
              event.target.value = "";
            }}
          />
        </label>
        {interior.section ? (
          <figure>
            <img
              className="finished-section"
              src={photoSource(interior.section.key)}
              alt="Uploaded interior 3D section"
            />
            <figcaption>{interior.section.label}</figcaption>
          </figure>
        ) : (
          <small>No completed 3D section yet.</small>
        )}
      </details>
      {interior.model && !deviceOnly && (
        <Suspense fallback={<p>Loading model viewer…</p>}>
          <ModelViewer location={location} assets={assets} save={save} />
        </Suspense>
      )}
      {busy && <p role="status">Saving…</p>}
      {error && <p role="alert">{error}</p>}
    </Root>
  );
}
