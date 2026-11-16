// Folio v2 — databases: schema, values, formulas, filters, sorts, KPI tracker logic.
import * as D from './data.js';
import { uid } from './model.js';
import { compile, formulaToText } from './formula.js';
import { parseDate, dateAdd, dateBetween, startOfDay, toISODate, formatDate } from './dates.js';

export const COLORS = { default: ['#E3E2E0', '#9B9A97'], gray: ['#E3E2E0', '#9B9A97'], brown: ['#EEE0DA', '#A27763'], orange: ['#FADEC9', '#D9730D'],
  yellow: ['#FBF3DB', '#CB912F'], green: ['#DBEDDB', '#6C9B7D'], blue: ['#D3E5EF', '#5B97BD'], purple: ['#E8DEEE', '#9A6DD7'], pink: ['#F5E0E9', '#C14C8A'], red: ['#FFE2DD', '#E16259'] };
export const COLOR_NAMES = Object.keys(COLORS).filter(c => c !== 'default');
export const TYPES = { title: 'Title', text: 'Text', number: 'Number', select: 'Select', multi: 'Multi-select', status: 'Status', date: 'Date', checkbox: 'Checkbox', url: 'URL', files: 'Files & media', formula: 'Formula', created: 'Created time' };
// a formula is prepared once and reused for every task (it used to be re-read for each one)
const FORMULAS = new Map();
const compiled = src => { let f = FORMULAS.get(src); if (!f) { f = compile(src); FORMULAS.set(src, f); } return f; };
export const TYPE_ICON = { title: 'title', text: 'text', number: 'number', select: 'list', multi: 'list', status: 'status', date: 'date', checkbox: 'checkbox', url: 'link', files: 'clip', formula: 'formula', created: 'date' };

/** the Alert formula (the user's Notion formula), with "1 day" instead of "1 days" */
export const ALERT_FORMULA = `if(prop("Status") == "Rejected","❌ REJECTED",if(prop("Status") == "Done","✅ COMPLETED",if(prop("Status") == "To Amend",if(dateBetween(dateAdd(prop("ECPAR Rejected"), 1, "days"), today(), "days") < 0,"🚨 AMENDMENT OVERDUE","🟠 AMENDMENT DUE (" + format(dateBetween(dateAdd(prop("ECPAR Rejected"), 1, "days"), today(), "days")) + if(dateBetween(dateAdd(prop("ECPAR Rejected"), 1, "days"), today(), "days") == 1, " day left)", " days left)")),if(dateBetween(prop("Due Date"), today(), "days") < 0,"🔴 OVERDUE (" + format(abs(dateBetween(prop("Due Date"), today(), "days"))) + if(abs(dateBetween(prop("Due Date"), today(), "days")) == 1, " day)", " days)"),if(dateBetween(prop("Due Date"), today(), "days") <= 2,"🟠 " + format(dateBetween(prop("Due Date"), today(), "days")) + if(dateBetween(prop("Due Date"), today(), "days") == 1, " day left", " days left"),"🔵 " + format(dateBetween(prop("Due Date"), today(), "days")) + if(dateBetween(prop("Due Date"), today(), "days") == 1, " day left", " days left"))))))`;
/** the earlier Alert formula (same as the Notion one): upgraded once to ALERT_FORMULA; a formula you changed yourself is left alone */
const OLD_ALERT_FORMULA = `if(prop("Status") == "Rejected","❌ REJECTED",if(prop("Status") == "Done","✅ COMPLETED",if(prop("Status") == "To Amend",if(dateBetween(dateAdd(prop("ECPAR Rejected"), 1, "days"), today(), "days") < 0,"🚨 AMENDMENT OVERDUE","🟠 AMENDMENT DUE (" + format(dateBetween(dateAdd(prop("ECPAR Rejected"), 1, "days"), today(), "days")) + " days left)"),if(dateBetween(prop("Due Date"), today(), "days") < 0,"🔴 OVERDUE (" + format(abs(dateBetween(prop("Due Date"), today(), "days"))) + " days)",if(dateBetween(prop("Due Date"), today(), "days") <= 2,"🟠 " + format(dateBetween(prop("Due Date"), today(), "days")) + " days left","🔵 " + format(dateBetween(prop("Due Date"), today(), "days")) + " days left")))))`;
export function upgradeAlert() {
  const d = kpiDb(); if (!d) return false;
  const squash = x => String(x || '').replace(/\s+/g, '');
  const ps = props(d), i = ps.findIndex(p => p.type === 'formula' && /^alert$/i.test(p.name));
  if (i < 0 || squash(ps[i].formula) !== squash(OLD_ALERT_FORMULA)) return false;
  const next = ps.map((p, k) => k === i ? { ...p, formula: ALERT_FORMULA } : p);
  D.update(d.id, { props: next }); return true;
}

