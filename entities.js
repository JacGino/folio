// Folio v2 — linked records around each project (a row of the Planning KPI Tracker):
//   Customer → many Projects → many ECX applications; each Project also has Tasks, one ECPAR (with history),
//   one Work record (site survey, findings, loading, documents check, report, connection charge bill ref),
//   Document links and an Activity Log. Every field is stored as 'p:<key>' so the edit card works on all of them.
// Records made by the migration get the same id on every device, so two devices never make two copies.
import * as D from './data.js';
import * as M from './model.js';
import * as DB from './db.js';
import { parseDate, dateAdd, dateBetween, startOfDay, toISODate } from './dates.js';

export const TASK_STATUS = ['Not Started', 'Pending', 'In Progress', 'Completed', 'On Hold'];
export const PRIORITY = ['High', 'Medium', 'Low'];
export const ECPAR_STATUS = ['Submitted', 'Pending Revision', 'Resubmitted'];
export const ECPAR_ACTIVE = ['Pending Revision']; // rejected, waiting for the resubmission
/** older ECPAR statuses, mapped onto the three kept ones (In Revision / Ready to Resubmit were steps of Pending Revision) */
const ECPAR_OLD = { 'In Revision': 'Pending Revision', 'Ready to Resubmit': 'Pending Revision' };
export const ECX_STATUS = ['Submitted', 'Rejected', 'Resubmitted', 'Closed'];
export const ECX_ACTIVE = ['Rejected']; // on the Rejected ECX page until resubmitted
// rejection reason categories are picked when a rejection is recorded (never guessed from the text)
export const ECPAR_REASONS = ['Technical data issues', 'Drawing / layout issues', 'Load summary issues', 'Other'];
export const ECX_REASONS = ['Incomplete documents', 'Drawing not compliant', 'Additional information required', 'Revised documents required', 'Other'];
// customer supply details (Customer Information)
export const TARIFFS = ['Domestic', 'Commercial'];
export const APP_TYPES = ['Service Line', 'Underground'];
export const METER_TYPES = ['1-Phase', '3-Phase'];
export { PREMISE_TYPES } from './ccrates.js';
export const TASK_TYPES = ['ECX', 'ECPAR', 'Site Survey', 'Report', 'Other'];
const OLD_STATUS = { ecpar: { Rejected: 'Pending Revision' }, ecx: { 'Pending Action': 'Rejected', 'In Review': 'Rejected', 'In Revision': 'Rejected', 'Ready to Resubmit': 'Rejected' } }; // older ECX statuses → Rejected
export const ACT_TYPES = ['Note', 'Site survey', 'Document check', 'ECPAR', 'ECX', 'Customer follow-up', 'Report'];

