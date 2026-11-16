// Folio v2 — Home (approved final design): cover + greeting, KPI summary bar, Due Today (All / Site Survey / Rejected Queue),
// live clock + Recent Activity, KPI Trend (6 months), By Project Category, Quick Actions and a full calendar (Month / Week / Day).
// Every number comes from the project, task, ECPAR, ECX and Activity Log records.
import * as D from './data.js';
import * as DB from './db.js';
import * as E from './entities.js';
import { h, icon, menu, sheet, toast, confirmBox, promptBox, strip } from './ui.js';
import { formatDate, toISODate, dateBetween, dateAdd, startOfDay, isDate, parseDate } from './dates.js';
import { state, now as NOW, render, go, moreMenu, L, toggleSide, back } from './app.js';
import { newProjectSheet, setProjectFilter, badge } from './project.js';
import { coverAndPhoto } from './page.js';
import * as KF from './kpi.js';
import * as C from './cols.js';

let dueFilter = 'all', calView = 'month', calAnchor = null, duePf = [], dueSort = 'due';
const TZ = 'Asia/Kuching';
const SHORT = { 'Turnkey Stage 1': 'Turnkey S1', 'Turnkey Stage 2': 'Turnkey S2', 'Substation Site Enquiry': 'Substation', 'Upgrading of Supply': 'Upgrading', 'Temporary Supply': 'Temporary' };
const short = c => SHORT[c] || c;
const flat = g => [...(g.overdue || []), ...(g.today || []), ...(g.upcoming || [])];
const iso = d => toISODate(d);
const P = n => { const d = DB.kpiDb(); return d && DB.propByName(d, n); };
export function setHomeTab(t) { if (['all', 'survey', 'rejected'].includes(t)) dueFilter = t; }

/** the one record that keeps Home's cover photo and profile photo (synced with the workspace) */
function homeRec() { return D.live('home') || D.getRec('home') || D.create('home', 'ws', { id: 'home', created: Date.now() }); }

export function homeScreen() {
  E.ensureAll();
  const n = NOW(), dbr = DB.kpiDb();
  state.ctx = { more: a => homeMore(a) };
  const wrap = h('div', { class: 'wrap home dash' }, hero(n));
  if (!dbr) { wrap.append(h('section', { class: 'hcard soon' }, h('p', {}, 'Import your Notion export, or make the Planning KPI Tracker, to see your workspace here.'), h('button', { class: 'hnew', onclick: () => { DB.createKpiTracker(); render(); } }, icon('plus', 16), h('span', {}, 'Make the tracker')))); return wrap; }
  const all = DB.rows(dbr.id).map(r => DB.kpiInfo(r, dbr, n));
  wrap.append(kpiBar(all, n),
    h('div', { class: 'dgrid' },
      dueCard(n), midCard(n), trendCard(all, n), categoryCard(all), calendarCard(n)));
  return wrap;
}
/** the Home cover photo, also shown as the banner of the Focus pages */
export function coverInto(el) {
  const rec = D.live('home'), cover = rec && D.val(rec, 'cover');
  el.classList.add('cover'); if (!cover) el.classList.add('default');
  if (cover) import('./page.js').then(m => m.fileUrl(cover.id)).then(u => { if (u) el.style.backgroundImage = `url("${u}")`; });
  if (rec) el.style.backgroundPosition = D.val(rec, 'coverPos', '50% 50%');
  return el;
}
const homeMore = a => moreMenu(a, { extra: [{ label: 'Open Planning KPI Tracker', icon: 'table', run: () => go('#/tracker') }] });

// ---------- cover, profile photo, greeting ----------
function hero(n) {
  const rec = homeRec();
  const { out, av } = coverAndPhoto(rec, { always: true });
  const hr = +new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date(n));
  const part = hr < 12 ? 'Morning' : hr < 18 ? 'Afternoon' : 'Evening';
  const name = L('profile.name', ''), first = name.trim().split(/\s+/)[0];
  const alerts = DB.kpiDb() ? DB.kpiTasks(n).filter(t => t.days != null && t.days <= 0).length + E.dueTasks(n).length : 0;
  return h('header', { class: 'hero' }, ...out, heroNav(),
    h('div', { class: 'hero-in' },
      av,
      h('div', { class: 'hero-t' }, h('small', {}, 'Home'), h('h1', {}, `Good ${part}${first ? ', ' + first : ''} 👋`), h('p', {}, 'Here’s your planning overview today.')),
      h('div', { class: 'hero-a' }, quickActions(),
        h('button', { class: 'hbtn glass', 'aria-label': alerts ? `Notifications, ${alerts} due or overdue` : 'Notifications', onclick: () => go('#/inbox') }, icon('bell', 19), alerts ? h('i', { class: 'hdot' }) : null),
        h('button', { class: 'hbtn glass', 'aria-label': 'More options', onclick: e => homeMore(e.currentTarget) }, icon('more', 19)))));
}

