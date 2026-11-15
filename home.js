// Folio v2 — Home (Planning KPI Workspace, Minimal Edition 2.0):
// header, one KPI strip, one tabbed table (Due Today / Pending Site Survey / Rejected ECPAR / Rejected ECX),
// and a right panel with a compact calendar and recent activity. All numbers come from My Task.
import * as D from './data.js';
import * as DB from './db.js';
import { h, icon, menu, toast, textbox, strip } from './ui.js';
import { formatDate, toISODate, dateBetween, startOfDay, isDate } from './dates.js';
import { state, openTask, now as NOW, render, go, moreMenu, elabel, longPress, rowActions, exportList } from './app.js';
import { presetSearch } from './search.js';
import { popEdit } from './popedit.js';

let tab = 'today', sortBy = 'due', catFilter = '', pickDay = '', monthOff = 0;
const selected = new Set();
const TABS = [['today', 'Due Today'], ['survey', 'Pending Site Survey'], ['ecpar', 'Rejected ECPAR'], ['ecx', 'Rejected ECX']];
export function setHomeTab(t) { if (TABS.some(x => x[0] === t)) { tab = t; pickDay = ''; } }

const flat = g => [...(g.overdue || []), ...(g.today || []), ...(g.upcoming || [])];
function tabRows(t, n) {
  if (t === 'today') return flat(DB.todayGroups(n));
  if (t === 'survey') return flat(DB.surveyGroups(n));
  if (t === 'ecpar') return flat(DB.ecparGroups(n));
  return flat(DB.ecxGroups(n));
}
const PRI = { High: 0, Medium: 1, Low: 2 };
const tsOf = f => parseInt(String(f?.ts || '').split(':')[0], 36) || 0;

export function homeScreen() {
  // new data (first sync, import) may not have the Home fields yet; this only writes when something is missing
  try { DB.ensureHomeFields(); } catch {}
  const n = NOW(), dbr = DB.kpiDb();
  state.ctx = { export: a => exportList(tab === 'ecx' ? 'ecpar' : tab, a), more: a => moreMenu(a, { extra: [{ label: 'Open Planning KPI Tracker', icon: 'table', run: () => go('#/tracker') }] }) };
  const wrap = h('div', { class: 'wrap home' });
  wrap.append(header(n, dbr));
  if (!dbr) { wrap.append(h('p', { class: 'empty' }, 'Import your Notion export or create the Planning KPI Tracker in Settings to see your workspace here.')); return wrap; }
  wrap.append(kpiStrip(n, dbr), h('div', { class: 'hgrid' }, tableCard(n, dbr), h('aside', { class: 'hside' }, calendarCard(n), activityCard(n, dbr))));
  return wrap;
}

// ---------- header ----------
function header(n, dbr) {
  const alerts = DB.kpiDb() ? DB.kpiTasks(n).filter(t => t.days != null && t.days <= 0).length : 0;
  const q = textbox({ cls: 'hsearch-in', placeholder: 'Search project, customer, task…', label: 'Search',
    onkeydown: e => { if (e.key === 'Enter') { presetSearch(q.value); go('#/search'); } } });
  return h('header', { class: 'hhead' },
    h('div', { class: 'htitle' }, elabel('home.title', 'Planning KPI Workspace', 'h1'), elabel('home.sub', 'Project · Task · Site Survey · ECPAR · ECX · KPI', 'p', { class: 'hsub' })),
    h('div', { class: 'hactions' },
      h('label', { class: 'hsearch glass' }, icon('search', 17), q),
      h('button', { class: 'hbtn glass', 'aria-label': alerts ? `Notifications, ${alerts} due or overdue` : 'Notifications', onclick: () => go('#/inbox') }, icon('bell', 19), alerts ? h('i', { class: 'hdot' }) : null),
      h('button', { class: 'hbtn glass', 'aria-label': 'More options', onclick: e => moreMenu(e.currentTarget, { extra: [{ label: 'Open Planning KPI Tracker', icon: 'table', run: () => go('#/tracker') }] }) }, icon('more', 19)),
      dbr ? h('button', { class: 'hnew', onclick: () => { const r = DB.newRow(dbr); openTask(r.id); } }, icon('plus', 17), h('span', {}, 'New Project')) : null));
}

