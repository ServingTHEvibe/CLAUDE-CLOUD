import React from "react";
import { it, expect, vi, beforeEach, afterEach, describe } from "vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { outlineResponse } from "./outline-fixture";
import InventoryPlanner from "../components/inventory-planner";
import Home from "../app/page";
import { newAsset, type Asset } from "../lib/asset";
import type { Location } from "../lib/location";
import { readPlannerSession } from "../lib/planner-session";
import { readDeviceCapture } from "../lib/field-store";

// Map double: explicit taps at fixed coordinates, one button per marker, and the props it was given.
vi.mock("../components/asset-map", () => ({
  default: (p: any) => (
    <div data-testid="map">
      <button onClick={() => p.picking && p.onPick(41.5901234, -93.6212345)}>Tap map spot A</button>
      <button onClick={() => p.picking && p.onPick(41.5902345, -93.6213456)}>Tap map spot B</button>
      <button onClick={() => p.onViewChange?.({ lat: 41.591, lng: -93.62, zoom: 120 })}>
        Adjust map view
      </button>
      {p.assets.map((a: any) => (
        <button key={a.id} onClick={() => p.onSelect(a.id)}>
          {"Marker " + a.name}
        </button>
      ))}
      <output data-testid="you-are-here">{p.userPosition ? JSON.stringify(p.userPosition) : ""}</output>
      <output data-testid="picking">{String(p.picking)}</output>
    </div>
  ),
}));

let records: Asset[], buildings: Location[], requests: { url: string; method: string; body: any }[];
let failNext: Record<string, Response | "lost" | undefined>;
const cafe: Location = {
  id: "c6645139-c856-4df0-97e5-d597357cc314",
  name: "Test Cafe",
  address: "123 Test St, Des Moines",
  businessType: "Vending & micro markets",
  lat: 41.59,
  lng: -93.62,
  zoom: 230,
  updated: "2026-10-07",
};
function backend() {
  return vi.fn(async (url: any, init: any = {}) => {
    const u = String(url),
      method = init.method || "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    requests.push({ url: u, method, body });
    const path = u.split("?")[0];
    const fail = failNext[path + " " + method];
    if (fail && fail !== "lost") {
      failNext[path + " " + method] = undefined;
      return fail;
    }
    if (u === "/api/session")
      return Response.json({
        signedIn: true,
        user: { id: "owner-a", name: "Tester", email: "t@example.test" },
      });
    if (path === "/api/building-footprint") return outlineResponse(u);
    if (path === "/api/geocode") {
      if (u.includes("lat="))
        return Response.json({
          result: { address: "1550 Test Ave, Des Moines, IA 50309", name: "", lat: 0, lng: 0, exact: true },
        });
      return Response.json({
        results: [
          {
            place_id: 1,
            lat: "41.592",
            lon: "-93.631",
            display_name: "Sample St, Des Moines, Iowa",
            name: "",
            location_hint: "approximate_area",
          },
        ],
      });
    }
    if (path === "/api/files" && method === "POST")
      return Response.json({ key: "owner-a/" + crypto.randomUUID() });
    if (path === "/api/locations") {
      if (method === "POST") {
        buildings = [body, ...buildings.filter((b) => b.id !== body.id)];
        return Response.json({ location: body });
      }
      return Response.json({ locations: buildings });
    }
    if (path === "/api/assets") {
      if (method === "POST") {
        records = [body, ...records.filter((r) => r.id !== body.id)];
        if (fail === "lost") {
          failNext[path + " " + method] = undefined;
          return new Response("<html>Bad gateway</html>", {
            status: 502,
            headers: { "Content-Type": "text/html" },
          });
        }
        return Response.json({ asset: body });
      }
      return Response.json({ assets: records });
    }
    throw Error("Unexpected request " + u);
  });
}
beforeEach(() => {
  localStorage.clear();
  records = [];
  buildings = [cafe];
  requests = [];
  failNext = {};
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
  vi.stubGlobal("fetch", backend());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Planner({
  owner = "cloud:owner-a",
  onClose = () => {},
}: {
  owner?: string;
  onClose?: (s?: any) => void;
}) {
  const [assets, setAssets] = React.useState<Asset[]>(records);
  return (
    <InventoryPlanner
      owner={owner}
      assets={assets}
      onSaved={(a) => setAssets((prev) => [a, ...prev.filter((x) => x.id !== a.id)])}
      onClose={onClose}
    />
  );
}
async function openCafe() {
  render(<Planner />);
  await userEvent.click(await screen.findByRole("button", { name: /Test Cafe/ }));
  await screen.findByRole("button", { name: "Add equipment" });
}
async function placeAt(spot: "A" | "B" = "A") {
  await userEvent.click(screen.getByRole("button", { name: "Add equipment" }));
  await userEvent.click(screen.getByRole("button", { name: "Tap map spot " + spot }));
}
const geo = (impl: (ok: any, fail: any) => void) =>
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: impl },
  });

