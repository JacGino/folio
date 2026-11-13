// Folio v2 — pages and task pages: cover, photo, title, properties, comments, block body.
import * as D from './data.js';
import * as DB from './db.js';
import * as Sync from './sync.js';
import { h, icon, toast, menu, sheet, group, row, confirmBox, promptBox, esc } from './ui.js';
import { mountEditor, blocksToMd, nb } from './editor.js';
import { formatDate, toISODate, parseDate } from './dates.js';
import { state, go, renderNav, download, layoutMode, browserUrl, now } from './app.js';
import { renderDbBlock } from './table.js';

let editor = null; // only one main editor at a time
const urls = new Map();
export async function fileUrl(id) {
  if (!id) return null; if (urls.has(id)) return urls.get(id);
  const b = await Sync.fileBytes(id); if (!b) return null;
  const u = URL.createObjectURL(new Blob([b.bytes], { type: b.type || guessType(b.name) })); urls.set(id, u); return u;
}
const guessType = n => /\.pdf$/i.test(n || '') ? 'application/pdf' : /\.(png)$/i.test(n || '') ? 'image/png' : /\.(jpe?g)$/i.test(n || '') ? 'image/jpeg' : '';
export async function openFile(f) { const u = await fileUrl(f.id); if (u) window.open(u, '_blank'); else toast(f.err || 'This file is not on this device yet. Connect GitHub and unlock your files in Settings.'); }
async function addFile(file) {
  try { const ref = await Sync.addFile(null, file); Sync.soon(); warnSize(); return ref; }
  catch (e) { toast(e.message, 4000); throw e; }
}
async function warnSize() { const n = await Sync.totalBlobBytes(); if (n > 950 * 1048576) toast(`Attachments use ${(n / 1073741824).toFixed(2)} GB. GitHub works best under 1 GB.`, 5000); }

export function newPage(parent = null) { return D.create('page', 'ws', { title: '', parent, blocks: [nb()], created: Date.now(), edited: Date.now(), order: Date.now() }); }
const fontClass = r => 'font-' + (D.val(r, 'font', 'default'));

// ---------- cover + photo ----------
function coverAndPhoto(rec) {
  const cover = D.val(rec, 'cover'), photo = D.val(rec, 'icon');
  const pick = (field) => { const inp = h('input', { type: 'file', accept: 'image/*' }); inp.onchange = async () => { const f = inp.files[0]; if (!f) return; const ref = await addFile(f); D.update(rec.id, { [field]: ref }); go(location.hash); }; inp.click(); };
  const out = [];
  if (cover) {
    const c = h('div', { class: 'cover', role: 'img', 'aria-label': 'Cover photo' }, h('button', { class: 'chg', onclick: () => menu(c.querySelector('.chg'), [{ label: 'Change cover', icon: 'paint', run: () => pick('cover') }, { label: 'Remove cover', icon: 'trash', danger: true, run: () => { D.update(rec.id, { cover: null }); go(location.hash); } }]) }, 'Change cover'));
    fileUrl(cover.id).then(u => { if (u) c.style.backgroundImage = `url("${u}")`; }); out.push(c);
  }
  const av = h('button', { class: 'avatar', 'aria-label': photo ? 'Change profile photo' : 'Add profile photo', onclick: () => menu(av, [
    { label: photo ? 'Change photo' : 'Add photo', icon: 'person', run: () => pick('icon') }, ...(photo ? [{ label: 'Remove photo', icon: 'trash', danger: true, run: () => { D.update(rec.id, { icon: null }); go(location.hash); } }] : []),
    ...(!cover ? [{ label: 'Add cover', icon: 'paint', run: () => pick('cover') }] : [])]) }, photo ? null : icon('person', 34));
  if (photo) fileUrl(photo.id).then(u => { if (u) av.style.backgroundImage = `url("${u}")`; });
  return { out, av, hasPhotoUi: !!(cover || photo) };
}

