// Folio v2 — block editor (Notion-style). Blocks: { id, t, x (safe HTML), c, in (indent), open, file, page, db, emo }
import { h, icon, sanitize, strip, menu, closeMenus, esc } from './ui.js';
import { uid } from './model.js';

export const BLOCKS = [
  ['p', 'Text', 'Just start writing', 'text'], ['h1', 'Heading 1', 'Big section heading', 'title'], ['h2', 'Heading 2', 'Medium heading', 'title'], ['h3', 'Heading 3', 'Small heading', 'title'],
  ['todo', 'To-do list', 'Track tasks with a checkbox', 'checkbox'], ['bullet', 'Bulleted list', 'A simple list', 'list'], ['num', 'Numbered list', 'A list with numbers', 'number'],
  ['toggle', 'Toggle list', 'Hide content inside', 'chevr'], ['quote', 'Quote', 'Capture a quote', 'text'], ['callout', 'Callout', 'Make text stand out', 'paint'],
  ['divider', 'Divider', 'Separate sections', 'filter'], ['code', 'Code', 'Monospace text', 'formula'], ['file', 'File or image', 'Upload a PDF, photo or file', 'clip'],
  ['pagelink', 'Page', 'A sub-page inside this page', 'pages']];
const TEXTUAL = new Set(['p', 'h1', 'h2', 'h3', 'todo', 'bullet', 'num', 'toggle', 'quote', 'callout', 'code']);
const LISTS = new Set(['todo', 'bullet', 'num']);
export const nb = (t = 'p', x = '', extra = {}) => ({ id: uid('b'), t, x, ...extra });

