// Folio v2 — boot, router, layout modes, sidebar, floating navigation, list screens.
import * as D from './data.js';
import * as DB from './db.js';
import * as Sync from './sync.js';
import * as S from './store.js';
import { h, icon, logo, $, toast, menu, sheet, promptBox, later } from './ui.js';
import { formatDate, toISODate } from './dates.js';
import { renderPage, renderRow, newPage } from './page.js';
import { renderDb } from './table.js';
import { popEdit } from './popedit.js';
import { renderSettings, startupSync } from './settings.js';
import { initLock } from './lock.js';
import { renderSearch } from './search.js';
import { startNotifier } from './notify.js';
import { initKeyboardBar } from './kbar.js';
import { commentsScreen, calendarScreen, inboxScreen } from './hub.js';

export const state = { route: [], pane: null, ctx: {} };

// ---------- app-wide font (synced with the workspace settings) ----------
let appFont = 'default';
export async function loadFont() {
  const ws = (await S.meta.get('ws-settings')) || {};
  let f = ws.font;
  if (!f) { const p = D.all().find(r => r.k === 'page' && ['serif', 'mono'].includes(D.val(r, 'font'))); f = p ? D.val(p, 'font') : 'default'; } // keep a font chosen earlier on a page
  setFontClass(f);
  setGlass(ws.glass ?? 50);
}
/** Liquid Glass opacity, 0 = Clear … 100 = Tinted (like the iPhone's Appearance → Liquid Glass slider). */
export function setGlass(pct) { document.documentElement.style.setProperty('--lg-a', String(Math.max(0, Math.min(100, +pct || 0)) / 100)); }
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
      case 'comments': main.append(commentsScreen()); break;
      case 'calendar': main.append(calendarScreen()); break;
      case 'inbox': main.append(inboxScreen()); break;
      default: main.append(listScreen('today'));
    }
  } catch (e) { console.error(e); main.append(h('div', { class: 'wrap' }, h('p', { class: 'empty' }, 'Something went wrong showing this screen: ' + e.message))); }
  main.prepend(topbar());
  if (layoutMode() !== 'wide') document.body.classList.remove('side-open');
  if (['p', 'r'].includes(r[0]) && r[1]) noteRecent(r[1]);
  if (same) main.scrollTop = scroll;
  // side pane
  const pane = $('#pane'), m = layoutMode();
  const paneOn = state.pane && D.live(state.pane) && (m === 'split' || m === 'wide') && !['r', 'p', 'settings'].includes(r[0]);
  app.classList.toggle('has-pane', !!paneOn);
  pane.replaceChildren(); if (paneOn) pane.append(renderRow(state.pane, { inPane: true }));
  renderSide(); renderNav();
}

// ---------- sidebar (wide) ----------
// ---------- split screen divider: drag to resize; drag to the edge to open one side full ----------
function dragDivider(e) {
  const app = $('#app'), el = e.currentTarget, portrait = document.body.dataset.orient === 'portrait';
  e.preventDefault(); el.classList.add('on'); try { el.setPointerCapture(e.pointerId); } catch {}
  const r = app.getBoundingClientRect(); let pct = 50;
  const move = ev => { pct = portrait ? (ev.clientY - r.top) / r.height * 100 : (ev.clientX - r.left) / r.width * 100; pct = Math.max(8, Math.min(92, pct)); app.style.setProperty(portrait ? '--split' : '--splitx', pct.toFixed(1)); };
  const up = () => {
    el.classList.remove('on'); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
    const reset = () => app.style.removeProperty(portrait ? '--split' : '--splitx');
    if (pct < 20) { const id = state.pane; reset(); state.pane = null; go('#/r/' + id); }        // task opens full page
    else if (pct > 80) { reset(); state.pane = null; render(); }                                // list goes full, task closes
  };
  el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}

// ---------- recents & favourites ----------
let recents = [];
S.meta.get('recents').then(v => { if (Array.isArray(v)) recents = v; });
function noteRecent(id) { recents = [id, ...recents.filter(x => x !== id)].slice(0, 8); S.meta.set('recents', recents); }
const recTitle = rec => rec.k === 'row' ? DB.title(rec) : (D.val(rec, 'title') || 'Untitled');
const recHash = rec => { const kp = DB.kpiDb() && D.val(DB.kpiDb(), 'page'); return rec.id === kp ? '#/tracker' : (rec.k === 'row' ? '#/r/' : '#/p/') + rec.id; };
function recIcon(rec, size = 20) {
  const photo = D.val(rec, 'icon');
  if (photo && photo.id) { const im = h('span', { class: 'ricon photo', style: { width: size + 'px', height: size + 'px' } }); import('./page.js').then(m => m.fileUrl(photo.id)).then(u => { if (u) im.style.backgroundImage = `url("${u}")`; }); return im; }
  return icon(rec.k === 'page' && D.val(rec, 'db') ? 'table' : 'page', size, 'ricon');
}

