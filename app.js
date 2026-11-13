// Folio v2 — boot, router, layout modes, sidebar, floating navigation, list screens.
import * as D from './data.js';
import * as DB from './db.js';
import * as Sync from './sync.js';
import * as S from './store.js';
import { h, icon, logo, $, toast, menu, sheet, promptBox, later } from './ui.js';
import { formatDate, toISODate } from './dates.js';
import { renderPage, renderRow, newPage } from './page.js';
import { renderDb, popEdit } from './table.js';
import { renderSettings, startupSync } from './settings.js';
import { initLock } from './lock.js';
import { renderSearch } from './search.js';
import { startNotifier } from './notify.js';
import { initKeyboardBar } from './kbar.js';

export const state = { route: [], pane: null, ctx: {} };

// ---------- app-wide font (synced with the workspace settings) ----------
let appFont = 'default';
export async function loadFont() {
  const ws = (await S.meta.get('ws-settings')) || {};
  let f = ws.font;
  if (!f) { const p = D.all().find(r => r.k === 'page' && ['serif', 'mono'].includes(D.val(r, 'font'))); f = p ? D.val(p, 'font') : 'default'; } // keep a font chosen earlier on a page
  setFontClass(f);
}
function setFontClass(f) { appFont = f; document.body.classList.remove('font-default', 'font-serif', 'font-mono'); document.body.classList.add('font-' + f); }
async function chooseFont(f) { setFontClass(f); await Sync.saveSettings({ font: f }); Sync.soon(500); }
/** The ⋯ menu, the same on every screen. `extra` goes on top; `rec` adds Copy link / Move to Trash for that page. */
export function moreMenu(anchor, { extra = [], rec = null, onTrash = null } = {}) {
  const link = location.href.split('#')[0] + (rec ? '#/' + (rec.k === 'row' ? 'r/' : 'p/') + rec.id : location.hash);
  menu(anchor, [
    ...extra, ...(extra.length ? ['-'] : []),
    { label: 'Font: Default', icon: 'text', checked: appFont === 'default', run: () => chooseFont('default') },
    { label: 'Font: Serif', icon: 'text', checked: appFont === 'serif', run: () => chooseFont('serif') },
    { label: 'Font: Mono', icon: 'text', checked: appFont === 'mono', run: () => chooseFont('mono') }, '-',
    { label: 'Copy link', icon: 'link', run: () => navigator.clipboard.writeText(link).then(() => toast('Link copied'), () => toast('Could not copy the link')) },
    ...(state.route[0] === 'settings' ? [] : [{ label: 'Settings', icon: 'settings', run: () => go('#/settings') }]),
    ...(rec && onTrash ? [{ label: 'Move to Trash', icon: 'trash', danger: true, run: onTrash }] : [])]);
}
const NOW = () => (window.FOLIO_NOW ? +window.FOLIO_NOW : Date.now()); // FOLIO_NOW lets tests pin the date
export const now = NOW;

// ---------- layout ----------
function layout() {
  const w = innerWidth, hgt = innerHeight, b = document.body;
  let mode = w >= 1000 ? 'wide' : w >= 600 ? 'split' : 'phone';
  if (mode === 'phone' && (hgt / w < 1.6)) mode = 'rail'; // iPhone Duo outer screen: short and wide
  const sai = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sair')) || 0;
  if (mode === 'phone' && sai > 40) mode = 'rail';
  if (b.dataset.layout !== mode || b.dataset.orient !== (hgt > w ? 'portrait' : 'landscape')) {
    b.dataset.layout = mode; b.dataset.orient = hgt > w ? 'portrait' : 'landscape';
    // Duo outer screen and Duo inner screen held upright: actions top-right, menu as a bar at the bottom
    b.dataset.nav = mode === 'rail' || mode === 'split' ? 'bar' : 'column'; render();
  }
}
export const layoutMode = () => document.body.dataset.layout;

