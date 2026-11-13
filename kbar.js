// Folio v2 — shortcut bar above the iPhone/iPad keyboard, like Notion's.
// Shows whenever you are typing; the buttons work on page text (bold, links…) and on plain fields (undo, @date, link).
import { h, icon, esc } from './ui.js';
import { formatDate } from './dates.js';

let bar = null, target = null;
const isTouch = () => window.FOLIO_KBAR === true || matchMedia('(pointer: coarse)').matches;
// the on-screen keyboard is up when it takes a good part of the screen (a hardware keyboard does not)
const keyboardUp = () => window.FOLIO_KBAR === true || (window.visualViewport ? innerHeight - visualViewport.height > 150 : false);
const editable = el => el && (el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|url|email|tel|number|)$/.test(el.type)));
const rich = () => target && target.isContentEditable;
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
  if (target && !target.isContentEditable) { insert('https://'); return; }
  const sel = getSelection(); const range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null; const el = target;
  const url = prompt('Link (https://…)', 'https://');
  if (!url || url === 'https://') { el && el.focus(); return; }
  const clean = /^(https?:|mailto:|tel:)/i.test(url.trim()) ? url.trim() : 'https://' + url.trim();
  el.focus();
  if (el.isContentEditable) {
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
      b('Remove link', icon('link', 20), () => run('unlink'), { richOnly: true, cls: 'dim' })),
    h('span', { class: 'ksep' }),
    b('Hide keyboard', icon('keyboard', 22), () => run('hide')));
  bar.addEventListener('pointerdown', e => { if (e.target === bar) e.preventDefault(); });
  document.body.append(bar);
}
function place() {
  if (!bar || !target) return;
  const vv = window.visualViewport; const bottom = vv ? vv.offsetTop + vv.height : innerHeight;
  bar.style.top = Math.round(bottom - bar.offsetHeight - 8) + 'px';
}
function show(el) { target = el; update(); }
function update() {
  const on = !!target && isTouch() && keyboardUp() && editable(document.activeElement);
  if (on && !bar) build();
  if (bar) { bar.hidden = !on; if (on) { bar.classList.toggle('plain', !target.isContentEditable); place(); } else { const pk = bar.querySelector('.kpick'); if (pk) { pk.remove(); bar.querySelector('.kscroll').hidden = false; } } }
  document.body.classList.toggle('typing', on);
}
function hide() { target = null; update(); }

export function initKeyboardBar() {
  document.addEventListener('focusin', e => { if (editable(e.target)) show(e.target); });
  document.addEventListener('focusout', () => setTimeout(() => { if (!editable(document.activeElement)) hide(); else show(document.activeElement); }, 60));
  if (window.visualViewport) { visualViewport.addEventListener('resize', () => { update(); setTimeout(update, 250); }); visualViewport.addEventListener('scroll', place); }
  addEventListener('resize', place);
}
