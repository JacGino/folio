// Folio v2 — shared project facts for Timeline, Board, Reports, KPI (and Home).
// One place decides: project stage, delivery state (On Track / Due ≤ 2 Days / Overdue / Completed),
// KPI start and completion dates per category, calendar or working days, turnaround and Within 7 Days.
import * as D from './data.js';
import * as DB from './db.js';
import * as E from './entities.js';
import { parseDate, startOfDay, toISODate } from './dates.js';

// ---------- categories (fixed order; colours from the validated reference palette, never cycled) ----------
export const CAT_ORDER = ['SAL100KW', 'Temporary Supply', 'Upgrading of Supply', 'Non Turnkey', 'Substation Site Enquiry', 'Turnkey Stage 1', 'Turnkey Stage 2', 'NEM Solar'];
export const CODE = { SAL100KW: 'SAL100KW', 'Temporary Supply': 'TOS', 'Upgrading of Supply': 'UOS', 'Non Turnkey': 'NTK', 'Substation Site Enquiry': 'SSE', 'Turnkey Stage 1': 'TK1', 'Turnkey Stage 2': 'TK2', 'NEM Solar': 'NEM Solar', Other: 'Other' };
export const CAT_COLOR = { SAL100KW: '#2a78d6', 'Temporary Supply': '#eb6834', 'Upgrading of Supply': '#1baf7a', 'Non Turnkey': '#eda100', 'Substation Site Enquiry': '#e87ba4', 'Turnkey Stage 1': '#008300', 'Turnkey Stage 2': '#6250d6', 'NEM Solar': '#e34948', Other: '#9B9A97' };
export const CAT_COLOR_DARK = { SAL100KW: '#3987e5', 'Temporary Supply': '#d95926', 'Upgrading of Supply': '#199e70', 'Non Turnkey': '#c98500', 'Substation Site Enquiry': '#d55181', 'Turnkey Stage 1': '#0ca30c', 'Turnkey Stage 2': '#9085e9', 'NEM Solar': '#e66767', Other: '#8a8986' };
export const catColor = c => (matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? CAT_COLOR_DARK : CAT_COLOR)[c] || CAT_COLOR.Other;
/** the one category a project is grouped under (first in the fixed order), or 'Other' */
export const mainCat = cats => CAT_ORDER.find(c => cats.includes(c)) || 'Other';
export const isReportOnly = cats => E.reportOnly(cats);

// ---------- KPI rules (synced workspace setting) ----------
export const END_EVENTS = { completed: 'Date Completed', survey: 'Site survey completed', report: 'Report prepared', ecpar: 'ECPAR submitted' };
export const DEFAULT_RULES = { days: 'calendar', start: 'assigned', end: Object.fromEntries(CAT_ORDER.map(c => [c, 'completed'])), confirmed: false };
let rules = DEFAULT_RULES;
export const kpiRules = () => rules;
export function setKpiRules(r) { rules = { ...DEFAULT_RULES, ...(r || {}), end: { ...DEFAULT_RULES.end, ...((r || {}).end || {}) } }; }
export const endOptions = cat => isReportOnly([cat]) ? ['completed', 'survey', 'report'] : ['completed', 'ecpar'];

// ---------- day counting ----------
/** days from a to b: calendar days, or working days (Monday–Friday; public holidays are not known to the app) */
export function dayCount(a, b, mode = rules.days) {
  const s = startOfDay(a), e = startOfDay(b);
  if (mode !== 'working') return Math.round((e - s) / 864e5);
  const sign = e >= s ? 1 : -1; let n = 0;
  for (let d = new Date(sign > 0 ? s : e); d < (sign > 0 ? e : s);) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) n++; }
  return n * sign;
}

