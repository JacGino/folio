// Folio v2 — pages and task pages: cover, photo, title, properties, comments, block body.
import * as D from './data.js';
import * as DB from './db.js';
import * as Sync from './sync.js';
import { h, icon, toast, menu, sheet, group, row, confirmBox, promptBox, esc, textbox, pickImage, pickFile } from './ui.js';
import { mountEditor, blocksToMd, nb } from './editor.js';
import { formatDate, toISODate, parseDate } from './dates.js';
import { state, go, renderNav, download, layoutMode, browserUrl, now, moreMenu } from './app.js';
import { heroNav, coverInto } from './home.js';
import { renderDbBlock } from './table.js';
import { popEdit } from './popedit.js';

let editor = null; // only one main editor at a time
const urls = new Map(), blobs = new Map();
export async function fileUrl(id, hint) { // hint: the file entry ({ name, type }) when known
  if (!id) return null; if (urls.has(id)) return urls.get(id);
  const b = await Sync.fileBytes(id); if (!b) return null;
  const blob = new Blob([b.bytes], { type: b.type || hint?.type || guessType(b.name) || guessType(hint?.name) || sniffType(b.bytes) || 'application/octet-stream' });
  const u = URL.createObjectURL(blob); urls.set(id, u); blobs.set(id, blob); return u;
}
// a file downloaded from GitHub has no name or type with it: tell PDF / images apart by their first bytes, so the browser opens them properly
export function sniffType(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []), at = (o, ...v) => v.every((x, i) => u[o + i] === x), txt = (o, t) => [...t].every((c, i) => u[o + i] === c.charCodeAt(0));
  if (txt(0, '%PDF')) return 'application/pdf';
  if (at(0, 0x89, 0x50, 0x4E, 0x47)) return 'image/png';
  if (at(0, 0xFF, 0xD8, 0xFF)) return 'image/jpeg';
  if (txt(0, 'GIF8')) return 'image/gif';
  if (txt(0, 'RIFF') && txt(8, 'WEBP')) return 'image/webp';
  if (txt(4, 'ftyp') && /^(heic|heix|hevc|mif1|msf1)/.test(String.fromCharCode(...u.slice(8, 12)))) return 'image/heic';
  if (txt(0, 'PK')) return 'application/zip';
  return '';
}
const guessType = n => { const x = (/\.([a-z0-9]+)$/i.exec(n || '') || [])[1]?.toLowerCase(); return { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', heic: 'image/heic', gif: 'image/gif', webp: 'image/webp', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', doc: 'application/msword', xls: 'application/vnd.ms-excel', csv: 'text/csv', txt: 'text/plain', dwg: 'application/acad' }[x] || ''; };
const FILE_PROBLEM = {
  locked: 'Attachments are locked on this device. Unlock them in Settings › Encrypted attachments.',
  offline: 'GitHub is not connected on this device. Connect it in Settings to download this file.',
  missing: 'This file has not been uploaded yet. Open Folio on the device you added it from: it uploads by itself once attachments are unlocked there.',
  error: 'This file could not be downloaded right now. Check your connection and try again.',
};
export async function openFile(f) {
  const u = await fileUrl(f.id, f);
  if (!u) { toast(f.err || FILE_PROBLEM[await Sync.fileProblem(f.id)] || FILE_PROBLEM.error, 6000); return; }
  fileViewer(f, u, blobs.get(f.id));
}
// Files open inside Folio on every device (iPhone, iPhone Duo, iPad, Mac, laptop): Home Screen apps on iPhone / iPad cannot
// open a file in a new tab, so photos and PDFs show here, with Share (Open in… / Save to Files) and Download as the way out
const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1); // iPad reports itself as a Mac with a touch screen
function fileViewer(f, u, blob) {
  const type = blob?.type || '', name = f.name || 'File' + (type === 'application/pdf' ? '.pdf' : '');
  const file = blob ? new File([blob], name, { type }) : null;
  const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
  const save = () => { const a = h('a', { href: u, download: name }); document.body.append(a); a.click(); a.remove(); };
  const view = type.startsWith('image/') && type !== 'image/heic' ? h('img', { class: 'fview-img', src: u, alt: name })
    : type === 'application/pdf' ? h('iframe', { class: 'fview-pdf', src: u, title: name })
    : h('div', { class: 'fview-none' }, icon('clip', 28), h('p', {}, 'This file type cannot be shown here.'), h('p', { class: 'muted' }, isIOS() ? 'Tap Share to open it in another app or save it to Files.' : 'Tap Download to open it with an app on this computer.'));
  sheet(name, h('div', { class: 'fview' }, view,
    h('div', { class: 'fview-bar' },
      canShare ? h('button', { class: 'btn', type: 'button', onclick: () => navigator.share({ files: [file], title: name }).catch(() => {}) }, icon('export', 16), isIOS() ? 'Share / Open in…' : 'Share') : null,
      !isIOS() ? h('button', { class: 'btn', type: 'button', onclick: () => window.open(u, '_blank') }, icon('expand', 16), 'Open in new tab') : null,
      h('button', { class: 'btn', type: 'button', onclick: save }, icon('import', 16), isIOS() ? 'Save' : 'Download'))), { wide: true });
}async function addFile(file) {
  try { const ref = await Sync.addFile(null, file); Sync.soon(); warnSize(); return ref; }
  catch (e) { toast(e.message, 4000); throw e; }
}
async function warnSize() { const n = await Sync.totalBlobBytes(); if (n > 950 * 1048576) toast(`Attachments use ${(n / 1073741824).toFixed(2)} GB. GitHub works best under 1 GB.`, 5000); }