// ---------- routing ----------
export function go(hash, { replace = false } = {}) { if (location.hash === hash) render(); else if (replace) location.replace(hash); else location.hash = hash; }
export function openTask(id) {
  const m = layoutMode();
  if ((m === 'split' || m === 'wide') && ['today', 'survey', 'ecpar', 'db', 'archive', 'tracker'].includes(state.route[0])) { state.pane = id; render(); }
  else go('#/r/' + id);
}
export function back() { if (history.length > 1) history.back(); else go('#/today'); }

export function render() {
  const app = $('#app'); if (!app) return;
  const r = (location.hash.replace(/^#\/?/, '') || 'today').split('/'); state.route = r;
  const main = $('#main'); const scroll = main.scrollTop; const same = main.dataset.route === location.hash;
  main.replaceChildren(); main.dataset.route = location.hash;
  try {
    switch (r[0]) {
      case 'today': main.append(listScreen('today')); break;
      case 'survey': main.append(listScreen('survey')); break;
      case 'ecpar': main.append(listScreen('ecpar')); break;
      case 'tracker': case 'archive': {
        const d = DB.kpiDb(); if (!d) { main.append(emptyTracker()); break; }
        const pg = D.val(d, 'page'); main.append(renderPage(pg, { view: r[0] === 'archive' ? 1 : 0 })); break; }
      case 'db': main.append(renderDb(r[1], { full: true, view: r[2] })); break;
      case 'p': main.append(renderPage(r[1])); break;
      case 'r': main.append(renderRow(r[1])); break;
      case 'pages': main.append(pagesScreen()); break;
      case 'search': main.append(renderSearch()); break;
      case 'settings': main.append(renderSettings(r[1])); break;
      case 'trash': main.append(trashScreen()); break;
      default: main.append(listScreen('today'));
    }
  } catch (e) { console.error(e); main.append(h('div', { class: 'wrap' }, h('p', { class: 'empty' }, 'Something went wrong showing this screen: ' + e.message))); }
  if (same) main.scrollTop = scroll;
  // side pane
  const pane = $('#pane'), m = layoutMode();
  const paneOn = state.pane && D.live(state.pane) && (m === 'split' || m === 'wide') && !['r', 'p', 'settings'].includes(r[0]);
  app.classList.toggle('has-pane', !!paneOn);
  pane.replaceChildren(); if (paneOn) pane.append(renderRow(state.pane, { inPane: true }));
  renderSide(); renderNav();
}

// ---------- sidebar (wide) ----------
function renderSide() {
  const side = $('#side'); if (layoutMode() !== 'wide') { side.replaceChildren(); return; }
  const cur = state.route[0]; const t = DB.todayGroups(NOW());
  const link = (hash, ic, label, n, on) => h('a', { href: hash, 'aria-current': on ? 'page' : null }, icon(ic, 18), label, n != null ? h('span', { class: 'n' }, n) : null);
  const s = DB.surveyGroups(NOW()), e = DB.ecparGroups(NOW());
  const pages = D.all('page', p => !D.val(p, 'parent') && !D.val(p, 'db'));
  const st = Sync.getStatus();
  side.replaceChildren(
    h('div', { class: 'brand' }, logo(28), 'Folio'),
    link('#/search', 'search', 'Search', null, cur === 'search'),
    link('#/today', 'today', 'Today', t.overdue.length + t.today.length, cur === 'today'),
    link('#/survey', 'pin', 'To Site Survey', s.overdue.length + s.today.length + s.upcoming.length, cur === 'survey'),
    link('#/ecpar', 'ecpar', 'Rejected ECPAR', e.overdue.length + e.today.length, cur === 'ecpar'),
    link('#/tracker', 'table', 'Planning KPI Tracker', null, cur === 'tracker'),
    link('#/archive', 'archive', 'Archive', null, cur === 'archive'),
    h('div', { class: 'sh' }, 'Pages'),
    pages.slice(0, 40).map(p => link('#/p/' + p.id, 'pages', D.val(p, 'title') || 'Untitled', null, cur === 'p' && state.route[1] === p.id)),
    h('button', { class: 'si', onclick: () => go('#/p/' + newPage().id) }, icon('plus', 18), 'New page'),
    h('div', { class: 'grow-fill' }),
    h('a', { href: '#/settings', class: 'sync' }, icon('sync', 16), Sync.connected() ? (st.state === 'error' ? 'Sync problem' : st.state === 'syncing' ? 'Syncing…' : st.at ? 'Synced ' + ago(st.at) : 'Not synced yet') : 'Sync is off'),
    link('#/trash', 'trash', 'Trash', null, cur === 'trash'),
    link('#/settings', 'settings', 'Settings', null, cur === 'settings'));
}
const ago = t => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : Math.round(s / 3600) + ' h ago'; };

// ---------- floating navigation ----------
function nb(label, ic, onclick, on = false) { return h('button', { class: 'b', 'aria-label': label, title: label, onclick, 'aria-current': on ? 'page' : null }, icon(ic, 20)); }
export function renderNav() {
  const nav = $('#fnav'); const r = state.route[0]; const mode = layoutMode();
  const pill = (...b) => h('div', { class: 'pill glass' }, b);
  const isPage = r === 'r' || r === 'p' || r === 'settings' || r === 'trash';
  const menuPill = pill(
    nb('Today', 'today', () => go('#/today'), r === 'today'), nb('To Site Survey', 'pin', () => go('#/survey'), r === 'survey'),
    nb('Rejected ECPAR', 'ecpar', () => go('#/ecpar'), r === 'ecpar'), nb('Tracker', 'table', () => go('#/tracker'), r === 'tracker' || r === 'archive' || r === 'db'),
    nb('Pages', 'pages', () => go('#/pages'), r === 'pages'), nb('Search', 'search', () => go('#/search'), r === 'search'));
  const newPill = pill(nb('New page', 'plus', () => go('#/p/' + newPage().id)));
  const ctx = state.ctx;
  const actions = pill(nb('Export: PDF, Markdown or share', 'export', e => ctx.export ? ctx.export(e.currentTarget) : window.print()), nb('More options', 'more', e => (ctx.more || (a => moreMenu(a)))(e.currentTarget)));
  const backPill = pill(nb(r === 'settings' ? 'Close' : 'Back', r === 'settings' ? 'close' : 'back', back));
  let top = [], bottom = [], bottomSplit = false;
  if (mode === 'phone') {
    if (isPage) { top = [actions]; bottom = [ctx.tools ? pill(...ctx.tools) : h('span'), backPill]; bottomSplit = true; }
    else { bottom = [menuPill, newPill]; }
  } else if (mode === 'wide') {
    if (isPage && r !== 'settings') top = [actions];
  } else if (document.body.dataset.nav === 'bar') { // iPhone Duo outer: actions in the top-right corner, menu as a floating bar at the bottom
    top = isPage ? [actions] : [actions];
    if (isPage) { bottom = [ctx.tools ? pill(...ctx.tools) : h('span'), backPill]; bottomSplit = true; }
    else bottom = [menuPill, newPill];
  } else { // split: one column on the right
    top = isPage ? [backPill, actions] : [actions];
    bottom = [menuPill, newPill];
  }
  nav.replaceChildren(h('div', { class: 'cl top' }, top), h('div', { class: 'cl bottom' + (bottomSplit ? ' spread' : '') }, bottom));
}

// ---------- list screens: Today, To Site Survey, Rejected ECPAR ----------
const TITLES = { today: 'Today', survey: 'To Site Survey', ecpar: 'Rejected ECPAR' };
let commentCount = new Map(); // task id -> number of comments, built once per list screen
function listScreen(kind) {
  commentCount = new Map(); for (const c of D.all('cmt')) { const k = D.val(c, 'parent'); commentCount.set(k, (commentCount.get(k) || 0) + 1); }
  const n = NOW(); state.ctx = { export: a => exportList(kind, a), more: a => moreMenu(a, { extra: [{ label: 'Open Planning KPI Tracker', icon: 'table', run: () => go('#/tracker') }] }) };
  const head = h('div', { class: 'head' }, logo(40), h('div', {}, h('h1', {}, TITLES[kind]), h('p', { class: 'date' }, formatDate(new Date(n), 'dddd, D MMMM YYYY'))));
  const wrap = h('div', { class: 'wrap' }, head);
  if (!DB.kpiDb()) { wrap.append(emptyTracker(true)); return wrap; }
  const g = kind === 'today' ? DB.todayGroups(n) : kind === 'survey' ? DB.surveyGroups(n) : DB.ecparGroups(n);
  const names = kind === 'ecpar' ? ['Overdue Amendment', 'Pending Amendment'] : ['Overdue', 'Today', 'Upcoming'];
  const sec = (label, color, list, numColor) => list.length ? [h('h2', { class: 'bar ' + color }, label), ...later(list, t => taskRow(t, numColor, kind), { first: 15, step: 30 })] : [];
  wrap.append(...sec(names[0], 'red', g.overdue, 'red'), ...sec(names[1], 'orange', g.today, 'orange'), ...(g.upcoming ? sec(names[2], 'blue', g.upcoming, 'blue') : []));
  if (!g.overdue.length && !g.today.length && !(g.upcoming || []).length)
    wrap.append(h('p', { class: 'empty' }, kind === 'today' ? 'Nothing due in the next 2 days. Nice.' : kind === 'survey' ? 'No tasks are waiting for a site survey.' : 'No rejected ECPAR to amend.'));
  return wrap;
}
// Every part of a row can be edited right here: tap the name, address, status/station or date.
// "Open" (or the day number) opens the full task page. Press and hold a map link to change it.
function rowEdit(t) {
  const dbr = DB.kpiDb(), rec = D.getRec(t.id), P = n => DB.propByName(dbr, n);
  const set = (p, val) => { D.update(t.id, { ['p:' + p.id]: val }); document.dispatchEvent(new CustomEvent('folio-row', { detail: t.id })); render(); };
  const text = (el, name) => { const p = P(name); if (p) popEdit(el, D.getRec(t.id), p, () => render()); };
  const choose = (el, name) => {
    const p = P(name); if (!p) return; const v = DB.raw(D.getRec(t.id), p);
    menu(el, [...(p.options || []).map(o => ({ label: o.name, checked: o.name === v, run: () => set(p, o.name) })), '-',
      { label: 'New option…', icon: 'plus', run: async () => { const n = (await promptBox('New ' + p.name.toLowerCase()))?.trim(); if (n) { DB.addOption(dbr, p, n); set(p, n); } } },
      ...(v ? [{ label: 'Clear', icon: 'close', run: () => set(p, null) }] : [])]);
  };
  const date = name => {
    const p = P(name); if (!p) return; const inp = h('input', { type: 'date', class: 'field', value: toISODate(DB.raw(D.getRec(t.id), p)) || '' });
    const s = sheet(p.name, h('div', {}, inp, h('button', { class: 'btn block', onclick: () => { inp.value = toISODate(new Date(NOW())); } }, 'Today'),
      h('button', { class: 'btn block danger', onclick: () => { inp.value = ''; s.close(); } }, 'Clear')), { onDone: () => set(p, inp.value || null) });
    setTimeout(() => inp.focus(), 50);
  };
  return { rec, text, choose, date, P };
}
function holdToEdit(a, onHold) { // press and hold a link to edit it; a normal tap still opens it
  let timer = 0, held = false;
  a.addEventListener('pointerdown', () => { held = false; timer = setTimeout(() => { held = true; onHold(); }, 550); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) a.addEventListener(ev, () => clearTimeout(timer));
  a.addEventListener('click', e => { if (held) { e.preventDefault(); held = false; } });
  a.addEventListener('contextmenu', e => e.preventDefault());
  return a;
}
function taskRow(t, color, kind) {
  const d = t.days;
  const unit = d == null ? (kind === 'ecpar' ? 'no date' : 'no due date') : d < 0 ? (d === -1 ? 'day late' : 'days late') : d === 0 ? 'due today' : d === 1 ? 'day left' : 'days left';
  const dbr = DB.kpiDb(); const sp = DB.propByName(dbr, 'Status'), stn = DB.propByName(dbr, 'Station');
  const ed = rowEdit(t);
  const stationOrStatus = kind === 'survey' ? 'Station' : 'Status';
  const right = kind === 'survey'
    ? h('button', { class: 'tag ebtn' + (t.station ? '' : ' empty'), 'aria-label': 'Station: ' + (t.station || 'Empty'), style: t.station ? { background: DB.optColor(stn, t.station)[0] } : null, onclick: e => ed.choose(e.currentTarget, 'Station') }, t.station || 'Station')
    : h('button', { class: 'pill ebtn' + (t.status ? '' : ' empty'), 'aria-label': 'Status: ' + (t.status || 'Empty'), style: t.status ? { background: DB.optColor(sp, t.status)[0] } : null, onclick: e => ed.choose(e.currentTarget, 'Status') },
      t.status ? [h('i', { style: { background: DB.optColor(sp, t.status)[1] } }), t.status] : 'Status');
  // the date shown is the one that sets the countdown: ECPAR Rejected for amendments, Due Date otherwise
  const dateProp = kind === 'ecpar' || t.amend ? 'ECPAR Rejected' : 'Due Date';
  const meta = kind === 'ecpar' ? (t.rejected ? 'Rejected ' + formatDate(t.rejected, 'D MMM YYYY') : 'Add rejected date') : (t.due ? 'Due ' + formatDate(t.due, 'D MMM YYYY') : 'Add due date');
  const dueBtn = h('button', { class: 'due ebtn' + (/^Add/.test(meta) ? ' empty' : ''), 'aria-label': 'Change ' + dateProp, onclick: () => ed.date(dateProp) }, meta);
  const map = t.map && /^https?:/i.test(t.map) ? t.map : '';
  const editMap = () => ed.text(mapRow, 'Pin Location');
  const mapRow = map ? h('div', { class: 'links' },
      holdToEdit(h('a', { class: 'lnk', href: mapsUrl(map), target: '_blank', rel: 'noopener', title: 'Press and hold to change the link' }, icon('pin', 14), 'Open in Google Maps'), editMap),
      holdToEdit(h('a', { class: 'lnk', href: browserUrl(map), target: '_blank', rel: 'noopener', title: 'Press and hold to change the link' }, icon('globe', 14), 'Open in browser'), editMap))
    : h('div', { class: 'links' }, h('button', { class: 'lnk ebtn empty', onclick: editMap }, icon('pin', 14), 'Add map link'));
  let addrEl;
  addrEl = h('button', { class: 'addr ebtn' + (t.address ? '' : ' empty'), onclick: () => ed.text(addrEl, 'Address') }, t.address || 'Add address');
  let nameEl;
  nameEl = h('button', { class: 'name ebtn', onclick: () => ed.text(nameEl, DB.titleProp(dbr)?.name || 'Customer Name') }, t.title || 'Untitled');
  return h('div', { class: 'task ' + color + (state.pane === t.id ? ' sel' : '') },
    h('button', { class: 'rail', 'aria-label': 'Open ' + (t.title || 'task'), onclick: () => openTask(t.id) }, h('b', {}, d == null ? '–' : Math.abs(d)), h('small', {}, unit)),
    h('div', { class: 'body' },
      h('div', { class: 'l1' }, h('span', { class: 'nm' }, nameEl, commentCount.get(t.id) ? h('button', { class: 'ccount', 'aria-label': commentCount.get(t.id) + ' comments, open task', onclick: () => openTask(t.id) }, icon('comment', 15), commentCount.get(t.id)) : null), h('div', { class: 'rt' }, h('button', { class: 'openbtn', onclick: () => openTask(t.id) }, 'Open'), right)),
      addrEl,
      h('div', { class: 'l3' }, mapRow, dueBtn)));
}
// Maps app on iPhone; plain web elsewhere
const isIOS = () => /iP(hone|ad|od)/.test(navigator.platform) || (navigator.userAgent.includes('Mac') && 'ontouchend' in document);
export const mapsUrl = u => u;
export const browserUrl = u => isIOS() ? u.replace(/^https:\/\//i, 'x-safari-https://').replace(/^http:\/\//i, 'x-safari-http://') : u;

function exportList(kind, anchor) {
  const g = kind === 'today' ? DB.todayGroups(NOW()) : kind === 'survey' ? DB.surveyGroups(NOW()) : DB.ecparGroups(NOW());
  const lines = [`# ${TITLES[kind]} — ${formatDate(new Date(NOW()))}`, ''];
  for (const [k, list] of Object.entries(g)) { if (!list.length) continue; lines.push(`## ${k[0].toUpperCase() + k.slice(1)}`); for (const t of list) lines.push(`- ${t.title}${t.address ? ' — ' + t.address : ''}${t.map ? ' ' + t.map : ''}`); lines.push(''); }
  const text = lines.join('\n');
  menu(anchor, [
    { label: 'Share', icon: 'export', run: () => navigator.share ? navigator.share({ title: TITLES[kind], text }).catch(() => {}) : navigator.clipboard.writeText(text).then(() => toast('Copied')) },
    { label: 'Save as Markdown', icon: 'pages', run: () => download(`${TITLES[kind]}.md`, text, 'text/markdown') },
    { label: 'Print or save as PDF', icon: 'export', run: () => window.print() }]);
}
export function download(name, data, type) { const a = h('a', { href: URL.createObjectURL(new Blob([data], { type })), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }

function emptyTracker(inList) {
  return h('div', { class: inList ? '' : 'wrap' }, h('div', { class: 'empty' },
    h('p', {}, 'Your Planning KPI Tracker is not set up yet.'),
    h('button', { class: 'btn primary', onclick: () => go('#/settings/import') }, icon('import', 18), 'Import from Notion'), ' ',
    h('button', { class: 'btn', onclick: () => { DB.createKpiTracker(); go('#/tracker'); } }, 'Start an empty tracker')));
}
function pagesScreen() {
  state.ctx = {};
  const list = D.all('page', p => !D.val(p, 'db')).sort((a, b) => (D.val(b, 'edited', 0) - D.val(a, 'edited', 0)));
  return h('div', { class: 'wrap' }, h('div', { class: 'head' }, logo(40), h('div', {}, h('h1', {}, 'Pages'), h('p', { class: 'date' }, list.length + ' pages'))),
    h('div', { class: 'group', style: { marginTop: '24px' } }, list.map(p => h('a', { class: 'grow', href: '#/p/' + p.id }, icon('pages', 18), h('span', { class: 'gl' }, D.val(p, 'title') || 'Untitled'), icon('chevr', 14, 'chev'))),
      h('button', { class: 'grow', onclick: () => go('#/p/' + newPage().id) }, icon('plus', 18), h('span', { class: 'gl' }, 'New page'))));
}
function trashScreen() {
  state.ctx = {};
  const items = [...D.deleted('page'), ...D.deleted('row')];
  return h('div', { class: 'wrap' }, h('div', { class: 'head' }, h('h1', {}, 'Trash')),
    items.length ? h('div', { class: 'group', style: { marginTop: '20px' } }, items.map(r => h('div', { class: 'grow' }, h('span', { class: 'gl' }, r.k === 'row' ? DB.title(r) : (D.val(r, 'title') || 'Untitled')),
      h('button', { class: 'btn', onclick: () => { D.restore(r.id); render(); toast('Restored'); } }, 'Restore')))) : h('p', { class: 'empty' }, 'Trash is empty.'));
}

// ---------- boot ----------
export async function boot() {
  document.body.append(h('div', { id: 'app' }, h('nav', { id: 'side', 'aria-label': 'Workspace' }), h('main', { id: 'main' }), h('section', { id: 'pane', 'aria-label': 'Selected task' })), h('div', { id: 'fnav' }));
  window.__folioStep = 'storage'; await D.load(); S.persist(); await loadFont();
  D.onChange(info => { if (info.type === 'sync' || info.type === 'create' || info.type === 'delete' || info.type === 'wipe') render(); if (info.type !== 'sync') Sync.soon(); });
  Sync.onStatus(() => { renderSide(); loadFont(); });
  addEventListener('hashchange', () => { state.pane = null; render(); });
  addEventListener('resize', layout); layout();
  initKeyboardBar();
  window.__folioStep = 'lock'; await initLock();
  window.__folioStep = 'sync'; await startupSync(); window.__folioStep = 'ready';
  startNotifier();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Sync.soon(500); else D.flush(); });
}
