// Folio v2 — shared columns for every table linked to the Planning KPI Tracker (Projects, the Focus pages, the full tracker table).
// Like Notion's "Property visibility": one list of properties, shown or hidden, in one order, with optional column names.
// It is stored on the tracker database record itself, so it syncs with the data and is the same on every device.
import * as D from './data.js';
import * as DB from './db.js';
import { h, icon, menu, sheet, promptBox, toast, confirmBox } from './ui.js';
import { propEditor } from './page.js';
import { parseDate, startOfDay, toISODate, formatDate } from './dates.js';
import { render, now as NOW } from './app.js';
import { editProp, drag } from './table.js';
import { zoomNow } from './ui.js';
import * as E from './entities.js';

/** columns worked out from linked records (not tracker properties): shown in Projects and Focus tables, never in the raw tracker table */
export const COMPUTED = [
  { id: 'x:survey', label: 'Site Survey', w: 96 },
  { id: 'x:ecpar', label: 'ECPAR', w: 132 },
  { id: 'x:ecx', label: 'ECX', w: 64 },
  { id: 'x:days', label: 'Days Left', w: 88 }];
// what the Projects table showed before this setting existed: used once, on first use
const FIRST_SHOWN = ['Project Category', 'x:survey', 'x:ecpar', 'x:ecx', 'Date Assigned', 'Due Date', 'x:days', 'Status'];
const W = { title: 196, text: 166, number: 100, select: 132, status: 132, multi: 146, date: 112, checkbox: 72, url: 170, files: 150, formula: 190, created: 120 };
export const propW = p => /address|remark|note/i.test(p.name) ? 230 : W[p.type] || 150;

const titleOf = dbr => DB.props(dbr).find(p => p.type === 'title');
const allIds = dbr => [...DB.props(dbr).map(p => 'p:' + p.id), ...COMPUTED.map(c => c.id)];

/** the current setting, always complete: every property and computed column is in `order`; the title is always first */
export function cfg(dbr) {
  const ids = allIds(dbr), t = titleOf(dbr), tid = t ? 'p:' + t.id : null;
  let c = D.val(dbr, 'colcfg', null);
  if (!c) {
    const byName = n => n.startsWith('x:') ? n : (p => p ? 'p:' + p.id : null)(DB.propByName(dbr, n));
    const shown = [tid, ...FIRST_SHOWN.map(byName)].filter(Boolean);
    c = { order: [...shown, ...ids.filter(i => !shown.includes(i))], hidden: ids.filter(i => !shown.includes(i)) };
  }
  // the customer name can be moved anywhere (it is always shown); it starts first
  const order = [...new Set((c.order || []).filter(i => ids.includes(i)))];
  if (tid && !order.includes(tid)) order.unshift(tid);
  for (const i of ids) if (!order.includes(i)) order.push(i); // a property added later is shown at the end
  return { order, hidden: (c.hidden || []).filter(i => ids.includes(i) && i !== tid), names: { ...(c.names || {}) }, page: { ...(c.page || {}) },
    widths: { ...(c.widths || {}) }, heights: { ...(c.heights || {}) } };
}
export function save(dbr, c) { D.update(dbr.id, { colcfg: { order: c.order, hidden: c.hidden, names: c.names, page: c.page, widths: c.widths || {}, heights: c.heights || {} } }); }

export const defLabel = (dbr, id) => id.startsWith('p:') ? (DB.props(dbr).find(p => 'p:' + p.id === id)?.name || '') : (COMPUTED.find(c => c.id === id)?.label || '');
export const label = (dbr, id, def) => cfg(dbr).names[id] || def || defLabel(dbr, id);

