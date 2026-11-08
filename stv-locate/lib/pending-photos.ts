/**
 * Keeps the prepared bytes of a photo until its upload is confirmed, so a failed
 * upload can be retried — even after a reload — without retaking the picture.
 * IndexedDB is used where available; otherwise the bytes are kept in memory for
 * this page only.
 */
const memory = new Map<string, Blob>();
const DB = "stv-locate-pending-photos";
const STORE = "photos";
function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await open();
  if (!db) return undefined;
  return new Promise<T | undefined>((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const request = fn(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
      tx.oncomplete = () => db.close();
    } catch {
      resolve(undefined);
    }
  });
}
export async function keepPendingPhoto(id: string, blob: Blob) {
  memory.set(id, blob);
  await run("readwrite", (s) => s.put(blob, id));
}
export async function readPendingPhoto(id: string): Promise<Blob | null> {
  if (memory.has(id)) return memory.get(id)!;
  const stored = await run<Blob>("readonly", (s) => s.get(id));
  return stored instanceof Blob ? stored : null;
}
export async function dropPendingPhoto(id: string) {
  memory.delete(id);
  await run("readwrite", (s) => s.delete(id));
}
