// Folio v2 — Timeline (Gantt), Board (Kanban by Project Category), Reports and KPI Dashboard.
// All four read the same project records through kpi.js; nothing here stores its own copy of a project.
import * as D from './data.js';
import * as DB from './db.js';
import * as E from './entities.js';
import * as K from './kpi.js';
import * as Sync from './sync.js';
import { h, icon, menu, sheet, toast, confirmBox, textbox } from './ui.js';
import { formatDate, startOfDay, toISODate, parseDate } from './dates.js';
import { state, now as NOW, render, go, moreMenu, download } from './app.js';
import { newProjectSheet, badge } from './project.js';
import { coverInto, heroNav } from './home.js';

const DAY = 864e5;
/** set CSS custom properties (the h() helper only sets normal style properties) */
const vars = (el, o) => { for (const [k, v] of Object.entries(o)) el.style.setProperty(k, v); return el; };
const dm = d => d ? formatDate(d, 'DD/MM/YYYY') : '—';
const dShort = d => d ? formatDate(d, 'D MMM') : '—';
const days = n => n == null ? '—' : (Math.round(n * 10) / 10).toLocaleString('en-MY', { maximumFractionDigits: 1 }) + (n === 1 ? ' day' : ' days');
const pctTxt = p => p == null ? '—' : (Math.round(p * 10) / 10) + '%';
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return startOfDay(x); };
const monday = d => addDays(d, -((d.getDay() + 6) % 7));
const STATE_TONE = { 'On Track': 'green', 'Due ≤ 2 Days': 'orange', Overdue: 'red', Completed: 'gray', Archived: 'gray' };
const STATE_ICON = { 'On Track': 'okcircle', 'Due ≤ 2 Days': 'today', Overdue: 'info', Completed: 'check', Archived: 'archive' };
const STAGE_TONE = { 'Site Survey': 'blue', ECPAR: 'purple', ECX: 'green', Report: 'yellow', 'In Progress': 'yellow', Completed: 'gray', 'On Hold': 'orange', Rejected: 'red' };
const STAGE_ICON = { 'Site Survey': 'target', ECPAR: 'ecpar', ECX: 'filex', Report: 'page', 'In Progress': 'play', Completed: 'okcircle', 'On Hold': 'hourglass', Rejected: 'xcircle' };
const stateChip = s => h('span', { class: 'vstate ' + (STATE_TONE[s] || 'gray') }, icon(STATE_ICON[s] || 'info', 13), s);
const catChip = c => vars(h('span', { class: 'vcat', title: c }, K.CODE[c] || c), { '--c': K.catColor(c) });

// =====================================================================================
// shared page pieces
// =====================================================================================
// ---------- fewer pages: Board and Timeline are views of Projects; Monthly KPI is a tab of Reports ----------
const TABS = {
  projects: { label: 'Projects', items: [['#/projects', 'table', 'Table'], ['#/board', 'columns', 'Board'], ['#/timeline', 'timeline', 'Timeline']] },
  reports: { label: 'Reports', items: [['#/kpi', 'barchart', 'Monthly KPI'], ['#/reports', 'linechart', 'Report']] } };
/** the tab bar under the page title (Projects: Table / Board / Timeline; Reports: Monthly KPI / Report) */
export function viewTabs(group, cur) {
  const g = TABS[group];
  return h('nav', { class: 'vtabs', role: 'tablist', 'aria-label': g.label + ' views' }, g.items.map(([href, ic, l]) => {
    const on = href === '#/' + cur;
    return h('a', { class: 'vtab' + (on ? ' on' : ''), href, role: 'tab', 'aria-selected': on ? 'true' : 'false', onclick: e => { if (on) e.preventDefault(); } }, icon(ic, 15), h('span', {}, l));
  }));
}
function head({ crumb, title, desc, ic, tools, more, group, cur }) {
  const n = NOW(), alerts = DB.kpiDb() ? DB.kpiTasks(n).filter(t => t.days != null && t.days <= 0).length + E.dueTasks(n).length : 0;
  return h('header', { class: 'fhead vhead' }, coverInto(h('div', { class: 'fcover', 'aria-hidden': 'true' })), heroNav(),
    h('div', { class: 'fhead-in' },
      h('nav', { class: 'crumbs fcrumbs', 'aria-label': 'Breadcrumb' }, h('a', { href: '#/home', 'aria-label': 'Home' }, icon('home', 16)), icon('chevr', 14), group ? h('a', { class: 'cv', href: TABS[group].items[0][0] === '#/kpi' ? '#/kpi' : '#/projects' }, TABS[group].label) : h('span', { class: 'cv' }, 'Views'), icon('chevr', 14), h('span', {}, crumb)),
      h('div', { class: 'ftitle' }, h('span', { class: 'fic' }, icon(ic, 26)), h('div', {}, h('h1', {}, title), h('p', {}, desc))),
      group ? viewTabs(group, cur) : null),
    h('div', { class: 'hero-a fhead-a' },
      h('button', { class: 'hbtn glass', 'aria-label': alerts ? `Notifications, ${alerts} due or overdue` : 'Notifications', onclick: () => go('#/inbox') }, icon('bell', 19), alerts ? h('i', { class: 'hdot' }) : null),
      h('button', { class: 'hbtn glass', 'aria-label': 'More options', onclick: e => more(e.currentTarget) }, icon('more', 19))),
    tools ? h('div', { class: 'vtools' }, tools) : null);
}
/** a compact dropdown button: label + current value */
function dd(label, value, items, { cls = '' } = {}) {
  const b = h('button', { class: 'vdd ' + cls, 'aria-label': label + ': ' + value, onclick: () => menu(b, items, { width: 250 }) }, h('span', { class: 'vddl' }, label), h('b', {}, value), icon('chevd', 14));
  return b;
}
const catItems = (cur, set) => [{ label: 'All Categories', checked: !cur, run: () => set('') }, ...K.CAT_ORDER.map(c => ({ label: `${K.CODE[c]} — ${c}`, checked: cur === c, run: () => set(c) })), { label: 'Other / no category', checked: cur === 'Other', run: () => set('Other') }];
const stateItems = (cur, set, extra = []) => [{ label: 'All Status', checked: !cur, run: () => set('') }, ...['On Track', 'Due ≤ 2 Days', 'Overdue', 'Completed', ...extra].map(s => ({ label: s, checked: cur === s, run: () => set(s) }))];
function metrics6(s, deltas) {
  const cell = (cls, ic, v, label, sub) => h('div', { class: 'kb vm ' + cls }, h('span', { class: 'kbi' }, icon(ic, 20)), h('span', { class: 'kbt' }, h('b', { class: 'vmv' }, v), h('small', {}, label), sub || null));
  const D_ = k => deltas ? deltas[k] : null;
  return h('section', { class: 'kbar5 vmetrics', 'aria-label': 'Summary' },
    cell('k-blue', 'folder', String(s.total), 'Total Projects', D_('total')),
    cell('k-green', 'okcircle', String(s.onTrack), 'On Track', D_('onTrack')),
    cell('k-orange', 'today', String(s.due2), 'Due ≤ 2 Days', D_('due2')),
    cell('k-red', 'info', String(s.overdue), 'Overdue', D_('overdue')),
    cell('k-violet', 'layers', s.avg == null ? '—' : days(s.avg), 'Avg. Turnaround', D_('avg') || (s.eligible ? h('em', { class: 'vmsub' }, s.eligible + ' completed') : h('em', { class: 'vmsub' }, 'no completed projects'))),
    cell('k-blue', 'target', pctTxt(s.pct), 'Within 7 Days', D_('pct') || h('em', { class: 'vmsub' }, 'target 100%')));
}
const filterList = (list, { q = '', cat = '', st = '' } = {}) => {
  const s = q.trim().toLowerCase();
  return list.filter(f => (!cat || f.cat === cat) && (!st || f.state === st || f.stage === st)
    && (!s || [f.title, f.ref, String(f.info.ecx || ''), ...f.ecx.map(x => E.g(x, 'number') || '')].join(' ').toLowerCase().includes(s)));
};
function searchBox(S, key, ph) {
  // the app waits to redraw while you type, so refresh this page's content around the search box instead
  const t = textbox({ value: S[key], cls: 'hsearch-in', placeholder: ph, label: ph, oninput: () => { S[key] = t.value; clearTimeout(t._t); t._t = setTimeout(() => refreshAround(t), 250); } });
  return h('label', { class: 'hsearch glass vsearch' }, icon('search', 16), t);
}
function refreshAround(box) {
  const page = box.closest('.vpage'); if (!page) return;
  const kind = ['timeline', 'board', 'reports', 'kpi'].find(k => page.classList.contains('v-' + k));
  const fresh = { timeline: timelineScreen, board: boardScreen, reports: reportsScreen, kpi: kpiScreen }[kind]();
  const keep = page.querySelector('.vhead'), sl = page.querySelector('.gantt')?.scrollLeft;
  [...page.children].forEach(c => { if (c !== keep) c.remove(); });
  [...fresh.children].forEach(c => { if (!c.classList.contains('vhead')) page.append(c); });
  const g = page.querySelector('.gantt'); if (g && sl != null) { g._done = 1; g.scrollLeft = sl; }
}
const noData = () => h('section', { class: 'hcard soon' }, h('p', {}, 'There is no Planning KPI Tracker yet. Import it from Notion in Settings, or make one in Projects.'), h('button', { class: 'hnew', onclick: () => go('#/projects') }, icon('folder', 16), h('span', {}, 'Open Projects')));