/** shown columns, in order: { id, p (tracker property, if any), label, w } */
export function columns(dbr, { computed = true, skip = [] } = {}) {
  mergeRefColumns(dbr);
  const c = cfg(dbr), hid = new Set(c.hidden), ps = DB.props(dbr);
  return c.order.filter(id => !hid.has(id) && (computed || id.startsWith('p:'))).map(id => {
    const p = id.startsWith('p:') ? ps.find(q => 'p:' + q.id === id) : null, x = COMPUTED.find(k => k.id === id);
    return { id, p, label: c.names[id] || (p ? p.name : x.label), w: c.widths[id] || (p ? propW(p) : x.w), fixed: !!c.widths[id] };
  }).filter(col => !skip.includes(col.p?.name) && !skip.includes(col.id));
}
/** grid columns: each column has a minimum width and grows with the space left over; the table scrolls sideways when it does not fit */
export function gridOf(list, lead, cols, tail) {
  // a column you resized keeps its exact width; the others have a minimum width and share the space left over
  const spec = [...lead.map(w => typeof w === 'number' ? { w, fixed: true } : w), ...cols.map(c => ({ id: c.id, w: c.w, fixed: c.fixed })), ...tail.map(w => typeof w === 'number' ? { w, fixed: true } : w)];
  list._spec = spec; regrid(list); list.classList.add('ctbl');
}
function regrid(list) {
  const spec = list._spec || [];
  list.style.setProperty('--ccols', spec.map(s => s.fixed ? s.w + 'px' : `minmax(${s.w}px, ${s.w}fr)`).join(' '));
  list.style.setProperty('--cmin', spec.reduce((a, s) => a + s.w + 8, 0) + 'px');
}
// ---------- resize columns and rows (hold the line, move, let go) ----------
let lastTap = { key: '', t: 0 };
const dbl = key => { const hit = lastTap.key === key && Date.now() - lastTap.t < 400; lastTap = hit ? { key: '', t: 0 } : { key, t: Date.now() }; return hit; };
/** add the drag lines to a Projects / Focus table: one per column (in the header) and one under every row */
export function attachResizers(list, dbr) {
  const head = list.querySelector(':scope > .hhd, :scope > .fhd'); if (!head || !list._spec) return;
  const cells = [...head.children];
  cells.forEach((cell, i) => {
    const s = list._spec[i]; if (!s || !s.id) return;
    cell.classList.add('rzc');
    cell.append(h('span', { class: 'crz', 'aria-hidden': 'true', title: 'Hold and drag to change the column width. Double-tap to reset.', onclick: e => e.stopPropagation(),
      onpointerdown: e => { e.stopPropagation(); colDrag(e, list, dbr, s, cell); } }));
  });
  const c = cfg(dbr);
  for (const row of list.querySelectorAll(':scope > .prow:not(.hhd), :scope > .frow:not(.fhd)')) {
    const id = row.dataset.rid; if (!id) continue;
    if (c.heights[id]) { row.style.height = c.heights[id] + 'px'; row.classList.add('rfix'); }
    row.append(h('span', { class: 'rrz', 'aria-hidden': 'true', title: 'Hold and drag to change the row height. Double-tap to reset.', onclick: e => e.stopPropagation(),
      onpointerdown: e => { e.stopPropagation(); rowDrag(e, dbr, row, id); } }));
  }
  requestAnimationFrame(() => list.style.setProperty('--tblh', list.scrollHeight + 'px'));
}
function colDrag(e, list, dbr, s, cell) {
  if (dbl('c' + s.id)) { const c = cfg(dbr); delete c.widths[s.id]; save(dbr, c); render(); return; }
  const z = zoomNow(), w0 = Math.round(cell.getBoundingClientRect().width / z);
  drag(e, dx => { s.w = Math.max(60, Math.min(900, Math.round(w0 + dx / z))); s.fixed = true; regrid(list); },
    moved => { if (!moved) return; const c = cfg(dbr); c.widths[s.id] = s.w; save(dbr, c); list.style.setProperty('--tblh', list.scrollHeight + 'px'); });
}
function rowDrag(e, dbr, row, id) {
  if (dbl('r' + id)) { const c = cfg(dbr); delete c.heights[id]; save(dbr, c); row.style.height = ''; row.classList.remove('rfix'); return; }
  const z = zoomNow(), h0 = row.getBoundingClientRect().height / z; let ht = h0;
  drag(e, (dx, dy) => { ht = Math.max(36, Math.min(800, Math.round(h0 + dy / z))); row.style.height = ht + 'px'; row.classList.add('rfix'); },
    moved => { if (!moved) return; const c = cfg(dbr); c.heights[id] = ht; save(dbr, c); });
}

