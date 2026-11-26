import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { OutboxItem, Place, PlacesResult } from '@/types';

/**
 * IndexedDB holds everything NearMe keeps on the device:
 *  - kv:      persisted app state (settings, saved places, local-mode community data)
 *  - places:  place snapshots the user opened or saved, so they are readable offline
 *  - areas:   cached "what is around this point" answers with their fetch time
 *  - outbox:  actions taken while offline, replayed when the connection returns
 */
interface NearMeDB extends DBSchema {
  kv: { key: string; value: unknown };
  places: { key: string; value: { id: string; place: Place; storedAt: number; viewedAt?: number }; indexes: { viewedAt: number } };
  areas: { key: string; value: { key: string; result: PlacesResult; storedAt: number } };
  outbox: { key: string; value: OutboxItem };
}

const DB_NAME = 'nearme';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<NearMeDB>> | null = null;

function db() {
  dbPromise ??= openDB<NearMeDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('kv')) database.createObjectStore('kv');
      if (!database.objectStoreNames.contains('places')) {
        const store = database.createObjectStore('places', { keyPath: 'id' });
        store.createIndex('viewedAt', 'viewedAt');
      }
      if (!database.objectStoreNames.contains('areas')) database.createObjectStore('areas', { keyPath: 'key' });
      if (!database.objectStoreNames.contains('outbox')) database.createObjectStore('outbox', { keyPath: 'id' });
    },
  });
  return dbPromise;
}

/** IndexedDB can be unavailable (private mode, quota). Storage failures must never break the UI. */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.warn('[nearme] storage unavailable', error);
    return fallback;
  }
}

export const kv = {
  get: <T,>(key: string) => safe(async () => ((await (await db()).get('kv', key)) as T | undefined) ?? null, null as T | null),
  set: (key: string, value: unknown) => safe(async () => void (await (await db()).put('kv', value, key)), undefined),
  del: (key: string) => safe(async () => void (await (await db()).delete('kv', key)), undefined),
};

export const placeStore = {
  get: (id: string) => safe(async () => (await (await db()).get('places', id))?.place ?? null, null as Place | null),
  put: (place: Place, viewed = false) =>
    safe(async () => {
      const d = await db();
      const prev = await d.get('places', place.id);
      // Never replace a full record with a thinner one.
      const best = prev && prev.place.detail === 'full' && place.detail === 'basic' ? prev.place : place;
      await d.put('places', { id: place.id, place: best, storedAt: Date.now(), viewedAt: viewed ? Date.now() : prev?.viewedAt });
    }, undefined),
  recent: (limit = 12) =>
    safe(async () => {
      const d = await db();
      const out: Place[] = [];
      let cursor = await d.transaction('places').store.index('viewedAt').openCursor(null, 'prev');
      while (cursor && out.length < limit) {
        out.push(cursor.value.place);
        cursor = await cursor.continue();
      }
      return out;
    }, [] as Place[]),
  clearRecent: () =>
    safe(async () => {
      const d = await db();
      const tx = d.transaction('places', 'readwrite');
      let cursor = await tx.store.openCursor();
      while (cursor) {
        if (cursor.value.viewedAt) await cursor.update({ ...cursor.value, viewedAt: undefined });
        cursor = await cursor.continue();
      }
      await tx.done;
    }, undefined),
};

const AREA_LIMIT = 40;

export const areaStore = {
  get: (key: string) => safe(async () => (await (await db()).get('areas', key)) ?? null, null as { key: string; result: PlacesResult; storedAt: number } | null),
  put: (key: string, result: PlacesResult) =>
    safe(async () => {
      const d = await db();
      await d.put('areas', { key, result, storedAt: Date.now() });
      const keys = await d.getAllKeys('areas');
      if (keys.length > AREA_LIMIT) {
        const all = await d.getAll('areas');
        all.sort((a, b) => a.storedAt - b.storedAt);
        await Promise.all(all.slice(0, all.length - AREA_LIMIT).map((a) => d.delete('areas', a.key)));
      }
    }, undefined),
  /** Most recently stored area answer, used as a last resort when offline. */
  latest: () =>
    safe(async () => {
      const all = await (await db()).getAll('areas');
      return all.sort((a, b) => b.storedAt - a.storedAt)[0] ?? null;
    }, null as { key: string; result: PlacesResult; storedAt: number } | null),
  clear: () => safe(async () => void (await (await db()).clear('areas')), undefined),
};

export const outboxStore = {
  all: () => safe(async () => (await (await db()).getAll('outbox')).sort((a, b) => a.createdAt - b.createdAt), [] as OutboxItem[]),
  add: (item: OutboxItem) => safe(async () => void (await (await db()).put('outbox', item)), undefined),
  remove: (id: string) => safe(async () => void (await (await db()).delete('outbox', id)), undefined),
};

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota };
}

export async function clearAllLocalData() {
  dbPromise = null;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}
