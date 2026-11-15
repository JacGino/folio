// Folio v2 — the four Focus pages (Due Today, Pending Site Survey, Rejected ECPAR, Rejected ECX).
// They are filtered views of the same project, task, survey, ECPAR and ECX records: nothing here is copied or stored twice.
// Shared layout: cover banner header → 4 metrics → records table (left) + doughnut, breakdown and Quick Actions (right).
import * as D from './data.js';
import * as DB from './db.js';
import * as E from './entities.js';
import { h, icon, menu, toast, textbox, sheet } from './ui.js';
import { formatDate, toISODate, parseDate, dateAdd, startOfDay } from './dates.js';
import { state, now as NOW, render, go, moreMenu, longPress, exportList } from './app.js';
import { badge, optPill, formModal, newProjectSheet, rejectEcparFlow, resubmitEcparFlow, approveEcparFlow, rejectEcxFlow, resubmitEcxFlow, approveEcxFlow, editRejectionFlow } from './project.js';
import { dueItems, completeItem, pickProject, logSheet, coverInto } from './home.js';
import { promptBox } from './ui.js';

const { g } = E;
const P = n => { const d = DB.kpiDb(); return d && DB.propByName(d, n); };
const dmy = v => { const d = parseDate(v); return d ? formatDate(d, 'D/M/YYYY') : ''; };
const today = () => toISODate(new Date(NOW()));
const SHORT = { 'Turnkey Stage 1': 'Turnkey S1', 'Turnkey Stage 2': 'Turnkey S2', 'Substation Site Enquiry': 'Substation', 'Upgrading of Supply': 'Upgrading', 'Temporary Supply': 'Temporary' };
const short = c => SHORT[c] || c;
const catPill = cats => cats.length ? optPill('Project Category', short(cats[0])) : h('span', { class: 'muted' }, '—');
const priOf = row => (P('Priority') && DB.value(row, P('Priority'))) || '';
const PRI_ICON = { High: '↑', Medium: '=', Low: '✓' };
const priPill = p => p ? badge((PRI_ICON[p] || '') + ' ' + p, { High: 'red', Medium: 'orange', Low: 'green' }[p], false) : h('span', { class: 'muted' }, '—');
const dueBadge = days => days == null ? h('span', { class: 'muted' }, '—') : h('span', { class: 'fdue' + (days < 0 ? ' late' : days === 0 ? ' today' : '') }, icon('date', 13), days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days < 0 ? Math.abs(days) + (days === -1 ? ' day late' : ' days late') : 'In ' + days + ' days');
const setRowProp = (row, name, v) => { const p = P(name); if (p) D.update(row.id, { ['p:' + p.id]: v }); };

// ---------- per-page state (filters stay while you move around) ----------
const ST = {};
const st = kind => ST[kind] || (ST[kind] = { tab: 'all', q: '', cat: '', pri: '', date: '', status: '', sort: 'due', show: 60, sel: new Set() });

// =====================================================================================
// Records for each page
// =====================================================================================
const TYPE_OF = { ecx: 'ECX', ecpar: 'ECPAR', survey: 'Site Survey' };
const TASK_STATUS_MAP = { 'Not Started': 'Pending', Pending: 'Pending', 'In Progress': 'In Progress', 'On Hold': 'On Hold', Completed: 'Completed' };
function dueRecords(n) {
  return dueItems(n).map(it => {
    const type = it.kind === 'task' ? (g(it.task, 'type') || 'Other') : TYPE_OF[it.kind] || (E.reportOnly(it.cats) ? 'Report' : 'Other');
    const priority = it.kind === 'task' ? (g(it.task, 'priority') || '') : priOf(it.row);
    const status = it.kind === 'task' ? TASK_STATUS_MAP[g(it.task, 'status')] || 'Pending'
      : it.kind === 'ecpar' ? (g(E.ecparOf(it.row) || { f: {} }, 'status') === 'In Revision' ? 'In Progress' : 'Pending')
      : it.kind === 'ecx' ? (['In Review', 'Ready to Resubmit'].includes(g(D.live(it.ecxId) || { f: {} }, 'status')) ? 'In Progress' : 'Pending')
      : it.status === 'Estimation' ? 'In Progress' : 'Pending';
    const risk = it.days != null && it.days < 0 ? 'overdue' : it.days === 0 && status !== 'In Progress' ? 'risk' : 'track';
    const ecxNo = it.kind === 'ecx' ? (g(D.live(it.ecxId) || { f: {} }, 'number') || it.ecx) : it.ecx;
    return { ...it, id: it.key, type, priority, status, risk, no: ecxNo ? String(ecxNo).split('\n')[0] : '', cats: it.cats };
  });
}
function surveyRecords(n) {
  const dbr = DB.kpiDb(); if (!dbr) return [];
  const g0 = DB.surveyGroups(n);
  return [...g0.overdue, ...g0.today, ...(g0.upcoming || [])].map(t => {
    const s = E.surveyInfo(t.row, t, n); if (s.state === 'Completed') return null;
    const sd = parseDate(s.scheduled), t0 = startOfDay(new Date(n));
    return { id: 'sv' + t.id, row: t.row, cust: t.title, cats: t.category, no: t.ecx ? String(t.ecx).split('\n')[0] : '', title: 'Site survey – ' + (t.category.length ? short(t.category[0]) : 'project'),
      priority: priOf(t.row), status: s.state, scheduled: s.scheduled, due: t.due, days: t.days, sdays: sd ? Math.round((startOfDay(sd) - t0) / 864e5) : null, address: t.address };
  }).filter(Boolean);
}
function ecparRecords(n) {
  const t0 = startOfDay(new Date(n));
  return [...DB.ecparGroups(n).overdue, ...DB.ecparGroups(n).today].map(t => {
    const e = E.ecparOf(t.row) || { f: {} }, s = g(e, 'status');
    const status = E.ECPAR_ACTIVE.includes(s) ? s : 'Pending Revision';
    const rj = g(e, 'rejected') || (t.rejected ? toISODate(t.rejected) : null), due = rj ? dateAdd(parseDate(rj), 1, 'days') : null;
    return { id: 'ep' + t.id, row: t.row, rec: D.live(e.id), cust: t.title, cats: t.category, ref: g(e, 'ref', ''), pref: P('Project Ref') ? DB.value(t.row, P('Project Ref')) || '' : '',
      status, rejected: rj, due, days: due ? Math.round((startOfDay(due) - t0) / 864e5) : null, rcat: g(e, 'rcat') || '', reason: g(e, 'reason', ''), correction: g(e, 'correction', ''), remarks: g(e, 'remarks', ''), priority: priOf(t.row) };
  });
}
const ECX_SHOW = s => E.ECX_ACTIVE.includes(s) ? s : s === 'Resubmitted' ? 'Resubmitted' : 'Closed';
function ecxRecords(n) {
  const dbr = DB.kpiDb(); if (!dbr) return [];
  const t0 = startOfDay(new Date(n)), out = [];
  for (const x of D.all('ecx', x => !!g(x, 'rejected'))) {
    const row = D.live(D.val(x, 'project')); if (!row || D.val(row, 'db') !== dbr.id) continue;
    const info = DB.kpiInfo(row, dbr, n); if (info.archived) continue;
    const status = ECX_SHOW(g(x, 'status')), active = E.ECX_ACTIVE.includes(status);
    const rj = g(x, 'rejected'), due = rj ? dateAdd(parseDate(rj), 1, 'days') : null;
    out.push({ id: 'x' + x.id, x, row, cust: info.title, cats: info.category, no: g(x, 'number', ''), appid: g(x, 'appid', ''), status, active,
      rejected: rj, due, days: active && due ? Math.round((startOfDay(due) - t0) / 864e5) : null, rcat: g(x, 'rcat') || '', reason: g(x, 'reason', ''), correction: g(x, 'correction', ''), remarks: g(x, 'remarks', ''), priority: priOf(row) });
  }
  return out;
}

