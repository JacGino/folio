// Folio v2 — sync with the private GitHub repo. Pull → merge → push, per shard file.
import * as D from './data.js';
import * as S from './store.js';
import * as M from './model.js';
import { client } from './github.js';
import { encryptBlob, decryptBlob } from './crypto.js';

export const MAX_FILE = 25 * 1024 * 1024;
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
export async function addFile(key, file) {
  if (file.size > MAX_FILE) throw new Error(`"${file.name}" is ${(file.size / 1048576).toFixed(1)} MB. Files must be 25 MB or smaller.`);
  const id = M.uid('f'); const bytes = new Uint8Array(await file.arrayBuffer());
  await S.put('blobs', { bytes, type: file.type, name: file.name }, id);
  const q = (await S.meta.get('upq')) || []; q.push(id); await S.meta.set('upq', q);
  return { id, name: file.name, size: file.size, type: file.type };
}
let fileKey = null;
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
        try { await gh.put(P(`files/${id}.enc`), enc, undefined, 'Folio: attachment'); }
        catch (e) { if (!(e.conflict && await gh.getBytes(P(`files/${id}.enc`)))) throw e; } // already in GitHub: done
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
  try { const r = await gh.getBytes(P(`files/${id}.enc`)); return r ? 'error' : 'missing'; } catch (e) { return 'error'; }
}
/** Get a file's bytes: local copy first, otherwise download and decrypt. */
export async function fileBytes(id) {
  const b = await S.get('blobs', id); if (b) return b;
  if (!gh || !fileKey) return null;
  const enc = await gh.getBytes(P(`files/${id}.enc`)); if (!enc) return null;
  const bytes = await decryptBlob(fileKey, enc); const rec = { bytes, type: '', name: id };
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
