// Folio v2 — boot, router, layout modes, sidebar, floating navigation, list screens.
import * as D from './data.js';
import * as DB from './db.js';
import * as Sync from './sync.js';
import * as S from './store.js';
import { h, icon, logo, $, toast, menu, sheet, promptBox, later, pickImage } from './ui.js';
import { formatDate, toISODate } from './dates.js';
import { renderPage, renderRow, newPage, propEditor } from './page.js';
import { renderDb } from './table.js';
import { popEdit } from './popedit.js';
import { renderSettings, startupSync } from './settings.js';
import { initLock } from './lock.js';
import { renderSearch } from './search.js';
import { startNotifier } from './notify.js';
import { initKeyboardBar } from './kbar.js';
import { commentsScreen, calendarScreen, inboxScreen } from './hub.js';
import * as E from './entities.js';
import { focusScreen, focusCounts, ecparArchiveScreen } from './focus.js';
import { setKpiRules } from './kpi.js';
import { timelineScreen, boardScreen, reportsScreen, kpiScreen, pageHead } from './views.js';
import { projectsScreen, projectScreen, newProjectSheet, dueTaskList } from './project.js';
import { homeScreen, activityScreen, soonScreen } from './home.js';

export const state = { route: [], pane: null, ctx: {} };

// ---------- editable headings (names sync with the workspace settings) ----------
let labels = {};
export const L = (key, def) => labels[key] || def;
/** A heading you can rename: tap it, type, press Return (or tap away). Empty puts the original name back. */
export function elabel(key, def, tag = 'span', attrs = {}) {
  const el = h(tag, { ...attrs, class: ((attrs.class || '') + ' elabel').trim(), title: 'Tap to rename' }, L(key, def));
  let before = '';
  el.addEventListener('click', e => {
    if (el.isContentEditable) return; e.stopPropagation(); e.preventDefault();
    before = el.textContent; el.contentEditable = 'plaintext-only'; if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
    el.focus(); const r = document.createRange(); r.selectNodeContents(el); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  });
  el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } if (e.key === 'Escape') { el.textContent = before; el.blur(); } });
  el.addEventListener('blur', () => {
    el.contentEditable = 'false'; const v = el.textContent.replace(/\s+/g, ' ').trim();
    const next = { ...labels }; if (!v || v === def) delete next[key]; else next[key] = v.slice(0, 80);
    el.textContent = next[key] || def;
    if (JSON.stringify(next) !== JSON.stringify(labels)) { labels = next; Sync.saveSettings({ labels }); Sync.soon(500); }
  });
  return el;
}

// ---------- no pinch-zoom: it fought with editing (page jumping, lag). ⋯ → Text size is the way to make text bigger ----------
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false }); // iPhone / iPad Safari
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false }); // two-finger pinch anywhere else
// double-tap zoom is stopped by touch-action in the CSS (blocking it here would swallow quick taps)
// ---------- text size (per device, ⋯ → Text size) ----------
// Text Size replaced Zoom: zooming the whole page made scrolling jumpy on iPhone / iPad; growing only the letters keeps it smooth.
// (100%–140%: smaller would make typing boxes under 16px, which iPhone zooms into)
let textPct = 100;
try {
  const z = +localStorage.getItem('folio-zoom') || 100, t = +localStorage.getItem('folio-text');
  textPct = Math.max(100, Math.min(140, t || (z > 100 ? Math.round(z / 10) * 10 : 100))); // an earlier Zoom above 100% carries over as text size
  localStorage.removeItem('folio-zoom');
} catch {}
export const zoomFactor = () => 1;
function applyText() { document.documentElement.style.setProperty('--ts', String(textPct / 100)); }
applyText();
function setText(p) { textPct = Math.max(100, Math.min(140, Math.round(p / 10) * 10)); try { localStorage.setItem('folio-text', textPct); } catch {} applyText(); }
// (Contrast was removed from ⋯: any earlier setting is cleared)
try { localStorage.removeItem('folio-contrast'); } catch {}
function textRow() {
  const pct = h('b', { class: 'zpct' }, textPct + '%');
  const step = d => e => { e.stopPropagation(); setText(textPct + d); pct.textContent = textPct + '%'; };
  return h('div', { class: 'zoomrow' }, icon('text', 16), h('span', {}, 'Text size'),
    h('button', { class: 'zb', 'aria-label': 'Smaller text', onclick: step(-10) }, 'A−'), pct,
    h('button', { class: 'zb', 'aria-label': 'Bigger text', onclick: step(10) }, 'A+'),
    h('button', { class: 'zb zr', 'aria-label': 'Reset text size', onclick: e => { e.stopPropagation(); setText(100); pct.textContent = '100%'; } }, '↺'));
}

// ---------- button colour (per device, ⋯ → Button colour): the main action buttons (Save, Create project, Confirm…) ----------
export const BTN_COLOURS = [['blue', 'Blue', '#1F72C4'], ['brown', 'Brown', '#7B5B45'], ['green', 'Green', '#2E7D4F'], ['teal', 'Teal', '#0F7477'],
  ['purple', 'Purple', '#6A4DB0'], ['rose', 'Rose', '#B23F68'], ['orange', 'Orange', '#B0560B'], ['graphite', 'Graphite', '#3A3A3C']];
let btnColour = ''; try { btnColour = localStorage.getItem('folio-btn') || ''; } catch {}
function applyBtn() { const c = BTN_COLOURS.find(x => x[0] === btnColour); const st = document.documentElement.style; if (c) st.setProperty('--btn', c[2]); else st.removeProperty('--btn'); }
applyBtn();
function btnRow() {
  const sw = BTN_COLOURS.map(([k, label, hex]) => h('button', { class: 'bswatch' + (k === (btnColour || '') ? ' on' : ''), type: 'button', style: { background: hex }, 'aria-label': 'Button colour: ' + label, 'aria-pressed': k === btnColour ? 'true' : 'false', title: label,
    onclick: e => { e.stopPropagation(); btnColour = k === btnColour ? '' : k; try { btnColour ? localStorage.setItem('folio-btn', btnColour) : localStorage.removeItem('folio-btn'); } catch {} applyBtn();
      wrap.querySelectorAll('.bswatch').forEach(b => { const on = b.title === label && !!btnColour; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); } }));
  const wrap = h('div', { class: 'btnrow' }, h('div', { class: 'zoomrow' }, icon('paint', 16), h('span', {}, 'Button colour'),
    h('button', { class: 'zb zr', 'aria-label': 'Reset button colour', onclick: e => { e.stopPropagation(); btnColour = ''; try { localStorage.removeItem('folio-btn'); } catch {} applyBtn(); wrap.querySelectorAll('.bswatch').forEach(b => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); }); } }, '↺')),
    h('div', { class: 'bswatches' }, sw));
  return wrap;
}