// ---------- KPI strip (one container, thin dividers) ----------
function kpiStrip(n, dbr) {
  const today = new Date(n), all = DB.rows(dbr.id).map(r => DB.kpiInfo(r, dbr, n));
  const thisMonth = all.filter(t => { const d = t.assigned && new Date(t.assigned); return d && d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth(); }).length;
  const done = all.filter(t => t.archived || t.status === 'Done');
  const timed = done.filter(t => isDate(t.assigned) && isDate(t.completed));
  const within = timed.filter(t => dateBetween(t.completed, t.assigned, 'days') <= 7).length;
  const pct = timed.length ? Math.round(within / timed.length * 100) : null;
  const ring = p => { const r = 22, c = 2 * Math.PI * r; const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 56 56'); s.setAttribute('class', 'kring');
    s.innerHTML = `<circle cx="28" cy="28" r="${r}" fill="none" stroke="var(--rule)" stroke-width="6"/><circle cx="28" cy="28" r="${r}" fill="none" stroke="#3FA45B" stroke-width="6" stroke-linecap="round" stroke-dasharray="${c * (p || 0) / 100} ${c}" transform="rotate(-90 28 28)"/>`; return s; };
  const m = (ic, label, val, extra) => h('div', { class: 'kcell' }, h('span', { class: 'kic' }, icon(ic, 20)), h('div', {}, h('small', {}, label), h('b', {}, String(val)), extra || null));
  return h('section', { class: 'kstrip', 'aria-label': 'Summary' },
    m('layers', 'Projects', all.length, thisMonth ? h('em', { class: 'kup' }, '↑ ' + thisMonth + ' this month') : null),
    m('play', 'In Progress', all.length - done.length),
    m('check', 'Completed', done.length),
    h('button', { class: 'kcell kpi', onclick: () => go('#/tracker'), title: 'Completed within 7 days of Date Assigned' }, ring(pct), h('div', {}, h('small', {}, 'KPI (Within 7 Days)'), h('b', {}, pct == null ? '—' : pct + '%')), icon('chevr', 18, 'kgo')));
}