export const dbs = () => D.all('db');
export const db = id => D.live(id);
export const props = dbr => D.val(dbr, 'props', []);
export const views = dbr => D.val(dbr, 'views', []);
export const propByName = (dbr, name) => props(dbr).find(p => p.name.toLowerCase() === name.toLowerCase()) || null;
export const titleProp = dbr => props(dbr).find(p => p.type === 'title');
export const rows = dbId => D.all('row', r => D.val(r, 'db') === dbId);
export const raw = (row, p) => D.val(row, 'p:' + p.id, null);
export function title(row) { const dbr = db(D.val(row, 'db')); const t = dbr && titleProp(dbr); return (t && raw(row, t)) || 'Untitled'; }

/** Typed value for formulas and logic (dates become Date objects). */
export function value(row, p, now = Date.now(), depth = 0) {
  if (!p) return null;
  if (p.type === 'formula') {
    if (depth > 4) return null;
    const dbr = db(D.val(row, 'db'));
    try { return compiled(p.formula || '""')(name => value(row, propByName(dbr, name), now, depth + 1), { now, rowId: row.id }); } catch { return null; }
  }
  if (p.type === 'created') return new Date(D.val(row, 'created', 0));
  const v = raw(row, p);
  if (p.type === 'date') return parseDate(v);
  if (p.type === 'checkbox') return !!v;
  if (p.type === 'multi') return Array.isArray(v) ? v : [];
  if (p.type === 'number') return v === '' || v == null ? null : +v;
  return v ?? null;
}
export function display(row, p, now) {
  const v = value(row, p, now);
  if (p.type === 'date') return v ? formatDate(v, 'DD/MM/YYYY') : '';
  if (p.type === 'formula') return formulaToText(v);
  if (p.type === 'multi') return v.join(', ');
  if (p.type === 'checkbox') return v ? 'Yes' : 'No';
  if (p.type === 'files') return (v || []).map(f => f.name).join(', ');
  return v == null ? '' : String(v);
}
export const optColor = (p, name) => COLORS[(p.options || []).find(o => o.name === name)?.color || 'default'];

