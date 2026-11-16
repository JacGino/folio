// Folio v2 — linked records around each project (a row of the Planning KPI Tracker):
//   Customer → many Projects → many ECX applications; each Project also has Tasks, one ECPAR (with history),
//   one Work record (site survey, findings, loading, documents check, report, connection charge bill ref),
//   Document links and an Activity Log. Every field is stored as 'p:<key>' so the edit card works on all of them.
// Records made by the migration get the same id on every device, so two devices never make two copies.
import * as D from './data.js';
import * as DB from './db.js';
import { parseDate, dateAdd, dateBetween, startOfDay, toISODate } from './dates.js';

export const TASK_STATUS = ['Not Started', 'Pending', 'In Progress', 'Completed', 'On Hold'];
export const PRIORITY = ['High', 'Medium', 'Low'];
export const ECPAR_STATUS = ['Draft', 'Submitted', 'Pending Revision', 'In Revision', 'Ready to Resubmit', 'Resubmitted', 'Approved'];
export const ECPAR_ACTIVE = ['Pending Revision', 'In Revision', 'Ready to Resubmit']; // rejected, corrective action still outstanding
export const ECX_STATUS = ['Draft', 'Submitted', 'Pending Action', 'In Review', 'Ready to Resubmit', 'Resubmitted', 'Approved', 'Closed'];
export const ECX_ACTIVE = ['Pending Action', 'In Review', 'Ready to Resubmit'];
// rejection reason categories are picked when a rejection is recorded (never guessed from the text)
export const ECPAR_REASONS = ['Technical data issues', 'Drawing / layout issues', 'Load summary issues', 'Other'];
export const ECX_REASONS = ['Incomplete documents', 'Drawing not compliant', 'Additional information required', 'Revised documents required', 'Other'];
// customer supply details (Customer Information)
export const TARIFFS = ['Domestic', 'Commercial'];
export const APP_TYPES = ['Service Line', 'Underground'];
export const METER_TYPES = ['1-Phase', '3-Phase'];
export { PREMISE_TYPES } from './ccrates.js';
export const TASK_TYPES = ['ECX', 'ECPAR', 'Site Survey', 'Report', 'Other'];
const OLD_STATUS = { ecpar: { Rejected: 'Pending Revision' }, ecx: { Rejected: 'Pending Action', 'In Revision': 'In Review' } };
export const ACT_TYPES = ['Note', 'Site survey', 'Document check', 'ECPAR', 'ECX', 'Customer follow-up', 'Report'];

export const g = (r, k, d = null) => D.val(r, 'p:' + k, d);
const P = n => { const d = DB.kpiDb(); return d && DB.propByName(d, n); };
const rowVal = (row, n) => { const p = P(n); return p ? DB.value(row, p) : null; };
const setRow = (row, n, v) => { const p = P(n); if (p) D.update(row.id, { ['p:' + p.id]: v }); };
const shard = () => 'db:' + DB.kpiDb().id;
const hash = s => { let a = 5381; for (const c of s) a = ((a << 5) + a + c.charCodeAt(0)) >>> 0; return a.toString(36); };
export const custKey = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const today = now => toISODate(new Date(now));

/** make (or bring back) a record with a fixed id */
function ensure(k, id, fields) {
  const old = D.getRec(id);
  if (old) { if (!D.live(id)) D.restore(id); return old; }
  return D.create(k, shard(), { id, created: Date.now(), ...fields });
}

// ---------------- categories ----------------
export const reportOnly = cats => cats.length > 0 && cats.every(c => DB.REPORT_ONLY.includes(c));
export const categories = row => [].concat(rowVal(row, 'Project Category') || []);

// ---------------- customers ----------------
export const customers = () => D.all('cust');
export const customerOf = row => D.live(D.val(row, 'cust'));
export const projects = () => { const d = DB.kpiDb(); return d ? DB.rows(d.id) : []; };
export const projectsOf = custId => projects().filter(r => D.val(r, 'cust') === custId);