/** one editable cell for a tracker property: tapping it edits the value and does not open the project */
/** 'Reference No (ECX No)' column: two cards in one cell — ECX No on top, Project Reference (ECPAR No) below; the ECPAR column is hidden (once) */
export const isRefCol = p => !!p && p.name.toLowerCase() === E.REF_ECX.toLowerCase();
export function refCards(row, { big = false } = {}) {
  const dbr = DB.kpiDb(), rec = D.getRec(row.id) || row, pe = dbr && DB.propByName(dbr, E.REF_ECX), pp = dbr && DB.propByName(dbr, E.REF_ECPAR);
  const cats = [].concat((dbr && DB.propByName(dbr, 'Project Category') && DB.value(rec, DB.propByName(dbr, 'Project Category'))) || []), rep = E.reportOnly(cats);
  const val = p => p ? String(D.val(rec, 'p:' + p.id) || '').trim() : '';
  const card = (p, label, ph, top) => {
    const v = val(p);
    const b = rep && !top ? h('span', { class: 'refv muted' }, 'Not applicable') : h('button', { class: 'refv mono' + (v ? '' : ' empty'), type: 'button', 'aria-label': label + ': ' + (v || 'Empty'), onclick: async e => { e.stopPropagation(); if (Date.now() - (window.__colResizeAt || 0) < 700) return;
      const nv = await promptBox(label, v, ph); if (nv == null || !p) return; D.update(rec.id, { ['p:' + p.id]: nv.trim() || null }); render(); } },
      top && big ? h('h1', {}, v || 'ECX No') : h('span', {}, v || (top ? 'ECX No' : 'ECPAR No')));
    // minimalist: only the number (the label is kept for screen readers); an empty card shows a faint 'ECX No' / 'ECPAR No'
    return h('span', { class: 'refcard', title: label }, b);
  };
  return h('span', { class: 'refcards' + (big ? ' big' : '') }, card(pe, E.REF_ECX, 'e.g. ECX_202607_2457', true), card(pp, E.REF_ECPAR, 'e.g. BTU-260476', false));
}
export function mergeRefColumns(dbr) {
  if (!dbr || D.val(D.getRec(dbr.id) || dbr, 'refmerge2', null)) return;
  const m1 = DB.propByName(dbr, E.REF_ECX), m2 = DB.propByName(dbr, E.REF_ECPAR); if (!m1) return;
  const c = cfg(dbr);
  c.hidden = [...new Set([...c.hidden.filter(i => i !== 'p:' + m1.id), ...(m2 ? ['p:' + m2.id] : [])])];
  if (!c.names['p:' + m1.id]) c.names['p:' + m1.id] = 'Reference No';
  // the Reference No column sits right after the customer name
  const t = titleOf(dbr), ti = t ? c.order.indexOf('p:' + t.id) : -1, i = c.order.indexOf('p:' + m1.id); if (i > ti + 1) { c.order.splice(i, 1); c.order.splice(ti + 1, 0, 'p:' + m1.id); }
  save(dbr, c); D.update(dbr.id, { refmerge2: 1 });
}
export function cell(dbr, col, row) {
  if (isRefCol(col.p)) return h('span', { class: 'cc ce crefs', 'data-col': col.id, onclick: e => e.stopPropagation(), onkeydown: e => e.stopPropagation() }, refCards(row));
  const ed = propEditor(D.getRec(row.id) || row, col.p, dbr, { compact: true, dfmt: 'DD/MM/YYYY' });
  return h('span', { class: 'cc ce' + (col.p.type === 'title' ? ' ctitle' : '') + (col.p.type === 'date' || col.p.type === 'created' ? ' cdate' : ''), 'data-col': col.id, onclick: e => e.stopPropagation(), onkeydown: e => e.stopPropagation() }, ed);
}
// after an edit in a table: redraw when the person has finished (the row's other columns, counts and charts follow)
let redraw = 0;
document.addEventListener('folio-row', () => {
  if (!document.querySelector('.ctbl')) return;
  clearTimeout(redraw);
  const go = () => { const a = document.activeElement; if (document.querySelector('.menu, .sheet-back, .pop') || a && (a.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(a.tagName))) { redraw = setTimeout(go, 600); return; } render(); };
  redraw = setTimeout(go, 350);
});

