export type GpsResult =
  | { ok: true; lat: number; lng: number; accuracy: number }
  | { ok: false; reason: "unsupported" | "insecure" | "denied" | "unavailable" | "timeout"; message: string };

const messages = {
  unsupported: "This browser has no GPS access. Type the street address, or tap your building on the map.",
  insecure:
    "GPS only works on a secure (https) page. Type the street address, or tap your building on the map.",
  denied:
    "Location permission is off for this site. Type the street address or tap your building on the map. To use GPS, allow Location for this site in your browser settings (iPhone: Settings › Safari › Location).",
  unavailable:
    "Your phone could not get a GPS fix here. Step outside or near a window and retry, or type the street address.",
  timeout: "GPS took too long. Retry, or type the street address instead.",
} as const;

/** One explicit, high-accuracy GPS reading with a clear reason when it fails. */
export function readGps(timeout = 15000): Promise<GpsResult> {
  if (typeof window !== "undefined" && window.isSecureContext === false)
    return Promise.resolve({ ok: false, reason: "insecure", message: messages.insecure });
  if (typeof navigator === "undefined" || !navigator.geolocation)
    return Promise.resolve({ ok: false, reason: "unsupported", message: messages.unsupported });
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const { latitude: lat, longitude: lng, accuracy } = p.coords;
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) {
          resolve({ ok: false, reason: "unavailable", message: messages.unavailable });
          return;
        }
        resolve({ ok: true, lat, lng, accuracy: Number.isFinite(accuracy) ? Math.max(0, accuracy) : 0 });
      },
      (error) => {
        const reason = error?.code === 1 ? "denied" : error?.code === 3 ? "timeout" : "unavailable";
        resolve({ ok: false, reason, message: messages[reason] });
      },
      { enableHighAccuracy: true, timeout, maximumAge: 5000 },
    );
  });
}

/** Great-circle distance in metres. */
export function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (n: number) => (n * Math.PI) / 180;
  const dLat = r(b.lat - a.lat),
    dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)));
}