/** keep each project linked to the customer whose name it shows (also fixes links after a rename elsewhere) */
function linkCustomer(row) {
  const name = DB.title(row); if (!name || name === 'Untitled') return;
  const key = custKey(name), cur = customerOf(row);
  if (cur && custKey(g(cur, 'name')) === key) return;
  const same = customers().find(c => custKey(g(c, 'name')) === key);
  if (same) { D.update(row.id, { cust: same.id }); return; }
  if (cur && projectsOf(cur.id).length === 1) { D.update(cur.id, { 'p:name': name.trim() }); return; } // only project of that customer: the customer was renamed
  const c = ensure('cust', 'cu' + hash(key), { 'p:name': name.trim() });
  if (!g(c, 'name')) D.update(c.id, { 'p:name': name.trim() });
  if (!g(c, 'address') && rowVal(row, 'Address')) D.update(c.id, { 'p:address': rowVal(row, 'Address') });
  if (!g(c, 'map') && rowVal(row, 'Pin Location')) D.update(c.id, { 'p:map': rowVal(row, 'Pin Location') });
  D.update(row.id, { cust: c.id });
}
/** customer fields; name, address and pin are copied to every linked project so all lists stay the same */
export function setCustomer(c, key, v) {
  D.update(c.id, { ['p:' + key]: v });
  const prop = { name: DB.titleProp(DB.kpiDb())?.name, address: 'Address', map: 'Pin Location' }[key];
  if (prop) for (const r of projectsOf(c.id)) setRow(r, prop, v);
}
export const custAddress = (row, c = customerOf(row)) => (c && g(c, 'address')) || rowVal(row, 'Address') || '';
export const custMap = (row, c = customerOf(row)) => (c && g(c, 'map')) || rowVal(row, 'Pin Location') || '';

// ---------------- tasks ----------------
export const tasksOf = rowId => D.all('task', t => D.val(t, 'project') === rowId)
  .sort((a, b) => (g(a, 'status') === 'Completed') - (g(b, 'status') === 'Completed') || (g(a, 'due') || '9').localeCompare(g(b, 'due') || '9') || D.val(a, 'created', 0) - D.val(b, 'created', 0));
export function addTask(row, name, fields = {}) {
  const t = D.create('task', row.sh, { project: row.id, created: Date.now(), 'p:name': name, 'p:status': 'Not Started', 'p:priority': 'Medium', ...fields });
  log(row, 'Task', 'Task added: ' + name); return t;
}
export function completeTask(t, done, now = Date.now()) {
  D.update(t.id, { 'p:status': done ? 'Completed' : 'In Progress', 'p:done': done ? today(now) : null });
  const row = D.live(D.val(t, 'project')); if (row && done) log(row, 'Task', 'Task completed: ' + g(t, 'name', ''));
}
export const taskOpen = t => g(t, 'status') !== 'Completed';
export const taskDays = (t, now = Date.now()) => { const d = parseDate(g(t, 'due')); return d ? dateBetween(d, startOfDay(new Date(now)), 'days') : null; };
/** open tasks due today or earlier, from every open project, with their project and customer */
export function dueTasks(now = Date.now(), { within = 0 } = {}) {
  const out = [];
  for (const t of D.all('task', taskOpen)) {
    const row = D.live(D.val(t, 'project')); if (!row || D.val(row, 'db') !== DB.kpiDb()?.id) continue;
    const info = DB.kpiInfo(row, DB.kpiDb(), now); if (info.archived) continue;
    const days = taskDays(t, now); if (days == null || days > within) continue;
    out.push({ task: t, row, info, days, name: g(t, 'name', ''), customer: info.title });
  }
  return out.sort((a, b) => a.days - b.days);
}
/** the next open task of a project (earliest due date), for the Home "Task" column */
export const nextTask = rowId => tasksOf(rowId).find(taskOpen) || null;

