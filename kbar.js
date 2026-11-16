// Folio v2 — shortcut bar above the iPhone/iPad keyboard, like Notion's.
// Shows whenever you are typing; the buttons work on page text (bold, links…) and on plain fields (undo, @date, link).
import { h, icon, esc, toast, TEXT_COLORS } from './ui.js';
import { formatDate } from './dates.js';

let bar = null, target = null;
const isTouch = () => window.FOLIO_KBAR === true || matchMedia('(pointer: coarse)').matches;
// the on-screen keyboard is up when it takes a good part of the screen (a hardware keyboard does not)
const keyboardUp = () => window.FOLIO_KBAR === true || (window.visualViewport ? innerHeight - visualViewport.height > 150 : false);
const editable = el => el && (el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|url|email|tel|number|)$/.test(el.type)));
const rich = () => target && target.isContentEditable && !target.classList.contains('tbox') && target.contentEditable !== 'plaintext-only';
const fire = () => target && target.dispatchEvent(new Event('input', { bubbles: true }));
const insert = text => { if (!target) return; target.focus(); document.execCommand('insertText', false, text); fire(); };

function run(cmd) {
  if (!target) return;
  target.focus();
  switch (cmd) {
    case 'undo': document.execCommand('undo'); fire(); break;
    case 'bold': case 'underline': case 'italic': case 'strikeThrough': if (rich()) { document.execCommand(cmd); fire(); } break;
    case 'code': if (rich()) { const s = getSelection().toString(); document.execCommand('insertHTML', false, `<code>${esc(s || ' ')}</code>`); fire(); } break;
    case 'unlink': if (rich()) { document.execCommand('unlink'); fire(); } break;
    case 'hide': target.blur(); break;
  }
}
function addLink(anchor) {
  if (target && !rich()) { insert('https://'); return; }
  const sel = getSelection(); const range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null; const el = target;
  const url = prompt('Link (https://…)', 'https://');
  if (!url || url === 'https://') { el && el.focus(); return; }
  const clean = /^(https?:|mailto:|tel:)/i.test(url.trim()) ? url.trim() : 'https://' + url.trim();
  el.focus();
  if (rich()) {
    if (range) { sel.removeAllRanges(); sel.addRange(range); }
    if (sel.isCollapsed) document.execCommand('insertHTML', false, `<a href="${esc(clean)}">${esc(clean)}</a>`); else document.execCommand('createLink', false, clean);
    fire();
  } else insert(clean);
}
function mention() { // the date choices replace the buttons inside the bar, so the keyboard stays open
  const d = new Date(window.FOLIO_NOW ? +window.FOLIO_NOW : Date.now()), t = d.toTimeString().slice(0, 5);
  const back = () => { bar.querySelector('.kscroll').hidden = false; bar.querySelector('.kpick').remove(); };
  const chip = (label, text) => keep(h('button', { class: 'kchip', type: 'button', onclick: () => { insert(text); back(); } }, label));
  const pick = h('div', { class: 'kpick' }, keep(h('button', { class: 'kb', type: 'button', 'aria-label': 'Back', onclick: back }, icon('back', 18))),
    chip(formatDate(d, 'DD/MM/YYYY'), formatDate(d, 'DD/MM/YYYY')), chip('[' + formatDate(d, 'DD/MM/YYYY') + ']', '[' + formatDate(d, 'DD/MM/YYYY') + ']'),
    chip(formatDate(d, 'D MMMM YYYY'), formatDate(d, 'D MMMM YYYY')), chip(t, t), chip(formatDate(d, 'DD/MM/YYYY') + ' ' + t, formatDate(d, 'DD/MM/YYYY') + ' ' + t));
  bar.querySelector('.kscroll').hidden = true; bar.insertBefore(pick, bar.querySelector('.ksep'));
}
// ---------- text size, colour and highlight (page text only) ----------
const COLOR_NAME = { gray: 'Grey', brown: 'Brown', orange: 'Orange', yellow: 'Yellow', green: 'Green', blue: 'Blue', purple: 'Purple', pink: 'Pink', red: 'Red' };
const SIZE_NAME = { s: 'Small', '': 'Normal', l: 'Large', xl: 'Extra large' };
/** wrap the selected text in <tag data-key=value>; an empty value removes that formatting from the selection */
function format(tag, key, value) {
  if (!rich()) { toast('Text size and colours work in page text, not in this field.'); return; }
  const sel = getSelection(); if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0); if (!target.contains(range.commonAncestorContainer)) return;
  if (range.collapsed) { toast('Select some text first.'); return; }
  const strip = f => { f.querySelectorAll(`${tag}[data-${key}]`).forEach(n => n.replaceWith(...n.childNodes)); return f; };
  const wrap = f => { if (!value) return f; const e = document.createElement(tag); e.setAttribute('data-' + key, value); e.append(f); return e; };
  // the selection may sit inside text that already has this kind of formatting: split that element so the new choice replaces the old one
  let el = range.commonAncestorContainer; el = el.nodeType === 1 ? el : el.parentElement;
  const anc = el && el.closest(`${tag}[data-${key}]`);
  let first, last;
  if (anc && target.contains(anc)) {
    const before = document.createRange(); before.setStart(anc, 0); before.setEnd(range.startContainer, range.startOffset);
    const after = document.createRange(); after.setStart(range.endContainer, range.endOffset); after.setEnd(anc, anc.childNodes.length);
    const keepOld = f => { if (!f.textContent) return null; const e = anc.cloneNode(false); e.append(f); return e; };
    const mid = wrap(strip(range.cloneContents())), out = document.createDocumentFragment();
    const parts = [keepOld(before.cloneContents()), mid, keepOld(after.cloneContents())].filter(Boolean);
    first = mid.nodeType === 11 ? mid.firstChild : mid; last = mid.nodeType === 11 ? mid.lastChild : mid;
    out.append(...parts); anc.replaceWith(out);
  } else {
    const node = wrap(strip(range.extractContents()));
    first = node.nodeType === 11 ? node.firstChild : node; last = node.nodeType === 11 ? node.lastChild : node;
    range.insertNode(node);
  }
  if (first && last && first.isConnected) { const r = document.createRange(); r.setStartBefore(first); r.setEndAfter(last); sel.removeAllRanges(); sel.addRange(r); }
  target.normalize(); fire();
}
function picker(items) { // the choices replace the buttons inside the bar, so the keyboard and the selection stay
  const back = () => { bar.querySelector('.kscroll').hidden = false; bar.querySelector('.kpick')?.remove(); };
  const pick = h('div', { class: 'kpick' }, keep(h('button', { class: 'kb', type: 'button', 'aria-label': 'Back', onclick: back }, icon('back', 18))),
    ...items.map(([label, content, act]) => keep(h('button', { class: 'kchip' + (content.classList?.contains('kdot') ? ' ksw' : ''), type: 'button', 'aria-label': label, title: label, onclick: () => { act(); back(); } }, content))));
  bar.querySelector('.kpick')?.remove(); bar.querySelector('.kscroll').hidden = true; bar.insertBefore(pick, bar.querySelector('.ksep'));
}
const sizePicker = () => picker(Object.entries(SIZE_NAME).map(([k, l]) => [l, h('span', { class: 'ksz ksz-' + (k || 'n') }, l), () => format('span', 's', k)]));
const colorPicker = () => picker([['Default colour', h('span', { class: 'kdot kdef' }, 'A'), () => format('span', 'c', '')],
  ...TEXT_COLORS.map(c => [COLOR_NAME[c] + ' text', h('span', { class: 'kdot', 'data-c': c }, 'A'), () => format('span', 'c', c)])]);