// =====================================================================================
// Page definitions
// =====================================================================================
const PAGES = {
  today: { title: 'Due Today', icon: 'date', desc: 'Projects and tasks due today that require your action.', records: dueRecords, unit: 'Tasks',
    tabs: [['all', 'All', null, () => true], ['survey', 'Site Survey', 'target', r => r.type === 'Site Survey'], ['rejected', 'Rejected Queue', 'xcircle', r => r.kind === 'ecpar' || r.kind === 'ecx']],
    metrics: rs => [['date', 'Total Due Today', rs.length, null, 'blue'], ['okcircle', 'On Track', rs.filter(r => r.risk === 'track').length, 'green'], ['today', 'At Risk', rs.filter(r => r.risk === 'risk').length, 'orange'], ['info', 'Overdue', rs.filter(r => r.risk === 'overdue').length, 'red']],
    statuses: ['Pending', 'In Progress', 'On Hold'], search: r => [r.no, r.cust, r.title, r.cats.join(' ')],
    dates: [['overdue', 'Overdue', r => r.days < 0], ['today', 'Due today', r => r.days === 0], ['soon', 'Next 2 days', r => r.days > 0]],
    donut: { title: 'Due Today by Type', key: r => r.type, order: ['ECX', 'ECPAR', 'Site Survey', 'Report', 'Other'], colors: { ECX: '#3B82F6', ECPAR: '#E5484D', 'Site Survey': '#3FA45B', Report: '#A78BFA', Other: '#B4B2AD' } },
    bars: { title: 'Priority Breakdown', icon: 'barchart', key: r => r.priority || 'Not set', order: ['High', 'Medium', 'Low', 'Not set'], colors: { High: '#E5484D', Medium: '#E5A50A', Low: '#3FA45B', 'Not set': '#B4B2AD' } },
    cols: ['eCX & WBS No / Task', 'Customer', 'Project Type', 'Priority', 'Due Date', 'Status'] },
  survey: { title: 'Pending Site Survey', icon: 'target', desc: 'Site survey requests that are pending action, scheduling or completion.', records: surveyRecords, unit: 'Surveys',
    tabs: [['all', 'All', null, () => true], ['to', 'To Schedule', 'date', r => r.status === 'To Schedule'], ['sch', 'Scheduled', 'okcircle', r => r.status === 'Scheduled'], ['over', 'Overdue', 'info', r => r.status === 'Overdue']],
    metrics: rs => [['target', 'Total Pending', rs.length, null], ['date', 'To Schedule', rs.filter(r => r.status === 'To Schedule').length, 'blue'], ['okcircle', 'Scheduled', rs.filter(r => r.status === 'Scheduled').length, 'green'], ['info', 'Overdue', rs.filter(r => r.status === 'Overdue').length, 'red']],
    statuses: ['To Schedule', 'Scheduled', 'Overdue'], search: r => [r.no, r.cust, r.title, r.address, r.cats.join(' ')],
    dates: [['overdue', 'Past due date', r => r.days != null && r.days < 0], ['week', 'Survey in 7 days', r => r.sdays != null && r.sdays >= 0 && r.sdays <= 7], ['none', 'No survey date', r => !r.scheduled]],
    donut: { title: 'Site Survey by Status', key: r => r.status, order: ['To Schedule', 'Scheduled', 'Overdue'], colors: { 'To Schedule': '#3B82F6', Scheduled: '#3FA45B', Overdue: '#E5484D' } },
    bars: { title: 'By Project Category', icon: 'layers', key: r => r.cats[0] || 'No category', order: [...DB.CATEGORIES, 'No category'], label: short, colors: {} },
    cols: ['eCX & WBS No / Survey', 'Customer', 'Category', 'Priority', 'Site Survey Date', 'Status'] },
  ecpar: { title: 'Rejected ECPAR', icon: 'ecpar', desc: 'ECPAR submissions that were rejected and require review, revision or resubmission.', records: ecparRecords, unit: 'ECPAR',
    tabs: [['all', 'All', null, () => true], ['pending', 'Pending Revision', 'redo', r => r.status === 'Pending Revision'], ['ready', 'Ready to Resubmit', 'play', r => r.status === 'Ready to Resubmit'], ['over', 'Overdue', 'info', r => r.days != null && r.days < 0]],
    metrics: rs => [['ecpar', 'Total Rejected ECPAR', rs.length, null], ['redo', 'Pending Revision', rs.filter(r => r.status === 'Pending Revision').length, 'red'], ['play', 'Ready to Resubmit', rs.filter(r => r.status === 'Ready to Resubmit').length, 'green'], ['today', 'Overdue', rs.filter(r => r.days != null && r.days < 0).length, 'red']],
    statuses: E.ECPAR_ACTIVE, search: r => [r.ref, r.pref, r.cust, r.reason, r.correction, r.cats.join(' ')],
    dates: [['overdue', 'Overdue', r => r.days < 0], ['today', 'Due today', r => r.days === 0], ['week', 'Rejected in the last 7 days', r => r.rejected && (startOfDay(new Date(NOW())) - parseDate(r.rejected)) / 864e5 <= 7]],
    donut: { title: 'Rejected ECPAR by Status', key: r => r.status, order: E.ECPAR_ACTIVE, colors: { 'Pending Revision': '#3B82F6', 'In Revision': '#A78BFA', 'Ready to Resubmit': '#3FA45B' } },
    bars: { title: 'Rejection Reason Breakdown', icon: 'list', key: r => r.rcat || 'Not categorised', order: [...E.ECPAR_REASONS, 'Not categorised'], colors: { 'Technical data issues': '#E5484D', 'Drawing / layout issues': '#E5A50A', 'Load summary issues': '#F5C451', Other: '#A78BFA', 'Not categorised': '#B4B2AD' } },
    cols: ['ECPAR No.', 'Customer', 'Project / Category', 'Rejection Details', 'Rejected Date', 'Due Date', 'Status'] },
  ecx: { title: 'Rejected ECX', icon: 'filex', desc: 'ECX applications that were rejected and require review or follow-up action.', records: ecxRecords, unit: 'ECX',
    tabs: [['all', 'All', null, r => r.status !== 'Closed'], ['pending', 'Pending Action', 'hourglass', r => r.status === 'Pending Action'], ['review', 'In Review', 'search', r => r.status === 'In Review'], ['resub', 'Resubmission', 'redo', r => r.status === 'Ready to Resubmit' || r.status === 'Resubmitted'], ['closed', 'Closed', 'okcircle', r => r.status === 'Closed']],
    metrics: rs => { const open = rs.filter(r => r.status !== 'Closed'); return [['filex', 'Total Rejected ECX', open.length, null, null, open.length], ['okcircle', 'Pending Action', rs.filter(r => r.status === 'Pending Action').length, 'green', null, open.length], ['today', 'Due Today', rs.filter(r => r.days === 0).length, 'orange', null, open.length], ['info', 'Overdue', rs.filter(r => r.days != null && r.days < 0).length, 'red', null, open.length]]; },
    statuses: ['Pending Action', 'In Review', 'Ready to Resubmit', 'Resubmitted', 'Closed'], search: r => [r.no, r.appid, r.cust, r.reason, r.correction, r.cats.join(' ')],
    dates: [['overdue', 'Overdue', r => r.days != null && r.days < 0], ['today', 'Due today', r => r.days === 0], ['week', 'Rejected in the last 7 days', r => r.rejected && (startOfDay(new Date(NOW())) - parseDate(r.rejected)) / 864e5 <= 7]],
    donut: { title: 'Rejected ECX by Status', key: r => r.status === 'Ready to Resubmit' || r.status === 'Resubmitted' ? 'Resubmission' : r.status, order: ['Pending Action', 'Resubmission', 'In Review', 'Closed'], colors: { 'Pending Action': '#3B82F6', Resubmission: '#A78BFA', 'In Review': '#E5A50A', Closed: '#3FA45B' } },
    bars: { title: 'Rejection Reason Breakdown', icon: 'list', key: r => r.rcat || 'Not categorised', order: [...E.ECX_REASONS, 'Not categorised'], colors: { 'Incomplete documents': '#E5484D', 'Drawing not compliant': '#E5A50A', 'Additional information required': '#F5C451', 'Revised documents required': '#A78BFA', Other: '#3B82F6', 'Not categorised': '#B4B2AD' } },
    cols: ['ECX No.', 'Customer', 'Project / Category', 'Rejection Details', 'Rejected Date', 'Due Date', 'Status'] },
};
const CAT_COLORS = ['#3FA45B', '#F5C451', '#A78BFA', '#7BD389', '#E5A50A', '#9CC5F2', '#C9B6F2', '#E8A4A0', '#B4B2AD'];