// ---------------- work record (site survey and the other workflow steps) ----------------
export const workOf = row => D.live('wk' + row.id) || null;
export const work = row => ensure('work', 'wk' + row.id, { project: row.id });
export function surveyState(row, info = DB.kpiInfo(row, DB.kpiDb())) {
  const w = workOf(row);
  if (w && g(w, 'survey')) return 'done';
  if (info.status === 'Site Survey') return 'pending';
  if (['Estimation', 'To Amend', 'Done'].includes(info.status)) return 'done';
  return 'none';
}
/** survey state for the Pending Site Survey queue: Completed, Overdue (past the project's Due Date or a missed planned date), Scheduled or To Schedule */
export function surveyInfo(row, info, now = Date.now()) {
  const w = workOf(row), done = w && g(w, 'survey'), plan = w && g(w, 'scheduled');
  const t0 = startOfDay(new Date(now)), due = info.due, planD = parseDate(plan);
  const state = done ? 'Completed' : (due && due < t0) || (planD && planD < t0) ? 'Overdue' : plan ? 'Scheduled' : 'To Schedule';
  return { state, scheduled: plan || null, done: done || null, due, findings: w ? g(w, 'findings', '') : '' };
}
export function scheduleSurvey(row, date, note = '') {
  const w = work(row), was = g(w, 'scheduled');
  D.update(w.id, { 'p:scheduled': date });
  log(row, 'Site survey', (was ? 'Site survey rescheduled to ' : 'Site survey scheduled for ') + date.split('-').reverse().map(Number).join('/') + '.' + (note ? ' ' + note : ''), { ev: was ? 'rescheduled' : 'scheduled', date });
}
export function surveyFindings(row, text) {
  if (!text) return; const w = work(row); D.update(w.id, { 'p:findings': [g(w, 'findings'), text].filter(Boolean).join('\n') });
  log(row, 'Site survey', 'Site survey findings recorded. ' + text);
}
export function completeSurvey(row, date, now = Date.now()) {
  const w = work(row); D.update(w.id, { 'p:survey': date || today(now) });
  if (rowVal(row, 'Status') === 'Site Survey') setRow(row, 'Status', 'Estimation');
  log(row, 'Site survey', 'Site survey completed.', { t: parseDate(date)?.getTime() });
}

// ---------------- ECPAR: one per project ----------------
export const ecparOf = row => D.live('ep' + row.id) || null;
/** ECPAR version as shown: Z00 first, then Z01, Z02… after each resubmission (stored as 1, 2, 3…) */
export const ecparVersion = e => 'Z' + String(Math.max(0, (+g(e, 'version', 1) || 1) - 1)).padStart(2, '0');
export const ecpar = row => ensure('ecpar', 'ep' + row.id, { project: row.id, 'p:status': 'Draft', 'p:version': 1 });
/** what to show for ECPAR on a project (also understands rows rejected before ECPAR records existed) */
export function ecparStatus(row, info) {
  const e = ecparOf(row); if (e && g(e, 'status')) return g(e, 'status');
  return info && info.amend ? 'Pending Revision' : '';
}
/** reject: reason, its category (picked by you), the correction needed and remarks; earlier rejections stay in the history */
export function rejectEcpar(row, date, reason, { cat = '', correction = '', remarks = '' } = {}) {
  const e = ecpar(row);
  D.update(e.id, { 'p:status': 'Pending Revision', 'p:rejected': date, 'p:reason': reason || '', 'p:rcat': cat || null, 'p:correction': correction || '', ...(remarks ? { 'p:remarks': remarks } : {}) });
  setRow(row, 'ECPAR Rejected', date); setRow(row, 'Status', 'To Amend'); // Rejected ECPAR focus, alerts and the widget follow this
  log(row, 'ECPAR', 'ECPAR rejected.' + (reason ? ' ' + reason : ''), { ecpar: true, ev: 'rejected', date, reason, cat, correction });
}
export function resubmitEcpar(row, date, note) {
  const e = ecpar(row);
  D.update(e.id, { 'p:status': 'Resubmitted', 'p:resubmitted': date, 'p:version': (+g(e, 'version', 1) || 1) + 1 });
  if (rowVal(row, 'Status') === 'To Amend') setRow(row, 'Status', 'Estimation');
  log(row, 'ECPAR', 'Revised ECPAR resubmitted.' + (note ? ' ' + note : ''), { ecpar: true, ev: 'resubmitted', date, reason: note });
}
export function approveEcpar(row, date) {
  const e = ecpar(row); D.update(e.id, { 'p:status': 'Approved', 'p:approved': date });
  if (rowVal(row, 'Status') === 'To Amend') setRow(row, 'Status', 'Estimation');
  log(row, 'ECPAR', 'ECPAR approved.', { ecpar: true, ev: 'approved', date });
}
export function setEcparStatus(row, s) {
  const e = ecpar(row); const was = g(e, 'status'); if (was === s) return;
  D.update(e.id, { 'p:status': s }); if (s === 'Submitted' && !g(e, 'submitted')) D.update(e.id, { 'p:submitted': today(Date.now()) });
  // keep the project in (or out of) the Rejected ECPAR queue to match
  if (ECPAR_ACTIVE.includes(s) && rowVal(row, 'Status') !== 'To Amend') { setRow(row, 'Status', 'To Amend'); if (!rowVal(row, 'ECPAR Rejected') && g(e, 'rejected')) setRow(row, 'ECPAR Rejected', g(e, 'rejected')); }
  if (!ECPAR_ACTIVE.includes(s) && rowVal(row, 'Status') === 'To Amend') setRow(row, 'Status', 'Estimation');
  log(row, 'ECPAR', 'ECPAR status: ' + s + '.', { ecpar: true, ev: 'status' });
}

