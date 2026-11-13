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
  const inp = textbox({ cls: 'popin', multiline: true, label: p.name, attrs: { inputmode: num ? 'decimal' : p.type === 'url' ? 'url' : null, autocapitalize: p.type === 'url' ? 'off' : null, spellcheck: p.type === 'text' || p.type === 'title' ? null : 'false' } });
  if (/^ecx/i.test(p.name)) inp.style.fontFamily = 'var(--mono)';
  inp.value = DB.raw(rec, p) ?? '';
  const box = h('div', { class: 'cellpop' }, inp);
  const place = () => {
    const a = anchor.getBoundingClientRect(), hr = host.getBoundingClientRect();
    const w = Math.min(Math.max(a.width + 2, 260), 460, host.clientWidth - 16);
    const left = Math.max(8, Math.min(a.left - hr.left + host.scrollLeft - 1, host.clientWidth - w - 8));
    box.style.left = left + 'px'; box.style.top = (a.top - hr.top + host.scrollTop - 1) + 'px'; box.style.width = w + 'px';
  };
  // keep the card between the top bar and the keyboard
  const reveal = () => {
    if (!box.isConnected) return;
    const vv = window.visualViewport, top = (vv ? vv.offsetTop : 0) + TOPBAR, bottom = (vv ? vv.offsetTop + vv.height : innerHeight) - BAR;
    const b = box.getBoundingClientRect();
    if (b.bottom > bottom) host.scrollTop += Math.min(b.bottom - bottom + 12, b.top - top);
    else if (b.top < top) host.scrollTop -= top - b.top + 12;
  };
  const grow = () => { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, innerHeight * 0.35) + 'px'; };
  let done = false;
  const vvOn = () => setTimeout(reveal, 30);
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
    if (window.visualViewport) { visualViewport.removeEventListener('resize', vvOn); visualViewport.removeEventListener('scroll', vvOn); }
    after && after();
  };
  inp.addEventListener('input', () => { grow(); reveal(); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); close(true); } if (e.key === 'Escape') { e.preventDefault(); close(false); } });
  inp.addEventListener('blur', () => setTimeout(() => close(true), 0));
  box.addEventListener('commit', () => close(true));
  host.append(box); anchor.classList.add('editing'); place(); grow();
  inp.focus({ preventScroll: true }); const n = inp.value.length; try { inp.setSelectionRange(n, n); } catch {}
  if (window.visualViewport) { visualViewport.addEventListener('resize', vvOn); visualViewport.addEventListener('scroll', vvOn); }
  setTimeout(reveal, 60); setTimeout(reveal, 400); setTimeout(reveal, 800); // the keyboard takes a moment to slide up
  return box;
}
