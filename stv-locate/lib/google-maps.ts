"use client";
import { useSyncExternalStore } from "react";
import { usableAddressResults } from "./geocode-result";
const storageKey = "stv-locate.google-browser-key.v1";
let currentKey = "",
  hydrated = false;
const listeners = new Set<() => void>();
function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    currentKey = sessionStorage.getItem(storageKey) || localStorage.getItem(storageKey) || "";
  } catch {}
}
export function getGoogleKey() {
  hydrate();
  return currentKey;
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  const sync = () => {
    hydrated = false;
    hydrate();
    listeners.forEach((f) => f());
  };
  window.addEventListener("storage", sync);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", sync);
  };
}
export function useGoogleKey() {
  return useSyncExternalStore(subscribe, getGoogleKey, () => "");
}
export function saveGoogleKey(key: string, remember: boolean) {
  const value = key.trim();
  if (value && !/^AIza[\w-]{30,60}$/.test(value))
    throw Error("Paste a Google Maps browser API key, starting with AIza.");
  // This is a public, website-restricted browser credential, never a server secret.
  try {
    if (value) {
      (remember ? localStorage : sessionStorage).setItem(storageKey, value);
      (remember ? sessionStorage : localStorage).removeItem(storageKey);
    } else {
      localStorage.removeItem(storageKey);
      sessionStorage.removeItem(storageKey);
    }
  } catch {
    throw Error("Browser storage is unavailable. Allow storage for this app and try again.");
  }
  currentKey = value;
  hydrated = true;
  listeners.forEach((f) => f());
}
export function googleError(code: string) {
  if (/ZERO_RESULTS/.test(code))
    return "Google found no matching address. Check the street, city and ZIP, or choose the building on the map.";
  if (/OVER_QUERY_LIMIT|OVER_DAILY_LIMIT/.test(code))
    return "Google Maps quota was reached. Check your Google Cloud quota and billing.";
  if (/REQUEST_DENIED|AUTH/.test(code))
    return "Google rejected this key. Enable Maps JavaScript API and Geocoding API, check billing, and allow this website in the key restrictions.";
  return "Google Maps could not connect. Check your connection, enabled APIs, billing and website restriction, then retry.";
}
let loadedKey = "",
  loading: Promise<any> | null = null;
const mapsWindow = () =>
  window as typeof window & { google?: any; gm_authFailure?: () => void; __stvGoogleReady?: () => void };
export function loadGoogleMaps(key: string): Promise<any> {
  if (!key)
    return Promise.reject(Error("Open Google Maps setup and enter your website-restricted browser key."));
  if (loadedKey && loadedKey !== key)
    return Promise.reject(Error("The key changed. Save it, then reload this page to reconnect Google Maps."));
  if (loading) return loading;
  loadedKey = key;
  loading = new Promise((resolve, reject) => {
    const w = mapsWindow(),
      script = document.createElement("script");
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      delete w.__stvGoogleReady;
      if (error) {
        script.remove();
        reject(error);
      } else resolve(w.google.maps);
    };
    const timeout = setTimeout(() => finish(Error(googleError("TIMEOUT"))), 20000);
    w.gm_authFailure = () => {
      finish(Error(googleError("AUTH")));
      window.dispatchEvent(new Event("stv-google-auth-error"));
    };
    w.__stvGoogleReady = () =>
      w.google?.maps?.importLibrary ? finish() : finish(Error(googleError("LOAD")));
    script.src =
      "https://maps.googleapis.com/maps/api/js?" +
      new URLSearchParams({ key, v: "quarterly", loading: "async", callback: "__stvGoogleReady" });
    script.async = true;
    script.referrerPolicy = "strict-origin-when-cross-origin";
    script.onerror = () => finish(Error(googleError("NETWORK")));
    document.head.appendChild(script);
  });
  loading.catch(() => {
    loading = null;
  });
  return loading;
}
export async function searchGoogleAddress(key: string, address: string, street = address, postal = "") {
  const maps = await loadGoogleMaps(key);
  const { Geocoder } = await maps.importLibrary("geocoding");
  return new Promise<any[]>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(googleError("TIMEOUT"))), 15000);
    new Geocoder().geocode({ address }, (results: any[], status: string) => {
      clearTimeout(timer);
      if (status === "ZERO_RESULTS") {
        resolve([]);
        return;
      }
      if (status !== "OK") {
        reject(Error(googleError(status)));
        return;
      }
      const raw = (results || []).map((r) => ({
        place_id: r.place_id,
        display_name: r.formatted_address,
        name: "",
        lat: r.geometry?.location?.lat(),
        lon: r.geometry?.location?.lng(),
        address: {
          house_number: r.address_components?.find((c: any) => c.types.includes("street_number"))?.long_name,
          postcode: r.address_components?.find((c: any) => c.types.includes("postal_code"))?.long_name,
        },
        googlePrecise: !r.partial_match && r.geometry?.location_type === "ROOFTOP",
        provider: "google",
      }));
      resolve(
        usableAddressResults(raw, street, postal).map((r) => ({
          ...r,
          location_hint: (r as { googlePrecise?: boolean }).googlePrecise
            ? "building_address"
            : "approximate_area",
        })),
      );
    });
  });
}
export async function searchAddress(
  address: string,
  street = address,
  postal = "",
  fields: Record<string, string> = {},
) {
  const key = getGoogleKey();
  if (key) return searchGoogleAddress(key, address, street, postal);
  const { readApiResponse } = await import("./api-response");
  return (
    (await readApiResponse(
      await fetch("/api/geocode?" + new URLSearchParams({ q: address, ...fields }).toString()),
    )) as any
  ).results;
}
export function mapZoom(height = 1800, lat = 41.6) {
  return Math.max(
    2,
    Math.min(22, Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180) * 600) / Math.max(30, height))),
  );
}
export function mapHeight(zoom: number, lat: number) {
  return Math.max(30, Math.min(20000000, (156543.03392 * Math.cos((lat * Math.PI) / 180) * 600) / 2 ** zoom));
}