// ---------------- ECX: many per project ----------------
export const ecxOf = rowId => D.all('ecx', x => D.val(x, 'project') === rowId).sort((a, b) => D.val(a, 'created', 0) - D.val(b, 'created', 0));
export function addEcx(row, number = '') {
  const x = D.create('ecx', row.sh, { project: row.id, created: Date.now(), 'p:number': number, 'p:status': 'Draft' });
  log(row, 'ECX', 'ECX application added' + (number ? ': ' + number : '') + '.', { ecx: x.id }); return x;
}
const ecxName = x => g(x, 'number') || 'ECX application';
export function rejectEcx(row, x, date, reason, { cat = '', correction = '', remarks = '' } = {}) {
  D.update(x.id, { 'p:status': 'Pending Action', 'p:rejected': date, 'p:reason': reason || '', 'p:rcat': cat || null, 'p:correction': correction || '', ...(remarks ? { 'p:remarks': remarks } : {}) });
  log(row, 'ECX', ecxName(x) + ' rejected.' + (reason ? ' ' + reason : ''), { ecx: x.id, ev: 'rejected', date, reason, cat, correction });
}
export function closeEcx(row, x, note) {
  D.update(x.id, { 'p:status': 'Closed' });
  log(row, 'ECX', ecxName(x) + ' closed.' + (note ? ' ' + note : ''), { ecx: x.id, ev: 'closed' });
}
export function resubmitEcx(row, x, date, note) {
  D.update(x.id, { 'p:status': 'Resubmitted', 'p:resubmitted': date });
  log(row, 'ECX', ecxName(x) + ' resubmitted.' + (note ? ' ' + note : ''), { ecx: x.id, ev: 'resubmitted', date, reason: note });
}
export function approveEcx(row, x, date) {
  D.update(x.id, { 'p:status': 'Approved', 'p:approved': date });
  log(row, 'ECX', ecxName(x) + ' approved.', { ecx: x.id, ev: 'approved', date });
}
export function setEcxStatus(row, x, s) {
  if (g(x, 'status') === s) return; D.update(x.id, { 'p:status': s });
  if (s === 'Submitted' && !g(x, 'submitted')) D.update(x.id, { 'p:submitted': today(Date.now()) });
  log(row, 'ECX', ecxName(x) + ' status: ' + s + '.', { ecx: x.id, ev: 'status' });
}
/** rejected ECX applications of open projects; due the day after the rejection (same rule as ECPAR) */
export function rejectedEcx(now = Date.now()) {
  const dbr = DB.kpiDb(); if (!dbr) return [];
  const t0 = startOfDay(new Date(now)), out = [];
  for (const x of D.all('ecx', x => ECX_ACTIVE.includes(g(x, 'status')))) {
    const row = D.live(D.val(x, 'project')); if (!row || D.val(row, 'db') !== dbr.id) continue;
    const info = DB.kpiInfo(row, dbr, now); if (info.closed) continue;
    const rj = parseDate(g(x, 'rejected')); const due = rj ? dateAdd(rj, 1, 'days') : null;
    out.push({ ...info, due, days: due ? dateBetween(due, t0, 'days') : null, ecxDue: true, ecxId: x.id, ecx: g(x, 'number') || info.ecx, ecxReason: g(x, 'reason', '') });
  }
  return out;
}

// ---------------- documents ----------------
export const docsOf = rowId => D.all('doc', x => D.val(x, 'project') === rowId).sort((a, b) => D.val(a, 'created', 0) - D.val(b, 'created', 0));
export function addDoc(row, name, url) { const d = D.create('doc', row.sh, { project: row.id, created: Date.now(), 'p:name': name, 'p:url': url }); log(row, 'Document', 'Document added: ' + name); return d; }