// ---------- dates from records (never invented) ----------
const val = (row, n) => { const p = DB.propByName(DB.kpiDb(), n); return p ? DB.value(row, p) : null; };
const lastLog = (row, type, re) => { const a = E.history(row).filter(e => e.type === type && (!re || re.test(e.text))).pop(); return a ? new Date(a.t) : null; };
export function eventDates(row) {
  const w = E.workOf(row), ep = E.ecparOf(row);
  return {
    assigned: val(row, 'Date Assigned') || null, due: val(row, 'Due Date') || null, completed: val(row, 'Date Completed') || null,
    survey: w && E.g(w, 'survey') ? parseDate(E.g(w, 'survey')) : null, surveyPlan: w && E.g(w, 'scheduled') ? parseDate(E.g(w, 'scheduled')) : null,
    report: w && E.g(w, 'report') ? lastLog(row, 'Report', /report/i) : null,
    ecparSubmitted: ep && E.g(ep, 'submitted') ? parseDate(E.g(ep, 'submitted')) : null, ecparApproved: ep && E.g(ep, 'approved') ? parseDate(E.g(ep, 'approved')) : null,
  };
}
/** every milestone with a recorded date (for the Timeline) */
export function milestones(row) {
  const ev = eventDates(row), out = [], add = (d, type, label, extra = {}) => { if (d) out.push({ d: startOfDay(d), type, label, ...extra }); };
  add(ev.survey, 'survey', 'Site survey completed');
  if (ev.report) add(ev.report, 'report', 'Report submitted');
  const rep = E.reportOnly([].concat(val(row, 'Project Category') || []));
  if (!rep) {
    add(ev.ecparSubmitted, 'ecpar', 'ECPAR submitted');
    for (const x of E.revisions(row)) add(parseDate(x.date) || new Date(x.t), x.ev === 'rejected' ? 'reject' : 'ecpar', 'ECPAR ' + x.ev + (x.reason ? ': ' + x.reason : ''));
    for (const x of E.ecxOf(row.id)) {
      const no = E.g(x, 'number') || 'ECX';
      add(parseDate(E.g(x, 'submitted')), 'ecx', no + ' submitted');
      for (const r of E.revisions(row, x.id)) add(parseDate(r.date) || new Date(r.t), r.ev === 'rejected' ? 'reject' : 'ecx', no + ' ' + r.ev + (r.reason ? ': ' + r.reason : ''));
    }
  }
  add(ev.completed, 'done', 'Project completed');
  return out.sort((a, b) => a.d - b.d);
}

