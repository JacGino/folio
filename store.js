// Folio v2 — IndexedDB storage. Stores: records (by id), blobs (by file id), meta (key/value).
const DB_NAME = 'folio-v2', VERSION = 1;
let dbp = null;

function openOnce() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' }).createIndex('sh', 'sh');
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('Storage is busy in another Folio tab. Close other Folio tabs and reload.'));
  });
}
// Safari sometimes never answers the first open, so try again before giving up.
function open() {
  if (dbp) return dbp;
  const limit = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  dbp = limit(openOnce(), 3000).catch(() => limit(openOnce(), 6000)).catch(e => { dbp = null; throw new Error('Could not open storage on this device (' + (e.message || e) + '). In Safari settings, allow website data and turn off Private browsing.'); });
  return dbp;
}
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function get(store, key) { const db = await open(); return req(db.transaction(store).objectStore(store).get(key)); }
export async function all(store) { const db = await open(); return req(db.transaction(store).objectStore(store).getAll()); }
export async function keys(store) { const db = await open(); return req(db.transaction(store).objectStore(store).getAllKeys()); }
export async function put(store, value, key) {
  const db = await open(); const tx = db.transaction(store, 'readwrite');
  key === undefined ? tx.objectStore(store).put(value) : tx.objectStore(store).put(value, key);
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
export async function putMany(store, values) {
  const db = await open(); const tx = db.transaction(store, 'readwrite'); const s = tx.objectStore(store);
  for (const v of values) s.put(v);
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
export async function del(store, key) {
  const db = await open(); const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key);
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
export async function clearAll() {
  const db = await open(); const tx = db.transaction(['records', 'blobs', 'meta'], 'readwrite');
  for (const s of ['records', 'blobs', 'meta']) tx.objectStore(s).clear();
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
/** empty some stores (Start over keeps 'meta': GitHub connection, keys, app lock, this device's id) */
export async function clearStores(names) {
  const db = await open(); const tx = db.transaction(names, 'readwrite');
  for (const s of names) tx.objectStore(s).clear();
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
export const meta = { get: k => get('meta', k), set: (k, v) => put('meta', v, k) };

/** Ask the browser not to evict our data (iOS evicts unused site data otherwise). */
export async function persist() { try { return await navigator.storage?.persist?.(); } catch { return false; } }
export async function usage() { try { return await navigator.storage.estimate(); } catch { return null; } }