// ---------- app-wide font (synced with the workspace settings) ----------
let appFont = 'default';
export async function loadFont() {
  const ws = (await S.meta.get('ws-settings')) || {};
  let f = ws.font;
  if (!f) { const p = D.all().find(r => r.k === 'page' && ['serif', 'mono'].includes(D.val(r, 'font'))); f = p ? D.val(p, 'font') : 'default'; } // keep a font chosen earlier on a page
  setFontClass(f);
  setGlass(ws.glass ?? 50);
  setKpiRules(ws.kpiRules); labels = ws.labels || {}; if (ws.privSort) privSort = ws.privSort; if (ws.privShow != null) privShow = ws.privShow; if (Array.isArray(ws.privHide)) privHide = ws.privHide; if (ws.privHideAll != null) privHideAll = !!ws.privHideAll;
}
/** Liquid Glass opacity, 0 = Clear … 100 = Tinted (like the iPhone's Appearance → Liquid Glass slider). */
export function setGlass(pct) { const v = String(Math.max(0, Math.min(100, +pct || 0)) / 100); if (document.documentElement.style.getPropertyValue('--lg-a') !== v) document.documentElement.style.setProperty('--lg-a', v); }
function setFontClass(f) { if (appFont === f && document.body.classList.contains('font-' + f)) return; appFont = f; document.body.classList.remove('font-default', 'font-serif', 'font-mono'); document.body.classList.add('font-' + f); }
async function chooseFont(f) { setFontClass(f); await Sync.saveSettings({ font: f }); Sync.soon(500); }
/** The ⋯ menu, the same on every screen. `extra` goes on top; `rec` adds Copy link / Move to Trash for that page. */
// ⋯ opens an "Actions" sheet like Notion's: font, zoom, favourites, share, copy, duplicate, trash, photo, lock, export, last edited
export function moreMenu(anchor, { extra = [], rec = null, onTrash = null } = {}) {
  const kp = DB.kpiDb() && D.val(DB.kpiDb(), 'page');
  if (!rec && (state.route[0] === 'tracker' || state.route[0] === 'archive') && kp) rec = D.live(kp);
  const ctx = state.ctx;
  const link = location.href.split('#')[0] + (rec ? '#/' + (rec.k === 'row' ? 'r/' : 'p/') + rec.id : location.hash);
  let s;
  const act = (ic, label, run, opts = {}) => h('button', { class: 'arow' + (opts.danger ? ' danger' : ''), type: 'button', onclick: () => { if (!opts.keep) s.close(); run(); } },
    icon(ic, 20), h('span', {}, label), opts.value ? h('small', {}, opts.value) : null, opts.chev ? icon('chevr', 16, 'achev') : null);
  const toggle = (ic, label, on, change) => { const sw = h('input', { type: 'checkbox', class: 'switch', role: 'switch', 'aria-label': label, checked: on ? true : null, onchange: e => change(e.target.checked) });
    return h('label', { class: 'arow' }, icon(ic, 20), h('span', {}, label), sw); };
  const grp = (...rows) => { const r = rows.flat().filter(Boolean); return r.length ? h('div', { class: 'agrp' }, r) : null; };
  const fontCard = (f, label, fam) => h('button', { class: 'agcard' + (appFont === f ? ' on' : ''), type: 'button', onclick: e => { chooseFont(f); e.currentTarget.parentElement.querySelectorAll('.agcard').forEach(c => c.classList.toggle('on', c === e.currentTarget)); } },
    h('b', { style: { fontFamily: fam } }, 'Ag'), h('small', {}, label));
  const fav = rec && D.val(rec, 'fav'), locked = rec && D.val(rec, 'locked');
  const pageText = () => (document.querySelector('#main > .wrap') || document.body).innerText.trim();
  const words = rec ? pageText().split(/\s+/).filter(Boolean).length : 0;
  const duplicate = () => {
    if (rec.k === 'row') { const r = D.create('row', rec.sh, { db: D.val(rec, 'db'), created: Date.now(), order: Date.now() }); const up = {};
      for (const [k, f] of Object.entries(rec.f)) if (k.startsWith('p:') || k === 'blocks') up[k] = JSON.parse(JSON.stringify(f.v));
      const tp = DB.titleProp(DB.db(D.val(rec, 'db'))); if (tp && up['p:' + tp.id]) up['p:' + tp.id] += ' (copy)'; D.update(r.id, up); toast('Duplicated'); openTask(r.id); return; }
    const up = {}; for (const [k, f] of Object.entries(rec.f)) if (!['created', 'edited', 'order', 'fav', 'db'].includes(k)) up[k] = JSON.parse(JSON.stringify(f.v));
    up.title = (D.val(rec, 'title') || 'Untitled') + ' (copy)'; up.created = up.edited = up.order = Date.now();
    const p = D.create('page', 'ws', up); toast('Duplicated'); go('#/p/' + p.id);
  };
  const photo = (field, label) => () => pickImage(async f => { const ref = await Sync.addFile(null, f); Sync.soon(); D.update(rec.id, { [field]: ref }); render(); }, { max: field === 'cover' ? 2000 : 800 });
  const body = h('div', { class: 'actions' },
    h('div', { class: 'agrp fonts' }, fontCard('default', 'Default', '-apple-system, sans-serif'), fontCard('serif', 'Serif', 'var(--serif)'), fontCard('mono', 'Mono', 'var(--mono)')),
    h('div', { class: 'agrp' }, textRow(), btnRow()),
    extra.length ? grp(extra.map(e => act(e.icon || 'chevr', e.label, e.run))) : null,
    grp(rec ? act('star', fav ? 'Remove from Favourites' : 'Add to Favourites', () => { D.update(rec.id, { fav: !fav }); toast(fav ? 'Removed from Favourites' : 'Added to Favourites'); render(); }) : null,
      act('export', 'Share', () => ctx.export ? ctx.export(anchor) : window.print()),
      act('link', 'Copy link', () => navigator.clipboard.writeText(link).then(() => toast('Link copied'), () => toast('Could not copy the link'))),
      act('page', 'Copy page contents', () => navigator.clipboard.writeText(pageText()).then(() => toast('Page contents copied'), () => toast('Could not copy'))),
      rec && rec.id !== kp ? act('pages', 'Duplicate', duplicate) : null,
      rec && onTrash ? act('trash', 'Move to Trash', onTrash, { danger: true }) : null),
    rec ? grp(act('person', D.val(rec, 'icon') ? 'Change icon' : 'Add icon', photo('icon')), act('paint', D.val(rec, 'cover') ? 'Change cover' : 'Add cover', photo('cover'))) : null,
    rec ? grp(toggle('lock', 'Lock page', locked, on => { D.update(rec.id, { locked: on }); toast(on ? 'Page locked: editing is off' : 'Page unlocked'); render(); })) : null,
    grp(act('export', 'Export', () => ctx.export ? ctx.export(anchor) : window.print(), { chev: true }),
      state.route[0] === 'settings' ? null : act('settings', 'Settings', () => go('#/settings'), { chev: true })),
    rec ? h('div', { class: 'agrp ainfo' }, h('b', {}, 'Last edited'), h('span', {}, lastEdited(rec)), h('span', {}, words + (words === 1 ? ' word' : ' words'))) : null);
  s = sheet('Actions', body, { done: 'Done' });
}
function lastEdited(rec) {
  let t = 0; for (const f of Object.values(rec.f || {})) { const w = parseInt(String(f.ts).split(':')[0], 36); if (w > t) t = w; }
  if (!t) t = D.val(rec, 'edited', D.val(rec, 'created', Date.now()));
  const d = new Date(t), n = new Date(NOW()), days = Math.round((new Date(n.toDateString()) - new Date(d.toDateString())) / 864e5), hm = d.toTimeString().slice(0, 5);
  return days === 0 ? 'Today at ' + hm : days === 1 ? 'Yesterday at ' + hm : formatDate(d, 'DD/MM/YYYY') + ' at ' + hm;
}
// ---------- press and hold a task: Actions sheet (like Notion) ----------
/** Calls fn after holding ~0.5s without moving (or on right-click). The tap that follows a hold is swallowed. */
export function longPress(el, fn, skip = '.colrz, .rzr, .rz, .lnk, a, input, textarea, .cellpop, [contenteditable="true"]') {
  let timer = 0, x0 = 0, y0 = 0, fired = false;
  const cancel = () => { clearTimeout(timer); timer = 0; el.classList.remove('pressing'); };
  el.addEventListener('pointerdown', e => {
    if (e.button > 0 || e.target.closest(skip)) return;
    fired = false; x0 = e.clientX; y0 = e.clientY; cancel();
    timer = setTimeout(() => { timer = 0; fired = true; el.classList.remove('pressing'); try { navigator.vibrate && navigator.vibrate(12); } catch {} fn(e); }, 500);
    setTimeout(() => { if (timer) el.classList.add('pressing'); }, 150);
  });
  el.addEventListener('pointermove', e => { if (timer && Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) > 8) cancel(); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, cancel);
  el.addEventListener('scroll', cancel, true);
  el.addEventListener('click', e => { if (fired) { e.stopPropagation(); e.preventDefault(); fired = false; } }, true);
  el.addEventListener('contextmenu', e => { if (e.target.closest(skip)) return; e.preventDefault(); cancel(); if (!fired) fn(e); fired = false; });
}
export function rowActions(id) {
  const rec = D.live(id); if (!rec) return;
  const dbr = rec.k === 'row' ? DB.db(D.val(rec, 'db')) : null; const title = rec.k === 'row' ? DB.title(rec) : (D.val(rec, 'title') || 'Untitled');
  const fav = D.val(rec, 'fav'); let s;
  const act = (ic, label, run, opts = {}) => h('button', { class: 'arow' + (opts.danger ? ' danger' : ''), type: 'button', onclick: () => { s.close(); run(); } }, icon(ic, 20), h('span', {}, label), opts.chev ? icon('chevr', 16, 'achev') : null);
  const link = location.href.split('#')[0] + '#/' + (rec.k === 'row' ? 'r/' : 'p/') + rec.id;
  const created = D.val(rec, 'created', 0);
  const duplicate = () => { const r = D.create('row', rec.sh, { db: D.val(rec, 'db'), created: Date.now(), order: Date.now() }); const up = {};
    for (const [k, f] of Object.entries(rec.f)) if (k.startsWith('p:') || k === 'blocks') up[k] = JSON.parse(JSON.stringify(f.v));
    const tp = dbr && DB.titleProp(dbr); if (tp && up['p:' + tp.id]) up['p:' + tp.id] += ' (copy)'; D.update(r.id, up); toast('Duplicated'); render(); };
  const body = h('div', { class: 'actions' },
    h('div', { class: 'asub' }, rec.k === 'row' ? 'Task' : 'Page', h('b', {}, title)),
    h('div', { class: 'agrp' },
      act('star', fav ? 'Remove from Favourites' : 'Add to Favourites', () => { D.update(id, { fav: !fav }); toast(fav ? 'Removed from Favourites' : 'Added to Favourites'); render(); }),
      act('expand', 'Open', () => openTask(id)),
      dbr ? act('list', 'Edit property', () => editProps(rec, dbr), { chev: true }) : null),
    h('div', { class: 'agrp' }, act('comment', 'Comment', () => { openTask(id); setTimeout(() => document.querySelector('[aria-label="Add a comment"]')?.focus(), 450); })),
    h('div', { class: 'agrp' },
      act('link', 'Copy link', () => navigator.clipboard.writeText(link).then(() => toast('Link copied'), () => toast('Could not copy the link'))),
      dbr ? act('pages', 'Duplicate', duplicate) : null,
      act('trash', 'Move to Trash', () => { D.trash(id); if (state.pane === id) state.pane = null; render(); toast('Moved to Trash. Restore it from Trash.'); }, { danger: true })),
    h('div', { class: 'agrp ainfo' }, h('b', {}, 'Last edited'), h('span', {}, lastEdited(rec)),
      h('b', { style: { marginTop: '8px' } }, 'Activity'), h('span', {}, 'Edited ' + lastEdited(rec)), created ? h('span', {}, 'Created ' + formatDate(new Date(created), 'DD/MM/YYYY') + ' at ' + new Date(created).toTimeString().slice(0, 5)) : null));
  s = sheet('Actions', body, { done: 'Done' });
}
// every property of a task in one sheet; changes save straight away
function editProps(rec, dbr) {
  const rows = DB.props(dbr).map(p => {
    let ed;
    if (['text', 'title', 'number', 'url'].includes(p.type)) {
      ed = h('input', { class: 'field', value: DB.raw(D.getRec(rec.id), p) ?? '', inputmode: p.type === 'number' ? 'decimal' : null, type: p.type === 'url' ? 'url' : 'text', 'aria-label': p.name,
        onchange: e => { const v = p.type === 'number' ? (e.target.value === '' ? null : +e.target.value) : e.target.value; D.update(rec.id, { ['p:' + p.id]: v }); document.dispatchEvent(new CustomEvent('folio-row', { detail: rec.id })); } });
    } else ed = propEditor(D.getRec(rec.id), p, dbr);
    return h('div', { class: 'eprow' }, h('span', { class: 'epname' }, icon(DB.TYPE_ICON[p.type] || 'text', 16), p.name), h('div', { class: 'epval props' }, ed));
  });
  sheet('Edit property', h('div', { class: 'agrp eplist' }, rows), { done: 'Done', onDone: () => render() });
}

