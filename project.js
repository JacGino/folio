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
import { applicantsOf } from './longtext.js';
import * as C from './cols.js';
import { viewTabs, head as coverHead } from './views.js';
import { heroNav } from './home.js';
import { checklistsFor, guessSide } from './checklists.js';

const { g } = E;
const P = n => { const d = DB.kpiDb(); return d && DB.propByName(d, n); };
const dmy = v => { const d = parseDate(v); return d ? formatDate(d, 'DD/MM/YYYY') : ''; };
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
// a label can wrap after '/' (e.g. 'Wayleave (Private/Utilities)') so it never runs into the value on narrow screens
const kv = (ic, label, value) => h('div', { class: 'kv' }, h('span', { class: 'kl' }, icon(ic, 16), typeof label === 'string' ? label.replace(/\//g, '/\u200b') : label), h('div', { class: 'kvv' }, value));
const propVal = (row, name) => { const p = P(name); return h('div', { class: 'props pv' }, p ? propEditor(row, p, DB.kpiDb(), { dfmt: 'DD/MM/YYYY' }) : h('span', { class: 'muted' }, '—')); };

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
  const r = await formModal({ title: 'Reject ECPAR', fields: [{ key: 'date', type: 'date', label: 'Rejection date', value: today(), required: true }, { key: 'correction', type: 'long', label: 'Required correction' }], ok: 'Confirm Reject', danger: true }); if (!r) return false;
  E.rejectEcpar(row, r.date, '', { correction: r.correction }); toast('ECPAR rejected. It is now in Rejected ECPAR.'); return true;
}
export async function resubmitEcparFlow(row) {
  const r = await formModal({ title: 'Resubmit revised ECPAR', fields: [{ key: 'date', type: 'date', label: 'Resubmission date', value: today(), required: true }], ok: 'Resubmit' }); if (!r) return false;
  E.resubmitEcpar(row, r.date, r.note); toast('ECPAR resubmitted. Its rejection history is kept.'); return true;
}
export async function approveEcparFlow(row) {
  const r = await formModal({ title: 'Mark ECPAR approved', fields: [{ key: 'date', type: 'date', label: 'Approval date', required: true }], ok: 'Mark Approved' }); if (!r) return false;
  E.approveEcpar(row, r.date); return true;
}
export async function rejectEcxFlow(row, x) {
  // filled in from the ECX card (Rejection Date, Reason Category, Rejection Reason), so nothing is typed twice
  const r = await formModal({ title: 'Reject ' + (g(x, 'number') || 'ECX application'), fields: [
    { key: 'date', type: 'date', label: 'Rejection date', value: g(x, 'rejected') || today(), required: true },
    { key: 'cat', type: 'select', label: 'Reason category', options: E.ECX_REASONS, value: g(x, 'rcat') || '', placeholder: 'Choose a category' },
    { key: 'reason', type: 'long', label: 'Rejection reason / remarks', value: g(x, 'reason', '') }], ok: 'Confirm Reject', danger: true }); if (!r) return false;
  E.rejectEcx(row, x, r.date, r.reason, { cat: r.cat }); toast('ECX rejected. It is now in Rejected ECX.'); return true;
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
let pq = '', ptab = 'all', pcat = '', pstat = '', pdue = '', psort = 'due', pshow = 50, pcol = null, pfil = [], pyear = 'all';
// the chosen sort (menu or column header) is kept on this device, so it stays after closing and reopening the app
try { const v = JSON.parse(localStorage.getItem('folio-psort') || 'null'); if (v) { if (['due', 'name', 'assigned'].includes(v.psort)) psort = v.psort; if (v.pcol && v.pcol.id) pcol = v.pcol; if (v.pyear) pyear = v.pyear; } } catch (e) {}
const keepSort = () => { try { localStorage.setItem('folio-psort', JSON.stringify({ psort, pcol, pyear })); } catch (e) {} };
const sel = new Set();
const PTABS = [['all', 'All Projects'], ['progress', 'In Progress'], ['completed', 'Completed'], ['overdue', 'Overdue'], ['archived', 'Archived']];
// Rejected projects sit with Completed (they still show in the Rejected Queue / ECPAR & ECX rejected pages until resubmitted)
/** ⋯ menu: close a past year (its finished projects move to "Planning KPI Archive <year>"), open or bring back an archive */
export function yearMenuItems(n) {
  const k = DB.kpiDb(); if (!k) return [];
  const now = new Date(n), cy = now.getFullYear(), ys = [...new Set(DB.rows(k.id).map(DB.projectYear))].filter(y => y < cy || (y === cy && now.getMonth() === 11)).sort((a, b) => b - a);
  const out = [];
  for (const y of ys) out.push({ label: `Close year ${y}…`, icon: 'archive', run: async () => {
    const k2 = DB.kpiDb(), c = DB.rows(k2.id).filter(r => DB.projectYear(r) === y && DB.yearClosable(DB.kpiInfo(r, k2))).length;
    if (!c) return toast(`No Done or archived ${y} projects to move.`);
    if (!await confirmBox(`Move ${c} ${y} projects (Done, or with the Archive box ticked) to "Planning KPI Archive ${y}"? Open and Rejected ${y} projects stay here, on their pages, until you tick Archive. You can bring them back from this menu.`, `Close ${y}`)) return;
    const moved = DB.closeYear(y); toast(`${moved} projects moved to Planning KPI Archive ${y}.`); render(); } });
  for (const a of DB.yearArchives()) { const y = D.val(a, 'year');
    out.push({ label: `Open Archive ${y}`, icon: 'table', run: () => go('#/p/' + D.val(a, 'page')) });
    out.push({ label: `Bring ${y} back to the tracker…`, icon: 'undo', run: async () => { if (!await confirmBox(`Move the ${DB.rows(a.id).length} projects in Archive ${y} back to the tracker?`, 'Bring back')) return; const n2 = DB.reopenYear(y); toast(`${n2} projects back in the tracker.`); render(); } }); }
  return out;
}
const bucket = t => t.archived ? 'archived' : (t.finished || /^rejected$/i.test(String(t.status || '').trim())) ? 'completed' : 'progress';
function searchText(t) {
  return [t.title, t.ecx, DB.projectRef(t.row), ...E.ecxOf(t.id).map(x => [g(x, 'number'), g(x, 'appid')].join(' '))].join(' ').toLowerCase();
}
function projectList(n) {
  const dbr = DB.kpiDb(); if (!dbr) return [];
  return DB.rows(dbr.id).map(r => { const t = DB.kpiInfo(r, dbr, n); t.dueDate = t.amend && t.due ? t.due : t.kpiDue || DB.value(r, P('Due Date')); t.dueDays = t.dueDate ? Math.round((startOfDay(t.dueDate) - startOfDay(new Date(n))) / 864e5) : null; return t; });
}
export function projectsScreen() {
  E.ensureAll();
  const n = NOW(), dbr = DB.kpiDb();
  const wrap = h('div', { class: 'wrap home projects' });
  state.ctx = { export: a => exportList('today', a), more: a => moreMenu(a, { extra: [{ label: 'Open full tracker table', icon: 'table', run: () => go('#/tracker') }, ...yearMenuItems(n)] }) };
  if (!dbr) { wrap.append(h('section', { class: 'hcard soon' }, h('p', {}, 'There is no Planning KPI Tracker yet. Import it from Notion in Settings, or make a new one.'), h('button', { class: 'hnew', onclick: () => { DB.createKpiTracker(); render(); } }, icon('plus', 16), h('span', {}, 'Make the tracker')))); return wrap; }
  const every = projectList(n);
  for (const t of every) t.year = DB.projectYear(t.row);
  const years = [...new Set(every.map(t => t.year))].sort((a, b) => b - a);
  if (pyear !== 'all' && !years.includes(+pyear)) pyear = 'all';
  const all = pyear === 'all' ? every : every.filter(t => t.year === +pyear); // the year picker: by Date Assigned
  const counts = { all: all.filter(t => !t.archived).length, progress: 0, completed: 0, overdue: 0, archived: 0 };
  // overdue: still open, past the due date, and the ECX has no Completed / Rejection Date yet
  const isOver = t => bucket(t) === 'progress' && !t.ecxEnd && t.dueDays != null && t.dueDays < 0;
  for (const t of all) { counts[bucket(t)]++; if (isOver(t)) counts.overdue++; }

  const list = h('div', { class: 'hlist plist', role: 'table' }), foot = h('div', { class: 'pfoot' }), bulk = h('div');
  const draw = () => {
    let rows = all.filter(t => ptab === 'all' ? !t.archived : ptab === 'overdue' ? isOver(t) : bucket(t) === ptab);
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
    C.attachResizers(list, dbr);
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
    cols.map(c => h('span', { class: 'cc', role: 'columnheader' }, C.headCell(dbr, c, { sort: pcol, onSort: c.p || c.id === 'x:days' ? v => { pcol = v; keepSort(); render(); } : null, onFilter: addFilter }))), h('span', { class: 'c-act' }));
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
      // OPEN sits in the Reference No column (the customer name when that column is not shown)
      if (C.isRefCol(c.p) || (c.p.type === 'title' && !cols.some(k => C.isRefCol(k.p)))) el.append(h('button', { class: 'copen', type: 'button', 'aria-label': 'Open ' + t.title, title: 'Open', onclick: e => { e.stopPropagation(); go('#/project/' + t.id); } }, 'Open'));
      return el;
    };
    const r = h('div', { class: 'hrow prow' + (sel.has(t.id) ? ' sel' : '') + (t.archived ? ' arch' : ''), role: 'row', 'data-rid': t.id, onclick: () => go('#/project/' + t.id) },
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
  const chips = [pyear !== 'all' && ['Year: ' + pyear, () => { pyear = 'all'; keepSort(); }], pcat && ['Category: ' + pcat, () => pcat = ''], pstat && ['Status: ' + pstat, () => pstat = ''], pdue && ['Due: ' + { overdue: 'Overdue', week: 'In 7 days', month: 'In 31 days', none: 'No date' }[pdue], () => pdue = ''],
    ...pfil.map(f => [C.filterText(dbr, f), () => pfil = pfil.filter(x => x !== f)]), pcol && ['Sorted by ' + C.label(dbr, pcol.id) + (pcol.dir === 'desc' ? ' ↓' : ' ↑'), () => { pcol = null; keepSort(); }]].filter(Boolean)
    .map(([l, clear]) => h('button', { class: 'hchip', onclick: () => { clear(); render(); } }, l, icon('close', 13)));
  wrap.append(
    // same cover header as Board / Timeline / Reports (cover photo, menu ← →, bell, ⋯); tools in the row under it
    coverHead({ group: 'projects', cur: 'projects', crumb: 'Table', title: elabel('projects.title', 'Projects', 'span'), desc: elabel('projects.sub', 'Customers, projects, applications and tasks in one place.', 'span'), ic: 'folder', more: a => state.ctx.more(a),
      tools: [
        h('label', { class: 'hsearch glass' }, icon('search', 17), search),
        h('button', { class: 'hbtn glass' + (pcat || pstat || pdue || pfil.length ? ' on' : ''), 'aria-label': 'Filter projects', onclick: e => filterMenu(e.currentTarget) }, icon('filter', 18)),
        h('button', { class: 'hbtn glass', 'aria-label': 'Properties', title: 'Properties: show, hide and arrange columns', onclick: () => C.visibilitySheet(dbr) }, icon('sliders', 18)),
        h('button', { class: 'hbtn glass yearbtn' + (pyear !== 'all' ? ' on' : ''), 'aria-label': 'Year', title: 'Show one year (by Date Assigned)', onclick: e => menu(e.currentTarget, [{ label: 'All years', checked: pyear === 'all', run: () => { pyear = 'all'; keepSort(); render(); } },
          ...years.map(y => ({ label: `${y}  (${every.filter(t => t.year === y).length})`, checked: String(pyear) === String(y), run: () => { pyear = String(y); keepSort(); render(); } }))]) }, pyear !== 'all' ? h('span', { class: 'ybadge' }, String(pyear)) : icon('cal', 18)),
        h('button', { class: 'hbtn glass', 'aria-label': 'Sort projects', onclick: e => menu(e.currentTarget, [['due', 'Due date'], ['name', 'Customer name'], ['assigned', 'Date assigned (newest)']].map(([k, l]) => ({ label: 'Sort by ' + l, checked: psort === k, run: () => { psort = k; pcol = null; keepSort(); render(); } }))) }, icon('sort', 18)),
        h('button', { class: 'hnew', onclick: () => newProjectSheet() }, icon('plus', 17), h('span', {}, 'New Project'))] }),
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
  const ref = h('input', { class: 'field mono', placeholder: 'e.g. ECX_202607_2457 (optional)', 'aria-label': DB.REF_ECX });
  const pref = h('input', { class: 'field mono', placeholder: 'e.g. BTU-260476 (optional)', 'aria-label': DB.REF_ECPAR });
  const lab = (t, el) => h('label', { class: 'flabel' }, h('span', {}, t), el);
  const s = sheet('New project', h('form', { class: 'npform', onsubmit: e => {
    e.preventDefault(); const name = cust.value.trim(); if (!name) { cust.focus(); return; }
    const vals = { [DB.titleProp(dbr).name]: name, 'Date Assigned': da.value || null, 'Due Date': dd.value || null, Status: 'Site Survey', [DB.REF_ECX]: ref.value.trim() || null, [DB.REF_ECPAR]: pref.value.trim() || null };
    if (cat.value) vals['Project Category'] = [cat.value];
    const r = DB.newRow(dbr, vals); E.ensureAll(); s.close(); go('#/project/' + r.id);
  } }, dl, lab('Customer', cust), h('p', { class: 'muted small' }, names.length ? 'Pick an existing customer to link this project to them, or type a new name.' : 'Type the customer name.'),
    lab('Category', cat), h('div', { class: 'f2' }, lab('Date assigned', da), lab('Due date', dd)), lab(DB.REF_ECX, ref), lab(DB.REF_ECPAR, pref),
    h('button', { class: 'btn primary block', type: 'submit' }, 'Create project')), { done: 'Cancel' });
  setTimeout(() => cust.focus(), 80);
}
/** Edit Project: every project field in one sheet; changes save straight away */
export function editProjectSheet(row) {
  const dbr = DB.kpiDb();
  const names = [DB.titleProp(dbr)?.name, 'Project Category', DB.REF_ECX, DB.REF_ECPAR, 'Station', 'Date Assigned', 'Due Date', 'Date Completed', 'Status', DB.WAYLEAVE, 'Archive'];
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
  if (!row || !dbr || !DB.isKpiRow(row)) return h('div', { class: 'wrap home' }, h('section', { class: 'hcard soon' }, h('p', {}, 'This project is not here. It may be in Trash.'), h('button', { class: 'btn', onclick: () => go('#/projects') }, 'Back to Projects')));
  const n = NOW(), info = DB.kpiInfo(row, dbr, n), rep = E.reportOnly(info.category);
  // To Amend counts down to the ECPAR resubmission (Rejection Date + 1 day)
  const dueDate = info.amend && info.due ? info.due : info.kpiDue || DB.value(row, P('Due Date')), dueDays = dueDate ? Math.round((startOfDay(dueDate) - startOfDay(new Date(n))) / 864e5) : null;
  const tasks = E.tasksOf(row.id), xs = E.ecxOf(row.id), pct = E.progress(row, info), kd = E.kpiDays(info, n);
  const TABS = [['overview', 'Overview', 'home'], ['tasks', 'Tasks', 'listcheck', tasks.filter(E.taskOpen).length], ['survey', 'Site Survey', 'target'],
    ...(rep ? [] : [['ecpar', 'ECPAR', 'ecpar']]), ...(ccEligible(info.category) ? [['cc', 'Connection Charge', 'table']] : []), ...(rep ? [] : [['ecx', 'ECX', 'filex', xs.length]]), ['docs', 'Documents', 'clip'], ['log', 'Activity Log', 'history']];
  if (!TABS.some(t => t[0] === tab)) tab = 'overview';
  state.ctx = { export: a => exportList('today', a), more: a => projectMenu(a, row) };
  const ref = DB.projectRef(row);
  const created = D.val(row, 'created', 0);
  const n0 = NOW(), alerts = DB.kpiDb() ? DB.kpiTasks(n0).filter(t => t.days != null && t.days <= 0).length + E.dueTasks(n0).length : 0;
  const wrap = h('div', { class: 'wrap home pdetail' },
    // same round buttons as every other page (menu ← → left, bell ⋯ right), without a cover photo
    h('div', { class: 'pdnav' }, heroNav(), h('div', { class: 'pdnav-a' },
      h('button', { class: 'hbtn glass', 'aria-label': alerts ? `Notifications, ${alerts} due or overdue` : 'Notifications', onclick: () => go('#/inbox') }, icon('bell', 19), alerts ? h('i', { class: 'hdot' }) : null),
      h('button', { class: 'hbtn glass', 'aria-label': 'Project actions', onclick: e => projectMenu(e.currentTarget, row) }, icon('more', 19)))),
    h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' }, h('a', { href: '#/projects' }, icon('folder', 16), 'Projects'), icon('chevr', 14), h('span', {}, 'Project Details')),
    h('header', { class: 'pdhead' },
      h('span', { class: 'pdic' }, icon('building', 26)),
      // the header: two cards — Reference No (ECX No) on top, Project Reference (ECPAR No) below — then the customer (shortened when there are several applicants)
      h('div', { class: 'pdname' }, h('div', { class: 'pdt' }, C.refCards(row, { big: true }), info.archived ? badge('Archived', 'gray') : null),
        created ? h('p', { class: 'hsub' }, 'Created ' + formatDate(new Date(created), 'DD/MM/YYYY')) : null),
      h('div', { class: 'hactions' },
        h('button', { class: 'hnew', onclick: () => editProjectSheet(row) }, icon('pencil', 16), h('span', {}, 'Edit Project')))),
    h('section', { class: 'kstrip pstrip' },
      h('div', { class: 'kcell' }, h('div', {}, h('small', {}, 'Status'), propVal(row, 'Status'))),
      h('div', { class: 'kcell' }, h('div', {}, h('small', {}, 'Date Assigned'), propVal(row, 'Date Assigned'))),
      h('div', { class: 'kcell' }, h('div', {}, h('small', {}, info.amend && info.due ? 'Resubmit by' : 'Due Date'),
        // Resubmit by = ECPAR Rejection Date + 1 day: tapping it edits the Rejection Date (the 1-day KPI stays)
        info.amend && info.due ? h('button', { class: 'val fv', type: 'button', title: 'Change the ECPAR Rejection Date', 'aria-label': 'Resubmit by ' + formatDate(dueDate, 'DD/MM/YYYY') + ': change the ECPAR Rejection Date',
            onclick: e => { e.stopPropagation(); const ep = E.ecpar(row); dateSheet('ECPAR Rejection Date (Resubmit by = +1 day)', g(D.getRec(ep.id), 'rejected') || toISODate(info.amendStart), v => { D.update(ep.id, { 'p:rejected': v }); render(); }); } }, h('span', {}, formatDate(dueDate, 'DD/MM/YYYY')))
          : info.kpiDue ? h('span', { class: 'val' }, formatDate(dueDate, 'DD/MM/YYYY')) : propVal(row, 'Due Date'))),
      h('div', { class: 'kcell' }, h('div', {}, h('small', {}, info.amend && info.amendEnd ? 'Resubmitted' : 'Days Left'),
        info.finished || info.archived ? h('span', { class: 'muted' }, '—')
        : info.amend && info.amendEnd ? h('span', { class: 'dl amdone' + (info.amendDays <= 1 ? ' ok' : ' late'), title: 'Rejection Date to Resubmission Date (1 day allowed). Waiting for ECPAR approval.' }, `in ${info.amendDays} ${info.amendDays === 1 ? 'day' : 'days'}`)
        : daysBadge(dueDays))),
      h('div', { class: 'kcell kprog' }, h('div', {}, h('small', {}, 'KPI Progress'), h('div', { class: 'pbar' }, h('b', {}, pct + '%'), h('span', { class: 'bar' }, h('i', { style: { width: pct + '%' } }))),
        h('small', { class: 'kd' + (kd != null && kd > 7 ? ' late' : '') }, kd == null ? 'Set Date Assigned for KPI' : (info.completed ? 'Done in ' : 'Day ') + kd + (info.completed ? ' days' : ' of 7') + (kd > 7 ? ' · over KPI' : ' · within KPI'))))),
    keepTabScroll(id, h('div', { class: 'ptabs htabs', role: 'tablist' }, TABS.map(([k, l, ic, c]) => h('a', { class: 'htab' + (tab === k ? ' on' : ''), role: 'tab', 'aria-selected': tab === k ? 'true' : 'false', href: `#/project/${id}/${k}`, onclick: e => { e.preventDefault(); go(`#/project/${id}/${k}`, { replace: true }); } },
      icon(ic, 16), h('span', {}, l), c ? h('span', { class: 'hcount' }, c) : null)))),
    h('div', { class: 'pbody' }, ({ overview, tasks: tasksTab, survey: surveyTab, ecpar: ecparTab, cc: (r, i) => ccTab(r, i), ecx: ecxTab, docs: docsTab, log: logTab })[tab](row, info, n)));
  return wrap;
}

// ---------- Overview ----------
/** the tab strip keeps its sideways scroll when a tab is picked (the page redraws), and the picked tab stays in view */
const tabScroll = { id: null, x: 0 };
function keepTabScroll(id, strip) {
  if (tabScroll.id !== id) { tabScroll.id = id; tabScroll.x = 0; }
  strip.addEventListener('scroll', () => { tabScroll.x = strip.scrollLeft; }, { passive: true });
  requestAnimationFrame(() => {
    strip.scrollLeft = tabScroll.x;
    const on = strip.querySelector('.htab.on'); if (!on) return;
    const l = on.offsetLeft - strip.offsetLeft, r = l + on.offsetWidth;
    if (l < strip.scrollLeft) strip.scrollLeft = Math.max(0, l - 16);
    else if (r > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = r - strip.clientWidth + 16;
    tabScroll.x = strip.scrollLeft;
  });
  return strip;
}
/** one ECX application, several applicants (e.g. a longhouse): each name with its Applicant ID (IC No) beside it, + to add another.
 *  Saved back into the customer name as '1) NAME (IC)\n2) …', so the table and the Long Text stay in sync. */
const joinApplicants = list => list.length === 1 ? list[0].name : list.map((a, i) => `${i + 1}) ${a.name}${a.ic ? ' (' + a.ic + ')' : ''}`).join('\n');
function applicantSheet(title, a = { name: '', ic: '' }) {
  return new Promise(res => {
    let form, done = false;
    const enter = next => e => { if (e.key === 'Enter') { e.preventDefault(); next ? next.focus() : form.requestSubmit(); } };
    const ic = textbox({ value: a.ic, cls: 'field mono', label: 'Applicant ID (IC No)', placeholder: 'e.g. 720308-13-5434', attrs: { enterkeyhint: 'done' }, onkeydown: enter(null) });
    const nm = textbox({ value: a.name, cls: 'field', label: 'Customer name', placeholder: 'Customer name', attrs: { enterkeyhint: 'next' }, onkeydown: enter(ic) });
    const s = sheet(title, form = h('form', { class: 'aplform', onsubmit: e => { e.preventDefault(); if (!nm.value.trim()) return toast('Enter the customer name'); done = true; res({ name: nm.value.trim().toUpperCase(), ic: ic.value.trim() }); s.close(); } },
      h('label', {}, h('span', {}, 'Customer name'), nm), h('label', {}, h('span', {}, 'Applicant ID (IC No)'), ic), h('button', { class: 'btn primary block', type: 'submit' }, 'Save')),
      { done: 'Cancel', onDone: () => { if (!done) res(null); } });
  });
}
// one customer: the name stays plain and its Applicant ID (IC No) is a field of its own (also the Long Text's IC / company no.)
function saveApplicants(c, list) { E.setCustomer(c, 'name', joinApplicants(list)); D.update(c.id, { 'p:ic': list.length === 1 ? (list[0].ic || null) : null }); E.ensureAll(); render(); }
function applicantList(c, info) {
  const t = c ? g(c, 'name') : info.title, ap = applicantsOf(t);
  if (ap.length) return ap;
  const one = E.splitNameIc(t);
  return [{ name: one.name, ic: (c && E.custIc(c)) || one.ic }];
}
const addApplicantBtn = (c, info) => c ? h('button', { class: 'iconbtn sm apladd', type: 'button', 'aria-label': 'Add applicant', onclick: async e => { e.stopPropagation();
  const list = applicantList(c, info), a = await applicantSheet('Add applicant ' + (list.length + 1)); if (!a) return; saveApplicants(c, [...list, a]); toast('Applicant added'); } }, icon('plus', 16)) : null;
function applicantsBlock(row, info, c) {
  if (!c) return null;
  const ap = applicantList(c, info); // one customer too: its Applicant ID (IC No) is keyed in beside the name
  const edit = i => async e => { e.stopPropagation(); const a = await applicantSheet(ap.length > 1 ? 'Applicant ' + (i + 1) : 'Customer', ap[i]); if (!a) return; const list = ap.slice(); list[i] = a; saveApplicants(c, list); };
  return h('div', { class: 'kv kvwide aplwrap' },
    h('div', { class: 'aplhead' }, h('span', { class: 'kl' }, icon('building', 16), 'Customer'), h('span', { class: 'kl aplid' }, 'Applicant ID'), addApplicantBtn(c, info)),
    h('div', { class: 'apl' }, ap.map((a, i) => h('div', { class: 'aplr' }, h('span', { class: 'apln' }, ap.length > 1 ? (i + 1) + ')' : ''),
      h('button', { class: 'val fv aplname', type: 'button', 'aria-label': `Customer ${i + 1}: ${a.name}`, onclick: edit(i) }, h('span', {}, a.name)),
      h('button', { class: 'val fv mono' + (a.ic ? '' : ' empty'), type: 'button', 'aria-label': `Applicant ID ${i + 1}: ${a.ic || 'Empty'}`, onclick: edit(i) }, h('span', {}, a.ic || 'Empty')),
      ap.length > 1 ? h('button', { class: 'iconbtn sm', type: 'button', 'aria-label': `Remove applicant ${i + 1}`, onclick: async e => { e.stopPropagation();
        if (!await confirmBox('Remove ' + a.name + ' from the customer list?', 'Remove')) return; saveApplicants(c, ap.filter((_, k) => k !== i)); } }, icon('close', 15)) : h('span')))));
}
function overview(row, info, n) {
  const c = E.customerOf(row);
  const cf = (ic, label, key, extra = {}) => kv(ic, label, c ? field(c, { key, label, onSet: v => E.setCustomer(c, key, v), ...extra }) : h('span', { class: 'muted' }, '—'));
  const custName = c ? field(c, { key: 'name', label: 'Customer name', onSet: v => { if (v && v.trim()) { E.setCustomer(c, 'name', v.trim()); E.ensureAll(); } } }) : h('span', {}, info.title);
  // other projects of this customer: a different ECX No is a separate application (rare — usually the first is cancelled);
  // the same ECX No is another record of this same application (a likely duplicate), shown apart so it can be removed
  const ecxNo = r => String(DB.refParts(r).ecx || (E.ecxOf(r.id)[0] && g(E.ecxOf(r.id)[0], 'number')) || '').trim().toUpperCase();
  const mine = ecxNo(row), all = c ? E.projectsOf(c.id).filter(r => r.id !== row.id) : [];
  const dups = mine ? all.filter(r => ecxNo(r) === mine) : [], others = all.filter(r => !dups.includes(r));
  const year = r => { const i = DB.kpiInfo(r, DB.kpiDb(), n); return (i.assigned || new Date(D.val(r, 'created', n))).getFullYear(); };
  const ms = E.milestones(row, info), kd = E.kpiDays(info, n);
  return h('div', { class: 'pdgrid' },
    h('section', { class: 'hcard pcard' },
      h('h3', { class: 'ph' }, icon('users', 17), 'Customer Information'),
      h('div', { class: 'kvs' }, applicantsBlock(row, info, c) || kv('building', 'Customer', c ? h('span', { class: 'fvwrap' }, custName, addApplicantBtn(c, info)) : custName), cf('person', 'Contractor / Consultant', 'pic'), cf('phone', 'Contact Number', 'phone', { tel: 'tel' }), cf('mail', 'Email', 'email', { tel: 'mail' }),
        kv('pin', 'Address', c ? field(c, { key: 'address', label: 'Address', onSet: v => E.setCustomer(c, 'address', v), ph: E.custAddress(row, c) || 'Empty' }) : '—'),
        kv('globe', 'Pin Location', c ? field(c, { key: 'map', label: 'Pin Location', type: 'url', onSet: v => E.setCustomer(c, 'map', v) }) : '—'),
        // supply details of the customer
        cf('status', 'Tariff', 'tariff', { type: 'select', options: E.TARIFFS, onSet: v => { E.setCustomer(c, 'tariff', v); if (v !== 'Domestic' && g(c, 'subsidy')) toast('Subsidy applies to Domestic tariff only, so it is not used for Commercial.'); } }),
        c && g(c, 'tariff') === 'Domestic' ? cf('okcircle', 'Subsidy', 'subsidy', { type: 'select', options: ['Yes', 'No'] }) : null,
        c && g(c, 'tariff') === 'Domestic' && g(c, 'subsidy') === 'Yes' ? cf('number', 'Subsidy %', 'subsidyPct', { type: 'select', options: ['70%', '100%'] }) : null,
        cf('layers', 'Type of Application', 'apptype', { type: 'select', options: E.APP_TYPES }),
        cf('today', 'Meter Type', 'meter', { type: 'select', options: E.METER_TYPES }),
        cf('building', 'Premise Type', 'premise', { type: 'select', options: E.PREMISE_TYPES }),
        cf('home', 'Type of Use', 'use', { ph: 'e.g. DWELLING' })), // the Long Text's Type of use (linked both ways)
      h('h3', { class: 'ph' }, icon('info', 17), 'Project Information'),
      h('div', { class: 'kvs' }, kv('layers', 'Category', propVal(row, 'Project Category')), kv('text', 'Reference No (ECX No)', propVal(row, DB.REF_ECX)), kv('text', 'Project Reference (ECPAR No)', E.reportOnly(info.category) ? h('span', { class: 'muted' }, 'Not applicable') : propVal(row, DB.REF_ECPAR)), kv('pin', 'Station', propVal(row, 'Station')),
        kv('date', 'Date Assigned', propVal(row, 'Date Assigned')), kv('date', 'Due Date', propVal(row, 'Due Date')))),
    h('div', { class: 'pside' },
      h('section', { class: 'hcard pcard' },
        h('h3', { class: 'ph' }, icon('target', 17), 'Project Progress'),
        h('ul', { class: 'mlist' }, ms.map(m => h('li', { class: m.done ? 'done' : '' },
          m.toggle ? h('button', { class: 'mchk', 'aria-pressed': m.done ? 'true' : 'false', 'aria-label': m.label, onclick: () => { const wk = E.work(row); D.update(wk.id, { ['p:' + m.key]: !m.done }); if (!m.done) E.log(row, m.key === 'docs' ? 'Document check' : 'Report', m.label + '.'); render(); } }, icon(m.done ? 'okcircle' : 'today', 18))
            : h('span', { class: 'mchk' }, icon(m.done ? 'okcircle' : 'today', 18)), h('span', {}, m.label),
          m.key === 'survey' && !m.done ? h('button', { class: 'link sm', onclick: () => go(`#/project/${row.id}/survey`) }, 'Open') : null))),
        h('div', { class: 'kvs' }, kv('hourglass', 'KPI (within 7 days)', kd == null ? h('span', { class: 'muted' }, 'Needs Date Assigned') : h('span', { class: kd > 7 ? 'late' : '' }, (info.completed ? 'Done in ' + kd + ' days' : 'Day ' + kd + ' of 7') + (kd > 7 ? ', over KPI' : ''))))),
      dups.length ? h('section', { class: 'hcard pcard dupcard' },
        h('h3', { class: 'ph' }, icon('info', 17), 'Same ECX No', h('span', { class: 'hcount' }, dups.length)),
        h('p', { class: 'muted small' }, `${dups.length > 1 ? 'These records have' : 'This record has'} the same ECX No (${mine}) — an earlier or later round of this application (e.g. before a RETRIGGER), or a copy. Keep it if it is a real round: it counts in your KPI.`),
        h('ul', { class: 'rel' }, dups.map(r => { const i = DB.kpiInfo(r, DB.kpiDb(), n);
          return h('li', { class: 'dupli' }, h('button', { onclick: () => go('#/project/' + r.id) }, h('span', { class: 'relc' }, catPills(i.category)), h('span', { class: 'rely' }, year(r)), i.archived ? badge('Archived', 'gray') : i.status ? optPill('Status', i.status, true) : h('span'), icon('chevr', 14, 'kgo')),
            h('button', { class: 'btn danger sm', onclick: async () => { if (await confirmBox('Move this duplicate record of ' + mine + ' to Trash? You can restore it from Trash.', 'Move to Trash')) { D.trash(r.id); toast('Moved to Trash. Restore it from Trash.'); render(); } } }, icon('trash', 14), 'Move to Trash')); }))) : null,
      others.length ? h('section', { class: 'hcard pcard' },
        h('h3', { class: 'ph' }, icon('folder', 17), 'Related Projects', others.length ? h('span', { class: 'hcount' }, others.length) : null),
        others.length ? h('ul', { class: 'rel' }, others.map(r => { const i = DB.kpiInfo(r, DB.kpiDb(), n);
          return h('li', {}, h('button', { onclick: () => go('#/project/' + r.id) }, h('span', { class: 'relc' }, catPills(i.category)), h('span', { class: 'rely' }, year(r)), i.archived ? badge('Archived', 'gray') : i.status ? optPill('Status', i.status, true) : h('span'), icon('chevr', 14, 'kgo'))); }))
          : null) : null));
}

// ---------- Tasks ----------
/** planning checklist for the project's category (SAL100KW, SSE, TK1, TK2, NEM, TOS): ticks saved on the project, synced */
function checklistCard(row, info) {
  const cats = [].concat(info.category || []);
  const c = E.customerOf(row);
  const side = D.val(row, 'cklSide') || guessSide(c ? g(c, 'premise', '') : '', c ? g(c, 'tariff', '') : '');
  const lists = checklistsFor(cats, side); if (!lists.length) return null;
  const ticks = D.val(row, 'checklist') || {};
  const all = lists.flatMap(l => l.items), done = all.filter(i => ticks[i.id]).length;
  const toggle = (id, on) => { const cur = { ...(D.val(D.getRec(row.id), 'checklist') || {}) }; if (on) cur[id] = toISODate(new Date(NOW())); else delete cur[id]; D.update(row.id, { checklist: cur }); render(); };
  const item = (it, i) => {
    const on = !!ticks[it.id];
    return h('li', { class: 'ckl-i' + (on ? ' on' : '') + (it.tone ? ' tone-' + it.tone : '') },
      h('label', {}, h('input', { type: 'checkbox', class: 'hchk', checked: on ? true : null, 'aria-label': (it.title || it.text), onchange: e => toggle(it.id, e.target.checked) }),
        h('span', { class: 'ckl-n' }, String(i + 1)),
        h('span', { class: 'ckl-t' }, it.title ? h('b', {}, it.title) : null, it.text ? h('span', {}, it.text) : null,
          it.notes ? h('ul', { class: 'ckl-notes' }, it.notes.map(x => h('li', {}, x))) : null,
          on && typeof ticks[it.id] === 'string' ? h('small', { class: 'muted' }, 'Checked ' + dmy(ticks[it.id])) : null)));
  };
  return h('section', { class: 'hcard pcard ckl' },
    h('div', { class: 'phbar' }, h('h3', { class: 'ph' }, icon('listcheck', 17), 'Checklist', h('span', { class: 'hcount' + (done === all.length ? ' ok' : '') }, done + ' / ' + all.length)),
      done ? h('button', { class: 'c-act ebtn', 'aria-label': 'More for checklist', onclick: e => menu(e.currentTarget, [{ label: 'Untick all', icon: 'undo', run: async () => { if (await confirmBox('Untick every item in this checklist?', 'Untick all')) { D.update(row.id, { checklist: {} }); render(); } } }]) }, icon('more', 18)) : null),
    h('div', { class: 'ckl-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': all.length, 'aria-valuenow': done }, h('i', { style: { width: (all.length ? done / all.length * 100 : 0) + '%' } })),
    lists.map(l => h('div', { class: 'ckl-sec' },
      h('div', { class: 'ckl-h' }, h('h4', {}, l.label),
        l.sides ? h('div', { class: 'seg', role: 'group', 'aria-label': 'Premise' }, Object.entries(l.sides).map(([k, s]) => h('button', { class: k === l.side ? 'on' : '', 'aria-pressed': k === l.side ? 'true' : 'false', onclick: () => { D.update(row.id, { cklSide: k }); render(); } }, s.label))) : null),
      h('ol', { class: 'ckl-list' }, l.items.map(item)))));
}
function tasksTab(row, info, n) {
  const list = E.tasksOf(row.id);
  const add = async () => { const name = (await promptBox('New task', '', 'Task name'))?.trim(); if (!name) return; E.addTask(row, name); render(); };
  return h('div', { class: 'tabstack' }, checklistCard(row, info), h('section', { class: 'hcard pcard' },
    h('div', { class: 'phbar' }, h('h3', { class: 'ph' }, icon('listcheck', 17), 'Tasks', h('span', { class: 'hcount' }, list.length)), h('button', { class: 'hnew sm', onclick: add }, icon('plus', 15), h('span', {}, 'Add Task'))),
    list.length ? h('div', { class: 'tlist' }, h('div', { class: 'trow thd' }, h('span'), h('span', {}, 'Task'), h('span', {}, 'Due Date'), h('span', {}, 'Priority'), h('span', {}, 'Status'), h('span')), list.map(t => taskRow(t, row, n)))
      : h('p', { class: 'hempty' }, 'No tasks yet. Add the first one, for example "Check documents".')));
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
/** Pin Location as the link itself (editable; 🌐 opens it) — kept on the customer, same as Overview; tracker column when there is no customer */
function pinField(row) {
  const c = E.customerOf(row);
  return c ? field(c, { key: 'map', label: 'Pin Location', type: 'url', onSet: v => E.setCustomer(c, 'map', v) }) : propVal(row, 'Pin Location');
}
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

      kv('pin', 'Site address', h('span', {}, E.custAddress(row) || h('span', { class: 'muted' }, '—'))),
      kv('globe', 'Pin Location', pinField(row)),
      kv('text', 'Wayleave (Private/Utilities)', propVal(row, DB.WAYLEAVE)),
      rep ? null : kv('linechart', 'Transformer & feeder loading', wf('loading', 'Transformer & feeder loading')),
      // full width at the bottom, with a taller box to type in
      h('div', { class: 'kv kvwide' }, h('span', { class: 'kl' }, icon('text', 16), 'Technical findings'), h('div', { class: 'kvv' }, wf('findings', 'Technical findings'))),
      // site notes kept apart from the Technical findings (which also fill the Long Text's Scheme of supply)
      h('div', { class: 'kv kvwide' }, h('span', { class: 'kl' }, icon('text', 16), 'Remark'), h('div', { class: 'kvv' }, wf('remark', 'Remark')))));
}

// ---------- ECPAR ----------
function ecparTab(row, info, n) {
  const e = E.ecparOf(row);
  if (!e) return h('section', { class: 'hcard pcard' }, h('div', { class: 'phbar' }, h('h3', { class: 'ph' }, icon('ecpar', 17), 'ECPAR'), h('button', { class: 'hnew sm', onclick: () => { E.ecpar(row); E.log(row, 'ECPAR', 'ECPAR record added.', { ecpar: true }); render(); } }, icon('plus', 15), h('span', {}, 'Add ECPAR'))),
    h('p', { class: 'hempty' }, 'No ECPAR for this project yet. Each project has one ECPAR reference; its revisions are kept in its history.'));
  const s = g(e, 'status') || '', w = E.workOf(row);
  const ef = (key, label, extra = {}) => field(e, { key, label, ...extra });
  const hist = E.revisions(row);
  return h('section', { class: 'hcard pcard' },
    h('div', { class: 'phbar' }, h('h3', { class: 'ph' }, icon('ecpar', 17), 'ECPAR',
      h('button', { class: 'val fv', 'aria-label': 'ECPAR status: ' + (s || 'Not submitted'), onclick: ev => pick(ev.currentTarget, E.ECPAR_STATUS, s, v => { if (v === 'Pending Revision' && !E.ECPAR_ACTIVE.includes(s)) rejectBtn.click(); else if (v === 'Resubmitted' && E.ECPAR_ACTIVE.includes(s)) resubBtn.click(); else { E.setEcparStatus(row, v); render(); } }) }, s ? badge(s) : h('span', { class: 'muted' }, 'Not submitted'), icon('chevd', 14))),
      h('div', { class: 'wfacts' }, ...ecparButtons())),
    h('div', { class: 'kvs two' },
      kv('text', 'Project Reference', ef('ref', 'Project Reference (ECPAR No)', { mono: true })), kv('date', 'Submission Date', ef('submitted', 'Submission date', { type: 'date' })),
      kv('number', 'Budget Amount', ef('budget', 'Budget amount (RM)', { type: 'money' })), kv('layers', 'Version', h('span', { class: 'mono' }, E.ecparVersion(e))),
      kv('date', 'Rejection Date', ef('rejected', 'Rejection date', { type: 'date' })), kv('date', 'Resubmission Date', ef('resubmitted', 'Resubmission date', { type: 'date' })),
      kv('pencil', 'Required Correction', ef('correction', 'Required correction')),
    ),
    h('p', { class: 'muted small note' }, 'Budget Amount follows CDP to seek in the Long Text (once (b) Total cost of project is filled in there). Connection charges are estimated separately in the Connection Charge tab.'),
    historyBlock('Revision history', hist));
  var rejectBtn, resubBtn;
  // one button: Resubmit while it is rejected; Reject otherwise (ready for the next rejection)
  function ecparButtons() {
    rejectBtn = h('button', { class: 'rbtn', onclick: async () => { if (await rejectEcparFlow(row)) render(); } }, icon('close', 13), 'Reject');
    resubBtn = h('button', { class: 'sbtn', onclick: async () => { if (await resubmitEcparFlow(row)) render(); } }, icon('redo', 13), 'Resubmit');
    return [E.ECPAR_ACTIVE.includes(s) ? resubBtn : rejectBtn];
  }
}
/** edit a saved history / log entry: its date and its text (new lines allowed), or delete it. Saves on Done. */
function editEntry(x, { textKey = 'text', title = 'Edit entry', dateKey = null } = {}) {
  const rec = D.getRec(x.id); if (!rec || !D.live(x.id)) return toast('This entry can’t be changed.');
  const isCmt = rec.k === 'cmt';
  const tKey = isCmt ? 'created' : 't';
  const when = new Date(D.val(rec, tKey, Date.now()));
  const dIso = dateKey && D.val(rec, dateKey) ? toISODate(parseDate(D.val(rec, dateKey))) : toISODate(when);
  const dt = h('input', { type: 'date', class: 'field', value: dIso, 'aria-label': 'Date' });
  const ta = h('textarea', { class: 'field entry-ta', rows: 5, 'aria-label': 'Text', enterkeyhint: 'enter' }); ta.value = D.val(rec, textKey, '') || '';
  let deleted = false;
  const del = h('button', { class: 'btn block danger', onclick: async () => { if (await confirmBox('Delete this entry?', 'Delete')) { deleted = true; D.trash(rec.id); s.close(); render(); } } }, 'Delete entry');
  const s = sheet(title, h('div', { class: 'entry-ed' }, h('label', { class: 'small muted' }, 'Date'), dt, h('label', { class: 'small muted' }, 'Text'), ta, del), {
    onDone: () => {
      if (deleted || !D.live(rec.id)) return;
      const patch = {}, txt = ta.value.replace(/\s+$/, '');
      if (txt !== (D.val(rec, textKey, '') || '')) patch[textKey] = txt;
      if (dt.value && dt.value !== dIso) {
        const nd = parseDate(dt.value);
        if (nd) { if (dateKey) patch[dateKey] = dt.value; const keep = new Date(nd); keep.setHours(when.getHours(), when.getMinutes(), when.getSeconds(), 0); patch[tKey] = keep.getTime(); }
      }
      if (Object.keys(patch).length) { D.update(rec.id, patch); toast('Entry updated'); render(); }
    } });
  setTimeout(() => ta.focus({ preventScroll: true }), 300);
}
function historyBlock(title, hist) {
  return h('details', { class: 'rhist', open: hist.length ? true : null },
    h('summary', {}, icon('chevd', 14), title + ' (' + hist.filter(x => x.ev === 'rejected').length + ' rejected)'),
    hist.length ? h('div', { class: 'rtable' }, h('div', { class: 'rr rhd' }, h('span', {}, '#'), h('span', {}, 'Date'), h('span', {}, 'Event'), h('span', {}, 'Reason / Remarks')),
      hist.map((x, i) => h('div', { class: 'rr editable', role: 'button', tabindex: '0', 'aria-label': 'Edit history entry ' + (i + 1), onclick: () => editEntry(x, { textKey: x.ev === 'rejected' ? 'reason' : (x.reason ? 'reason' : 'text'), title: 'Edit history entry', dateKey: 'date' }), onkeydown: e => { if (e.key === 'Enter') e.currentTarget.click(); } }, h('span', {}, i + 1), h('span', {}, dmy(x.date) || formatDate(new Date(x.t), 'DD/MM/YYYY')), h('span', {}, badge(x.ev === 'rejected' ? 'Rejected' : x.ev === 'approved' ? 'Approved' : 'Resubmitted', undefined, false)), h('span', { class: 'rtext' }, x.reason || x.text || h('span', { class: 'muted' }, '—'), h('span', { class: 'ehint', 'aria-hidden': 'true' }, icon('pencil', 13))))))
      : h('p', { class: 'muted small pad' }, 'No rejection record yet.'));
}

// ---------- ECX ----------
function ecxTab(row, info, n) {
  const xs = E.ecxOf(row.id);
  const add = async () => { const no = await promptBox('New ECX application', '', 'ECX number (you can add it later)'); if (no == null) return; E.addEcx(row, no.trim()); render(); };
  return h('div', { class: 'xlist' },
    h('div', { class: 'phbar out' }, h('h3', { class: 'ph' }, icon('filex', 17), 'ECX Applications', h('span', { class: 'hcount' }, xs.length)), h('button', { class: 'hnew sm', onclick: add }, icon('plus', 15), h('span', {}, 'Add ECX Application'))),
    xs.length ? xs.map(x => ecxCard(row, x)) : h('section', { class: 'hcard pcard' }, h('p', { class: 'hempty' }, 'No ECX application yet. A project can have several; each keeps its own rejection history.')),
    // the project's ECX Link (moved here from Documents), at the bottom of the ECX tab
    h('section', { class: 'hcard pcard' }, h('div', { class: 'kvs' }, kv('link', 'ECX Link', propVal(row, 'ECX Link')))));
}
function ecxCard(row, x) {
  const s = g(x, 'status') || '', xf = (key, label, extra = {}) => field(x, { key, label, ...extra });
  const reject = async () => { if (await rejectEcxFlow(row, x)) render(); };
  const resub = async () => { if (await resubmitEcxFlow(row, x)) render(); };
  const act = E.ECX_ACTIVE.includes(s);
  return h('section', { class: 'hcard pcard xcard' },
    h('div', { class: 'phbar' }, h('div', { class: 'ph' }, icon('filex', 17), xf('number', 'ECX number', { mono: true, ph: 'ECX number' }),
      h('button', { class: 'val fv', 'aria-label': 'ECX status: ' + (s || 'Not submitted'), onclick: ev => pick(ev.currentTarget, E.ECX_STATUS, s, v => { if (v === 'Rejected' && !act) reject(); else if (v === 'Resubmitted' && act) resub(); else if (v === 'Closed') { E.closeEcx(row, x); render(); } else { E.setEcxStatus(row, x, v); render(); } }) }, s ? badge(s) : h('span', { class: 'muted' }, 'Not submitted'), icon('chevd', 14))),
      h('div', { class: 'wfacts' },
        act ? h('button', { class: 'sbtn', onclick: resub }, icon('redo', 13), 'Resubmit') : null,
        !act ? h('button', { class: 'rbtn', onclick: reject }, icon('close', 13), 'Reject') : null,
        h('button', { class: 'c-act ebtn', 'aria-label': 'More for this ECX application', onclick: e => menu(e.currentTarget, [{ label: 'Delete application', icon: 'trash', danger: true, run: async () => { if (await confirmBox('Delete this ECX application? Its log entries stay in the Activity Log.', 'Delete')) { D.trash(x.id); E.log(row, 'ECX', (g(x, 'number') || 'ECX application') + ' deleted.'); render(); } } }]) }, icon('more', 18)))),
    h('div', { class: 'kvs two' },
      kv('date', 'Completed Date', xf('submitted', 'Completed date', { type: 'date' })),
      // no Reassigned Date: a reassignment gives the project a new Date Assigned / Due Date (a new KPI count)
      kv('date', 'Rejection Date', xf('rejected', 'Rejection date', { type: 'date' })),
      kv('list', 'Reason Category', xf('rcat', 'Reason category', { type: 'select', options: E.ECX_REASONS })),
      kv('text', 'Rejection Reason', xf('reason', 'Rejection reason'))),
    historyBlock('Rejection history', E.revisions(row, x.id)));
}

// ---------- Documents ----------
function docsTab(row, info) {
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
      // ECX Link lives at the bottom of the ECX tab; report-only projects have no ECX tab, so it stays here for them
      info && E.reportOnly(info.category) ? kv('link', 'ECX Link', propVal(row, 'ECX Link')) : null));
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
    h('ol', { class: 'alog' }, ev.map(x => h('li', String(x.id).startsWith('new') ? {} : { class: 'editable', role: 'button', tabindex: '0', 'aria-label': 'Edit log entry: ' + (x.text || '').slice(0, 40), onclick: () => editEntry(x, { title: 'Edit log entry', textKey: x.ev === 'rejected' && !x.text ? 'reason' : 'text' }), onkeydown: e => { if (e.key === 'Enter') e.currentTarget.click(); } }, h('time', {}, formatDate(new Date(x.t), 'DD/MM/YYYY'), h('small', {}, new Date(x.t).toTimeString().slice(0, 5))),
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