// ---------- KPI summary bar ----------
export function kpiNumbers(all, n) {
  const today = new Date(n), mStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const active = all.filter(t => !t.archived), done = active.filter(t => t.finished), prog = active.filter(t => !t.finished);
  const t0 = startOfDay(today), overdue = prog.filter(t => { const d = t.row && DB.value(t.row, P('Due Date')); return d && startOfDay(d) < t0; });
  const added = active.filter(t => { const d = t.assigned || new Date(D.val(t.row, 'created', 0)); return d >= mStart; }).length;
  return { active: active.length, done: done.length, prog: prog.length, overdue: overdue.length, added, kpi: kpiPct(all.filter(t => t.archived || t.finished)) };
}
/** KPI achievement: completed within 7 days of Date Assigned, out of completed projects that have both dates */
function kpiPct(list) { // same rule as the KPI page (configured start, completion event and day counting)
  const s = KF.summary(list.map(t => KF.facts(t.row)));
  return s.pct == null ? null : Math.round(s.pct);
}
function kpiBar(all, n) {
  const k = kpiNumbers(all, n), pc = v => k.active ? Math.round(v / k.active * 100) + '%' : '—';
  const cell = (cls, ic, label, val, chip, onclick) => h('button', { class: 'kb ' + cls, onclick }, h('span', { class: 'kbi' }, icon(ic, 20)),
    h('span', { class: 'kbt' }, h('small', {}, label), h('span', { class: 'kbv' }, h('b', {}, val), chip)));
  return h('section', { class: 'kbar5', 'aria-label': 'Summary' },
    cell('k-act', 'folder', 'Active Projects', String(k.active), h('em', { class: 'kch up' }, (k.added ? '↑ +' + k.added : '+0'), h('span', {}, 'this month')), () => go('#/projects')),
    cell('k-done', 'okcircle', 'Completed', String(k.done), h('em', { class: 'kch green' }, pc(k.done)), () => go('#/projects')),
    cell('k-prog', 'today', 'In Progress', String(k.prog), h('em', { class: 'kch gray' }, pc(k.prog)), () => go('#/projects')),
    cell('k-over', 'info', 'Overdue', String(k.overdue), h('em', { class: 'kch red' }, pc(k.overdue)), () => go('#/projects')),
    cell('k-kpi', 'target', 'KPI Achievement', k.kpi == null ? '—' : k.kpi + '%', h('em', { class: 'kch green' }, icon('check', 12), 'Target 100%'), () => go('#/kpi')));
}