// =====================================================================================
// The page
// =====================================================================================
export function focusScreen(kind) {
  E.ensureAll();
  const def = PAGES[kind], S = st(kind), n = NOW();
  state.ctx = { export: a => exportList(kind === 'ecx' ? 'ecpar' : kind, a), more: a => pageMenu(a, kind) };
  const wrap = h('div', { class: 'wrap home focus f-' + kind });
  wrap.append(header(kind, def));
  if (!DB.kpiDb()) { wrap.append(h('section', { class: 'hcard soon' }, h('p', {}, 'Import your Notion export, or make the Planning KPI Tracker, to see this list.'))); return wrap; }
  const all = def.records(n);
  // filters other than the tab: search, category, priority, status, date
  const q = S.q.trim().toLowerCase(), dateF = def.dates.find(d => d[0] === S.date);
  const base = all.filter(r => (!q || def.search(r).filter(Boolean).join(' ').toLowerCase().includes(q)) && (!S.cat || r.cats.includes(S.cat)) && (!S.pri || (r.priority || 'Not set') === S.pri)
    && (!S.status || r.status === S.status) && (!dateF || dateF[2](r)));
  const tab = def.tabs.find(t => t[0] === S.tab) || def.tabs[0];
  const sorters = { due: (a, b) => (a.days ?? 99999) - (b.days ?? 99999), cust: (a, b) => a.cust.localeCompare(b.cust), pri: (a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.priority] ?? 3) - ({ High: 0, Medium: 1, Low: 2 }[b.priority] ?? 3),
    rejected: (a, b) => String(b.rejected || '').localeCompare(String(a.rejected || '')), sched: (a, b) => String(a.scheduled || '9').localeCompare(String(b.scheduled || '9')) };
  const rows = base.filter(tab[3]).sort((a, b) => sorters[S.sort]?.(a, b) || sorters.due(a, b) || a.cust.localeCompare(b.cust));
  for (const id of [...S.sel]) if (!rows.some(r => r.id === id)) S.sel.delete(id);
  wrap.append(metricsBar(def, base),
    h('div', { class: 'fgrid' }, tableCard(kind, def, S, base, rows, n), h('aside', { class: 'fside' }, donutCard(def, base), barsCard(def, base), quickCard(kind))));
  return wrap;
}
function pageMenu(a, kind) {
  moreMenu(a, { extra: [{ label: 'Card view (classic list)', icon: 'list', run: () => go('#/list/' + kind) }, { label: 'Open Planning KPI Tracker', icon: 'table', run: () => go('#/tracker') }] });
}

