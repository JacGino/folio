// Folio v2 — shared columns for every table linked to the Planning KPI Tracker (Projects, the Focus pages, the full tracker table).
// Like Notion's "Property visibility": one list of properties, shown or hidden, in one order, with optional column names.
// It is stored on the tracker database record itself, so it syncs with the data and is the same on every device.
import * as D from './data.js';
import * as DB from './db.js';
import { h, icon, menu, sheet, promptBox, toast } from './ui.js';
import { propEditor } from './page.js';
import { parseDate, startOfDay, toISODate, formatDate } from './dates.js';
import { render, now as NOW } from './app.js';

/** columns worked out from linked records (not tracker properties): shown in Projects and Focus tables, never in the raw tracker table */
export const COMPUTED = [
  { id: 'x:survey', label: 'Site Survey', w: 80 },
  { id: 'x:ecpar', label: 'ECPAR', w: 116 },
  { id: 'x:ecx', label: 'ECX', w: 52 },
  { id: 'x:days', label: 'Days Left', w: 72 }];
// what the Projects table showed before this setting existed: used once, on first use
const FIRST_SHOWN = ['Project Category', 'x:survey', 'x:ecpar', 'x:ecx', 'Date Assigned', 'Due Date', 'x:days', 'Status'];
const W = { title: 180, text: 150, number: 90, select: 116, status: 116, multi: 130, date: 92, checkbox: 72, url: 170, files: 150, formula: 190, created: 120 };
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
  const order = (c.order || []).filter(i => ids.includes(i) && i !== tid);
  for (const i of ids) if (!order.includes(i) && i !== tid) order.push(i); // a property added later is shown at the end
  return { order: tid ? [tid, ...order] : order, hidden: (c.hidden || []).filter(i => ids.includes(i) && i !== tid), names: { ...(c.names || {}) }, page: { ...(c.page || {}) } };
}
export function save(dbr, c) { D.update(dbr.id, { colcfg: { order: c.order, hidden: c.hidden, names: c.names, page: c.page } }); }

export const defLabel = (dbr, id) => id.startsWith('p:') ? (DB.props(dbr).find(p => 'p:' + p.id === id)?.name || '') : (COMPUTED.find(c => c.id === id)?.label || '');
export const label = (dbr, id, def) => cfg(dbr).names[id] || def || defLabel(dbr, id);

/** shown columns, in order: { id, p (tracker property, if any), label, w } */
export function columns(dbr, { computed = true, skip = [] } = {}) {
  const c = cfg(dbr), hid = new Set(c.hidden), ps = DB.props(dbr);
  return c.order.filter(id => !hid.has(id) && (computed || id.startsWith('p:'))).map(id => {
    const p = id.startsWith('p:') ? ps.find(q => 'p:' + q.id === id) : null, x = COMPUTED.find(k => k.id === id);
    return { id, p, label: c.names[id] || (p ? p.name : x.label), w: p ? propW(p) : x.w };
  }).filter(col => !skip.includes(col.p?.name));
}
/** grid columns: each column has a minimum width and grows with the space left over; the table scrolls sideways when it does not fit */
export function gridOf(list, lead, cols, tail) {
  const ws = [...lead, ...cols.map(c => c.w), ...tail];
  list.style.setProperty('--ccols', ws.map((w, i) => i === 0 || i === ws.length - 1 ? w + 'px' : `minmax(${w}px, ${w}fr)`).join(' '));
  list.style.setProperty('--cmin', ws.reduce((a, b) => a + b + 8, 0) + 'px');
  list.classList.add('ctbl');
}

