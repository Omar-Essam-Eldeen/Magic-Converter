/**
 * Share-target inbox. When the app is picked in Android's share sheet, the
 * service worker (public/sw.js) receives the POST, stores the shared files
 * in IndexedDB (`converter-share` v1, store `inbox`) and redirects here.
 * On startup the app drains the inbox into the queue.
 *
 * The service worker keeps its own inline copy of this IndexedDB code —
 * it cannot import modules.
 */
export interface SharedFileEntry {
  name: string;
  type: string;
  blob: Blob;
  ts: number;
}

const DB_NAME = 'converter-share';
const DB_VERSION = 1;
const STORE = 'inbox';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readAll(db: IDBDatabase): Promise<SharedFileEntry[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as SharedFileEntry[] | undefined) ?? []);
    req.onerror = () => reject(req.error);
  });
}

function clearAll(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Drain the inbox: returns the shared files as File objects and empties it. */
export async function takeSharedFiles(): Promise<File[]> {
  if (typeof indexedDB === 'undefined') return [];
  const db = await openDb();
  try {
    const entries = await readAll(db);
    if (entries.length === 0) return [];
    await clearAll(db);
    return entries
      .filter((e) => e && e.blob)
      .map(
        (e) =>
          new File([e.blob], e.name || 'shared-file', {
            type: e.type || e.blob.type || '',
            lastModified: e.ts || Date.now(),
          }),
      );
  } finally {
    db.close();
  }
}
