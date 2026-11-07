import { and, eq, desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { assets } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { assetSchema } from "../../../lib/asset";
export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to access your assets." }, { status: 401 });
  try {
    const rows = await getDb()
      .select()
      .from(assets)
      .where(eq(assets.owner, user.userId))
      .orderBy(desc(assets.updated));
    return Response.json(
      { assets: rows.map((r) => JSON.parse(r.data)) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Could not load cloud records. Please retry." }, { status: 503 });
  }
}
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to save assets." }, { status: 401 });
  if (
    request.headers.get("X-STV-Expected-Owner") &&
    request.headers.get("X-STV-Expected-Owner") !== user.userId
  )
    return Response.json(
      { error: "Your account changed. Confirm the destination account before syncing." },
      { status: 403 },
    );
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin)
    return new Response("Forbidden", { status: 403 });
  try {
    const raw = await request.text();
    if (raw.length > 500000) return new Response("Record too large", { status: 413 });
    const a = assetSchema.parse(JSON.parse(raw));
    for (const key of [...a.photos.map((p) => p.key), a.plan].filter(Boolean)) {
      if (!key.startsWith(`${user.userId}/`))
        return Response.json({ error: "Invalid file ownership." }, { status: 400 });
    }
    const db = getDb();
    const found = await db.select().from(assets).where(eq(assets.id, a.id));
    if (found.length && found[0].owner !== user.userId) return new Response("Forbidden", { status: 403 });
    a.updated = new Date().toISOString();
    const written = await db
      .insert(assets)
      .values({ id: a.id, owner: user.userId, data: JSON.stringify(a), updated: a.updated })
      .onConflictDoUpdate({
        target: assets.id,
        set: { data: JSON.stringify(a), updated: a.updated },
        setWhere: eq(assets.owner, user.userId),
      })
      .returning({ id: assets.id });
    if (!written.length)
      return Response.json({ error: "Record belongs to another account." }, { status: 403 });
    return Response.json({ asset: a });
  } catch {
    return Response.json({ error: "Unable to save. Check required fields and try again." }, { status: 400 });
  }
}
export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin)
    return new Response("Forbidden", { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return new Response("Missing ID", { status: 400 });
  await getDb()
    .delete(assets)
    .where(and(eq(assets.id, id), eq(assets.owner, user.userId)));
  return Response.json({ ok: true });
}