// ---------- headings: tap to rename, sort, filter or hide ----------
export function headCell(dbr, col, { sort, onSort, onFilter, cls = '' } = {}) {
  const on = sort && sort.id === col.id;
  const b = h('button', { class: 'chd ' + cls, type: 'button', 'data-col': col.id, 'aria-label': col.label + ' column options', onclick: e => { e.stopPropagation(); headMenu(dbr, col, b, { onSort, onFilter }); } },
    col.p ? icon(DB.TYPE_ICON[col.p.type] || 'text', 13) : icon('formula', 13), h('span', {}, col.label), on ? h('i', { class: 'csort' }, sort.dir === 'desc' ? '↓' : '↑') : null);
  return b;
}
function headMenu(dbr, col, anchor, { onSort, onFilter }) {
  const t = titleOf(dbr), isTitle = t && col.id === 'p:' + t.id;
  menu(anchor, [
    { label: 'Rename column', icon: 'pencil', run: () => rename(dbr, col.id) },
    ...(onSort ? [{ label: 'Sort ascending', icon: 'sort', run: () => onSort({ id: col.id, dir: 'asc' }) }, { label: 'Sort descending', icon: 'sort', run: () => onSort({ id: col.id, dir: 'desc' }) }] : []),
    ...(onFilter && col.p ? [{ label: 'Filter by ' + col.label, icon: 'filter', run: () => onFilter(col.p.id) }] : []),
    ...(isTitle ? [] : ['-', { label: 'Hide in all tables', icon: 'eye', run: () => { const c = cfg(dbr); c.hidden = [...new Set([...c.hidden, col.id])]; save(dbr, c); toast(col.label + ' hidden. Show it again from Properties.'); render(); } }])], { width: 230 });
}
async function rename(dbr, id, def) {
  const c = cfg(dbr), cur = c.names[id] || def || defLabel(dbr, id);
  const v = await promptBox('Column name', cur); if (v == null) return;
  const t = v.replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!t || t === (def || defLabel(dbr, id))) delete c.names[id]; else c.names[id] = t;
  save(dbr, c); render();
}

// ---------- sorting by any column ----------
const sortVal = (row, p, n) => {
  const v = DB.raw(row, p);
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return null;
  if (p.type === 'date' || p.type === 'created') { const d = p.type === 'created' ? new Date(D.val(row, 'created', 0)) : parseDate(v); return d ? +d : null; }
  if (p.type === 'number') return +v;
  if (p.type === 'checkbox') return v ? 1 : 0;
  if (p.type === 'formula') return DB.display(row, p, n);
  return Array.isArray(v) ? v.join(', ').toLowerCase() : String(v).toLowerCase();
};
/** compare two rows by a property; empty values always go last */
export function comparer(dbr, sort, rowOf = r => r.row, n = NOW()) {
  const p = sort && sort.id.startsWith('p:') && DB.props(dbr).find(q => 'p:' + q.id === sort.id); if (!p) return null;
  const k = sort.dir === 'desc' ? -1 : 1;
  return (a, b) => { const x = sortVal(rowOf(a), p, n), y = sortVal(rowOf(b), p, n); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (x < y ? -1 : x > y ? 1 : 0) * k; };
}

// ---------- filter by any property ----------
const OPS = {
  text: [['has', 'contains'], ['not', 'does not contain'], ['empty', 'is empty'], ['filled', 'is not empty']],
  number: [['eq', '='], ['gt', '>'], ['lt', '<'], ['empty', 'is empty'], ['filled', 'is not empty']],
  select: [['is', 'is'], ['isnot', 'is not'], ['empty', 'is empty'], ['filled', 'is not empty']],
  multi: [['has', 'has'], ['hasnot', 'does not have'], ['empty', 'is empty'], ['filled', 'is not empty']],
  date: [['on', 'is on'], ['before', 'is before'], ['after', 'is after'], ['empty', 'is empty'], ['filled', 'is not empty']],
  checkbox: [['yes', 'is ticked'], ['no', 'is not ticked']] };