const markPicker = () => picker([['No highlight', h('span', { class: 'kdot kdef' }, '⌀'), () => format('mark', 'c', '')],
  ...TEXT_COLORS.map(c => [COLOR_NAME[c] + ' highlight', h('mark', { class: 'kdot', 'data-c': c }, 'A'), () => format('mark', 'c', c)])]);
// ---------- select all / copy all ----------
function selectAll() {
  if (!target) return; target.focus();
  if (target.select) { target.select(); try { target.setSelectionRange(0, target.value.length); } catch {} return; }
  const r = document.createRange(); r.selectNodeContents(target); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
/** the whole text: every block of the page (with its bullet or number), or the whole field */
export function allText(el) {
  const ed = el && el.closest && el.closest('.feditor');
  if (!ed) return el ? (el.value ?? el.innerText ?? '') : '';
  return [...ed.querySelectorAll('.ce')].map(ce => { const mk = ce.parentElement.querySelector(':scope > .mk'); return (mk ? mk.textContent + ' ' : '') + ce.innerText.replace(/\n+$/, ''); }).join('\n');
}
async function copyAll() {
  const t = allText(target);
  try { await navigator.clipboard.writeText(t); toast('Copied all the text'); }
  catch { selectAll(); document.execCommand('copy') ? toast('Copied') : toast('Could not copy. Use Select all, then Copy.'); }
  target && target.focus();
}
const keep = el => { el.addEventListener('pointerdown', e => e.preventDefault()); el.addEventListener('mousedown', e => e.preventDefault()); return el; };
function build() {
  const b = (label, content, onAct, { richOnly = false, cls = '' } = {}) => {
    const el = h('button', { class: 'kb ' + cls + (richOnly ? ' rich' : ''), 'aria-label': label, title: label, type: 'button' }, content);
    // keep the keyboard open: never let the button take focus
    el.addEventListener('pointerdown', e => e.preventDefault()); el.addEventListener('mousedown', e => e.preventDefault());
    el.addEventListener('click', e => { e.preventDefault(); onAct(el); });
    return el;
  };
  const txt = (t, style) => h('span', { class: 'kt', style }, t);
  bar = h('div', { class: 'kbar glass', role: 'toolbar', 'aria-label': 'Typing shortcuts' },
    h('div', { class: 'kscroll' },
      b('Undo', icon('undo', 20), () => run('undo')),
      b('Bold', txt('B', 'font-weight:800'), () => run('bold'), { richOnly: true }),
      b('Underline', txt('U', 'text-decoration:underline;text-underline-offset:3px'), () => run('underline'), { richOnly: true }),
      b('Italic', txt('I', 'font-style:italic;font-family:Georgia,serif'), () => run('italic'), { richOnly: true }),
      b('Strikethrough', txt('S', 'text-decoration:line-through'), () => run('strikeThrough'), { richOnly: true }),
      b('Insert a date', txt('@', 'font-size:21px'), () => mention()),
      b('Add link', icon('linkadd', 20), el => addLink(el)),
      b('Code', txt('</>', 'font-size:14px;letter-spacing:-0.5px'), () => run('code'), { richOnly: true }),
      b('Remove link', icon('link', 20), () => run('unlink'), { richOnly: true, cls: 'dim' }),
      b('Text size', txt('Aa', 'font-size:18px;letter-spacing:-0.5px'), () => sizePicker(), { richOnly: true }),
      b('Text colour', h('span', { class: 'kt kcol' }, 'A'), () => colorPicker(), { richOnly: true }),
      b('Highlight', icon('highlight', 20), () => markPicker(), { richOnly: true }),
      b('Select all', icon('selectall', 20), () => selectAll()),
      b('Copy all', icon('copy', 20), () => copyAll())),
    h('span', { class: 'ksep' }),
    b('Hide keyboard', icon('keyboard', 22), () => run('hide')));
  bar.addEventListener('pointerdown', e => { if (e.target === bar) e.preventDefault(); });
  document.body.append(bar);
}
function place() {
  if (!bar || !target) return;
  const vv = window.visualViewport; const bottom = vv ? vv.offsetTop + vv.height : innerHeight;
  // with ⋯ → Zoom on, the bar is scaled, and so is the 'top' we give it: work in screen pixels, then divide by the zoom
  const z = document.documentElement.classList.contains('zoomed') ? (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--zoom')) || 1) : 1;
  const hgt = bar.getBoundingClientRect().height || bar.offsetHeight * z;
  bar.style.top = Math.round((bottom - hgt - 8) / z) + 'px';
}
function show(el) { target = el; update(); }
function update() {
  const on = !!target && isTouch() && keyboardUp() && editable(document.activeElement);
  if (on && !bar) build();
  if (bar) { bar.hidden = !on; if (on) { bar.classList.toggle('plain', !rich()); place(); } else { const pk = bar.querySelector('.kpick'); if (pk) { pk.remove(); bar.querySelector('.kscroll').hidden = false; } } }
  document.body.classList.toggle('typing', on);
}
function hide() { target = null; update(); }

export function initKeyboardBar() {
  document.addEventListener('focusin', e => { if (editable(e.target)) show(e.target); });
  document.addEventListener('focusout', () => setTimeout(() => { if (!editable(document.activeElement)) hide(); else show(document.activeElement); }, 60));
  if (window.visualViewport) { visualViewport.addEventListener('resize', () => { update(); setTimeout(update, 250); }); visualViewport.addEventListener('scroll', place); }
  addEventListener('resize', place);
}
