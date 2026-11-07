"use client";
import { useState } from "react";
import { Check, ClipboardCheck, Loader2, X } from "lucide-react";
import { readApiResponse } from "../lib/api-response";
type CheckResult = { name: string; ok: boolean; detail: string };
export default function PilotCheck() {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [checks, setChecks] = useState<CheckResult[]>([]);
  async function run() {
    setBusy(true);
    setChecks([]);
    const results: CheckResult[] = [];
    async function check(name: string, task: () => Promise<string>) {
      try {
        results.push({ name, ok: true, detail: await task() });
      } catch (e) {
        results.push({ name, ok: false, detail: (e as Error).message || "Check failed." });
      }
      setChecks([...results]);
    }
    try {
      await check("Backend storage", async () => {
        const j = await readApiResponse(
          await fetch("/api/status", { cache: "no-store", signal: AbortSignal.timeout(12000) }),
        );
        if (!j.ready) throw Error("Backend storage needs attention.");
        return "Database schema and photo-storage connectivity responded. No data was changed.";
      });
      let signedIn = false;
      await check("Your login", async () => {
        const j = await readApiResponse(
          await fetch("/api/session", { cache: "no-store", signal: AbortSignal.timeout(12000) }),
        );
        if (!j.signedIn) throw Error("Log in with ChatGPT, then run this check again.");
        signedIn = true;
        return "A valid private user session is present.";
      });
      if (signedIn)
        await check("Your cloud inventory", async () => {
          const [assets, locations] = await Promise.all([
            readApiResponse(
              await fetch("/api/assets", { cache: "no-store", signal: AbortSignal.timeout(12000) }),
            ),
            readApiResponse(
              await fetch("/api/locations", { cache: "no-store", signal: AbortSignal.timeout(12000) }),
            ),
          ]);
          if (!Array.isArray(assets.assets) || !Array.isArray(locations.locations))
            throw Error("Unexpected inventory response.");
          return "Your equipment and building lists loaded successfully.";
        });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="pilot-check">
      <button className="secondary" onClick={() => setOpen(!open)}>
        <ClipboardCheck size={17} />
        Client pilot checklist
      </button>
      {open && (
        <div className="pilot-check-body">
          <h3>Before your first field visit</h3>
          <p>
            Each invited tester signs in to their own private inventory. This pilot does not share your
            records between accounts.
          </p>
          <ol>
            <li>Log in and run the connection check below.</li>
            <li>Add one building and one equipment pin labeled TEST.</li>
            <li>Finish, refresh, and reopen that record. Verify its pin and room.</li>
            <li>Add a repair note, save, refresh, and confirm it remains.</li>
            <li>
              In cloud mode, add a photo. Reopen in another signed-in browser to check cloud persistence.
            </li>
          </ol>
          <p>
            Device capture is local to this browser. Export a backup; photos, address search and aerial
            imagery require a connection/cloud access as described in the app.
          </p>
          <button className="primary" disabled={busy} onClick={() => void run()}>
            {busy ? <Loader2 size={16} className="spin" /> : <ClipboardCheck size={16} />}Run connection check
          </button>
          <ul aria-live="polite">
            {checks.map((c) => (
              <li key={c.name} className={c.ok ? "pilot-pass" : "pilot-fail"}>
                {c.ok ? <Check size={16} /> : <X size={16} />}
                <span>
                  <b>{c.name}</b>
                  <br />
                  {c.detail}
                </span>
              </li>
            ))}
          </ul>
          <small>
            This read-only check does not prove a save, upload, GPS permission or map imagery works. Complete
            the manual checklist before relying on the pilot.
          </small>
        </div>
      )}
    </section>
  );
}
