// Folio v2 — database views (table, board, calendar, list), toolbar, filter & settings sheets.
import * as D from './data.js';
import * as DB from './db.js';
import { h, icon, menu, sheet, group, row, toast, promptBox, confirmBox, esc, later } from './ui.js';
import { formatDate, parseDate, toISODate, dateAdd } from './dates.js';
import { go, openTask, state, now, browserUrl } from './app.js';
import { propEditor, chip } from './page.js';
import { evaluate } from './formula.js';
import { popEdit } from './popedit.js';

const cur = new Map();     // dbId -> view id
const searches = new Map(); // dbId -> text
const months = new Map();  // dbId -> month offset for calendar

function viewOf(dbr, want) {
  const vs = DB.views(dbr); if (!vs.length) return null;
  if (typeof want === 'number' && vs[want]) cur.set(dbr.id, vs[want].id);
  else if (typeof want === 'string' && vs.find(v => v.id === want)) cur.set(dbr.id, want);
  return vs.find(v => v.id === cur.get(dbr.id)) || vs[0];
}
const saveView = (dbr, v) => DB.saveViews(dbr, DB.views(dbr).map(x => x.id === v.id ? v : x));

export function renderDb(dbId, opts = {}) { return h('div', { class: 'wrap' }, renderDbBlock(dbId, opts)); }