// ---------- the main table ----------
function tableCard(n, dbr) {
  const counts = Object.fromEntries(TABS.map(([k]) => [k, tabRows(k, n).length]));
  let rows = tabRows(tab, n);
  if (pickDay) rows = DB.kpiTasks(n).filter(t => t.due && toISODate(t.due) === pickDay).concat(flat(DB.ecxGroups(n)).filter(t => toISODate(t.due) === pickDay));
  if (catFilter) rows = rows.filter(t => t.category.includes(catFilter));
  const seen = new Set(); rows = rows.filter(t => !seen.has(t.id) && seen.add(t.id));
  const sorters = { due: (a, b) => (a.days ?? 9999) - (b.days ?? 9999), priority: (a, b) => (PRI[a.priority] ?? 3) - (PRI[b.priority] ?? 3) || (a.days ?? 9999) - (b.days ?? 9999), project: (a, b) => a.title.localeCompare(b.title) };
  rows.sort(sorters[sortBy]);
  const P = name => DB.propByName(dbr, name);
  const pill = (name, prop) => { const c = prop ? DB.optColor(prop, name) : ['#E3E2E0', '#9B9A97']; return h('span', { class: 'hp', style: { background: c[0], color: shade(c[1]) } }, name); };
  const dotPill = (name, prop) => { const c = prop ? DB.optColor(prop, name) : ['#E3E2E0', '#9B9A97']; return h('span', { class: 'hp dot', style: { background: c[0], color: shade(c[1]) } }, h('i', { style: { background: c[1] } }), name); };
  const dueText = t => t.days == null ? '—' : t.days === 0 ? 'Today' : t.days === 1 ? 'Tomorrow' : t.days === -1 ? 'Yesterday' : formatDate(t.due, 'D/M/YYYY');
  const choose = (anchor, t, name) => { const p = P(name); if (!p) return; menu(anchor, [...(p.options || []).map(o => ({ label: o.name, checked: t[name === 'Status' ? 'status' : 'priority'] === o.name, run: () => { D.update(t.id, { ['p:' + p.id]: o.name }); render(); } })),
    ...(name === 'Priority' ? ['-', { label: 'Clear', icon: 'close', run: () => { D.update(t.id, { ['p:' + p.id]: null }); render(); } }] : [])]); };
  const row = t => {
    let taskEl;
    const chk = h('input', { type: 'checkbox', class: 'hchk', 'aria-label': 'Select ' + t.title, checked: selected.has(t.id) ? true : null, onclick: e => e.stopPropagation(), onchange: e => { e.target.checked ? selected.add(t.id) : selected.delete(t.id); render(); } });
    taskEl = h('button', { class: 'c-task ebtn' + (t.next ? '' : ' empty'), onclick: e => { e.stopPropagation(); const p = P('Next Task'); if (p) popEdit(taskEl, D.getRec(t.id), p, () => render()); } }, t.next || (t.amend ? 'Amend ECPAR' : t.ecxDue ? 'Resubmit ECX' : 'Add task'));
    const late = t.days != null && t.days < 0;
    const r = h('div', { class: 'hrow' + (selected.has(t.id) ? ' sel' : ''), role: 'row', onclick: () => openTask(t.id) },
      h('span', { class: 'c-chk' }, chk),
      h('span', { class: 'c-proj' }, icon('page', 17, 'hpic'), h('span', {}, t.title)),
      taskEl,
      h('span', { class: 'c-tags' },
        h('span', { class: 'c-cat' }, t.category.length ? [pill(t.category[0], P('Project Category')), t.category.length > 1 ? h('small', { class: 'more' }, '+' + (t.category.length - 1)) : null] : h('span', { class: 'muted' }, '—')),
        h('button', { class: 'c-pri ebtn', onclick: e => { e.stopPropagation(); choose(e.currentTarget, t, 'Priority'); } }, t.priority ? dotPill(t.priority, P('Priority')) : h('span', { class: 'muted' }, 'Set')),
        h('button', { class: 'c-stat ebtn', onclick: e => { e.stopPropagation(); choose(e.currentTarget, t, 'Status'); } }, t.status ? dotPill(t.status, P('Status')) : h('span', { class: 'muted' }, 'Status'))),
      h('span', { class: 'c-due' + (late ? ' late' : '') }, dueText(t)),
      h('button', { class: 'c-act ebtn', 'aria-label': 'Actions for ' + t.title, onclick: e => { e.stopPropagation(); rowActions(t.id); } }, icon('more', 18)));
    longPress(r, () => rowActions(t.id));
    return r;
  };
  const tabsEl = h('div', { class: 'htabs', role: 'tablist' }, TABS.map(([k, label]) => h('button', { class: 'htab' + (tab === k && !pickDay ? ' on' : ''), role: 'tab', 'aria-selected': String(tab === k && !pickDay),
    onclick: () => { tab = k; pickDay = ''; selected.clear(); render(); } }, h('span', {}, label), h('span', { class: 'hcount' }, counts[k]))));
  const catP = P('Project Category');
  const tools = h('div', { class: 'htools' },
    h('button', { class: 'hbtn sm glass' + (catFilter ? ' on' : ''), 'aria-label': 'Filter by category', onclick: e => menu(e.currentTarget, [{ label: 'All categories', checked: !catFilter, run: () => { catFilter = ''; render(); } }, '-',
      ...(catP?.options || []).map(o => ({ label: o.name, checked: catFilter === o.name, run: () => { catFilter = o.name; render(); } }))]) }, icon('filter', 17)),
    h('button', { class: 'hbtn sm glass', 'aria-label': 'Sort', onclick: e => menu(e.currentTarget, [['due', 'Due date'], ['priority', 'Priority'], ['project', 'Project name']].map(([k, l]) => ({ label: 'Sort by ' + l, checked: sortBy === k, run: () => { sortBy = k; render(); } }))) }, icon('sort', 17)),
    h('button', { class: 'hbtn sm glass', 'aria-label': 'Table options', onclick: e => menu(e.currentTarget, [
      { label: 'Open in Planning KPI Tracker', icon: 'table', run: () => go('#/tracker') },
      { label: 'Open the full ' + TABS.find(x => x[0] === tab)[1] + ' page', icon: 'expand', run: () => go('#/' + tab) },
      { label: 'Export this list', icon: 'export', run: () => exportList(tab === 'ecx' ? 'ecpar' : tab, e.target) }]) }, icon('more', 17)));
  const chips = [pickDay ? h('button', { class: 'hchip', onclick: () => { pickDay = ''; render(); } }, 'Due ' + formatDate(pickDay, 'D MMM YYYY'), icon('close', 13)) : null,
    catFilter ? h('button', { class: 'hchip', onclick: () => { catFilter = ''; render(); } }, catFilter, icon('close', 13)) : null].filter(Boolean);
  const bulk = selected.size ? h('div', { class: 'hbulk' }, h('b', {}, selected.size + ' selected'),
    h('button', { class: 'btn', onclick: () => { const p = P('Status'); for (const id of selected) D.update(id, { ['p:' + p.id]: 'Done' }); toast(selected.size + ' marked Done'); selected.clear(); render(); } }, icon('check', 15), 'Mark Done'),
    h('button', { class: 'btn', onclick: () => { selected.clear(); render(); } }, 'Clear')) : null;
  const allChk = h('input', { type: 'checkbox', class: 'hchk', 'aria-label': 'Select all', checked: rows.length && rows.every(t => selected.has(t.id)) ? true : null,
    onchange: e => { rows.forEach(t => e.target.checked ? selected.add(t.id) : selected.delete(t.id)); render(); } });
  const head = h('div', { class: 'hrow hhd', role: 'row' }, h('span', { class: 'c-chk' }, allChk), h('span', { class: 'c-proj' }, 'Project'), h('span', { class: 'c-task' }, 'Task'),
    h('span', { class: 'c-tags' }, h('span', { class: 'c-cat' }, 'Category'), h('span', { class: 'c-pri' }, 'Priority'), h('span', { class: 'c-stat' }, 'Status')), h('span', { class: 'c-due' }, 'Due Date'), h('span', { class: 'c-act' }));
  const empty = h('p', { class: 'hempty' }, pickDay ? 'Nothing due on this day.' : { today: 'Nothing due in the next 2 days.', survey: 'No projects waiting for a site survey.', ecpar: 'No rejected ECPAR to amend.', ecx: 'No rejected ECX. Add an ECX Rejected date to a project to track it here.' }[tab]);
  return h('section', { class: 'hcard htable' }, h('div', { class: 'hbar' }, tabsEl, tools), chips.length ? h('div', { class: 'hchips' }, chips) : null, bulk,
    h('div', { class: 'hlist', role: 'table' }, head, rows.length ? rows.map(row) : empty));
}
// darker text colour for a pill from its dot colour
function shade(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 'var(--ink)'; const v = parseInt(m[1], 16); const f = x => Math.round(x * 0.62); return `rgb(${f(v >> 16 & 255)},${f(v >> 8 & 255)},${f(v & 255)})`; }