// ---------- header with the cover banner ----------
function header(kind, def) {
  const n = NOW(), alerts = DB.kpiDb() ? DB.kpiTasks(n).filter(t => t.days != null && t.days <= 0).length + E.dueTasks(n).length : 0;
  return h('header', { class: 'fhead' }, coverInto(h('div', { class: 'fcover', 'aria-hidden': 'true' })),
    h('div', { class: 'fhead-in' },
      h('nav', { class: 'crumbs fcrumbs', 'aria-label': 'Breadcrumb' }, h('a', { href: '#/home', 'aria-label': 'Home' }, icon('home', 16)), icon('chevr', 14), h('span', {}, def.title)),
      h('div', { class: 'ftitle' }, h('span', { class: 'fic' }, icon(def.icon, 26)), h('div', {}, h('h1', {}, def.title), h('p', {}, def.desc)))),
    h('div', { class: 'hero-a fhead-a' },
      h('button', { class: 'hbtn glass', 'aria-label': alerts ? `Notifications, ${alerts} due or overdue` : 'Notifications', onclick: () => go('#/inbox') }, icon('bell', 19), alerts ? h('i', { class: 'hdot' }) : null),
      h('button', { class: 'hbtn glass', 'aria-label': 'More options', onclick: e => pageMenu(e.currentTarget, kind) }, icon('more', 19))));
}

// ---------- 4 metrics ----------
function metricsBar(def, base) {
  const ms = def.metrics(base);
  return h('section', { class: 'kbar5 fmetrics', 'aria-label': 'Summary' }, ms.map(([ic, label, v, tone, _x, of], i) => {
    const total = of ?? ms[0][2], pct = i && total ? Math.round(v / total * 100) + '%' : null;
    return h('div', { class: 'kb k-' + (tone || 'base') }, h('span', { class: 'kbi' }, icon(ic, 20)),
      h('span', { class: 'kbt' }, h('small', {}, label), h('span', { class: 'kbv' }, h('b', {}, String(v)), pct ? h('em', { class: 'kch ' + (tone === 'red' ? 'red' : tone === 'green' ? 'green' : tone === 'orange' ? 'orange' : 'gray') }, pct) : null)));
  }));
}