// ---------- Due Today: All / Site Survey / Rejected Queue ----------
/** one list, each item once: tasks due, projects due in 2 days, site surveys due, rejected ECPAR and rejected ECX */
export function dueItems(n) {
  const out = new Map();
  const add = (key, it) => { if (!out.has(key)) out.set(key, it); };
  for (const t of flat(DB.ecparGroups(n))) add('ep' + t.id, { key: 'ep' + t.id, kind: 'ecpar', row: t.row, title: 'Revise ECPAR', cust: t.title, ecx: t.ecx, cats: t.category, status: 'Rejected', priority: t.priority, due: t.due, days: t.days, tab: 'ecpar' });
  for (const t of flat(DB.ecxGroups(n))) add('x' + t.ecxId, { key: 'x' + t.ecxId, kind: 'ecx', ecxId: t.ecxId, row: t.row, title: 'Resubmit ' + (t.ecx || 'ECX'), cust: t.title, ecx: t.ecx, cats: t.category, status: 'Rejected', due: t.due, days: t.days, tab: 'ecx' });
  for (const x of E.dueTasks(n)) add('t' + x.task.id, { key: 't' + x.task.id, kind: 'task', task: x.task, row: x.row, title: x.name, cust: x.customer, ecx: x.info.ecx, cats: x.info.category, status: E.g(x.task, 'status') || 'Not Started', due: parseDate(E.g(x.task, 'due')), days: x.days, tab: 'tasks' });
  const sv = DB.surveyGroups(n);
  for (const t of [...sv.overdue, ...sv.today]) add('p' + t.id, { key: 'p' + t.id, kind: 'survey', row: t.row, title: 'Site survey', cust: t.title, ecx: t.ecx, cats: t.category, status: 'Site Survey', due: t.due, days: t.days, tab: 'survey' });
  for (const t of flat(DB.todayGroups(n))) if (!t.amend) add('p' + t.id, { key: 'p' + t.id, kind: 'project', row: t.row, title: t.status === 'Estimation' ? 'Estimation due' : 'Project due', cust: t.title, ecx: t.ecx, cats: t.category, status: t.status || 'Open', due: t.due, days: t.days, tab: 'overview' });
  // rejected follow-ups count once they are due (today or overdue)
  return [...out.values()].filter(it => !(it.kind === 'ecpar' || it.kind === 'ecx') || (it.days != null && it.days <= 0)).sort((a, b) => (a.days ?? 999) - (b.days ?? 999) || a.cust.localeCompare(b.cust));
}
const dueText = it => it.days == null ? '—' : it.days === 0 ? 'Today' : it.days === 1 ? 'Tomorrow' : it.days === -1 ? 'Yesterday' : it.due ? formatDate(it.due, 'DD/MM/YYYY') : '—';
export async function completeItem(it, n) {
  const day = iso(new Date(n));
  if (it.kind === 'task') { E.completeTask(it.task, true, n); toast('Task completed'); }
  else if (it.kind === 'survey') { E.completeSurvey(it.row, day, n); toast('Site survey completed'); }
  else if (it.kind === 'ecpar') { E.resubmitEcpar(it.row, day, ''); toast('ECPAR marked resubmitted'); }
  else if (it.kind === 'ecx') { const x = D.live(it.ecxId); if (x) E.resubmitEcx(it.row, x, day, ''); toast('ECX marked resubmitted'); }
  else {
    if (!(await confirmBox('Mark ' + it.cust + ' as completed?', 'Mark completed'))) { render(); return; }
    const st = P('Status'), dc = P('Date Completed'); D.update(it.row.id, { ['p:' + st.id]: 'Done', ...(dc ? { ['p:' + dc.id]: day } : {}) }); E.log(it.row, 'Project', 'Project completed.'); toast('Project completed');
  }
  render();
}
function dueCard(n) {
  const dbr = DB.kpiDb(), all = dueItems(n);
  // filter by any project property (same filter as the Projects table), then sort
  const items = C.applyFilters(dbr, all, duePf, it => it.row, n);
  const pv = (row, name) => { const p = P(name); return p ? DB.value(row, p) : ''; };
  const addr = it => String(pv(it.row, 'Address') || '').trim(), pin = it => String(pv(it.row, 'Pin Location') || '').trim();
  const by = { due: (a, b) => (a.days ?? 99999) - (b.days ?? 99999), cust: (a, b) => a.cust.localeCompare(b.cust), addr: (a, b) => (addr(a) || '\uffff').localeCompare(addr(b) || '\uffff') }[dueSort];
  items.sort((a, b) => by(a, b) || a.cust.localeCompare(b.cust));
  const groups = { all: items, survey: items.filter(i => i.kind === 'survey'), rejected: items.filter(i => i.kind === 'ecpar' || i.kind === 'ecx') };
  const list = groups[dueFilter];
  const chip = (k, ic, label) => h('button', { class: 'dchip' + (dueFilter === k ? ' on' : ''), 'aria-pressed': dueFilter === k ? 'true' : 'false', onclick: () => { dueFilter = k; render(); } }, ic ? icon(ic, 14) : null, label, h('span', { class: 'dcount' }, groups[k].length));
  const pill = (text, tone) => badge(text, tone, false);
  const statusPill = it => it.status === 'Rejected' ? pill('Rejected', 'red') : it.status === 'Site Survey' ? pill('Site Survey', 'blue') : pill(it.status, { 'In Progress': 'blue', Completed: 'green', 'On Hold': 'orange', Estimation: 'yellow' }[it.status] || 'gray');
  // a pin is a map link, or coordinates ("1.33, 103.2") that open in Maps
  const mapLink = v => /^https?:\/\//i.test(v) ? v : /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(v) ? 'https://maps.apple.com/?q=' + encodeURIComponent(v.replace(/\s+/g, '')) : null;
  const pinText = v => { try { const u = new URL(v); return u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? u.pathname.slice(0, 18) + (u.pathname.length > 18 ? '…' : '') : ''); } catch { return v; } };
  const row = it => {
    const late = it.days != null && it.days < 0, a = addr(it), pn = pin(it), href = pn && mapLink(pn);
    const open = () => go('#/project/' + it.row.id + '/' + it.tab);
    return h('div', { class: 'drow', role: 'row', tabindex: '0', onclick: open, onkeydown: e => { if (e.key === 'Enter') open(); } },
      h('input', { type: 'checkbox', class: 'hchk', 'aria-label': 'Complete ' + it.title + ' for ' + it.cust, onclick: e => e.stopPropagation(), onchange: () => completeItem(it, n) }),
      h('div', { class: 'dmain' },
        h('b', { class: 'dname' }, it.cust),
        h('span', { class: 'daddr' + (a ? '' : ' muted') }, icon('home', 13), a || 'No address'),
        pn ? (href ? h('a', { class: 'dpin', href, target: '_blank', rel: 'noopener', onclick: e => e.stopPropagation(), 'aria-label': 'Open pin location for ' + it.cust }, icon('pin', 13), pinText(pn))
          : h('span', { class: 'dpin' }, icon('pin', 13), pn)) : h('span', { class: 'dpin muted' }, icon('pin', 13), 'No pin location'),
        h('small', {}, it.kind === 'task' ? h('span', {}, it.title) : null, it.cats.length ? h('span', { class: 'dcat' }, short(it.cats[0])) : null, it.ecx ? h('span', { class: 'mono' }, String(it.ecx).split('\n')[0]) : null)),
      h('span', { class: 'dstat' }, statusPill(it)),
      h('span', { class: 'ddue' + (late ? ' late' : '') }, icon('date', 14), dueText(it)));
  };
  const addFilter = pid => C.addFilterSheet(dbr, f => { duePf = [...duePf, f]; render(); }, pid);
  const filterMenu = a => menu(a, [
    { el: h('div', { class: 'mhead' }, 'Sort by') }, ...[['due', 'Due date'], ['cust', 'Customer Name'], ['addr', 'Address']].map(([k, l]) => ({ label: l, checked: dueSort === k, run: () => { dueSort = k; render(); } })), '-',
    { label: 'Filter by any property…', icon: 'plus', run: () => addFilter() }, ...(duePf.length ? [{ label: 'Clear filters', icon: 'close', run: () => { duePf = []; render(); } }] : [])], { width: 250 });
  const chips = duePf.map(f => h('button', { class: 'hchip', onclick: () => { duePf = duePf.filter(x => x !== f); render(); } }, C.filterText(dbr, f), icon('close', 13)));
  return h('section', { class: 'hcard dcard c-due' },
    h('div', { class: 'chead' }, icon('folder', 18), h('h2', {}, 'All Project'), h('span', { class: 'hcount' }, items.length),
      h('button', { class: 'hbtn sm glass dfilter' + (duePf.length || dueSort !== 'due' ? ' on' : ''), 'aria-label': 'Filter and sort', onclick: e => { e.stopPropagation(); filterMenu(e.currentTarget); } }, icon('filter', 16)),
      h('a', { class: 'hall', href: '#/today' }, 'View All', icon('chevr', 13))),
    h('div', { class: 'dchips' }, chip('all', 'date', 'Due Today'), chip('survey', 'target', 'Site Survey'), chip('rejected', 'xcircle', 'Rejected Queue')),
    chips.length ? h('div', { class: 'hchips' }, chips) : null,
    h('div', { class: 'dlist', role: 'table' }, list.length ? list.map(row) : h('p', { class: 'hempty' }, duePf.length ? 'Nothing matches these filters.' : { all: 'Nothing due today. Nice.', survey: 'No site survey due today.', rejected: 'No rejected ECPAR or ECX waiting.' }[dueFilter])));
}