export const g = (r, k, d = null) => D.val(r, 'p:' + k, d);
const tv = v => String(v ?? '').trim();
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
// ---- Applicant ID (IC / company no.) of a single customer: its own field, not inside the name ----
// an IC / company no. has a digit (so "(M) SDN BHD" stays part of a name); several applicants keep "1) NAME (IC) 2) …" in the name
const IC_RE = /^(?=.*\d)[0-9A-Z][0-9A-Z.\-\/ ]{3,}$/i;
const MULTI_RE = /(?:^|\s)\d{1,2}\s*[).]\s+/g;
export const isMultiApplicant = t => (String(t || '').match(MULTI_RE) || []).length >= 2;
/** 'NAME (920522-13-6055)' → { name: 'NAME', ic: '920522-13-6055' }; otherwise { name, ic: '' } */
export function splitNameIc(t) {
  const s = String(t || '').trim(), m = s.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  return m && m[1].trim() && IC_RE.test(m[2].trim()) ? { name: m[1].trim(), ic: m[2].trim() } : { name: s, ic: '' };
}
/** the single customer's Applicant ID (IC No): shared by the Overview and the Long Text */
export const custIc = c => !c || isMultiApplicant(g(c, 'name')) ? '' : (g(c, 'ic') || splitNameIc(g(c, 'name')).ic || '');
export function setCustomerIc(c, ic) { if (c && !isMultiApplicant(g(c, 'name'))) D.update(c.id, { 'p:ic': String(ic || '').trim() || null }); }
/** once: a single customer saved as 'NAME (IC)' becomes name 'NAME' + Applicant ID 'IC' (project titles follow) */
function splitCustomerIcs() {
  for (const c of D.all('cust')) {
    const n = g(c, 'name'); if (!n || isMultiApplicant(n)) continue;
    const s = splitNameIc(n); if (!s.ic) continue;
    if (!g(c, 'ic')) D.update(c.id, { 'p:ic': s.ic });
    setCustomer(c, 'name', s.name);
  }
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
export const ecpar = row => ensure('ecpar', 'ep' + row.id, { project: row.id, 'p:version': 1, ...(v => v ? { 'p:ref': v } : {})(tv(rowVal(row, DB.REF_ECPAR))) });
/** what to show for ECPAR on a project (also understands rows rejected before ECPAR records existed) */
export function ecparStatus(row, info) {
  const e = ecparOf(row); if (e && g(e, 'status')) return g(e, 'status');
  return info && info.amend ? 'Pending Revision' : '';
}
/** reject: reason, its category (picked by you), the correction needed and remarks; earlier rejections stay in the history */
let ecparOp = false; // set while a button flow writes the ECPAR record, so the field links below don't act twice
const ecparLogs = (row, ev) => D.all('act', a => D.val(a, 'project') === row.id && D.val(a, 'ecpar') && D.val(a, 'ev') === ev).sort((a, b) => D.val(a, 't', 0) - D.val(b, 't', 0));
const sameDay = (a, b) => { const x = parseDate(a), y = parseDate(b); return !!x && !!y && +startOfDay(x) === +startOfDay(y); };
/** the rejection / resubmission currently on the ECPAR tab is kept in the Activity Log before it is replaced (dates typed in by hand included) */
function keepCycle(row, e) {
  const rj = g(e, 'rejected'), rs = g(e, 'resubmitted');
  if (rj && rs && parseDate(rj) <= parseDate(rs) && !ecparLogs(row, 'rejected').some(a => sameDay(D.val(a, 'date'), rj))) log(row, 'ECPAR', 'ECPAR rejected.', { ecpar: true, ev: 'rejected', date: rj, reason: g(e, 'correction', '') || g(e, 'reason', ''), t: (parseDate(rj) || new Date()).getTime() });
  if (rs && !ecparLogs(row, 'resubmitted').some(a => sameDay(D.val(a, 'date'), rs))) log(row, 'ECPAR', 'Revised ECPAR resubmitted.', { ecpar: true, ev: 'resubmitted', date: rs, t: (parseDate(rs) || new Date()).getTime() });
}
export function rejectEcpar(row, date, reason, { cat = '', correction = '', remarks = '' } = {}) {
  const e = ecpar(row); const text = correction || reason || '';
  ecparOp = true;
  try {
    if (g(e, 'resubmitted')) keepCycle(row, e); // a new rejection after a resubmission: the last round stays in the history
    D.update(e.id, { 'p:status': 'Pending Revision', 'p:rejected': date, 'p:resubmitted': null, 'p:correction': text, ...(reason ? { 'p:reason': reason } : {}), ...(cat ? { 'p:rcat': cat } : {}), ...(remarks ? { 'p:remarks': remarks } : {}) });
    setRow(row, 'ECPAR Rejected', date); setRow(row, 'Status', 'To Amend'); // Rejected ECPAR focus, alerts and the widget follow this
    log(row, 'ECPAR', 'ECPAR rejected.' + (text ? ' ' + text : ''), { ecpar: true, ev: 'rejected', date, reason: text, cat, correction: text });
  } finally { ecparOp = false; }
}
export function resubmitEcpar(row, date, note) {
  const e = ecpar(row);
  ecparOp = true;
  try {
    D.update(e.id, { 'p:status': 'Resubmitted', 'p:resubmitted': date, 'p:version': (+g(e, 'version', 1) || 1) + 1 });
    if (rowVal(row, 'Status') === 'To Amend') setRow(row, 'Status', 'Estimation');
    log(row, 'ECPAR', 'Revised ECPAR resubmitted.' + (note ? ' ' + note : ''), { ecpar: true, ev: 'resubmitted', date, reason: note });
  } finally { ecparOp = false; }
}
// ECPAR tab fields and its status are linked:
//   Rejection Date typed in   → Pending Revision, and the project goes To Amend (a new rejection, like the Reject button)
//   Resubmission Date typed in → Resubmitted, and the project leaves To Amend (like the Resubmit button)
//   Submission Date typed in   → Submitted (when nothing later has happened); cleared → no status
D.onChange(info => {
  if (ecparOp || info.type !== 'update' || !info.fields) return;
  const e = D.getRec(info.id); if (!e || e.k !== 'ecpar') return;
  const row = D.live(D.val(e, 'project')); if (!row) return;
  const has = k => info.fields.includes('p:' + k), st = g(e, 'status') || '';
  const lastLog = ev => { const l = ecparLogs(row, ev); return l[l.length - 1]; };
  ecparOp = true;
  try {
    if (has('rejected')) {
      const rj = g(e, 'rejected');
      const rs0 = g(e, 'resubmitted');
      if (rj && st !== 'Pending Revision' && rs0 && parseDate(rj) <= parseDate(rs0)) { // a whole round typed in (rejected, then resubmitted)
        keepCycle(row, e); D.update(e.id, { 'p:status': 'Resubmitted' }); setRow(row, 'ECPAR Rejected', rj);
      } else if (rj && st !== 'Pending Revision') { // a new rejection
        ecparOp = false; rejectEcpar(row, rj, '', { correction: g(e, 'correction', '') }); ecparOp = true;
      } else if (rj) { // the date of the open rejection corrected
        setRow(row, 'ECPAR Rejected', rj); const l = lastLog('rejected'); if (l) D.update(l.id, { date: rj });
      } else if (st === 'Pending Revision') { // rejection date cleared: not rejected after all
        const l = lastLog('rejected'), r = lastLog('resubmitted'); if (l && (!r || D.val(r, 't', 0) < D.val(l, 't', 0))) D.trash(l.id);
        D.update(e.id, { 'p:status': g(e, 'submitted') ? 'Submitted' : null }); setRow(row, 'ECPAR Rejected', null);
        if (rowVal(row, 'Status') === 'To Amend') setRow(row, 'Status', 'Estimation');
      }
    }
    if (has('resubmitted')) {
      const rs = g(e, 'resubmitted'), rj = g(e, 'rejected');
      if (rs && g(e, 'status') === 'Pending Revision') { ecparOp = false; resubmitEcpar(row, rs); ecparOp = true; }
      else if (rs && g(e, 'status') === 'Resubmitted') { const l = lastLog('resubmitted'); if (l) D.update(l.id, { date: rs }); }
      else if (!rs && g(e, 'status') === 'Resubmitted' && rj) { // resubmission cleared: back to waiting
        const l = lastLog('resubmitted'); if (l) D.trash(l.id);
        D.update(e.id, { 'p:status': 'Pending Revision', 'p:version': Math.max(1, (+g(e, 'version', 1) || 1) - 1) }); setRow(row, 'Status', 'To Amend');
      }
    }
    if (has('submitted')) {
      const sd = g(e, 'submitted'), now = g(e, 'status') || '';
      if (sd && !now) D.update(e.id, { 'p:status': 'Submitted' });
      else if (!sd && now === 'Submitted') D.update(e.id, { 'p:status': null });
    }
  } catch (err) { console.error(err); } finally { ecparOp = false; }
});
/** once: old ECPAR statuses onto Submitted / Pending Revision / Resubmitted (Draft → none, or Submitted when there is a Submission Date) */
export function migrateEcparStatus() {
  ecparOp = true;
  try {
    for (const e of D.all('ecpar')) {
      const st = g(e, 'status') || ''; let to = st;
      if (ECPAR_OLD[st]) to = ECPAR_OLD[st];
      else if (st === 'Draft' || st === 'Approved' || (!st && g(e, 'submitted'))) to = g(e, 'resubmitted') && st === 'Approved' ? 'Resubmitted' : g(e, 'submitted') ? 'Submitted' : '';
      if (to !== st) D.update(e.id, { 'p:status': to || null });
    }
  } finally { ecparOp = false; }
}
/** every ECPAR rejection of a project, oldest first: { rejected, resubmitted, reason, cat, days } — from the Activity Log,
 *  plus the ECPAR tab's current dates when they were typed in directly. days = Resubmission Date − Rejection Date (null while waiting). */
export function ecparCycles(row) {
  const evs = D.all('act', a => D.val(a, 'project') === row.id && D.val(a, 'ecpar') && ['rejected', 'resubmitted', 'approved'].includes(D.val(a, 'ev')) && D.val(a, 'date'))
    .map(a => ({ ev: D.val(a, 'ev'), d: parseDate(D.val(a, 'date')), reason: D.val(a, 'reason') || '', cat: D.val(a, 'cat') || '', t: D.val(a, 't', 0) }))
    .filter(e => e.d).sort((a, b) => a.d - b.d || a.t - b.t);
  const out = [];
  for (const e of evs) {
    if (e.ev === 'rejected') out.push({ rejected: startOfDay(e.d), resubmitted: null, reason: e.reason, cat: e.cat });
    else if (e.ev === 'resubmitted') { const c = [...out].reverse().find(c => !c.resubmitted && c.rejected <= startOfDay(e.d)); if (c) c.resubmitted = startOfDay(e.d); }
  }
  const ep = D.live('ep' + row.id);
  if (ep) { const rj = parseDate(g(ep, 'rejected')), rs = parseDate(g(ep, 'resubmitted'));
    if (rj) { let c = out.find(c => +c.rejected === +startOfDay(rj)); if (!c) { c = { rejected: startOfDay(rj), resubmitted: null, reason: g(ep, 'correction', '') || g(ep, 'reason', ''), cat: g(ep, 'rcat', '') || '' }; out.push(c); out.sort((a, b) => a.rejected - b.rejected); }
      if (rs && !c.resubmitted && startOfDay(rs) >= c.rejected) c.resubmitted = startOfDay(rs); } }
  for (const c of out) c.days = c.resubmitted ? dateBetween(c.resubmitted, c.rejected, 'days') : null;
  return out;
}
export function approveEcpar(row, date) {
  const e = ecpar(row); D.update(e.id, { 'p:status': 'Approved', 'p:approved': date });
  if (rowVal(row, 'Status') === 'To Amend') setRow(row, 'Status', 'Estimation');
  log(row, 'ECPAR', 'ECPAR approved.', { ecpar: true, ev: 'approved', date });
}
export function setEcparStatus(row, s) {
  const e = ecpar(row); const was = g(e, 'status'); if (was === s) return;
  ecparOp = true;
  try {
    D.update(e.id, { 'p:status': s }); if (s === 'Submitted' && !g(e, 'submitted')) D.update(e.id, { 'p:submitted': today(Date.now()) }); // Submitted ⇄ Submission Date
    // keep the project in (or out of) the Rejected ECPAR queue to match
    if (ECPAR_ACTIVE.includes(s) && rowVal(row, 'Status') !== 'To Amend') { setRow(row, 'Status', 'To Amend'); if (!rowVal(row, 'ECPAR Rejected') && g(e, 'rejected')) setRow(row, 'ECPAR Rejected', g(e, 'rejected')); }
    if (!ECPAR_ACTIVE.includes(s) && rowVal(row, 'Status') === 'To Amend') setRow(row, 'Status', 'Estimation');
    log(row, 'ECPAR', 'ECPAR status: ' + s + '.', { ecpar: true, ev: 'status' });
  } finally { ecparOp = false; }
}

// ---------------- ECX: many per project ----------------
export const ecxOf = rowId => (D.memo('ecxByProject', () => { const m = new Map(); for (const x of D.all('ecx')) { const k = D.val(x, 'project'); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } for (const a of m.values()) a.sort((a, b) => D.val(a, 'created', 0) - D.val(b, 'created', 0)); return m; }).get(rowId) || []).slice();
export function addEcx(row, number = '') {
  const x = D.create('ecx', row.sh, { project: row.id, created: Date.now(), 'p:number': number });
  log(row, 'ECX', 'ECX application added' + (number ? ': ' + number : '') + '.', { ecx: x.id }); return x;
}
const ecxName = x => g(x, 'number') || 'ECX application';
let ecxOp = false; // set while the Reject button writes the card, so the field link below does not act twice
export function rejectEcx(row, x, date, reason, { cat = '', correction = '', remarks = '' } = {}) {
  ecxOp = true;
  try {
    D.update(x.id, { 'p:status': 'Rejected', 'p:rejected': date, 'p:reason': reason || '', 'p:rcat': cat || null, 'p:correction': correction || '', ...(remarks ? { 'p:remarks': remarks } : {}) });
    log(row, 'ECX', ecxName(x) + ' rejected.' + (reason ? ' ' + reason : ''), { ecx: x.id, ev: 'rejected', date, reason, cat, correction });
  } finally { ecxOp = false; }
}
// ECX card ⇄ rejection: typing a Rejection Date marks the application Rejected and records it in its Rejection history
// (like the Reject button); editing the reason or category afterwards updates that history entry
D.onChange(info => {
  if (ecxOp || info.type !== 'update' || !info.fields) return;
  const x = D.getRec(info.id); if (!x || x.k !== 'ecx') return;
  const row = D.live(D.val(x, 'project')); if (!row) return;
  const has = k => info.fields.includes('p:' + k), rj = g(x, 'rejected'), st = g(x, 'status') || '';
  const last = () => D.all('act', a => D.val(a, 'ecx') === x.id && D.val(a, 'ev') === 'rejected').sort((a, b) => D.val(b, 't', 0) - D.val(a, 't', 0))[0];
  ecxOp = true;
  try {
    if (has('rejected') && rj && !ECX_ACTIVE.includes(st) && st !== 'Closed') { ecxOp = false; rejectEcx(row, x, rj, g(x, 'reason', ''), { cat: g(x, 'rcat') || '' }); ecxOp = true; }
    else if (ECX_ACTIVE.includes(st) && (has('reason') || has('rcat') || has('rejected'))) { const l = last(); if (l) D.update(l.id, { reason: g(x, 'reason', ''), cat: g(x, 'rcat') || '', ...(rj ? { date: rj } : {}) }); }
  } catch (e) { console.error(e); } finally { ecxOp = false; }
});
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
    const info = DB.kpiInfo(row, dbr, now); if (info.archived || info.status === 'Done') continue; // Status Rejected = the ECX is rejected: it stays on this page
    // no due date: an ECX rejection ends the ECX KPI (Rejection Date − Date Assigned), so a rejected ECX is never due or overdue
    out.push({ ...info, due: null, days: null, ecxDue: true, ecxId: x.id, ecx: g(x, 'number') || info.ecx, ecxReason: g(x, 'reason', '') });
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
    const xs = ecxOf(row.id); if (xs.length) list.push({ key: 'ecx', label: 'ECX submitted', done: xs.every(x => !!g(x, 'submitted') || ['Submitted', 'Resubmitted', 'Closed'].includes(g(x, 'status'))) });
  }
  list.push({ key: 'done', label: 'Completed', done });
  return list;
}
export const progress = (row, info) => { const m = milestones(row, info); return Math.round(m.filter(x => x.done).length / m.length * 100); };
/** KPI: days from Date Assigned (or the ECX Reassigned Date) to the ECX Completed / Rejection Date (or Date Completed, or today); within KPI when 7 or fewer */
export function kpiDays(info, now = Date.now()) {
  const start = info.kpiStart || info.assigned; if (!start) return null;
  const end = info.completed || startOfDay(new Date(now));
  return dateBetween(end, start, 'days');
}