// ---- filters & sorts ----
export const OPS = { text: ['contains', 'is', 'is not', 'is empty', 'is not empty'], select: ['is', 'is not', 'is empty', 'is not empty'], date: ['is', 'is before', 'is after', 'is empty', 'is not empty'], checkbox: ['is checked', 'is unchecked'], number: ['=', '>', '<', 'is empty', 'is not empty'] };
export const opsFor = p => OPS[{ title: 'text', url: 'text', formula: 'text', multi: 'select', status: 'select', created: 'date' }[p.type] || p.type] || OPS.text;
export function matches(row, rule, dbr, now) {
  const p = props(dbr).find(x => x.id === rule.prop); if (!p) return true;
  const v = value(row, p, now), s = display(row, p, now).toLowerCase(), want = String(rule.value ?? '').toLowerCase();
  switch (rule.op) {
    case 'is checked': return v === true; case 'is unchecked': return v !== true;
    case 'is empty': return !s; case 'is not empty': return !!s;
    case 'contains': return s.includes(want);
    case 'is': return p.type === 'multi' ? v.map(x => x.toLowerCase()).includes(want) : p.type === 'date' ? toISODate(v) === rule.value : s === want;
    case 'is not': return p.type === 'multi' ? !v.map(x => x.toLowerCase()).includes(want) : s !== want;
    case 'is before': return v && parseDate(rule.value) && v < parseDate(rule.value);
    case 'is after': return v && parseDate(rule.value) && v > parseDate(rule.value);
    case '=': return v === +rule.value; case '>': return v > +rule.value; case '<': return v != null && v < +rule.value;
  }
  return true;
}
export function viewRows(dbr, view, { search = '', now = Date.now() } = {}) {
  let list = rows(dbr.id);
  const any = view.filterMode === 'or';
  if (view.filter?.length) list = list.filter(r => any ? view.filter.some(f => matches(r, f, dbr, now)) : view.filter.every(f => matches(r, f, dbr, now)));
  if (search) {
    const q = search.toLowerCase(); const ps = props(dbr);
    list = list.filter(r => ps.some(p => display(r, p, now).toLowerCase().includes(q)) || commentsText(r.id).includes(q));
  }
  const sorts = view.sort?.length ? view.sort : [];
  const ps = props(dbr);
  list.sort((a, b) => {
    for (const s of sorts) {
      const p = ps.find(x => x.id === s.prop); if (!p) continue;
      let x = value(a, p, now), y = value(b, p, now);
      if (x instanceof Date) x = +x; if (y instanceof Date) y = +y;
      if (x == null && y == null) continue; if (x == null) return 1; if (y == null) return -1;
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
      if (c) return s.dir === 'desc' ? -c : c;
    }
    return (D.val(a, 'order', 0) - D.val(b, 'order', 0)) || (D.val(a, 'created', 0) - D.val(b, 'created', 0));
  });
  return list;
}
const commentsText = id => D.all('cmt', c => D.val(c, 'parent') === id).map(c => D.val(c, 'text', '')).join(' ').toLowerCase();

// ---- schema editing ----
export function saveProps(dbr, list) { D.update(dbr.id, { props: list }); }
export function saveViews(dbr, list) { D.update(dbr.id, { views: list }); }
export function addOption(dbr, p, name) {
  const list = props(dbr).map(x => x.id === p.id ? { ...x, options: [...(x.options || []), { name, color: COLOR_NAMES[(x.options || []).length % COLOR_NAMES.length] }] } : x);
  saveProps(dbr, list); return list.find(x => x.id === p.id);
}
export function newRow(dbr, values = {}) {
  const r = D.create('row', 'db:' + dbr.id, { db: dbr.id, created: Date.now(), order: Date.now() });
  const upd = {}; for (const [name, v] of Object.entries(values)) { const p = propByName(dbr, name) || props(dbr).find(x => x.id === name); if (p) upd['p:' + p.id] = v; }
  if (Object.keys(upd).length) D.update(r.id, upd);
  return r;
}

// ---- KPI tracker ----
export function kpiDb() { return dbs().find(d => D.val(d, 'role') === 'kpi') || dbs().find(d => propByName(d, 'Status') && propByName(d, 'Due Date')) || null; }

export function createKpiTracker(parentPage = null) {
  const P = (name, type, extra = {}) => ({ id: uid('p'), name, type, ...extra });
  const opts = (...l) => l.map(([name, color]) => ({ name, color }));
  const props = [
    P('Customer Name', 'title'), P('ECX & WBS NO', 'text'), P('Project Category', 'multi', { options: opts(['New Application', 'blue'], ['SAL100KW', 'brown'], ['Resubmission', 'pink'], ['NEM', 'gray']) }),
    P('Address', 'text'), P('Pin Location', 'url'), P('Station', 'select', { options: opts(['Bintulu', 'brown']) }),
    P('Date Assigned', 'date'), P('Due Date', 'date'), P('Date Completed', 'date'), P('ECPAR Rejected', 'date'),
    P('Status', 'status', { options: opts(['Site Survey', 'blue'], ['Estimation', 'yellow'], ['To Amend', 'orange'], ['Done', 'green'], ['Rejected', 'red']) }),
    P('Alert', 'formula', { formula: ALERT_FORMULA }), P('Archive', 'checkbox')];
  const arch = props.find(p => p.name === 'Archive'), da = props.find(p => p.name === 'Date Assigned');
  const views = [
    { id: uid('v'), name: 'Project Not Complete', type: 'table', filter: [{ prop: arch.id, op: 'is unchecked' }], sort: [{ prop: da.id, dir: 'asc' }], hidden: [] },
    { id: uid('v'), name: 'Completed Project', type: 'table', filter: [{ prop: arch.id, op: 'is checked' }], sort: [{ prop: da.id, dir: 'desc' }], hidden: [] }];
  const page = D.create('page', 'ws', { title: 'Planning KPI Tracker 2026', parent: parentPage, blocks: [], created: Date.now(), order: Date.now() });
  const d = D.create('db', 'ws', { name: 'My Task', page: page.id, role: 'kpi', props, views, created: Date.now() });
  D.update(page.id, { blocks: [{ id: uid('b'), t: 'db', db: d.id }], db: d.id });
  return { page, db: d };
}