const kindOf = p => ({ title: 'text', text: 'text', url: 'text', formula: 'text', files: 'text', number: 'number', select: 'select', status: 'select', multi: 'multi', date: 'date', created: 'date', checkbox: 'checkbox' })[p.type] || 'text';
const noValue = op => ['empty', 'filled', 'yes', 'no'].includes(op);
export function matches(dbr, row, f, n = NOW()) {
  const p = DB.props(dbr).find(q => q.id === f.p); if (!p) return true;
  const k = kindOf(p), raw = DB.raw(row, p);
  const txt = p.type === 'formula' ? DB.display(row, p, n) : p.type === 'files' ? (raw || []).map(x => x.name).join(' ') : Array.isArray(raw) ? raw.join(' ') : raw == null ? '' : String(raw);
  const empty = k === 'checkbox' ? !raw : txt.trim() === '';
  if (f.op === 'empty') return empty; if (f.op === 'filled') return !empty;
  if (f.op === 'yes') return !!raw; if (f.op === 'no') return !raw;
  const v = String(f.v ?? '');
  switch (f.op) {
    case 'has': return k === 'multi' ? (raw || []).includes(v) : txt.toLowerCase().includes(v.toLowerCase());
    case 'not': return !txt.toLowerCase().includes(v.toLowerCase());
    case 'hasnot': return !(raw || []).includes(v);
    case 'is': return txt === v; case 'isnot': return txt !== v;
    case 'eq': return !empty && +raw === +v; case 'gt': return !empty && +raw > +v; case 'lt': return !empty && +raw < +v;
  }
  const d = p.type === 'created' ? new Date(D.val(row, 'created', 0)) : parseDate(raw), w = parseDate(v); if (!d || !w) return false;
  const a = +startOfDay(d), b = +startOfDay(w);
  return f.op === 'on' ? a === b : f.op === 'before' ? a < b : a > b;
}
export const applyFilters = (dbr, list, fs, rowOf = r => r.row, n = NOW()) => fs && fs.length ? list.filter(r => { const row = rowOf(r); return row && fs.every(f => matches(dbr, row, f, n)); }) : list;
export function filterText(dbr, f) {
  const p = DB.props(dbr).find(q => q.id === f.p); if (!p) return '';
  const name = label(dbr, 'p:' + p.id), op = (OPS[kindOf(p)].find(o => o[0] === f.op) || [, f.op])[1];
  return name + ' ' + op + (noValue(f.op) ? '' : ' ' + (kindOf(p) === 'date' ? formatDate(parseDate(f.v), 'DD/MM/YYYY') : f.v));
}
/** "Add a filter" for any tracker property; calls back with the new filter */
export function addFilterSheet(dbr, onAdd, preset = null) {
  const ps = DB.props(dbr).filter(p => p.type !== 'files');
  const pSel = h('select', { class: 'field', 'aria-label': 'Property' }, ps.map(p => h('option', { value: p.id, selected: p.id === preset ? true : null }, label(dbr, 'p:' + p.id))));
  const opSel = h('select', { class: 'field', 'aria-label': 'Condition' }), valBox = h('div', { class: 'cfval' });
  const paint = () => {
    const p = ps.find(q => q.id === pSel.value), k = kindOf(p);
    opSel.replaceChildren(...OPS[k].map(([v, l]) => h('option', { value: v }, l)));
    paintVal();
  };
  const paintVal = () => {
    const p = ps.find(q => q.id === pSel.value), k = kindOf(p);
    if (noValue(opSel.value)) return valBox.replaceChildren();
    const opts = k === 'select' || k === 'multi' ? (p.options || []).map(o => o.name) : null;
    valBox.replaceChildren(opts ? h('select', { class: 'field', 'aria-label': 'Value' }, opts.map(o => h('option', { value: o }, o)))
      : h('input', { class: 'field', 'aria-label': 'Value', type: k === 'date' ? 'date' : k === 'number' ? 'number' : 'text', value: k === 'date' ? toISODate(new Date(NOW())) : '', placeholder: 'Value' }));
  };
  pSel.onchange = paint; opSel.onchange = paintVal; paint();
  const s = sheet('Add a filter', h('div', { class: 'cfsheet' },
    h('label', { class: 'glabel' }, 'Property'), pSel, h('label', { class: 'glabel' }, 'Condition'), opSel, valBox,
    h('button', { class: 'btn block primary', onclick: () => {
      const vEl = valBox.querySelector('input,select'), v = vEl ? vEl.value.trim() : '';
      if (vEl && !v) { vEl.focus(); toast('Please enter a value.'); return; }
      s.close(); onAdd({ p: pSel.value, op: opSel.value, v });
    } }, 'Add filter')));
}