// ---------------- activity log (entries are never changed by later status changes) ----------------
export function log(row, type, text, extra = {}) {
  const { t, ...rest } = extra;
  return D.create('act', row.sh, { project: row.id, created: Date.now(), t: t || Date.now(), type, text, ...rest });
}
/** project history: log entries, comments and the project's creation, oldest first */
export function history(row) {
  const ev = D.all('act', a => D.val(a, 'project') === row.id).map(a => ({ id: a.id, t: D.val(a, 't', 0), type: D.val(a, 'type', 'Note'), text: D.val(a, 'text', ''),
    ecx: D.val(a, 'ecx'), ecpar: D.val(a, 'ecpar'), ev: D.val(a, 'ev'), date: D.val(a, 'date'), reason: D.val(a, 'reason'), cat: D.val(a, 'cat'), correction: D.val(a, 'correction') }));
  for (const c of D.all('cmt', c => D.val(c, 'parent') === row.id)) ev.push({ id: c.id, t: D.val(c, 'created', 0), type: 'Comment', text: D.val(c, 'text', '') });
  const created = D.val(row, 'created', 0); if (created) ev.push({ id: 'new' + row.id, t: created, type: 'Project', text: 'Project created.' });
  return ev.sort((a, b) => a.t - b.t);
}
/** rejection and resubmission events of the ECPAR (ecx = null) or of one ECX application */
export const revisions = (row, ecxId = null) => history(row).filter(e => (ecxId ? e.ecx === ecxId : e.ecpar) && ['rejected', 'resubmitted', 'approved'].includes(e.ev));

// ---------------- progress and KPI ----------------
export function milestones(row, info = DB.kpiInfo(row, DB.kpiDb())) {
  const cats = info.category, rep = reportOnly(cats), w = workOf(row), done = info.finished || info.archived;
  const list = [];
  if (!rep && cats.length) list.push({ key: 'docs', label: 'Documents checked', done: !!(w && g(w, 'docs')), toggle: true });
  list.push({ key: 'survey', label: 'Site survey', done: surveyState(row, info) === 'done' });
  if (rep) list.push({ key: 'report', label: 'Report prepared', done: !!(w && g(w, 'report')), toggle: true });
  else {
    const e = ecparStatus(row, info); if (e) list.push({ key: 'ecpar', label: 'ECPAR submitted', done: !!g(ecparOf(row), 'submitted') || ['Submitted', 'Resubmitted', 'Approved'].includes(e) });
    const xs = ecxOf(row.id); if (xs.length) list.push({ key: 'ecx', label: 'ECX submitted', done: xs.every(x => !!g(x, 'submitted') || ['Submitted', 'Resubmitted', 'Approved', 'Closed'].includes(g(x, 'status'))) });
  }
  list.push({ key: 'done', label: 'Completed', done });
  return list;
}
export const progress = (row, info) => { const m = milestones(row, info); return Math.round(m.filter(x => x.done).length / m.length * 100); };
/** KPI: days from Date Assigned to Date Completed (or today); within KPI when 7 or fewer */
export function kpiDays(info, now = Date.now()) {
  if (!info.assigned) return null;
  const end = info.completed || startOfDay(new Date(now));
  return dateBetween(end, info.assigned, 'days');
}

// ---------------- migration: runs at start-up and after every sync; only writes what is missing ----------------
export function ensureModel() {
  const dbr = DB.kpiDb(); if (!dbr) return;
  for (const k of ['ecpar', 'ecx']) for (const r of D.all(k)) { const s = g(r, 'status'), to = OLD_STATUS[k][s]; if (to) D.update(r.id, { 'p:status': to }); }
  for (const row of DB.rows(dbr.id)) {
    linkCustomer(row);
    // one ECX application from the old "ECX & WBS NO" text, once per project
    const no = rowVal(row, 'ECX & WBS NO');
    if (no && !D.getRec('xm' + row.id) && !ecxOf(row.id).length) {
      const old = rowVal(row, 'ECX Rejected');
      D.create('ecx', row.sh, { id: 'xm' + row.id, project: row.id, created: D.val(row, 'created', Date.now()), 'p:number': String(no).split(/\n/)[0].trim(), 'p:status': old ? 'Pending Action' : 'Submitted', 'p:rejected': old ? toISODate(old) : null });
    }
    // projects rejected before ECPAR records existed
    const info = DB.kpiInfo(row, dbr);
    if (info.amend && !D.getRec('ep' + row.id)) D.create('ecpar', row.sh, { id: 'ep' + row.id, project: row.id, created: Date.now(), 'p:status': 'Pending Revision', 'p:rejected': info.rejected ? toISODate(info.rejected) : null, 'p:version': 1 });
  }
}

DB.setEcxSource(rejectedEcx);
/** everything the app needs in the data before showing it: new fields, categories, links */
export function ensureAll() {
  DB.upgradeAlert(); DB.mergeProjectRef(); try { DB.ensureHomeFields(); ensureModel(); } catch (e) { console.error(e); } }