export function newPage(parent = null) { return D.create('page', 'ws', { title: '', parent, blocks: [nb()], created: Date.now(), edited: Date.now(), order: Date.now() }); }
const fontClass = () => ''; // the font is now one setting for the whole app (⋯ → Font)

// ---------- cover + photo ----------
// a small copy of the photo / cover travels with the normal synced data, so it shows straight away on a device whose
// attachments are not on it yet (re-added to the Home Screen, new device, attachments locked); the full file replaces it once it loads
const THUMB = { icon: { key: 'iconThumb', px: 256, q: .82 }, cover: { key: 'coverThumb', px: 720, q: .72 } };
async function makeThumb(url, px, q) {
  const img = new Image(); img.src = url; await img.decode();
  const k = Math.min(1, px / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.max(1, Math.round(img.naturalWidth * k)), hh = Math.max(1, Math.round(img.naturalHeight * k));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = hh; cv.getContext('2d').drawImage(img, 0, 0, w, hh);
  return cv.toDataURL('image/jpeg', q);
}
function showImage(el, rec, field) {
  const ref = D.val(rec, field), t = THUMB[field], th = D.val(rec, t.key);
  if (th && th.id === ref.id && th.data) el.style.backgroundImage = `url("${th.data}")`;
  fileUrl(ref.id).then(async u => {
    if (!u) return; el.style.backgroundImage = `url("${u}")`;
    if (!th || th.id !== ref.id) { try { const data = await makeThumb(u, t.px, t.q); const r = D.getRec(rec.id); if (r && (D.val(r, field) || {}).id === ref.id) D.update(rec.id, { [t.key]: { id: ref.id, data } }); } catch (e) { /* not an image the browser can draw */ } }
  });
}
export function coverAndPhoto(rec, { always = false } = {}) {
  const cover = D.val(rec, 'cover'), photo = D.val(rec, 'icon');
  const pick = (field) => pickImage(async f => { const ref = await addFile(f); D.update(rec.id, { [field]: ref }); go(location.hash); }, { max: field === 'cover' ? 2000 : 800 });
  const out = [];
  if (cover || always || D.val(rec, 'db')) { // pages holding a database always show a cover; a soft default until one is picked
    const c = h('div', { class: 'cover' + (cover ? '' : ' default'), role: 'img', 'aria-label': 'Cover photo' }, h('button', { class: 'chg', onclick: () => menu(c.querySelector('.chg'), [{ label: 'Change cover', icon: 'paint', run: () => pick('cover') }, ...(cover ? [{ label: 'Reposition & resize', icon: 'expand', run: () => adjust(c, rec, 'cover') }] : []), { label: 'Remove cover', icon: 'trash', danger: true, run: () => { D.update(rec.id, { cover: null, coverThumb: null }); go(location.hash); } }]) }, 'Change cover'));
    if (cover) showImage(c, rec, 'cover');
    c.style.backgroundPosition = D.val(rec, 'coverPos', '50% 50%'); if (D.val(rec, 'coverH')) c.style.setProperty('height', D.val(rec, 'coverH') + 'px', 'important');
    out.push(c);
  }
  const av = h('button', { class: 'avatar', 'aria-label': photo ? 'Change profile photo' : 'Add profile photo', onclick: () => menu(av, [
    { label: photo ? 'Change photo' : 'Add photo', icon: 'person', run: () => pick('icon') }, ...(photo ? [{ label: 'Reposition & resize', icon: 'expand', run: () => adjust(av, rec, 'icon') }, { label: 'Remove photo', icon: 'trash', danger: true, run: () => { D.update(rec.id, { icon: null, iconThumb: null }); go(location.hash); } }] : []),
    ...(!cover ? [{ label: 'Add cover', icon: 'paint', run: () => pick('cover') }] : [])]) }, photo ? null : icon('person', 34));
  if (photo) showImage(av, rec, 'icon');
  av.style.backgroundPosition = D.val(rec, 'iconPos', '50% 50%');
  const sz = D.val(rec, 'iconSize'); if (sz) { av.style.setProperty('width', sz + 'px', 'important'); av.style.setProperty('height', sz + 'px', 'important'); }
  return { out, av, hasPhotoUi: !!(cover || photo) };
}

// ---------- reposition & resize the cover or the profile photo ----------
// drag the photo to move it; drag the handle to resize (cover: bottom edge = taller/shorter; photo: corner = bigger/smaller)
function adjust(el, rec, kind) {
  if (el.classList.contains('adjust')) return;
  const isCover = kind === 'cover';
  let [px, py] = (D.val(rec, isCover ? 'coverPos' : 'iconPos', '50% 50%') + '').split(' ').map(v => parseFloat(v) || 50);
  let size = isCover ? el.offsetHeight : el.offsetWidth;
  const z = parseFloat(getComputedStyle(el.closest('.wrap') || el).zoom) || 1;
  const apply = () => { el.style.backgroundPosition = `${px.toFixed(1)}% ${py.toFixed(1)}%`;
    if (isCover) el.style.setProperty('height', size + 'px', 'important'); else { el.style.setProperty('width', size + 'px', 'important'); el.style.setProperty('height', size + 'px', 'important'); } };
  const handle = h('span', { class: 'adjh ' + (isCover ? 'edge' : 'corner'), 'aria-label': isCover ? 'Drag to change the cover height' : 'Drag to change the photo size' });
  const done = () => { D.update(rec.id, isCover ? { coverPos: `${px.toFixed(1)}% ${py.toFixed(1)}%`, coverH: Math.round(size) } : { iconPos: `${px.toFixed(1)}% ${py.toFixed(1)}%`, iconSize: Math.round(size) }); finish(); toast('Saved'); };
  const reset = () => { px = py = 50; size = isCover ? 150 : 72; apply(); };
  const bar = h('div', { class: 'adjbar glass' }, h('span', {}, isCover ? 'Drag to move · drag the bottom edge to resize' : 'Drag to move · drag the corner to resize'),
    h('button', { class: 'btn', type: 'button', onclick: e => { e.stopPropagation(); reset(); } }, 'Reset'),
    h('button', { class: 'btn primary', type: 'button', onclick: e => { e.stopPropagation(); done(); } }, 'Done'));
  el.classList.add('adjust'); el.append(handle); (isCover ? el : el.parentElement).append(bar);
  const stopClick = e => { if (e.target.closest('.adjbar')) return; e.stopPropagation(); e.preventDefault(); };
  el.addEventListener('click', stopClick, true);
  const onDown = e => {
    if (e.target.closest('.adjbar')) return;
    e.preventDefault(); e.stopPropagation(); try { el.setPointerCapture(e.pointerId); } catch {}
    const resizing = e.target === handle, x0 = e.clientX, y0 = e.clientY, p0 = [px, py], s0 = size;
    const move = ev => { const dx = (ev.clientX - x0) / z, dy = (ev.clientY - y0) / z;
      if (resizing) size = isCover ? Math.max(80, Math.min(560, s0 + dy)) : Math.max(40, Math.min(240, s0 + Math.max(dx, dy)));
      else { px = Math.max(0, Math.min(100, p0[0] - dx / el.offsetWidth * 100)); py = Math.max(0, Math.min(100, p0[1] - dy / el.offsetHeight * 100)); }
      apply(); };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  el.addEventListener('pointerdown', onDown);
  function finish() { el.classList.remove('adjust'); handle.remove(); bar.remove(); el.removeEventListener('pointerdown', onDown); setTimeout(() => el.removeEventListener('click', stopClick, true), 0); }
}

// ---------- standalone page (also the Planning KPI Tracker page) ----------
export function renderPage(id, { view } = {}) {
  const rec = D.live(id);
  if (!rec) return h('div', { class: 'wrap' }, h('p', { class: 'empty' }, 'This page was deleted or has not synced yet.'));
  const { out, av, hasPhotoUi } = coverAndPhoto(rec, { always: true });
  // every page has a cover like the other pages (its own, or the workspace cover until one is picked) with the same round buttons on it
  if (out[0] && !D.val(rec, 'cover')) coverInto(out[0]);
  if (out[0]) {
    const fav = !!D.val(rec, 'fav'), ctx = () => state.ctx || {};
    out[0].classList.add('pgcover');
    out[0].append(heroNav(), h('div', { class: 'hero-a pgcover-a' },
      h('button', { class: 'hbtn glass', 'aria-label': 'Share or export', onclick: e => { e.stopPropagation(); ctx().export ? ctx().export(e.currentTarget) : window.print(); } }, icon('export', 19)),
      h('button', { class: 'hbtn glass' + (fav ? ' on' : ''), 'aria-label': fav ? 'Remove from Favourites' : 'Add to Favourites', onclick: e => { e.stopPropagation(); D.update(rec.id, { fav: !fav }); toast(fav ? 'Removed from Favourites' : 'Added to Favourites'); go(location.hash); } }, icon(fav ? 'starf' : 'star', 19)),
      h('button', { class: 'hbtn glass', 'aria-label': 'More options', onclick: e => { e.stopPropagation(); (ctx().more || (a => moreMenu(a)))(e.currentTarget); } }, icon('more', 19))));
  }
  const title = h('h1', { contenteditable: 'true', 'aria-label': 'Page title', 'data-ph': 'Untitled', oninput: e => D.update(id, { title: e.target.textContent, edited: Date.now() }), onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); editor && editor.focusEnd(); } } }, D.val(rec, 'title', ''));
  const body = h('div', {});
  const wrap = h('div', { class: 'wrap ' + fontClass(rec) + (D.val(rec, 'db') ? ' wide-page' : '') }, out, h('div', { class: 'ptitle' }, hasPhotoUi || D.val(rec, 'db') ? av : null, title), body);
  editor && editor.destroy();
  editor = mountEditor(body, {
    blocks: D.val(rec, 'blocks', []), onChange: b => D.update(id, { blocks: b, edited: Date.now() }), onFile: addFile, fileUrl, openFile,
    openPage: pid => go('#/p/' + pid), pageTitle: pid => D.val(D.getRec(pid), 'title') || 'Untitled', newSubPage: () => newPage(id).id,
    renderDb: dbId => renderDbBlock(dbId, { initialView: view })
  });
  state.ctx = { export: a => exportPage(a, rec, () => '# ' + (D.val(rec, 'title') || 'Untitled') + '\n\n' + blocksToMd(editor.blocks())), more: a => pageMore(a, rec, () => coverAndPhoto(rec)),
    tools: toolsFor() };
  if (!D.val(rec, 'title') && !D.val(rec, 'db')) setTimeout(() => title.focus(), 50);
  return wrap;
}
function toolsFor() {
  const b = (label, ic, fn) => h('button', { class: 'b', 'aria-label': label, title: label, onclick: fn }, icon(ic, 20));
  return [b('Add block', 'plus', () => editor && editor.addBlock()), b('Attach file', 'clip', () => editor && editor.insertFile()), b('Undo', 'undo', () => editor && editor.undo())];
}
function exportPage(anchor, rec, md) {
  const name = (D.val(rec, 'title') || DB.title(rec) || 'Untitled').replace(/[\\/:*?"<>|]/g, '');
  menu(anchor, [
    { label: 'Share', icon: 'export', run: () => navigator.share ? navigator.share({ title: name, text: md() }).catch(() => {}) : navigator.clipboard.writeText(md()).then(() => toast('Copied as text')) },
    { label: 'Save as Markdown', icon: 'pages', run: () => download(name + '.md', md(), 'text/markdown') },
    { label: 'Print or save as PDF', icon: 'export', run: () => window.print() }]);
}
function pageMore(anchor, rec) {
  moreMenu(anchor, { rec, onTrash: async () => { if (await confirmBox('Move this page to Trash? You can restore it from Trash.', 'Move to Trash')) { D.trash(rec.id); go('#/today'); toast('Moved to Trash'); } } });
}

// ---------- task page (database row) ----------
export function renderRow(id, { inPane = false } = {}) {
  const rec = D.live(id);
  if (!rec) return h('div', { class: 'wrap' }, h('p', { class: 'empty' }, 'This task was deleted or has not synced yet.'));
  const dbr = DB.db(D.val(rec, 'db')); if (!dbr) return h('div', { class: 'wrap' }, h('p', { class: 'empty' }, 'Its database is missing.'));
  const ps = DB.props(dbr), tp = DB.titleProp(dbr);
  const pageRec = D.getRec(D.val(dbr, 'page'));
  const title = h('h1', { class: 'tt', contenteditable: 'true', 'aria-label': tp?.name || 'Title', oninput: e => tp && D.update(id, { ['p:' + tp.id]: e.target.textContent }), onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } } }, tp ? DB.raw(rec, tp) || '' : '');
  const dl = h('dl', { class: 'props' }, ps.filter(p => p.type !== 'title' && !(D.val(dbr, 'hiddenOnPage', []) || []).includes(p.id)).map(p => [
    h('dt', {}, icon(DB.TYPE_ICON[p.type] || 'text', 16), h('span', { title: p.name }, p.name)), h('dd', { 'data-p': p.id }, propEditor(rec, p, dbr))]));
  const body = h('div', {});
  const wrap = h('div', { class: 'wrap ' + fontClass(rec) },
    h('p', { class: 'crumb' }, h('a', { href: '#/tracker' }, D.val(pageRec, 'title') || D.val(dbr, 'name') || 'Database'),
      D.val(dbr, 'role') === 'kpi' || dbr === DB.kpiDb() ? h('a', { class: 'pdlink', href: '#/project/' + id }, icon('building', 14), 'Project details') : null),
    title, dl,
    h('button', { class: 'addprop', onclick: () => import('./table.js').then(m => m.editProperties(dbr, () => go(location.hash))) }, icon('plus', 16), 'Add a property'),
    comments(rec), h('hr', { class: 'sep' }), body);
  const refreshFormulas = e => { if (!wrap.isConnected) return document.removeEventListener('folio-row', refreshFormulas); if (e.detail !== id) return;
    for (const p of ps.filter(x => x.type === 'formula')) { const dd = dl.querySelector(`dd[data-p="${p.id}"]`); if (dd) dd.replaceChildren(propEditor(D.getRec(id), p, DB.db(dbr.id))); } };
  document.addEventListener('folio-row', refreshFormulas);
  const ed = mountEditor(body, { blocks: D.val(rec, 'blocks', []), onChange: b => D.update(id, { blocks: b }), onFile: addFile, fileUrl, openFile, openPage: pid => go('#/p/' + pid), pageTitle: pid => D.val(D.getRec(pid), 'title') || 'Untitled', newSubPage: () => newPage(id).id });
  if (!inPane) { editor && editor.destroy(); editor = ed;
    state.ctx = { export: a => exportPage(a, rec, () => rowMd(rec, dbr, ed)), more: a => pageMore(a, rec), tools: toolsFor() }; }
  if (inPane) wrap.prepend(h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '4px', margin: '-8px -8px 0 0' } },
    h('button', { class: 'iconbtn', 'aria-label': 'Open as full page', onclick: () => go('#/r/' + id) }, icon('expand', 18)),
    h('button', { class: 'iconbtn', 'aria-label': 'Close', onclick: () => { state.pane = null; go(location.hash); } }, icon('close', 18))));
  return wrap;
}
function rowMd(rec, dbr, ed) {
  const ps = DB.props(dbr), t = DB.title(rec);
  const lines = ['# ' + t, '', '| Property | Value |', '| --- | --- |', ...ps.filter(p => p.type !== 'title').map(p => `| ${p.name} | ${DB.display(rec, p, now()).replace(/\|/g, '\\|')} |`), ''];
  const cs = D.all('cmt', c => D.val(c, 'parent') === rec.id); if (cs.length) lines.push('## Comments', '', ...cs.map(c => '> ' + D.val(c, 'text', '').replace(/\n/g, '\n> ')), '');
  return lines.join('\n') + '\n' + blocksToMd(ed.blocks());
}