// ---------- add and delete properties ----------
/** properties Folio itself works with (KPI, Focus pages, Alert, maps): they can be hidden or renamed, but not deleted */
export const CORE_PROPS = ['Status', 'Project Category', 'Due Date', 'Date Assigned', 'Date Completed', 'ECPAR Rejected', 'ECX Rejected', 'Priority', 'Address', 'Pin Location', 'Reference No (ECX No)', 'Project Reference (ECPAR No)', 'Station', 'Archive', 'Alert', 'Next Task', 'ECX Link'];
export const isCore = p => p.type === 'title' || CORE_PROPS.includes(p.name);
const TYPE_ORDER = ['text', 'number', 'select', 'multi', 'status', 'date', 'checkbox', 'url', 'files', 'formula'];
async function newProperty(dbr, anchor) {
  if (D.val(dbr, 'locked')) return toast('This database is locked.'), null;
  const name = (await promptBox('New property name', '', 'e.g. Feeder'))?.replace(/\s+/g, ' ').trim(); if (!name) return null;
  if (DB.props(dbr).some(p => p.name.toLowerCase() === name.toLowerCase())) { toast('There is already a property called ' + name + '.'); return null; }
  const type = await new Promise(res => menu(anchor, [{ el: h('div', { class: 'mhead' }, 'Type of “' + name + '”') }, ...TYPE_ORDER.filter(t => DB.TYPES[t]).map(t => ({ label: DB.TYPES[t], icon: DB.TYPE_ICON[t], run: () => res(t) }))], { width: 240 }));
  if (!type) return null;
  const p = { id: 'p' + Date.now().toString(36), name, type, options: [], ...(type === 'formula' ? { formula: '""' } : {}) };
  DB.saveProps(dbr, [...DB.props(dbr), p]);
  const d2 = DB.db(dbr.id), c = cfg(d2); c.hidden = c.hidden.filter(x => x !== 'p:' + p.id); save(d2, c); // a new property is shown straight away
  toast(name + ' added to every linked table'); return p;
}
async function deleteProperty(dbr, p) {
  if (isCore(p)) { toast(p.name + ' is used by Folio (KPI, Focus pages, Alert…): hide it instead.'); return false; }
  if (!await confirmBox(`Delete the property “${p.name}”? Its values in every project are removed, in every linked table.`, 'Delete property')) return false;
  DB.saveProps(dbr, DB.props(DB.db(dbr.id)).filter(x => x.id !== p.id));
  const c = cfg(DB.db(dbr.id)); delete c.names['p:' + p.id]; save(DB.db(dbr.id), c);
  toast(p.name + ' deleted'); return true;
}