// ---------- live clock + Recent Activity ----------
function clockText() {
  const d = new Date();
  const t = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).formatToParts(d);
  const get = k => (t.find(p => p.type === k) || {}).value || '';
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d).replace(/^(\w+) /, '$1, ');
  return { time: `${get('hour')}:${get('minute')}:${get('second')}`, ap: get('dayPeriod').toUpperCase(), day };
}
let clockTimer = null;
function midCard(n) {
  const c = clockText();
  const time = h('b', { class: 'ctime' }, c.time), ap = h('small', { class: 'cap' }, c.ap), day = h('span', { class: 'cday' }, c.day);
  clearInterval(clockTimer);
  clockTimer = setInterval(() => { if (!time.isConnected) { clearInterval(clockTimer); return; } const x = clockText(); time.textContent = x.time; ap.textContent = x.ap; day.textContent = x.day; }, 1000);
  const ev = activity(4, n);
  return h('section', { class: 'hcard mcard c-mid' },
    h('div', { class: 'clock glass', role: 'timer', 'aria-label': 'Malaysia time' }, h('span', { class: 'ctz' }, icon('today', 14), 'MYT (UTC+8)'), h('div', {}, time, ap), day),
    h('div', { class: 'chead' }, icon('linechart', 18), h('h2', {}, 'Recent Activity'), h('a', { class: 'hall', href: '#/activity' }, 'View All', icon('chevr', 13))),
    ev.length ? h('ol', { class: 'tline' }, ev.map(feedItem)) : h('p', { class: 'hempty' }, 'Site surveys, ECPAR and ECX updates you record show up here.'));
}
const feedItem = e => h('li', {}, h('button', { onclick: () => go('#/project/' + e.id + (e.tab ? '/' + e.tab : '')) },
  h('span', { class: 'ticon ' + e.tone }, icon(e.icon, 14)),
  h('span', { class: 'ttext' }, h('b', {}, e.title), h('small', {}, [e.cust, e.cat].filter(Boolean).join(' · '))),
  h('small', { class: 'twhen' }, e.when)));