// ---------- left menu (Notion style); the Duo outer screen has none ----------
const sideOpenSecs = { recents: false, favs: true, private: true };
export function toggleSide(force) {
  const b = document.body;
  if (layoutMode() === 'wide') { b.classList.toggle('side-closed', force === undefined ? undefined : !force); try { localStorage.setItem('folio-side', b.classList.contains('side-closed') ? 'closed' : 'open'); } catch {} }
  else b.classList.toggle('side-open', force);
}
// the F logo opens a menu like Notion's workspace menu
function workspaceMenu(anchor) {
  menu(anchor, [
    { label: 'Settings', icon: 'settings', run: () => go('#/settings') },
    { label: 'Trash', icon: 'trash', run: () => go('#/trash') },
    { label: 'Import from Notion', icon: 'import', run: () => go('#/settings/import') }, '-',
    { label: 'Help and support', icon: 'help', run: () => helpSheet() }]);
}
function helpSheet() {
  const tip = (t, d) => h('div', { class: 'tip' }, h('b', {}, t), h('p', { class: 'muted' }, d));
  sheet('Help and support', h('div', {},
    tip('Edit straight from a list', 'Tap a name, address, station, status or date on Today, To Site Survey or Rejected ECPAR. Press and hold a link to change it.'),
    tip('Resize the table', 'Hold a line in the table until it turns blue, then drag. Double-tap a line to reset it.'),
    tip('Sync', 'Folio saves to your private GitHub repository (Settings → GitHub). Each device syncs every few minutes and when you open the app.'),
    tip('Reminders and widgets', 'Inbox lists what is due. Turn on the 08:00 reminder there. The Folio widget (Scriptable) adds due dates to your iPhone calendar.'),
    tip('Backups', 'Settings → Download a full backup, and the widget keeps a daily copy in iCloud Drive for one year.')));
}
function renderSide() {
  const side = $('#side');
  const cur = state.route[0], kp = DB.kpiDb() && D.val(DB.kpiDb(), 'page');
  const circ = (hash, content, label, on) => h('a', { class: 'circ' + (on ? ' on' : ''), href: hash, 'aria-label': label, title: label, 'aria-current': on ? 'page' : null }, content, on ? h('span', { class: 'clabel' }, label) : null);
  const item = rec => { const hsh = recHash(rec); const on = location.hash === hsh || (hsh === '#/tracker' && (cur === 'tracker' || cur === 'archive'));
    return h('a', { class: 'sitem' + (on ? ' on' : ''), href: hsh, 'aria-current': on ? 'page' : null }, recIcon(rec), h('span', { class: 'st' }, recTitle(rec))); };
  const sec = (key, label, items, extra) => h('div', { class: 'ssec' },
    h('div', { class: 'shead' }, h('button', { class: 'stog', 'aria-expanded': String(sideOpenSecs[key]), onclick: () => { sideOpenSecs[key] = !sideOpenSecs[key]; renderSide(); } }, label, icon(key === 'recents' ? 'chevr' : 'chevd', 16, 'sch' + (sideOpenSecs[key] ? ' open' : ''))), extra || null),
    sideOpenSecs[key] ? (items.length ? items : h('div', { class: 'sempty' }, key === 'favs' ? 'Tap ★ on a page or task to add it here.' : 'Nothing yet.')) : null);
  const rec = recents.map(id => D.live(id)).filter(Boolean).slice(0, 6);
  const favs = [...D.all('page', p => D.val(p, 'fav')), ...D.all('row', r => D.val(r, 'fav'))];
  const pages = D.all('page', p => !D.val(p, 'parent')).sort((a, b) => (b.id === kp) - (a.id === kp) || recTitle(a).localeCompare(recTitle(b)));
  const st = Sync.getStatus();
  const syncText = Sync.connected() ? (st.state === 'error' ? 'Sync problem' : st.state === 'syncing' ? 'Syncing…' : st.at ? 'Synced ' + ago(st.at) : 'Not synced yet') : 'Sync is off';
  side.replaceChildren(
    h('div', { class: 'srow' },
      h('button', { class: 'circ avatar', 'aria-label': 'Folio menu', title: 'Folio menu', onclick: e => workspaceMenu(e.currentTarget) }, logo(24)),
      circ('#/today', icon('home', 21), 'Home', cur === 'today'),
      circ('#/comments', icon('comment', 21), 'Comments', cur === 'comments'),
      circ('#/calendar', icon('date', 21), 'Calendar', cur === 'calendar'),
      circ('#/inbox', icon('inbox', 21), 'Inbox', cur === 'inbox'),
      layoutMode() === 'rail' ? h('button', { class: 'circ sclose', 'aria-label': 'Close the menu', onclick: () => toggleSide(false) }, icon('close', 20)) : null),
    h('div', { class: 'sscroll' },
      sec('recents', 'Recents', rec.map(item)),
      sec('favs', 'Favourites', favs.map(item)),
      sec('private', 'Private', [...pages.map(item),
        h('button', { class: 'sitem', onclick: () => go('#/p/' + newPage().id) }, icon('plus', 20, 'ricon'), h('span', { class: 'st muted' }, 'New page')),
        h('a', { class: 'sitem' + (cur === 'trash' ? ' on' : ''), href: '#/trash' }, icon('trash', 20, 'ricon'), h('span', { class: 'st muted' }, 'Trash'))],
        h('button', { class: 'smore', 'aria-label': 'Pages', onclick: () => go('#/pages') }, icon('more', 18)))),
    h('div', { class: 'sfoot' },
      h('a', { class: 'fcirc', href: '#/search', 'aria-label': 'Search', title: 'Search' }, icon('search', 22)),
      h('a', { class: 'fpill' + (st.state === 'error' ? ' bad' : ''), href: '#/settings', title: 'Sync with GitHub' }, icon('sync', 18), h('span', {}, syncText)),
      h('button', { class: 'fcirc', 'aria-label': 'New page', title: 'New page', onclick: () => go('#/p/' + newPage().id) }, icon('compose', 22))));
}