// ---------- records table ----------
function tableCard(kind, def, S, base, rows, n) {
  const list = h('div', { class: 'flist', role: 'table', 'aria-label': def.title });
  const tabEls = def.tabs.map(([k, l, ic, f]) => h('button', { class: 'dchip' + (S.tab === k ? ' on' : ''), 'aria-pressed': S.tab === k ? 'true' : 'false', onclick: () => { S.tab = k; S.show = 60; render(); } }, ic ? icon(ic, 14) : null, l, h('span', { class: 'dcount' }, base.filter(f).length)));
  const search = textbox({ value: S.q, cls: 'hsearch-in', placeholder: { today: 'Search ECX, customer, task…', survey: 'Search project, customer or location…', ecpar: 'Search by ECPAR no., customer, reason…', ecx: 'Search ECX, customer, reason…' }[kind], label: 'Search',
    oninput: () => { S.q = search.value; clearTimeout(search._t); search._t = setTimeout(() => refreshInPlace(kind, search), 220); } });
  const active = [S.cat && ['Category: ' + short(S.cat), () => S.cat = ''], S.pri && ['Priority: ' + S.pri, () => S.pri = ''], S.status && ['Status: ' + S.status, () => S.status = ''],
    S.date && ['Date: ' + def.dates.find(d => d[0] === S.date)[1], () => S.date = ''], S.q && ['Search: ' + S.q, () => S.q = '']].filter(Boolean);
  const cats = [...new Set(DB.CATEGORIES.concat((P('Project Category')?.options || []).map(o => o.name)))];
  const filterMenu = a => menu(a, [
    { el: h('div', { class: 'mhead' }, 'Category') }, { label: 'All categories', checked: !S.cat, run: () => { S.cat = ''; render(); } }, ...cats.map(c => ({ label: c, checked: S.cat === c, run: () => { S.cat = c; render(); } })), '-',
    { el: h('div', { class: 'mhead' }, 'Priority') }, ...['', 'High', 'Medium', 'Low', 'Not set'].map(p => ({ label: p || 'Any priority', checked: S.pri === p, run: () => { S.pri = p; render(); } })), '-',
    { el: h('div', { class: 'mhead' }, 'Status') }, ...['', ...def.statuses].map(p => ({ label: p || 'Any status', checked: S.status === p, run: () => { S.status = p; render(); } })), '-',
    { el: h('div', { class: 'mhead' }, 'Date') }, { label: 'Any date', checked: !S.date, run: () => { S.date = ''; render(); } }, ...def.dates.map(([k, l]) => ({ label: l, checked: S.date === k, run: () => { S.date = k; render(); } })), '-',
    { el: h('div', { class: 'mhead' }, 'Sort by') }, ...sortOptions(kind).map(([k, l]) => ({ label: l, checked: S.sort === k, run: () => { S.sort = k; render(); } })), '-',
    { label: 'Clear filters', icon: 'close', run: () => clearFilters(S) }], { width: 260 });
  const shown = rows.slice(0, S.show);
  const allChk = h('input', { type: 'checkbox', class: 'hchk', 'aria-label': 'Select all', checked: shown.length && shown.every(r => S.sel.has(r.id)) ? true : null, onchange: e => { shown.forEach(r => e.target.checked ? S.sel.add(r.id) : S.sel.delete(r.id)); render(); } });
  list.append(...[h('div', { class: 'frow fhd', role: 'row' }, h('span', { class: 'fc-chk' }, allChk), def.cols.map((c, i) => h('span', { class: 'fc fc' + i }, c)), h('span', { class: 'fc-act' })),
    ...shown.map(r => recordRow(kind, r, S, n)),
    rows.length ? null : h('p', { class: 'hempty' }, active.length ? 'Nothing matches these filters. Clear them to see everything.' : { today: 'Nothing due today. Nice.', survey: 'No site survey is pending.', ecpar: 'No rejected ECPAR needs action.', ecx: 'No rejected ECX application here.' }[kind])].filter(Boolean));
  return h('section', { class: 'hcard ftable' },
    h('div', { class: 'fbar' }, h('div', { class: 'dchips' }, tabEls),
      h('div', { class: 'ftools' }, h('label', { class: 'hsearch glass fsearch' }, icon('search', 16), search),
        h('button', { class: 'hbtn sm glass' + (S.cat || S.pri || S.status || S.date ? ' on' : ''), 'aria-label': 'Filters and sorting', onclick: e => filterMenu(e.currentTarget) }, icon('filter', 17)))),
    active.length ? h('div', { class: 'hchips' }, active.map(([l, c]) => h('button', { class: 'hchip', onclick: () => { c(); render(); } }, l, icon('close', 13))), h('button', { class: 'link sm', onclick: () => clearFilters(S) }, 'Clear filters')) : null,
    S.sel.size ? bulkBar(kind, S, rows, n) : null,
    list,
    h('div', { class: 'pfoot' }, h('span', {}, rows.length ? `Showing ${shown.length} of ${rows.length}` : ''), rows.length > shown.length ? h('button', { class: 'btn', onclick: () => { S.show += 100; render(); } }, 'Show more') : null));
}
/** search while typing: rebuild the metrics, table and charts, but keep the search box (and the cursor) where it is */
function refreshInPlace(kind, search) {
  const wrap = search.closest('.focus'); if (!wrap) return;
  const fresh = focusScreen(kind);
  for (const sel of ['.fmetrics', '.fgrid']) { const a = wrap.querySelector(sel), b = fresh.querySelector(sel); if (a && b) a.replaceWith(b); }
  const slot = wrap.querySelector('.fsearch .tbox'); if (slot && slot !== search) slot.replaceWith(search);
}
const clearFilters = S => { Object.assign(S, { q: '', cat: '', pri: '', status: '', date: '', tab: 'all' }); render(); };
const sortOptions = kind => [['due', 'Due date'], ['cust', 'Customer'], ['pri', 'Priority'], ...(kind === 'survey' ? [['sched', 'Survey date']] : []), ...(kind === 'ecpar' || kind === 'ecx' ? [['rejected', 'Rejected date (newest)']] : [])];
function bulkBar(kind, S, rows, n) {
  const chosen = rows.filter(r => S.sel.has(r.id));
  const btn = (ic, l, run) => h('button', { class: 'btn', onclick: run }, icon(ic, 15), l);
  const done = msg => { toast(msg); S.sel.clear(); render(); };
  const statusMenu = (a, list, set) => menu(a, list.map(s => ({ label: s, run: () => { chosen.forEach(r => set(r, s)); done(chosen.length + ' updated'); } })));
  return h('div', { class: 'hbulk' }, h('b', {}, chosen.length + ' selected'),
    kind === 'today' ? btn('check', 'Mark completed', async () => { for (const r of chosen) if (r.kind !== 'project') await completeItem(r, n); done(chosen.length + ' completed'); }) : null,
    kind === 'survey' ? btn('date', 'Schedule', async () => { const v = await formModal({ title: 'Schedule ' + chosen.length + ' site surveys', fields: [{ key: 'date', type: 'date', label: 'Survey date', required: true }], ok: 'Schedule' }); if (v) { chosen.forEach(r => E.scheduleSurvey(r.row, v.date)); done('Scheduled'); } }) : null,
    kind === 'survey' ? btn('check', 'Mark completed', async () => { const v = await formModal({ title: 'Mark ' + chosen.length + ' site surveys completed', fields: [{ key: 'date', type: 'date', label: 'Survey date', required: true }], ok: 'Mark completed' }); if (v) { chosen.forEach(r => E.completeSurvey(r.row, v.date, n)); done('Completed'); } }) : null,
    kind === 'ecpar' ? btn('status', 'Set status', e => statusMenu(e.currentTarget, E.ECPAR_ACTIVE, (r, s) => E.setEcparStatus(r.row, s))) : null,
    kind === 'ecx' ? btn('status', 'Set status', e => statusMenu(e.currentTarget, ['Pending Action', 'In Review', 'Ready to Resubmit', 'Closed'], (r, s) => s === 'Closed' ? E.closeEcx(r.row, r.x) : E.setEcxStatus(r.row, r.x, s))) : null,
    h('button', { class: 'btn', onclick: () => { S.sel.clear(); render(); } }, 'Clear'));
}

