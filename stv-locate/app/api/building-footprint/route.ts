import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { footprintAt, pointSchema } from "../../../lib/building-outline";
export async function GET(request: Request) {
  if (!(await getChatGPTUser()))
    return Response.json({ error: "Trace the roof corners manually in device mode." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  if (!params.has("lat") || !params.has("lng"))
    return Response.json({ error: "Choose a building on the map." }, { status: 400 });
  const parsed = pointSchema.safeParse({ lat: Number(params.get("lat")), lng: Number(params.get("lng")) });
  if (!parsed.success) return Response.json({ error: "Invalid building position." }, { status: 400 });
  try {
    const now = Date.now();
    const rate = await env
      .DB!.prepare(
        "INSERT INTO rate_limits (id,time) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET time=excluded.time WHERE time < ? RETURNING time",
      )
      .bind("building-footprint", now, now - 1500)
      .all();
    if (!rate.results.length)
      return Response.json({ error: "Wait a moment or trace the roof corners." }, { status: 429 });
    const { lat, lng } = parsed.data;
    const query = `[out:json][timeout:8];way["building"](around:120,${lat},${lng});out geom;`;
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "STVLocate/1.0" },
    });
    if (!response.ok) throw Error();
    const text = await response.text();
    if (text.length > 2000000) throw Error();
    return Response.json(
      { outline: footprintAt(JSON.parse(text), parsed.data) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Building outlines are unavailable. Trace the roof corners instead." },
      { status: 503 },
    );
  }
}