// ---------- one project, everything the pages need ----------
const PRI = { High: 0, Medium: 1, Low: 2 };
export function facts(row, now = Date.now()) {
  const dbr = DB.kpiDb(), info = DB.kpiInfo(row, dbr, now), ev = eventDates(row), t0 = startOfDay(new Date(now));
  const cats = info.category, cat = mainCat(cats), rep = isReportOnly(cats);
  const done = info.finished || info.archived && !!ev.completed;
  const dueDays = ev.due ? Math.round((startOfDay(ev.due) - t0) / 864e5) : null;
  const state = done ? 'Completed' : info.archived ? 'Archived' : dueDays != null && dueDays < 0 ? 'Overdue' : dueDays != null && dueDays <= 2 ? 'Due ≤ 2 Days' : 'On Track';
  // workflow stage (shown inside Board cards)
  const ep = E.ecparOf(row), epS = ep ? E.g(ep, 'status') : '', xs = E.ecxOf(row.id), sv = E.surveyState(row, info), w = E.workOf(row);
  let stage;
  if (done) stage = 'Completed';
  else if (info.status === 'On Hold' || info.status === 'Rejected') stage = info.status === 'Rejected' ? 'Rejected' : 'On Hold';
  else if (sv === 'pending' || info.status === 'Site Survey') stage = 'Site Survey';
  else if (rep) stage = w && E.g(w, 'report') ? 'In Progress' : 'Report';
  else if (info.status === 'To Amend' || (ep && epS !== 'Approved')) stage = 'ECPAR';
  else if (xs.some(x => !['Approved', 'Closed'].includes(E.g(x, 'status')))) stage = 'ECX';
  else stage = 'In Progress';
  // KPI
  const start = ev.assigned ? startOfDay(ev.assigned) : null;
  const endKey = rules.end[cat] || 'completed';
  const endDate = { completed: ev.completed, survey: ev.survey, report: ev.report, ecpar: ev.ecparSubmitted }[endKey] || null;
  const kpiDone = endKey === 'completed' ? done && !!ev.completed : !!endDate;
  const turnaround = kpiDone && start && endDate ? dayCount(start, endDate) : null;
  const ref = DB.projectRef(row); // Project Ref = ECX & WBS NO
  return { id: row.id, row, info, cats, cat, code: CODE[cat], rep, ref, title: info.title, status: info.status, stage, state, done, archived: info.archived, priority: info.priority, pri: PRI[info.priority] ?? 3,
    due: ev.due ? startOfDay(ev.due) : null, dueDays, assigned: start, completed: ev.completed ? startOfDay(ev.completed) : null, ev,
    kpiEnd: kpiDone ? endDate : null, kpiEndKey: endKey, turnaround, within: turnaround == null ? null : turnaround <= 7,
    progress: E.progress(row, info), surveyState: sv, ecparStatus: rep ? null : (epS || (info.amend ? 'Pending Revision' : '')), ecx: xs };
}
export function allFacts(now = Date.now(), { archived = false } = {}) {
  const dbr = DB.kpiDb(); if (!dbr) return [];
  return DB.rows(dbr.id).map(r => facts(r, now)).filter(f => archived || !f.archived || f.done);
}

// ---------- groups of projects ----------
/** projects belonging to a period: assigned in it, or reached their KPI completion in it */
export function inPeriod(f, from, to) {
  const a = f.assigned || startOfDay(new Date(D.val(f.row, 'created', 0) || 0)), e = f.kpiEnd ? startOfDay(f.kpiEnd) : null;
  return (a >= from && a <= to) || (e && e >= from && e <= to);
}
export function summary(list) {
  const open = list.filter(f => !f.done);
  const eligible = list.filter(f => f.turnaround != null);
  const within = eligible.filter(f => f.within).length;
  return { total: list.length, open: open.length, onTrack: open.filter(f => f.state === 'On Track').length, due2: open.filter(f => f.state === 'Due ≤ 2 Days').length,
    overdue: open.filter(f => f.state === 'Overdue').length, completed: list.filter(f => f.done).length,
    eligible: eligible.length, within, beyond: eligible.length - within, missing: list.filter(f => f.done && f.turnaround == null).length,
    avg: eligible.length ? Math.round(eligible.reduce((a, f) => a + f.turnaround, 0) / eligible.length * 10) / 10 : null,
    pct: eligible.length ? Math.round(within / eligible.length * 1000) / 10 : null };
}
/** KPI per month for the trend charts: projects whose KPI completion falls in each month */
export function monthly(list, endMonth, months = 6) {
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const from = new Date(endMonth.getFullYear(), endMonth.getMonth() - i, 1), to = new Date(endMonth.getFullYear(), endMonth.getMonth() - i + 1, 0);
    const s = summary(list.filter(f => f.kpiEnd && startOfDay(f.kpiEnd) >= from && startOfDay(f.kpiEnd) <= to));
    out.push({ from, to, ...s });
  }
  return out;
}
export function quarterly(list, endDate, quarters = 4) {
  const out = [], q0 = Math.floor(endDate.getMonth() / 3);
  for (let i = quarters - 1; i >= 0; i--) {
    const from = new Date(endDate.getFullYear(), (q0 - i) * 3, 1), to = new Date(from.getFullYear(), from.getMonth() + 3, 0);
    out.push({ from, to, ...summary(list.filter(f => f.kpiEnd && startOfDay(f.kpiEnd) >= from && startOfDay(f.kpiEnd) <= to)) });
  }
  return out;
}
/** average days for each activity, from recorded dates only. Site Survey: assigned → survey done; ECPAR: survey done → ECPAR submitted;
 *  ECX: each application's submission → approval (one figure per application) */