// ---------- one row per page ----------
function recordRow(kind, r, S, n) {
  const chk = h('input', { type: 'checkbox', class: 'hchk', 'aria-label': 'Select ' + r.cust, checked: S.sel.has(r.id) ? true : null, onclick: e => e.stopPropagation(), onchange: e => { e.target.checked ? S.sel.add(r.id) : S.sel.delete(r.id); render(); } });
  const tab = { today: r.tab, survey: 'survey', ecpar: 'ecpar', ecx: 'ecx' }[kind] || '';
  const open = () => go('#/project/' + r.row.id + (tab ? '/' + tab : ''));
  const more = h('button', { class: 'c-act ebtn fc-act', 'aria-label': 'Actions for ' + r.cust, onclick: e => { e.stopPropagation(); rowMenu(kind, r, e.currentTarget, n); } }, icon('more', 18));
  let cells;
  if (kind === 'today') cells = [
    h('span', { class: 'fc fc0 fid' }, h('b', { class: r.no ? 'mono' : 'muted' }, r.no || 'No eCX & WBS No'), h('small', {}, r.title, h('i', { class: 'ftype' }, r.type))),
    h('span', { class: 'fc fc1' }, r.cust), h('span', { class: 'fc fc2' }, catPill(r.cats)), h('span', { class: 'fc fc3' }, priPill(r.priority)),
    h('span', { class: 'fc fc4' }, dueBadge(r.days)), h('span', { class: 'fc fc5' }, badge(r.status, { Pending: 'blue', 'In Progress': 'yellow', 'On Hold': 'orange', Completed: 'green' }[r.status]))];
  else if (kind === 'survey') cells = [
    h('span', { class: 'fc fc0 fid' }, h('b', { class: 'flink' }, r.title), h('small', { class: r.no ? 'mono' : 'muted' }, r.no || 'No eCX & WBS No')),
    h('span', { class: 'fc fc1' }, r.cust), h('span', { class: 'fc fc2' }, catPill(r.cats)), h('span', { class: 'fc fc3' }, priPill(r.priority)),
    h('span', { class: 'fc fc4' }, r.scheduled ? h('span', { class: r.status === 'Overdue' && r.sdays < 0 ? 'late' : '' }, dmy(r.scheduled)) : h('span', { class: 'muted' }, '—')),
    h('span', { class: 'fc fc5' }, badge(r.status, undefined, false))];
  else cells = [
    h('span', { class: 'fc fc0 fid' }, h('b', { class: 'flink mono' }, (kind === 'ecpar' ? r.ref : r.no) || (kind === 'ecpar' ? 'No ECPAR no.' : 'No ECX no.')), h('small', {}, kind === 'ecx' ? (r.appid || 'Revise ECX application') : 'Revise and resubmit')),
    h('span', { class: 'fc fc1' }, r.cust),
    h('span', { class: 'fc fc2 fproj' }, r.pref ? h('b', { class: 'mono' }, r.pref) : null, catPill(r.cats)),
    h('span', { class: 'fc fc3' }, rejectionDetails(r)),
    h('span', { class: 'fc fc4' }, r.rejected ? dmy(r.rejected) : h('span', { class: 'muted' }, '—')),
    h('span', { class: 'fc fc5' }, r.days == null ? h('span', { class: 'muted' }, '—') : h('span', { class: 'fdue' + (r.days < 0 ? ' late' : r.days === 0 ? ' today' : '') }, icon('date', 13), r.days === 0 ? 'Today' : formatDate(r.due, 'D/M/YYYY'))),
    h('span', { class: 'fc fc6' }, badge(r.status, undefined, false))];
  const el = h('div', { class: 'frow' + (S.sel.has(r.id) ? ' sel' : ''), role: 'row', tabindex: '0', onclick: open, onkeydown: e => { if (e.key === 'Enter' && e.target === el) open(); } }, h('span', { class: 'fc-chk' }, chk), ...cells, more);
  longPress(el, () => rowMenu(kind, r, el, n));
  return el;
}
/** reason category, reason, required correction and remarks; long text folds away */
function rejectionDetails(r) {
  const extra = [r.correction && ['Correction', r.correction], r.remarks && ['Remarks', r.remarks]].filter(Boolean);
  const long = (r.reason + extra.map(x => x[1]).join(' ')).length > 90;
  const body = [h('p', {}, r.reason || h('span', { class: 'muted' }, 'No reason recorded'))];
  const more = extra.map(([k, v]) => h('p', {}, h('b', {}, k + ': '), v));
  return h('div', { class: 'rjd' }, h('span', { class: 'rjc' }, icon('info', 13), r.rcat || 'Not categorised'),
    ...(long ? [h('details', { onclick: e => e.stopPropagation() }, h('summary', {}, body[0].textContent.slice(0, 70) + (body[0].textContent.length > 70 ? '…' : '')), ...body, ...more)] : [...body, ...more]));
}

