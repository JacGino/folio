// Folio v2 — in-memory workspace backed by IndexedDB. All edits go through here.
import * as S from './store.js';
import * as M from './model.js';

const recs = new Map();          // id -> record
const listeners = new Set();
const dirty = new Set();         // shard names with local changes not yet pushed
let saveTimer = null; const pendingSave = new Map();

export const shardOf = r => r.sh;
export const shardPath = sh => sh === 'ws' ? 'workspace.json' : `db/${sh.slice(3)}.json`;

export async function load() {
  let dev = await S.meta.get('device'); if (!dev) { dev = M.uid(''); await S.meta.set('device', dev); }
  M.setDevice(dev);
  for (const r of await S.all('records')) { recs.set(r.id, r); for (const v of Object.values(r.f)) M.observe(v.ts); }
  for (const sh of (await S.meta.get('dirty')) || []) dirty.add(sh);
  return recs.size;
}
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(info) { for (const fn of listeners) try { fn(info); } catch (e) { console.error(e); } }

function schedule(r) {
  pendingSave.set(r.id, r); dirty.add(r.sh);
  clearTimeout(saveTimer); saveTimer = setTimeout(flush, 250);
}
export async function flush() {
  clearTimeout(saveTimer); const batch = [...pendingSave.values()]; pendingSave.clear();
  if (batch.length) await S.putMany('records', batch);
  await S.meta.set('dirty', [...dirty]);
}

export const getRec = id => recs.get(id) || null;
export const live = id => { const r = recs.get(id); return r && M.alive(r) ? r : null; };
export const all = (k, pred = () => true) => [...recs.values()].filter(r => r.k === k && M.alive(r) && pred(r));
export const val = M.get;
export const deleted = k => [...recs.values()].filter(r => r.k === k && !M.alive(r));

export function create(k, sh, fields) { const r = M.newRecord(k, sh, fields); recs.set(r.id, r); schedule(r); emit({ type: 'create', id: r.id }); return r; }
export function update(id, fields) {
  const r = recs.get(id); if (!r) return false; const ts = M.now(); let ch = false;
  for (const [n, v] of Object.entries(fields)) ch = M.set(r, n, v, ts) || ch;
  if (ch) { schedule(r); emit({ type: 'update', id, fields: Object.keys(fields) }); }
  return ch;
}
export function trash(id) { const r = recs.get(id); if (!r) return; M.remove(r); schedule(r); emit({ type: 'delete', id }); }
export function restore(id) { const r = recs.get(id); if (!r) return; r.del = null; M.set(r, '_restored', Date.now()); schedule(r); emit({ type: 'update', id }); }

// --- used by sync ---
export const shards = () => { const s = new Set(['ws']); for (const r of recs.values()) s.add(r.sh); return [...s]; };
export function shardRecords(sh) { const o = {}; for (const r of recs.values()) if (r.sh === sh) o[r.id] = r; return o; }
export async function replaceShard(sh, merged) {
  const changed = [];
  for (const r of Object.values(merged)) { const old = recs.get(r.id); if (!old || JSON.stringify(old) !== JSON.stringify(r)) { recs.set(r.id, r); changed.push(r); } }
  if (changed.length) { await S.putMany('records', changed); emit({ type: 'sync', ids: changed.map(r => r.id) }); }
}
export const isDirty = sh => dirty.has(sh);
export async function markClean(sh) { dirty.delete(sh); await S.meta.set('dirty', [...dirty]); }
export const dirtyShards = () => [...dirty];
export const count = () => recs.size;
export async function wipe() { recs.clear(); dirty.clear(); await S.clearAll(); emit({ type: 'wipe' }); }