// ---------- project reference = ECX & WBS NO ----------
/** the project's reference: its ECX & WBS NO (one line); an older separate Project Ref only if ECX & WBS NO is empty */
export function projectRef(row) {
  const d = kpiDb(); if (!d || !row) return '';
  const e = propByName(d, 'ECX & WBS NO'), o = propByName(d, 'Project Ref');
  const v = String((e && value(row, e)) || (o && value(row, o)) || '').trim();
  return v.split(/\r?\n/).map(x => x.trim()).filter(Boolean).join(' / ');
}
/** split ECX & WBS NO into the ECX number and the WBS / project number (e.g. "ECX_202608_3006" and "BTU-260476") */
export function refParts(row) {
  const all = projectRef(row).split(/\s*(?:\/|,|;|\s{2,})\s*/).filter(Boolean);
  const ecx = all.find(x => /^ECX/i.test(x)) || '', wbs = all.find(x => x !== ecx) || '';
  return { ecx, wbs, all: projectRef(row) };
}
/** once: a value typed in the old Project Ref field moves into ECX & WBS NO where that is empty */
export function mergeProjectRef() {
  const d = kpiDb(); if (!d) return 0;
  const e = propByName(d, 'ECX & WBS NO'), o = propByName(d, 'Project Ref'); if (!e || !o) return 0;
  let n = 0;
  for (const r of rows(d.id)) { const ov = String(value(r, o) || '').trim(); if (ov && !String(value(r, e) || '').trim()) { D.update(r.id, { ['p:' + e.id]: ov }); n++; } }
  return n;
}