function when(t, n) {
  const d = new Date(t), days = Math.round((startOfDay(new Date(n)) - startOfDay(d)) / 864e5);
  return days <= 0 ? new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: true }).format(d) : days === 1 ? 'Yesterday' : formatDate(d, 'DD/MM/YYYY');
}
/** latest entries of every project's Activity Log (and comments), newest first */
export function activity(limit = 6, n = NOW()) {
  const dbr = DB.kpiDb(); if (!dbr) return [];
  const rows = new Map(DB.rows(dbr.id).map(r => [r.id, r]));
  const ev = [];
  for (const a of D.all('act')) {
    const r = rows.get(D.val(a, 'project')); if (!r) continue;
    const type = D.val(a, 'type', 'Note'), e = D.val(a, 'ev'), what = D.val(a, 'ecpar') ? 'ECPAR' : D.val(a, 'ecx') ? 'ECX' : '';
    const text = D.val(a, 'text', '');
    let title = text.split(/(?<=\.)\s/)[0].replace(/\.$/, ''), tone = 'gray', ic = 'page', tab = 'log';
    if (e === 'rejected') { title = what + ' Rejected'; tone = 'red'; ic = 'close'; tab = what === 'ECX' ? 'ecx' : 'ecpar'; }
    else if (e === 'resubmitted') { title = what + ' Resubmitted'; ic = 'redo'; tab = what === 'ECX' ? 'ecx' : 'ecpar'; }
    else if (e === 'approved') { title = what + ' Approved'; tone = 'green'; ic = 'check'; tab = what === 'ECX' ? 'ecx' : 'ecpar'; }
    else if (type === 'Site survey') { title = 'Site Survey Completed'; tone = 'green'; ic = 'check'; tab = 'survey'; }
    else if (/completed/i.test(text)) { tone = 'green'; ic = 'check'; }
    ev.push({ t: D.val(a, 't', 0), id: r.id, title, tone, icon: ic, tab, note: text, cust: DB.title(r), cat: [].concat(DB.value(r, P('Project Category')) || [])[0] || '' });
  }
  for (const c of D.all('cmt')) { const r = rows.get(D.val(c, 'parent')); if (r) ev.push({ t: D.val(c, 'created', 0), id: r.id, title: 'Comment', tone: 'yellow', icon: 'comment', tab: 'log', note: strip(D.val(c, 'text', '')).slice(0, 120), cust: DB.title(r), cat: [].concat(DB.value(r, P('Project Category')) || [])[0] || '' }); }
  if (ev.length < limit) for (const r of rows.values()) { const t = D.val(r, 'created', 0); if (t) ev.push({ t, id: r.id, title: 'Project created', tone: 'gray', icon: 'plus', tab: '', cust: DB.title(r), cat: [].concat(DB.value(r, P('Project Category')) || [])[0] || '' }); }
  return ev.sort((a, b) => b.t - a.t).slice(0, limit).map(e => ({ ...e, when: when(e.t, n) }));
}
export function activityScreen() {
  const n = NOW(); state.ctx = {};
  const ev = activity(400, n);
  return h('div', { class: 'wrap home' }, h('header', { class: 'hhead' }, h('div', { class: 'htitle' }, h('h1', {}, 'Recent Activity'), h('p', { class: 'hsub' }, 'From every project’s Activity Log, newest first'))),
    h('section', { class: 'hcard pcard' }, ev.length ? h('ol', { class: 'tline full' }, ev.map(e => feedItem({ ...e, cat: [e.cat, e.note && e.note !== e.title + '.' ? e.note : ''].filter(Boolean).join(' · ') }))) : h('p', { class: 'hempty' }, 'Nothing recorded yet.')));
}

// ---------- KPI Trend (last 6 months) ----------
export function kpiTrend(all, n) {
  const now = new Date(n), out = [];
  for (let i = 5; i >= 0; i--) {
    const m = new Date(now.getFullYear(), now.getMonth() - i, 1), m2 = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    const inMonth = all.filter(t => isDate(t.completed) && t.completed >= m && t.completed < m2 && (t.archived || t.finished));
    out.push({ label: formatDate(m, 'MMM'), month: formatDate(m, 'MMMM YYYY'), v: kpiPct(inMonth), count: inMonth.length });
  }
  return out;
}
function trendCard(all, n) {
  const pts = kpiTrend(all, n), have = pts.filter(p => p.v != null);
  const last = [...pts].reverse().find(p => p.v != null);
  const badgeEl = h('span', { class: 'tbadge' }, last ? last.v + '%' : '—');
  const head = h('div', { class: 'chead' }, icon('linechart', 18), h('h2', {}, 'KPI Trend'), h('small', { class: 'muted' }, '(Last 6 Months)'));
  if (!have.length) return h('section', { class: 'hcard tcard c-trend' }, head, h('p', { class: 'hempty' }, 'Completed projects with a Date Assigned and Date Completed build this chart.'));
  const H = 210, L0 = 40, R0 = 12, T0 = 30, B0 = 26;
  const tip = h('span', { class: 'ttip', hidden: true });
  // drawn at the card's real width (not stretched), so the labels stay the same size as the rest of the text
  const draw = W => {
    const lo = Math.max(0, Math.min(80, Math.floor((Math.min(...have.map(p => p.v)) - 5) / 5) * 5)), hi = 100;
    const x = i => L0 + i * (W - L0 - R0) / 5, y = v => T0 + (hi - v) / (hi - lo) * (H - T0 - B0);
    const ticks = []; const step = (hi - lo) / 4; for (let i = 0; i <= 4; i++) ticks.push(Math.round(lo + step * i));
    const seq = pts.map((p, i) => p.v == null ? null : [x(i), y(p.v)]).filter(Boolean);
    const line = seq.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
    const area = seq.length > 1 ? line + ` L${seq[seq.length - 1][0].toFixed(1)} ${H - B0} L${seq[0][0].toFixed(1)} ${H - B0} Z` : '';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'tchart'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'KPI achievement by month: ' + pts.map(p => p.label + ' ' + (p.v == null ? 'no data' : p.v + '%')).join(', '));
    svg.innerHTML = `<defs><linearGradient id="tgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3B8A55" stop-opacity=".22"/><stop offset="1" stop-color="#3B8A55" stop-opacity="0"/></linearGradient></defs>`
      + ticks.map(t => `<line x1="${L0}" x2="${W - R0}" y1="${y(t)}" y2="${y(t)}" class="tgrid"/><text x="${L0 - 8}" y="${y(t) + 4}" class="tax" text-anchor="end">${t}%</text>`).join('')
      + pts.map((p, i) => `<text x="${x(i)}" y="${H - 6}" class="tax" text-anchor="middle">${p.label}</text>`).join('')
      + (area ? `<path d="${area}" fill="url(#tgrad)"/>` : '') + `<path d="${line}" class="tline2"/>`
      + pts.map((p, i) => p.v == null ? '' : `<g class="tpt" data-i="${i}"><circle cx="${x(i)}" cy="${y(p.v)}" r="14" class="thit"/><circle cx="${x(i)}" cy="${y(p.v)}" r="4.5" class="tdot"/><title>${p.month}: ${p.v}% (${p.count} completed)</title></g>`).join('');
    const show = i => { const p = pts[i]; if (!p || p.v == null) return; tip.hidden = false; tip.textContent = `${p.month}: ${p.v}% · ${p.count} completed`; badgeEl.textContent = p.v + '%'; };
    svg.querySelectorAll('.tpt').forEach(g => { const i = +g.dataset.i; g.addEventListener('pointerenter', () => show(i)); g.addEventListener('click', () => show(i)); });
    svg.addEventListener('pointerleave', () => { tip.hidden = true; badgeEl.textContent = last.v + '%'; });
    return svg;
  };
  let svg = draw(320), drawnW = 320;
  const box = h('div', { class: 'tbox' }, badgeEl, svg, tip);
  const fit = () => { const w = Math.round(box.clientWidth); if (w > 0 && Math.abs(w - drawnW) > 2) { const n = draw(w); svg.replaceWith(n); svg = n; drawnW = w; } };
  if (window.ResizeObserver) new ResizeObserver(fit).observe(box); requestAnimationFrame(fit);
  return h('section', { class: 'hcard tcard c-trend' }, head, box);
}