// ---------- Property visibility (one list for every linked table) ----------
/** pageCols: columns that exist only on this page (Focus pages): [{ id, label }]; they can be hidden on this page */
// skip: project columns that do not apply on this page (left out of the table and of this list), as names or column ids
export function visibilitySheet(dbr, { page = null, pageTitle = '', pageCols = [], skip = [], after = render } = {}) {
  let c = cfg(dbr), q = '';
  const t = titleOf(dbr), tid = t ? 'p:' + t.id : null, ps = DB.props(dbr);
  const nameOf = id => c.names[id] || defLabel(dbr, id);
  const icOf = id => { const p = ps.find(x => 'p:' + x.id === id); return icon(p ? DB.TYPE_ICON[p.type] || 'text' : 'formula', 18); };
  const commit = () => { save(dbr, c); c = cfg(dbr); };
  const fresh = () => { dbr = DB.db(dbr.id); c = cfg(dbr); paint(); };
  const rowMenu = (anchor, id) => {
    const p = DB.props(DB.db(dbr.id)).find(x => 'p:' + x.id === id);
    menu(anchor, [{ label: 'Rename column', icon: 'pencil', run: async () => { await rename(dbr, id); fresh(); } },
      ...(p && p.type !== 'title' ? [{ label: 'Edit property', icon: 'list', run: () => editProp(DB.db(dbr.id), p, fresh) }] : []),
      ...(p ? [p && isCore(p) ? { label: 'Used by Folio — hide it instead', icon: 'lock', run: () => {} } : { label: 'Delete property', icon: 'trash', danger: true, run: async () => { if (await deleteProperty(DB.db(dbr.id), p)) fresh(); } }]
        : [{ label: 'Worked out by Folio — hide it instead', icon: 'lock', run: () => {} }])], { width: 250 });
  };
  const body = h('div', { class: 'pvis' });
  const search = h('input', { type: 'search', class: 'pvsearch', placeholder: 'Search for a property…', 'aria-label': 'Search for a property', oninput: e => { q = e.target.value.trim().toLowerCase(); paint(); } });
  const eye = (on, l, run, dis) => h('button', { class: 'pveye' + (on ? ' on' : ''), type: 'button', disabled: dis ? true : null, 'aria-pressed': on ? 'true' : 'false', 'aria-label': (on ? 'Hide ' : 'Show ') + l, onclick: run }, icon(on ? 'eye' : 'eyeoff', 19));
  const item = (id, shown, { fixed = false, drag = false, noHide = fixed } = {}) => {
    const l = nameOf(id), el = h('div', { class: 'pvrow' + (fixed ? ' fixed' : ''), 'data-id': id },
      drag ? h('button', { class: 'pvh', type: 'button', 'aria-label': 'Move ' + l + ' (drag, or use the arrow keys)' }, icon('grip', 16)) : h('span', { class: 'pvh off' }),
      h('span', { class: 'pvi' }, icOf(id)),
      h('button', { class: 'pvn', type: 'button', title: 'Rename', onclick: async () => { await rename(dbr, id); c = cfg(dbr); paint(); } }, l, c.names[id] ? h('small', {}, defLabel(dbr, id)) : null),
      eye(shown, l, () => { const hid = new Set(c.hidden); shown ? hid.add(id) : hid.delete(id); c.hidden = [...hid]; commit(); paint(); }, noHide),
      h('button', { class: 'pvmore', type: 'button', 'aria-label': 'More for ' + l, onclick: e => rowMenu(e.currentTarget, id) }, icon('more', 18)));
    if (drag) dragHandle(el.querySelector('.pvh'), el);
    return el;
  };
  // Notion-style reordering: press the ⋮⋮ handle (or long-press the row), the row lifts and follows your finger,
  // the others slide out of the way, let go to drop it there. The sheet scrolls when you reach its edge.
  const dragHandle = (hd, el) => {
    const begin = (y0, touch, pid) => {
      const list = el.parentElement, rows = [...list.children].filter(x => x.classList.contains('pvrow'));
      const movable = rows.filter(x => !x.classList.contains('fixed')), from = movable.indexOf(el); if (from < 0) return;
      const tops = movable.map(r => r.getBoundingClientRect().top), hgt = el.getBoundingClientRect().height;
      const scroller = el.closest('.sheet-body') || el.closest('.sheet'), s0 = scroller ? scroller.scrollTop : 0;
      let to = from, y = y0, raf = 0;
      el.classList.add('drag'); list.classList.add('pvdragging');
      try { navigator.vibrate && navigator.vibrate(8); } catch {}
      const place = () => {
        const ds = scroller ? scroller.scrollTop - s0 : 0, dy = y - y0 + ds;
        el.style.transform = `translateY(${dy}px)`;
        const mid = tops[from] + hgt / 2 + dy;
        to = 0; for (let k = 0; k < movable.length; k++) if (k !== from && mid > tops[k] + hgt / 2) to = k < from ? k + 1 : k;
        if (to > from) to = Math.min(to, movable.length - 1);
        movable.forEach((r, k) => { if (r === el) return; const shift = from < to && k > from && k <= to ? -hgt : from > to && k >= to && k < from ? hgt : 0; r.style.transform = shift ? `translateY(${shift}px)` : ''; });
      };
      const edge = () => { // keep scrolling while the finger rests near the top or bottom of the sheet
        if (!scroller) return; const b = scroller.getBoundingClientRect(), z = 48;
        const v = y < b.top + z ? -8 : y > b.bottom - z ? 8 : 0;
        if (v) { scroller.scrollTop += v; place(); }
        raf = requestAnimationFrame(edge);
      };
      raf = requestAnimationFrame(edge);
      const move = ev => { const t = ev.touches ? ev.touches[0] : ev; if (!t) return; if (ev.cancelable) ev.preventDefault(); y = t.clientY; place(); };
      const end = () => {
        cancelAnimationFrame(raf);
        document.removeEventListener('touchmove', move, { passive: false }); document.removeEventListener('touchend', end); document.removeEventListener('touchcancel', end);
        document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', end); document.removeEventListener('pointercancel', end);
        movable.forEach(r => { r.style.transform = ''; }); el.classList.remove('drag'); list.classList.remove('pvdragging');
        if (to !== from) { const ref = movable[to]; to > from ? ref.after(el) : ref.before(el); order(list); }
      };
      if (touch) { document.addEventListener('touchmove', move, { passive: false }); document.addEventListener('touchend', end); document.addEventListener('touchcancel', end); }
      else { document.addEventListener('pointermove', move); document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end); }
    };
    // the handle: drag straight away (finger or mouse)
    hd.addEventListener('touchstart', e => { if (e.touches.length !== 1) return; e.preventDefault(); begin(e.touches[0].clientY, true); }, { passive: false });
    hd.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') return; e.preventDefault(); begin(e.clientY, false); });
    // the rest of the row: long-press to drag (a tap still renames, a swipe still scrolls)
    let lp = null, sy = 0;
    el.addEventListener('touchstart', e => { if (e.target.closest('.pvh, .pveye, .pvmore') || e.touches.length !== 1) return; sy = e.touches[0].clientY;
      lp = setTimeout(() => { lp = 'on'; el._noTap = true; begin(sy, true); }, 420); }, { passive: true });
    el.addEventListener('touchmove', e => { if (lp && lp !== 'on' && Math.abs(e.touches[0].clientY - sy) > 8) { clearTimeout(lp); lp = null; } }, { passive: true });
    el.addEventListener('touchend', () => { if (lp && lp !== 'on') clearTimeout(lp); lp = null; setTimeout(() => { el._noTap = false; }, 50); });
    el.addEventListener('click', e => { if (el._noTap) { e.stopPropagation(); e.preventDefault(); } }, true);
    hd.addEventListener('keydown', e => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return; e.preventDefault();
      const list = el.parentElement, sib = e.key === 'ArrowUp' ? el.previousElementSibling : el.nextElementSibling;
      if (!sib || sib.classList.contains('fixed')) return; e.key === 'ArrowUp' ? list.insertBefore(el, sib) : list.insertBefore(sib, el); order(list); hd.focus();
    });
  };
  const order = list => { const shown = [...list.children].map(x => x.dataset.id); const hid = c.order.filter(i => !shown.includes(i)); c.order = [...shown, ...hid]; commit(); };
  const group = (title, act, rows) => [h('div', { class: 'pvhd' }, h('span', {}, title), act), h('div', { class: 'pvlist' }, rows)];
  const paint = () => {
    const hid = new Set(c.hidden), ok = id => !q || nameOf(id).toLowerCase().includes(q) || defLabel(dbr, id).toLowerCase().includes(q);
    const off = id => skip.includes(id) || skip.includes(nameOf(id)) || skip.includes(defLabel(dbr, id));
    const shown = c.order.filter(id => !hid.has(id) && !off(id)), hidden = c.order.filter(id => hid.has(id) && !off(id));
    const rows1 = shown.filter(ok).map(id => item(id, true, { drag: !q, noHide: id === tid })), rows2 = hidden.filter(ok).map(id => item(id, false));
    const pg = page ? (c.page[page] || []) : [];
    body.replaceChildren(search,
      ...group('Shown in table', shown.length > 1 ? h('button', { class: 'link sm', onclick: () => { c.hidden = c.order.filter(i => i !== tid); commit(); paint(); } }, 'Hide all') : null, rows1.length ? rows1 : h('p', { class: 'pvnone' }, 'No property matches.')),
      ...(hidden.length ? group('Hidden in table', h('button', { class: 'link sm', onclick: () => { c.hidden = []; commit(); paint(); } }, 'Show all'), rows2.length ? rows2 : h('p', { class: 'pvnone' }, 'No property matches.')) : []),
      ...(page && pageCols.length ? group('Only on ' + pageTitle, null, pageCols.filter(x => !q || x.label.toLowerCase().includes(q)).map(x => {
        const on = !pg.includes(x.id);
        return h('div', { class: 'pvrow', 'data-id': x.id }, h('span', { class: 'pvh off' }), h('span', { class: 'pvi' }, icon('formula', 18)),
          h('button', { class: 'pvn', type: 'button', title: 'Rename', onclick: async () => { await rename(dbr, x.id, x.def); c = cfg(dbr); paint(); } }, c.names[x.id] || x.def),
          eye(on, x.def, () => { const s = new Set(c.page[page] || []); on ? s.add(x.id) : s.delete(x.id); c.page = { ...c.page, [page]: [...s] }; commit(); paint(); }, x.lock)); // 'fixed' is only a set width, never a reason to lock the eye
      })) : []),
      h('button', { class: 'pvnew', type: 'button', onclick: async e => { if (await newProperty(DB.db(dbr.id), e.currentTarget)) fresh(); } }, icon('plus', 18), 'New property'),
      h('p', { class: 'pvnote' }, 'Applies to every table linked to ' + (D.val(dbr, 'name') || 'the tracker') + ': Projects, the Focus pages and the full tracker table. Tap a name to rename the column.'));
  };
  paint();
  sheet('Property visibility', body, { onDone: after });
}
/** page-only columns that are switched off on this page */
export const pageHidden = (dbr, page) => new Set(cfg(dbr).page[page] || []);
export const pageLabel = (dbr, id, def) => cfg(dbr).names[id] || def;