// a locked page can be read but not edited
function applyLock() {
  const r = state.route[0], kp = DB.kpiDb() && D.val(DB.kpiDb(), 'page');
  const rec = r === 'p' || r === 'r' ? D.live(state.route[1]) : (r === 'tracker' || r === 'archive') && kp ? D.live(kp) : null;
  const wrap = document.querySelector('#main > .wrap'); if (!wrap) return;
  const on = !!(rec && D.val(rec, 'locked')); wrap.classList.toggle('locked-page', on);
  if (on) wrap.querySelectorAll('[contenteditable="true"], [contenteditable="plaintext-only"], [contenteditable=""]').forEach(e => e.contentEditable = 'false');
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
/** iOS sometimes leaves the web view scrolled down, or keeps the old screen's top margin, after a rotation or when coming back
 *  from another app — that shows as an empty band at the top. Put the page back at the top and make Safari re-measure. */
function settleViewport(kind) {
  if (document.visibilityState === 'hidden') return;
  const typing = () => { const a = document.activeElement; return !!(a && a.matches && a.matches('input, textarea, select, [contenteditable="true"]')); };
  if (typing()) return; // never move the page while you type: iOS is keeping the field in view
  const fix = () => {
    if (typing()) return;
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
    if (document.documentElement.scrollTop) document.documentElement.scrollTop = 0;
    if (document.body.scrollTop) document.body.scrollTop = 0;
    const r = document.documentElement; r.classList.add('vv-nudge'); void r.offsetHeight; r.classList.remove('vv-nudge'); // fresh safe-area values
    layout();
  };
  // what closing and reopening the app does, without closing it: ask iOS for fresh screen values (viewport meta),
  // then redraw the page once the size has settled, keeping where you were scrolled
  const fresh = () => {
    if (typing() || document.querySelector('.cellpop, .sheet, .gmodal, .menu, .adjbar, .adjh, .lockscreen, #lock:not([hidden])')) return; // never while you edit, adjust or a sheet is open
    const m = document.querySelector('meta[name="viewport"]');
    if (m) { const c = m.getAttribute('content'); m.setAttribute('content', c.replace('initial-scale=1', 'initial-scale=1.0001')); requestAnimationFrame(() => m.setAttribute('content', c)); }
    const main = document.getElementById('main'), y = main ? main.scrollTop : 0;
    fix(); render(); const back = () => { const mm = document.getElementById('main'); if (mm && y) mm.scrollTop = y; }; requestAnimationFrame(back); setTimeout(back, 60); setTimeout(back, 200);
    const app = document.getElementById('app'); if (app) { app.style.transform = ''; const t = Math.round(app.getBoundingClientRect().top); if (Math.abs(t) > 1) app.style.transform = `translateY(${-t}px)`; } // last resort: the app box drawn below the top
  };
  fix(); [80, 300, 700].forEach(t => setTimeout(fix, t)); if (kind === 'resume' || kind === 'rotate') setTimeout(fresh, 1100); // only when coming back to the app or rotating; they finish in steps on iOS
}

// ---------- routing ----------
export function go(hash, { replace = false } = {}) { if (location.hash === hash) render(); else if (replace) location.replace(hash); else location.hash = hash; }
export function openTask(id) {
  const rec = D.live(id), kd = DB.kpiDb();
  // a project opens its Project Details; the Focus lists keep their own task page / side panel (with a link to the details)
  const focus = ['list', 'db', 'archive', 'tracker'].includes(state.route[0]);
  if (!focus && rec && kd && rec.k === 'row' && D.val(rec, 'db') === kd.id) { go('#/project/' + id); return; }
  const m = layoutMode();
  if ((m === 'split' || m === 'wide') && ['list', 'db', 'archive', 'tracker'].includes(state.route[0])) { state.pane = id; render(); }
  else go('#/r/' + id);
}
export function back() { if (history.length > 1) history.back(); else go('#/home'); }

// While you are typing (edit card, a field, page text), background redraws (sync, layout changes) wait until you finish,
// so the card or the text you are editing never disappears. Going to another screen still redraws straight away.
let renderLater = false;
// after an edit card closes: redraw the list, unless you already moved on to edit something else (then redraw when you finish)
function softRender() { setTimeout(() => { if (document.querySelector('.cellpop') || typingNow()) renderLater = true; else render(); }, 0); }
const typingNow = () => { const a = document.activeElement; return !!a && a !== document.body && (a.isContentEditable || a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !/^(checkbox|radio|range|button|submit|file|date)$/.test(a.type))) && !!a.closest('#main, #pane, .cellpop'); };
document.addEventListener('focusout', () => setTimeout(() => { if (renderLater && !typingNow()) { renderLater = false; render(); } }, 120));
// a screen that saves while it is being built (e.g. making a missing record) must not redraw inside the redraw
let rendering = false, renderAgain = false;
export function render() {
  if (rendering) { renderAgain = true; return; }
  rendering = true;
  try { renderNow(); } finally { rendering = false; }
  if (renderAgain) { renderAgain = false; setTimeout(render, 0); }
}
function renderNow() {
  const app = $('#app'); if (!app) return;
  if (typingNow() && $('#main')?.dataset.route === location.hash) { renderLater = true; renderSide(); return; }
  const r = (location.hash.replace(/^#\/?/, '') || 'home').split('/'); state.route = r;
  const main = $('#main'); const scroll = main.scrollTop; const same = main.dataset.route === location.hash;
  main.replaceChildren(); main.dataset.route = location.hash;
  try {
    switch (r[0]) {
      case 'home': main.append(homeScreen()); break;
      case 'activity': main.append(activityScreen()); break;
      case 'ecx': main.append(focusScreen('ecx')); break;
      case 'list': main.append(listScreen(['today', 'survey', 'ecpar', 'ecx'].includes(r[1]) ? r[1] : 'today')); break;
      case 'projects': main.append(projectsScreen()); break;
      case 'project': main.append(projectScreen(r[1], r[2])); break;
      case 'kpi': main.append(kpiScreen()); break;
      case 'timeline': main.append(timelineScreen()); break;
      case 'board': main.append(boardScreen()); break;
      case 'reports': main.append(reportsScreen()); break;
      case 'today': main.append(focusScreen('today')); break;
      case 'survey': main.append(focusScreen('survey')); break;
      case 'ecpar': main.append(focusScreen('ecpar')); break;
      case 'ecpar-archive': main.append(ecparArchiveScreen()); break;
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
      default: main.append(homeScreen());
    }
  } catch (e) { console.error(e); main.append(h('div', { class: 'wrap' }, h('p', { class: 'empty' }, 'Something went wrong showing this screen: ' + e.message))); }
  main.prepend(topbar());
  document.body.classList.toggle('on-home', ['home', 'activity', 'projects', 'project', 'today', 'survey', 'ecpar', 'ecx', 'timeline', 'board', 'reports', 'kpi'].includes(r[0]));
  // the menu closes when you go to another page, not when the same page redraws after a save or a sync
  if (!same && layoutMode() !== 'wide') document.body.classList.remove('side-open');
  applyLock();
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
/** sidebar avatar: the profile photo, or the initials until one is added */
function profileAvatar(initials) {
  const ph = D.val(D.live('home') || { f: {} }, 'icon'), el = h('span', { class: 'nav-av' + (ph ? ' photo' : '') }, ph ? null : initials);
  if (ph && ph.id) import('./page.js').then(m => m.fileUrl(ph.id)).then(u => { if (u) el.style.backgroundImage = `url("${u}")`; else el.textContent = initials; });
  return el;
}
// the F logo opens a menu like Notion's workspace menu
// the profile photo is the one on Home (kept on the 'home' record, synced with the workspace)
const profileRec = () => D.live('home') || D.getRec('home') || D.create('home', 'ws', { id: 'home', created: Date.now() });
function setProfilePhoto() {
  pickImage(async f => { const ref = await Sync.addFile(null, f); Sync.soon(); D.update(profileRec().id, { icon: ref, iconPos: '50% 50%' }); toast('Profile photo saved'); render(); renderSide(); }, { max: 800 });
}
function workspaceMenu(anchor) {
  const hasPhoto = !!D.val(profileRec(), 'icon');
  menu(anchor, [
    { label: 'Edit profile', icon: 'users', run: editProfile },
    { label: hasPhoto ? 'Change profile photo' : 'Add profile photo', icon: 'person', run: setProfilePhoto },
    ...(hasPhoto ? [{ label: 'Remove profile photo', icon: 'trash', danger: true, run: () => { D.update(profileRec().id, { icon: null }); render(); renderSide(); } }] : []),
    { label: 'Inbox', icon: 'inbox', run: () => go('#/inbox') },
    { label: 'Settings', icon: 'settings', run: () => go('#/settings') },
    { label: 'Trash', icon: 'trash', run: () => go('#/trash') },
    { label: 'Import from Notion', icon: 'import', run: () => go('#/settings/import') }, '-',
    { label: 'Help and support', icon: 'help', run: () => helpSheet() }]);
}
// Name, role and workspace name live in the menu, so the menu buttons themselves stay tap-only
async function editProfile() {
  const ask = async (key, title, def) => { const v = await promptBox(title, L(key, def)); if (v == null) return; const next = { ...labels }; const t = v.replace(/\s+/g, ' ').trim().slice(0, 80); if (!t || t === def) delete next[key]; else next[key] = t; labels = next; };
  await ask('profile.name', 'Your name', 'Your name'); await ask('profile.role', 'Your role', 'Planning Technician'); await ask('brand', 'Workspace name', 'Planning KPI Workspace');
  renderSide(); await Sync.saveSettings({ labels }); Sync.soon(500);
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
// ⋯ next to Private (like Notion): Sort by (Manual / Last edited) and Show (5, 10, 15, 20 items or All); synced
let privSort = 'manual', privShow = 0, privHide = [], privHideAll = false; // pages hidden from the menu (they stay in All pages)
async function savePriv() { renderSide(); await Sync.saveSettings({ privSort, privShow, privHide, privHideAll }); Sync.soon(500); renderSide(); }
/** tick the pages to show in the menu; the list stays open so several can be changed */
function choosePages(anchor) {
  const kp = DB.kpiDb() && D.val(DB.kpiDb(), 'page');
  const all = D.all('page', p => !D.val(p, 'parent') && p.id !== kp).sort((a, b) => recTitle(a).localeCompare(recTitle(b)));
  menu(anchor, [
    { el: h('div', { class: 'mhead' }, 'Show in the menu') },
    ...all.map(p => ({ label: recTitle(p), checked: !privHide.includes(p.id), keep: true, run: () => {
      privHide = privHide.includes(p.id) ? privHide.filter(x => x !== p.id) : [...privHide, p.id]; savePriv(); setTimeout(() => choosePages(anchor), 0); } })),
    ...(all.length ? [] : [{ el: h('div', { class: 'mhead' }, 'No pages yet') }])]);
}
function privateMenu(anchor) {
  menu(anchor, [
    { el: h('div', { class: 'mhead' }, 'Private') },
    { label: 'Sort by: ' + (privSort === 'edited' ? 'Last edited' : 'Manual'), icon: 'sort', run: () => menu(anchor, [
      { el: h('div', { class: 'mhead' }, 'Sort by') },
      { label: 'Manual', checked: privSort === 'manual', run: () => { privSort = 'manual'; savePriv(); } },
      { label: 'Last edited', checked: privSort === 'edited', run: () => { privSort = 'edited'; savePriv(); } }]) },
    { label: 'Show: ' + (privShow ? privShow + ' items' : 'All'), icon: 'number', run: () => menu(anchor, [
      { el: h('div', { class: 'mhead' }, 'Show') },
      ...[5, 10, 15, 20].map(n => ({ label: n + ' items', checked: privShow === n, run: () => { privShow = n; savePriv(); } })),
      { label: 'All', checked: !privShow, run: () => { privShow = 0; savePriv(); } }]) },
    { label: privHideAll ? 'Show pages in the menu' : 'Hide pages from the menu', icon: privHideAll ? 'eye' : 'eyeoff', run: () => { privHideAll = !privHideAll; savePriv(); } },
    { label: 'Choose pages to show…' + (privHide.length ? ' (' + privHide.length + ' hidden)' : ''), icon: 'check', run: () => choosePages(anchor) }, '-',
    { label: 'All pages', icon: 'pages', run: () => go('#/pages') }]);
}
function renderSide() {
  const side = $('#side');
  const cur = state.route[0], kp = DB.kpiDb() && D.val(DB.kpiDb(), 'page'), n = NOW();
  const has = !!DB.kpiDb();
  const counts = has ? focusCounts(n) : {};
  const nav = (hash, ic, label, on, badge) => h('a', { class: 'nitem' + (on ? ' on' : ''), href: hash, 'aria-label': label, 'aria-current': on ? 'page' : null },
    icon(ic, 18), h('span', { class: 'nl' }, label), badge ? h('span', { class: 'nbadge' }, badge) : null);
  const head = (key, label, extra) => h('div', { class: 'nhead' }, h('span', {}, label), extra || null);
  const item = rec => { const hsh = recHash(rec); const on = location.hash === hsh;
    return h('a', { class: 'nitem sm' + (on ? ' on' : ''), href: hsh }, recIcon(rec, 18), h('span', { class: 'nl' }, recTitle(rec))); };
  const edited = r => { let t = 0; for (const f of Object.values(r.f || {})) { const w = parseInt(String(f.ts).split(':')[0], 36); if (w > t) t = w; } return t; };
  const favs = [...D.all('page', p => D.val(p, 'fav')), ...D.all('row', r => D.val(r, 'fav'))];
  const pages = privHideAll ? [] : D.all('page', p => !D.val(p, 'parent') && p.id !== kp && !privHide.includes(p.id)).sort(privSort === 'edited' ? (a, b) => edited(b) - edited(a)
    : (a, b) => (D.val(a, 'order', 0) - D.val(b, 'order', 0)) || recTitle(a).localeCompare(recTitle(b))).slice(0, privShow || Infinity);
  const st = Sync.getStatus();
  const syncText = Sync.connected() ? (st.state === 'error' ? 'Sync problem' : st.state === 'syncing' ? 'Syncing…' : st.at ? 'Synced ' + ago(st.at) : 'Not synced yet') : 'Sync is off';
  const name = L('profile.name', 'Your name'), initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'F';
  side.replaceChildren(
    h('div', { class: 'nbrand' }, logo(30), h('b', {}, L('brand', 'Planning KPI Workspace')),
      layoutMode() === 'wide' ? null : h('button', { class: 'nclose', 'aria-label': 'Close the menu', onclick: () => toggleSide(false) }, icon('close', 18))),
    h('nav', { class: 'nscroll' },
      h('div', { class: 'ngroup' },
        nav('#/home', 'home', 'Home', cur === 'home'),
        nav('#/projects', 'folder', 'Projects', ['projects', 'project', 'tracker', 'archive', 'db', 'board', 'timeline'].includes(cur)),
        nav('#/reports', 'linechart', 'Reports', ['reports', 'kpi'].includes(cur)),
        nav('#/calendar', 'date', 'Calendar', cur === 'calendar')),
      head('focus', 'Focus'),
      h('div', { class: 'ngroup' },
        nav('#/today', 'today', 'Due Today', cur === 'today', counts.today),
        nav('#/survey', 'target', 'Pending Site Survey', cur === 'survey', counts.survey),
        nav('#/ecpar', 'ecpar', 'Rejected ECPAR', cur === 'ecpar', counts.ecpar),
        nav('#/ecx', 'ecxs', 'Rejected ECX', cur === 'ecx', counts.ecx)),
      favs.length ? [head('favs', 'Favourites'), h('div', { class: 'ngroup nfavs' }, favs.map(item))] : null,
      head('pages', 'Pages', h('button', { class: 'smore', 'aria-label': 'Private options', onclick: e => privateMenu(e.currentTarget) }, icon('more', 16))),
      h('div', { class: 'ngroup npages' }, pages.map(item),
        h('button', { class: 'nitem sm muted', onclick: () => go('#/p/' + newPage().id) }, icon('plus', 18), h('span', { class: 'nl' }, 'New page')),
        nav('#/comments', 'history', 'Activity Log', cur === 'comments'),
        nav('#/trash', 'trash', 'Trash', cur === 'trash'))),
    h('div', { class: 'nfoot' },
      h('button', { class: 'nprofile', 'aria-label': 'Profile and settings', onclick: e => workspaceMenu(e.currentTarget) },
        profileAvatar(initials),
        h('span', { class: 'npn' }, h('b', {}, L('profile.name', 'Your name')), h('small', {}, L('profile.role', 'Planning Technician'))),
        icon('chevd', 16)),
      h('a', { class: 'nsync' + (st.state === 'error' ? ' bad' : ''), href: '#/settings', title: syncText }, icon('sync', 14), h('span', {}, syncText))));
}

// ---------- top bar (Notion style): menu, back, forward, title, share, favourite, more ----------
const SCREEN = { 'ecpar-archive': ['Rejected ECPAR Archive', 'ecpar'], home: ['Home', 'home'], activity: ['Recent Activity', 'history'], ecx: ['Rejected ECX', 'ecxs'], projects: ['Projects', 'folder'], project: ['Project Details', 'building'], kpi: ['KPI', 'barchart'], timeline: ['Timeline', 'timeline'], board: ['Board', 'columns'], reports: ['Reports', 'linechart'], comments: ['Activity Log', 'history'], calendar: ['Calendar', 'date'], inbox: ['Inbox', 'inbox'], today: ['Due Today', 'today'], survey: ['Pending Site Survey', 'target'], ecpar: ['Rejected ECPAR', 'ecpar'], pages: ['Pages', 'pages'], search: ['Search', 'search'], settings: ['Settings', 'settings'], trash: ['Trash', 'trash'] };
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
    nb('Home', 'home', () => go('#/home'), r === 'home'), nb('Due Today', 'today', () => go('#/today'), r === 'today'), nb('Pending Site Survey', 'target', () => go('#/survey'), r === 'survey'),
    nb('Rejected ECPAR', 'ecpar', () => go('#/ecpar'), r === 'ecpar'), nb('Rejected ECX', 'ecxs', () => go('#/ecx'), r === 'ecx'),
    nb('Projects', 'folder', () => go('#/projects'), ['projects', 'project', 'tracker', 'archive', 'db', 'board', 'timeline'].includes(r)),
    nb('Search', 'search', () => go('#/search'), r === 'search'));
  const newPill = pill(nb('New project', 'plus', () => { if (DB.kpiDb()) newProjectSheet(); else go('#/p/' + newPage().id); }));
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
const TITLES = { today: 'Due Today', survey: 'Pending Site Survey', ecpar: 'Rejected ECPAR', ecx: 'Rejected ECX' };
let commentCount = new Map(); // task id -> number of comments, built once per list screen
function listScreen(kind) {
  commentCount = new Map(); for (const c of D.all('cmt')) { const k = D.val(c, 'parent'); commentCount.set(k, (commentCount.get(k) || 0) + 1); }
  const n = NOW(); state.ctx = { export: a => exportList(kind, a), more: a => moreMenu(a, { extra: [{ label: 'Open Planning KPI Tracker', icon: 'table', run: () => go('#/tracker') }] }) };
  const head = pageHead(elabel('title.' + kind, TITLES[kind], 'span'), formatDate(new Date(n), 'dddd, D MMMM YYYY'), (SCREEN[kind] || [0, 'today'])[1], { crumb: TITLES[kind] });
  const wrap = h('div', { class: 'wrap home' }, head);
  if (!DB.kpiDb()) { wrap.append(emptyTracker(true)); return wrap; }
  const g = kind === 'today' ? DB.todayGroups(n) : kind === 'survey' ? DB.surveyGroups(n) : kind === 'ecx' ? DB.ecxGroups(n) : DB.ecparGroups(n);
  const dueT = kind === 'today' ? E.dueTasks(n) : [];
  if (dueT.length) wrap.append(dueTaskList(dueT));
  const names = kind === 'ecpar' || kind === 'ecx' ? ['Overdue Amendment', 'Pending Amendment'] : ['Overdue', 'Today', 'Upcoming'];
  const unitFor = () => 'Days';
  const sec = (label, color, list, numColor) => list.length ? [h('div', { class: 'barrow' }, h('span', { class: 'bunit ' + color }, elabel('unit.' + kind + '.' + label, unitFor(label))), h('h2', { class: 'bar ' + color }, elabel('sec.' + kind + '.' + label, label))), ...later(list, t => taskRow(t, numColor, kind), { first: 15, step: 30 })] : [];
  wrap.append(...sec(names[0], 'red', g.overdue, 'red'), ...sec(names[1], 'orange', g.today, 'orange'), ...(g.upcoming ? sec(names[2], 'blue', g.upcoming, 'blue') : []));
  if (!g.overdue.length && !g.today.length && !(g.upcoming || []).length && !dueT.length)
    wrap.append(h('p', { class: 'empty' }, kind === 'today' ? 'Nothing due in the next 2 days. Nice.' : kind === 'survey' ? 'No tasks are waiting for a site survey.' : kind === 'ecx' ? 'No rejected ECX. Add an ECX Rejected date to a project to track it here.' : 'No rejected ECPAR to amend.'));
  return wrap;
}
// Every part of a row can be edited right here: tap the name, address, status/station or date.
// "Open" (or the day number) opens the full task page. Press and hold a map link to change it.
function rowEdit(t) {
  const dbr = DB.kpiDb(), rec = D.getRec(t.id), P = n => DB.propByName(dbr, n);
  const set = (p, val) => { D.update(t.id, { ['p:' + p.id]: val }); document.dispatchEvent(new CustomEvent('folio-row', { detail: t.id })); render(); };
  const text = (el, name) => { const p = P(name); if (p) popEdit(el, D.getRec(t.id), p, softRender); };
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
  const meta = kind === 'ecpar' ? (t.rejected ? 'Rejected ' + formatDate(t.rejected, 'DD/MM/YYYY') : 'Add rejected date') : (t.due ? 'Due ' + formatDate(t.due, 'DD/MM/YYYY') : 'Add due date');
  const dueBtn = h('button', { class: 'due ebtn' + (/^Add/.test(meta) ? ' empty' : ''), 'aria-label': 'Change ' + dateProp, onclick: () => ed.date(dateProp) }, meta);
  const map = t.map && /^https?:/i.test(t.map) ? t.map : '';
  const editMap = () => ed.text(mapRow, 'Pin Location');
  // Google Maps link, then an embedded link (any link you paste), like Notion's link mention
  // Pin Location shown like Notion: 🔗 maps.app.goo.gl/71c… — tap opens Maps, hold to change
  const mapLink = map ? holdToEdit(h('a', { class: 'lnk elink pinlink', href: mapsUrl(map), target: '_blank', rel: 'noopener', title: map + ' (press and hold to change)' }, icon('link', 16), urlParts(map)), editMap)
    : h('button', { class: 'lnk ebtn empty', onclick: editMap }, icon('link', 16), 'Pin Location');
  const linkUrl = t.row ? DB.raw(t.row, LINK_PROP) : null;
  let linkEl;
  const editLink = () => popEdit(linkEl, D.getRec(t.id), LINK_PROP, softRender);
  linkEl = linkUrl && /^https?:/i.test(linkUrl)
    ? holdToEdit(h('a', { class: 'lnk elink', href: browserUrl(linkUrl), target: '_blank', rel: 'noopener', title: linkUrl + ' (press and hold to change)' }, icon('filelink', 16), h('span', {}, linkLabel(linkUrl))), editLink)
    : h('button', { class: 'lnk ebtn empty', onclick: editLink }, icon('filelink', 16), 'Paste a link');
  const mapRow = h('div', { class: 'links' }, mapLink, linkEl);
  let addrEl;
  addrEl = h('button', { class: 'addr ebtn' + (t.address ? '' : ' empty'), onclick: () => ed.text(addrEl, 'Address') }, t.address || 'Add address');
  let nameEl;
  nameEl = h('button', { class: 'name ebtn', onclick: () => ed.text(nameEl, DB.titleProp(dbr)?.name || 'Customer Name') }, t.title || 'Untitled');
  const taskEl = h('div', { class: 'task ' + color + (state.pane === t.id ? ' sel' : '') },
    h('button', { class: 'rail', 'aria-label': 'Open ' + (t.title || 'task'), onclick: () => openTask(t.id) }, h('b', {}, d == null ? '–' : Math.abs(d)), d == null ? h('small', {}, 'no date') : null),
    h('div', { class: 'body' },
      h('div', { class: 'l1' }, h('span', { class: 'nm' }, nameEl, commentCount.get(t.id) ? h('button', { class: 'ccount', 'aria-label': commentCount.get(t.id) + ' comments, open task', onclick: () => openTask(t.id) }, icon('comment', 15), commentCount.get(t.id)) : null), h('div', { class: 'rt' }, h('button', { class: 'openbtn', onclick: () => openTask(t.id) }, 'Open'), right)),
      addrEl,
      h('div', { class: 'l3' }, mapRow, dueBtn)));
  longPress(taskEl, () => rowActions(t.id));
  return taskEl;
}
// Maps app on iPhone; plain web elsewhere
const isIOS = () => /iP(hone|ad|od)/.test(navigator.platform) || (navigator.userAgent.includes('Mac') && 'ontouchend' in document);
// a Google Maps link: maps.app.goo.gl, goo.gl/maps, google.<tld>/maps, maps.google.<tld>
const isGoogleMaps = u => /^(https?:\/\/)?((maps\.app\.goo\.gl|goo\.gl\/maps)\/|(www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)/i.test(String(u || '').trim());
// on iPhone / iPad a Google Maps link opens the Google Maps app (comgooglemapsurl://, Google own scheme for map links);
// if the app does not open, the link opens in Safari instead (see the click handler below)
// short share links (maps.app.goo.gl) are not supported by comgooglemapsurl:// ("Unsupported link"): give iOS the plain
// https link, which iOS hands to the Google Maps app itself (not forced into Safari)
const isShortMaps = u => /^(https?:\/\/)?maps\.app\.goo\.gl\//i.test(String(u || '').trim());
export const mapsUrl = u => isIOS() && isGoogleMaps(u) && !isShortMaps(u) ? 'comgooglemapsurl://' + String(u).trim().replace(/^https?:\/\//i, '') : u;
export const browserUrl = u => isIOS() && isGoogleMaps(u) ? mapsUrl(u) : isIOS() ? u.replace(/^https:\/\//i, 'x-safari-https://').replace(/^http:\/\//i, 'x-safari-http://') : u;
// fallback: Google Maps app not installed (the page is still showing after a moment) → open the same link in Safari
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[href^="comgooglemapsurl://"]'); if (!a) return;
  const web = 'x-safari-https://' + a.getAttribute('href').slice('comgooglemapsurl://'.length);
  let left = false; const gone = () => { left = true; }; document.addEventListener('visibilitychange', gone, { once: true }); window.addEventListener('pagehide', gone, { once: true });
  setTimeout(() => { document.removeEventListener('visibilitychange', gone); if (!left && document.visibilityState === 'visible') location.href = web; }, 1600);
}, true);

export function exportList(kind, anchor) {
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
  return h('div', { class: 'wrap home' }, pageHead(elabel('title.pages', 'Pages', 'span'), list.length + ' pages', 'pages', { crumb: 'Pages' }),
    h('div', { class: 'group', style: { marginTop: '24px' } }, list.map(p => h('a', { class: 'grow', href: '#/p/' + p.id }, icon('pages', 18), h('span', { class: 'gl' }, D.val(p, 'title') || 'Untitled'), icon('chevr', 14, 'chev'))),
      h('button', { class: 'grow', onclick: () => go('#/p/' + newPage().id) }, icon('plus', 18), h('span', { class: 'gl' }, 'New page'))));
}
function trashScreen() {
  state.ctx = {};
  const items = [...D.deleted('page'), ...D.deleted('row')];
  return h('div', { class: 'wrap home' }, pageHead('Trash', 'Deleted items you can restore', 'archive'),
    items.length ? h('div', { class: 'group', style: { marginTop: '20px' } }, items.map(r => h('div', { class: 'grow' }, h('span', { class: 'gl' }, r.k === 'row' ? DB.title(r) : (D.val(r, 'title') || 'Untitled')),
      h('button', { class: 'btn', onclick: () => { D.restore(r.id); render(); toast('Restored'); } }, 'Restore')))) : h('p', { class: 'empty' }, 'Trash is empty.'));
}

// ---------- boot ----------
export async function boot() {
  try { if (localStorage.getItem('folio-side') === 'closed') document.body.classList.add('side-closed'); } catch {}
  document.body.append(h('div', { id: 'app' }, h('div', { id: 'scrim', onclick: () => toggleSide(false) }), h('nav', { id: 'side', 'aria-label': 'Workspace' }), h('main', { id: 'main' }), h('div', { id: 'divider', role: 'separator', 'aria-label': 'Drag to resize. Drag to the edge to open full.', onpointerdown: dragDivider }), h('section', { id: 'pane', 'aria-label': 'Selected task' })), h('div', { id: 'fnav' }));
  window.__folioStep = 'storage'; await D.load(); S.persist(); await loadFont(); E.ensureAll();
  // changes arriving from another device wait while you are typing or have an editor open, so nothing closes under your finger
  const editing = () => { const a = document.activeElement; return !!(a && a !== document.body && (a.matches('input, textarea, select, [contenteditable="true"]'))) || !!document.querySelector('.cellpop, .sheet, .menu, .gmodal'); };
  let syncPending = false;
  const flushSync = () => { if (!syncPending) return; if (editing()) return setTimeout(flushSync, 1500); syncPending = false; render(); };
  // a project's category changed here: its standard tasks follow straight away
  // (only for a Project Category change: other edits must not run the full check, which copies linked dates back onto the project)
  let catT = 0; D.onChange(info => { if (info.type !== 'update' || !info.fields || D.getRec(info.id)?.k !== 'row') return; const d = DB.kpiDb(), cp = d && DB.propByName(d, 'Project Category');
    if (cp && info.fields.includes('p:' + cp.id)) { clearTimeout(catT); catT = setTimeout(() => E.ensureAll(), 300); } });
  // a project you reopen comes back out of the archive: Archive is unticked when its Status moves from Done to an open stage
  // (Site Survey, Estimation, To Amend…) or a new, later Date Assigned is keyed in. Changes arriving by sync are left alone.
  const snap = new Map(); const kp = () => { const d = DB.kpiDb(); return d && { d, st: DB.propByName(d, 'Status'), as: DB.propByName(d, 'Date Assigned'), ar: DB.propByName(d, 'Archive') }; };
  const take = r => { const k = kp(); if (k && k.st && k.as) snap.set(r.id, { st: String(D.val(r, 'p:' + k.st.id) || ''), as: String(D.val(r, 'p:' + k.as.id) || '').slice(0, 10) }); };
  const takeAll = () => { const k = kp(); if (k) for (const r of DB.rows(k.d.id)) take(r); };
  takeAll();
  D.onChange(info => {
    if (info.type === 'sync' || info.type === 'wipe') return takeAll();
    if (info.type === 'create') { const r = D.getRec(info.id); if (r && r.k === 'row') take(r); return; }
    if (info.type !== 'update' || !info.fields) return; const r = D.getRec(info.id); if (!r || r.k !== 'row') return;
    const k = kp(); if (!k || D.val(r, 'db') !== k.d.id || !k.ar) return;
    const before = snap.get(r.id); take(r); const now_ = snap.get(r.id); if (!before || !now_) return;
    if (!D.val(r, 'p:' + k.ar.id)) return;
    const reopened = info.fields.includes('p:' + k.st.id) && /^(done|completed?)$/i.test(before.st) && now_.st && !/^(done|completed?|rejected)$/i.test(now_.st);
    const newDate = info.fields.includes('p:' + k.as.id) && now_.as && now_.as > (before.as || '');
    if (reopened || newDate) { D.update(r.id, { ['p:' + k.ar.id]: false }); E.log(r, 'Project', 'Taken out of the archive (' + (reopened ? 'Status changed to ' + now_.st : 'new Date Assigned') + ').'); toast('Taken out of the archive'); }
  });
  D.onChange(info => { if (info.type === 'sync') { E.ensureAll(); if (editing()) { syncPending = true; setTimeout(flushSync, 1500); return; } }
    if (info.type === 'sync' || info.type === 'create' || info.type === 'delete' || info.type === 'wipe') render(); if (info.type !== 'sync') Sync.soon(); });
  Sync.onStatus(() => { renderSide(); loadFont(); });
  addEventListener('hashchange', () => { state.pane = null; render(); });
  addEventListener('resize', layout); layout();
  addEventListener('orientationchange', () => settleViewport('rotate')); let lastOrient = innerWidth > innerHeight; addEventListener('resize', () => setTimeout(() => { const o = innerWidth > innerHeight; settleViewport(o !== lastOrient ? 'rotate' : undefined); lastOrient = o; }, 50));
  addEventListener('pageshow', () => settleViewport('resume')); addEventListener('focus', () => settleViewport());
  document.addEventListener('focusout', () => setTimeout(() => { const a = document.activeElement; if (!a || !a.matches('input, textarea, select, [contenteditable="true"]')) settleViewport(); }, 350)); // keyboard closed
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') settleViewport('resume'); });
  if (window.visualViewport) visualViewport.addEventListener('resize', () => { if (!document.activeElement || !document.activeElement.matches('input, textarea, [contenteditable="true"]')) settleViewport(); });
  initKeyboardBar();
  window.__folioStep = 'lock'; await initLock();
  window.__folioStep = 'sync'; await startupSync(); window.__folioStep = 'ready';
  startNotifier();
  // updates: a new version uploaded to GitHub loads by itself. Folio checks when it opens, every 30 minutes and whenever you switch back to it;
  // when the new version is ready it reloads (your data is saved first), but never while you are typing — then it waits until you stop.
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const hadController = !!navigator.serviceWorker.controller; let reloading = false;
    const editingNow = () => { const a = document.activeElement; return !!(a && a !== document.body && (a.isContentEditable || a.matches('input, textarea, select'))) || !!document.querySelector('.cellpop, .sheet, .menu, .gmodal'); };
    const reloadWhenIdle = () => { if (reloading) return; if (editingNow()) return setTimeout(reloadWhenIdle, 4000); reloading = true; Promise.resolve(D.flush()).finally(() => location.reload()); };
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) reloadWhenIdle(); });
    navigator.serviceWorker.register('sw.js').then(reg => {
      const check = () => reg.update().catch(() => {});
      setInterval(check, 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    }).catch(() => {});
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Sync.soon(500); else D.flush(); });
}

