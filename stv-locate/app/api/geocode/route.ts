import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { usableAddressResults } from "../../../lib/geocode-result";
export async function GET(request: Request) {
  if (!(await getChatGPTUser()))
    return Response.json({ error: "Sign in again to search addresses." }, { status: 401 });
  const input = new URL(request.url).searchParams;
  if (input.has("lat") || input.has("lng")) return reverse(input);
  const q = (input.get("q") || "").trim();
  if (q.length < 3 || q.length > 250)
    return Response.json({ error: "Enter a complete address." }, { status: 400 });
  try {
    const now = Date.now();
    const result = await env
      .DB!.prepare(
        "INSERT INTO rate_limits (id,time) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET time=excluded.time WHERE time < ? RETURNING time",
      )
      .bind("geocode", now, now - 1500)
      .all();
    if (!result.results.length)
      return Response.json({ error: "Please wait a moment and search again." }, { status: 429 });
    const street = (input.get("street") || "").trim(),
      city = (input.get("city") || "").trim(),
      state = (input.get("state") || "").trim(),
      postal = (input.get("postalcode") || "").trim();
    if ([street, city, state, postal].some((v) => v.length > 250))
      return Response.json({ error: "Address fields are too long." }, { status: 400 });
    const params = new URLSearchParams({ format: "jsonv2", limit: "5", addressdetails: "1" });
    if (street && !street.includes(",") && (city || state || postal)) {
      params.set("street", street);
      if (city) params.set("city", city);
      if (state) params.set("state", state);
      if (postal) params.set("postalcode", postal);
    } else params.set("q", q);
    const r = await fetch("https://nominatim.openstreetmap.org/search?" + params.toString(), {
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent": "STVLocate/1.0 (https://stv-locate.brannu5235.chatgpt.site)",
        "Accept-Language": "en",
      },
    });
    if (!r.ok) throw new Error();
    const results = await r.json();
    return Response.json(
      { results: usableAddressResults(results, street || q.split(",")[0], postal) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Address search is unavailable. Use Choose building on map instead." },
      { status: 503 },
    );
  }
}

/** Throttled shared provider slot; returns false when the caller must wait. */
async function takeSlot(id: string) {
  const now = Date.now();
  const result = await env
    .DB!.prepare(
      "INSERT INTO rate_limits (id,time) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET time=excluded.time WHERE time < ? RETURNING time",
    )
    .bind(id, now, now - 1100)
    .all();
  return result.results.length > 0;
}
/**
 * Nearest street address for a GPS fix or roof tap. Always labeled approximate:
 * the user still confirms the building, and the tapped point is never replaced
 * by the address point.
 */
async function reverse(input: URLSearchParams) {
  const lat = Number(input.get("lat")),
    lng = Number(input.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180)
    return Response.json({ error: "Invalid position." }, { status: 400 });
  try {
    if (!(await takeSlot("reverse-geocode")))
      return Response.json({ error: "Please wait a moment and retry." }, { status: 429 });
    const params = new URLSearchParams({
      format: "jsonv2",
      lat: lat.toFixed(7),
      lon: lng.toFixed(7),
      zoom: "18",
      addressdetails: "1",
    });
    const r = await fetch("https://nominatim.openstreetmap.org/reverse?" + params.toString(), {
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent": "STVLocate/1.0 (https://stv-locate.brannu5235.chatgpt.site)",
        "Accept-Language": "en",
      },
    });
    if (!r.ok) throw new Error();
    const raw = (await r.json()) as any;
    if (!raw || typeof raw.display_name !== "string")
      return Response.json({ result: null }, { headers: { "Cache-Control": "no-store" } });
    const a = raw.address || {};
    const street = [a.house_number, a.road].filter(Boolean).join(" ");
    const locality = a.city || a.town || a.village || a.suburb || "";
    const short = [street, locality, [a.state, a.postcode].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", ");
    return Response.json(
      {
        result: {
          address: (short || raw.display_name).slice(0, 250),
          name: typeof raw.name === "string" ? raw.name.slice(0, 250) : "",
          lat: Number(raw.lat),
          lng: Number(raw.lon),
          exact: Boolean(a.house_number),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Address lookup is unavailable. Type the address instead." },
      { status: 503 },
    );
  }
}