export function renderDbBlock(dbId, { initialView } = {}) {
  const box = h('div', { class: 'dbblock' });
  const draw = () => {
    const dbr = DB.db(dbId); if (!dbr) { box.replaceChildren(h('p', { class: 'muted' }, 'Database not found.')); return; }
    const v = viewOf(dbr, initialView); initialView = undefined;
    const q = searches.get(dbId) || '';
    const list = DB.viewRows(dbr, v || {}, { search: q, now: now() });
    const searchOn = searches.has(dbId);
    const vbtn = h('button', { class: 'viewbtn', 'aria-haspopup': 'listbox', onclick: () => menu(vbtn, [
      ...DB.views(dbr).map(x => ({ label: x.name, icon: x.type === 'board' ? 'board' : x.type === 'calendar' ? 'date' : 'table', checked: x.id === v?.id, run: () => { cur.set(dbId, x.id); draw(); } })), '-',
      { label: 'New view', icon: 'plus', run: () => newView(dbr, draw) }], { width: 280 }) }, icon(v?.type === 'board' ? 'board' : v?.type === 'calendar' ? 'date' : 'table', 16), v?.name || 'View', icon('chevd', 14));
    const searchInput = h('input', { class: 'field dbsearch', type: 'search', value: q, placeholder: 'Search name, project no, address…', 'aria-label': 'Search this database',
      oninput: e => { searches.set(dbId, e.target.value); clearTimeout(box._t); box._t = setTimeout(() => { draw(); const s = box.querySelector('.dbsearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }, 150); },
      onkeydown: e => { if (e.key === 'Escape') { searches.delete(dbId); draw(); } } });
    const tools = h('div', { class: 'tools' },
      h('button', { class: 'iconbtn', 'aria-label': 'Search', 'aria-pressed': searchOn ? 'true' : 'false', onclick: () => { if (searchOn) searches.delete(dbId); else searches.set(dbId, ''); draw(); if (!searchOn) box.querySelector('.dbsearch')?.focus(); } }, icon('search', 18)),
      h('button', { class: 'iconbtn', 'aria-label': 'Filter and sort', onclick: () => filterSheet(dbr, v, draw) }, icon('filter', 18)),
      h('button', { class: 'iconbtn', 'aria-label': 'View settings', onclick: () => settingsSheet(dbr, v, draw) }, icon('sliders', 18)),
      h('div', { class: 'split' },
        h('button', { 'aria-label': 'New task', title: 'New task', onclick: () => { if (D.val(dbr, 'locked')) return toast('This database is locked.'); const r = DB.newRow(dbr); openTask(r.id); } }, icon('plus', 18)),
        h('button', { 'aria-label': 'New task from template', onclick: e => menu(e.currentTarget, [{ label: 'Blank task', icon: 'pages', run: () => openTask(DB.newRow(dbr).id) },
          ...DB.views(dbr).length ? [{ label: 'Site Survey task (due in 7 days)', icon: 'pin', run: () => openTask(DB.newRow(dbr, { Status: 'Site Survey', 'Date Assigned': toISODate(new Date(now())), 'Due Date': toISODate(dateAdd(new Date(now()), 7, 'days')) }).id) }] : []]) }, icon('chevd', 16))));
    const content = !v ? h('p', { class: 'muted' }, 'No views') : v.type === 'board' ? board(dbr, v, list, draw) : v.type === 'calendar' ? calendar(dbr, v, list, draw) : v.type === 'list' ? listView(dbr, v, list) : table(dbr, v, list, draw);
    box.replaceChildren(
      h('button', { class: 'dbname', onclick: e => menu(e.currentTarget, [{ label: 'Rename database', icon: 'text', run: async () => { const n = await promptBox('Database name', D.val(dbr, 'name')); if (n) { D.update(dbId, { name: n }); draw(); } } }, { label: 'Edit properties', icon: 'list', run: () => editProperties(dbr, draw) }]) }, D.val(dbr, 'name', 'Database'), icon('chevd', 14)),
      h('div', { class: 'dbbar' }, vbtn, tools, searchOn ? searchInput : null), content);
  };
  draw();
  return box;
}

// ---------- table ----------
function visibleProps(dbr, v) { const hid = new Set(v.hidden || []); return DB.props(dbr).filter(p => !hid.has(p.id)); }
const DEFAULT_W = { title: 220, text: 180, number: 110, select: 140, status: 140, multi: 200, date: 140, checkbox: 90, url: 200, files: 160, formula: 240, created: 140 };
const colW = (p, v) => (v.widths || {})[p.id] || (/address/i.test(p.name) ? 300 : DEFAULT_W[p.type] || 160);
function table(dbr, v, list, draw) {
  const ps = visibleProps(dbr, v);
  const cols = ps.map(p => colW(p, v) + 'px').join(' ');
  const head = h('div', { class: 'tr', role: 'row', style: { gridTemplateColumns: cols } }, ps.map((p, i) => {
    const th = h('div', { class: 'th' + (i === 0 ? ' first' : ''), role: 'columnheader', tabindex: '0', onclick: e => { if (!e.target.classList.contains('rz')) colMenu(dbr, v, p, th, draw); } }, icon(DB.TYPE_ICON[p.type] || 'text', 14), h('span', {}, p.name),
      h('span', { class: 'rz', 'aria-hidden': 'true', onpointerdown: e => resize(e, dbr, v, p) }));
    return th;
  }));
  const colors = v.colors || [];
  const ccount = new Map(); for (const c of D.all('cmt')) { const k = D.val(c, 'parent'); ccount.set(k, (ccount.get(k) || 0) + 1); }
  // rows go into blocks of 30; blocks off the screen are not drawn, which keeps scrolling smooth
  const chunks = rs => { const blocks = []; for (let i = 0; i < rs.length; i += 30) blocks.push(rs.slice(i, i + 30)); return later(blocks, b => h('div', { class: 'chunk' }, b.map(rowEl)), { first: 2, step: 2 }); };
  const rowEl = r => {
    const c = colors.find(rule => DB.matches(r, rule, dbr, now()));
    const bg = c ? DB.COLORS[c.color]?.[0] : null;
    const ht = (v.heights || {})[r.id];
    return h('div', { class: 'tr' + (ht ? ' fixed' : ''), role: 'row', 'data-row': r.id, style: { gridTemplateColumns: ps.map(q => colW(q, v) + 'px').join(' '), ...(ht ? { height: ht + 'px' } : {}), ...(bg ? { background: bg } : {}) } }, ps.map((p, i) => cell(r, p, dbr, i === 0, bg, ccount.get(r.id) || 0)),
      h('span', { class: 'rzr', 'aria-hidden': 'true', title: 'Drag to change row height. Double-tap to reset.', onpointerdown: e => resizeRow(e, dbr, v, r.id) }));
  };
  let body;
  if (v.group) {
    const gp = DB.props(dbr).find(p => p.id === v.group);
    const groups = new Map(); for (const r of list) { const k = gp ? (DB.display(r, gp, now()) || 'No ' + gp.name) : ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    body = [...groups].map(([k, rs]) => [h('div', { class: 'ghd' }, gp && gp.options?.find(o => o.name === k) ? chip(gp, k) : k, h('span', { class: 'muted', style: { fontWeight: 400, marginLeft: '8px' } }, rs.length)), chunks(rs)]);
  } else body = chunks(list);
  return h('div', {},
    h('div', { class: 'tablewrap' }, h('div', { class: 'grid', role: 'table', 'aria-label': D.val(dbr, 'name', 'Database') + ': ' + v.name }, head, body, colHandles(dbr, v, ps),
      D.val(dbr, 'locked') ? null : h('button', { class: 'addrow', onclick: () => { const r = DB.newRow(dbr); openTask(r.id); } }, '+ New'))),
    h('div', { class: 'gfoot' }, list.length + (list.length === 1 ? ' task' : ' tasks')));
}
function cell(r, p, dbr, first, bg, ncom = 0) {
  const td = h('div', { class: 'td' + (first ? ' first' : '') + (/ecx/i.test(p.name) ? ' mono' : ''), role: 'cell', tabindex: '0', style: bg ? { background: bg } : null });
  const v = DB.value(r, p, now());
  const fill = () => {
    td.replaceChildren();
    if (first) { td.append(icon('page', 18, 'pgi'), h('span', { class: 'nmtxt' }, DB.raw(r, p) || h('span', { class: 'muted' }, 'Untitled'), ncom ? h('span', { class: 'ccount', 'aria-label': ncom + (ncom === 1 ? ' comment' : ' comments') }, icon('comment', 15), ncom) : null), h('button', { class: 'open', onclick: e => { e.stopPropagation(); openTask(r.id); } }, 'Open')); return; }
    if (p.type === 'checkbox') { td.append(h('input', { type: 'checkbox', checked: v ? true : null, 'aria-label': p.name, style: { width: '16px', height: '16px', accentColor: 'var(--blue)' }, onclick: e => e.stopPropagation(), onchange: e => D.update(r.id, { ['p:' + p.id]: e.target.checked }) })); return; }
    if (p.type === 'select' || p.type === 'status') { if (v) td.append(chip(p, v)); return; }
    if (p.type === 'multi') { for (const x of v) td.append(chip(p, x)); return; }
    if (p.type === 'url' && v) { td.append(h('a', { href: browserUrl(v), target: '_blank', rel: 'noopener', style: { color: 'var(--ink)', textDecoration: 'underline', textDecorationColor: 'var(--rule)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, onclick: e => e.stopPropagation() }, v.replace(/^https?:\/\//, ''))); return; }
    const txt = DB.display(r, p, now());
    if (p.type === 'formula') { td.style.fontWeight = /[🔴🚨🟠✅❌🔵]/u.test(txt) ? 600 : 400; td.style.color = /OVERDUE|REJECTED/.test(txt) ? 'var(--red)' : /COMPLETED/.test(txt) ? '#448361' : /🟠/.test(txt) ? 'var(--orange)' : ''; }
    if (p.type === 'date') td.style.color = 'var(--ink2)';
    td.append(txt);
  };
  fill();
  const edit = () => {
    if (first || ['text', 'number', 'url'].includes(p.type)) return popEdit(td, r, p, fill);
    if (['checkbox', 'formula', 'created'].includes(p.type) || D.val(dbr, 'locked') && false) return;
    const ed = propEditor(r, p, dbr, { compact: true }); td.replaceChildren(ed);
    const f = ed.matches?.('input,button') ? ed : ed.querySelector('input,button'); f && f.focus(); if (f && f.tagName === 'INPUT' && /text|url|search|number/.test(f.type)) try { const n = f.value.length; f.setSelectionRange(n, n); } catch {} if (f && f.tagName === 'BUTTON') f.click();
    if (f && f.tagName === 'INPUT') f.addEventListener('blur', () => setTimeout(fill, 0), { once: true });
  };
  td.addEventListener('click', e => { if (e.target.closest('a,input,.open,.rz,.rzr,.colrz')) return; edit(); });
  td.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === td) { e.preventDefault(); edit(); } });
  return td;
}
// ---------- resizing: drag a vertical line for column width, a horizontal line for row height ----------
// Works with mouse, finger and pencil. Double-tap a line to put it back to the default size.
let lastTap = { key: '', t: 0 };
// only a tap (pressed and let go without moving) counts toward a double-tap
const doubleTap = key => lastTap.key === key && Date.now() - lastTap.t < 400;
const noteTap = (key, moved) => { lastTap = moved ? { key: '', t: 0 } : { key, t: Date.now() }; };
const HOLD_MS = 450; // finger: hold a line this long to start resizing
function drag(e, onMove, onEnd) {
  const el = e.currentTarget;
  if (e.pointerType === 'mouse') { // mouse: drag straight away
    e.preventDefault(); e.stopPropagation();
    el.classList.add('on'); try { el.setPointerCapture(e.pointerId); } catch {}
    const x0 = e.clientX, y0 = e.clientY; let moved = false;
    const move = ev => { if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) > 2) moved = true; onMove(ev.clientX - x0, ev.clientY - y0); };
    const up = () => { el.classList.remove('on'); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); onEnd(moved); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    return;
  }
  // finger or pencil: hold to turn dragging on, let go to turn it off; a swipe just scrolls the table
  const x0 = e.clientX, y0 = e.clientY; let active = false, moved = false, gone = false;
  const timer = setTimeout(() => { if (gone) return; active = true; el.classList.add('on'); try { navigator.vibrate && navigator.vibrate(10); } catch {} }, HOLD_MS);
  const pt = ev => ev.touches && ev.touches[0] ? ev.touches[0] : ev.changedTouches && ev.changedTouches[0] ? ev.changedTouches[0] : ev;
  const move = ev => {
    const t = pt(ev), dx = t.clientX - x0, dy = t.clientY - y0;
    if (!active) { if (Math.abs(dx) + Math.abs(dy) > 8) stop(null); return; } // it is a scroll
    if (ev.cancelable) ev.preventDefault();                                        // dragging: hold the page still
    moved = true; onMove(dx, dy);
  };
  const end = () => { const was = active; stop(was ? moved : 'tap'); };
  function stop(result) {
    if (gone) return; gone = true; clearTimeout(timer); el.classList.remove('on');
    document.removeEventListener('touchmove', move, { passive: false }); document.removeEventListener('touchend', end); document.removeEventListener('touchcancel', end);
    document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', end); document.removeEventListener('pointercancel', end);
    if (result === 'tap') onEnd(false); else if (result !== null) onEnd(result); else noteTap('', true);
  }
  document.addEventListener('touchmove', move, { passive: false }); document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
  if (!('ontouchstart' in window)) { document.addEventListener('pointermove', move); document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end); }
}
function applyCols(grid, dbr, v) {
  const ps = visibleProps(dbr, v); const cols = ps.map(q => colW(q, v) + 'px').join(' ');
  grid.querySelectorAll('.tr').forEach(tr => tr.style.gridTemplateColumns = cols);
  let x = 0; grid.querySelectorAll(':scope > .colrz').forEach((hd, i) => { x += colW(ps[i], v); hd.style.left = (x - 6) + 'px'; });
}
function colHandles(dbr, v, ps) {
  let x = 0;
  return ps.map(p => { x += colW(p, v); return h('span', { class: 'colrz', 'aria-hidden': 'true', title: 'Drag to change column width. Double-tap to reset.', style: { left: (x - 6) + 'px' }, onpointerdown: e => resize(e, dbr, v, p) }); });
}
export { popEdit };
function resize(e, dbr, v, p) {
  const grid = e.currentTarget.closest('.grid');
  if (doubleTap('c' + p.id)) { lastTap = { key: '', t: 0 }; const w = { ...(v.widths || {}) }; delete w[p.id]; v.widths = w; applyCols(grid, dbr, v); saveView(dbr, v); return; }
  const w0 = colW(p, v);
  drag(e, dx => { v.widths = { ...(v.widths || {}), [p.id]: Math.max(70, Math.min(900, Math.round(w0 + dx))) }; applyCols(grid, dbr, v); }, moved => { noteTap('c' + p.id, moved); if (moved) saveView(dbr, v); });
}
function resizeRow(e, dbr, v, rowId) {
  const tr = e.currentTarget.closest('.tr');
  const reset = () => { const hs = { ...(v.heights || {}) }; delete hs[rowId]; v.heights = hs; tr.style.height = ''; tr.classList.remove('fixed'); saveView(dbr, v); };
  if (doubleTap('r' + rowId)) { lastTap = { key: '', t: 0 }; return reset(); }
  const h0 = tr.getBoundingClientRect().height;
  drag(e, (dx, dy) => { const ht = Math.max(32, Math.min(800, Math.round(h0 + dy))); v.heights = { ...(v.heights || {}), [rowId]: ht }; tr.style.height = ht + 'px'; tr.classList.add('fixed'); }, moved => { noteTap('r' + rowId, moved); if (moved) saveView(dbr, v); });
}
function colMenu(dbr, v, p, anchor, draw) {
  menu(anchor, [
    { label: 'Sort ascending', icon: 'sort', run: () => { saveView(dbr, { ...v, sort: [{ prop: p.id, dir: 'asc' }] }); draw(); } },
    { label: 'Sort descending', icon: 'sort', run: () => { saveView(dbr, { ...v, sort: [{ prop: p.id, dir: 'desc' }] }); draw(); } },
    { label: 'Filter by this', icon: 'filter', run: () => { saveView(dbr, { ...v, filter: [...(v.filter || []), { prop: p.id, op: DB.opsFor(p)[0], value: '' }] }); filterSheet(dbr, DB.views(dbr).find(x => x.id === v.id), draw); } },
    { label: 'Hide in this view', icon: 'eye', run: () => { saveView(dbr, { ...v, hidden: [...(v.hidden || []), p.id] }); draw(); } },
    { label: 'Edit property', icon: 'list', run: () => editProp(dbr, p, draw) }]);
}

// ---------- board / calendar / list ----------
function board(dbr, v, list, draw) {
  const gp = DB.props(dbr).find(p => p.id === v.groupBy) || DB.propByName(dbr, 'Status') || DB.props(dbr).find(p => p.type === 'select');
  if (!gp) return h('p', { class: 'muted' }, 'Add a Select or Status property to use the board.');
  const tp = DB.titleProp(dbr);
  const cols = [...(gp.options || []).map(o => o.name), ''];
  return h('div', { class: 'board' }, cols.map(name => {
    const items = list.filter(r => (DB.raw(r, gp) || '') === name);
    const col = h('section', { class: 'col', 'aria-label': name || 'No ' + gp.name, ondragover: e => e.preventDefault(), ondrop: e => { const id = e.dataTransfer.getData('text/folio-row'); if (id) { D.update(id, { ['p:' + gp.id]: name || null }); draw(); } } },
      h('h3', {}, name ? chip(gp, name) : 'No ' + gp.name, h('span', { class: 'muted' }, items.length)),
      items.map(r => { const c = h('button', { class: 'card', draggable: 'true', onclick: () => openTask(r.id) }, DB.raw(r, tp) || 'Untitled'); c.addEventListener('dragstart', e => e.dataTransfer.setData('text/folio-row', r.id)); return c; }));
    return col;
  }));
}
function calendar(dbr, v, list, draw) {
  const dp = DB.props(dbr).find(p => p.id === v.dateProp) || DB.propByName(dbr, 'Due Date') || DB.props(dbr).find(p => p.type === 'date');
  if (!dp) return h('p', { class: 'muted' }, 'Add a Date property to use the calendar.');
  const off = months.get(dbr.id) || 0; const base = new Date(now()); const first = new Date(base.getFullYear(), base.getMonth() + off, 1);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const tp = DB.titleProp(dbr); const today = toISODate(new Date(now()));
  const days = [...Array(42)].map((_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const nav = h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px' } },
    h('button', { class: 'iconbtn', 'aria-label': 'Previous month', onclick: () => { months.set(dbr.id, off - 1); draw(); } }, icon('back', 18)),
    h('strong', {}, formatDate(first, 'MMMM YYYY')),
    h('button', { class: 'iconbtn', 'aria-label': 'Next month', onclick: () => { months.set(dbr.id, off + 1); draw(); } }, icon('chevr', 18)),
    h('button', { class: 'btn', style: { height: '30px', marginLeft: 'auto' }, onclick: () => { months.set(dbr.id, 0); draw(); } }, 'Today'));
  return h('div', {}, nav, h('div', { class: 'cal', role: 'grid' }, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => h('div', { class: 'cd', style: { minHeight: 'auto', fontWeight: 600, color: 'var(--ink2)' } }, d)),
    days.map(d => { const iso = toISODate(d); const evs = list.filter(r => toISODate(DB.value(r, dp)) === iso);
      return h('div', { class: 'cd' + (d.getMonth() !== first.getMonth() ? ' out' : '') + (iso === today ? ' now' : ''), role: 'gridcell' }, h('span', { class: 'dn' }, d.getDate()), evs.map(r => h('button', { class: 'ev', onclick: () => openTask(r.id) }, DB.raw(r, tp) || 'Untitled'))); })));
}
function listView(dbr, v, list) { const tp = DB.titleProp(dbr); return h('div', { class: 'group' }, list.map(r => h('button', { class: 'grow', onclick: () => openTask(r.id) }, icon('pages', 16), h('span', { class: 'gl' }, DB.raw(r, tp) || 'Untitled'), icon('chevr', 14, 'chev')))); }

// ---------- views ----------
async function newView(dbr, draw) {
  const s = sheet('New view', group(...[['table', 'Table'], ['board', 'Board'], ['calendar', 'Calendar'], ['list', 'List']].map(([t, l]) => row({ icon: t === 'board' ? 'board' : t === 'calendar' ? 'date' : t === 'list' ? 'list' : 'table', label: l, chev: false,
    onclick: async () => { s.close(); const name = await promptBox('View name', l); if (!name) return; const v = { id: 'v' + Date.now().toString(36), name, type: t, filter: [], sort: [], hidden: [] }; DB.saveViews(dbr, [...DB.views(dbr), v]); cur.set(dbr.id, v.id); draw(); } }))));
}

// ---------- filter & sort sheet ----------
export function filterSheet(dbr, v, draw) {
  const body = h('div');
  const s = sheet(`${(v.filter || []).length} filter${(v.filter || []).length === 1 ? '' : 's'}`, body, { onDone: draw });
  const paint = () => {
    v = DB.views(DB.db(dbr.id)).find(x => x.id === v.id); const ps = DB.props(DB.db(dbr.id));
    s.panel.querySelector('h2').textContent = `${(v.filter || []).length} filter${(v.filter || []).length === 1 ? '' : 's'}`;
    const sortTxt = (v.sort || []).map(x => ps.find(p => p.id === x.prop)?.name).filter(Boolean).join(', ');
    const q = h('input', { type: 'search', placeholder: 'Search for a property…', 'aria-label': 'Search for a property', style: { border: 0, background: 'transparent', width: '100%', fontSize: '16px', outline: 'none' }, oninput: e => { for (const b of list.children) b.hidden = !b.dataset.n.includes(e.target.value.toLowerCase()); } });
    const list = h('div', {}, ps.map(p => { const rule = (v.filter || []).find(f => f.prop === p.id);
      const b = row({ icon: DB.TYPE_ICON[p.type], label: p.name, value: rule ? ruleText(rule, p) : '', active: !!rule, onclick: () => ruleSheet(p) }); b.dataset.n = p.name.toLowerCase(); return b; }));
    body.replaceChildren(
      group(row({ icon: 'sort', label: 'Sort', value: sortTxt || 'None', active: true, onclick: sortSheet })),
      h('div', { class: 'group' }, h('label', { class: 'grow' }, icon('filter', 20), q), list),
      group(row({ icon: 'settings', label: 'Advanced filter', value: (v.filter || []).length > 1 ? (v.filterMode === 'or' ? 'Match any rule' : 'Match all rules') : '', onclick: () => { if ((v.filter || []).length < 2) { toast('Add two or more filters, then choose to match all or any of them'); return; } saveView(dbr, { ...v, filterMode: v.filterMode === 'or' ? 'and' : 'or' }); paint(); } })));
  };
  const ruleText = (r, p) => r.op === 'is checked' ? 'Checked' : r.op === 'is unchecked' ? 'Unchecked' : r.op === 'is empty' ? 'Empty' : r.op === 'is not empty' ? 'Not empty' : `${r.op} ${p.type === 'date' && r.value ? formatDate(r.value, 'D MMM YYYY') : r.value}`;
  function ruleSheet(p) {
    const rule = (v.filter || []).find(f => f.prop === p.id) || { prop: p.id, op: DB.opsFor(p)[0], value: '' };
    const op = h('select', { class: 'field', 'aria-label': 'Condition' }, DB.opsFor(p).map(o => h('option', { value: o, selected: o === rule.op ? true : null }, o)));
    const val = (p.type === 'select' || p.type === 'status' || p.type === 'multi') ? h('select', { class: 'field', 'aria-label': 'Value' }, (p.options || []).map(o => h('option', { selected: o.name === rule.value ? true : null }, o.name)))
      : h('input', { class: 'field', type: p.type === 'date' ? 'date' : p.type === 'number' ? 'number' : 'text', value: rule.value || '', 'aria-label': 'Value' });
    const sync = () => { val.style.display = /empty|checked/.test(op.value) ? 'none' : ''; }; op.onchange = sync; sync();
    const s2 = sheet(p.name, h('div', {}, op, h('div', { style: { height: '10px' } }), val,
      h('button', { class: 'btn block primary', onclick: () => { const f = (v.filter || []).filter(x => x.prop !== p.id); f.push({ prop: p.id, op: op.value, value: val.value }); saveView(dbr, { ...v, filter: f }); s2.close(); } }, 'Apply filter'),
      (v.filter || []).some(x => x.prop === p.id) ? h('button', { class: 'btn block danger', onclick: () => { saveView(dbr, { ...v, filter: (v.filter || []).filter(x => x.prop !== p.id) }); s2.close(); } }, 'Remove filter') : null), { done: 'Cancel', onDone: paint });
  }
  function sortSheet() {
    const ps = DB.props(DB.db(dbr.id));
    const s2 = sheet('Sort', h('div', {}, group(...ps.map(p => { const cur = (v.sort || []).find(x => x.prop === p.id);
      return row({ icon: DB.TYPE_ICON[p.type], label: p.name, value: cur ? (cur.dir === 'desc' ? 'Descending' : 'Ascending') : '', active: !!cur, chev: false,
        onclick: () => { const dir = !cur ? 'asc' : cur.dir === 'asc' ? 'desc' : null; saveView(dbr, { ...v, sort: dir ? [{ prop: p.id, dir }] : [] }); v = DB.views(DB.db(dbr.id)).find(x => x.id === v.id); s2.close(); sortSheet(); } }); }))), { onDone: paint });
  }
  paint();
}

// ---------- view settings sheet ----------
export function settingsSheet(dbr, v, draw) {
  const body = h('div'); const s = sheet('Settings', body, { onDone: draw });
  const paint = () => {
    dbr = DB.db(dbr.id); v = DB.views(dbr).find(x => x.id === v.id); const ps = DB.props(dbr);
    const name = h('input', { class: 'field', value: v.name, 'aria-label': 'View name', style: { border: 0 }, onchange: e => { saveView(dbr, { ...v, name: e.target.value }); } });
    body.replaceChildren(
      h('div', { class: 'group' }, h('label', { class: 'grow' }, icon(v.type === 'board' ? 'board' : 'table', 20), name)),
      group(
        row({ icon: 'table', label: 'Layout', value: { table: 'Table', board: 'Board', calendar: 'Calendar', list: 'List' }[v.type || 'table'], onclick: e => menu(e.currentTarget, ['table', 'board', 'calendar', 'list'].map(t => ({ label: t[0].toUpperCase() + t.slice(1), checked: v.type === t, run: () => { saveView(dbr, { ...v, type: t }); paint(); } }))) }),
        row({ icon: 'eye', label: 'Property visibility', value: String(ps.length - (v.hidden || []).length), onclick: visibility }),
        row({ icon: 'filter', label: 'Filter', value: (v.filter || []).map(f => ps.find(p => p.id === f.prop)?.name).filter(Boolean).join(', ') || 'None', onclick: () => { s.close(); filterSheet(dbr, v, draw); } }),
        row({ icon: 'sort', label: 'Sort', value: (v.sort || []).map(f => ps.find(p => p.id === f.prop)?.name).filter(Boolean).join(', ') || 'None', onclick: () => { s.close(); filterSheet(dbr, v, draw); } }),
        row({ icon: 'group', label: 'Group', value: ps.find(p => p.id === v.group)?.name || 'None', onclick: e => menu(e.currentTarget, [{ label: 'None', checked: !v.group, run: () => { saveView(dbr, { ...v, group: null }); paint(); } }, ...ps.filter(p => ['select', 'status', 'checkbox', 'date', 'multi'].includes(p.type)).map(p => ({ label: p.name, checked: v.group === p.id, run: () => { saveView(dbr, { ...v, group: p.id }); paint(); } }))]) }),
        row({ icon: 'paint', label: 'Conditional colour', value: (v.colors || []).length ? (v.colors.length + ' rule' + (v.colors.length > 1 ? 's' : '')) : '', onclick: colours }),
        row({ icon: 'link', label: 'Copy link to view', chev: false, onclick: () => navigator.clipboard.writeText(location.href.split('#')[0] + `#/db/${dbr.id}/${v.id}`).then(() => toast('Link copied')) })),
      h('p', { class: 'ghead' }, 'Data source settings'),
      group(
        row({ icon: 'source', label: 'Source', value: D.val(dbr, 'name', 'Database'), chev: false }),
        row({ icon: 'list', label: 'Edit properties', onclick: () => editProperties(dbr, paint) }),
        row({ icon: 'cal', label: 'Linked events', value: 'iCloud: Folio', onclick: linked }),
        row({ icon: 'more', label: 'More settings', onclick: more })),
      group(row({ icon: 'expand', label: 'Open as full page', chev: false, onclick: () => { s.close(); go(`#/db/${dbr.id}/${v.id}`); } })),
      group(
        row({ icon: 'trash', label: 'Delete this view', chev: false, danger: true, onclick: async () => { if (DB.views(dbr).length < 2) return toast('A database needs at least one view.'); if (await confirmBox(`Delete the view “${v.name}”? Your tasks stay.`)) { DB.saveViews(dbr, DB.views(dbr).filter(x => x.id !== v.id)); s.close(); } } }),
        row({ icon: 'lock', label: D.val(dbr, 'locked') ? 'Unlock database' : 'Lock database', chev: false, onclick: () => { D.update(dbr.id, { locked: !D.val(dbr, 'locked') }); toast(D.val(DB.db(dbr.id), 'locked') ? 'Locked: properties and views can’t be changed' : 'Unlocked'); paint(); } })));
  };
  function visibility() {
    const s2 = sheet('Property visibility', h('div', {}, group(...DB.props(dbr).map(p => { const shown = !(v.hidden || []).includes(p.id);
      return h('label', { class: 'grow' }, icon(DB.TYPE_ICON[p.type], 20), h('span', { class: 'gl' }, p.name), h('input', { type: 'checkbox', checked: shown ? true : null, disabled: p.type === 'title' ? true : null, onchange: e => { const hid = new Set(v.hidden || []); e.target.checked ? hid.delete(p.id) : hid.add(p.id); v = { ...v, hidden: [...hid] }; saveView(dbr, v); } })); }))), { onDone: paint });
  }
  function colours() {
    const ps = DB.props(dbr); const rules = [...(v.colors || [])];
    const list = h('div');
    const redraw = () => list.replaceChildren(group(...rules.map((r, i) => row({ icon: 'paint', label: `${ps.find(p => p.id === r.prop)?.name || '?'} ${r.op} ${r.value || ''}`, value: r.color, chev: false, onclick: () => { rules.splice(i, 1); redraw(); } })),
      row({ icon: 'plus', label: 'Add rule', chev: false, onclick: async () => {
        const p = ps.find(x => x.name === 'Alert') || ps[0]; const val = await promptBox(`Colour rows where ${p.name} contains…`, 'OVERDUE'); if (!val) return;
        const color = await new Promise(res => menu(list, Object.keys(DB.COLORS).filter(c => c !== 'default').map(c => ({ label: c, run: () => res(c) }))));
        rules.push({ prop: p.id, op: 'contains', value: val, color }); redraw(); } })));
    redraw();
    sheet('Conditional colour', h('div', {}, h('p', { class: 'muted' }, 'Tap a rule to remove it.'), list), { onDone: () => { saveView(dbr, { ...v, colors: rules }); paint(); } });
  }
  function linked() {
    sheet('Linked events', h('div', {}, h('p', { class: 'muted' }, 'Your iPhone adds these dates to the iCloud calendar “Folio” (and from there to Outlook). Done and Rejected tasks are removed.'),
      group(row({ icon: 'date', label: 'Due Date', value: 'On', chev: false }), row({ icon: 'date', label: 'ECPAR Rejected + 1 day', value: 'On', chev: false })),
      h('p', { class: 'muted' }, 'The Folio script in Scriptable does the syncing. Set it up in Settings › Widgets & calendar.')));
  }
  function more() {
    sheet('More settings', h('div', {}, group(
      row({ icon: 'text', label: 'Rename database', onclick: async () => { const n = await promptBox('Database name', D.val(dbr, 'name')); if (n) D.update(dbr.id, { name: n }); } }),
      row({ icon: 'table', label: 'This is my KPI tracker', value: D.val(dbr, 'role') === 'kpi' ? 'Yes' : 'No', chev: false, onclick: () => { for (const d of DB.dbs()) if (D.val(d, 'role') === 'kpi') D.update(d.id, { role: null }); D.update(dbr.id, { role: 'kpi' }); toast('Today, To Site Survey and Rejected ECPAR now use this database'); } }))));
  }
  paint();
}

// ---------- properties ----------
export function editProperties(dbr, after) {
  const body = h('div'); const s = sheet('Edit properties', body, { onDone: after });
  const paint = () => { dbr = DB.db(dbr.id); body.replaceChildren(group(...DB.props(dbr).map(p => row({ icon: DB.TYPE_ICON[p.type], label: p.name, value: DB.TYPES[p.type], onclick: () => editProp(dbr, p, paint) })),
    row({ icon: 'plus', label: 'New property', chev: false, onclick: async () => {
      if (D.val(dbr, 'locked')) return toast('This database is locked.');
      const name = await promptBox('Property name'); if (!name) return;
      const type = await new Promise(res => menu(body, Object.entries(DB.TYPES).filter(([t]) => t !== 'title').map(([t, l]) => ({ label: l, icon: DB.TYPE_ICON[t], run: () => res(t) }))));
      DB.saveProps(dbr, [...DB.props(dbr), { id: 'p' + Date.now().toString(36), name, type, options: [], ...(type === 'formula' ? { formula: '""' } : {}) }]); paint(); } }))); };
  paint();
}
export function editProp(dbr, p, after) {
  if (D.val(dbr, 'locked')) return toast('This database is locked.');
  const save = patch => { DB.saveProps(dbr, DB.props(DB.db(dbr.id)).map(x => x.id === p.id ? { ...x, ...patch } : x)); p = { ...p, ...patch }; };
  const name = h('input', { class: 'field', value: p.name, 'aria-label': 'Property name', onchange: e => save({ name: e.target.value }) });
  const parts = [name];
  if (p.type === 'formula') {
    const ta = h('textarea', { class: 'field', 'aria-label': 'Formula', spellcheck: 'false' }, p.formula || '');
    const msg = h('p', { class: 'muted' });
    ta.oninput = () => { const r = evaluate(ta.value, () => null); msg.textContent = r.error ? '⚠️ ' + r.error : 'Formula looks good.'; };
    ta.onchange = () => { if (!evaluate(ta.value, () => null).error) save({ formula: ta.value }); };
    parts.push(h('div', { style: { height: '10px' } }), ta, msg);
  }
  if (['select', 'status', 'multi'].includes(p.type)) {
    const ol = h('div');
    const draw = () => ol.replaceChildren(group(...(p.options || []).map((o, i) => h('div', { class: 'grow' }, chip(p, o.name),
      h('button', { class: 'iconbtn', 'aria-label': 'Colour of ' + o.name, onclick: e => menu(e.currentTarget, DB.COLOR_NAMES.map(c => ({ label: c, checked: c === o.color, run: () => { save({ options: p.options.map((x, j) => j === i ? { ...x, color: c } : x) }); draw(); } }))) }, icon('paint', 16)),
      h('button', { class: 'iconbtn', 'aria-label': 'Delete ' + o.name, onclick: () => { save({ options: p.options.filter((_, j) => j !== i) }); draw(); } }, icon('trash', 16))))));
    draw(); parts.push(h('p', { class: 'ghead' }, 'Options'), ol);
  }
  if (p.type !== 'title') parts.push(h('button', { class: 'btn block danger', onclick: async () => { if (await confirmBox(`Delete the property “${p.name}”? Its values in every task are removed.`)) { DB.saveProps(dbr, DB.props(DB.db(dbr.id)).filter(x => x.id !== p.id)); s.close(); } } }, 'Delete property'));
  const s = sheet(DB.TYPES[p.type], h('div', {}, parts), { onDone: after });
}
