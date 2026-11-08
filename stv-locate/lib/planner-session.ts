import { z } from "zod";
import { assetSchema, type Asset } from "./asset";
import { outlineSchema } from "./building-outline";

/**
 * The in-progress "Add equipment" session, persisted on every change so that an
 * iOS camera reload, an accidental refresh, a sign-in redirect or a crash never
 * loses the building being confirmed or the machine being typed.
 *
 * It only stores the signed-in user's own draft (or device-capture draft) and is
 * keyed by storage mode and owner, so another account on the same browser never
 * sees or saves someone else's draft.
 */
const point = z.object({ lat: z.number().min(-85).max(85), lng: z.number().min(-180).max(180) });
const candidateSchema = point.extend({
  /** Stable ID chosen once, so a retried building save can never create a duplicate. */
  id: z.string().uuid(),
  name: z.string().max(250),
  address: z.string().max(250),
  businessType: z.string().max(250),
  source: z.enum(["gps", "address", "map", "edit"]),
  approximate: z.boolean(),
  /** What the address/GPS service returned, kept separate from where the user tapped. */
  hint: z.string().max(400).optional(),
  mapProvider: z.literal("google").optional(),
  outline: outlineSchema.optional(),
  zoom: z.number().min(30).max(20000000),
});
export const gpsFixSchema = point.extend({
  accuracy: z.number().min(0).max(1000000),
  at: z.string().max(50),
});
const pendingPhotoSchema = z.object({
  id: z.string().max(80),
  label: z.string().max(250),
  status: z.enum(["uploading", "failed"]),
  error: z.string().max(400).optional(),
  /** "asset" = machine photo slot, "area" = Capture this area. */
  target: z.enum(["asset", "area"]),
});
export const plannerSessionSchema = z.object({
  version: z.literal(1),
  owner: z.string().max(200),
  stage: z.enum(["find", "confirm", "site"]),
  candidate: candidateSchema.optional(),
  locationId: z.string().uuid().optional(),
  draft: assetSchema.optional(),
  /** "new" drafts have never been saved; "edit" drafts edit an existing machine. */
  draftKind: z.enum(["new", "edit"]).optional(),
  pending: z.array(pendingPhotoSchema).max(20).default([]),
  areaLabel: z.string().max(250).optional(),
  gps: gpsFixSchema.optional(),
  savedCount: z.number().int().min(0).max(100000).default(0),
  updated: z.string().max(50),
});
export type PlannerSession = z.infer<typeof plannerSessionSchema>;
export type BuildingCandidate = z.infer<typeof candidateSchema>;
export type PendingPhoto = z.infer<typeof pendingPhotoSchema>;
export type GpsFix = z.infer<typeof gpsFixSchema>;

const KEY = "stv-locate.planner-session.v1";
export function sessionOwner(mode: "cloud" | "device", userId?: string | null) {
  return mode === "device" ? "device" : "cloud:" + (userId || "");
}
const keyFor = (owner: string) => KEY + ":" + owner;
export function readPlannerSession(owner: string): PlannerSession | null {
  try {
    const raw = localStorage.getItem(keyFor(owner));
    if (!raw) return null;
    const parsed = plannerSessionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.owner !== owner) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
/** Returns false if the browser refused to store the draft (private mode / quota). */
export function writePlannerSession(session: Omit<PlannerSession, "updated" | "version">) {
  try {
    const value = plannerSessionSchema.parse({ ...session, version: 1, updated: new Date().toISOString() });
    localStorage.setItem(keyFor(value.owner), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function clearPlannerSession(owner: string) {
  try {
    localStorage.removeItem(keyFor(owner));
  } catch {}
}
/** True when the draft holds anything the user typed or captured that is not yet saved. */
export function draftHasWork(draft: Asset | undefined, pending: PendingPhoto[]) {
  if (pending.length) return true;
  if (!draft) return false;
  return Boolean(
    draft.name.trim() ||
    draft.equipmentType?.trim() ||
    draft.room.trim() ||
    draft.notes.trim() ||
    draft.model.trim() ||
    draft.serial.trim() ||
    draft.tag.trim() ||
    draft.entrance.trim() ||
    draft.photos.length,
  );
}