// ---------- row actions ----------
const logFor = row => logSheet(row);
async function schedule(r) {
  const v = await formModal({ title: (r.scheduled ? 'Reschedule' : 'Schedule') + ' site survey · ' + r.cust, fields: [{ key: 'date', type: 'date', label: 'Survey date', value: r.scheduled || today(), required: true }, { key: 'note', type: 'long', label: 'Note' }], ok: r.scheduled ? 'Reschedule' : 'Schedule' });
  if (!v) return; E.scheduleSurvey(r.row, v.date, v.note); toast('Site survey ' + (r.scheduled ? 'rescheduled' : 'scheduled')); render();
}
async function completeSurveyFlow(r, n) {
  const v = await formModal({ title: 'Site survey completed · ' + r.cust, fields: [{ key: 'date', type: 'date', label: 'Survey date', value: r.scheduled || today(), required: true }, { key: 'findings', type: 'long', label: 'Findings' }], ok: 'Mark completed' });
  if (!v) return; E.completeSurvey(r.row, v.date, n); if (v.findings) { const w = E.work(r.row); D.update(w.id, { 'p:findings': [g(w, 'findings'), v.findings].filter(Boolean).join('\n') }); }
  toast('Site survey completed. It moves to the project history.'); render();
}
async function findingsFlow(r) {
  const v = await formModal({ title: 'Site survey findings · ' + r.cust, fields: [{ key: 'text', type: 'long', label: 'Findings', required: true }, ...(E.reportOnly(r.cats) ? [] : [{ key: 'loading', type: 'long', label: 'Transformer & feeder loading', value: g(E.workOf(r.row) || { f: {} }, 'loading', '') }])], ok: 'Save' });
  if (!v) return; E.surveyFindings(r.row, v.text); if (v.loading != null && v.loading !== '') D.update(E.work(r.row).id, { 'p:loading': v.loading }); toast('Findings saved'); render();
}
function rowMenu(kind, r, anchor, n) {
  const open = tab => go('#/project/' + r.row.id + (tab ? '/' + tab : ''));
  const items = [];
  if (kind === 'today') {
    items.push({ label: 'Open project', icon: 'expand', run: () => open(r.tab) }, { label: 'Mark completed', icon: 'check', run: () => completeItem(r, n) },
      { label: 'Priority…', icon: 'sort', run: () => menu(anchor, ['High', 'Medium', 'Low'].map(p => ({ label: p, checked: r.priority === p, run: () => { if (r.kind === 'task') D.update(r.task.id, { 'p:priority': p }); else setRowProp(r.row, 'Priority', p); render(); } }))) });
    if (r.kind === 'task') items.push({ label: 'Status…', icon: 'status', run: () => menu(anchor, ['Pending', 'In Progress', 'On Hold'].map(s => ({ label: s, checked: r.status === s, run: () => { D.update(r.task.id, { 'p:status': s }); render(); } }))) },
      { label: 'Task type…', icon: 'list', run: () => menu(anchor, E.TASK_TYPES.map(s => ({ label: s, checked: r.type === s, run: () => { D.update(r.task.id, { 'p:type': s }); render(); } }))) });
  } else if (kind === 'survey') {
    items.push({ label: r.scheduled ? 'Reschedule survey' : 'Schedule survey', icon: 'date', run: () => schedule(r) }, { label: 'Mark survey completed', icon: 'check', run: () => completeSurveyFlow(r, n) },
      { label: 'Record findings', icon: 'pencil', run: () => findingsFlow(r) }, { label: 'Priority…', icon: 'sort', run: () => menu(anchor, ['High', 'Medium', 'Low'].map(p => ({ label: p, checked: r.priority === p, run: () => { setRowProp(r.row, 'Priority', p); render(); } }))) },
      { label: 'Open project', icon: 'expand', run: () => open('survey') });
  } else if (kind === 'ecpar') {
    items.push({ label: 'Review ECPAR', icon: 'expand', run: () => open('ecpar') },
      { label: 'Update revision status…', icon: 'status', run: () => menu(anchor, E.ECPAR_ACTIVE.map(s => ({ label: s, checked: r.status === s, run: () => { E.setEcparStatus(r.row, s); render(); } }))) },
      { label: 'Edit rejection details', icon: 'pencil', run: async () => { if (await editRejectionFlow(E.ecpar(r.row), E.ECPAR_REASONS)) render(); } },
      { label: 'Resubmit ECPAR', icon: 'redo', run: async () => { if (await resubmitEcparFlow(r.row)) render(); } },
      { label: 'Mark approved', icon: 'check', run: async () => { if (await approveEcparFlow(r.row)) render(); } });
  } else {
    items.push({ label: 'Review ECX', icon: 'expand', run: () => open('ecx') },
      { label: 'Update status…', icon: 'status', run: () => menu(anchor, ['Pending Action', 'In Review', 'Ready to Resubmit', 'Closed'].map(s => ({ label: s, checked: r.status === s, run: () => { if (s === 'Closed') E.closeEcx(r.row, r.x); else E.setEcxStatus(r.row, r.x, s); render(); } }))) },
      { label: 'Edit rejection details', icon: 'pencil', run: async () => { if (await editRejectionFlow(r.x, E.ECX_REASONS)) render(); } });
    if (r.status !== 'Closed') items.push({ label: 'Resubmit ECX', icon: 'redo', run: async () => { if (await resubmitEcxFlow(r.row, r.x)) render(); } }, { label: 'Mark approved', icon: 'check', run: async () => { if (await approveEcxFlow(r.row, r.x)) render(); } });
  }
  items.push('-', { label: 'Log activity', icon: 'history', run: () => logFor(r.row) });
  menu(anchor, items, { width: 250 });
}