// ---------- property editors ----------
export function propEditor(rec, p, dbr, { compact = false, dfmt } = {}) {
  const key = 'p:' + p.id, v = DB.raw(rec, p), set = val => { D.update(rec.id, { [key]: val }); document.dispatchEvent(new CustomEvent('folio-row', { detail: rec.id })); };
  const refresh = (el) => { const n = propEditor(D.getRec(rec.id), p, DB.db(dbr.id), { compact, dfmt }); el.replaceWith(n); n.querySelector?.('button,input')?.focus(); };
  switch (p.type) {
    case 'text': case 'title': case 'number': case 'url': {
      // tap the value: a Notion-style white edit card opens over it
      const mono = /^ecx/i.test(p.name) && p.type !== 'url'; // ECX numbers in mono; links read as normal text
      const show = val => {
        if (val == null || val === '') return h('span', { class: 'muted emptyv' }, 'Empty');
        if (p.type === 'url') { try { const x = new URL(/^[a-z][a-z0-9+.-]*:/i.test(val) ? val : 'https://' + val); return h('span', { class: 'url' }, h('b', {}, x.hostname), h('i', {}, decodeURIComponent(x.pathname + x.search).replace(/\/$/, ''))); } catch {} } // like Notion: host dark, rest grey
        return String(val);
      };
      if (p.type === 'url') {
        // a link: the blue text opens it; tapping anywhere else in the cell edits it (no globe button)
        const a = h('a', { class: 'ulink', target: '_blank', rel: 'noopener' }), wrap = h('span', { class: 'ulwrap' }, a);
        const btn = h('button', { class: 'val tval uedit', type: 'button' });
        const paint = val => { const has = !(val == null || val === ''); a.hidden = !has; wrap.hidden = !has;
          if (has) { a.href = browserUrl(/^[a-z][a-z0-9+.-]*:/i.test(val) ? val : 'https://' + val); a.setAttribute('aria-label', 'Open ' + p.name + ': ' + val); a.replaceChildren(show(val)); }
          btn.replaceChildren(has ? '' : show(val)); btn.classList.toggle('empty', !has); btn.setAttribute('aria-label', 'Edit ' + p.name + ': ' + (has ? val : 'Empty')); };
        btn.addEventListener('click', () => popEdit(btn, D.getRec(rec.id), p, () => paint(DB.raw(D.getRec(rec.id), p))));
        paint(v);
        return h('span', { class: 'urlrow ulinkrow' }, btn, wrap);
      }
      const btn = h('button', { class: 'val tval' + (v == null || v === '' ? ' empty' : ''), type: 'button', 'aria-label': p.name + ': ' + (v ?? 'Empty'), style: mono ? { fontFamily: 'var(--mono)' } : null,
        onclick: () => popEdit(btn, D.getRec(rec.id), p, () => { const nv = DB.raw(D.getRec(rec.id), p); btn.replaceChildren(show(nv)); btn.classList.toggle('empty', nv == null || nv === ''); }) }, show(v));
      return btn;
    }
    case 'checkbox': return h('input', { type: 'checkbox', checked: v ? true : null, 'aria-label': p.name, style: { width: '18px', height: '18px', margin: '4px', accentColor: 'var(--blue)' }, onchange: e => set(e.target.checked) });
    case 'select': case 'status': {
      const btn = h('button', { class: 'val' + (v ? '' : ' empty'), 'aria-label': p.name + ': ' + (v || 'Empty'), onclick: () => {
        const opts = (DB.props(DB.db(dbr.id)).find(x => x.id === p.id).options || []);
        menu(btn, [...opts.map(o => ({ label: o.name, checked: o.name === v, run: () => { set(o.name); refresh(btn); } })), '-',
          { label: 'New option…', icon: 'plus', run: async () => { const n = await promptBox('New option'); if (n && n.trim()) { DB.addOption(DB.db(dbr.id), p, n.trim()); set(n.trim()); refresh(btn); } } },
          ...(v ? [{ label: 'Clear', icon: 'close', run: () => { set(null); refresh(btn); } }] : [])]);
      } }, v ? chip(p, v) : 'Empty');
      return btn;
    }
    case 'multi': {
      const vals = Array.isArray(v) ? v : [];
      const btn = h('button', { class: 'val' + (vals.length ? '' : ' empty'), 'aria-label': p.name, onclick: () => {
        const opts = (DB.props(DB.db(dbr.id)).find(x => x.id === p.id).options || []);
        // Project Category takes one choice only: picking one replaces the other (Overview, Tasks and Connection Charge follow it)
        const one = DB.SINGLE_CHOICE.includes(p.name), cat = p.name === 'Project Category';
        // Project Category: UOS and TOS are SAL100KW sub-categories (chosen on the project), so they are not listed here
        const salFam = x => ['SAL100KW', 'Upgrading of Supply', 'Temporary Supply'].includes(x);
        // (old labels brought over from Notion, e.g. New Application / Resubmission / NEM, are not offered unless the project still has one)
        const shownOpts = cat ? opts.filter(o => !['Upgrading of Supply', 'Temporary Supply'].includes(o.name) && (DB.CATEGORIES.includes(o.name) || vals.includes(o.name))) : opts;
        menu(btn, [...shownOpts.map(o => ({ label: o.name, checked: vals.includes(o.name) || (cat && o.name === 'SAL100KW' && vals.some(salFam)), run: () => { if (cat && o.name === 'SAL100KW' && vals.some(salFam)) return; set(one ? (vals.length === 1 && vals[0] === o.name ? vals : [o.name]) : vals.includes(o.name) ? vals.filter(x => x !== o.name) : [...vals, o.name]); refresh(btn); } })), '-',
          { label: 'New option…', icon: 'plus', run: async () => { const n = await promptBox('New option'); if (n && n.trim()) { DB.addOption(DB.db(dbr.id), p, n.trim()); set(one ? [n.trim()] : [...vals, n.trim()]); refresh(btn); } } }]);
      } }, vals.length ? vals.map(x => chip(p, x)) : 'Empty');
      return btn;
    }
    case 'date': {
      const btn = h('button', { class: 'val' + (v ? '' : ' empty'), 'aria-label': p.name + ': ' + (v ? formatDate(v) : 'Empty'), onclick: () => {
        const inp = h('input', { type: 'date', class: 'field', value: toISODate(v) || '' });
        const s = sheet(p.name, h('div', {}, inp, h('button', { class: 'btn block', onclick: () => { inp.value = toISODate(new Date(now())); } }, 'Today'),
          h('button', { class: 'btn block danger', onclick: () => { inp.value = ''; s.close(); } }, 'Clear')), { float: true, onDone: () => { set(inp.value || null); refresh(btn); } });
      } }, v ? formatDate(v, dfmt || 'DD/MM/YYYY') : 'Empty');
      return btn;
    }
    case 'files': {
      const list = Array.isArray(v) ? v : [];
      return h('span', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' } }, list.map((f, i) => h('span', { class: 'fchip' }, h('button', { class: 'tag', style: { background: 'var(--bg2)', border: 0 }, onclick: () => openFile(f) }, icon('clip', 12), ' ', f.name),
        // remove a file uploaded by mistake (asks first)
        h('button', { class: 'fdel', type: 'button', 'aria-label': 'Remove ' + f.name, title: 'Remove file', onclick: async e => { e.stopPropagation(); const host = e.currentTarget.closest('.fchip').parentElement;
          if (!await confirmBox(`Remove "${f.name}" from ${p.name}?`, 'Remove')) return;
          const cur = D.val(D.getRec(rec.id) || rec, 'p:' + p.id), arr = Array.isArray(cur) ? cur.slice() : [];
          const k = arr.findIndex(x => x === f || (x && f && x.id && x.id === f.id)); arr.splice(k >= 0 ? k : i, 1); set(arr.length ? arr : null); toast('Removed ' + f.name); if (host && host.isConnected) refresh(host); } }, icon('close', 12)))),
        h('button', { class: 'iconbtn', 'aria-label': 'Add file', onclick: e => { const host = e.currentTarget.parentElement; pickFile(async f => { const ref = await addFile(f); const cur = D.val(D.getRec(rec.id) || rec, 'p:' + p.id); set([...(Array.isArray(cur) ? cur : []), ref]); toast('Added ' + f.name); if (host && host.isConnected) refresh(host); }); } }, icon('plus', 16)));
    }
    case 'formula': {
      const txt = DB.display(rec, p, now());
      const c = /OVERDUE|REJECTED/.test(txt) ? 'var(--red)' : /COMPLETED/.test(txt) ? '#448361' : /🟠/.test(txt) ? 'var(--orange)' : 'inherit';
      return h('span', { class: 'val fxv', style: { fontWeight: /[🔴🚨🟠✅❌🔵]/u.test(txt) ? 600 : 400, color: c } }, txt || h('span', { class: 'muted emptyv' }, 'Empty'));
    }
    case 'created': return h('span', { class: 'val' }, formatDate(D.val(rec, 'created', 0)));
  }
  return h('span', {}, String(v ?? ''));
}
export function chip(p, name) {
  const [bg, dot] = DB.optColor(p, name);
  return p.type === 'status' ? h('span', { class: 'pill', style: { background: bg } }, h('i', { style: { background: dot } }), name) : h('span', { class: 'tag', style: { background: bg } }, name);
}