// ---------------- migration: runs at start-up and after every sync; only writes what is missing ----------------
export function ensureModel() {
  const dbr = DB.kpiDb(); if (!dbr) return;
  for (const k of ['ecpar', 'ecx']) for (const r of D.all(k)) { const s = g(r, 'status'), to = OLD_STATUS[k][s]; if (to) D.update(r.id, { 'p:status': to }); }
  // ECX Draft / Approved are gone: Draft → Submitted when it has a Completed Date (else no status); Approved → Resubmitted / Submitted (never Closed: that would close the project)
  for (const x of D.all('ecx', x => ['Draft', 'Approved'].includes(g(x, 'status')))) D.update(x.id, { 'p:status': g(x, 'status') === 'Approved' ? (g(x, 'resubmitted') ? 'Resubmitted' : 'Submitted') : g(x, 'submitted') ? 'Submitted' : null });
  for (const row of DB.rows(dbr.id)) {
    linkCustomer(row);
    // one ECX application from the Reference No (ECX No), once per project
    const no = rowVal(row, DB.REF_ECX);
    if (no && !D.getRec('xm' + row.id) && !ecxOf(row.id).length) {
      const old = rowVal(row, 'ECX Rejected');
      D.create('ecx', row.sh, { id: 'xm' + row.id, project: row.id, created: D.val(row, 'created', Date.now()), 'p:number': String(no).split(/\n/)[0].trim(), 'p:status': old ? 'Rejected' : 'Submitted', 'p:rejected': old ? toISODate(old) : null });
    }
    // projects rejected before ECPAR records existed
    const info = DB.kpiInfo(row, dbr);
    if (info.amend && !D.getRec('ep' + row.id)) D.create('ecpar', row.sh, { id: 'ep' + row.id, project: row.id, created: Date.now(), 'p:status': 'Pending Revision', 'p:rejected': info.rejected ? toISODate(info.rejected) : null, 'p:version': 1 });
  }
}