// ---------- right panel: doughnut, breakdown, quick actions ----------
function donutCard(def, base) {
  const d = def.donut, counts = Object.fromEntries(d.order.map(k => [k, 0])); for (const r of base) { const k = d.key(r); if (k in counts) counts[k]++; }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const R = 46, C = 2 * Math.PI * R, gap = total > 1 ? 2 : 0;
  let off = 0; const segs = [];
  for (const k of d.order) { const v = counts[k]; if (!v) continue; const len = C * v / total; segs.push(`<circle cx="60" cy="60" r="${R}" fill="none" stroke="${d.colors[k]}" stroke-width="14" stroke-dasharray="${Math.max(0, len - gap)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"><title>${k}: ${v}</title></circle>`); off += len; }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 120 120'); svg.setAttribute('class', 'donut'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', d.title + ': ' + d.order.map(k => k + ' ' + counts[k]).join(', '));
  svg.innerHTML = `<circle cx="60" cy="60" r="${R}" fill="none" stroke="var(--bg2)" stroke-width="14"/>` + segs.join('') + `<text x="60" y="60" text-anchor="middle" class="dn">${total}</text><text x="60" y="76" text-anchor="middle" class="du">${def.unit}</text>`;
  return h('section', { class: 'hcard fpanel' }, h('div', { class: 'chead' }, icon('date', 18), h('h2', {}, d.title)),
    h('div', { class: 'dwrap' }, svg, h('ul', { class: 'dleg' }, d.order.map(k => h('li', {}, h('i', { style: { background: d.colors[k] } }), h('span', {}, k), h('b', {}, counts[k]), h('small', {}, '(' + (total ? Math.round(counts[k] / total * 100) : 0) + '%)'))))));
}
function barsCard(def, base) {
  const b = def.bars, counts = new Map(); for (const r of base) { const k = b.key(r); counts.set(k, (counts.get(k) || 0) + 1); }
  const keys = b.order.filter(k => counts.get(k) || (def.bars.title !== 'By Project Category' && k !== 'Not categorised')), total = base.length;
  return h('section', { class: 'hcard fpanel' }, h('div', { class: 'chead' }, icon(b.icon, 18), h('h2', {}, b.title)),
    keys.length ? h('ul', { class: 'fbars' }, keys.map((k, i) => { const v = counts.get(k) || 0, pct = total ? Math.round(v / total * 100) : 0;
      return h('li', {}, h('span', { class: 'fbl' }, (b.label || (x => x))(k)), h('span', { class: 'fbt' }, h('i', { style: { width: pct + '%', background: b.colors[k] || CAT_COLORS[i % CAT_COLORS.length] } })), h('b', {}, v), h('small', {}, '(' + pct + '%)')); }))
      : h('p', { class: 'hempty' }, 'Nothing to break down yet.'));
}
function quickCard(kind) {
  const qa = (ic, label, run) => h('button', { class: 'qa', onclick: run }, icon(ic, 20), h('span', {}, label));
  const pickFrom = async (title, list) => {
    if (!list.length) { toast('Nothing in this list right now.'); return null; }
    return new Promise(res => { let chosen = null;
      const s = sheet(title, h('ul', { class: 'plpick' }, list.map(r => h('li', {}, h('button', { onclick: () => { chosen = r; s.close(); } }, h('b', {}, r.cust), h('small', {}, [r.ref || r.no || r.title, r.status].filter(Boolean).join(' · ')))))), { done: 'Cancel', onDone: () => res(chosen) });
    });
  };
  const recs = () => PAGES[kind].records(NOW());
  const common = [qa('plus', 'New Project', () => newProjectSheet())];
  const logQA = qa('history', 'Log Activity', async () => { const row = await pickProject('Log activity for…'); if (row) logSheet(row); });
  let btns;
  if (kind === 'today') btns = [...common,
    qa('filex', 'Add ECX', async () => { const row = await pickProject('Add ECX to…', { fullOnly: true }); if (!row) return; const no = await promptBox('New ECX application', '', 'ECX number (you can add it later)'); if (no == null) return; E.addEcx(row, no.trim()); go('#/project/' + row.id + '/ecx'); }),
    qa('ecpar', 'Add ECPAR', async () => { const row = await pickProject('Add ECPAR to…', { fullOnly: true }); if (!row) return; if (E.ecparOf(row)) { toast('This project already has its ECPAR. Opening it.'); } else { E.ecpar(row); E.log(row, 'ECPAR', 'ECPAR record added.', { ecpar: true }); } go('#/project/' + row.id + '/ecpar'); }), logQA];
  else if (kind === 'survey') btns = [...common,
    qa('date', 'Schedule Site Survey', async () => { const r = await pickFrom('Schedule which survey?', recs().filter(x => x.status !== 'Scheduled')); if (r) schedule(r); }),
    qa('pencil', 'Update Site Survey', async () => { const r = await pickFrom('Update which survey?', recs()); if (r) menu(document.querySelector('.f-survey .qgrid') || document.body, [{ label: r.scheduled ? 'Reschedule' : 'Schedule', icon: 'date', run: () => schedule(r) }, { label: 'Mark completed', icon: 'check', run: () => completeSurveyFlow(r, NOW()) }, { label: 'Record findings', icon: 'pencil', run: () => findingsFlow(r) }]); }), logQA];
  else if (kind === 'ecpar') btns = [
    qa('expand', 'Review ECPAR', async () => { const r = await pickFrom('Review which ECPAR?', recs()); if (r) go('#/project/' + r.row.id + '/ecpar'); }),
    qa('pencil', 'Update Revision', async () => { const r = await pickFrom('Update which ECPAR?', recs()); if (r) menu(document.querySelector('.f-ecpar .qgrid') || document.body, [...E.ECPAR_ACTIVE.map(s => ({ label: 'Status: ' + s, checked: r.status === s, run: () => { E.setEcparStatus(r.row, s); render(); } })), '-', { label: 'Edit rejection details', icon: 'pencil', run: async () => { if (await editRejectionFlow(E.ecpar(r.row), E.ECPAR_REASONS)) render(); } }]); }),
    qa('redo', 'Resubmit ECPAR', async () => { const r = await pickFrom('Resubmit which ECPAR?', recs()); if (r && await resubmitEcparFlow(r.row)) render(); }), logQA];
  else btns = [
    qa('expand', 'Review ECX', async () => { const r = await pickFrom('Review which ECX?', recs().filter(x => x.status !== 'Closed')); if (r) go('#/project/' + r.row.id + '/ecx'); }),
    qa('pencil', 'Update ECX', async () => { const r = await pickFrom('Update which ECX?', recs()); if (r) menu(document.querySelector('.f-ecx .qgrid') || document.body, [...['Pending Action', 'In Review', 'Ready to Resubmit', 'Closed'].map(s => ({ label: 'Status: ' + s, checked: r.status === s, run: () => { if (s === 'Closed') E.closeEcx(r.row, r.x); else E.setEcxStatus(r.row, r.x, s); render(); } })), '-', { label: 'Edit rejection details', icon: 'pencil', run: async () => { if (await editRejectionFlow(r.x, E.ECX_REASONS)) render(); } }]); }),
    qa('redo', 'Resubmit ECX', async () => { const r = await pickFrom('Resubmit which ECX?', recs().filter(x => x.active)); if (r && await resubmitEcxFlow(r.row, r.x)) render(); }), logQA];
  return h('section', { class: 'hcard fpanel' }, h('div', { class: 'chead' }, icon('play', 18), h('h2', {}, 'Quick Actions')), h('div', { class: 'qgrid' }, btns));
}

/** how many records each Focus page lists (no filters): used by the sidebar so the numbers always agree */
export function focusCounts(n) {
  const out = {};
  for (const k of Object.keys(PAGES)) { const all = PAGES[k].records(n); out[k] = all.filter(PAGES[k].tabs[0][3]).length; }
  return out;
}