/** Classify a KPI task for the Today / Survey / ECPAR screens. */
export function kpiInfo(row, dbr, now = Date.now()) {
  const P = n => propByName(dbr, n), today = startOfDay(new Date(now));
  const status = value(row, P('Status')) || '';
  const archived = value(row, P('Archive')) === true;
  const closed = archived || ['Done', 'Rejected'].includes(status);
  let due = null, days = null, amend = status === 'To Amend';
  if (amend) { const rj = value(row, P('ECPAR Rejected')); due = rj ? dateAdd(rj, 1, 'days') : null; }
  else due = value(row, P('Due Date'));
  if (due) days = dateBetween(due, today, 'days');
  const g = n => { const p = P(n); return p ? value(row, p) : null; };
  return { id: row.id, row, status, closed, amend, due, days, title: title(row), address: g('Address') || '', map: g('Pin Location') || '',
    station: g('Station') || '', ecx: g('ECX & WBS NO') || '', rejected: g('ECPAR Rejected'), alert: P('Alert') ? formulaToText(value(row, P('Alert'), now)) : '',
    category: [].concat(g('Project Category') || []), priority: g('Priority') || '', next: g('Next Task') || '', ecxRejected: g('ECX Rejected'),
    assigned: g('Date Assigned'), completed: g('Date Completed'), archived,
    // finished: Done, or Rejected once its Date Completed is filled in (then it stops counting days, like a Done project)
    finished: status === 'Done' || (status === 'Rejected' && !!g('Date Completed')) };
}
export function kpiTasks(now = Date.now()) { const d = kpiDb(); if (!d) return []; return rows(d.id).map(r => kpiInfo(r, d, now)).filter(t => !t.closed); }
const byDays = (a, b) => (a.days ?? 9999) - (b.days ?? 9999);
export function todayGroups(now) {
  const t = kpiTasks(now);
  return { overdue: t.filter(x => x.days != null && x.days < 0).sort(byDays), today: t.filter(x => (x.days != null && x.days >= 0 && x.days <= 2) || (x.amend && x.days == null)).sort(byDays) };
}
export function surveyGroups(now) {
  const t = kpiTasks(now).filter(x => x.status === 'Site Survey');
  return { overdue: t.filter(x => x.days != null && x.days < 0).sort(byDays), today: t.filter(x => x.days != null && x.days >= 0 && x.days <= 2).sort(byDays), upcoming: t.filter(x => x.days == null || x.days > 2).sort(byDays) };
}
// Rejected ECX: has an ECX Rejected date and is still open; due the day after it was rejected (same rule as ECPAR)
let ecxSource = null; // the ECX application records register here (entities.js), so this file does not need to know them
export const setEcxSource = f => { ecxSource = f; };
export function ecxGroups(now) {
  const today = startOfDay(new Date(now));
  if (ecxSource) { const t = ecxSource(now); return { overdue: t.filter(x => x.days != null && x.days < 0).sort(byDays), today: t.filter(x => !(x.days != null && x.days < 0)).sort(byDays) }; }
  const t = kpiTasks(now).filter(x => x.ecxRejected).map(x => { const due = dateAdd(x.ecxRejected, 1, 'days'); return { ...x, due, days: dateBetween(due, today, 'days'), ecxDue: true }; });
  return { overdue: t.filter(x => x.days < 0).sort(byDays), today: t.filter(x => x.days >= 0).sort(byDays) };
}
// the 8 Project Categories from the brief, and the 3 Home fields; added once, never removes anything you have
export const CATEGORIES = ['SAL100KW', 'Substation Site Enquiry', 'Turnkey Stage 1', 'Turnkey Stage 2', 'NEM Solar', 'Temporary Supply', 'Upgrading of Supply', 'Non Turnkey'];
export const REPORT_ONLY = ['NEM Solar', 'Substation Site Enquiry', 'Turnkey Stage 1'];
export function ensureHomeFields() {
  const d = kpiDb(); if (!d) return false;
  let list = props(d).map(x => ({ ...x })), changed = false;
  const cat = list.find(x => x.name === 'Project Category');
  if (cat) { const have = new Set((cat.options || []).map(o => o.name.toLowerCase()));
    const colors = { 'SAL100KW': 'brown', 'Substation Site Enquiry': 'purple', 'Turnkey Stage 1': 'green', 'Turnkey Stage 2': 'green', 'NEM Solar': 'orange', 'Temporary Supply': 'yellow', 'Upgrading of Supply': 'blue', 'Non Turnkey': 'gray' };
    const add = CATEGORIES.filter(n => !have.has(n.toLowerCase())).map(n => ({ name: n, color: colors[n] }));
    if (add.length) { cat.options = [...(cat.options || []), ...add]; changed = true; } }
  const want = [{ id: 'p_nexttask', name: 'Next Task', type: 'text' },
    { id: 'p_priority', name: 'Priority', type: 'select', options: [{ name: 'High', color: 'red' }, { name: 'Medium', color: 'orange' }, { name: 'Low', color: 'blue' }] },
    { id: 'p_ecxrejected', name: 'ECX Rejected', type: 'date' },
    { id: 'p_remarks', name: 'Scope / Remarks', type: 'text' }, { id: 'p_ecxlink', name: 'ECX Link', type: 'url' }]; // Project Ref is the ECX & WBS NO (no separate field)
  for (const w of want) if (!list.some(x => x.id === w.id || x.name.toLowerCase() === w.name.toLowerCase())) { list.push(w); changed = true; }
  if (changed) saveProps(d, list);
  return changed;
}
export function ecparGroups(now) {
  const t = kpiTasks(now).filter(x => x.amend);
  return { overdue: t.filter(x => x.days != null && x.days < 0).sort(byDays), today: t.filter(x => !(x.days != null && x.days < 0)).sort(byDays) };
}
