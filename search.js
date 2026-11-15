// Folio v2 — search across pages, tasks (every property), comments and page text.
import * as D from './data.js';
import * as DB from './db.js';
import { h, icon, logo, strip, textbox } from './ui.js';
import { state, openTask, now, elabel } from './app.js';

let last = '';
export function presetSearch(q) { last = String(q || ''); }
export function renderSearch() {
  state.ctx = {};
  const res = h('div', { role: 'list' });
  const inp = textbox({ cls: 'field searchbox', value: last, placeholder: 'Search customer, project no, address, notes…', label: 'Search everything', style: { marginTop: '20px' },
    oninput: e => { last = inp.value; clearTimeout(inp._t); inp._t = setTimeout(run, 120); }, onkeydown: e => { if (e.key === 'Enter') inp.blur(); } });
  function run() {
    const q = last.trim().toLowerCase(); if (!q) { res.replaceChildren(); return; }
    const t0 = performance.now(); const hits = [];
    for (const d of DB.dbs()) { const ps = DB.props(d);
      for (const r of DB.rows(d.id)) {
        let where = ps.find(p => DB.display(r, p, now()).toLowerCase().includes(q));
        let snippet = where ? `${where.name}: ${DB.display(r, where, now())}` : '';
        if (!where) { const txt = (D.val(r, 'blocks', []) || []).map(b => strip(b.x || '')).join(' '); if (txt.toLowerCase().includes(q)) snippet = clip(txt, q); }
        if (!snippet) { const c = D.all('cmt', c => D.val(c, 'parent') === r.id).map(c => D.val(c, 'text', '')).join(' '); if (c.toLowerCase().includes(q)) snippet = 'Comment: ' + clip(c, q); }
        if (snippet) hits.push({ kind: 'task', id: r.id, title: DB.title(r), snippet });
        if (hits.length > 200) break;
      } }
    for (const p of D.all('page')) { const t = D.val(p, 'title', ''); const txt = (D.val(p, 'blocks', []) || []).map(b => strip(b.x || '')).join(' ');
      if (t.toLowerCase().includes(q) || txt.toLowerCase().includes(q)) hits.push({ kind: 'page', id: p.id, title: t || 'Untitled', snippet: txt.toLowerCase().includes(q) ? clip(txt, q) : '' }); }
    res.replaceChildren(h('p', { class: 'muted', role: 'status' }, `${hits.length} result${hits.length === 1 ? '' : 's'} (${Math.round(performance.now() - t0)} ms)`),
      h('div', { class: 'group' }, hits.slice(0, 200).map(x => h(x.kind === 'page' ? 'a' : 'button', { class: 'grow', role: 'listitem', href: x.kind === 'page' ? '#/p/' + x.id : null, onclick: x.kind === 'task' ? () => openTask(x.id) : null },
        icon(x.kind === 'page' ? 'pages' : 'table', 18), h('span', { class: 'gl' }, h('div', {}, x.title), x.snippet ? h('small', { class: 'muted', style: { display: 'block', fontSize: '13px' } }, x.snippet) : null)))));
  }
  const clip = (t, q) => { const i = t.toLowerCase().indexOf(q); return (i > 30 ? '…' : '') + t.slice(Math.max(0, i - 30), i + q.length + 50) + '…'; };
  setTimeout(() => { inp.focus(); if (last) run(); }, 30);
  return h('div', { class: 'wrap' }, h('div', { class: 'head' }, logo(40), h('div', {}, elabel('title.search', 'Search', 'h1'))), inp, res);
}