// ---------- comments ----------
function comments(rec) {
  const box = h('section', { class: 'comments', 'aria-label': 'Comments' });
  const draw = () => {
    const list = D.all('cmt', c => D.val(c, 'parent') === rec.id).sort((a, b) => D.val(a, 'created', 0) - D.val(b, 'created', 0));
    const ta = textbox({ cls: 'cbox', multiline: true, placeholder: 'Add a comment…', label: 'Add a comment',
      onkeydown: e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } } });
    const send = () => { const t = ta.value.trim(); if (!t) return; D.create('cmt', rec.sh, { parent: rec.id, text: t, created: Date.now(), author: 'You' }); draw(); };
    box.replaceChildren(...list.map(c => {
      const txt = h('div', { class: 'txt' }, D.val(c, 'text', ''));
      const edited = D.val(c, 'edited');
      return h('article', { class: 'cmt' }, h('div', { class: 'av', 'aria-hidden': 'true' }, (D.val(c, 'author', 'You')[0] || 'Y').toUpperCase()),
        h('div', {}, h('div', { class: 'who' }, h('b', {}, D.val(c, 'author', 'You')), h('small', {}, formatDate(D.val(c, 'created', 0), 'D MMM') + (edited ? ' (edited)' : ''))), txt,
          h('div', { class: 'acts' },
            h('button', { onclick: () => { txt.contentEditable = 'true'; txt.focus(); txt.onblur = () => { txt.contentEditable = 'false'; const nt = txt.innerText.trim(); if (nt && nt !== D.val(c, 'text')) D.update(c.id, { text: nt, edited: Date.now() }); draw(); }; } }, 'Edit'),
            h('button', { onclick: async () => { if (await confirmBox('Delete this comment?')) { D.trash(c.id); draw(); } } }, 'Delete'))));
    }), h('div', { class: 'newc' }, h('div', { class: 'av', 'aria-hidden': 'true' }, 'Y'), ta, h('button', { class: 'link', style: { fontSize: '15px' }, onclick: send }, 'Send')));
  };
  draw(); return box;
}
