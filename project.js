// Folio v2 — Projects (the main working database) and Project Details.
// Customers and tasks have no pages of their own: they are linked records managed from here.
import * as D from './data.js';
import * as DB from './db.js';
import * as E from './entities.js';
import { h, icon, menu, sheet, toast, confirmBox, promptBox, textbox } from './ui.js';
import { formatDate, toISODate, parseDate, dateAdd, startOfDay } from './dates.js';
import { state, now as NOW, render, go, moreMenu, elabel, longPress, rowActions, browserUrl, exportList } from './app.js';
import { popEdit } from './popedit.js';
import { propEditor } from './page.js';
import { ccTab, ccEligible } from './cc.js';
import * as C from './cols.js';

const { g } = E;
const P = n => { const d = DB.kpiDb(); return d && DB.propByName(d, n); };
const dmy = v => { const d = parseDate(v); return d ? formatDate(d, 'D/M/YYYY') : ''; };
const today = () => toISODate(new Date(NOW()));

// ---------- small pieces ----------
const TONES = { gray: ['#EFEEEC', '#6F6E69'], blue: ['#E3EEF7', '#2F6FA3'], green: ['#E4F1E6', '#3B7A4B'], red: ['#FBE6E3', '#C2443A'], orange: ['#FBEBDD', '#B4610F'], yellow: ['#FAF1D7', '#9A7414'], purple: ['#EEE6F6', '#7650B0'] };
const STATE_TONE = { 'Not Started': 'gray', Pending: 'gray', 'In Progress': 'blue', Completed: 'green', 'On Hold': 'orange', High: 'red', Medium: 'orange', Low: 'blue',
  Draft: 'gray', Submitted: 'blue', 'In Revision': 'purple', Rejected: 'red', Resubmitted: 'purple', Approved: 'green', 'Pending Revision': 'red', 'Ready to Resubmit': 'green', 'Pending Action': 'blue', 'In Review': 'yellow', Closed: 'gray',
  'To Schedule': 'blue', Scheduled: 'green', Overdue: 'red', 'Not categorised': 'gray' };
export function badge(text, tone = STATE_TONE[text] || 'gray', dot = true) {
  const [bg, fg] = TONES[tone] || TONES.gray;
  return h('span', { class: 'hp' + (dot ? ' dot' : ''), style: { background: bg, color: fg } }, dot ? h('i', { style: { background: fg } }) : null, text);
}
const shade = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 'inherit'; const v = parseInt(m[1], 16), f = x => Math.round(x * 0.62); return `rgb(${f(v >> 16 & 255)},${f(v >> 8 & 255)},${f(v & 255)})`; };
export function optPill(propName, name, dot = false) {
  const p = P(propName), c = p ? DB.optColor(p, name) : ['#E3E2E0', '#9B9A97'];
  return h('span', { class: 'hp' + (dot ? ' dot' : ''), style: { background: c[0], color: shade(c[1]) } }, dot ? h('i', { style: { background: c[1] } }) : null, name);
}
const SHORT = { 'Turnkey Stage 1': 'Turnkey S1', 'Turnkey Stage 2': 'Turnkey S2', 'Substation Site Enquiry': 'Substation', 'Upgrading of Supply': 'Upgrading', 'Temporary Supply': 'Temporary' };
const catPills = (cats, short = true) => cats.length ? cats.map(c => optPill('Project Category', short ? (SHORT[c] || c) : c)).map((el, i) => (el.title = cats[i], el)) : h('span', { class: 'muted' }, '—');
const daysBadge = days => days == null ? h('span', { class: 'muted' }, '—')
  : h('span', { class: 'dl' + (days < 0 ? ' late' : days <= 2 ? ' soon' : days <= 4 ? ' near' : '') }, days < 0 ? String(days) : String(days));
const pick = (anchor, options, cur, set, { clear = false } = {}) => menu(anchor, [...options.map(o => ({ label: o, checked: o === cur, run: () => set(o) })), ...(clear && cur ? ['-', { label: 'Clear', icon: 'close', run: () => set(null) }] : [])]);

/** one editable value of a linked record (customer, task, ECPAR, ECX, work): tap to change it */
function field(rec, f) {
  const v = g(D.getRec(rec.id), f.key);
  const set = val => { if (f.onSet) f.onSet(val); else D.update(rec.id, { ['p:' + f.key]: val }); render(); };
  const empty = v == null || v === '';
  const shown = empty ? (f.ph || 'Empty') : f.type === 'date' ? dmy(v) : f.type === 'money' ? 'RM ' + Number(v).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : f.type === 'select' ? badge(v) : String(v);
  const btn = h('button', { class: 'val fv' + (empty ? ' empty' : '') + (f.mono ? ' mono' : ''), type: 'button', 'aria-label': f.label + ': ' + (empty ? 'Empty' : (f.type === 'date' ? dmy(v) : v)) });
  btn.append(typeof shown === 'string' ? h('span', {}, shown) : shown);
  btn.addEventListener('click', e => {
    e.stopPropagation();
    if (f.type === 'select') return pick(btn, f.options, v, set, { clear: true });
    if (f.type === 'date') return dateSheet(f.label, v, set);
    popEdit(btn, D.getRec(rec.id), { id: f.key, name: f.label, type: f.type === 'money' ? 'number' : f.type === 'url' ? 'url' : 'text' }, () => { if (f.onSet) f.onSet(g(D.getRec(rec.id), f.key)); render(); });
  });
  if (f.type === 'url' && v) return h('span', { class: 'fvwrap' }, btn, h('a', { class: 'iconbtn sm', href: browserUrl(v), target: '_blank', rel: 'noopener', 'aria-label': 'Open ' + f.label }, icon('globe', 16)));
  if (f.tel && v) return h('span', { class: 'fvwrap' }, btn, h('a', { class: 'iconbtn sm', href: (f.tel === 'mail' ? 'mailto:' : 'tel:') + String(v).replace(/\s/g, ''), 'aria-label': (f.tel === 'mail' ? 'Email ' : 'Call ') + v }, icon(f.tel === 'mail' ? 'mail' : 'phone', 16)));
  return btn;
}
/** an editable field of a linked record (task, ECPAR, ECX), used by the Focus tables */
export const linkedField = (rec, f) => field(rec, f);
function dateSheet(title, v, set) {
  const inp = h('input', { type: 'date', class: 'field', value: toISODate(v) || '', 'aria-label': title });
  let cleared = false;
  const s = sheet(title, h('div', {}, inp, h('button', { class: 'btn block', onclick: () => { inp.value = today(); } }, 'Today'),
    h('button', { class: 'btn block danger', onclick: () => { cleared = true; inp.value = ''; s.close(); } }, 'Clear')), { onDone: () => set(cleared ? null : inp.value || (v ?? null)) });
}
const kv = (ic, label, value) => h('div', { class: 'kv' }, h('span', { class: 'kl' }, icon(ic, 16), label), h('div', { class: 'kvv' }, value));
const propVal = (row, name) => { const p = P(name); return h('div', { class: 'props pv' }, p ? propEditor(row, p, DB.kpiDb(), { dfmt: 'D/M/YYYY' }) : h('span', { class: 'muted' }, '—')); };