// ---------- top bar (Notion style): menu, back, forward, title, share, favourite, more ----------
const SCREEN = { comments: ['Comments', 'comment'], calendar: ['Calendar', 'date'], inbox: ['Inbox', 'inbox'], today: ['Today', 'today'], survey: ['To Site Survey', 'pin'], ecpar: ['Rejected ECPAR', 'ecpar'], pages: ['Pages', 'pages'], search: ['Search', 'search'], settings: ['Settings', 'settings'], trash: ['Trash', 'trash'] };
function topbar() {
  const r = state.route[0], ctx = state.ctx;
  const kp = DB.kpiDb() && D.val(DB.kpiDb(), 'page');
  const rec = r === 'p' || r === 'r' ? D.live(state.route[1]) : (r === 'tracker' || r === 'archive') && kp ? D.live(kp) : null;
  const [title, ic] = rec ? [recTitle(rec), null] : r === 'db' ? [D.val(DB.db(state.route[1]) || {}, 'name', 'Database'), 'table'] : (SCREEN[r] || SCREEN.today);
  const fav = rec && D.val(rec, 'fav');
  const tb = (label, content, onclick, cls = '') => h('button', { class: 'tb ' + cls, 'aria-label': label, title: label, onclick }, content);
  if (layoutMode() === 'rail') // Duo outer screen, like Notion there: ‹ on the left, Share and ⋯ as separate circles on the right
    return h('header', { class: 'topbar circles', 'aria-label': title },
      h('div', { class: 'tpill' }, h('div', { class: 'tcirc glass' }, tb('Back', icon('back', 24), () => back()))),
      h('div', { class: 'tpill' },
        h('div', { class: 'tcirc glass' }, tb('Share or export', icon('export', 23), e => ctx.export ? ctx.export(e.currentTarget) : window.print())),
        h('div', { class: 'tcirc glass' }, tb('More options', icon('more', 23), e => (ctx.more || (a => moreMenu(a)))(e.currentTarget)))));
  // floating Liquid Glass buttons: ☰ ← → on the left, Share ★ ⋯ on the right (the page title is in the page itself)
  return h('header', { class: 'topbar', 'aria-label': title },
    h('div', { class: 'tpill glass' },
      tb('Show or hide the menu', icon('sidebar', 23), () => toggleSide()),
      tb('Back', icon('arrowl', 23), () => back()),
      tb('Forward', icon('arrowr', 23), () => history.forward())),
    h('div', { class: 'tpill glass' },
      tb('Share or export', icon('export', 23), e => ctx.export ? ctx.export(e.currentTarget) : window.print()),
      rec ? tb(fav ? 'Remove from Favourites' : 'Add to Favourites', icon(fav ? 'starf' : 'star', 23), () => { D.update(rec.id, { fav: !fav }); toast(fav ? 'Removed from Favourites' : 'Added to Favourites'); render(); }, fav ? 'fav' : '') : null,
      tb('More options', icon('more', 23), e => (ctx.more || (a => moreMenu(a)))(e.currentTarget))));
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
  const tools = ctx.tools ? [pill(...ctx.tools)] : [];
  if (mode === 'rail') { // iPhone Duo outer screen, like Notion: ☰ on the left, menu in the middle, + on the right
    const menuBtn = pill(nb('Menu', 'menu', () => toggleSide(true)));
    bottom = [menuBtn, isPage && ctx.tools ? pill(...ctx.tools) : menuPill, newPill]; bottomSplit = true;
  } else if (mode === 'wide') { bottom = isPage ? tools : []; }
  else { bottom = isPage ? tools : [menuPill, newPill]; } // phone, Duo inner screen, iPad upright
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
  const unitFor = label => /overdue/i.test(label) ? 'days late' : 'days left';
  const sec = (label, color, list, numColor) => list.length ? [h('div', { class: 'barrow' }, h('span', { class: 'bunit ' + color }, unitFor(label)), h('h2', { class: 'bar ' + color }, label)), ...later(list, t => taskRow(t, numColor, kind), { first: 15, step: 30 })] : [];
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
// the embedded link of a task is kept with the task (synced), not as a table column
const LINK_PROP = { id: '__link', name: 'Link', type: 'url' };
function urlParts(u) { // host dark, the rest grey, like Notion's link cells
  try { const x = new URL(u); return h('span', { class: 'url' }, h('b', {}, x.hostname), h('i', {}, decodeURIComponent(x.pathname + x.search).replace(/\/$/, ''))); } catch { return h('span', {}, u); }
}
function linkLabel(u) { // "https://x.com/ApplicationA?ApplicationId=135583" → "ApplicationA?ApplicationId=135583"
  try { const x = new URL(u); const last = decodeURIComponent(x.pathname.split('/').filter(Boolean).pop() || ''); return (last + x.search) || x.hostname; } catch { return u; }
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
  const meta = kind === 'ecpar' ? (t.rejected ? 'Rejected ' + formatDate(t.rejected, 'D/M/YYYY') : 'Add rejected date') : (t.due ? 'Due ' + formatDate(t.due, 'D/M/YYYY') : 'Add due date');
  const dueBtn = h('button', { class: 'due ebtn' + (/^Add/.test(meta) ? ' empty' : ''), 'aria-label': 'Change ' + dateProp, onclick: () => ed.date(dateProp) }, meta);
  const map = t.map && /^https?:/i.test(t.map) ? t.map : '';
  const editMap = () => ed.text(mapRow, 'Pin Location');
  // Google Maps link, then an embedded link (any link you paste), like Notion's link mention
  // Pin Location shown like Notion: 🔗 maps.app.goo.gl/71c… — tap opens Maps, hold to change
  const mapLink = map ? holdToEdit(h('a', { class: 'lnk elink pinlink', href: mapsUrl(map), target: '_blank', rel: 'noopener', title: map + ' (press and hold to change)' }, icon('link', 16), urlParts(map)), editMap)
    : h('button', { class: 'lnk ebtn empty', onclick: editMap }, icon('link', 16), 'Pin Location');
  const linkUrl = t.row ? DB.raw(t.row, LINK_PROP) : null;
  let linkEl;
  const editLink = () => popEdit(linkEl, D.getRec(t.id), LINK_PROP, () => render());
  linkEl = linkUrl && /^https?:/i.test(linkUrl)
    ? holdToEdit(h('a', { class: 'lnk elink', href: browserUrl(linkUrl), target: '_blank', rel: 'noopener', title: linkUrl + ' (press and hold to change)' }, icon('filelink', 16), h('span', {}, linkLabel(linkUrl))), editLink)
    : h('button', { class: 'lnk ebtn empty', onclick: editLink }, icon('filelink', 16), 'Paste a link');
  const mapRow = h('div', { class: 'links' }, mapLink, linkEl);
  let addrEl;
  addrEl = h('button', { class: 'addr ebtn' + (t.address ? '' : ' empty'), onclick: () => ed.text(addrEl, 'Address') }, t.address || 'Add address');
  let nameEl;
  nameEl = h('button', { class: 'name ebtn', onclick: () => ed.text(nameEl, DB.titleProp(dbr)?.name || 'Customer Name') }, t.title || 'Untitled');
  return h('div', { class: 'task ' + color + (state.pane === t.id ? ' sel' : '') },
    h('button', { class: 'rail', 'aria-label': 'Open ' + (t.title || 'task'), onclick: () => openTask(t.id) }, h('b', {}, d == null ? '–' : Math.abs(d)), d == null ? h('small', {}, 'no date') : null),
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
  try { if (localStorage.getItem('folio-side') === 'closed') document.body.classList.add('side-closed'); } catch {}
  document.body.append(h('div', { id: 'app' }, h('div', { id: 'scrim', onclick: () => toggleSide(false) }), h('nav', { id: 'side', 'aria-label': 'Workspace' }), h('main', { id: 'main' }), h('div', { id: 'divider', role: 'separator', 'aria-label': 'Drag to resize. Drag to the edge to open full.', onpointerdown: dragDivider }), h('section', { id: 'pane', 'aria-label': 'Selected task' })), h('div', { id: 'fnav' }));
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