// Tap anywhere on a card row (label or blank space) to edit that field, not only on the text itself.
// Rows with a Yes / Not yet toggle are left alone, so a stray tap never flips them.
document.addEventListener('click', e => {
  const kv = e.target.closest('.pcard .kv, .hcard .kv'); if (!kv || kv.classList.contains('aplwrap')) return;
  if (e.target.closest('button, a, input, textarea, select, [contenteditable="true"], .cellpop, .menu, .sheet')) return;
  const t = kv.querySelector('.kvv button.val, .kvv .props button.val, .kvv button.fv, .kvv .props .val[role="button"]');
  if (!t || t.classList.contains('tgl') || t.disabled) return;
  t.click();
});

// Links (Pin Location, ECX Link, any URL): a tap opens the link; press and hold the blue text (about half a second) to edit it.
{
  let timer = 0, held = false, sx = 0, sy = 0;
  const editorOf = a => a.closest('.ulinkrow')?.querySelector('.uedit') || a.closest('td');
  document.addEventListener('pointerdown', e => {
    const a = e.target.closest && e.target.closest('a.ulink'); held = false; clearTimeout(timer); if (!a) return;
    sx = e.clientX; sy = e.clientY;
    timer = setTimeout(() => { held = true; if (navigator.vibrate) try { navigator.vibrate(10); } catch {} const ed = editorOf(a); if (ed) ed.click(); }, 550);
  }, true);
  document.addEventListener('pointermove', e => { if (timer && (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8)) clearTimeout(timer); }, true);
  for (const ev of ['pointerup', 'pointercancel']) document.addEventListener(ev, () => clearTimeout(timer), true);
  document.addEventListener('click', e => { if (held && e.target.closest && e.target.closest('a.ulink')) { e.preventDefault(); e.stopPropagation(); held = false; } }, true);
  document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('a.ulink')) e.preventDefault(); }, true);
}