export function mountEditor(root, opts) {
  let blocks = (opts.blocks && opts.blocks.length ? opts.blocks : [nb()]).map(b => ({ ...b }));
  const undo = [], redo = []; let typingSnap = null, typingTimer = null;
  const snap = () => JSON.stringify(blocks);
  const commit = () => { opts.onChange(blocks.map(b => ({ ...b }))); };
  function checkpoint() { undo.push(snap()); if (undo.length > 100) undo.shift(); redo.length = 0; }
  function typing() { if (!typingSnap) { typingSnap = snap(); } clearTimeout(typingTimer); typingTimer = setTimeout(() => { if (typingSnap && typingSnap !== snap()) { undo.push(typingSnap); redo.length = 0; } typingSnap = null; }, 1000); }
  function doUndo() { flushTyping(); if (!undo.length) return; redo.push(snap()); blocks = JSON.parse(undo.pop()); draw(); commit(); }
  function doRedo() { if (!redo.length) return; undo.push(snap()); blocks = JSON.parse(redo.pop()); draw(); commit(); }
  function flushTyping() { if (typingSnap) { clearTimeout(typingTimer); if (typingSnap !== snap()) { undo.push(typingSnap); redo.length = 0; } typingSnap = null; } }

  const doc = h('div', { class: 'doc', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Page content' });
  root.replaceChildren(doc);

  function hiddenByToggle(i) {
    const lvl = blocks[i].in || 0; if (!lvl) return false;
    for (let j = i - 1; j >= 0; j--) { const b = blocks[j]; if ((b.in || 0) < lvl) return (b.t === 'toggle' && !b.open) || hiddenByToggle(j); }
    return false;
  }
  function numberOf(i) { let n = 1; for (let j = i - 1; j >= 0 && blocks[j].t === 'num' && (blocks[j].in || 0) === (blocks[i].in || 0); j--) n++; return n; }

  function draw(focusId, caret = 'end') {
    doc.replaceChildren(...blocks.map((b, i) => hiddenByToggle(i) ? null : blockEl(b, i)).filter(Boolean));
    doc.classList.toggle('single', blocks.length === 1);
    if (focusId) focusBlock(focusId, caret);
  }
  function blockEl(b, i) {
    const el = h('div', { class: 'blk ' + b.t + (b.c ? ' done' : '') + (b.open ? ' open' : '') + (blocks.length === 1 ? ' only' : ''), 'data-id': b.id, style: { marginLeft: (b.in || 0) * 28 + 'px' } });
    const hdl = h('button', { class: 'hdl', 'aria-label': 'Block options', draggable: 'true', onclick: e => blockMenu(b, e.currentTarget) }, icon('drag', 16));
    hdl.addEventListener('dragstart', e => { e.dataTransfer.setData('text/folio-block', b.id); e.dataTransfer.effectAllowed = 'move'; });
    el.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('text/folio-block')) e.preventDefault(); });
    el.addEventListener('drop', e => { const id = e.dataTransfer.getData('text/folio-block'); if (!id || id === b.id) return; e.preventDefault(); checkpoint(); const from = blocks.findIndex(x => x.id === id); const [m] = blocks.splice(from, 1); const to = blocks.findIndex(x => x.id === b.id); blocks.splice(to + (e.offsetY > el.offsetHeight / 2 ? 1 : 0), 0, m); draw(); commit(); });
    el.append(hdl);
    if (b.t === 'divider') { el.append(h('hr')); return el; }
    if (b.t === 'file') { el.append(fileCard(b)); return el; }
    if (b.t === 'pagelink') { el.append(h('button', { class: 'pagelink', onclick: () => opts.openPage && opts.openPage(b.page) }, icon('pages', 18), opts.pageTitle ? opts.pageTitle(b.page) : 'Page')); return el; }
    if (b.t === 'db') { el.append(opts.renderDb ? opts.renderDb(b.db) : h('div')); return el; }
    if (b.t === 'todo') el.append(h('input', { type: 'checkbox', 'aria-label': 'Done', checked: b.c ? true : null, onchange: e => { checkpoint(); b.c = e.target.checked; el.classList.toggle('done', b.c); commit(); } }));
    if (b.t === 'bullet') el.append(h('span', { class: 'mk', 'aria-hidden': 'true' }, '•'));
    if (b.t === 'num') el.append(h('span', { class: 'mk', 'aria-hidden': 'true' }, numberOf(i) + '.'));
    if (b.t === 'toggle') el.append(h('button', { class: 'tg', 'aria-label': b.open ? 'Collapse' : 'Expand', 'aria-expanded': b.open ? 'true' : 'false', onclick: () => { b.open = !b.open; draw(); commit(); } }, icon('chevr', 14)));
    if (b.t === 'callout') el.append(h('button', { class: 'emo', 'aria-label': 'Callout icon', onclick: async () => { const v = prompt('Icon (emoji)', b.emo || '💡'); if (v != null) { b.emo = v.trim() || '💡'; draw(); commit(); } } }, b.emo || '💡'));
    const ce = h('div', { class: 'ce', contenteditable: opts.readOnly ? 'false' : 'true', 'data-ph': i === 0 && blocks.length === 1 ? "Type '/' for blocks" : b.t.startsWith('h') ? 'Heading' : b.t === 'todo' ? 'To-do' : b.t === 'p' ? "Type '/' for blocks" : '', spellcheck: 'true' });
    ce.innerHTML = b.t === 'code' ? esc(strip(b.x)) : sanitize(b.x);
    ce.addEventListener('input', () => onInput(b, ce));
    ce.addEventListener('keydown', e => onKey(e, b, ce));
    ce.addEventListener('paste', e => onPaste(e, b, ce));
    ce.addEventListener('click', e => { const a = e.target.closest('a'); if (a && (e.metaKey || e.ctrlKey || !ce.isContentEditable || document.activeElement !== ce)) { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); } });
    el.append(ce);
    return el;
  }
  function fileCard(b) {
    const f = b.file || {}; const ext = (f.name || '').split('.').pop().slice(0, 4).toUpperCase();
    if (f.type && f.type.startsWith('image/')) {
      const img = h('img', { class: 'media', alt: f.name || 'Image' });
      opts.fileUrl && opts.fileUrl(f.id).then(u => { if (u) img.src = u; });
      return h('button', { class: 'file', style: { display: 'block', padding: '0', border: '0' }, onclick: () => opts.openFile && opts.openFile(f) }, img);
    }
    return h('button', { class: 'file', onclick: () => opts.openFile && opts.openFile(f) },
      h('span', { class: 'ft', 'aria-hidden': 'true' }, ext || 'FILE'),
      h('span', {}, f.name || 'File', h('small', {}, f.size ? (f.size / 1048576).toFixed(1) + ' MB, encrypted' : (f.err || 'Uploading…'))), '');
  }

  // ---- caret helpers ----
  function focusBlock(id, where = 'end') {
    const ce = doc.querySelector(`.blk[data-id="${id}"] .ce`); if (!ce) return; ce.focus();
    const sel = getSelection(), r = document.createRange();
    if (typeof where === 'number') { setOffset(ce, where); return; }
    r.selectNodeContents(ce); r.collapse(where === 'start'); sel.removeAllRanges(); sel.addRange(r);
  }
  function caretOffset(ce) { const s = getSelection(); if (!s.rangeCount) return 0; const r = s.getRangeAt(0).cloneRange(); r.selectNodeContents(ce); r.setEnd(s.getRangeAt(0).startContainer, s.getRangeAt(0).startOffset); return r.toString().length; }
  function setOffset(ce, n) {
    const w = document.createTreeWalker(ce, NodeFilter.SHOW_TEXT); let node, left = n;
    while ((node = w.nextNode())) { if (left <= node.length) { const r = document.createRange(); r.setStart(node, left); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return; } left -= node.length; }
    focusBlock(ce.closest('.blk').dataset.id, 'end');
  }
  const atStart = ce => caretOffset(ce) === 0 && getSelection().isCollapsed;
  const atEnd = ce => caretOffset(ce) >= ce.textContent.length;

  // ---- input & shortcuts ----
  const MD = [[/^#\s$/, 'h1'], [/^##\s$/, 'h2'], [/^###\s$/, 'h3'], [/^[-*+]\s$/, 'bullet'], [/^1[.)]\s$/, 'num'], [/^\[\s?\]\s$/, 'todo'], [/^>\s$/, 'quote'], [/^```$/, 'code'], [/^---$/, 'divider']];
  function onInput(b, ce) {
    typing();
    const txt = ce.textContent;
    if (b.t === 'p' || b.t === 'bullet') for (const [re, t] of MD) if (re.test(txt)) { flushTyping(); checkpoint(); b.t = t; b.x = ''; if (t === 'divider') { const n = nb(); blocks.splice(blocks.indexOf(b) + 1, 0, n); draw(n.id); } else draw(b.id); commit(); return; }
    b.x = b.t === 'code' ? esc(ce.innerText) : sanitize(ce.innerHTML);
    if (txt.endsWith('/') && (txt.length === 1 || /\s\/$/.test(txt))) slash(b, ce);
    commit();
  }
  function onKey(e, b, ce) {
    const i = blocks.indexOf(b), mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); return; }
    if (mod && ['b', 'i', 'u'].includes(e.key.toLowerCase())) { e.preventDefault(); document.execCommand({ b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase()]); onInput(b, ce); return; }
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); addLink(b, ce); return; }
    if (e.key === 'Enter' && !e.shiftKey && b.t !== 'code') {
      e.preventDefault(); flushTyping(); checkpoint();
      if (LISTS.has(b.t) && !ce.textContent.trim()) { b.t = 'p'; draw(b.id); commit(); return; }
      const s = getSelection(); const r = s.getRangeAt(0); const tail = document.createRange(); tail.setStart(r.endContainer, r.endOffset); tail.setEnd(ce, ce.childNodes.length);
      r.deleteContents(); const frag = tail.extractContents(); const tmp = h('div'); tmp.append(frag);
      b.x = sanitize(ce.innerHTML);
      const t = LISTS.has(b.t) || b.t === 'toggle' && b.open ? (b.t === 'toggle' ? 'p' : b.t) : 'p';
      const n = nb(t, sanitize(tmp.innerHTML), { in: (b.t === 'toggle' && b.open) ? (b.in || 0) + 1 : (b.in || 0) });
      blocks.splice(i + 1, 0, n); draw(n.id, 'start'); commit(); return;
    }
    if (e.key === 'Backspace' && atStart(ce)) {
      if (b.in) { e.preventDefault(); checkpoint(); b.in--; draw(b.id, 'start'); commit(); return; }
      if (b.t !== 'p') { e.preventDefault(); checkpoint(); b.t = 'p'; draw(b.id, 'start'); commit(); return; }
      if (i > 0) {
        e.preventDefault(); flushTyping(); checkpoint();
        let j = i - 1; while (j >= 0 && hiddenByToggle(j)) j--;
        const prev = blocks[j];
        if (!TEXTUAL.has(prev.t)) { blocks.splice(j, 1); draw(b.id, 'start'); commit(); return; }
        const pos = strip(prev.x).length; prev.x = sanitize(prev.x + b.x); blocks.splice(i, 1); draw(prev.id); focusBlock(prev.id, pos); commit(); return;
      }
    }
    if (e.key === 'Tab') { e.preventDefault(); checkpoint(); b.in = Math.max(0, Math.min(6, (b.in || 0) + (e.shiftKey ? -1 : 1))); draw(b.id, caretOffset(ce)); commit(); return; }
    if (e.key === 'ArrowUp' && atStart(ce) && i > 0) { e.preventDefault(); move(i, -1, 'end'); }
    if (e.key === 'ArrowDown' && atEnd(ce) && i < blocks.length - 1) { e.preventDefault(); move(i, 1, 'start'); }
  }
  function move(i, d, where) { let j = i + d; while (blocks[j] && (!TEXTUAL.has(blocks[j].t) || hiddenByToggle(j))) j += d; if (blocks[j]) focusBlock(blocks[j].id, where); }
  function onPaste(e, b, ce) {
    const text = e.clipboardData.getData('text/plain'); if (!text) return;
    e.preventDefault(); flushTyping(); checkpoint();
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    if (lines.length === 1 || b.t === 'code') { document.execCommand('insertText', false, text); onInput(b, ce); return; }
    document.execCommand('insertText', false, lines[0]); b.x = sanitize(ce.innerHTML);
    const i = blocks.indexOf(b); const add = lines.slice(1).map(l => nb('p', esc(l), { in: b.in || 0 }));
    blocks.splice(i + 1, 0, ...add); draw(add.at(-1).id); commit();
  }
  function addLink(b, ce) {
    const url = prompt('Link address (https://…)'); if (!url) return;
    const u = /^https?:|^mailto:/i.test(url) ? url : 'https://' + url;
    if (getSelection().isCollapsed) document.execCommand('insertHTML', false, `<a href="${esc(u)}">${esc(u)}</a>`); else document.execCommand('createLink', false, u);
    onInput(b, ce);
  }

  // ---- slash menu ----
  function slash(b, ce) {
    const r = getSelection().getRangeAt(0).getBoundingClientRect();
    const anchor = { getBoundingClientRect: () => r.width || r.height ? r : ce.getBoundingClientRect() };
    let q = '';
    const pick = t => { closeMenus(); ce.removeEventListener('keydown', keys, true); ce.removeEventListener('input', filt);
      flushTyping(); checkpoint(); b.x = sanitize(ce.innerHTML.replace(/\/[^/]*$/, '')); applyType(b, t); };
    const build = () => {
      const list = BLOCKS.filter(([, name]) => name.toLowerCase().includes(q.toLowerCase()));
      const m = menu(anchor, list.map(([t, name, , ic]) => ({ label: name, icon: ic, run: () => pick(t) })), { width: 260 });
      m.classList.add('slash'); ce.focus(); setOffset(ce, ce.textContent.length); return list;
    };
    let list = build();
    function filt() { const m = ce.textContent.match(/\/([^/]*)$/); if (!m) { closeMenus(); cleanup(); return; } q = m[1]; list = build(); if (!list.length) { closeMenus(); cleanup(); } }
    function keys(e) { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (list[0]) pick(list[0][0]); } if (e.key === 'Escape') { closeMenus(); cleanup(); } }
    function cleanup() { ce.removeEventListener('keydown', keys, true); ce.removeEventListener('input', filt); }
    ce.addEventListener('keydown', keys, true); ce.addEventListener('input', filt);
  }
  async function applyType(b, t) {
    const i = blocks.indexOf(b);
    if (t === 'file') {
      const inp = h('input', { type: 'file', accept: '*/*' }); inp.onchange = async () => {
        const f = inp.files[0]; if (!f) return;
        const nbk = nb('file', '', { file: { name: f.name, size: f.size, type: f.type } }); blocks.splice(i + 1, 0, nbk);
        if (!strip(b.x).trim() && b.t === 'p') blocks.splice(i, 1);
        draw(); try { nbk.file = await opts.onFile(f); } catch (e) { nbk.file = { name: f.name, err: e.message }; } draw(); commit();
      }; inp.click(); return;
    }
    if (t === 'pagelink') { const id = opts.newSubPage ? opts.newSubPage() : null; if (id) { const n = nb('pagelink', '', { page: id }); blocks.splice(i + 1, 0, n); if (!strip(b.x).trim()) blocks.splice(i, 1); draw(); commit(); opts.openPage(id); } return; }
    if (t === 'divider') { const n = nb('divider'); blocks.splice(i + 1, 0, n); if (!strip(b.x).trim()) blocks.splice(i, 1); const after = nb(); blocks.splice(blocks.indexOf(n) + 1, 0, after); draw(after.id); commit(); return; }
    b.t = t; if (t === 'toggle') b.open = true; draw(b.id); commit();
  }
  function blockMenu(b, anchor) {
    const i = blocks.indexOf(b);
    menu(anchor, [
      ...BLOCKS.filter(([t]) => TEXTUAL.has(t)).slice(0, 10).map(([t, name, , ic]) => ({ label: 'Turn into ' + name, icon: ic, checked: b.t === t, run: () => { checkpoint(); b.t = t; draw(b.id); commit(); } })), '-',
      { label: 'Move up', icon: 'chevd', run: () => { if (i > 0) { checkpoint(); [blocks[i - 1], blocks[i]] = [blocks[i], blocks[i - 1]]; draw(b.id); commit(); } } },
      { label: 'Move down', icon: 'chevd', run: () => { if (i < blocks.length - 1) { checkpoint(); [blocks[i + 1], blocks[i]] = [blocks[i], blocks[i + 1]]; draw(b.id); commit(); } } },
      { label: 'Duplicate', icon: 'pages', run: () => { checkpoint(); const c = { ...JSON.parse(JSON.stringify(b)), id: uid('b') }; blocks.splice(i + 1, 0, c); draw(c.id); commit(); } },
      { label: 'Delete', icon: 'trash', danger: true, run: () => { checkpoint(); blocks.splice(i, 1); if (!blocks.length) blocks.push(nb()); draw(); commit(); } }], { width: 250 });
  }

  // ---- selection format bar ----
  let bar = null;
  const onSel = () => {
    const s = getSelection(); const inside = s.rangeCount && doc.contains(s.anchorNode) && !s.isCollapsed;
    // on iPhone/iPad the shortcut bar above the keyboard has these buttons, so no second bar
    if (!inside || matchMedia('(pointer: coarse)').matches) { bar && bar.remove(); bar = null; return; }
    const r = s.getRangeAt(0).getBoundingClientRect();
    if (!bar) {
      const f = (label, cmd, txt, style) => h('button', { 'aria-label': label, title: label, onmousedown: e => { e.preventDefault(); if (cmd === 'link') { const ce = s.anchorNode.parentElement.closest('.ce'); addLink(blocks.find(x => x.id === ce.closest('.blk').dataset.id), ce); } else { document.execCommand(cmd === 'code' ? 'insertHTML' : cmd, false, cmd === 'code' ? `<code>${esc(s.toString())}</code>` : null); const ce = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement).closest('.ce'); if (ce) onInput(blocks.find(x => x.id === ce.closest('.blk').dataset.id), ce); } } , style }, txt);
      bar = h('div', { class: 'fmtbar glass', role: 'toolbar', 'aria-label': 'Text formatting' }, f('Bold', 'bold', 'B'), f('Italic', 'italic', 'i', 'font-style:italic'), f('Underline', 'underline', 'U', 'text-decoration:underline'), f('Strikethrough', 'strikeThrough', 'S', 'text-decoration:line-through'), f('Code', 'code', '</>'), f('Link', 'link', '🔗'));
      document.body.append(bar);
    }
    bar.style.left = Math.max(8, Math.min(innerWidth - 230, r.left + r.width / 2 - 110)) + 'px'; bar.style.top = Math.max(8, r.top - 48) + 'px';
  };
  document.addEventListener('selectionchange', onSel);

  draw();
  return {
    undo: doUndo, redo: doRedo, focusEnd: () => { const last = [...blocks].reverse().find(b => TEXTUAL.has(b.t)); if (last) focusBlock(last.id, 'end'); else { const n = nb(); blocks.push(n); draw(n.id); } },
    insertFile: () => applyType(blocks.at(-1), 'file'), addBlock: () => { checkpoint(); const n = nb(); blocks.push(n); draw(n.id); commit(); setTimeout(() => slash(n, doc.querySelector(`[data-id="${n.id}"] .ce`)), 0); },
    destroy: () => { document.removeEventListener('selectionchange', onSel); bar && bar.remove(); },
    blocks: () => blocks
  };
}

/** Markdown export of blocks. */
export function blocksToMd(blocks) {
  const md = x => strip(x);
  let n = 0;
  return blocks.map(b => { const ind = '  '.repeat(b.in || 0); if (b.t !== 'num') n = 0;
    switch (b.t) { case 'h1': return '# ' + md(b.x); case 'h2': return '## ' + md(b.x); case 'h3': return '### ' + md(b.x);
      case 'todo': return `${ind}- [${b.c ? 'x' : ' '}] ${md(b.x)}`; case 'bullet': return `${ind}- ${md(b.x)}`; case 'num': return `${ind}${++n}. ${md(b.x)}`;
      case 'quote': return '> ' + md(b.x); case 'callout': return `> ${b.emo || '💡'} ${md(b.x)}`; case 'code': return '```\n' + md(b.x) + '\n```';
      case 'divider': return '---'; case 'file': return `📎 ${b.file?.name || 'file'}`; default: return ind + md(b.x); } }).join('\n\n');
}
