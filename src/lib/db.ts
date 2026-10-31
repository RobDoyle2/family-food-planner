import type { AppData, StoreName } from '../types';

const DB_NAME = 'family-food-planner';
// 2: adds takeaway places, takeaway categories and saved plans. Existing stores are untouched.
const DB_VERSION = 2;

export const STORES: StoreName[] = [
  'households',
  'members',
  'foods',
  'categories',
  'preferences',
  'recipes',
  'mealPlans',
  'shoppingLists',
  'favourites',
  'settings',
  'takeawayPlaces',
  'takeawayCategories',
  'savedPlans',
];

export class StorageError extends Error {}

let dbPromise: Promise<IDBDatabase> | null = null;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new StorageError('Transaction failed'));
    tx.onabort = () => reject(tx.error ?? new StorageError('Transaction aborted'));
  });
}

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new StorageError('This browser does not support offline storage (IndexedDB).'));
      return;
    }
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) {
          const store = db.createObjectStore(s, { keyPath: 'id' });
          if (['members', 'mealPlans', 'favourites', 'takeawayPlaces', 'savedPlans'].includes(s)) store.createIndex('householdId', 'householdId');
        }
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(new StorageError(open.error?.message ?? 'Could not open local storage.'));
    open.onblocked = () => reject(new StorageError('Storage is blocked by another open tab. Close other tabs and reload.'));
  }).catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

export async function getAll<K extends StoreName>(store: K): Promise<AppData[K]> {
  const db = await openDb();
  return req(db.transaction(store).objectStore(store).getAll()) as Promise<AppData[K]>;
}

export async function loadAll(): Promise<AppData> {
  const entries = await Promise.all(STORES.map(async (s) => [s, await getAll(s)] as const));
  return Object.fromEntries(entries) as unknown as AppData;
}

export async function put<K extends StoreName>(store: K, value: AppData[K][number]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  await txDone(tx);
}

export async function putMany<K extends StoreName>(store: K, values: AppData[K]): Promise<void> {
  if (!values.length) return;
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const v of values) os.put(v);
  await txDone(tx);
}

export async function remove(store: StoreName, id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(id);
  await txDone(tx);
}

export async function removeMany(store: StoreName, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  for (const id of ids) tx.objectStore(store).delete(id);
  await txDone(tx);
}

/** Replaces every store atomically (used by import and reset). */
export async function replaceAll(data: AppData): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORES, 'readwrite');
  for (const s of STORES) {
    const os = tx.objectStore(s);
    os.clear();
    for (const v of data[s]) os.put(v);
  }
  await txDone(tx);
}

export async function requestPersistence(): Promise<boolean | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