/** one editable cell for a tracker property: tapping it edits the value and does not open the project */
export function cell(dbr, col, row) {
  const ed = propEditor(D.getRec(row.id) || row, col.p, dbr, { compact: true, dfmt: 'D/M/YYYY' });
  return h('span', { class: 'cc ce' + (col.p.type === 'title' ? ' ctitle' : ''), 'data-col': col.id, onclick: e => e.stopPropagation(), onkeydown: e => e.stopPropagation() }, ed);
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
  return name + ' ' + op + (noValue(f.op) ? '' : ' ' + (kindOf(p) === 'date' ? formatDate(parseDate(f.v), 'D/M/YYYY') : f.v));
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

// ---------- Property visibility (one list for every linked table) ----------
/** pageCols: columns that exist only on this page (Focus pages): [{ id, label }]; they can be hidden on this page */
export function visibilitySheet(dbr, { page = null, pageTitle = '', pageCols = [], after = render } = {}) {
  let c = cfg(dbr), q = '';
  const t = titleOf(dbr), tid = t ? 'p:' + t.id : null, ps = DB.props(dbr);
  const nameOf = id => c.names[id] || defLabel(dbr, id);
  const icOf = id => { const p = ps.find(x => 'p:' + x.id === id); return icon(p ? DB.TYPE_ICON[p.type] || 'text' : 'formula', 18); };
  const commit = () => { save(dbr, c); c = cfg(dbr); };
  const body = h('div', { class: 'pvis' });
  const search = h('input', { type: 'search', class: 'pvsearch', placeholder: 'Search for a property…', 'aria-label': 'Search for a property', oninput: e => { q = e.target.value.trim().toLowerCase(); paint(); } });
  const eye = (on, l, run, dis) => h('button', { class: 'pveye' + (on ? ' on' : ''), type: 'button', disabled: dis ? true : null, 'aria-pressed': on ? 'true' : 'false', 'aria-label': (on ? 'Hide ' : 'Show ') + l, onclick: run }, icon(on ? 'eye' : 'eyeoff', 19));
  const item = (id, shown, { fixed = false, drag = false } = {}) => {
    const l = nameOf(id), el = h('div', { class: 'pvrow' + (fixed ? ' fixed' : ''), 'data-id': id },
      drag ? h('button', { class: 'pvh', type: 'button', 'aria-label': 'Move ' + l + ' (drag, or use the arrow keys)' }, icon('grip', 16)) : h('span', { class: 'pvh off' }),
      h('span', { class: 'pvi' }, icOf(id)),
      h('button', { class: 'pvn', type: 'button', title: 'Rename', onclick: async () => { await rename(dbr, id); c = cfg(dbr); paint(); } }, l, c.names[id] ? h('small', {}, defLabel(dbr, id)) : null),
      eye(shown, l, () => { const hid = new Set(c.hidden); shown ? hid.add(id) : hid.delete(id); c.hidden = [...hid]; commit(); paint(); }, fixed));
    if (drag) dragHandle(el.querySelector('.pvh'), el);
    return el;
  };
  const dragHandle = (hd, el) => {
    hd.addEventListener('pointerdown', e => {
      e.preventDefault(); const list = el.parentElement; hd.setPointerCapture(e.pointerId); el.classList.add('drag');
      const move = ev => { const sibs = [...list.children].filter(x => x !== el && !x.classList.contains('fixed')); const before = sibs.find(s => { const r = s.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; }); before ? list.insertBefore(el, before) : list.append(el); };
      const up = () => { hd.removeEventListener('pointermove', move); el.classList.remove('drag'); order(list); };
      hd.addEventListener('pointermove', move); hd.addEventListener('pointerup', up, { once: true }); hd.addEventListener('pointercancel', up, { once: true });
    });
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
    const shown = c.order.filter(id => !hid.has(id)), hidden = c.order.filter(id => hid.has(id));
    const rows1 = shown.filter(ok).map(id => item(id, true, { fixed: id === tid, drag: id !== tid && !q })), rows2 = hidden.filter(ok).map(id => item(id, false));
    const pg = page ? (c.page[page] || []) : [];
    body.replaceChildren(search,
      ...group('Shown in table', shown.length > 1 ? h('button', { class: 'link sm', onclick: () => { c.hidden = c.order.filter(i => i !== tid); commit(); paint(); } }, 'Hide all') : null, rows1.length ? rows1 : h('p', { class: 'pvnone' }, 'No property matches.')),
      ...(hidden.length ? group('Hidden in table', h('button', { class: 'link sm', onclick: () => { c.hidden = []; commit(); paint(); } }, 'Show all'), rows2.length ? rows2 : h('p', { class: 'pvnone' }, 'No property matches.')) : []),
      ...(page && pageCols.length ? group('Only on ' + pageTitle, null, pageCols.filter(x => !q || x.label.toLowerCase().includes(q)).map(x => {
        const on = !pg.includes(x.id);
        return h('div', { class: 'pvrow', 'data-id': x.id }, h('span', { class: 'pvh off' }), h('span', { class: 'pvi' }, icon('formula', 18)),
          h('button', { class: 'pvn', type: 'button', title: 'Rename', onclick: async () => { await rename(dbr, x.id, x.def); c = cfg(dbr); paint(); } }, c.names[x.id] || x.def),
          eye(on, x.def, () => { const s = new Set(c.page[page] || []); on ? s.add(x.id) : s.delete(x.id); c.page = { ...c.page, [page]: [...s] }; commit(); paint(); }, x.fixed));
      })) : []),
      h('p', { class: 'pvnote' }, 'Applies to every table linked to ' + (D.val(dbr, 'name') || 'the tracker') + ': Projects, the Focus pages and the full tracker table. Tap a name to rename the column.'));
  };
  paint();
  sheet('Property visibility', body, { onDone: after });
}
/** page-only columns that are switched off on this page */
export const pageHidden = (dbr, page) => new Set(cfg(dbr).page[page] || []);
export const pageLabel = (dbr, id, def) => cfg(dbr).names[id] || def;
