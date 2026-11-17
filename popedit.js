// Folio v2 — Notion-style edit card: a white card over the field you tapped.
// It lives inside the scrolling page (so it moves with the row, never drifts away),
// and the page scrolls so the card is always visible above the keyboard and the shortcut bar.
import * as D from './data.js';
import * as DB from './db.js';
import { h, textbox } from './ui.js';

const TOPBAR = 64, BAR = 76; // room for the top bar, and for the shortcut bar above the keyboard
export function popEdit(anchor, rec, p, after) {
  document.querySelector('.cellpop')?.dispatchEvent(new Event('commit'));
  if (!anchor.isConnected) return null; // the screen changed under the tap; nothing to edit
  const host = anchor.closest('#pane') || document.getElementById('main') || document.body;
  const num = p.type === 'number';
  // Enter starts a new line in text (remarks, address, findings…); one-line values (numbers, links, IDs, phone, email) finish on Enter.
  // Either way, ✓ above the keyboard or tapping outside saves.
  const single = p.single === true || num || p.type === 'url' || p.type === 'title' || /\b(ecx|wbs|ref|reference|id|phone|contact|tel|email|e-mail|number|no)\b/i.test(p.name || '');
  const inp = textbox({ cls: 'popin', multiline: true, label: p.name, attrs: { inputmode: num ? 'decimal' : p.type === 'url' ? 'url' : null, autocapitalize: p.type === 'url' ? 'off' : null, spellcheck: p.type === 'text' || p.type === 'title' ? null : 'false' } });
  if (/^ecx/i.test(p.name)) inp.style.fontFamily = 'var(--mono)';
  inp.value = DB.raw(rec, p) ?? '';
  const box = h('div', { class: 'cellpop' }, inp);
  // room below the page while editing, so a field near the bottom (Wayleave, Technical findings…) can still scroll up above the keyboard
  const spacer = h('div', { class: 'popspace', 'aria-hidden': 'true', style: `height:${Math.round(innerHeight * 0.7)}px` });
  const place = () => {
    const a = anchor.getBoundingClientRect(), hr = host.getBoundingClientRect();
    const w = Math.min(Math.max(a.width + 2, 260), anchor.closest('.kvwide') ? 1200 : 460, host.clientWidth - 16); // full-width rows edit at full width
    const left = Math.max(8, Math.min(a.left - hr.left + host.scrollLeft - 1, host.clientWidth - w - 8));
    box.style.left = left + 'px'; box.style.top = (a.top - hr.top + host.scrollTop - 1) + 'px'; box.style.width = w + 'px';
  };
  // keep the card between the top bar and the keyboard
  // measured against the shortcut bar itself when it is showing, so the card and the bar always agree on where the keyboard is
  let revealQueued = false;
  const reveal = () => {
    if (!box.isConnected || revealQueued) return; revealQueued = true;
    requestAnimationFrame(() => {
      revealQueued = false; if (!box.isConnected) return;
      const vv = window.visualViewport, vh = vv ? vv.height : innerHeight;
      const kb = document.querySelector('.kbar:not([hidden])'), kr = kb && kb.getBoundingClientRect();
      let top, bottom;
      if (kr && kr.height) { bottom = kr.top - 10; top = kr.bottom + 8 - vh + TOPBAR; }
      else { top = (vv ? vv.offsetTop : 0) + TOPBAR; bottom = (vv ? vv.offsetTop + vv.height : innerHeight) - BAR; }
      const r = box.getBoundingClientRect();
      if (r.bottom > bottom + 3) host.scrollTop += Math.min(r.bottom - bottom + 12, Math.max(0, r.top - top));
      else if (r.top < top - 3 && r.bottom + (top - r.top) < bottom) host.scrollTop -= top - r.top + 12; // only move down if that doesn't hide it at the bottom
    });
  };
  // long text (a full-width row such as Technical findings) opens as a taller box
  const tall = !single && !!anchor.closest('.kvwide');
  // never taller than the space between the top bar and the keyboard / shortcut bar (in CSS px: the card is zoomed with ⋯ → Zoom)
  const room = () => { const vv = window.visualViewport, kb = document.querySelector('.kbar:not([hidden])'), kr = kb && kb.getBoundingClientRect();
    const bottom = kr && kr.height ? kr.top : (vv ? vv.height : innerHeight); const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--zoom')) || 1;
    return Math.max(60, (bottom - TOPBAR - 24) / z); };
  const grow = () => { inp.style.height = 'auto'; inp.style.height = Math.min(room(), Math.max(tall ? 120 : 0, Math.min(inp.scrollHeight, innerHeight * (tall ? 0.42 : 0.35)))) + 'px'; };
  let done = false;
  const vvOn = () => setTimeout(() => { grow(); reveal(); }, 30);
  const close = save => {
    if (done) return; done = true;
    if (save) {
      let val = inp.value.replace(/\n+$/, '');
      if (num) val = val.trim() === '' ? null : +val; else if (p.type === 'url') val = val.trim();
      const cur = D.getRec(rec.id);
      if (cur && val !== (DB.raw(cur, p) ?? (num ? null : ''))) { D.update(rec.id, { ['p:' + p.id]: val }); document.dispatchEvent(new CustomEvent('folio-row', { detail: rec.id })); }
    }
    if (save && anchor.isConnected && anchor.childElementCount === 0 && inp.value.trim()) anchor.textContent = inp.value.replace(/\n+$/, ''); // show the new text right away
    box.remove(); anchor.classList.remove('editing');
    { const st = host.scrollTop; spacer.remove(); host.scrollTop = Math.min(st, host.scrollHeight - host.clientHeight); }
    if (window.visualViewport) { visualViewport.removeEventListener('resize', vvOn); visualViewport.removeEventListener('scroll', vvOn); }
    after && after();
  };
  inp.addEventListener('input', () => { grow(); reveal(); });
  inp.setAttribute('enterkeyhint', single ? 'done' : 'enter');
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && single) { e.preventDefault(); close(true); } if (e.key === 'Escape') { e.preventDefault(); close(false); } });
  inp.addEventListener('blur', () => setTimeout(() => close(true), 0));
  box.addEventListener('commit', () => close(true));
  host.append(spacer, box); anchor.classList.add('editing'); place(); grow();
  inp.focus({ preventScroll: true }); const n = inp.value.length; try { inp.setSelectionRange(n, n); } catch {}
  if (window.visualViewport) { visualViewport.addEventListener('resize', vvOn); visualViewport.addEventListener('scroll', vvOn); }
  setTimeout(reveal, 60); setTimeout(reveal, 400); setTimeout(reveal, 800); // the keyboard takes a moment to slide up
  return box;
}