// ---------- By Project Category ----------
function categoryCard(all) {
  const done = all.filter(t => t.archived || t.finished);
  return h('section', { class: 'hcard ccard c-cat' },
    h('div', { class: 'chead' }, icon('layers', 18), h('h2', {}, 'By Project Category'), h('a', { class: 'hall', href: '#/kpi' }, 'View KPI', icon('chevr', 13))),
    h('div', { class: 'ctiles' }, DB.CATEGORIES.map(c => { const v = kpiPct(done.filter(t => t.category.includes(c)));
      return h('button', { class: 'ctile ' + (v == null ? 'none' : v >= 95 ? 'good' : v >= 80 ? 'mid' : 'low'), title: c + (v == null ? ': no completed projects yet' : ': ' + v + '% within 7 days'), onclick: () => { setProjectFilter({ cat: c }); go('#/projects'); } },
        h('small', {}, short(c)), h('b', {}, v == null ? '—' : v + '%')); })));
}

// ---------- Quick Actions ----------
export function pickProject(title, { fullOnly = false } = {}) {
  return new Promise(res => {
    const dbr = DB.kpiDb(); let chosen = null;
    const list = DB.rows(dbr.id).map(r => DB.kpiInfo(r, dbr, NOW())).filter(t => !t.archived && !(fullOnly && E.reportOnly(t.category))).sort((a, b) => a.title.localeCompare(b.title));
    const q = h('input', { class: 'field', placeholder: 'Search customer', 'aria-label': 'Search customer', oninput: () => draw() });
    const ul = h('ul', { class: 'plpick' });
    const draw = () => { const s = q.value.trim().toLowerCase(); ul.replaceChildren(...list.filter(t => !s || t.title.toLowerCase().includes(s) || String(t.ecx).toLowerCase().includes(s)).slice(0, 60)
      .map(t => h('li', {}, h('button', { onclick: () => { chosen = t.row; sh.close(); } }, h('b', {}, t.title), h('small', {}, [t.category.join(', '), t.status].filter(Boolean).join(' · ') || '—'))))); };
    const sh = sheet(title, h('div', {}, q, h('p', { class: 'muted small' }, fullOnly ? 'Report-only projects (NEM Solar, Substation, Turnkey Stage 1) are not listed.' : 'Choose the project.'), ul), { done: 'Cancel', onDone: () => res(chosen) });
    draw();
  });
}
export function logSheet(row) {
  const type = h('select', { class: 'field', 'aria-label': 'Activity type' }, E.ACT_TYPES.map(t => h('option', { value: t }, t)));
  const txt = h('textarea', { class: 'field', rows: 3, placeholder: 'What happened? e.g. Customer follow-up completed.', 'aria-label': 'Description' });
  const s = sheet('Log activity · ' + DB.title(row), h('form', { class: 'npform', onsubmit: e => { e.preventDefault(); const v = txt.value.trim(); if (!v) { txt.focus(); return; } E.log(row, type.value, v, type.value === 'ECPAR' ? { ecpar: true } : {}); s.close(); toast('Saved to the Activity Log'); render(); } },
    h('label', { class: 'flabel' }, h('span', {}, 'Type'), type), h('label', { class: 'flabel' }, h('span', {}, 'Description'), txt), h('button', { class: 'btn primary block', type: 'submit' }, 'Save')), { done: 'Cancel' });
}
/** Quick Actions: small buttons at the top right of the page header (shared look with the Focus pages) */
export const quickBtn = (ic, label, run) => h('button', { class: 'qs', type: 'button', title: label, 'aria-label': label, onclick: run }, icon(ic, 16), h('span', {}, label));
/** menu, back and forward as round buttons in the cover (top-left), like the buttons on the right; replaces the floating bar on phones, the Duo inner screen and iPad */
export const heroNav = () => h('div', { class: 'hnav', role: 'toolbar', 'aria-label': 'Navigation' },
  h('button', { class: 'hbtn glass', 'aria-label': 'Show or hide the menu', onclick: () => toggleSide() }, icon('sidebar', 19)),
  h('button', { class: 'hbtn glass', 'aria-label': 'Back', onclick: () => back() }, icon('arrowl', 19)),
  h('button', { class: 'hbtn glass', 'aria-label': 'Forward', onclick: () => history.forward() }, icon('arrowr', 19)));