/** Liquid Glass modal (only shown after a button is pressed): date + remarks, then Cancel / confirm */
export function glassModal({ title, dateLabel = 'Date', textLabel = 'Remarks', ok = 'Confirm', danger = false, needText = false }) {
  return new Promise(res => {
    const date = h('input', { type: 'date', class: 'field', value: today(), 'aria-label': dateLabel });
    const txt = textbox({ multiline: true, cls: 'field gtext', label: textLabel, placeholder: textLabel });
    const back = h('div', { class: 'gmodal-back', onclick: e => { if (e.target === back) done(null); } });
    const done = v => { back.classList.remove('open'); setTimeout(() => back.remove(), 180); document.removeEventListener('keydown', key); res(v); };
    const key = e => { if (e.key === 'Escape') done(null); };
    const okBtn = h('button', { class: 'gbtn ' + (danger ? 'danger' : 'primary'), onclick: () => {
      if (!date.value) { date.focus(); return; } if (needText && !txt.value.trim()) { txt.focus(); toast('Please write the reason.'); return; }
      done({ date: date.value, text: txt.value.trim() }); } }, ok);
    back.append(h('section', { class: 'gmodal glass', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('h2', {}, title),
      h('label', { class: 'glabel' }, dateLabel), date,
      h('label', { class: 'glabel' }, textLabel), txt,
      h('div', { class: 'gacts' }, h('button', { class: 'gbtn', onclick: () => done(null) }, 'Cancel'), okBtn)));
    document.body.append(back); document.addEventListener('keydown', key);
    requestAnimationFrame(() => back.classList.add('open'));
  });
}

/** Liquid Glass form: a few fields (date, text, long text, choice); Cancel / confirm. Shown only after a button is pressed. */
export function formModal({ title, fields, ok = 'Save', danger = false }) {
  return new Promise(res => {
    const els = {};
    const back = h('div', { class: 'gmodal-back', onclick: e => { if (e.target === back) done(null); } });
    const done = v => { back.classList.remove('open'); setTimeout(() => back.remove(), 180); document.removeEventListener('keydown', key); res(v); };
    const key = e => { if (e.key === 'Escape') done(null); };
    const body = fields.map(f => {
      let el;
      if (f.type === 'date') el = h('input', { type: 'date', class: 'field', value: f.value ?? today(), 'aria-label': f.label });
      else if (f.type === 'select') el = h('select', { class: 'field', 'aria-label': f.label }, h('option', { value: '' }, f.placeholder || 'Choose…'), f.options.map(o => h('option', { value: o, selected: o === f.value ? true : null }, o)));
      else { el = textbox({ multiline: f.type === 'long', cls: 'field' + (f.type === 'long' ? ' gtext' : ''), label: f.label, placeholder: f.placeholder || f.label }); el.value = f.value || ''; }
      els[f.key] = el; return [h('label', { class: 'glabel' }, f.label + (f.required ? '' : f.type === 'date' ? '' : ' (optional)')), el];
    });
    const okBtn = h('button', { class: 'gbtn ' + (danger ? 'danger' : 'primary'), onclick: () => {
      const out = {}; for (const f of fields) { const v = String(els[f.key].value || '').trim(); if (f.required && !v) { els[f.key].focus(); toast('Please fill in ' + f.label.toLowerCase() + '.'); return; } out[f.key] = v; }
      done(out); } }, ok);
    back.append(h('section', { class: 'gmodal glass', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('h2', {}, title), ...body.flat(),
      h('div', { class: 'gacts' }, h('button', { class: 'gbtn', onclick: () => done(null) }, 'Cancel'), okBtn)));
    document.body.append(back); document.addEventListener('keydown', key);
    requestAnimationFrame(() => back.classList.add('open'));
  });
}
// ---------- ECPAR / ECX workflow steps (used by Project Details and the Focus pages) ----------
const rejectFields = (reasons, rec) => [
  { key: 'date', type: 'date', label: 'Rejection date', value: today(), required: true },
  { key: 'cat', type: 'select', label: 'Reason category', options: reasons, value: rec ? g(rec, 'rcat') : '', placeholder: 'Choose a category' },
  { key: 'reason', type: 'long', label: 'Rejection reason / remarks', required: true },
  { key: 'correction', type: 'long', label: 'Required correction' }];
export async function rejectEcparFlow(row) {
  const r = await formModal({ title: 'Reject ECPAR', fields: rejectFields(E.ECPAR_REASONS), ok: 'Confirm Reject', danger: true }); if (!r) return false;
  E.rejectEcpar(row, r.date, r.reason, { cat: r.cat, correction: r.correction }); toast('ECPAR rejected. It is now in Rejected ECPAR.'); return true;
}
export async function resubmitEcparFlow(row) {
  const r = await formModal({ title: 'Resubmit revised ECPAR', fields: [{ key: 'date', type: 'date', label: 'Resubmission date', required: true }, { key: 'note', type: 'long', label: 'What changed' }], ok: 'Resubmit' }); if (!r) return false;
  E.resubmitEcpar(row, r.date, r.note); toast('ECPAR resubmitted. Its rejection history is kept.'); return true;
}
export async function approveEcparFlow(row) {
  const r = await formModal({ title: 'Mark ECPAR approved', fields: [{ key: 'date', type: 'date', label: 'Approval date', required: true }], ok: 'Mark Approved' }); if (!r) return false;
  E.approveEcpar(row, r.date); return true;
}
export async function rejectEcxFlow(row, x) {
  const r = await formModal({ title: 'Reject ' + (g(x, 'number') || 'ECX application'), fields: rejectFields(E.ECX_REASONS), ok: 'Confirm Reject', danger: true }); if (!r) return false;
  E.rejectEcx(row, x, r.date, r.reason, { cat: r.cat, correction: r.correction }); toast('ECX rejected. It is now in Rejected ECX.'); return true;
}
export async function resubmitEcxFlow(row, x) {
  const r = await formModal({ title: 'Resubmit ' + (g(x, 'number') || 'ECX application'), fields: [{ key: 'date', type: 'date', label: 'Resubmission date', required: true }, { key: 'note', type: 'long', label: 'What changed' }], ok: 'Resubmit' }); if (!r) return false;
  E.resubmitEcx(row, x, r.date, r.note); toast('ECX resubmitted. Its rejection history is kept.'); return true;
}
export async function approveEcxFlow(row, x) {
  const r = await formModal({ title: 'Mark ECX approved', fields: [{ key: 'date', type: 'date', label: 'Approval date', required: true }], ok: 'Mark Approved' }); if (!r) return false;
  E.approveEcx(row, x, r.date); return true;
}
/** edit the details of the current rejection (category, reason, correction, remarks) without making a new one */
export async function editRejectionFlow(rec, reasons) {
  const r = await formModal({ title: 'Rejection details', fields: [
    { key: 'cat', type: 'select', label: 'Reason category', options: reasons, value: g(rec, 'rcat') || '' },
    { key: 'reason', type: 'long', label: 'Rejection reason', value: g(rec, 'reason', ''), required: true },
    { key: 'correction', type: 'long', label: 'Required correction', value: g(rec, 'correction', '') },
    { key: 'remarks', type: 'long', label: 'Remarks', value: g(rec, 'remarks', '') }], ok: 'Save' }); if (!r) return false;
  D.update(rec.id, { 'p:rcat': r.cat || null, 'p:reason': r.reason, 'p:correction': r.correction, 'p:remarks': r.remarks }); return true;
}

// =====================================================================================
// Projects page
// =====================================================================================
export function setProjectFilter({ cat = '' } = {}) { pcat = cat; ptab = 'all'; pq = ''; pstat = ''; pdue = ''; pfil = []; }
let pq = '', ptab = 'all', pcat = '', pstat = '', pdue = '', psort = 'due', pshow = 50, pcol = null, pfil = [];
const sel = new Set();
const PTABS = [['all', 'All Projects'], ['progress', 'In Progress'], ['completed', 'Completed'], ['overdue', 'Overdue'], ['archived', 'Archived']];
const bucket = t => t.archived ? 'archived' : t.status === 'Done' ? 'completed' : 'progress';
function searchText(t) {
  return [t.title, t.ecx, P('Project Ref') ? DB.value(t.row, P('Project Ref')) : '', ...E.ecxOf(t.id).map(x => [g(x, 'number'), g(x, 'appid')].join(' '))].join(' ').toLowerCase();
}
function projectList(n) {
  const dbr = DB.kpiDb(); if (!dbr) return [];
  return DB.rows(dbr.id).map(r => { const t = DB.kpiInfo(r, dbr, n); t.dueDate = DB.value(r, P('Due Date')); t.dueDays = t.dueDate ? Math.round((startOfDay(t.dueDate) - startOfDay(new Date(n))) / 864e5) : null; return t; });
}
export function projectsScreen() {
  E.ensureAll();
  const n = NOW(), dbr = DB.kpiDb();
  const wrap = h('div', { class: 'wrap home projects' });
  state.ctx = { export: a => exportList('today', a), more: a => moreMenu(a, { extra: [{ label: 'Open full tracker table', icon: 'table', run: () => go('#/tracker') }] }) };
  if (!dbr) { wrap.append(h('section', { class: 'hcard soon' }, h('p', {}, 'There is no Planning KPI Tracker yet. Import it from Notion in Settings, or make a new one.'), h('button', { class: 'hnew', onclick: () => { DB.createKpiTracker(); render(); } }, icon('plus', 16), h('span', {}, 'Make the tracker')))); return wrap; }
  const all = projectList(n);
  const counts = { all: all.filter(t => !t.archived).length, progress: 0, completed: 0, overdue: 0, archived: 0 };
  for (const t of all) { counts[bucket(t)]++; if (bucket(t) === 'progress' && t.dueDays != null && t.dueDays < 0) counts.overdue++; }

  const list = h('div', { class: 'hlist plist', role: 'table' }), foot = h('div', { class: 'pfoot' }), bulk = h('div');
  const draw = () => {
    let rows = all.filter(t => ptab === 'all' ? !t.archived : ptab === 'overdue' ? bucket(t) === 'progress' && t.dueDays != null && t.dueDays < 0 : bucket(t) === ptab);
    if (pq) { const q = pq.toLowerCase(); rows = rows.filter(t => searchText(t).includes(q)); }
    if (pcat) rows = rows.filter(t => t.category.includes(pcat));
    if (pstat) rows = rows.filter(t => t.status === pstat);
    if (pdue) rows = rows.filter(t => pdue === 'none' ? t.dueDays == null : t.dueDays != null && (pdue === 'overdue' ? t.dueDays < 0 : pdue === 'week' ? t.dueDays >= 0 && t.dueDays <= 7 : t.dueDays >= 0 && t.dueDays <= 31));
    rows = C.applyFilters(dbr, rows, pfil, t => t.row, n);
    const by = (pcol && (pcol.id === 'x:days' ? (a, b) => ((a.dueDays ?? 99999) - (b.dueDays ?? 99999)) * (pcol.dir === 'desc' ? -1 : 1) : C.comparer(dbr, pcol, t => t.row, n)))
      || { due: (a, b) => (a.dueDays ?? 99999) - (b.dueDays ?? 99999), name: (a, b) => a.title.localeCompare(b.title), assigned: (a, b) => (b.assigned || 0) - (a.assigned || 0) }[psort];
    rows.sort((a, b) => by(a, b) || a.title.localeCompare(b.title));
    cols = C.columns(dbr); C.gridOf(list, [30], cols, [32]);
    const shown = rows.slice(0, pshow);
    list.replaceChildren(...[head(), ...shown.map(t => projectRow(t, n)), rows.length ? null : h('p', { class: 'hempty' }, pq || pcat || pstat || pdue || pfil.length ? 'No project matches. Clear the search or filters.' : ptab === 'archived' ? 'No archived projects.' : 'No projects here.')].filter(Boolean));
    foot.replaceChildren(...[h('span', {}, rows.length ? `Showing 1–${shown.length} of ${rows.length} project${rows.length === 1 ? '' : 's'}` : ''),
      rows.length > shown.length ? h('button', { class: 'btn', onclick: () => { pshow += 100; draw(); } }, 'Show more') : null].filter(Boolean));
    bulk.replaceChildren(...[].concat(sel.size ? h('div', { class: 'hbulk' }, h('b', {}, sel.size + ' selected'),
      h('button', { class: 'btn', onclick: () => { for (const id of sel) setStatus(D.live(id), 'Done'); toast(sel.size + ' marked Done'); sel.clear(); render(); } }, icon('check', 15), 'Mark Done'),
      h('button', { class: 'btn', onclick: () => { for (const id of sel) archive(D.live(id), true); toast(sel.size + ' archived'); sel.clear(); render(); } }, icon('archive', 15), 'Archive'),
      h('button', { class: 'btn', onclick: () => { sel.clear(); draw(); } }, 'Clear')) : []));
  };
  let cols = [];
  const addFilter = pid => C.addFilterSheet(dbr, f => { pfil = [...pfil, f]; pshow = 50; render(); }, pid);
  const head = () => h('div', { class: 'hrow hhd prow', role: 'row' }, h('span', { class: 'c-chk' }),
    cols.map(c => h('span', { class: 'cc', role: 'columnheader' }, C.headCell(dbr, c, { sort: pcol, onSort: c.p || c.id === 'x:days' ? v => { pcol = v; render(); } : null, onFilter: addFilter }))), h('span', { class: 'c-act' }));
  function projectRow(t, n) {
    const row = t.row, rep = E.reportOnly(t.category), ss = E.surveyState(row, t), ep = rep ? '' : E.ecparStatus(row, t), xs = rep ? [] : E.ecxOf(t.id);
    const chk = h('input', { type: 'checkbox', class: 'hchk', 'aria-label': 'Select ' + t.title, checked: sel.has(t.id) ? true : null, onclick: e => e.stopPropagation(), onchange: e => { e.target.checked ? sel.add(t.id) : sel.delete(t.id); draw(); } });
    const computed = {
      'x:survey': () => ss === 'done' ? icon('check', 18, 'ok') : ss === 'pending' ? h('span', { class: 'muted sm' }, 'Pending') : h('span', { class: 'muted' }, '—'),
      'x:ecpar': () => ep === 'Approved' ? icon('check', 18, 'ok') : ep ? badge(ep, undefined, false) : h('span', { class: 'muted' }, '—'),
      'x:ecx': () => xs.length ? String(xs.length) : h('span', { class: 'muted' }, '—'),
      'x:days': () => bucket(t) === 'progress' ? daysBadge(t.dueDays) : h('span', { class: 'muted' }, '—') };
    const cellOf = c => {
      if (!c.p) return h('span', { class: 'cc cx', 'data-col': c.id, title: c.label }, computed[c.id]());
      const el = C.cell(dbr, c, row);
      if (c.p.type === 'title') el.append(h('button', { class: 'copen', type: 'button', 'aria-label': 'Open ' + t.title, title: 'Open', onclick: e => { e.stopPropagation(); go('#/project/' + t.id); } }, icon('expand', 15)));
      return el;
    };
    const r = h('div', { class: 'hrow prow' + (sel.has(t.id) ? ' sel' : '') + (t.archived ? ' arch' : ''), role: 'row', onclick: () => go('#/project/' + t.id) },
      h('span', { class: 'c-chk' }, chk), ...cols.map(cellOf),
      h('button', { class: 'c-act ebtn', 'aria-label': 'Actions for ' + t.title, onclick: e => { e.stopPropagation(); projectMenu(e.currentTarget, row); } }, icon('more', 18)));
    longPress(r, () => rowActions(t.id));
    return r;
  }

  const search = textbox({ value: pq, placeholder: 'Search customer, reference or ECX…', cls: 'hsearch-in', label: 'Search projects', oninput: () => { pq = search.value; pshow = 50; draw(); } });
  const cats = (P('Project Category')?.options || []).map(o => o.name), stats = (P('Status')?.options || []).map(o => o.name);
  const filterMenu = a => menu(a, [
    { el: h('div', { class: 'mhead' }, 'Category') }, { label: 'All categories', checked: !pcat, run: () => { pcat = ''; render(); } }, ...cats.map(c => ({ label: c, checked: pcat === c, run: () => { pcat = c; render(); } })), '-',
    { el: h('div', { class: 'mhead' }, 'Status') }, { label: 'Any status', checked: !pstat, run: () => { pstat = ''; render(); } }, ...stats.map(c => ({ label: c, checked: pstat === c, run: () => { pstat = c; render(); } })), '-',
    { el: h('div', { class: 'mhead' }, 'Due date') }, ...[['', 'Any time'], ['overdue', 'Overdue'], ['week', 'Due in 7 days'], ['month', 'Due in 31 days'], ['none', 'No due date']].map(([k, l]) => ({ label: l, checked: pdue === k, run: () => { pdue = k; render(); } })), '-',
    { label: 'Filter by any property…', icon: 'plus', run: () => addFilter() }], { width: 260 });
  const chips = [pcat && ['Category: ' + pcat, () => pcat = ''], pstat && ['Status: ' + pstat, () => pstat = ''], pdue && ['Due: ' + { overdue: 'Overdue', week: 'In 7 days', month: 'In 31 days', none: 'No date' }[pdue], () => pdue = ''],
    ...pfil.map(f => [C.filterText(dbr, f), () => pfil = pfil.filter(x => x !== f)]), pcol && ['Sorted by ' + C.label(dbr, pcol.id) + (pcol.dir === 'desc' ? ' ↓' : ' ↑'), () => pcol = null]].filter(Boolean)
    .map(([l, clear]) => h('button', { class: 'hchip', onclick: () => { clear(); render(); } }, l, icon('close', 13)));
  wrap.append(
    h('header', { class: 'hhead' },
      h('div', { class: 'htitle' }, h('div', { class: 'ptitle' }, icon('folder', 26), elabel('projects.title', 'Projects', 'h1')), elabel('projects.sub', 'Customers, projects, applications and tasks in one place.', 'p', { class: 'hsub' })),
      h('div', { class: 'hactions' },
        h('label', { class: 'hsearch glass' }, icon('search', 17), search),
        h('button', { class: 'hbtn glass' + (pcat || pstat || pdue || pfil.length ? ' on' : ''), 'aria-label': 'Filter projects', onclick: e => filterMenu(e.currentTarget) }, icon('filter', 18)),
        h('button', { class: 'hbtn glass', 'aria-label': 'Properties', title: 'Properties: show, hide and arrange columns', onclick: () => C.visibilitySheet(dbr) }, icon('sliders', 18)),
        h('button', { class: 'hbtn glass', 'aria-label': 'Sort projects', onclick: e => menu(e.currentTarget, [['due', 'Due date'], ['name', 'Customer name'], ['assigned', 'Date assigned (newest)']].map(([k, l]) => ({ label: 'Sort by ' + l, checked: psort === k, run: () => { psort = k; pcol = null; render(); } }))) }, icon('sort', 18)),
        h('button', { class: 'hbtn glass', 'aria-label': 'More options', onclick: e => state.ctx.more(e.currentTarget) }, icon('more', 19)),
        h('button', { class: 'hnew', onclick: () => newProjectSheet() }, icon('plus', 17), h('span', {}, 'New Project')))),
    h('section', { class: 'hcard htable ptable' },
      h('div', { class: 'hbar' }, h('div', { class: 'htabs', role: 'tablist' }, PTABS.map(([k, l]) => h('button', { class: 'htab' + (ptab === k ? ' on' : ''), role: 'tab', 'aria-selected': ptab === k ? 'true' : 'false',
        onclick: () => { ptab = k; pshow = 50; sel.clear(); render(); } }, h('span', {}, l), h('span', { class: 'hcount' + (k === 'overdue' && counts.overdue ? ' red' : '') }, counts[k]))))),
      chips.length ? h('div', { class: 'hchips' }, chips) : null, bulk, list, foot));
  draw();
  return wrap;
}

// ---------- project actions ----------
function setStatus(row, s) { const p = P('Status'); if (!row || !p) return; D.update(row.id, { ['p:' + p.id]: s }); if (s === 'Done' && P('Date Completed') && !DB.value(row, P('Date Completed'))) D.update(row.id, { ['p:' + P('Date Completed').id]: today() }); }
export function archive(row, on) { const p = P('Archive'); if (!row || !p) return; D.update(row.id, { ['p:' + p.id]: on }); E.log(row, 'Project', on ? 'Project archived.' : 'Project restored from archive.'); }
function projectMenu(anchor, row) {
  const info = DB.kpiInfo(row, DB.kpiDb());
  menu(anchor, [
    { label: 'Open project', icon: 'expand', run: () => go('#/project/' + row.id) },
    { label: 'Edit project', icon: 'pencil', run: () => editProjectSheet(row) },
    { label: info.archived ? 'Restore from archive' : 'Archive', icon: 'archive', run: () => { archive(row, !info.archived); toast(info.archived ? 'Restored' : 'Archived. Its history is kept.'); render(); } },
    { label: 'Notes and comments page', icon: 'page', run: () => go('#/r/' + row.id) }, '-',
    { label: 'Move to Trash', icon: 'trash', danger: true, run: async () => { if (await confirmBox('Move ' + DB.title(row) + ' to Trash? You can restore it from Trash.', 'Move to Trash')) { D.trash(row.id); render(); } } }]);
}

/** New Project: customer (pick an existing one or type a new name), category and dates */
export function newProjectSheet({ cat: preCat = '' } = {}) {
  const dbr = DB.kpiDb(); if (!dbr) { go('#/projects'); return; }
  const names = [...new Set(E.customers().map(c => g(c, 'name')).filter(Boolean))].sort();
  const dl = h('datalist', { id: 'custlist' }, names.map(n => h('option', { value: n })));
  const cust = h('input', { class: 'field', list: 'custlist', placeholder: 'Customer name', 'aria-label': 'Customer name', autocomplete: 'off' });
  const cat = h('select', { class: 'field', 'aria-label': 'Category' }, h('option', { value: '' }, 'Category'), (P('Project Category')?.options || []).map(o => h('option', { value: o.name, selected: o.name === preCat ? true : null }, o.name)));
  const da = h('input', { type: 'date', class: 'field', value: today(), 'aria-label': 'Date assigned' });
  const dd = h('input', { type: 'date', class: 'field', value: toISODate(dateAdd(new Date(NOW()), 7, 'days')), 'aria-label': 'Due date' });
  const ref = h('input', { class: 'field', placeholder: 'Project reference (optional)', 'aria-label': 'Project reference' });
  const lab = (t, el) => h('label', { class: 'flabel' }, h('span', {}, t), el);
  const s = sheet('New project', h('form', { class: 'npform', onsubmit: e => {
    e.preventDefault(); const name = cust.value.trim(); if (!name) { cust.focus(); return; }
    const vals = { [DB.titleProp(dbr).name]: name, 'Date Assigned': da.value || null, 'Due Date': dd.value || null, Status: 'Site Survey', 'Project Ref': ref.value.trim() || null };
    if (cat.value) vals['Project Category'] = [cat.value];
    const r = DB.newRow(dbr, vals); E.ensureAll(); s.close(); go('#/project/' + r.id);
  } }, dl, lab('Customer', cust), h('p', { class: 'muted small' }, names.length ? 'Pick an existing customer to link this project to them, or type a new name.' : 'Type the customer name.'),
    lab('Category', cat), h('div', { class: 'f2' }, lab('Date assigned', da), lab('Due date', dd)), lab('Reference', ref),
    h('button', { class: 'btn primary block', type: 'submit' }, 'Create project')), { done: 'Cancel' });
  setTimeout(() => cust.focus(), 80);
}
/** Edit Project: every project field in one sheet; changes save straight away */
export function editProjectSheet(row) {
  const dbr = DB.kpiDb();
  const names = [DB.titleProp(dbr)?.name, 'Project Category', 'Project Ref', 'Station', 'Date Assigned', 'Due Date', 'Date Completed', 'Status', 'Scope / Remarks', 'Archive'];
  const rows = names.map(n => n && DB.propByName(dbr, n)).filter(Boolean).map(p => {
    let ed;
    if (['text', 'title', 'number', 'url'].includes(p.type)) ed = h('input', { class: 'field', value: DB.raw(D.getRec(row.id), p) ?? '', 'aria-label': p.name, onchange: e => { D.update(row.id, { ['p:' + p.id]: e.target.value }); if (p.type === 'title') E.ensureAll(); } });
    else ed = propEditor(D.getRec(row.id), p, dbr);
    return h('div', { class: 'eprow' }, h('span', { class: 'epname' }, icon(DB.TYPE_ICON[p.type] || 'text', 16), p.type === 'title' ? 'Customer' : p.name), h('div', { class: 'epval props' }, ed));
  });
  sheet('Edit project', h('div', {}, h('p', { class: 'muted small pad' }, 'Typing the name of an existing customer links this project to that customer.'), h('div', { class: 'agrp eplist' }, rows)), { done: 'Done', onDone: () => render() });
}

// =====================================================================================
// Project Details
// =====================================================================================
let logOrder = 'new';
export function projectScreen(id, tab = 'overview') {
  E.ensureAll();
  const row = D.live(id), dbr = DB.kpiDb();
  if (!row || !dbr || D.val(row, 'db') !== dbr.id) return h('div', { class: 'wrap home' }, h('section', { class: 'hcard soon' }, h('p', {}, 'This project is not here. It may be in Trash.'), h('button', { class: 'btn', onclick: () => go('#/projects') }, 'Back to Projects')));
  const n = NOW(), info = DB.kpiInfo(row, dbr, n), rep = E.reportOnly(info.category);
  const dueDate = DB.value(row, P('Due Date')), dueDays = dueDate ? Math.round((startOfDay(dueDate) - startOfDay(new Date(n))) / 864e5) : null;
  const tasks = E.tasksOf(row.id), xs = E.ecxOf(row.id), pct = E.progress(row, info), kd = E.kpiDays(info, n);
  const TABS = [['overview', 'Overview', 'home'], ['tasks', 'Tasks', 'listcheck', tasks.filter(E.taskOpen).length], ['survey', 'Site Survey', 'target'],
    ...(rep ? [] : [['ecpar', 'ECPAR', 'ecpar']]), ...(ccEligible(info.category) ? [['cc', 'Connection Charge', 'table']] : []), ...(rep ? [] : [['ecx', 'ECX', 'filex', xs.length]]), ['docs', 'Documents', 'clip'], ['log', 'Activity Log', 'history']];
  if (!TABS.some(t => t[0] === tab)) tab = 'overview';
  state.ctx = { export: a => exportList('today', a), more: a => projectMenu(a, row) };
  const ref = P('Project Ref') ? DB.value(row, P('Project Ref')) : '';
  const created = D.val(row, 'created', 0);
  const wrap = h('div', { class: 'wrap home pdetail' },
    h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' }, h('a', { href: '#/projects' }, icon('folder', 16), 'Projects'), icon('chevr', 14), h('span', {}, 'Project Details')),
    h('header', { class: 'pdhead' },
      h('span', { class: 'pdic' }, icon('building', 26)),
      h('div', { class: 'pdname' }, h('div', { class: 'pdt' }, h('h1', {}, info.title), catPills(info.category, false), info.archived ? badge('Archived', 'gray') : null),
        h('p', { class: 'hsub' }, [ref || 'No reference', created ? 'Created ' + formatDate(new Date(created), 'D/M/YYYY') : ''].filter(Boolean).join(' · '))),
      h('div', { class: 'hactions' },
        h('button', { class: 'hbtn glass', 'aria-label': 'Project actions', onclick: e => projectMenu(e.currentTarget, row) }, icon('more', 19)),
        h('button', { class: 'hnew', onclick: () => editProjectSheet(row) }, icon('pencil', 16), h('span', {}, 'Edit Project')))),
    h('section', { class: 'kstrip pstrip' },
      h('div', { class: 'kcell' }, h('div', {}, h('small', {}, 'Status'), propVal(row, 'Status'))),
      h('div', { class: 'kcell' }, h('div', {}, h('small', {}, 'Date Assigned'), propVal(row, 'Date Assigned'))),
      h('div', { class: 'kcell' }, h('div', {}, h('small', {}, 'Due Date'), propVal(row, 'Due Date'))),
      h('div', { class: 'kcell' }, h('div', {}, h('small', {}, 'Days Left'), info.status === 'Done' || info.archived ? h('span', { class: 'muted' }, '—') : daysBadge(dueDays))),
      h('div', { class: 'kcell kprog' }, h('div', {}, h('small', {}, 'KPI Progress'), h('div', { class: 'pbar' }, h('b', {}, pct + '%'), h('span', { class: 'bar' }, h('i', { style: { width: pct + '%' } }))),
        h('small', { class: 'kd' + (kd != null && kd > 7 ? ' late' : '') }, kd == null ? 'Set Date Assigned for KPI' : (info.completed ? 'Done in ' : 'Day ') + kd + (info.completed ? ' days' : ' of 7') + (kd > 7 ? ' · over KPI' : ' · within KPI'))))),
    h('div', { class: 'ptabs htabs', role: 'tablist' }, TABS.map(([k, l, ic, c]) => h('a', { class: 'htab' + (tab === k ? ' on' : ''), role: 'tab', 'aria-selected': tab === k ? 'true' : 'false', href: `#/project/${id}/${k}`, onclick: e => { e.preventDefault(); go(`#/project/${id}/${k}`, { replace: true }); } },
      icon(ic, 16), h('span', {}, l), c ? h('span', { class: 'hcount' }, c) : null))),
    h('div', { class: 'pbody' }, ({ overview, tasks: tasksTab, survey: surveyTab, ecpar: ecparTab, cc: (r, i) => ccTab(r, i), ecx: ecxTab, docs: docsTab, log: logTab })[tab](row, info, n)));
  return wrap;
}

// ---------- Overview ----------
function overview(row, info, n) {
  const c = E.customerOf(row);
  const cf = (ic, label, key, extra = {}) => kv(ic, label, c ? field(c, { key, label, onSet: v => E.setCustomer(c, key, v), ...extra }) : h('span', { class: 'muted' }, '—'));
  const custName = c ? field(c, { key: 'name', label: 'Customer name', onSet: v => { if (v && v.trim()) { E.setCustomer(c, 'name', v.trim()); E.ensureAll(); } } }) : h('span', {}, info.title);
  const others = c ? E.projectsOf(c.id).filter(r => r.id !== row.id) : [];
  const year = r => { const i = DB.kpiInfo(r, DB.kpiDb(), n); return (i.assigned || new Date(D.val(r, 'created', n))).getFullYear(); };
  const ms = E.milestones(row, info), kd = E.kpiDays(info, n);
  return h('div', { class: 'pdgrid' },
    h('section', { class: 'hcard pcard' },
      h('h3', { class: 'ph' }, icon('users', 17), 'Customer Information'),
      h('div', { class: 'kvs' }, kv('building', 'Customer', custName), cf('person', 'PIC', 'pic'), cf('phone', 'Contact Number', 'phone', { tel: 'tel' }), cf('mail', 'Email', 'email', { tel: 'mail' }),
        kv('pin', 'Address', c ? field(c, { key: 'address', label: 'Address', onSet: v => E.setCustomer(c, 'address', v), ph: E.custAddress(row, c) || 'Empty' }) : '—'),
        kv('globe', 'Pin Location', c ? field(c, { key: 'map', label: 'Pin Location', type: 'url', onSet: v => E.setCustomer(c, 'map', v) }) : '—'),
        // supply details of the customer
        cf('status', 'Tariff', 'tariff', { type: 'select', options: E.TARIFFS, onSet: v => { E.setCustomer(c, 'tariff', v); if (v !== 'Domestic' && g(c, 'subsidy')) toast('Subsidy applies to Domestic tariff only, so it is not used for Commercial.'); } }),
        c && g(c, 'tariff') === 'Domestic' ? cf('okcircle', 'Subsidy', 'subsidy', { type: 'select', options: ['Yes', 'No'] }) : null,
        c && g(c, 'tariff') === 'Domestic' && g(c, 'subsidy') === 'Yes' ? cf('number', 'Subsidy %', 'subsidyPct', { type: 'select', options: ['70%', '100%'] }) : null,
        cf('layers', 'Type of Application', 'apptype', { type: 'select', options: E.APP_TYPES }),
        cf('today', 'Meter Type', 'meter', { type: 'select', options: E.METER_TYPES }),
        cf('building', 'Premise Type', 'premise', { type: 'select', options: E.PREMISE_TYPES })),
      h('h3', { class: 'ph' }, icon('info', 17), 'Project Information'),
      h('div', { class: 'kvs' }, kv('layers', 'Category', propVal(row, 'Project Category')), kv('text', 'Project Reference', propVal(row, 'Project Ref')), kv('pin', 'Station', propVal(row, 'Station')),
        kv('date', 'Date Assigned', propVal(row, 'Date Assigned')), kv('date', 'Due Date', propVal(row, 'Due Date')), kv('status', 'Status', propVal(row, 'Status')), kv('text', 'Scope / Remarks', propVal(row, 'Scope / Remarks')))),
    h('div', { class: 'pside' },
      h('section', { class: 'hcard pcard' },
        h('h3', { class: 'ph' }, icon('target', 17), 'Project Progress'),
        h('ul', { class: 'mlist' }, ms.map(m => h('li', { class: m.done ? 'done' : '' },
          m.toggle ? h('button', { class: 'mchk', 'aria-pressed': m.done ? 'true' : 'false', 'aria-label': m.label, onclick: () => { const wk = E.work(row); D.update(wk.id, { ['p:' + m.key]: !m.done }); if (!m.done) E.log(row, m.key === 'docs' ? 'Document check' : 'Report', m.label + '.'); render(); } }, icon(m.done ? 'okcircle' : 'today', 18))
            : h('span', { class: 'mchk' }, icon(m.done ? 'okcircle' : 'today', 18)), h('span', {}, m.label),
          m.key === 'survey' && !m.done ? h('button', { class: 'link sm', onclick: () => go(`#/project/${row.id}/survey`) }, 'Open') : null))),
        h('div', { class: 'kvs' }, kv('hourglass', 'KPI (within 7 days)', kd == null ? h('span', { class: 'muted' }, 'Needs Date Assigned') : h('span', { class: kd > 7 ? 'late' : '' }, (info.completed ? 'Done in ' + kd + ' days' : 'Day ' + kd + ' of 7') + (kd > 7 ? ', over KPI' : ''))))),
      h('section', { class: 'hcard pcard' },
        h('h3', { class: 'ph' }, icon('folder', 17), 'Related Projects', others.length ? h('span', { class: 'hcount' }, others.length) : null),
        others.length ? h('ul', { class: 'rel' }, others.map(r => { const i = DB.kpiInfo(r, DB.kpiDb(), n);
          return h('li', {}, h('button', { onclick: () => go('#/project/' + r.id) }, h('span', { class: 'relc' }, catPills(i.category)), h('span', { class: 'rely' }, year(r)), i.archived ? badge('Archived', 'gray') : i.status ? optPill('Status', i.status, true) : h('span'), icon('chevr', 14, 'kgo'))); }))
          : h('p', { class: 'muted small' }, 'No other projects for this customer.'))));
}

// ---------- Tasks ----------
function tasksTab(row, info, n) {
  const list = E.tasksOf(row.id);
  const add = async () => { const name = (await promptBox('New task', '', 'Task name'))?.trim(); if (!name) return; E.addTask(row, name); render(); };
  return h('section', { class: 'hcard pcard' },
    h('div', { class: 'phbar' }, h('h3', { class: 'ph' }, icon('listcheck', 17), 'Tasks', h('span', { class: 'hcount' }, list.length)), h('button', { class: 'hnew sm', onclick: add }, icon('plus', 15), h('span', {}, 'Add Task'))),
    list.length ? h('div', { class: 'tlist' }, h('div', { class: 'trow thd' }, h('span'), h('span', {}, 'Task'), h('span', {}, 'Due Date'), h('span', {}, 'Priority'), h('span', {}, 'Status'), h('span')), list.map(t => taskRow(t, row, n)))
      : h('p', { class: 'hempty' }, 'No tasks yet. Add the first one, for example "Check documents".'));
}
function taskRow(t, row, n) {
  const done = g(t, 'status') === 'Completed', days = E.taskDays(t, n), late = !done && days != null && days < 0;
  const dueEl = h('button', { class: 'val fv' + (late ? ' late' : '') + (g(t, 'due') ? '' : ' empty'), 'aria-label': 'Due date', onclick: () => dateSheet('Due date', g(t, 'due'), v => { D.update(t.id, { 'p:due': v }); render(); }) },
    g(t, 'due') ? dmy(g(t, 'due')) : 'Set date', late ? h('em', { class: 'otag' }, 'Overdue') : null);
  const name = field(t, { key: 'name', label: 'Task name' });
  return h('div', { class: 'trow' + (done ? ' done' : '') },
    h('span', {}, h('input', { type: 'checkbox', class: 'hchk', checked: done ? true : null, 'aria-label': 'Mark ' + g(t, 'name', '') + ' completed', onchange: e => { E.completeTask(t, e.target.checked, n); render(); } })),
    h('div', { class: 'tname' }, name, g(t, 'remarks') ? h('small', { class: 'muted' }, g(t, 'remarks')) : null, done && g(t, 'done') ? h('small', { class: 'muted' }, 'Completed ' + dmy(g(t, 'done'))) : null),
    h('span', { class: 'tdue' }, dueEl),
    h('span', {}, field(t, { key: 'priority', label: 'Priority', type: 'select', options: E.PRIORITY })),
    h('span', {}, h('button', { class: 'val fv', 'aria-label': 'Status: ' + g(t, 'status', ''), onclick: e => pick(e.currentTarget, E.TASK_STATUS, g(t, 'status'), s => { if (s === 'Completed') E.completeTask(t, true, n); else D.update(t.id, { 'p:status': s, 'p:done': null }); render(); }) }, badge(g(t, 'status') || 'Not Started'))),
    h('button', { class: 'c-act ebtn', 'aria-label': 'More for ' + g(t, 'name', 'task'), onclick: e => menu(e.currentTarget, [
      { label: 'Edit task name', icon: 'pencil', run: () => name.click() },
      { label: g(t, 'remarks') ? 'Edit remarks' : 'Add remarks', icon: 'text', run: async () => { const v = await promptBox('Remarks', g(t, 'remarks', '')); if (v != null) { D.update(t.id, { 'p:remarks': v.trim() }); render(); } } },
      { label: 'Set due date', icon: 'date', run: () => dueEl.click() }, '-',
      { label: 'Delete task', icon: 'trash', danger: true, run: async () => { if (await confirmBox('Delete the task "' + g(t, 'name', '') + '"?', 'Delete task')) { D.trash(t.id); E.log(row, 'Task', 'Task deleted: ' + g(t, 'name', '')); render(); } } }]) }, icon('more', 18)));
}

// ---------- Site Survey ----------
function surveyTab(row, info, n) {
  const rep = E.reportOnly(info.category), st = E.surveyState(row, info), w = E.workOf(row) || { id: 'wk' + row.id, f: {} };
  const wf = (key, label, extra = {}) => field(E.workOf(row) || E.work(row), { key, label, ...extra });
  const toggle = (key, label) => h('button', { class: 'tgl', 'aria-pressed': g(w, key) ? 'true' : 'false', onclick: () => { const wk = E.work(row); D.update(wk.id, { ['p:' + key]: !g(wk, key) }); if (!g(w, key)) E.log(row, key === 'docs' ? 'Document check' : 'Report', label + '.'); render(); } },
    icon(g(w, key) ? 'okcircle' : 'today', 18), g(w, key) ? 'Yes' : 'Not yet');
  return h('section', { class: 'hcard pcard' },
    h('div', { class: 'phbar' }, h('h3', { class: 'ph' }, icon('target', 17), 'Site Survey', st === 'done' ? badge('Completed') : st === 'pending' ? badge('Pending') : null),
      st !== 'done' ? h('button', { class: 'hnew sm', onclick: async () => { const r = await glassModal({ title: 'Site survey completed', dateLabel: 'Survey date', textLabel: 'Findings (optional)', ok: 'Mark completed' }); if (!r) return;
        E.completeSurvey(row, r.date, n); if (r.text) { const wk = E.work(row); D.update(wk.id, { 'p:findings': [g(wk, 'findings'), r.text].filter(Boolean).join('\n') }); } render(); } }, icon('check', 15), h('span', {}, 'Mark completed')) : null),
    h('div', { class: 'kvs two' },
      kv('date', 'Survey date', wf('survey', 'Survey date', { type: 'date' })),
      rep ? kv('page', 'Report prepared', toggle('report', 'Report prepared')) : kv('listcheck', 'Documents checked', toggle('docs', 'Documents checked')),
      kv('text', 'Technical findings', wf('findings', 'Technical findings')),
      rep ? null : kv('linechart', 'Transformer & feeder loading', wf('loading', 'Transformer & feeder loading')),
      kv('pin', 'Site address', h('span', {}, E.custAddress(row) || h('span', { class: 'muted' }, '—'))),
      kv('globe', 'Pin Location', E.custMap(row) ? h('a', { class: 'lnk', href: browserUrl(E.custMap(row)), target: '_blank', rel: 'noopener' }, 'Open map') : h('span', { class: 'muted' }, '—'))));
}

// ---------- ECPAR ----------
function ecparTab(row, info, n) {
  const e = E.ecparOf(row);
  if (!e) return h('section', { class: 'hcard pcard' }, h('div', { class: 'phbar' }, h('h3', { class: 'ph' }, icon('ecpar', 17), 'ECPAR'), h('button', { class: 'hnew sm', onclick: () => { E.ecpar(row); E.log(row, 'ECPAR', 'ECPAR record added.', { ecpar: true }); render(); } }, icon('plus', 15), h('span', {}, 'Add ECPAR'))),
    h('p', { class: 'hempty' }, 'No ECPAR for this project yet. Each project has one ECPAR reference; its revisions are kept in its history.'));
  const s = g(e, 'status') || 'Draft', w = E.workOf(row);
  const ef = (key, label, extra = {}) => field(e, { key, label, ...extra });
  const hist = E.revisions(row);
  return h('section', { class: 'hcard pcard' },
    h('div', { class: 'phbar' }, h('h3', { class: 'ph' }, icon('ecpar', 17), 'ECPAR',
      h('button', { class: 'val fv', 'aria-label': 'ECPAR status: ' + s, onclick: ev => pick(ev.currentTarget, E.ECPAR_STATUS, s, v => { if (v === 'Pending Revision' && !E.ECPAR_ACTIVE.includes(s)) rejectBtn.click(); else if (v === 'Approved') approveBtn.click(); else if (v === 'Resubmitted') resubBtn.click(); else { E.setEcparStatus(row, v); render(); } }) }, badge(s), icon('chevd', 14))),
      h('div', { class: 'wfacts' }, ...ecparButtons())),
    h('div', { class: 'kvs two' },
      kv('text', 'Reference No.', ef('ref', 'ECPAR reference number', { mono: true })), kv('date', 'Submission Date', ef('submitted', 'Submission date', { type: 'date' })),
      kv('number', 'Budget Amount', ef('budget', 'Budget amount (RM)', { type: 'money' })), kv('layers', 'Version', h('span', {}, 'v' + (g(e, 'version') || 1))),
      kv('date', 'Approval Date', ef('approved', 'Approval date', { type: 'date' })), kv('date', 'Rejection Date', ef('rejected', 'Rejection date', { type: 'date' })),
      kv('text', 'Rejection Reason', ef('reason', 'Rejection reason')), kv('date', 'Resubmission Date', ef('resubmitted', 'Resubmission date', { type: 'date' })),
      kv('list', 'Reason Category', ef('rcat', 'Reason category', { type: 'select', options: E.ECPAR_REASONS })), kv('pencil', 'Required Correction', ef('correction', 'Required correction')),
      kv('text', 'Remarks', ef('remarks', 'Remarks')),
    ),
    h('p', { class: 'muted small note' }, 'The ECPAR budget is prepared in the company system; record its reference and amount here. Connection charges are estimated separately in the Connection Charge tab.'),
    historyBlock('Revision history', hist));
  var rejectBtn, approveBtn, resubBtn;
  function ecparButtons() {
    rejectBtn = h('button', { class: 'rbtn', onclick: async () => { if (await rejectEcparFlow(row)) render(); } }, icon('close', 13), 'Reject');
    approveBtn = h('button', { class: 'sbtn', onclick: async () => { if (await approveEcparFlow(row)) render(); } }, icon('check', 13), 'Approve');
    resubBtn = h('button', { class: 'sbtn', onclick: async () => { if (await resubmitEcparFlow(row)) render(); } }, icon('redo', 13), 'Resubmit');
    const act = E.ECPAR_ACTIVE.includes(s);
    return [act ? resubBtn : null, s !== 'Approved' ? approveBtn : null, !act ? rejectBtn : null].filter(Boolean);
  }
}
function historyBlock(title, hist) {
  return h('details', { class: 'rhist', open: hist.length ? true : null },
    h('summary', {}, icon('chevd', 14), title + ' (' + hist.filter(x => x.ev === 'rejected').length + ' rejected)'),
    hist.length ? h('div', { class: 'rtable' }, h('div', { class: 'rr rhd' }, h('span', {}, '#'), h('span', {}, 'Date'), h('span', {}, 'Event'), h('span', {}, 'Reason / Remarks')),
      hist.map((x, i) => h('div', { class: 'rr' }, h('span', {}, i + 1), h('span', {}, dmy(x.date) || formatDate(new Date(x.t), 'D/M/YYYY')), h('span', {}, badge(x.ev === 'rejected' ? 'Rejected' : x.ev === 'approved' ? 'Approved' : 'Resubmitted', undefined, false)), h('span', {}, x.reason || h('span', { class: 'muted' }, '—')))))
      : h('p', { class: 'muted small pad' }, 'No rejection record yet.'));
}

// ---------- ECX ----------
function ecxTab(row, info, n) {
  const xs = E.ecxOf(row.id);
  const add = async () => { const no = await promptBox('New ECX application', '', 'ECX number (you can add it later)'); if (no == null) return; E.addEcx(row, no.trim()); render(); };
  return h('div', { class: 'xlist' },
    h('div', { class: 'phbar out' }, h('h3', { class: 'ph' }, icon('filex', 17), 'ECX Applications', h('span', { class: 'hcount' }, xs.length)), h('button', { class: 'hnew sm', onclick: add }, icon('plus', 15), h('span', {}, 'Add ECX Application'))),
    xs.length ? xs.map(x => ecxCard(row, x)) : h('section', { class: 'hcard pcard' }, h('p', { class: 'hempty' }, 'No ECX application yet. A project can have several; each keeps its own rejection history.')));
}
function ecxCard(row, x) {
  const s = g(x, 'status') || 'Draft', xf = (key, label, extra = {}) => field(x, { key, label, ...extra });
  const reject = async () => { if (await rejectEcxFlow(row, x)) render(); };
  const approve = async () => { if (await approveEcxFlow(row, x)) render(); };
  const resub = async () => { if (await resubmitEcxFlow(row, x)) render(); };
  const act = E.ECX_ACTIVE.includes(s);
  return h('section', { class: 'hcard pcard xcard' },
    h('div', { class: 'phbar' }, h('div', { class: 'ph' }, icon('filex', 17), xf('number', 'ECX number', { mono: true, ph: 'ECX number' }),
      h('button', { class: 'val fv', 'aria-label': 'ECX status: ' + s, onclick: ev => pick(ev.currentTarget, E.ECX_STATUS, s, v => { if (v === 'Pending Action' && !act) reject(); else if (v === 'Approved') approve(); else if (v === 'Resubmitted') resub(); else if (v === 'Closed') { E.closeEcx(row, x); render(); } else { E.setEcxStatus(row, x, v); render(); } }) }, badge(s), icon('chevd', 14))),
      h('div', { class: 'wfacts' },
        act ? h('button', { class: 'sbtn', onclick: resub }, icon('redo', 13), 'Resubmit') : null,
        s !== 'Approved' && s !== 'Closed' ? h('button', { class: 'sbtn', onclick: approve }, icon('check', 13), 'Approve') : null,
        !act ? h('button', { class: 'rbtn', onclick: reject }, icon('close', 13), 'Reject') : null,
        h('button', { class: 'c-act ebtn', 'aria-label': 'More for this ECX application', onclick: e => menu(e.currentTarget, [{ label: 'Delete application', icon: 'trash', danger: true, run: async () => { if (await confirmBox('Delete this ECX application? Its log entries stay in the Activity Log.', 'Delete')) { D.trash(x.id); E.log(row, 'ECX', (g(x, 'number') || 'ECX application') + ' deleted.'); render(); } } }]) }, icon('more', 18)))),
    h('div', { class: 'kvs two' },
      kv('text', 'Application ID', xf('appid', 'Application ID', { mono: true })), kv('date', 'Submission Date', xf('submitted', 'Submission date', { type: 'date' })),
      kv('date', 'Rejection Date', xf('rejected', 'Rejection date', { type: 'date' })), kv('text', 'Rejection Reason', xf('reason', 'Rejection reason')),
      kv('date', 'Resubmission Date', xf('resubmitted', 'Resubmission date', { type: 'date' })), kv('date', 'Approval Date', xf('approved', 'Approval date', { type: 'date' })),
      kv('list', 'Reason Category', xf('rcat', 'Reason category', { type: 'select', options: E.ECX_REASONS })), kv('pencil', 'Required Correction', xf('correction', 'Required correction')),
      kv('text', 'Remarks', xf('remarks', 'Remarks'))),
    historyBlock('Rejection history', E.revisions(row, x.id)));
}

// ---------- Documents ----------
function docsTab(row) {
  const docs = E.docsOf(row.id);
  const add = async () => { const url = (await promptBox('Paste the link', '', 'https://…'))?.trim(); if (!url) return; const name = (await promptBox('Name of the document', '', 'e.g. Site photos'))?.trim(); E.addDoc(row, name || url, url); render(); };
  const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  return h('section', { class: 'hcard pcard' },
    h('div', { class: 'phbar' }, h('h3', { class: 'ph' }, icon('clip', 17), 'Documents', h('span', { class: 'hcount' }, docs.length)), h('button', { class: 'hnew sm', onclick: add }, icon('plus', 15), h('span', {}, 'Add link'))),
    docs.length ? h('ul', { class: 'dlist' }, docs.map(d => h('li', {}, h('a', { href: browserUrl(g(d, 'url', '')), target: '_blank', rel: 'noopener' }, icon('link', 16), h('span', {}, g(d, 'name', 'Link')), h('small', { class: 'muted' }, hostOf(g(d, 'url', '')))),
      h('button', { class: 'c-act ebtn', 'aria-label': 'More for ' + g(d, 'name', 'link'), onclick: e => menu(e.currentTarget, [{ label: 'Rename', icon: 'pencil', run: async () => { const v = await promptBox('Name', g(d, 'name', '')); if (v != null && v.trim()) { D.update(d.id, { 'p:name': v.trim() }); render(); } } },
        { label: 'Remove', icon: 'trash', danger: true, run: async () => { if (await confirmBox('Remove this link?', 'Remove')) { D.trash(d.id); render(); } } }]) }, icon('more', 18)))))
      : h('p', { class: 'hempty' }, 'No documents yet. Add links to files in iCloud Drive, Google Drive or the company system.'),
    h('div', { class: 'kvs' }, kv('clip', 'Files', propEditor(row, { id: 'docs', name: 'Files', type: 'files' }, DB.kpiDb())),
      kv('page', 'Notes and comments', h('a', { class: 'lnk', href: '#/r/' + row.id }, 'Open the notes page'))));
}

// ---------- Activity Log ----------
function logTab(row) {
  const ev = E.history(row); if (logOrder === 'new') ev.reverse();
  const xs = Object.fromEntries(E.ecxOf(row.id).map(x => [x.id, g(x, 'number') || 'ECX']));
  const add = e => menu(e.currentTarget, E.ACT_TYPES.map(t => ({ label: t, run: async () => { const v = (await promptBox(t, '', 'What happened?'))?.trim(); if (v) { E.log(row, t, v, t === 'ECPAR' ? { ecpar: true } : {}); render(); } } })));
  const tone = t => ({ ECPAR: 'purple', ECX: 'blue', 'Site survey': 'green', Task: 'gray', Comment: 'gray', Project: 'gray', 'Customer follow-up': 'orange', 'Document check': 'yellow', Report: 'yellow' }[t] || 'gray');
  return h('section', { class: 'hcard pcard' },
    h('div', { class: 'phbar' }, h('h3', { class: 'ph' }, icon('history', 17), 'Activity Log', h('span', { class: 'hcount' }, ev.length)),
      h('div', { class: 'wfacts' }, h('button', { class: 'sbtn', onclick: () => { logOrder = logOrder === 'new' ? 'old' : 'new'; render(); } }, icon('sort', 13), logOrder === 'new' ? 'Newest first' : 'Oldest first'),
        h('button', { class: 'hnew sm', onclick: add }, icon('plus', 15), h('span', {}, 'Add entry')))),
    h('ol', { class: 'alog' }, ev.map(x => h('li', {}, h('time', {}, formatDate(new Date(x.t), 'D/M/YYYY'), h('small', {}, new Date(x.t).toTimeString().slice(0, 5))),
      h('div', {}, h('div', { class: 'atags' }, badge(x.type, tone(x.type), false), x.ecx && xs[x.ecx] ? h('span', { class: 'mono small muted' }, xs[x.ecx]) : null, x.ecpar ? h('span', { class: 'small muted' }, 'ECPAR') : null),
        h('p', {}, x.text))))));
}

/** Due Today (Focus): open tasks due today or earlier from every project, with the project and customer */
export function dueTaskList(list) {
  const n = NOW();
  return h('section', { class: 'duetasks' }, h('div', { class: 'barrow' }, h('h2', { class: 'bar orange' }, 'Tasks due')),
    list.map(x => { const late = x.days < 0;
      return h('div', { class: 'dtrow', role: 'button', tabindex: '0', onclick: () => go('#/project/' + x.row.id + '/tasks') },
        h('input', { type: 'checkbox', class: 'hchk', 'aria-label': 'Mark ' + x.name + ' completed', onclick: e => e.stopPropagation(), onchange: e => { E.completeTask(x.task, e.target.checked, n); toast('Task completed'); render(); } }),
        h('div', { class: 'dtm' }, h('b', {}, x.name), h('small', {}, [x.customer, x.info.category[0]].filter(Boolean).join(' · '))),
        g(x.task, 'priority') ? badge(g(x.task, 'priority')) : null,
        h('span', { class: 'dtd' + (late ? ' late' : '') }, x.days === 0 ? 'Today' : late ? Math.abs(x.days) + (x.days === -1 ? ' day late' : ' days late') : dmy(g(x.task, 'due')))); }));
}