DB.setEcxSource(rejectedEcx);
/** everything the app needs in the data before showing it: new fields, categories, links */
/** Reference No (ECX No) ↔ the ECX application's number (when the project has one application);
 *  Project Reference (ECPAR No) ↔ the ECPAR record's reference. Whichever is changed, the other follows straight away. */
export const REF_ECX = DB.REF_ECX, REF_ECPAR = DB.REF_ECPAR;
const refProp = n => { const d = DB.kpiDb(); return d && DB.propByName(d, n); };
let syncing = false;
function linkRefs(info) {
  if (syncing || info.type !== 'update' || !info.fields) return;
  const rec = D.getRec(info.id); if (!rec) return;
  syncing = true;
  try {
    const k = rec.k, pe = refProp(REF_ECX), pp = refProp(REF_ECPAR);
    if (k === 'ecpar' && info.fields.includes('p:ref') && pp) { const row = D.getRec(D.val(rec, 'project')); if (row && tv(D.val(row, 'p:' + pp.id)) !== tv(g(rec, 'ref'))) D.update(row.id, { ['p:' + pp.id]: tv(g(rec, 'ref')) || null }); }
    else if (k === 'ecx' && info.fields.includes('p:number') && pe) { const row = D.getRec(D.val(rec, 'project')); if (row && ecxOf(row.id).length === 1 && tv(D.val(row, 'p:' + pe.id)) !== tv(g(rec, 'number'))) D.update(row.id, { ['p:' + pe.id]: tv(g(rec, 'number')) || null }); }
    else if (k === 'row') {
      if (pp && info.fields.includes('p:' + pp.id)) { const v = tv(D.val(rec, 'p:' + pp.id)), ep = ecparOf(rec); if (ep && tv(g(ep, 'ref')) !== v) D.update(ep.id, { 'p:ref': v || null }); }
      if (pe && info.fields.includes('p:' + pe.id)) { const v = tv(D.val(rec, 'p:' + pe.id)), xs = ecxOf(rec.id);
        if (xs.length === 1 && tv(g(xs[0], 'number')) !== v) D.update(xs[0].id, { 'p:number': v || null });
        else if (!xs.length && v && !D.getRec('xm' + rec.id)) D.create('ecx', rec.sh, { id: 'xm' + rec.id, project: rec.id, created: Date.now(), 'p:number': v.split(/\n/)[0].trim(), 'p:status': 'Submitted' }); } // quietly, like the start-up migration
    }
  } catch (e) { console.error(e); } finally { syncing = false; }
}
D.onChange(linkRefs);
/** the project's Status set to Rejected means its ECX was rejected: the latest ECX application becomes Rejected, so it shows on the Rejected ECX page */
export function ecxRejectedFromStatus(row) {
  const xs = ecxOf(row.id), x = xs[xs.length - 1]; if (!x) return false; // no ECX application yet: try again later
  const st = g(x, 'status');
  if (ECX_ACTIVE.includes(st) || st === 'Closed') return true;
  // the Rejection Date: the ECX's own, else the day the project's Status was set to Rejected
  const d = DB.kpiDb(), sp = d && DB.propByName(d, 'Status'), f = sp && row.f && row.f['p:' + sp.id];
  const ms = f && f.ts ? M.tsMs(f.ts) : 0, date = g(x, 'rejected') || today(ms > 0 ? ms : Date.now()); // field change times are encoded clock strings
  D.update(x.id, { 'p:status': 'Rejected', 'p:rejected': date });
  log(row, 'ECX', ecxName(x) + ' rejected (project status Rejected).', { ecx: x.id, ev: 'rejected', date });
  return true; // handled: true means the project's ECX now follows its status (done once)
}
/** project Done = its ECX is closed: the latest ECX application becomes Closed */
export function ecxClosedFromStatus(row) {
  const xs = ecxOf(row.id), x = xs[xs.length - 1]; if (!x) return false;
  if (g(x, 'status') === 'Closed') return true;
  D.update(x.id, { 'p:status': 'Closed' });
  log(row, 'ECX', ecxName(x) + ' closed (project status Done).', { ecx: x.id, ev: 'closed' });
  return true;
}
/** Done projects go straight to the archive (the Archive box is ticked) */
function archiveRow(row) { const d = DB.kpiDb(), ap = d && DB.propByName(d, 'Archive'); if (ap && D.val(row, 'p:' + ap.id) !== true) D.update(row.id, { ['p:' + ap.id]: true }); }
function setRowStatus(row, st) { const d = DB.kpiDb(), sp = d && DB.propByName(d, 'Status'); if (sp && String(D.val(row, 'p:' + sp.id) || '').trim() !== st) { D.update(row.id, { ['p:' + sp.id]: st }); log(row, 'Status', 'Status: ' + st + ' (from the ECX).'); } }
// the project's Status and its ECX are linked both ways:
//   project Rejected → ECX Rejected
//   project Done     ⇄ ECX Closed — and a Done project is archived
let statusSync = false;
D.onChange(info => {
  if (statusSync || info.type !== 'update' || !info.fields) return;
  const rec = D.getRec(info.id), d = DB.kpiDb(); if (!rec || !d) return;
  const sp = DB.propByName(d, 'Status'); if (!sp) return;
  statusSync = true;
  try {
    if (rec.k === 'row' && D.val(rec, 'db') === d.id && info.fields.includes('p:' + sp.id)) {
      const st = String(D.val(rec, 'p:' + sp.id) || '').trim();
      if (st === 'Rejected') { if (ecxRejectedFromStatus(rec)) D.update(rec.id, { ecxrej: 1 }); }
      else if (st === 'Done') { if (ecxClosedFromStatus(rec)) D.update(rec.id, { ecxdone: 1 }); archiveRow(rec); D.update(rec.id, { donearch: 1 }); }
    } else if (rec.k === 'ecx' && info.fields.includes('p:status')) {
      const row = D.live(D.val(rec, 'project')); if (!row || D.val(row, 'db') !== d.id) return;
      const xs = ecxOf(row.id); if (xs[xs.length - 1] !== rec && xs[xs.length - 1].id !== rec.id) return; // only the latest application drives the project
      const st = g(rec, 'status');
      if (st === 'Closed') { setRowStatus(row, 'Done'); archiveRow(row); D.update(row.id, { ecxdone: 1, donearch: 1 }); }
    }
  } catch (e) { console.error(e); } finally { statusSync = false; }
});
/** at start-up and after a sync: fill whichever side is empty; when both differ, the ECPAR record and the project's ECX No win */
export function syncRefs() {
  const d = DB.kpiDb(); if (!d) return;
  const pe = DB.propByName(d, REF_ECX), pp = DB.propByName(d, REF_ECPAR);
  syncing = true;
  try {
    for (const r of DB.rows(d.id)) {
      if (pp) { const ep = ecparOf(r), c = tv(ep && g(ep, 'ref')), m = tv(D.val(r, 'p:' + pp.id));
        if (c && c !== m) D.update(r.id, { ['p:' + pp.id]: c }); else if (ep && !c && m) D.update(ep.id, { 'p:ref': m }); }
      if (pe) { const xs = ecxOf(r.id), m = tv(D.val(r, 'p:' + pe.id));
        if (xs.length === 1) { const c = tv(g(xs[0], 'number')); if (m && c !== m) D.update(xs[0].id, { 'p:number': m }); else if (!m && c) D.update(r.id, { ['p:' + pe.id]: c }); } }
    }
  } finally { syncing = false; }
}
function syncRejectedStatus() {
  const d = DB.kpiDb(); if (!d) return; const sp = DB.propByName(d, 'Status'); if (!sp) return;
  statusSync = true;
  try { for (const r of DB.rows(d.id)) {
    const st = String(D.val(r, 'p:' + sp.id) || '').trim();
    if (!D.val(r, 'ecxrej') && st === 'Rejected') { if (ecxRejectedFromStatus(r)) D.update(r.id, { ecxrej: 1 }); }
    if (st === 'Done') { // once each: older Done projects get their ECX closed (when they have one) and are archived
      if (!D.val(r, 'ecxdone') && ecxClosedFromStatus(r)) D.update(r.id, { ecxdone: 1 });
      if (!D.val(r, 'donearch')) { archiveRow(r); D.update(r.id, { donearch: 1 }); } }
  } }
  finally { statusSync = false; }
}
export function ensureAll() {
  DB.upgradeAlert(); DB.mergeProjectRef(); try { DB.ensureHomeFields(); ensureModel(); } catch (e) { console.error(e); }
  try { syncRejectedStatus(); } catch (e) { console.error(e); }
  try { migrateEcparStatus(); } catch (e) { console.error(e); }
  try { splitCustomerIcs(); } catch (e) { console.error(e); }
  try { syncRefs(); } catch (e) { console.error(e); } }
