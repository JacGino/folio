// Folio v2 — Notion "Markdown & CSV" import (ZIP read in slices, so 700 MB+ exports are fine).
import * as D from './data.js';
import * as DB from './db.js';
import * as Sync from './sync.js';
import { uid } from './model.js';
import { esc, sanitize } from './ui.js';
import { parseDate, toISODate } from './dates.js';
import { nb } from './editor.js';

// ---------- ZIP ----------
export async function unzip(src) {
  const blob = src instanceof Blob ? src : new Blob([src]); const size = blob.size;
  const rd = async (o, n) => new DataView(await blob.slice(o, o + n).arrayBuffer());
  const tailStart = Math.max(0, size - 65600); const tail = await rd(tailStart, size - tailStart);
  let e = -1; for (let i = tail.byteLength - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('This is not a ZIP file.');
  let n = tail.getUint16(e + 10, true), cdSize = tail.getUint32(e + 12, true), cd = tail.getUint32(e + 16, true);
  if ((cd === 0xffffffff || n === 0xffff || cdSize === 0xffffffff) && e >= 20 && tail.getUint32(e - 20, true) === 0x07064b50) {
    const o = Number(tail.getBigUint64(e - 12, true)); const z = await rd(o, 56); n = Number(z.getBigUint64(32, true)); cdSize = Number(z.getBigUint64(40, true)); cd = Number(z.getBigUint64(48, true)); }
  const dv = await rd(cd, cdSize); const u8 = new Uint8Array(dv.buffer); const td = new TextDecoder(); const out = []; let p = 0;
  for (let k = 0; k < n && p + 46 <= dv.byteLength; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true); let cs = dv.getUint32(p + 20, true), us = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true); let lo = dv.getUint32(p + 42, true);
    const name = td.decode(u8.subarray(p + 46, p + 46 + nl)); let x = p + 46 + nl; const xe = x + xl;
    while (x + 4 <= xe) { const id = dv.getUint16(x, true), sz = dv.getUint16(x + 2, true); if (id === 1) { let q = x + 4; if (us === 0xffffffff) { us = Number(dv.getBigUint64(q, true)); q += 8; } if (cs === 0xffffffff) { cs = Number(dv.getBigUint64(q, true)); q += 8; } if (lo === 0xffffffff) lo = Number(dv.getBigUint64(q, true)); } x += 4 + sz; }
    p = xe + cl; if (name.endsWith('/')) continue;
    out.push({ name, size: us,
      async getBlob() { const h = await rd(lo, 30); const start = lo + 30 + h.getUint16(26, true) + h.getUint16(28, true); const r = blob.slice(start, start + cs);
        if (method === 0) return r; if (method !== 8) throw new Error('Unsupported compression'); return new Response(r.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob(); },
      async text() { return new TextDecoder().decode(await (await this.getBlob()).arrayBuffer()); } });
  }
  return out;
}
async function expand(entries, depth = 0) { const out = []; for (const e of entries) { if (/\.zip$/i.test(e.name) && depth < 3) { try { out.push(...await expand(await unzip(await e.getBlob()), depth + 1)); } catch {} } else out.push(e); } return out; }

// ---------- helpers ----------
const NID = /\s([0-9a-f]{32})$/i;
const baseName = p => p.split('/').pop().replace(/\.[^.]+$/, '');
export const cleanName = s => s.replace(/_all$/, '').replace(NID, '').trim() || 'Untitled';
const normPath = p => { const o = []; for (const s of p.split('/')) { if (s === '..') o.pop(); else if (s && s !== '.') o.push(s); } return o.join('/'); };
const dec = s => { try { return decodeURIComponent(s); } catch { return s; } };
const cleanPath = p => p.split('/').map(cleanName).join('/').toLowerCase();
export function parseCSV(t) {
  t = t.replace(/^﻿/, ''); const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += c; }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
const STATUS_COLORS = { 'site survey': 'blue', estimation: 'yellow', 'to amend': 'orange', done: 'green', rejected: 'red', 'not started': 'gray', 'in progress': 'blue' };