describe("Finding and confirming the building", () => {
  it("uses GPS: shows you-are-here, fills the nearest address and saves the building where the user confirms", async () => {
    geo((ok) => ok({ coords: { latitude: 41.5905, longitude: -93.6205, accuracy: 15 } }));
    render(<Planner />);
    await userEvent.click(screen.getByRole("button", { name: "Use my GPS" }));
    await screen.findByText("GPS position");
    expect(JSON.parse(screen.getByTestId("you-are-here").textContent!)).toMatchObject({
      lat: 41.5905,
      accuracy: 15,
    });
    await waitFor(() =>
      expect((screen.getByLabelText("Address") as HTMLInputElement).value).toBe(
        "1550 Test Ave, Des Moines, IA 50309",
      ),
    );
    // Correct the pin by tapping the actual roof.
    await userEvent.click(screen.getByRole("button", { name: "Tap map spot A" }));
    await userEvent.type(screen.getByLabelText("Business / building name"), "GPS Plant");
    await userEvent.click(screen.getByRole("button", { name: "Confirm building" }));
    await screen.findByText("Tap where the machine is");
    const saved = buildings.find((b) => b.name === "GPS Plant")!;
    expect(saved).toMatchObject({
      lat: 41.5901234,
      lng: -93.6212345,
      address: "1550 Test Ave, Des Moines, IA 50309",
    });
    expect(saved.outline?.points.length).toBeGreaterThan(2);
    expect(records).toHaveLength(0); // GPS never silently creates equipment
  });

  it("explains denied GPS and offers address and map fallbacks without assuming a location", async () => {
    geo((_ok, fail) => fail({ code: 1 }));
    render(<Planner />);
    await userEvent.click(screen.getByRole("button", { name: "Use my GPS" }));
    await screen.findByText(/Location permission is off/);
    expect(screen.getByTestId("you-are-here").textContent).toBe("");
    expect(screen.queryByRole("button", { name: "Confirm building" })).toBeNull();
    await userEvent.click(screen.getAllByRole("button", { name: "Pick building on map" })[0]);
    await userEvent.click(screen.getByRole("button", { name: "Tap map spot B" }));
    expect(screen.getByRole("button", { name: "Confirm building" })).toBeDefined();
  });

  it("labels an approximate address match, keeps the address while the roof is corrected, and clears stale results", async () => {
    render(<Planner />);
    await userEvent.type(screen.getByLabelText("Street address"), "Sample St");
    await userEvent.click(screen.getByRole("button", { name: "Find address" }));
    expect(await screen.findByText("Approximate — check the roof")).toBeDefined();
    await userEvent.type(screen.getByLabelText("Street address"), " Des Moines");
    expect(screen.queryByText("Approximate — check the roof")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Find address" }));
    await userEvent.click(await screen.findByRole("button", { name: /Sample St, Des Moines, Iowa/ }));
    await screen.findByText("Approximate address match");
    await userEvent.click(screen.getByRole("button", { name: "Tap map spot A" }));
    expect((screen.getByLabelText("Address") as HTMLInputElement).value).toBe("Sample St, Des Moines, Iowa");
    await userEvent.type(screen.getByLabelText("Business / building name"), "Sample Office");
    await userEvent.click(screen.getByRole("button", { name: "Confirm building" }));
    await screen.findByText("Tap where the machine is");
    expect(buildings[0]).toMatchObject({ name: "Sample Office", lat: 41.5901234, lng: -93.6212345 });
  });

  it("offers picking on the map when an address has no match", async () => {
    render(<Planner />);
    await waitFor(() => expect(requests.some((r) => r.url === "/api/locations")).toBe(true));
    vi.mocked(fetch).mockImplementationOnce(async () => Response.json({ results: [] }));
    await userEvent.type(screen.getByLabelText("Street address"), "1 Nowhere Rd");
    await userEvent.click(screen.getByRole("button", { name: "Find address" }));
    await screen.findByText(/No match for that address/);
    expect(screen.getAllByRole("button", { name: "Pick building on map" }).length).toBeGreaterThan(0);
  });

  it("opens a saved building directly and shows the building pin, not an equipment record", async () => {
    await openCafe();
    expect(screen.getByRole("button", { name: "Marker Test Cafe" })).toBeDefined();
    expect(screen.getByTestId("picking").textContent).toBe("false");
    // Blank-map taps do nothing until Add equipment is chosen.
    await userEvent.click(screen.getByRole("button", { name: "Tap map spot A" }));
    expect(screen.queryByLabelText("Machine name")).toBeNull();
  });
});

describe("Adding machines", () => {
  it("saves three machines in one area (two at the identical point), another on a different floor, each with its own sheet", async () => {
    await openCafe();
    await placeAt("A");
    await userEvent.click(screen.getByRole("button", { name: "Drink vending machine" }));
    await userEvent.type(screen.getByLabelText("Room / area"), "Breakroom");
    await userEvent.click(screen.getByRole("button", { name: "Save & add another" }));
    await waitFor(() => expect(records).toHaveLength(1));
    // Same spot, same room carried over, but a fresh empty record.
    expect(screen.getAllByText(/Same spot as “Drink vending machine”/).length).toBeGreaterThan(0);
    expect((screen.getByLabelText("Room / area") as HTMLInputElement).value).toBe("Breakroom");
    expect((screen.getByLabelText("Machine name") as HTMLInputElement).value).toBe("");
    await userEvent.click(screen.getByRole("button", { name: "Snack vending machine" }));
    await userEvent.click(screen.getByRole("button", { name: "Save & add another" }));
    await waitFor(() => expect(records).toHaveLength(2));
    await userEvent.click(screen.getByRole("button", { name: "Tap map spot B" }));
    await userEvent.type(screen.getByLabelText("Other type"), "Cooler");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(records).toHaveLength(3));
    await userEvent.click(screen.getByRole("button", { name: "Back to all machines" }));
    await placeAt("B");
    await userEvent.click(screen.getByRole("button", { name: "Coffee station" }));
    await userEvent.type(screen.getByLabelText("Room / area"), "Shipping office");
    await userEvent.clear(screen.getByLabelText("Floor"));
    await userEvent.type(screen.getByLabelText("Floor"), "2");
    await userEvent.type(screen.getByLabelText("How to find it"), "East stairs, first left");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(records).toHaveLength(4));

    const drink = records.find((r) => r.name === "Drink vending machine")!,
      snack = records.find((r) => r.name === "Snack vending machine")!;
    expect(new Set(records.map((r) => r.id)).size).toBe(4);
    expect([drink.lat, drink.lng]).toEqual([snack.lat, snack.lng]);
    expect(records.find((r) => r.name === "Cooler")).toMatchObject({
      lat: 41.5902345,
      room: "Breakroom",
      siteId: cafe.id,
    });
    expect(records.find((r) => r.name === "Coffee station")).toMatchObject({
      floor: "2",
      room: "Shipping office",
      entrance: "East stairs, first left",
    });

    // Overlapping markers open a chooser; each choice opens its own sheet.
    await userEvent.click(screen.getByRole("button", { name: "Back to all machines" }));
    await userEvent.click(screen.getByRole("button", { name: "Marker Drink vending machine" }));
    const chooser = await screen.findByRole("region", { name: "Choose equipment pin" });
    await userEvent.click(
      within(chooser).getByRole("button", { name: /Open info sheet: Snack vending machine/ }),
    );
    expect(screen.getByRole("article", { name: "Machine: Snack vending machine" })).toBeDefined();
    expect(screen.getByText(new RegExp(snack.id))).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Back to all machines" }));
    for (const r of records) {
      await userEvent.click(screen.getByRole("button", { name: new RegExp("^" + r.name) }));
      expect(screen.getByRole("article", { name: "Machine: " + r.name })).toBeDefined();
      await userEvent.click(screen.getByRole("button", { name: "Back to all machines" }));
    }
  });

  it("keeps the form after a failed save and never duplicates when the first save actually reached the server", async () => {
    await openCafe();
    await placeAt();
    await userEvent.click(screen.getByRole("button", { name: "Drink vending machine" }));
    await userEvent.type(screen.getByLabelText("Room / area"), "Lobby");
    failNext["/api/assets POST"] = Response.json({ error: "Network unavailable" }, { status: 503 });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(/Network unavailable/);
    expect((screen.getByLabelText("Room / area") as HTMLInputElement).value).toBe("Lobby");
    expect(records).toHaveLength(0);
    failNext["/api/assets POST"] = "lost"; // stored, but the reply never arrives
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(/cloud connection is unavailable/i);
    expect(records).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("article", { name: "Machine: Drink vending machine" });
    expect(records).toHaveLength(1);
    expect(
      requests.filter((r) => r.url === "/api/assets" && r.method === "POST").map((r) => r.body.id),
    ).toEqual(Array(3).fill(records[0].id));
  });

  it("ignores repeat taps while a save is in flight", async () => {
    await openCafe();
    await placeAt();
    await userEvent.click(screen.getByRole("button", { name: "Drink vending machine" }));
    const save = screen.getByRole("button", { name: "Save" });
    save.click();
    save.click();
    save.click();
    await screen.findByRole("article", { name: "Machine: Drink vending machine" });
    expect(requests.filter((r) => r.url === "/api/assets" && r.method === "POST")).toHaveLength(1);
  });

  it("shows photo upload state, keeps a failed photo for retry and allows at most three", async () => {
    await openCafe();
    await placeAt();
    await userEvent.click(screen.getByRole("button", { name: "Drink vending machine" }));
    failNext["/api/files POST"] = Response.json({ error: "Upload unavailable" }, { status: 503 });
    await userEvent.upload(
      screen.getByLabelText("Take photo"),
      new File(["a"], "a.jpg", { type: "image/jpeg" }),
    );
    await screen.findByText("Upload unavailable");
    expect(screen.getByRole("button", { name: "Save & add another" })).toHaveProperty("disabled", false);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Attached");
    await userEvent.upload(
      screen.getByLabelText("Upload photo"),
      new File(["b"], "b.jpg", { type: "image/jpeg" }),
    );
    await userEvent.upload(
      screen.getByLabelText("Take photo"),
      new File(["c"], "c.jpg", { type: "image/jpeg" }),
    );
    await waitFor(() => expect(screen.getAllByText("Attached")).toHaveLength(3));
    expect(screen.getByLabelText("Take photo")).toHaveProperty("disabled", true);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(records[0]?.photos).toHaveLength(3));
    expect(new Set(records[0].photos.map((p) => p.label)).size).toBe(3);
    expect(records[0].photos.every((p) => p.key.startsWith("owner-a/"))).toBe(true);
  });

  it("captures an area photo on the building and links the machines in that room", async () => {
    records = [
      {
        ...newAsset(),
        siteId: cafe.id,
        name: "Drinks",
        site: cafe.name,
        address: cafe.address,
        room: "Breakroom",
      },
      {
        ...newAsset(),
        siteId: cafe.id,
        name: "Snacks",
        site: cafe.name,
        address: cafe.address,
        room: "Breakroom",
      },
      {
        ...newAsset(),
        siteId: cafe.id,
        name: "Lobby coffee",
        site: cafe.name,
        address: cafe.address,
        room: "Lobby",
      },
    ];
    await openCafe();
    await userEvent.type(screen.getByLabelText("Area name for the next area photo"), "Breakroom");
    await userEvent.upload(
      screen.getByLabelText("Capture this area"),
      new File(["x"], "room.jpg", { type: "image/jpeg" }),
    );
    await waitFor(() => expect(buildings[0].interior?.photos).toHaveLength(1));
    const photo = buildings[0].interior!.photos[0];
    expect(photo.label).toBe("Breakroom");
    expect(new Set(photo.assetIds)).toEqual(
      new Set(records.filter((r) => r.room === "Breakroom").map((r) => r.id)),
    );
    expect(buildings[0]).toMatchObject({ lat: cafe.lat, lng: cafe.lng });
  });

  it("moves only the chosen machine, only after a new tap, without creating a record", async () => {
    const a = {
      ...newAsset(),
      siteId: cafe.id,
      name: "Ice maker",
      site: cafe.name,
      address: cafe.address,
      lat: 41.59,
      lng: -93.62,
    };
    const b = {
      ...newAsset(),
      siteId: cafe.id,
      name: "Neighbour",
      site: cafe.name,
      address: cafe.address,
      lat: 41.59,
      lng: -93.62,
    };
    records = [a, b];
    await openCafe();
    await userEvent.click(screen.getByRole("button", { name: /^Ice maker/ }));
    await userEvent.click(screen.getByRole("button", { name: "Move pin" }));
    expect(screen.getByRole("button", { name: "Tap the map to move it" })).toHaveProperty("disabled", true);
    await userEvent.click(screen.getByRole("button", { name: "Tap map spot B" }));
    await userEvent.click(screen.getByRole("button", { name: "Save new position" }));
    await waitFor(() => expect(records.find((r) => r.id === a.id)!.lat).toBe(41.5902345));
    expect(records).toHaveLength(2);
    expect(records.find((r) => r.id === b.id)).toMatchObject({ lat: 41.59, lng: -93.62 });
  });

  it("saves the map view separately from the building pin", async () => {
    await openCafe();
    await userEvent.click(screen.getByRole("button", { name: "Adjust map view" }));
    await userEvent.click(screen.getByRole("button", { name: "Building options" }));
    await userEvent.click(screen.getByRole("button", { name: "Save current map view for this building" }));
    await waitFor(() => expect(buildings[0].mapView).toEqual({ lat: 41.591, lng: -93.62, zoom: 120 }));
    expect(buildings[0]).toMatchObject({ lat: cafe.lat, lng: cafe.lng, zoom: cafe.zoom });
  });

  it("offers sign-in recovery for plain-text 401s and readable errors for gateway HTML, keeping the draft", async () => {
    await openCafe();
    await placeAt();
    await userEvent.click(screen.getByRole("button", { name: "Snack vending machine" }));
    failNext["/api/assets POST"] = new Response("<html>gateway</html>", {
      status: 502,
      headers: { "Content-Type": "text/html" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(/cloud connection is unavailable/i);
    failNext["/api/assets POST"] = new Response("Unauthorized", { status: 401 });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const link = await screen.findByRole("link", { name: "Sign in again — your draft is kept" });
    expect(link.getAttribute("href")).toBe("/signin-with-chatgpt?return_to=%2F%3Fresume%3D1");
    expect(link.getAttribute("target")).toBe("_top");
    expect(readPlannerSession("cloud:owner-a")?.draft?.equipmentType).toBe("Snack vending machine");
  });
});

describe("Drafts survive reloads", () => {
  it("restores the building and the unsaved machine after a reload, only for the same owner", async () => {
    await openCafe();
    await placeAt();
    await userEvent.click(screen.getByRole("button", { name: "Drink vending machine" }));
    await userEvent.type(screen.getByLabelText("Room / area"), "Breakroom");
    const draftId = readPlannerSession("cloud:owner-a")!.draft!.id;
    cleanup(); // simulate the camera crash / reload
    render(<Planner owner="cloud:someone-else" />);
    await screen.findByRole("button", { name: "Use my GPS" });
    expect(screen.queryByText(/We restored your unsaved work/)).toBeNull();
    cleanup();
    render(<Planner />);
    await screen.findByText(/We restored your unsaved work/);
    expect(((await screen.findByLabelText("Room / area")) as HTMLInputElement).value).toBe("Breakroom");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(records).toHaveLength(1));
    expect(records[0].id).toBe(draftId);
  });

  it("clears the session on Finish and reports how many machines were saved", async () => {
    const onClose = vi.fn();
    render(<Planner onClose={onClose} />);
    await userEvent.click(await screen.findByRole("button", { name: /Test Cafe/ }));
    await placeAt();
    await userEvent.click(screen.getByRole("button", { name: "Drink vending machine" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(records).toHaveLength(1));
    await userEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(onClose).toHaveBeenCalledWith({ saved: 1, building: "Test Cafe" });
    expect(readPlannerSession("cloud:owner-a")).toBeNull();
  });

  it("reopens the planner from the home screen after a reload mid-session (device capture)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: any) => {
        if (url === "/api/session") return Response.json({ signedIn: false, user: null });
        if (String(url).startsWith("/api/building-footprint"))
          return Response.json({ error: "Sign in" }, { status: 401 });
        if (String(url).startsWith("/api/geocode"))
          return Response.json({ error: "Sign in" }, { status: 401 });
        return Response.json({ assets: [], locations: [] });
      }),
    );
    const app = render(<Home />);
    await screen.findByText("Cloud login needed");
    await userEvent.click(screen.getByRole("button", { name: "Add equipment on this device" }));
    await userEvent.click(screen.getAllByRole("button", { name: /Or tap your building on the map/ })[0]);
    await userEvent.click(screen.getByRole("button", { name: "Tap map spot A" }));
    await screen.findByText(/continue without one/);
    await userEvent.type(screen.getByLabelText("Business / building name"), "Device Plant");
    await userEvent.type(screen.getByLabelText("Address"), "9 Field Rd");
    await userEvent.click(screen.getByRole("button", { name: "Confirm building" }));
    await screen.findByText("Tap where the machine is");
    await userEvent.click(screen.getByRole("button", { name: "Tap map spot B" }));
    await userEvent.click(screen.getByRole("button", { name: "Drink vending machine" }));
    await userEvent.upload(
      screen.getByLabelText("Take photo"),
      new File(["p"], "p.jpg", { type: "image/jpeg" }),
    );
    await screen.findByText("Attached");
    app.unmount();
    render(<Home />);
    await screen.findByText(/We restored your unsaved work/);
    expect(
      (await screen.findByRole("button", { name: "Drink vending machine" })).getAttribute("aria-pressed"),
    ).toBe("true");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(readDeviceCapture().assets).toHaveLength(1));
    const saved = readDeviceCapture();
    expect(saved.assets[0]).toMatchObject({
      lat: 41.5902345,
      lng: -93.6213456,
      siteId: saved.locations[0].id,
    });
    expect(saved.assets[0].photos[0].key).toMatch(/^device-photo:/);
    expect(saved.locations[0]).toMatchObject({ name: "Device Plant", lat: 41.5901234 });
  });
});