export const quickBar = btns => h('div', { class: 'qbar', role: 'toolbar', 'aria-label': 'Quick actions' }, btns);
function quickActions() {
  const qa = quickBtn;
  return quickBar([

      qa('plus', 'New Project', () => newProjectSheet()),
      qa('filex', 'Add ECX', async () => { const row = await pickProject('Add ECX to…', { fullOnly: true }); if (!row) return; const no = await promptBox('New ECX application', '', 'ECX number (you can add it later)'); if (no == null) return; E.addEcx(row, no.trim()); go('#/project/' + row.id + '/ecx'); }),
      qa('ecpar', 'Add ECPAR', async () => { const row = await pickProject('Add ECPAR to…', { fullOnly: true }); if (!row) return;
        if (E.ecparOf(row)) { toast('This project already has its ECPAR. Opening it.'); go('#/project/' + row.id + '/ecpar'); return; }
        const ref = await promptBox('ECPAR reference number', '', 'e.g. ECPAR-0326 (optional)'); if (ref == null) return;
        const e = E.ecpar(row); if (ref.trim()) D.update(e.id, { 'p:ref': ref.trim() }); E.log(row, 'ECPAR', 'ECPAR record added' + (ref.trim() ? ': ' + ref.trim() : '') + '.', { ecpar: true }); go('#/project/' + row.id + '/ecpar'); }),
      qa('history', 'Log Activity', async () => { const row = await pickProject('Log activity for…'); if (row) logSheet(row); })]);
}