export function activityTurnaround(list) {
  const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null;
  const sv = [], ep = [], xs = [];
  for (const f of list) {
    if (f.assigned && f.ev.survey) sv.push(dayCount(f.assigned, f.ev.survey));
    if (!f.rep && f.ev.survey && f.ev.ecparSubmitted) ep.push(dayCount(f.ev.survey, f.ev.ecparSubmitted));
    if (!f.rep) for (const x of f.ecx) { const s = parseDate(E.g(x, 'submitted')), a = parseDate(E.g(x, 'approved')); if (s && a) xs.push(dayCount(s, a)); }
  }
  return [{ key: 'Site Survey', avg: avg(sv), n: sv.length }, { key: 'ECPAR', avg: avg(ep), n: ep.length }, { key: 'ECX', avg: avg(xs), n: xs.length }];
}
export const iso = d => toISODate(d);

// ---------- ECPAR rejection KPI: resubmit (retrigger) within 1 day of the rejection ----------
export const ECPAR_REJ_TARGET = 1;
/** one entry per rejection: paired with the first resubmission after it. Open rejections count as pending (late once past 1 day). */
export function ecparRejections(list, now = Date.now()) {
  const t0 = startOfDay(new Date(now)), out = [];
  for (const f of list) {
    if (f.rep) continue;
    const ep = E.ecparOf(f.row), ref = ep ? E.g(ep, 'ref', '') : '';
    const evs = E.revisions(f.row).map(x => ({ ev: x.ev, d: startOfDay(parseDate(x.date) || new Date(x.t)), reason: x.reason || '' }));
    const pairs = [];
    evs.forEach((x, i) => { if (x.ev !== 'rejected') return; const r = evs.slice(i + 1).find(y => y.ev === 'resubmitted' || y.ev === 'rejected'); pairs.push({ rejected: x.d, reason: x.reason, resub: r && r.ev === 'resubmitted' ? r.d : null }); });
    // older records (before the history existed): the ECPAR's own Date Rejected / Date Resubmitted
    if (!pairs.length && ep && E.g(ep, 'rejected')) pairs.push({ rejected: startOfDay(parseDate(E.g(ep, 'rejected'))), reason: E.g(ep, 'reason', ''), resub: E.g(ep, 'resubmitted') ? startOfDay(parseDate(E.g(ep, 'resubmitted'))) : null });
    if (!pairs.length) { const d = DB.kpiDb(), pr = d && DB.propByName(d, 'ECPAR Rejected'), rj = pr ? parseDate(DB.value(f.row, pr, now)) : null;
      if (rj) pairs.push({ rejected: startOfDay(rj), reason: '', resub: null }); }
    pairs.forEach((p, i) => {
      const days = p.resub ? dayCount(p.rejected, p.resub) : null, age = dayCount(p.rejected, t0);
      out.push({ f, ref, n: i + 1, rejected: p.rejected, resub: p.resub, reason: p.reason, days, within: days == null ? null : days <= ECPAR_REJ_TARGET, open: !p.resub, late: !p.resub && age > ECPAR_REJ_TARGET, age });
    });
  }
  return out.sort((a, b) => b.rejected - a.rejected);
}
export function rejSummary(rs) {
  const done = rs.filter(r => r.days != null), within = done.filter(r => r.within).length;
  return { total: rs.length, resubmitted: done.length, within, beyond: done.length - within, open: rs.filter(r => r.open).length, late: rs.filter(r => r.late).length,
    avg: done.length ? Math.round(done.reduce((a, r) => a + r.days, 0) / done.length * 10) / 10 : null, pct: done.length ? Math.round(within / done.length * 1000) / 10 : null };
}