/** CSV text → { props, rows: [{title, values}] } with Notion-like types. */
export function csvToTable(text) {
  const rows = parseCSV(text); if (!rows.length) return null; const hdr = rows[0], body = rows.slice(1);
  let k = 0; const colors = DB.COLOR_NAMES;
  const props = hdr.map((name, i) => {
    const id = uid('p'); const vals = body.map(r => (r[i] || '').trim()), ne = vals.filter(Boolean); const n = name.trim() || 'Name';
    if (i === 0) return { id, name: n, type: 'title' };
    if (/^alert$/i.test(n)) return { id, name: n, type: 'formula', formula: DB.ALERT_FORMULA };
    if (/^status$/i.test(n)) return { id, name: n, type: 'status', options: [...new Set(ne)].map(v => ({ name: v, color: STATUS_COLORS[v.toLowerCase()] || colors[k++ % colors.length] })) };
    if (ne.length && ne.every(v => /^(yes|no)$/i.test(v)) || /^archive$/i.test(n)) return { id, name: n, type: 'checkbox' };
    if (ne.length && ne.every(v => /^https?:\/\//i.test(v)) || /pin location|link|url/i.test(n)) return { id, name: n, type: 'url' };
    if (ne.length && ne.every(v => parseDate(v)) || /date|rejected$/i.test(n) && ne.every(v => !v || parseDate(v))) return { id, name: n, type: 'date' };
    if (ne.length && ne.every(v => /^-?\d+(\.\d+)?$/.test(v)) && !/no\b|number|ecx/i.test(n)) return { id, name: n, type: 'number' };
    const parts = ne.flatMap(v => v.split(/,\s+/)); const dist = [...new Set(parts)];
    if (/category|tags?/i.test(n) || (ne.some(v => v.includes(', ')) && dist.length <= 20 && dist.every(v => v.length <= 30))) return { id, name: n, type: 'multi', options: dist.map(v => ({ name: v, color: colors[k++ % colors.length] })) };
    const d2 = [...new Set(ne)];
    if (d2.length && d2.length <= 15 && d2.length < Math.max(2, ne.length) && d2.every(v => v.length <= 30)) return { id, name: n, type: 'select', options: d2.map(v => ({ name: v, color: colors[k++ % colors.length] })) };
    return { id, name: n, type: 'text' };
  });
  const out = body.map(r => { const values = {}; props.forEach((p, i) => { let v = (r[i] || '').trim();
    if (p.type === 'formula') return; if (p.type === 'checkbox') v = /^yes$/i.test(v); else if (p.type === 'date') v = v ? toISODate(parseDate(v)) || null : null;
    else if (p.type === 'multi') v = v ? v.split(/,\s+/) : []; else if (p.type === 'number') v = v === '' ? null : +v; values[p.id] = v; });
    return { title: (r[0] || '').trim(), values }; });
  return { props, rows: out };
}

// ---------- Markdown → blocks ----------
function inline(s) {
  const codes = []; s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s).replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (_, t, u) => { const href = u.replace(/&amp;/g, '&'); return /^(https?:|mailto:)/i.test(href) && !/notion\.so\//.test(href) ? `<a href="${esc(href)}">${t}</a>` : t; })
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<i>$2</i>').replace(/~~(.+?)~~/g, '<s>$1</s>').replace(/&lt;br\s*\/?&gt;/gi, '<br>');
  return sanitize(s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`));
}
export function mdToBlocks(text, ctx = {}) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n'); let title = '', i = 0; const blocks = []; const stack = [0];
  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length && /^#\s+/.test(lines[i])) { title = lines[i].replace(/^#\s+/, '').trim(); i++; }
  // Notion puts a row's properties as "Name: value" lines right after the title
  if (ctx.skipProps) { while (i < lines.length && (!lines[i].trim() || /^[^:]{1,40}:\s/.test(lines[i]))) i++; }
  const lvl = sp => { while (stack.length > 1 && sp < stack.at(-1)) stack.pop(); if (sp > stack.at(-1)) stack.push(sp); return stack.length - 1; };
  for (; i < lines.length; i++) {
    const raw = lines[i]; if (!raw.trim()) continue;
    const sp = raw.match(/^[ \t]*/)[0].replace(/\t/g, '    ').length, t = raw.trim(), ind = lvl(sp); let m;
    if (/^```/.test(t)) { const body = []; i++; while (i < lines.length && !lines[i].trim().startsWith('```')) body.push(lines[i++]); blocks.push(nb('code', esc(body.join('\n')), { in: ind })); continue; }
    if (/^<aside>/i.test(t)) { const body = []; let rest = t.replace(/^<aside>/i, ''); if (rest.trim()) body.push(rest); i++; while (i < lines.length && !/<\/aside>/i.test(lines[i])) { if (lines[i].trim()) body.push(lines[i].trim()); i++; }
      if (i < lines.length) { const r = lines[i].replace(/<\/aside>.*/i, '').trim(); if (r) body.push(r); }
      const txt = body.join('\n').replace(/<[^>]+>/g, ''); const em = txt.match(/^(\p{Extended_Pictographic}️?)\s*/u);
      blocks.push(nb('callout', inline(em ? txt.slice(em[0].length) : txt).replace(/\n/g, '<br>'), { in: ind, emo: em ? em[1] : '💡' })); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { blocks.push(nb('divider', '', { in: ind })); continue; }
    if ((m = t.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)) || ((m = t.match(/^\[([^\]]+)\]\(([^)]+)\)$/)) && ctx.link)) {
      const r = ctx.link ? ctx.link(m[2], m[1]) : null; if (r) { blocks.push(Object.assign(r, { id: uid('b'), in: ind })); continue; } }
    if ((m = t.match(/^(#{1,6})\s+(.*)$/))) { blocks.push(nb('h' + Math.min(3, m[1].length), inline(m[2]), { in: ind })); continue; }
    if ((m = t.match(/^[-*+]\s+\[( |x|X)\]\s?(.*)$/))) { blocks.push(nb('todo', inline(m[2]), { in: ind, c: m[1] !== ' ' })); continue; }
    if ((m = t.match(/^[-*+]\s+(.*)$/))) { blocks.push(nb('bullet', inline(m[1]), { in: ind })); continue; }
    if ((m = t.match(/^\d+[.)]\s+(.*)$/))) { blocks.push(nb('num', inline(m[1]), { in: ind })); continue; }
    if (t.startsWith('>')) { blocks.push(nb('quote', inline(t.replace(/^>\s?/, '')), { in: ind })); continue; }
    if (/^<\/?(details|summary|p|div|span|br)\b/i.test(t)) { const s = t.replace(/<[^>]+>/g, '').trim(); if (s) blocks.push(nb('p', inline(s), { in: ind })); continue; }
    blocks.push(nb('p', inline(t), { in: ind }));
  }
  return { title, blocks };
}

// ---------- import ----------
export async function importNotion(files, ui = () => {}, opt = {}) {
  ui('Reading the export…');
  let entries = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) entries.push(...await expand(await unzip(f)));
    else entries.push({ name: f.webkitRelativePath || f.name, size: f.size, getBlob: async () => f, text: async () => f.text() });
  }
  entries = entries.filter(e => !/(^|\/)(__MACOSX|\.DS_Store)/.test(e.name));
  const byPath = new Map(entries.map(e => [e.name, e]));
  const mds = entries.filter(e => /\.md$/i.test(e.name)).sort((a, b) => a.name.localeCompare(b.name));
  let csvs = entries.filter(e => /\.csv$/i.test(e.name));
  csvs = csvs.filter(c => /_all\.csv$/i.test(c.name) || !byPath.has(c.name.replace(/\.csv$/i, '_all.csv')));
  if (!mds.length && !csvs.length) throw new Error('No Notion pages found. Export from Notion as “Markdown & CSV”.');

  // 1. databases
  const dbByDir = new Map(); let nRows = 0;
  for (const c of csvs) {
    ui(`Reading table ${baseName(c.name)}…`);
    const tbl = csvToTable(await c.text()); if (!tbl) continue;
    const name = cleanName(baseName(c.name));
    const isKpi = tbl.props.some(p => /^status$/i.test(p.name)) && tbl.props.some(p => /^due date$/i.test(p.name));
    const arch = tbl.props.find(p => /^archive$/i.test(p.name)), da = tbl.props.find(p => /^date assigned$/i.test(p.name));
    const views = [{ id: uid('v'), name: isKpi ? 'Project Not Complete' : 'Table', type: 'table', filter: arch ? [{ prop: arch.id, op: 'is unchecked' }] : [], sort: da ? [{ prop: da.id, dir: 'asc' }] : [], hidden: [] }];
    if (arch) views.push({ id: uid('v'), name: 'Completed Project', type: 'table', filter: [{ prop: arch.id, op: 'is checked' }], sort: da ? [{ prop: da.id, dir: 'desc' }] : [], hidden: [] });
    const role = isKpi && !DB.kpiDb() ? 'kpi' : null;
    const dbr = D.create('db', 'ws', { name: /tracker/i.test(name) ? 'My Task' : name, props: tbl.props, views, role, created: Date.now() });
    const rowIds = new Map(); let order = Date.now();
    for (const r of tbl.rows) {
      const rec = D.create('row', 'db:' + dbr.id, { db: dbr.id, created: Date.now(), order: order++ });
      const upd = {}; for (const [pid, v] of Object.entries(r.values)) if (v !== '' && v != null && !(Array.isArray(v) && !v.length)) upd['p:' + pid] = v;
      D.update(rec.id, upd); rowIds.set(r.title.toLowerCase(), rec.id); nRows++;
    }
    dbByDir.set(cleanPath(c.name.replace(/(_all)?\.csv$/i, '')), { dbr, rowIds, csvPath: c.name.replace(/_all\.csv$/i, '.csv'), name });
  }

  // 2. pages (and row pages)
  const uploads = []; const pageIds = new Map(); const created = []; let nFiles = 0, nFail = 0;
  for (const e of mds) { const key = e.name.replace(/\.md$/i, ''); const dir = cleanPath(key.split('/').slice(0, -1).join('/')); if (!dbByDir.has(dir)) pageIds.set(key, uid('p')); }
  const findPage = k => pageIds.get(k) || [...pageIds].find(([kk]) => cleanPath(kk) === cleanPath(k))?.[1];
  const parentOf = key => { let dir = key.split('/').slice(0, -1); while (dir.length) { const id = findPage(dir.join('/')); if (id) return id; dir.pop(); } return null; };
  let done = 0;
  for (const e of mds) {
    ui(`Importing pages… ${++done}/${mds.length}`);
    const key = e.name.replace(/\.md$/i, ''); const dirRaw = key.split('/').slice(0, -1).join('/'); const owner = dbByDir.get(cleanPath(dirRaw));
    const ctx = {
      skipProps: !!owner,
      link(href, alt) {
        const hdec = dec(href.trim()); if (/^https?:/i.test(hdec)) return null;
        const path = normPath((dirRaw ? dirRaw + '/' : '') + hdec.split('#')[0]);
        if (/\.csv$/i.test(path)) { const d = dbByDir.get(cleanPath(path.replace(/(_all)?\.csv$/i, ''))); return d ? { t: 'db', db: d.dbr.id, _db: d } : null; }
        if (/\.md$/i.test(path)) { const id = findPage(path.replace(/\.md$/i, '')); return id ? { t: 'pagelink', page: id } : null; }
        const f = byPath.get(path); if (!f) return null;
        if (opt.skipFiles) return { t: 'p', x: esc(`📎 ${baseName(f.name)} (left out of import)`) };
        const blk = { t: 'file', file: { name: f.name.split('/').pop(), size: f.size, type: '' } }; uploads.push([blk, f]); return blk;
      } };
    const res = mdToBlocks(await e.text(), ctx);
    if (owner) {
      const rowId = owner.rowIds.get((res.title || cleanName(baseName(e.name))).toLowerCase());
      const hasBody = res.blocks.some(b => b.t !== 'p' || (b.x || '').trim());
      if (rowId && hasBody) { D.update(rowId, { blocks: res.blocks }); created.push({ rowId, blocks: res.blocks }); }
      continue;
    }
    const id = pageIds.get(key);
    const dbBlock = res.blocks.find(b => b.t === 'db'); if (dbBlock) D.update(dbBlock.db, { page: id });
    const rec = D.create('page', 'ws', { id, title: res.title || cleanName(baseName(e.name)), parent: parentOf(key), blocks: res.blocks.map(({ _db, ...b }) => b), created: Date.now(), order: Date.now() + done, db: dbBlock ? dbBlock.db : null });
    created.push({ pageId: rec.id, blocks: res.blocks });
  }
  // databases nobody links to get their own page
  for (const { dbr, name } of dbByDir.values()) if (!D.val(D.getRec(dbr.id), 'page')) {
    const pg = D.create('page', 'ws', { title: name, blocks: [{ id: uid('b'), t: 'db', db: dbr.id }], db: dbr.id, created: Date.now(), order: Date.now() });
    D.update(dbr.id, { page: pg.id });
  }
  // 3. attachments → encrypted upload queue
  for (let k = 0; k < uploads.length; k++) {
    const [blk, f] = uploads[k]; ui(`Saving attachments… ${k + 1}/${uploads.length}`);
    try { const b = await f.getBlob(); const file = new File([b], blk.file.name, { type: typeFor(blk.file.name) }); blk.file = await Sync.addFile(null, file); nFiles++; }
    catch (err) { blk.file.err = err.message; nFail++; }
  }
  for (const c of created) { const blocks = c.blocks.map(({ _db, ...b }) => b); if (c.rowId) D.update(c.rowId, { blocks: [...blocks] }); else D.update(c.pageId, { blocks: [...blocks] }); }
  await D.flush(); Sync.soon(1000);
  return { pages: pageIds.size, rows: nRows, dbs: dbByDir.size, files: nFiles, failed: nFail, comments: false };
}
const typeFor = n => /\.pdf$/i.test(n) ? 'application/pdf' : /\.png$/i.test(n) ? 'image/png' : /\.jpe?g$/i.test(n) ? 'image/jpeg' : /\.heic$/i.test(n) ? 'image/heic' : /\.gif$/i.test(n) ? 'image/gif' : /\.webp$/i.test(n) ? 'image/webp' : 'application/octet-stream';
