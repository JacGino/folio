// Folio v2 — sync with the private GitHub repo. Pull → merge → push, per shard file.
import * as D from './data.js';
import * as S from './store.js';
import * as M from './model.js';
import { client } from './github.js';
import { encryptBlob, decryptBlob } from './crypto.js';

export const MAX_FILE = 100 * 1024 * 1024; // bigger files are stored in GitHub in pieces (PART), joined again when opened
const PART = 15 * 1024 * 1024;
let gh = null, running = null, status = { state: 'off', at: 0, error: '' };
// Start over: the data lives in a fresh folder r/<id>/ of the repo, named in folio-root.json. A device that sees a new
// folder clears its own copy first, so nothing old is merged back; an old app version keeps writing to the old place,
// which no updated device reads.
export const ROOT_FILE = 'folio-root.json';
let base = '';
const P = path => base + path;
/** read folio-root.json; on a new folder, clear this device's copy before syncing */
async function resolveBase() {
  const ptr = await gh.getJSON(ROOT_FILE), ep = (ptr && ptr.data && ptr.data.epoch) || '', mine = (await S.meta.get('epoch')) || '';
  if (ep && ep !== mine) { await D.resetRecords(); await S.meta.set('epoch', ep); }
  base = ep ? `r/${ep}/` : (mine ? `r/${mine}/` : '');
}
const listeners = new Set();
export const onStatus = fn => (listeners.add(fn), () => listeners.delete(fn));
const setStatus = s => { status = { ...status, ...s }; listeners.forEach(f => f(status)); };
export const getStatus = () => status;

export async function configure(cfg, opts = {}) {
  if (!cfg || !cfg.owner || !cfg.repo || !cfg.token) { gh = null; setStatus({ state: 'off' }); return; }
  gh = client({ ...cfg, ...opts }); setStatus({ state: 'idle' });
}
export const connected = () => !!gh;

/** Workspace-level settings stored in workspace.json (e.g. encryption meta). */
export async function remoteSettings() { const ws = await S.meta.get('ws-settings'); return ws || {}; }

async function syncShard(sh, depth = 0) {
  const path = P(D.shardPath(sh));
  const remote = await gh.getJSON(path);
  const local = D.shardRecords(sh);
  const { merged, changedLocal, changedRemote } = M.mergeMaps(local, remote ? remote.data.records || {} : {});
  if (changedLocal) await D.replaceShard(sh, merged);
  if (sh === 'ws' && remote && remote.data.settings) await S.meta.set('ws-settings', remote.data.settings);
  const pendingSettings = sh === 'ws' ? await S.meta.get('ws-settings-pending') : null;
  if (changedRemote || !remote || pendingSettings) {
    const settings = { ...(remote?.data.settings || {}), ...(pendingSettings || {}) };
    const body = { v: 2, app: 'folio', updated: new Date().toISOString(), ...(sh === 'ws' ? { settings } : {}), records: merged };
    try { await gh.putJSON(path, body, remote?.sha); }
    catch (e) { if (e.conflict && depth < 3) return syncShard(sh, depth + 1); throw e; }
    if (pendingSettings) { await S.meta.set('ws-settings', settings); await S.meta.set('ws-settings-pending', null); }
  }
  await D.markClean(sh);
}

/** Save workspace-wide settings (pushed with the next sync). */
export async function saveSettings(patch) {
  const cur = (await S.meta.get('ws-settings-pending')) || {};
  await S.meta.set('ws-settings-pending', { ...cur, ...patch });
  await S.meta.set('ws-settings', { ...((await S.meta.get('ws-settings')) || {}), ...patch });
}

export function run() {
  if (!gh) return Promise.resolve(false);
  if (running) return running;
  running = (async () => {
    setStatus({ state: 'syncing', error: '' });
    try {
      await D.flush();
      await resolveBase();
      await syncShard('ws');
      const remoteDbs = (await gh.list(P('db'))).filter(f => f.name.endsWith('.json')).map(f => 'db:' + f.name.slice(0, -5));
      for (const sh of new Set([...D.shards().filter(s => s !== 'ws'), ...remoteDbs])) await syncShard(sh);
      await uploadQueue();
      setStatus({ state: 'idle', at: Date.now() });
      return true;
    } catch (e) { setStatus({ state: 'error', error: e.message || String(e) }); return false; }
    finally { running = null; }
  })();
  return running;
}

let timer = null;
export function soon(ms = 2500) { clearTimeout(timer); timer = setTimeout(run, ms); }