// ---------- small SVG charts (thin marks, labels as text so colour is never the only cue) ----------
const svgEl = (vb, cls, label, inner) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', vb); s.setAttribute('class', cls); s.setAttribute('role', 'img'); s.setAttribute('aria-label', label); s.innerHTML = inner; return s; };
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function donut(segs, top, sub, label) {
  const total = segs.reduce((a, s) => a + s.value, 0), R = 46, C = 2 * Math.PI * R, gap = segs.filter(s => s.value).length > 1 ? 2 : 0;
  let off = 0; const arcs = segs.filter(s => s.value).map(s => { const len = C * s.value / total, a = `<circle cx="60" cy="60" r="${R}" fill="none" stroke="${s.color}" stroke-width="13" stroke-dasharray="${Math.max(0, len - gap)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"><title>${esc(s.label)}: ${s.value}</title></circle>`; off += len; return a; });
  return svgEl('0 0 120 120', 'donut vdonut', label, `<circle cx="60" cy="60" r="${R}" fill="none" stroke="var(--bg2)" stroke-width="13"/>${arcs.join('')}<text x="60" y="60" text-anchor="middle" class="dn">${esc(top)}</text><text x="60" y="75" text-anchor="middle" class="du">${esc(sub)}</text>`);
}
function legend(segs, total) {
  return h('ul', { class: 'dleg' }, segs.map(s => h('li', {}, h('i', { style: { background: s.color } }), h('span', {}, s.label), h('b', {}, s.value), h('small', {}, total ? '(' + Math.round(s.value / total * 1000) / 10 + '%)' : ''))));
}
/** line chart (single series → no legend; the title names it). pts: [{label, v, tip}] */
/** draws a chart at the box's real width (instead of stretching it), so labels stay at the normal text size */
function fitted(draw, W0) {
  let svg = draw(W0), drawn = W0;
  const box = h('div', { class: 'vfit' }, svg);
  const fit = () => { const w = Math.round(box.clientWidth); if (w > 0 && Math.abs(w - drawn) > 2) { const n = draw(w); svg.replaceWith(n); svg = n; drawn = w; } };
  if (window.ResizeObserver) new ResizeObserver(fit).observe(box); requestAnimationFrame(fit);
  return box;
}
function lineChart(pts, opts) {
  const have = pts.filter(p => p.v != null); if (!have.length) return h('p', { class: 'hempty' }, 'No completed projects with both dates in this period yet.');
  return fitted(W => lineChartAt(W, pts, opts), 360);
}
function lineChartAt(W, pts, { unit = 'd', label }) {
  const have = pts.filter(p => p.v != null);
  const H = 190, L = 34, R = 14, T = 22, B = 24, max = Math.max(1, Math.ceil(Math.max(...have.map(p => p.v)) * 1.25));
  const x = i => L + (pts.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (pts.length - 1)), y = v => T + (1 - v / max) * (H - T - B);
  const ticks = [0, max / 2, max].map(t => Math.round(t * 10) / 10);
  const seq = pts.map((p, i) => p.v == null ? null : [x(i), y(p.v), p, i]).filter(Boolean);
  const path = seq.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
  const area = seq.length > 1 ? path + ` L${seq[seq.length - 1][0].toFixed(1)} ${H - B} L${seq[0][0].toFixed(1)} ${H - B} Z` : '';
  const s = svgEl(`0 0 ${W} ${H}`, 'vline', label,
    ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="tgrid"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end" class="tax">${t}${unit}</text>`).join('')
    + pts.map((p, i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="tax">${esc(p.label)}</text>`).join('')
    + (area ? `<path d="${area}" class="varea"/>` : '') + `<path d="${path}" class="tline2 vstroke"/>`
    + seq.map(([cx, cy, p]) => `<g class="tpt"><circle cx="${cx}" cy="${cy}" r="14" class="thit"><title>${esc(p.tip)}</title></circle><circle cx="${cx}" cy="${cy}" r="4.5" class="tdot vdot"/><text x="${cx}" y="${cy - 10}" text-anchor="middle" class="vlab">${p.v}${unit}</text></g>`).join(''));
  s.querySelectorAll('.thit').forEach((c, i) => c.addEventListener('click', () => toast(seq[i][2].tip)));
  return s;
}
/** vertical bars with a dashed target line. pts: [{label, v, tip}] (v in %) */
function barChart(pts, opts) { return fitted(W => barChartAt(W, pts, opts), 380); }
function barChartAt(W, pts, { target = 100, label, color = 'var(--vblue)' }) {
  const H = 200, L = 34, R = 8, T = 18, B = 24, bw = Math.min(34, (W - L - R) / pts.length * 0.56);
  const x = i => L + (i + 0.5) * (W - L - R) / pts.length, y = v => T + (1 - v / 100) * (H - T - B);
  const s = svgEl(`0 0 ${W} ${H}`, 'vbars', label,
    [0, 25, 50, 75, 100].map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="tgrid"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end" class="tax">${t}%</text>`).join('')
    + pts.map((p, i) => p.v == null ? `<text x="${x(i)}" y="${y(0) - 6}" text-anchor="middle" class="tax">—</text>`
      : `<g class="tpt"><rect x="${x(i) - bw / 2}" y="${y(p.v)}" width="${bw}" height="${Math.max(1, y(0) - y(p.v))}" rx="4" fill="${color}"><title>${esc(p.tip)}</title></rect><text x="${x(i)}" y="${y(p.v) - 5}" text-anchor="middle" class="vlab">${Math.round(p.v * 10) / 10}%</text></g>`).join('')
    + pts.map((p, i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="tax">${esc(p.label)}</text>`).join('')
    + `<line x1="${L}" x2="${W - R}" y1="${y(target)}" y2="${y(target)}" class="vtarget"/><text x="${W - R}" y="${y(target) - 4}" text-anchor="end" class="vtargetl">Target ${target}%</text>`);
  s.querySelectorAll('rect').forEach(r => r.addEventListener('click', () => toast(r.querySelector('title').textContent)));
  return s;
}
function hbars(rows, { fmt = v => String(v), max } = {}) {
  const m = max ?? Math.max(1, ...rows.map(r => r.value || 0));
  return h('ul', { class: 'fbars vhb' }, rows.map(r => h('li', {}, h('span', { class: 'fbl' }, r.label), h('span', { class: 'fbt' }, h('i', { style: { width: (!r.value ? 0 : Math.max(2, r.value / m * 100)) + '%', background: r.color } })), h('b', {}, r.value == null ? '—' : fmt(r.value)), h('small', {}, r.note || ''))));
}
const panel = (ic, title, body, extra) => h('section', { class: 'hcard vpanel' }, h('div', { class: 'chead' }, icon(ic, 18), h('h2', {}, title), extra || null), body);

// ---------- KPI rules (asked once, then a setting) ----------
export function kpiRulesSheet() {
  const r = JSON.parse(JSON.stringify(K.kpiRules()));
  const daySel = h('select', { class: 'field', 'aria-label': 'Day counting' }, h('option', { value: 'calendar', selected: r.days === 'calendar' ? true : null }, 'Calendar days'), h('option', { value: 'working', selected: r.days === 'working' ? true : null }, 'Working days (Monday–Friday)'));
  const ends = K.CAT_ORDER.map(c => h('label', { class: 'ltf' }, h('span', {}, `${K.CODE[c]} — ${c}`), h('select', { class: 'field', 'data-cat': c }, K.endOptions(c).map(o => h('option', { value: o, selected: r.end[c] === o ? true : null }, K.END_EVENTS[o])))));
  sheet('KPI rules', h('div', { class: 'ltform' },
    h('p', { class: 'muted small wide', style: { gridColumn: '1 / -1' } }, 'Turnaround = KPI completion date − Date Assigned. Within 7 Days = turnaround ≤ 7. Only completed projects with both dates count; open projects never count as completed. Public holidays are not known to the app, so working days only skip Saturday and Sunday.'),
    h('label', { class: 'ltf wide' }, h('span', {}, 'Count turnaround in'), daySel),
    h('h4', {}, 'KPI completion event for each category'), ...ends), { done: 'Save', wide: true, onDone: async () => {
    const next = { days: daySel.value, start: 'assigned', end: Object.fromEntries(ends.map(l => { const s = l.querySelector('select'); return [s.dataset.cat, s.value]; })), confirmed: true };
    K.setKpiRules(next); await Sync.saveSettings({ kpiRules: next }); Sync.soon(500); toast('KPI rules saved'); render(); } });
}
const rulesNote = () => K.kpiRules().confirmed ? null : h('p', { class: 'ccinfo amber vrules' }, icon('info', 14), h('span', {}, 'KPI is counted from Date Assigned to Date Completed in calendar days for every category. Confirm this or change it per category. '), h('button', { class: 'link sm', onclick: kpiRulesSheet }, 'KPI rules…'));
const viewMore = (a, extra = []) => moreMenu(a, { extra: [...extra, { label: 'KPI rules…', icon: 'target', run: kpiRulesSheet }] });

// =====================================================================================
// 1. TIMELINE
// =====================================================================================
const TL = { view: 'week', anchor: null, q: '', cat: '', st: '', scope: 'open' };
const SCALE = {
  day: { pxd: 44, back: 7, span: 42 }, week: { pxd: 18, back: 14, span: 98 }, month: { pxd: 5, back: 31, span: 245 }, quarter: { pxd: 1.7, back: 92, span: 640 },
};
function tlRange(view, anchor) {
  if (view === 'day') { const s = addDays(anchor, -7); return [s, addDays(s, SCALE.day.span)]; }
  if (view === 'week') { const s = addDays(monday(anchor), -14); return [s, addDays(s, SCALE.week.span)]; }
  if (view === 'month') { const s = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1); return [s, new Date(s.getFullYear(), s.getMonth() + 8, 1)]; }
  const q = Math.floor(anchor.getMonth() / 3), s = new Date(anchor.getFullYear(), (q - 1) * 3, 1); return [s, new Date(s.getFullYear(), s.getMonth() + 21, 1)];
}
function tlScale(view, from, to, px) {
  const top = [], bot = [], X = d => Math.round((startOfDay(d) - from) / DAY * px);
  const push = (arr, d, e, text, cls = '') => arr.push({ x: X(d), w: X(e) - X(d), text, cls });
  if (view === 'day') {
    for (let d = new Date(from); d < to; d = addDays(d, 1)) push(bot, d, addDays(d, 1), [formatDate(d, 'dd')[0], d.getDate()], d.getDay() === 0 || d.getDay() === 6 ? 'we' : '');
    for (let m = new Date(from.getFullYear(), from.getMonth(), 1); m < to; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) push(top, m < from ? from : m, new Date(m.getFullYear(), m.getMonth() + 1, 1) > to ? to : new Date(m.getFullYear(), m.getMonth() + 1, 1), formatDate(m, 'MMMM YYYY'));
  } else if (view === 'week') {
    for (let d = new Date(from); d < to; d = addDays(d, 7)) { const e = addDays(d, 6); push(bot, d, addDays(d, 7), ['W' + isoWeek(d), `${d.getDate()} ${d.getMonth() !== e.getMonth() ? formatDate(d, 'MMM') + ' ' : ''}– ${e.getDate()} ${formatDate(e, 'MMM')}`]); }
    for (let m = new Date(from.getFullYear(), from.getMonth(), 1); m < to; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) push(top, m < from ? from : m, new Date(m.getFullYear(), m.getMonth() + 1, 1) > to ? to : new Date(m.getFullYear(), m.getMonth() + 1, 1), formatDate(m, 'MMMM YYYY'));
  } else if (view === 'month') {
    for (let m = new Date(from); m < to; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) push(bot, m, new Date(m.getFullYear(), m.getMonth() + 1, 1), [formatDate(m, 'MMM'), String(m.getFullYear())]);
    for (let y = from.getFullYear(); y <= to.getFullYear(); y++) { const s = new Date(Math.max(from, new Date(y, 0, 1))), e = new Date(Math.min(to, new Date(y + 1, 0, 1))); if (e > s) push(top, s, e, String(y)); }
  } else {
    for (let m = new Date(from); m < to; m = new Date(m.getFullYear(), m.getMonth() + 3, 1)) push(bot, m, new Date(m.getFullYear(), m.getMonth() + 3, 1), ['Q' + (Math.floor(m.getMonth() / 3) + 1), formatDate(m, 'MMM') + '–' + formatDate(new Date(m.getFullYear(), m.getMonth() + 2, 1), 'MMM')]);
    for (let y = from.getFullYear(); y <= to.getFullYear(); y++) { const s = new Date(Math.max(from, new Date(y, 0, 1))), e = new Date(Math.min(to, new Date(y + 1, 0, 1))); if (e > s) push(top, s, e, String(y)); }
  }
  return { top, bot, X, W: X(to) };
}
function isoWeek(d) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y) / DAY + 1) / 7); }
const MS_CLS = { survey: 'ms-survey', report: 'ms-report', ecpar: 'ms-ecpar', ecx: 'ms-ecx', reject: 'ms-reject', done: 'ms-done' };

export function timelineScreen() {
  E.ensureAll();
  const n = NOW(), today = startOfDay(new Date(n)); if (!TL.anchor) TL.anchor = today;
  state.ctx = { more: a => viewMore(a) };
  const set = (k, v) => { TL[k] = v; render(); };
  const wrap = h('div', { class: 'wrap home focus vpage v-timeline' });
  const [from, to] = tlRange(TL.view, TL.anchor);
  const move = k => { const a = TL.anchor; TL.anchor = TL.view === 'day' ? addDays(a, 7 * k) : TL.view === 'week' ? addDays(a, 28 * k) : TL.view === 'month' ? new Date(a.getFullYear(), a.getMonth() + 3 * k, 1) : new Date(a.getFullYear(), a.getMonth() + 6 * k, 1); render(); };
  const tools = [
    dd('Projects', { open: 'Open projects', all: 'All projects', done: 'Completed' }[TL.scope], [['open', 'Open projects'], ['all', 'All projects'], ['done', 'Completed']].map(([k, l]) => ({ label: l, checked: TL.scope === k, run: () => set('scope', k) }))),
    dd('Category', TL.cat ? K.CODE[TL.cat] || TL.cat : 'All Categories', catItems(TL.cat, v => set('cat', v))),
    dd('Status', TL.st || 'All Status', stateItems(TL.st, v => set('st', v))),
    h('div', { class: 'vnav' }, h('button', { class: 'hbtn xs', 'aria-label': 'Earlier', onclick: () => move(-1) }, icon('back', 15)), h('span', {}, icon('date', 15), formatDate(TL.anchor, 'MMM YYYY')), h('button', { class: 'hbtn xs', 'aria-label': 'Later', onclick: () => move(1) }, icon('chevr', 15)),
      h('button', { class: 'cseg today', onclick: () => { TL.anchor = today; render(); } }, 'Today')),
    searchBox(TL, 'q', 'Search projects…'),
    h('div', { class: 'cviews vseg' }, ['day', 'week', 'month', 'quarter'].map(v => h('button', { class: 'cseg' + (TL.view === v ? ' on' : ''), 'aria-pressed': TL.view === v ? 'true' : 'false', onclick: () => set('view', v) }, v[0].toUpperCase() + v.slice(1))))];
  wrap.append(head({ group: 'projects', cur: 'timeline', crumb: 'Timeline', title: 'Project Timeline', desc: 'Track project schedules, deadlines and progress.', ic: 'timeline', tools, more: a => viewMore(a) }));
  if (!DB.kpiDb()) { wrap.append(noData()); return wrap; }
  let list = filterList(K.allFacts(n), { q: TL.q, cat: TL.cat, st: TL.st });
  list = list.filter(f => TL.scope === 'all' ? true : TL.scope === 'done' ? f.done : !f.done);
  list.sort((a, b) => (a.done - b.done) || ((a.due || a.assigned || 9e15) - (b.due || b.assigned || 9e15)) || a.title.localeCompare(b.title));
  wrap.append(metrics6(K.summary(list)), rulesNote() || '');
  const { top, bot, X, W } = tlScale(TL.view, from, to, SCALE[TL.view].pxd);
  const tx = X(today), inR = d => d && d >= from && d < to;
  const head2 = h('div', { class: 'gtr ghd' },
    h('div', { class: 'gleft' }, h('span', { class: 'gc g-proj' }, 'Project / Customer'), h('span', { class: 'gc g-cat' }, 'Category'), h('span', { class: 'gc g-st' }, 'Status'), h('span', { class: 'gc g-da' }, 'Assigned'), h('span', { class: 'gc g-dd' }, 'Due')),
    h('div', { class: 'gtrack', style: { width: W + 'px' } },
      h('div', { class: 'gtop' }, top.map(c => h('span', { style: { left: c.x + 'px', width: c.w + 'px' } }, c.text))),
      h('div', { class: 'gbot' }, bot.map(c => h('span', { class: c.cls, style: { left: c.x + 'px', width: c.w + 'px' } }, ...[].concat(c.text).map((t, i) => i ? h('small', {}, t) : h('b', {}, t))))),
      inR(today) ? h('span', { class: 'gtoday', style: { left: tx + 'px' } }, 'Today', h('small', {}, formatDate(today, 'D MMM'))) : null));
  const rows = list.map(f => {
    const open = () => go('#/project/' + f.id);
    const start = f.assigned || startOfDay(new Date(D.val(f.row, 'created', n))), end = f.done ? (f.completed || f.due || start) : (f.due || null);
    const track = h('div', { class: 'gtrack', style: { width: W + 'px' } });
    for (const c of bot) track.append(h('i', { class: 'gline', style: { left: c.x + 'px' } }));
    if (end && end >= from && start < to) {
      const x1 = Math.max(0, X(start)), x2 = Math.min(W, X(addDays(end, 1)));
      const cls = 'gbar ' + ({ Completed: 'done', Overdue: 'late', 'Due ≤ 2 Days': 'soon' }[f.state] || 'ok');
      track.append(h('button', { class: cls, style: { left: x1 + 'px', width: Math.max(8, x2 - x1) + 'px' }, title: `${f.title} · ${f.stage} · ${dm(start)} → ${dm(end)}`, onclick: open }, h('span', {}, f.done ? 'Completed' : f.stage)));
      if (!f.done && f.state === 'Overdue' && f.due) { const o1 = Math.max(0, X(addDays(f.due, 1))), o2 = Math.min(W, X(addDays(today, 1))); if (o2 > o1) track.append(h('i', { class: 'gover', style: { left: o1 + 'px', width: (o2 - o1) + 'px' }, title: `Overdue by ${-f.dueDays} days` })); }
      if (!f.done && f.due && inR(f.due)) track.append(h('i', { class: 'gdead', style: { left: X(addDays(f.due, 1)) - 1 + 'px' }, title: 'Due ' + dm(f.due) }));
    } else if (!end) track.append(h('span', { class: 'gnone' }, f.assigned ? 'No due date' : 'No dates'));
    for (const m of K.milestones(f.row)) if (inR(m.d)) {
      const b = h('button', { class: 'gms ' + MS_CLS[m.type], style: { left: X(m.d) + Math.min(8, SCALE[TL.view].pxd / 2) + 'px' }, 'aria-label': `${m.label}, ${dm(m.d)}`, title: `${m.label} · ${dm(m.d)}`, onclick: e => { e.stopPropagation(); toast(`${f.title}: ${m.label} · ${dm(m.d)}`); } });
      track.append(b);
    }
    if (inR(today)) track.append(h('i', { class: 'gnow', style: { left: tx + 'px' } }));
    return h('div', { class: 'gtr', role: 'row' },
      h('button', { class: 'gleft', onclick: open, 'aria-label': 'Open ' + f.title },
        h('span', { class: 'gc g-proj' }, h('b', {}, f.ref || f.title), f.ref ? h('small', {}, f.title) : h('small', {}, f.cats.join(', ') || '—')),
        h('span', { class: 'gc g-cat' }, catChip(f.cat)), h('span', { class: 'gc g-st' }, stateChip(f.state)),
        h('span', { class: 'gc g-da' }, dShort(f.assigned)), h('span', { class: 'gc g-dd' + (f.state === 'Overdue' ? ' late' : '') }, dShort(f.due))),
      track);
  });
  const gantt = h('div', { class: 'hcard gantt', role: 'table', 'aria-label': 'Project timeline' }, vars(h('div', { class: 'gin' }, head2, ...rows,
    rows.length ? null : h('p', { class: 'hempty' }, TL.q || TL.cat || TL.st ? 'No project matches these filters.' : 'No projects to show.')), { '--gw': W + 'px' }));
  const leg = h('div', { class: 'glegend' }, [['ok', 'On track'], ['soon', 'Due ≤ 2 days'], ['late', 'Overdue'], ['done', 'Completed']].map(([c, l]) => h('span', {}, h('i', { class: 'lb ' + c }), l)),
    ...[['survey', 'Site survey'], ['report', 'Report'], ['ecpar', 'ECPAR'], ['ecx', 'ECX'], ['reject', 'Rejection'], ['done', 'Completed']].map(([c, l]) => h('span', {}, h('i', { class: 'gms static ' + MS_CLS[c] }), l)), h('span', {}, h('i', { class: 'lnow' }), 'Today'));
  wrap.append(gantt, leg);
  requestAnimationFrame(() => { const g = gantt; if (g.isConnected && !g._done) { g._done = 1; g.scrollLeft = Math.max(0, tx - 120); } });
  return wrap;
}

// =====================================================================================
// 2. BOARD — Kanban columns are Project Categories; workflow status is inside the cards
// =====================================================================================
const BS = { q: '', cat: '', stage: '', date: '', sort: 'due' };
const CAT_ICON = { SAL100KW: 'play', 'Temporary Supply': 'hourglass', 'Upgrading of Supply': 'redo', 'Non Turnkey': 'layers', 'Substation Site Enquiry': 'date', 'Turnkey Stage 1': 'listcheck', 'Turnkey Stage 2': 'target', 'NEM Solar': 'today', Other: 'folder' };
function nextAction(f) {
  const ep = E.ecparOf(f.row);
  if (f.done) return [icon('okcircle', 13), `Completed${f.completed ? ' (' + dShort(f.completed) + ')' : ''}`];
  if (f.stage === 'Site Survey') return [icon('date', 13), f.ev.surveyPlan ? 'Site survey: ' + dShort(f.ev.surveyPlan) : 'Schedule site survey'];
  if (f.stage === 'Report') return [icon('page', 13), 'Prepare report'];
  if (f.stage === 'ECPAR') { const s = ep ? E.g(ep, 'status') : 'Pending Revision'; return [icon('ecpar', 13), E.ECPAR_ACTIVE.includes(s) ? 'Revise ECPAR' : f.ev.ecparSubmitted ? 'ECPAR: ' + dShort(f.ev.ecparSubmitted) : 'Prepare ECPAR']; }
  if (f.stage === 'ECX') { const x = f.ecx.find(x => E.ECX_ACTIVE.includes(E.g(x, 'status'))) || f.ecx.find(x => !['Approved', 'Closed'].includes(E.g(x, 'status'))); const s = x && E.g(x, 'status'), sub = x && parseDate(E.g(x, 'submitted'));
    return [icon('filex', 13), E.ECX_ACTIVE.includes(s) ? 'Resubmit ' + (E.g(x, 'number') || 'ECX') : sub ? 'ECX: ' + dShort(sub) : 'Submit ECX']; }
  return null;
}
async function changeCategory(f, to) {
  if (f.cats.includes(to)) return;
  const fromRep = f.rep, toRep = K.isReportOnly([to]);
  const impact = [toRep && !fromRep ? 'This is a report-only category: the ECPAR and Connection Charge tabs will be hidden. Existing ECPAR, ECX and connection charge records are kept, not deleted.' : null,
    !toRep && fromRep ? 'This is a full-workflow category: ECPAR and ECX tracking become available.' : null,
    f.cats.length > 1 ? `The project also has: ${f.cats.filter(c => c !== f.cat).join(', ')} — those stay.` : null].filter(Boolean).join(' ');
  if (!(await confirmBox(`Change ${f.title} from ${K.CODE[f.cat] || f.cat} to ${K.CODE[to]} (${to})? ${impact}`, 'Change category'))) return;
  const p = DB.propByName(DB.kpiDb(), 'Project Category');
  D.update(f.id, { ['p:' + p.id]: [to, ...f.cats.filter(c => c !== f.cat && c !== to)] });
  E.log(f.row, 'Project', `Project category changed from ${f.cat} to ${to}.`); toast('Category changed'); render();
}
export function boardScreen() {
  E.ensureAll();
  const n = NOW(); state.ctx = { more: a => viewMore(a) };
  const set = (k, v) => { BS[k] = v; render(); };
  const wrap = h('div', { class: 'wrap home focus vpage v-board' });
  const stages = ['Site Survey', 'Report', 'ECPAR', 'ECX', 'In Progress', 'On Hold', 'Completed'];
  const filterMenu = a => menu(a, [{ el: h('div', { class: 'mhead' }, 'Status') }, { label: 'Any status', checked: !BS.stage, run: () => set('stage', '') }, ...stages.map(s => ({ label: s, checked: BS.stage === s, run: () => set('stage', s) })), { label: 'Overdue', checked: BS.stage === 'Overdue', run: () => set('stage', 'Overdue') }, '-',
    { el: h('div', { class: 'mhead' }, 'Due date') }, ...[['', 'Any time'], ['overdue', 'Overdue'], ['week', 'Due in 7 days'], ['month', 'Due this month'], ['none', 'No due date']].map(([k, l]) => ({ label: l, checked: BS.date === k, run: () => set('date', k) })), '-',
    { el: h('div', { class: 'mhead' }, 'Sort cards by') }, ...[['due', 'Due date'], ['pri', 'Priority'], ['cust', 'Customer']].map(([k, l]) => ({ label: l, checked: BS.sort === k, run: () => set('sort', k) })), '-',
    { label: 'Clear filters', icon: 'close', run: () => { Object.assign(BS, { q: '', cat: '', stage: '', date: '' }); render(); } }], { width: 240 });
  wrap.append(head({ group: 'projects', cur: 'board', crumb: 'Board', title: 'Project Board', desc: 'Projects by category, with each project’s workflow stage.', ic: 'columns', more: a => viewMore(a),
    tools: [dd('Project Category', BS.cat ? K.CODE[BS.cat] || BS.cat : 'All Categories', catItems(BS.cat, v => set('cat', v))), searchBox(BS, 'q', 'Search project…'),
      h('button', { class: 'hbtn sm glass' + (BS.stage || BS.date ? ' on' : ''), 'aria-label': 'Filter and sort', onclick: e => filterMenu(e.currentTarget) }, icon('filter', 17))] }));
  if (!DB.kpiDb()) { wrap.append(noData()); return wrap; }
  const t0 = startOfDay(new Date(n)), eom = new Date(t0.getFullYear(), t0.getMonth() + 1, 0);
  let list = filterList(K.allFacts(n), { q: BS.q, cat: BS.cat });
  if (BS.stage) list = list.filter(f => BS.stage === 'Overdue' ? f.state === 'Overdue' : f.stage === BS.stage);
  if (BS.date) list = list.filter(f => BS.date === 'none' ? !f.due : BS.date === 'overdue' ? f.state === 'Overdue' : f.due && f.dueDays >= 0 && (BS.date === 'week' ? f.dueDays <= 7 : f.due <= eom));
  const sorter = { due: (a, b) => (a.done - b.done) || ((a.due || 9e15) - (b.due || 9e15)), pri: (a, b) => a.pri - b.pri || ((a.due || 9e15) - (b.due || 9e15)), cust: (a, b) => a.title.localeCompare(b.title) }[BS.sort];
  // the six progress cards (same records as the columns below)
  const open = list.filter(f => !f.done), cnt = s => open.filter(f => f.stage === s).length;
  const card = (cls, ic, v, l, st) => h('button', { class: 'kb vm ' + cls + (BS.stage === st && st ? ' sel' : ''), onclick: () => set('stage', BS.stage === st ? '' : st) }, h('span', { class: 'kbi' }, icon(ic, 20)), h('span', { class: 'kbt' }, h('b', { class: 'vmv' }, String(v)), h('small', {}, l)));
  wrap.append(h('section', { class: 'kbar5 vmetrics' },
    card('k-violet', 'date', list.length, 'Total Projects', ''), card('k-blue', 'target', cnt('Site Survey'), 'Site Survey', 'Site Survey'), card('k-violet', 'ecpar', cnt('ECPAR'), 'ECPAR', 'ECPAR'),
    card('k-green', 'filex', cnt('ECX'), 'ECX', 'ECX'), card('k-gray', 'okcircle', list.filter(f => f.done).length, 'Completed', 'Completed'), card('k-red', 'info', open.filter(f => f.state === 'Overdue').length, 'Overdue', 'Overdue')));
  const cols = [...K.CAT_ORDER.slice(0, 7), ...(list.some(f => f.cat === 'NEM Solar') || BS.cat === 'NEM Solar' ? ['NEM Solar'] : []), ...(list.some(f => f.cat === 'Other') ? ['Other'] : [])].filter(c => !BS.cat || c === BS.cat);
  let drag = null;
  const board = h('div', { class: 'kban', role: 'list' }, cols.map(c => {
    const items = list.filter(f => f.cat === c).sort(sorter), col = K.catColor(c);
    const body = h('div', { class: 'kcol-b' }, items.map(f => {
      const act = nextAction(f), late = !f.done && (f.state === 'Overdue' || f.state === 'Due ≤ 2 Days');
      const el = h('div', { class: 'kcard', role: 'listitem', tabindex: '0', draggable: 'true', onclick: () => go('#/project/' + f.id), onkeydown: e => { if (e.key === 'Enter') go('#/project/' + f.id); },
        ondragstart: e => { drag = f; e.dataTransfer.setData('text/plain', f.id); e.dataTransfer.effectAllowed = 'move'; } },
        h('div', { class: 'kch1' }, h('b', {}, f.ref || 'No ref'), h('button', { class: 'c-act ebtn', 'aria-label': 'Actions for ' + f.title, onclick: e => { e.stopPropagation(); menu(e.currentTarget, [
          { label: 'Open project', icon: 'expand', run: () => go('#/project/' + f.id) },
          { label: 'Change category…', icon: 'layers', run: () => menu(el, K.CAT_ORDER.filter(x => x !== f.cat).map(x => ({ label: `${K.CODE[x]} — ${x}`, run: () => changeCategory(f, x) })), { width: 250 }) }]); } }, icon('more', 16))),
        h('span', { class: 'kcust' }, f.title),
        h('span', { class: 'kstage ' + (STAGE_TONE[f.stage] || 'gray') }, icon(STAGE_ICON[f.stage] || 'play', 13), f.stage),
        f.stage === 'In Progress' || f.stage === 'Report' ? h('div', { class: 'kprog' }, h('span', { class: 'kpbar' }, h('i', { style: { width: f.progress + '%' } })), h('small', {}, f.progress + '%')) : null,
        act ? h('span', { class: 'kact' }, ...act) : null,
        !f.done && f.due ? h('span', { class: 'kdue' + (late ? ' late' : '') }, icon('date', 13), (f.state === 'Overdue' ? 'Overdue: ' : 'Due: ') + dShort(f.due)) : null);
      return el;
    }), items.length ? null : h('p', { class: 'kempty' }, 'No projects'));
    const colEl = vars(h('section', { class: 'kcol', 'aria-label': c },
      h('header', { class: 'kcol-h' }, icon(CAT_ICON[c], 16), h('b', { title: c }, K.CODE[c]), h('span', { class: 'kcount' }, items.length)),
      body, c === 'Other' ? null : h('button', { class: 'kadd', onclick: () => newProjectSheet({ cat: c }) }, icon('plus', 15), 'Add Project')), { '--c': col });
    colEl.addEventListener('dragover', e => { if (drag && c !== 'Other' && drag.cat !== c) { e.preventDefault(); colEl.classList.add('drop'); } });
    colEl.addEventListener('dragleave', () => colEl.classList.remove('drop'));
    colEl.addEventListener('drop', e => { e.preventDefault(); colEl.classList.remove('drop'); const f = drag; drag = null; if (f && c !== 'Other') changeCategory(f, c); });
    return colEl;
  }));
  wrap.append(board);
  return wrap;
}

// =====================================================================================
// 3. REPORTS
// =====================================================================================
const RS = { mode: 'month', anchor: null, cat: '', st: '', tab: 'all', from: '', to: '', show: 60 };
function period(S, today) {
  const a = S.anchor || new Date(today.getFullYear(), today.getMonth(), 1);
  if (S.mode === 'custom' && S.from && S.to) { const f = startOfDay(parseDate(S.from)), t = startOfDay(parseDate(S.to)); return { from: f, to: t, label: dm(f) + ' – ' + dm(t), prev: { from: addDays(f, -(t - f) / DAY - 1), to: addDays(f, -1) } }; }
  if (S.mode === 'year') { const f = new Date(a.getFullYear(), 0, 1), t = new Date(a.getFullYear(), 11, 31); return { from: f, to: t, label: String(a.getFullYear()), prev: { from: new Date(a.getFullYear() - 1, 0, 1), to: new Date(a.getFullYear() - 1, 11, 31) } }; }
  if (S.mode === 'quarter') { const q = Math.floor(a.getMonth() / 3), f = new Date(a.getFullYear(), q * 3, 1), t = new Date(a.getFullYear(), q * 3 + 3, 0); return { from: f, to: t, label: `Q${q + 1} ${a.getFullYear()}`, prev: { from: new Date(f.getFullYear(), f.getMonth() - 3, 1), to: new Date(f.getFullYear(), f.getMonth(), 0) } }; }
  const f = new Date(a.getFullYear(), a.getMonth(), 1), t = new Date(a.getFullYear(), a.getMonth() + 1, 0); return { from: f, to: t, label: formatDate(f, 'MMM YYYY'), prev: { from: new Date(f.getFullYear(), f.getMonth() - 1, 1), to: new Date(f.getFullYear(), f.getMonth(), 0) } };
}
const kpiIn = (list, from, to) => list.filter(f => f.kpiEnd && startOfDay(f.kpiEnd) >= from && startOfDay(f.kpiEnd) <= to);
function cellSurvey(f) { return f.ev.survey ? dShort(f.ev.survey) : f.surveyState === 'pending' ? (f.ev.surveyPlan ? 'Planned ' + dShort(f.ev.surveyPlan) : 'Pending') : f.surveyState === 'done' ? 'Done' : '—'; }
function cellEcpar(f) { if (f.rep) return 'Not applicable'; const ep = E.ecparOf(f.row); if (!ep && !f.ecparStatus) return 'Not started'; const s = f.ecparStatus || 'Draft'; return s + (f.ev.ecparSubmitted && !E.ECPAR_ACTIVE.includes(s) ? ' ' + dShort(f.ev.ecparSubmitted) : ''); }
function cellEcx(f) { if (f.rep) return 'Not applicable'; if (!f.ecx.length) return 'None'; const st = f.ecx.map(x => E.g(x, 'status') || 'Draft'); const ap = st.filter(s => s === 'Approved').length; return f.ecx.length === 1 ? st[0] : `${f.ecx.length} applications · ${ap} approved`; }
export function reportsScreen() {
  E.ensureAll();
  const n = NOW(), today = startOfDay(new Date(n)); if (!RS.anchor) RS.anchor = new Date(today.getFullYear(), today.getMonth(), 1);
  const set = (k, v) => { RS[k] = v; RS.show = 60; render(); };
  const P = period(RS, today);
  const move = k => { const a = RS.anchor; RS.anchor = RS.mode === 'year' ? new Date(a.getFullYear() + k, 0, 1) : RS.mode === 'quarter' ? new Date(a.getFullYear(), a.getMonth() + 3 * k, 1) : new Date(a.getFullYear(), a.getMonth() + k, 1); if (RS.mode === 'custom') RS.mode = 'month'; render(); };
  const custom = () => { const f = h('input', { type: 'date', class: 'field', value: RS.from || toISODate(P.from) }), t = h('input', { type: 'date', class: 'field', value: RS.to || toISODate(P.to) });
    sheet('Custom date range', h('div', { class: 'ltform' }, h('label', { class: 'ltf' }, h('span', {}, 'From'), f), h('label', { class: 'ltf' }, h('span', {}, 'To'), t)), { done: 'Apply', onDone: () => { if (f.value && t.value && f.value <= t.value) { RS.from = f.value; RS.to = t.value; RS.mode = 'custom'; render(); } else toast('Choose a start date before the end date'); } }); };
  const wrap = h('div', { class: 'wrap home focus vpage v-reports' });
  const exportMenu = a => menu(a, [{ label: 'Export PDF', icon: 'export', run: () => exportReport('pdf') }, { label: 'Export Excel (CSV)', icon: 'table', run: () => exportReport('csv') }]);
  wrap.append(head({ group: 'reports', cur: 'reports', crumb: 'Report', title: 'Project Reports', desc: 'KPI performance, project analysis and turnaround time.', ic: 'barchart', more: a => viewMore(a, [{ label: 'Export PDF', icon: 'export', run: () => exportReport('pdf') }, { label: 'Export Excel (CSV)', icon: 'table', run: () => exportReport('csv') }]),
    tools: [dd('Project Category', RS.cat ? K.CODE[RS.cat] || RS.cat : 'All Categories', catItems(RS.cat, v => set('cat', v))), dd('Status', RS.st || 'All Status', stateItems(RS.st, v => set('st', v))),
      dd('Period', P.label, [['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year']].map(([k, l]) => ({ label: l, checked: RS.mode === k, run: () => set('mode', k) })).concat([{ label: 'Custom date range…', checked: RS.mode === 'custom', run: custom }])),
      h('div', { class: 'vnav' }, h('button', { class: 'hbtn xs', 'aria-label': 'Previous period', onclick: () => move(-1) }, icon('back', 15)), h('span', {}, icon('date', 15), P.label), h('button', { class: 'hbtn xs', 'aria-label': 'Next period', onclick: () => move(1) }, icon('chevr', 15))),
      h('div', { class: 'cviews vseg' }, [['month', 'This Month'], ['quarter', 'This Quarter'], ['year', 'This Year']].map(([k, l]) => h('button', { class: 'cseg' + (RS.mode === k && +RS.anchor === +new Date(today.getFullYear(), RS.mode === 'year' ? 0 : RS.mode === 'quarter' ? Math.floor(today.getMonth() / 3) * 3 : today.getMonth(), 1) ? ' on' : ''), onclick: () => { RS.mode = k; RS.anchor = new Date(today.getFullYear(), k === 'year' ? 0 : k === 'quarter' ? Math.floor(today.getMonth() / 3) * 3 : today.getMonth(), 1); render(); } }, l))),
      h('button', { class: 'sbtn', onclick: e => exportMenu(e.currentTarget) }, icon('export', 14), 'Export')] }));
  if (!DB.kpiDb()) { wrap.append(noData()); return wrap; }
  const base = filterList(K.allFacts(n, { archived: true }), { cat: RS.cat, st: RS.st });
  const list = base.filter(f => K.inPeriod(f, P.from, P.to)), s = K.summary(list);
  const done = kpiIn(list, P.from, P.to), sk = K.summary(done), prevK = K.summary(kpiIn(base.filter(f => K.inPeriod(f, P.prev.from, P.prev.to)), P.prev.from, P.prev.to));
  wrap.append(metrics6({ ...s, avg: sk.avg, pct: sk.pct, eligible: sk.eligible }), rulesNote() || '');
  // A. KPI doughnut
  const segs = [{ label: 'Within 7 Days', value: sk.within, color: 'var(--vblue)' }, { label: '> 7 Days', value: sk.beyond, color: 'var(--vviolet)' }];
  const diff = sk.pct != null && prevK.pct != null ? Math.round((sk.pct - prevK.pct) * 10) / 10 : null;
  const kpiP = panel('target', 'KPI — Within 7 Days', sk.eligible ? h('div', { class: 'dwrap vdw' }, donut(segs, pctTxt(sk.pct), 'Within 7 Days', `Within 7 days ${sk.within}, beyond ${sk.beyond}`),
    h('div', {}, legend(segs, sk.eligible), diff != null ? h('p', { class: 'vdelta ' + (diff >= 0 ? 'up' : 'down') }, (diff >= 0 ? '▲ +' : '▼ ') + diff + '% vs previous period (' + pctTxt(prevK.pct) + ')') : null,
      s.missing ? h('p', { class: 'muted small' }, s.missing + ' completed without the KPI dates are not counted.') : null))
    : h('p', { class: 'hempty' }, 'No project reached its KPI completion in ' + P.label + '.'));
  // B. turnaround trend
  const trend = RS.mode === 'quarter' ? K.quarterly(base, P.to, 4).map(q => ({ label: 'Q' + (Math.floor(q.from.getMonth() / 3) + 1), v: q.avg, tip: `Q${Math.floor(q.from.getMonth() / 3) + 1} ${q.from.getFullYear()}: ${q.avg == null ? 'no data' : days(q.avg)} (${q.eligible} projects)` }))
    : K.monthly(base, P.to, RS.mode === 'year' ? 12 : 6).map(m => ({ label: formatDate(m.from, 'MMM'), v: m.avg, tip: `${formatDate(m.from, 'MMMM YYYY')}: ${m.avg == null ? 'no data' : days(m.avg)} (${m.eligible} projects)` }));
  const trendP = panel('linechart', 'Turnaround Time Trend', lineChart(trend, { label: 'Average turnaround days per ' + (RS.mode === 'quarter' ? 'quarter' : 'month') }), h('small', { class: 'muted vunit' }, K.kpiRules().days === 'working' ? 'working days' : 'calendar days'));
  // C. by category
  const cats = [...K.CAT_ORDER, 'Other'].map(c => ({ c, v: list.filter(f => f.cat === c).length })).filter(x => x.v || K.CAT_ORDER.slice(0, 7).includes(x.c));
  const catP = panel('layers', 'Projects by Category', hbars(cats.map(x => ({ label: K.CODE[x.c], value: x.v, color: K.catColor(x.c), note: list.length ? '(' + Math.round(x.v / list.length * 1000) / 10 + '%)' : '' }))));
  wrap.append(h('div', { class: 'vgrid3' }, kpiP, trendP, catP));
  // table
  const rows = list.filter(f => RS.tab === 'all' ? true : RS.tab === 'in' ? f.within === true : f.within === false).sort((a, b) => (a.ref || a.title).localeCompare(b.ref || b.title));
  const shown = rows.slice(0, RS.show);
  const tabs = h('div', { class: 'cviews vseg' }, [['all', 'All Projects'], ['in', 'Within 7 Days'], ['out', '> 7 Days']].map(([k, l]) => h('button', { class: 'cseg' + (RS.tab === k ? ' on' : ''), onclick: () => set('tab', k) }, l)));
  const tbl = h('div', { class: 'rtab', role: 'table' }, h('div', { class: 'rrow rhd', role: 'row' }, ['Project ID', 'Customer', 'Category', 'Status', 'Site Survey', 'ECPAR', 'ECX', 'Turnaround', 'Within 7 Days'].map(c => h('span', {}, c))),
    ...shown.map(f => h('div', { class: 'rrow', role: 'row', tabindex: '0', onclick: () => go('#/project/' + f.id) },
      h('span', { class: 'mono' }, f.ref || '—'), h('span', { class: 'rcu' }, f.title), h('span', {}, catChip(f.cat)), h('span', {}, stateChip(f.state)),
      h('span', {}, cellSurvey(f)), h('span', { class: f.rep ? 'muted' : '' }, cellEcpar(f)), h('span', { class: f.rep ? 'muted' : '' }, cellEcx(f)),
      h('span', { class: 'rta' + (f.within === false ? ' late' : '') }, f.turnaround != null ? days(f.turnaround) : f.done ? 'Missing dates' : 'Open'),
      h('span', { class: 'rw' }, f.within == null ? h('span', { class: 'muted' }, '—') : f.within ? h('span', { class: 'ok', 'aria-label': 'Yes' }, icon('okcircle', 18)) : h('span', { class: 'no', 'aria-label': 'No' }, icon('xcircle', 18))))),
    rows.length ? null : h('p', { class: 'hempty' }, 'No projects in ' + P.label + ' for these filters.'));
  wrap.append(h('section', { class: 'hcard vpanel vtable' }, h('div', { class: 'chead' }, icon('page', 18), h('h2', {}, `Project Details (${P.label})`), h('span', { class: 'hcount' }, rows.length), h('div', { class: 'vth' }, tabs)), tbl,
    rows.length > shown.length ? h('div', { class: 'pfoot' }, h('span', {}, `Showing ${shown.length} of ${rows.length}`), h('button', { class: 'btn', onclick: () => { RS.show += 100; render(); } }, 'Show more')) : null));
  function exportReport(kind) {
    const filters = `Category: ${RS.cat || 'All'} · Status: ${RS.st || 'All'} · Table: ${{ all: 'All Projects', in: 'Within 7 Days', out: '> 7 Days' }[RS.tab]}`;
    const rules = `KPI: Date Assigned → ${[...new Set(Object.values(K.kpiRules().end))].map(k => K.END_EVENTS[k]).join(' / ')}, ${K.kpiRules().days} days`;
    const head = ['Project ID', 'Customer', 'Project Category', 'Project Status', 'Workflow Stage', 'Date Assigned', 'Due Date', 'KPI Completion', 'Site Survey', 'ECPAR', 'ECX', 'Turnaround (days)', 'Within 7 Days'];
    const data = rows.map(f => [f.ref, f.title, f.cats.join(', ') || 'Other', f.state, f.stage, dm(f.assigned), dm(f.due), f.kpiEnd ? dm(f.kpiEnd) : '', cellSurvey(f), cellEcpar(f), cellEcx(f), f.turnaround ?? '', f.within == null ? '' : f.within ? 'Yes' : 'No']);
    const name = `Project Report ${P.label}`.replace(/[\\/:*?"<>|]+/g, '-');
    if (kind === 'csv') {
      const q = v => { const t = String(v ?? ''); return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
      const lines = [['Project Reports'], ['Reporting period', P.label + ` (${dm(P.from)} – ${dm(P.to)})`], ['Generated', dm(new Date(n))], ['Filters', filters], ['Rules', rules],
        ['Total Projects', s.total], ['On Track', s.onTrack], ['Due Within 2 Days', s.due2], ['Overdue', s.overdue], ['Average Turnaround (days)', sk.avg ?? ''], ['Within 7 Days (%)', sk.pct ?? ''], [], head, ...data];
      download(name + '.csv', '﻿' + lines.map(r => r.map(q).join(',')).join('\r\n'), 'text/csv;charset=utf-8'); toast('Saved ' + name + '.csv'); return;
    }
    const doc = h('div', { id: 'ccprint' }, h('h1', {}, 'Project Reports'), h('p', { class: 'cpn' }, `Reporting period: ${P.label} (${dm(P.from)} – ${dm(P.to)}) · Generated ${dm(new Date(n))}`), h('p', { class: 'cpn' }, filters + ' · ' + rules),
      h('table', { class: 'kv' }, [['Total Projects', s.total], ['On Track', s.onTrack], ['Due Within 2 Days', s.due2], ['Overdue', s.overdue], ['Average Turnaround', days(sk.avg)], ['Within 7 Days', pctTxt(sk.pct) + ` (${sk.within} of ${sk.eligible} completed)`]].map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, String(v))))),
      h('table', { class: 'items' }, h('thead', {}, h('tr', {}, head.map(x => h('th', {}, x)))), h('tbody', {}, data.map(r => h('tr', {}, r.map(c => h('td', {}, String(c ?? ''))))))));
    document.getElementById('ccprint')?.remove(); document.body.append(doc); document.body.classList.add('cc-printing');
    const fin = () => { document.body.classList.remove('cc-printing'); doc.remove(); window.removeEventListener('afterprint', fin); };
    window.addEventListener('afterprint', fin); setTimeout(() => window.print(), 50); setTimeout(fin, 60000);
  }
  return wrap;
}

// =====================================================================================
// 4. KPI DASHBOARD
// =====================================================================================
const KS = { month: null, cat: '', st: '', view: 'turn' };
export function kpiScreen() {
  E.ensureAll();
  const n = NOW(), today = startOfDay(new Date(n)); if (!KS.month) KS.month = new Date(today.getFullYear(), today.getMonth(), 1);
  const set = (k, v) => { KS[k] = v; render(); };
  state.ctx = { more: a => viewMore(a) };
  const from = KS.month, to = new Date(from.getFullYear(), from.getMonth() + 1, 0), pf = new Date(from.getFullYear(), from.getMonth() - 1, 1), pt = new Date(from.getFullYear(), from.getMonth(), 0);
  const wrap = h('div', { class: 'wrap home focus vpage v-kpi' });
  wrap.append(head({ group: 'reports', cur: 'kpi', crumb: 'Monthly KPI', title: 'KPI Dashboard', desc: 'Project performance, turnaround time and KPI achievement.', ic: 'barchart', more: a => viewMore(a),
    tools: [h('div', { class: 'vnav' }, h('span', {}, icon('date', 15), formatDate(from, 'MMM YYYY')), h('button', { class: 'hbtn xs', 'aria-label': 'Previous month', onclick: () => set('month', pf) }, icon('back', 15)), h('button', { class: 'hbtn xs', 'aria-label': 'Next month', onclick: () => set('month', new Date(from.getFullYear(), from.getMonth() + 1, 1)) }, icon('chevr', 15)),
      h('button', { class: 'cseg today', onclick: () => set('month', new Date(today.getFullYear(), today.getMonth(), 1)) }, 'This month')),
      dd('Category', KS.cat ? K.CODE[KS.cat] || KS.cat : 'All Categories', catItems(KS.cat, v => set('cat', v))), dd('Status', KS.st || 'All Status', stateItems(KS.st, v => set('st', v))),
      h('button', { class: 'sbtn', onclick: kpiRulesSheet }, icon('target', 14), 'KPI rules')] }));
  if (!DB.kpiDb()) { wrap.append(noData()); return wrap; }
  const base = filterList(K.allFacts(n, { archived: true }), { cat: KS.cat, st: KS.st });
  const list = base.filter(f => K.inPeriod(f, from, to)), prevL = base.filter(f => K.inPeriod(f, pf, pt));
  const s = K.summary(list), p = K.summary(prevL), sk = K.summary(kpiIn(list, from, to)), pk = K.summary(kpiIn(prevL, pf, pt));
  const ch = (a, b, { pts = false, lowerBetter = false } = {}) => { if (a == null || b == null) return h('em', { class: 'vmsub' }, 'no data last month'); const d = pts ? Math.round((a - b) * 10) / 10 : b ? Math.round((a - b) / b * 100) : null; if (d == null) return h('em', { class: 'vmsub' }, 'new this month');
    const good = lowerBetter ? d <= 0 : d >= 0; return h('em', { class: 'vmsub ' + (d === 0 ? '' : good ? 'up' : 'down') }, (d > 0 ? '↑ ' : d < 0 ? '↓ ' : '') + Math.abs(d) + (pts ? ' pts' : '%') + ' vs last month'); };
  const bar = (v, of, cls) => h('span', { class: 'vmbar2 ' + cls }, h('small', {}, of ? Math.round(v / of * 100) + '%' : '0%'), h('span', { class: 'vbar' }, h('i', { style: { width: (of ? v / of * 100 : 0) + '%' } })));
  wrap.append(metrics6({ ...s, avg: sk.avg, pct: sk.pct, eligible: sk.eligible }, { total: ch(s.total, p.total), onTrack: bar(s.onTrack, s.open, 'green'), due2: bar(s.due2, s.open, 'orange'), overdue: bar(s.overdue, s.open, 'red'), avg: ch(sk.avg, pk.avg, { lowerBetter: true }), pct: ch(sk.pct, pk.pct, { pts: true }) }), rulesNote() || '');
  // KPI achievement trend (7 months, target 100%)
  const trend = K.monthly(base, to, 7).map(m => ({ label: formatDate(m.from, 'MMM'), v: m.pct, tip: `${formatDate(m.from, 'MMMM YYYY')}: ${m.pct == null ? 'no completed projects' : m.pct + '% within 7 days (' + m.within + ' of ' + m.eligible + ')'}` }));
  const trendP = panel('barchart', 'KPI Achievement Trend', barChart(trend, { label: 'Monthly percentage completed within 7 days, target 100%' }), h('small', { class: 'muted vunit' }, 'Within 7 Days, target 100%'));
  // projects by category
  const catRows = [...K.CAT_ORDER, 'Other'].map(c => ({ c, v: list.filter(f => f.cat === c).length })).filter(x => x.v);
  const segs = catRows.map(x => ({ label: K.CODE[x.c], value: x.v, color: K.catColor(x.c) }));
  const catP = panel('layers', 'Projects by Category', list.length ? h('div', { class: 'dwrap vdw' }, donut(segs, String(list.length), 'Total Projects', 'Projects by category: ' + segs.map(x => x.label + ' ' + x.value).join(', ')), legend(segs, list.length)) : h('p', { class: 'hempty' }, 'No projects in ' + formatDate(from, 'MMMM YYYY') + '.'));
  // activity turnaround
  const act = K.activityTurnaround(list), amax = Math.max(1, ...act.map(a => a.avg || 0));
  const actP = panel('history', 'Turnaround Time', h('div', {}, hbars(act.map((a, i) => ({ label: a.key + ` (${a.n})`, value: a.avg, color: ['var(--vblue)', 'var(--vviolet)', 'var(--vgreen)'][i] })), { fmt: v => days(v), max: amax }),
    h('p', { class: 'muted small' }, 'Site Survey: Date Assigned → survey done · ECPAR: survey done → ECPAR submitted · ECX: each application submitted → approved. Only recorded dates are used.')));
  wrap.append(h('div', { class: 'vgrid3' }, trendP, catP, actP));
  // performance by category
  const perf = [...K.CAT_ORDER, 'Other'].map(c => { const l = list.filter(f => f.cat === c), x = K.summary(l), k = K.summary(kpiIn(l, from, to)); return { c, ...x, avg: k.avg, pct: k.pct, eligible: k.eligible }; }).filter(r => r.total || K.CAT_ORDER.slice(0, 7).includes(r.c));
  const tot = { c: 'Total', ...s, avg: sk.avg, pct: sk.pct };
  const prow = (r, t) => h('div', { class: 'prw' + (t ? ' tot' : ''), role: 'row' }, h('span', { class: 'pcn' }, t ? null : h('i', { style: { background: K.catColor(r.c) } }), t ? 'Total' : K.CODE[r.c]),
    h('span', {}, r.total), h('span', {}, r.onTrack), h('span', {}, r.due2), h('span', { class: r.overdue ? 'late' : '' }, r.overdue), h('span', {}, days(r.avg)),
    h('span', { class: 'pw' }, h('span', { class: 'pwbar' }, h('i', { style: { width: (r.pct || 0) + '%', background: t ? 'var(--ink2)' : K.catColor(r.c) } })), h('small', {}, pctTxt(r.pct))));
  const perfP = panel('target', 'Project Performance by Category', h('div', { class: 'ptbl', role: 'table' }, h('div', { class: 'prw phd', role: 'row' }, ['Category', 'Total Projects', 'On Track', 'Due ≤ 2 Days', 'Overdue', 'Avg. Turnaround', 'Within 7 Days'].map(x => h('span', {}, x))), ...perf.map(r => prow(r)), prow(tot, true)));
  // KPI by project type (grouped by category)
  const metric = { turn: ['Turnaround Time', r => r.avg, v => days(v)], within: ['Within 7 Days', r => r.pct, v => pctTxt(v)], overdue: ['Overdue', r => r.overdue, v => String(v)] }[KS.view];
  const typeP = panel('linechart', 'KPI by Project Type', hbars(perf.map(r => ({ label: K.CODE[r.c], value: metric[1](r), color: K.catColor(r.c) })), { fmt: metric[2], max: KS.view === 'within' ? 100 : undefined }),
    h('div', { class: 'cviews vseg' }, [['turn', 'Turnaround Time'], ['within', 'Within 7 Days'], ['overdue', 'Overdue']].map(([k, l]) => h('button', { class: 'cseg' + (KS.view === k ? ' on' : ''), onclick: () => set('view', k) }, l))));
  wrap.append(h('div', { class: 'vgrid2' }, perfP, typeP));
  if (KS.cat === '' || !K.isReportOnly([KS.cat])) wrap.append(ecparRejPanel(base, from, to, n));
  return wrap;
}
// ECPAR Rejected KPI: Date Rejected → Date Resubmitted (retrigger), target 1 day
function ecparRejPanel(base, from, to, n) {
  const all = K.ecparRejections(base, n), inM = all.filter(r => r.rejected >= from && r.rejected <= to), s = K.rejSummary(inM);
  const unit = K.kpiRules().days === 'working' ? 'working days' : 'days';
  const cell = (v, l, cls = '') => h('div', { class: 'rjk ' + cls }, h('b', {}, v), h('small', {}, l));
  const trend = Array.from({ length: 7 }, (_, i) => { const f = new Date(to.getFullYear(), to.getMonth() - 6 + i, 1), t = new Date(f.getFullYear(), f.getMonth() + 1, 0), x = K.rejSummary(all.filter(r => r.rejected >= f && r.rejected <= t));
    return { label: formatDate(f, 'MMM'), v: x.pct, tip: `${formatDate(f, 'MMMM YYYY')}: ${x.pct == null ? 'no resubmitted rejections' : x.pct + '% resubmitted within 1 day (' + x.within + ' of ' + x.resubmitted + ')'}${x.open ? ' · ' + x.open + ' waiting' : ''}` }; });
  const rows = inM.map(r => h('div', { class: 'rjr', role: 'row', tabindex: '0', onclick: () => go('#/project/' + r.f.id + '/ecpar') },
    h('span', {}, h('b', {}, r.f.title), h('small', {}, [r.f.ref, r.ref, r.n > 1 ? 'rejection ' + r.n : ''].filter(Boolean).join(' · ') || '—')),
    h('span', {}, dm(r.rejected)), h('span', {}, r.resub ? dm(r.resub) : h('span', { class: r.late ? 'late' : 'muted' }, r.late ? `Not yet · ${r.age} ${unit}` : 'Waiting')),
    h('span', { class: r.within === false ? 'late' : '' }, r.days == null ? '—' : days(r.days)),
    h('span', { class: 'rw' }, r.within == null ? (r.late ? h('span', { class: 'no', 'aria-label': 'Late' }, icon('xcircle', 18)) : h('span', { class: 'muted' }, '—')) : r.within ? h('span', { class: 'ok', 'aria-label': 'Yes' }, icon('okcircle', 18)) : h('span', { class: 'no', 'aria-label': 'No' }, icon('xcircle', 18)))));
  return h('section', { class: 'hcard vpanel rjpanel' },
    h('div', { class: 'chead' }, icon('ecpar', 18), h('h2', {}, 'ECPAR Rejected — Resubmit within 1 day'), h('small', { class: 'muted vunit' }, `Date Rejected → Date Resubmitted · ${unit}`)),
    h('div', { class: 'rjgrid' },
      h('div', {}, h('div', { class: 'rjks' }, cell(String(s.total), 'Rejections'), cell(String(s.resubmitted), 'Resubmitted'), cell(pctTxt(s.pct), 'Within 1 day', s.pct == null ? '' : s.pct >= 100 ? 'good' : 'bad'),
        cell(s.avg == null ? '—' : days(s.avg), 'Avg. to resubmit'), cell(String(s.open), 'Waiting'), cell(String(s.late), 'Late (> 1 day)', s.late ? 'bad' : '')),
        barChart(trend, { label: 'Monthly percentage of ECPAR rejections resubmitted within 1 day, target 100%', color: 'var(--vviolet)' })),
      h('div', { class: 'rjtbl', role: 'table' }, h('div', { class: 'rjr rhd', role: 'row' }, ['Project', 'Rejected', 'Resubmitted', 'Days', 'Within 1 day'].map(x => h('span', {}, x))), ...rows,
        rows.length ? null : h('p', { class: 'hempty' }, 'No ECPAR was rejected in ' + formatDate(from, 'MMMM YYYY') + '.'))));
}