// ---------- right panel: calendar ----------
function calendarCard(n) {
  const base = new Date(n), first = new Date(base.getFullYear(), base.getMonth() + monthOff, 1);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const tasks = [...DB.kpiTasks(n).filter(t => t.due), ...flat(DB.ecxGroups(n))];
  const byDay = new Map(); for (const t of tasks) { const k = toISODate(t.due); byDay.set(k, (byDay.get(k) || 0) + 1); }
  const today = toISODate(new Date(n));
  const weeks = Math.ceil(((first.getDay() + 6) % 7 + new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()) / 7);
  const days = [...Array(weeks * 7)].map((_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  return h('section', { class: 'hcard hcal' },
    h('div', { class: 'hcalh' }, icon('date', 18), h('b', {}, formatDate(first, 'MMM YYYY')),
      h('button', { class: 'hbtn xs', 'aria-label': 'Previous month', onclick: () => { monthOff--; render(); } }, icon('back', 15)),
      h('button', { class: 'hbtn xs', 'aria-label': 'Next month', onclick: () => { monthOff++; render(); } }, icon('chevr', 15))),
    h('div', { class: 'hmonth' }, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => h('span', { class: 'mh' }, d)),
      days.map(d => { const iso = toISODate(d), c = byDay.get(iso);
        return h('button', { class: 'md' + (d.getMonth() !== first.getMonth() ? ' out' : '') + (iso === today ? ' now' : '') + (iso === pickDay ? ' sel' : ''), 'aria-label': formatDate(d, 'D MMMM') + (c ? `, ${c} due` : ''),
          onclick: () => { pickDay = pickDay === iso ? '' : iso; selected.clear(); render(); } }, d.getDate(), c ? h('i', { class: 'mdot' }) : null); })));
}

// ---------- right panel: recent activity (worked out from what changed and when) ----------
export function activity(dbr, limit = 6) {
  const P = name => DB.propByName(dbr, name); const ev = [];
  const st = P('Status'), ep = P('ECPAR Rejected'), xp = P('ECX Rejected'), dc = P('Date Completed');
  for (const r of DB.rows(dbr.id)) {
    const name = DB.title(r), f = r.f || {};
    const add = (field, text, color) => { const t = tsOf(f[field]); if (t) ev.push({ t, text, color, id: r.id }); };
    if (f.created) ev.push({ t: D.val(r, 'created') || tsOf(f.created), text: 'New project created – ' + name, color: 'green', id: r.id });
    if (st && f['p:' + st.id]) { const v = D.val(r, 'p:' + st.id); add('p:' + st.id, v === 'Site Survey' ? 'Site survey – ' + name : v === 'To Amend' ? 'ECPAR to amend – ' + name : v === 'Done' ? 'Completed – ' + name : `Status: ${v} – ${name}`, v === 'Site Survey' ? 'blue' : v === 'Done' ? 'green' : v === 'To Amend' ? 'red' : 'gray'); }
    if (ep && D.val(r, 'p:' + ep.id)) add('p:' + ep.id, 'ECPAR rejected – ' + name, 'red');
    if (xp && D.val(r, 'p:' + xp.id)) add('p:' + xp.id, 'ECX rejected – ' + name, 'red');
    if (dc && D.val(r, 'p:' + dc.id)) add('p:' + dc.id, 'Project completed – ' + name, 'green');
    if (f.blocks) add('blocks', 'Notes updated – ' + name, 'yellow');
  }
  for (const c of D.all('cmt')) { const r = D.live(D.val(c, 'parent')); if (r && r.k === 'row') ev.push({ t: D.val(c, 'created', 0), text: 'Comment – ' + DB.title(r), color: 'yellow', id: r.id, note: strip(D.val(c, 'text', '')).slice(0, 80) }); }
  return ev.sort((a, b) => b.t - a.t).slice(0, limit);
}
function when(t, n) { const d = new Date(t), days = Math.round((startOfDay(new Date(n)) - startOfDay(d)) / 864e5);
  return days <= 0 ? d.toTimeString().slice(0, 5) : days === 1 ? 'Yesterday' : formatDate(d, 'D MMM'); }
function activityCard(n, dbr) {
  const ev = activity(dbr, 6);
  return h('section', { class: 'hcard hact' },
    h('div', { class: 'hcalh' }, icon('history', 18), h('b', {}, 'Recent Activity'), h('a', { class: 'hall', href: '#/activity' }, 'View All', icon('chevr', 13))),
    ev.length ? h('ul', { class: 'hfeed' }, ev.map(e => h('li', {}, h('button', { onclick: () => openTask(e.id) }, h('i', { class: 'fdot ' + e.color }), h('span', {}, e.text), h('small', {}, when(e.t, n))))))
      : h('p', { class: 'hempty' }, 'Changes you make to projects show up here.'));
}
export function activityScreen() {
  const n = NOW(), dbr = DB.kpiDb(); state.ctx = {};
  const ev = dbr ? activity(dbr, 300) : [];
  return h('div', { class: 'wrap home' }, h('header', { class: 'hhead' }, h('div', { class: 'htitle' }, h('h1', {}, 'Recent Activity'), h('p', { class: 'hsub' }, ev.length + ' changes, newest first'))),
    h('section', { class: 'hcard hact' }, h('ul', { class: 'hfeed' }, ev.map(e => h('li', {}, h('button', { onclick: () => openTask(e.id) }, h('i', { class: 'fdot ' + e.color }), h('span', {}, e.text, e.note ? h('em', {}, e.note) : null), h('small', {}, when(e.t, n) === new Date(e.t).toTimeString().slice(0, 5) ? 'Today ' + when(e.t, n) : when(e.t, n))))))));
}
// pages from the sidebar that are redesigned after Home is approved
export function soonScreen(name) {
  state.ctx = {};
  return h('div', { class: 'wrap home' }, h('header', { class: 'hhead' }, h('div', { class: 'htitle' }, h('h1', {}, name), h('p', { class: 'hsub' }, 'This page gets the new design after you approve the Home page.'))),
    h('section', { class: 'hcard soon' }, h('p', {}, 'For now, everything is in the Planning KPI Tracker.'), h('button', { class: 'hnew', onclick: () => go('#/tracker') }, icon('table', 16), h('span', {}, 'Open Planning KPI Tracker'))));
}
