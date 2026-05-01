// IndexedDB storage for conversation sessions and their audio blobs.
// Two stores:
//   - sessions: small JSON records (id, title, dates, transcript, analysis, …)
//   - audio:    keyed by sessionId, holds the recorded Blob

const DB_NAME = 'quill-companion';
const DB_VERSION = 1;
const STORE_SESSIONS = 'sessions';
const STORE_AUDIO = 'audio';

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const s = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
        s.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(stores, mode = 'readonly') {
  return open().then((db) => db.transaction(stores, mode));
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSession(session) {
  const t = await tx([STORE_SESSIONS], 'readwrite');
  await promisify(t.objectStore(STORE_SESSIONS).put(session));
  await new Promise((r) => (t.oncomplete = r));
  return session;
}

export async function getSession(id) {
  const t = await tx([STORE_SESSIONS]);
  return promisify(t.objectStore(STORE_SESSIONS).get(id));
}

export async function listSessions() {
  const t = await tx([STORE_SESSIONS]);
  const all = await promisify(t.objectStore(STORE_SESSIONS).getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteSession(id) {
  const t = await tx([STORE_SESSIONS, STORE_AUDIO], 'readwrite');
  t.objectStore(STORE_SESSIONS).delete(id);
  t.objectStore(STORE_AUDIO).delete(id);
  await new Promise((r) => (t.oncomplete = r));
}

export async function purgeAll() {
  const t = await tx([STORE_SESSIONS, STORE_AUDIO], 'readwrite');
  t.objectStore(STORE_SESSIONS).clear();
  t.objectStore(STORE_AUDIO).clear();
  await new Promise((r) => (t.oncomplete = r));
}

export async function saveAudio(id, blob, mime) {
  const t = await tx([STORE_AUDIO], 'readwrite');
  await promisify(t.objectStore(STORE_AUDIO).put({ id, blob, mime }));
  await new Promise((r) => (t.oncomplete = r));
}

export async function getAudio(id) {
  const t = await tx([STORE_AUDIO]);
  return promisify(t.objectStore(STORE_AUDIO).get(id));
}

export async function storageEstimate() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  return navigator.storage.estimate();
}