// ---------- standalone page (also the Planning KPI Tracker page) ----------
export function renderPage(id, { view } = {}) {
  const rec = D.live(id);
  if (!rec) return h('div', { class: 'wrap' }, h('p', { class: 'empty' }, 'This page was deleted or has not synced yet.'));
  const { out, av, hasPhotoUi } = coverAndPhoto(rec);
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
  const f = D.val(rec, 'font', 'default');
  menu(anchor, [
    { label: 'Font: Default', icon: 'text', checked: f === 'default', run: () => { D.update(rec.id, { font: 'default' }); go(location.hash); } },
    { label: 'Font: Serif', icon: 'text', checked: f === 'serif', run: () => { D.update(rec.id, { font: 'serif' }); go(location.hash); } },
    { label: 'Font: Mono', icon: 'text', checked: f === 'mono', run: () => { D.update(rec.id, { font: 'mono' }); go(location.hash); } }, '-',
    { label: 'Copy link', icon: 'link', run: () => navigator.clipboard.writeText(location.href.split('#')[0] + '#/' + (rec.k === 'row' ? 'r/' : 'p/') + rec.id).then(() => toast('Link copied')) },
    { label: 'Move to Trash', icon: 'trash', danger: true, run: async () => { if (await confirmBox('Move this page to Trash? You can restore it from Trash.', 'Move to Trash')) { D.trash(rec.id); go('#/today'); toast('Moved to Trash'); } } }]);
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
    h('p', { class: 'crumb' }, h('a', { href: '#/tracker' }, D.val(pageRec, 'title') || D.val(dbr, 'name') || 'Database')),
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
export function propEditor(rec, p, dbr, { compact = false } = {}) {
  const key = 'p:' + p.id, v = DB.raw(rec, p), set = val => { D.update(rec.id, { [key]: val }); document.dispatchEvent(new CustomEvent('folio-row', { detail: rec.id })); };
  const refresh = (el) => { const n = propEditor(D.getRec(rec.id), p, DB.db(dbr.id), { compact }); el.replaceWith(n); n.querySelector?.('button,input')?.focus(); };
  switch (p.type) {
    case 'text': case 'title': case 'number': {
      const inp = h('input', { class: 'val', value: v ?? '', inputmode: p.type === 'number' ? 'decimal' : null, placeholder: 'Empty', 'aria-label': p.name,
        onchange: e => set(p.type === 'number' ? (e.target.value === '' ? null : +e.target.value) : e.target.value), onkeydown: e => { if (e.key === 'Enter') e.target.blur(); } });
      if (p.name === 'ECX & WBS NO' || /^ecx/i.test(p.name)) inp.style.fontFamily = 'var(--mono)';
      return inp;
    }
    case 'url': {
      const inp = h('input', { class: 'val', value: v ?? '', type: 'url', placeholder: 'Empty', 'aria-label': p.name, onchange: e => set(e.target.value.trim()), onkeydown: e => { if (e.key === 'Enter') e.target.blur(); } });
      return h('span', { style: { display: 'flex', width: '100%', alignItems: 'center', gap: '4px' } }, inp, v ? h('a', { class: 'iconbtn', href: browserUrl(v), target: '_blank', rel: 'noopener', 'aria-label': 'Open link' }, icon('globe', 16)) : null);
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
        menu(btn, [...opts.map(o => ({ label: o.name, checked: vals.includes(o.name), run: () => { set(vals.includes(o.name) ? vals.filter(x => x !== o.name) : [...vals, o.name]); refresh(btn); } })), '-',
          { label: 'New option…', icon: 'plus', run: async () => { const n = await promptBox('New option'); if (n && n.trim()) { DB.addOption(DB.db(dbr.id), p, n.trim()); set([...vals, n.trim()]); refresh(btn); } } }]);
      } }, vals.length ? vals.map(x => chip(p, x)) : 'Empty');
      return btn;
    }
    case 'date': {
      const btn = h('button', { class: 'val' + (v ? '' : ' empty'), 'aria-label': p.name + ': ' + (v ? formatDate(v) : 'Empty'), onclick: () => {
        const inp = h('input', { type: 'date', class: 'field', value: toISODate(v) || '' });
        const s = sheet(p.name, h('div', {}, inp, h('button', { class: 'btn block', onclick: () => { inp.value = toISODate(new Date(now())); } }, 'Today'),
          h('button', { class: 'btn block danger', onclick: () => { inp.value = ''; s.close(); } }, 'Clear')), { onDone: () => { set(inp.value || null); refresh(btn); } });
      } }, v ? formatDate(v) : 'Empty');
      return btn;
    }
    case 'files': {
      const list = Array.isArray(v) ? v : [];
      return h('span', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' } }, list.map(f => h('button', { class: 'tag', style: { background: 'var(--bg2)', border: 0 }, onclick: () => openFile(f) }, icon('clip', 12), ' ', f.name)),
        h('button', { class: 'iconbtn', 'aria-label': 'Add file', onclick: e => { const inp = h('input', { type: 'file' }); inp.onchange = async () => { const f = inp.files[0]; if (!f) return; const ref = await addFile(f); set([...list, ref]); refresh(e.target.closest('span')); }; inp.click(); } }, icon('plus', 16)));
    }
    case 'formula': {
      const txt = DB.display(rec, p, now());
      const c = /OVERDUE|REJECTED/.test(txt) ? 'var(--red)' : /COMPLETED/.test(txt) ? '#448361' : /🟠/.test(txt) ? 'var(--orange)' : 'inherit';
      return h('span', { class: 'val', style: { fontWeight: /[🔴🚨🟠✅❌🔵]/u.test(txt) ? 600 : 400, color: c } }, txt || h('span', { class: 'muted' }, 'Empty'));
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
    const ta = h('textarea', { placeholder: 'Add a comment…', 'aria-label': 'Add a comment', rows: 1, oninput: e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; },
      onkeydown: e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); } });
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