// ---- attachments (encrypted) ----
// photos are made smaller before saving (longest side 2560 px, JPEG): the same on screen, often 5–10× fewer MB
async function shrinkPhoto(file) {
  if (!/^image\/(jpeg|png|heic|heif|webp)$/i.test(file.type || '') || file.size < 1.5 * 1048576 || typeof createImageBitmap !== 'function') return file;
  try {
    const bm = await createImageBitmap(file), k = Math.min(1, 2560 / Math.max(bm.width, bm.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bm.width * k); cv.height = Math.round(bm.height * k); cv.getContext('2d').drawImage(bm, 0, 0, cv.width, cv.height);
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', .82));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.(png|heic|heif|webp|jpe?g)$/i, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch (e) { return file; } // a photo this browser cannot open stays as it is
}
export async function addFile(key, file) {
  file = await shrinkPhoto(file);
  if (file.size > MAX_FILE) throw new Error(`"${file.name}" is ${(file.size / 1048576).toFixed(1)} MB. Files must be 100 MB or smaller.`);
  const id = M.uid('f'); const bytes = new Uint8Array(await file.arrayBuffer());
  await S.put('blobs', { bytes, type: file.type, name: file.name }, id);
  const q = (await S.meta.get('upq')) || []; q.push(id); await S.meta.set('upq', q);
  if (!fileKey && needKey && gh) setTimeout(needKey, 400); // locked here: it would wait on this device, so ask to unlock now
  return { id, name: file.name, size: file.size, type: file.type };
}
let fileKey = null, needKey = null;
export const onNeedKey = fn => { needKey = fn; };
export const setFileKey = k => { fileKey = k; };
async function uploadQueue() {
  let q = (await S.meta.get('upq')) || [];
  if (!q.length || !fileKey) return;
  let lastErr = null;
  for (const id of [...q]) {
    // one file failing (too big, network) must not hold back the others; it stays in the queue for the next sync
    try {
      const b = await S.get('blobs', id);
      if (b) {
        const enc = await encryptBlob(fileKey, b.bytes);
        if (enc.length <= PART) {
          try { await gh.put(P(`files/${id}.enc`), enc, undefined, 'Folio: attachment'); }
          catch (e) { if (!(e.conflict && await gh.getBytes(P(`files/${id}.enc`)))) throw e; } // already in GitHub: done
        } else { // a big file: pieces first, then the list of pieces (so a half-sent file is never read)
          const n = Math.ceil(enc.length / PART);
          for (let i = 0; i < n; i++) {
            try { await gh.put(P(`files/${id}.enc.${i}`), enc.subarray(i * PART, (i + 1) * PART), undefined, `Folio: attachment (part ${i + 1} of ${n})`); }
            catch (e) { if (!e.conflict) throw e; }
            await new Promise(r => setTimeout(r, 1500));
          }
          try { await gh.putJSON(P(`files/${id}.parts`), { n, size: enc.length }); } catch (e) { if (!e.conflict) throw e; }
        }
        await new Promise(r => setTimeout(r, 1500));
      }
      q = q.filter(x => x !== id); await S.meta.set('upq', q);
    } catch (e) { lastErr = e; }
  }
  if (lastErr) throw lastErr;
}
/** How many attachments added on this device are still waiting to go to GitHub. */
export async function pendingUploads() { return ((await S.meta.get('upq')) || []).length; }
/** Why a file cannot be opened here: 'locked' (no passphrase on this device), 'offline' (GitHub not connected),
 *  'missing' (not in GitHub yet: still waiting on the device it was added on), or 'error'. */
export async function fileProblem(id) {
  if (!fileKey) return 'locked';
  if (!gh) return 'offline';
  try { const r = await gh.getBytes(P(`files/${id}.enc`)) || await gh.getBytes(P(`files/${id}.parts`)); return r ? 'error' : 'missing'; } catch (e) { return 'error'; }
}
/** Get a file's bytes: local copy first, otherwise download and decrypt. */
export async function fileBytes(id) {
  const b = await S.get('blobs', id); if (b) return b;
  if (!gh || !fileKey) return null;
  let enc = await gh.getBytes(P(`files/${id}.enc`));
  if (!enc) { // stored in pieces?
    const m = await gh.getBytes(P(`files/${id}.parts`)); if (!m) return null;
    const { n, size } = JSON.parse(new TextDecoder().decode(m)); enc = new Uint8Array(size); let at = 0;
    for (let i = 0; i < n; i++) { const part = await gh.getBytes(P(`files/${id}.enc.${i}`)); if (!part) return null; enc.set(part, at); at += part.length; }
  }
  const bytes = await decryptBlob(fileKey, enc); const rec = { bytes, type: '', name: id }; // type is worked out from the bytes when opened
  await S.put('blobs', rec, id); return rec;
}
/** Start over: erase everything on every device and in the GitHub copy (the old files stay in the repo, unread).
 *  The new folder is named first, so if GitHub cannot be reached nothing is erased. */
export async function startOver() {
  const ep = M.uid('r'), settings = await remoteSettings();
  if (gh) {
    if (running) await running;
    const cur = await gh.getJSON(ROOT_FILE);
    await gh.putJSON(ROOT_FILE, { v: 1, app: 'folio', epoch: ep, at: new Date().toISOString() }, cur && cur.sha);
  }
  await D.resetRecords(); await S.meta.set('epoch', ep); base = `r/${ep}/`;
  await S.meta.set('ws-settings-pending', settings); // encryption settings go with the new workspace
  return ep;
}
export async function totalBlobBytes() { let n = 0; for (const b of await S.all('blobs')) n += b.bytes?.byteLength || 0; return n; }
