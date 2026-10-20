/* Service worker for Converter — Tangerine.
   Strategy: cache-first for same-origin GET requests so the app shell
   keeps working offline after the first visit. Cross-origin requests
   (the FFmpeg core/wasm fetched from a CDN on first media use) are
   deliberately NOT intercepted or cached here. Bump CACHE_NAME on release.
   It also handles the Web Share Target POST (/share-target): shared files
   are parked in IndexedDB for the app to pick up on launch. */
const CACHE_NAME = 'converter-app-v4';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(['/', '/index.html', '/manifest.webmanifest']))
      .then(() => self.skipWaiting())
      .catch(() => undefined),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

/* --- Share target inbox (IndexedDB) --------------------------------------
   Plain-JS copy of the logic in src/lib/shareInbox.ts — a service worker
   cannot import the app's modules, so the two must be kept in sync.
   DB 'converter-share' v1, store 'inbox' (auto-increment keys). */
function shareDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('converter-share', 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('inbox')) {
        req.result.createObjectStore('inbox', { autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function shareInboxPut(entry) {
  const db = await shareDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('inbox', 'readwrite');
      tx.objectStore('inbox').put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const files = formData
      .getAll('files')
      .filter((f) => f && typeof f === 'object' && typeof f.size === 'number');
    if (files.length === 0) throw new Error('no files shared');
    for (const f of files) {
      await shareInboxPut({
        name: f.name || 'shared-file',
        type: f.type || '',
        blob: f,
        ts: Date.now(),
      });
    }
    return Response.redirect('/?shared=1', 303);
  } catch (e) {
    return Response.redirect('/?shared=0', 303);
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Share target first: this POST must never reach the cache-first logic.
  if (request.method === 'POST' && url.origin === self.location.origin && url.pathname === '/share-target') {
    event.respondWith(handleShareTarget(request));
    return;
  }
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
