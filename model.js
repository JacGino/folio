// Folio v2 — hybrid logical clock, records, per-field merge.
// Timestamp string: wall(base36, 9) : counter(base36, 3) : device — sortable as plain strings.

const HIST_MAX = 20;
let last = { w: 0, c: 0 }, device = 'dev';

export function setDevice(id) { device = String(id).replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'dev'; }
export function getDevice() { return device; }
const fmt = (w, c, d) => `${w.toString(36).padStart(9, '0')}:${c.toString(36).padStart(3, '0')}:${d}`;
const parseTs = ts => { const [w, c, d] = ts.split(':'); return { w: parseInt(w, 36), c: parseInt(c, 36), d }; };

/** New timestamp, always greater than anything seen. `nowMs` is injectable for tests. */
export function now(nowMs = Date.now()) {
  if (nowMs > last.w) last = { w: nowMs, c: 0 }; else last = { w: last.w, c: last.c + 1 };
  return fmt(last.w, last.c, device);
}
/** Remember a remote timestamp so our next one sorts after it (handles clock skew). */
export function observe(ts) {
  if (!ts) return; const t = parseTs(ts);
  if (t.w > last.w || (t.w === last.w && t.c > last.c)) last = { w: t.w, c: t.c };
}
export const tsMs = ts => ts ? parseTs(ts).w : 0;

export function uid(prefix = '') {
  const a = crypto.getRandomValues(new Uint8Array(9));
  return prefix + Array.from(a, b => (b % 36).toString(36)).join('');
}

/** Record: { id, k, sh, f: { name: { v, ts } }, h: [{ n, v, ts }], del: ts|null } */
export function newRecord(k, sh, fields = {}, ts = now()) {
  const r = { id: fields.id || uid(k[0]), k, sh, f: {}, h: [], del: null };
  for (const [n, v] of Object.entries(fields)) if (n !== 'id') r.f[n] = { v, ts };
  return r;
}
export const get = (r, n, d = null) => (r && r.f[n] ? r.f[n].v : d);
export function set(r, n, v, ts = now()) {
  const old = r.f[n];
  if (old && JSON.stringify(old.v) === JSON.stringify(v)) return false;
  if (old) pushHist(r, { n, v: old.v, ts: old.ts });
  r.f[n] = { v, ts }; return true;
}
export function remove(r, ts = now()) { r.del = ts; }
export function alive(r) {
  if (!r || !r.del) return !!r;
  return Object.values(r.f).some(x => x.ts > r.del); // an edit newer than the delete revives it
}
function pushHist(r, e) {
  if (r.h.some(x => x.n === e.n && x.ts === e.ts)) return;
  r.h.push(e); r.h.sort((a, b) => (a.ts < b.ts ? 1 : -1)); if (r.h.length > HIST_MAX) r.h.length = HIST_MAX;
}

/** Merge two copies of one record. Newest timestamp wins per field; the loser goes to history. */
export function mergeRecord(a, b) {
  if (!a) return clone(b); if (!b) return clone(a);
  const out = { id: a.id, k: a.k || b.k, sh: a.sh || b.sh, f: {}, h: [], del: null };
  for (const n of new Set([...Object.keys(a.f), ...Object.keys(b.f)])) {
    const x = a.f[n], y = b.f[n];
    if (!x || !y) { out.f[n] = clone(x || y); continue; }
    const [win, lose] = x.ts >= y.ts ? [x, y] : [y, x];
    out.f[n] = clone(win);
    if (lose.ts !== win.ts) pushHist(out, { n, v: clone(lose.v), ts: lose.ts });
  }
  for (const e of [...a.h, ...b.h]) pushHist(out, clone(e));
  out.del = a.del && b.del ? (a.del > b.del ? a.del : b.del) : (a.del || b.del || null);
  for (const v of Object.values(out.f)) observe(v.ts);
  if (out.del) observe(out.del);
  return out;
}

/** Merge maps of records { id: record }. Returns { merged, changedLocal, changedRemote }. */
export function mergeMaps(local, remote) {
  const merged = {}; let changedLocal = false, changedRemote = false;
  for (const id of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const m = mergeRecord(local[id], remote[id]); merged[id] = m;
    const s = JSON.stringify(m);
    if (!local[id] || JSON.stringify(local[id]) !== s) changedLocal = true;
    if (!remote[id] || JSON.stringify(remote[id]) !== s) changedRemote = true;
  }
  return { merged, changedLocal, changedRemote };
}

export const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