// ---------- full calendar: Month / Week / Day ----------
const EVC = { 'Site Survey': 'green', ECPAR: 'red', ECX: 'orange', Task: 'blue', Due: 'gray', Survey: 'green' };
export function calEvents(n, from, to) {
  const dbr = DB.kpiDb(); if (!dbr) return [];
  const a = iso(from), b = iso(to), ev = [], inR = d => d && d >= a && d <= b;
  for (const r of DB.rows(dbr.id)) {
    const t = DB.kpiInfo(r, dbr, n); if (t.archived) continue;
    const cust = t.title, cat = t.category[0] || '';
    const due = iso(DB.value(r, P('Due Date')));
    const w = E.workOf(r), sd = w && E.g(w, 'survey');
    if (sd && inR(sd)) ev.push({ d: sd, type: 'Site Survey', label: 'Site Survey', cust, cat, id: r.id, tab: 'survey', done: true });
    if (t.status === 'Site Survey' && inR(due)) ev.push({ d: due, type: 'Site Survey', label: 'Site Survey', cust, cat, id: r.id, tab: 'survey' });
    else if (!t.closed && t.status !== 'To Amend' && inR(due)) ev.push({ d: due, type: 'Due', label: 'Due', cust, cat, id: r.id, tab: '' });
  }
  for (const t of flat(DB.ecparGroups(n))) { const d = iso(t.due); if (inR(d)) ev.push({ d, type: 'ECPAR', label: 'ECPAR', cust: t.title, cat: t.category[0] || '', id: t.id, tab: 'ecpar' }); }
  for (const t of flat(DB.ecxGroups(n))) { const d = iso(t.due); if (inR(d)) ev.push({ d, type: 'ECX', label: 'ECX', cust: t.title, cat: t.category[0] || '', id: t.id, tab: 'ecx' }); }
  for (const x of E.dueTasks(n, { within: 99999 })) { const d = E.g(x.task, 'due'); if (inR(d)) ev.push({ d, type: 'Task', label: x.name, cust: x.customer, cat: x.info.category[0] || '', id: x.row.id, tab: 'tasks' }); }
  const order = { ECPAR: 0, ECX: 1, 'Site Survey': 2, Task: 3, Due: 4 };
  return ev.sort((p, q) => p.d.localeCompare(q.d) || order[p.type] - order[q.type] || p.cust.localeCompare(q.cust));
}
function calendarCard(n) {
  const today = startOfDay(new Date(n)); if (!calAnchor) calAnchor = today;
  const A = calAnchor, monday = d => { const x = startOfDay(d); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; };
  let from, to, title;
  if (calView === 'month') { const f = new Date(A.getFullYear(), A.getMonth(), 1); from = monday(f); to = dateAdd(monday(new Date(A.getFullYear(), A.getMonth() + 1, 0)), 6, 'days'); title = formatDate(A, 'MMMM YYYY'); }
  else if (calView === 'week') { from = monday(A); to = dateAdd(from, 6, 'days'); title = formatDate(from, 'D MMM') + ' – ' + formatDate(to, 'D MMM YYYY'); }
  else { from = startOfDay(A); to = from; title = formatDate(A, 'dddd, D MMMM YYYY'); }
  const ev = calEvents(n, from, to), byDay = new Map(); for (const e of ev) { if (!byDay.has(e.d)) byDay.set(e.d, []); byDay.get(e.d).push(e); }
  const move = k => { calAnchor = calView === 'month' ? new Date(A.getFullYear(), A.getMonth() + k, 1) : dateAdd(A, k * (calView === 'week' ? 7 : 1), 'days'); render(); };
  const open = e => go('#/project/' + e.id + (e.tab ? '/' + e.tab : ''));
  const evBtn = (e, full) => h('button', { class: 'cev ' + EVC[e.type], title: `${e.type === 'Task' ? 'Task: ' + e.label : e.label} · ${e.cust}${e.cat ? ' · ' + e.cat : ''}`, onclick: ev2 => { ev2.stopPropagation(); open(e); } },
    h('i'), h('span', {}, full ? (e.type === 'Task' ? e.label : e.label) + ' · ' + e.cust : e.type === 'Task' ? e.label : e.label + ' · ' + e.cust.split(/\s+/)[0]));
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  let body;
  if (calView === 'day') {
    const list = byDay.get(iso(A)) || [];
    body = list.length ? h('ul', { class: 'cday-list' }, list.map(e => h('li', {}, h('button', { onclick: () => open(e) }, badge(e.type, EVC[e.type] === 'gray' ? 'gray' : EVC[e.type], true), h('span', { class: 'cdl' }, h('b', {}, e.type === 'Task' ? e.label : e.cust), h('small', {}, [e.type === 'Task' ? e.cust : '', e.cat, e.done ? 'done' : ''].filter(Boolean).join(' · '))), icon('chevr', 14, 'kgo')))))
      : h('p', { class: 'hempty' }, 'Nothing on this day.');
  } else {
    const days = []; for (let d = new Date(from); d <= to; d = dateAdd(d, 1, 'days')) days.push(new Date(d));
    body = h('div', { class: 'cgrid ' + calView, role: 'grid' }, DOW.map(d => h('span', { class: 'cdow' }, d)),
      days.map(d => { const k = iso(d), list = byDay.get(k) || [], max = calView === 'month' ? 2 : 99;
        return h('div', { class: 'ccell' + (d.getMonth() !== A.getMonth() && calView === 'month' ? ' out' : '') + (k === iso(today) ? ' now' : ''), role: 'gridcell' },
          h('button', { class: 'cnum', 'aria-label': formatDate(d, 'D MMMM YYYY') + (list.length ? ', ' + list.length + ' events' : ''), onclick: () => { calAnchor = d; calView = 'day'; render(); } }, d.getDate()),
          list.slice(0, max).map(e => evBtn(e, calView === 'week')),
          list.length > max ? h('button', { class: 'cmore', onclick: () => { calAnchor = d; calView = 'day'; render(); } }, '+' + (list.length - max) + ' more') : null); }));
  }
  const seg = v => h('button', { class: 'cseg' + (calView === v ? ' on' : ''), 'aria-pressed': calView === v ? 'true' : 'false', onclick: () => { calView = v; render(); } }, v[0].toUpperCase() + v.slice(1));
  return h('section', { class: 'hcard calcard c-cal' },
    h('div', { class: 'calhead' },
      h('div', { class: 'chead' }, icon('date', 18), h('h2', {}, 'Calendar')),
      h('div', { class: 'cnav' }, h('button', { class: 'hbtn xs', 'aria-label': 'Previous', onclick: () => move(-1) }, icon('back', 15)), h('b', {}, title), h('button', { class: 'hbtn xs', 'aria-label': 'Next', onclick: () => move(1) }, icon('chevr', 15))),
      h('div', { class: 'cviews' }, seg('month'), seg('week'), seg('day'), h('button', { class: 'cseg today', onclick: () => { calAnchor = today; render(); } }, 'Today'))),
    h('div', { class: 'clegend' }, ['Site Survey', 'ECPAR', 'ECX', 'Task', 'Due'].map(t => h('span', { class: 'cev ' + EVC[t] }, h('i'), t))),
    body);
}

// pages from the sidebar that get their new design later
export function soonScreen(name) {
  state.ctx = {};
  return h('div', { class: 'wrap home' }, h('header', { class: 'hhead' }, h('div', { class: 'htitle' }, h('h1', {}, name), h('p', { class: 'hsub' }, 'This page gets the new design next.'))),
    h('section', { class: 'hcard soon' }, h('p', {}, 'For now, everything is in Projects and the Planning KPI Tracker.'), h('button', { class: 'hnew', onclick: () => go('#/projects') }, icon('folder', 16), h('span', {}, 'Open Projects'))));
}
