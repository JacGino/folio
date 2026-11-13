// Folio v2 — tiny DOM helpers, icons, sanitising, sheets and toasts.
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v; // only ever called with sanitised HTML
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const P = {
  today: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  ecpar: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M10 12l4 4M14 12l-4 4"/>',
  table: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M10 10v9"/>',
  pages: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', back: '<path d="M15 5l-7 7 7 7"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>',
  export: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>', sliders: '<path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/>',
  chevd: '<path d="M6 9l6 6 6-6"/>', chevr: '<path d="M9 5l7 7-7 7"/>', check: '<path d="M5 12l5 5 9-10"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  clip: '<path d="M20 11l-8 8a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7"/>',
  undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 0 12"/>', addprop: '<path d="M4 7h10M4 12h7M4 17h6M17 14v6M14 17h6"/>',
  text: '<path d="M4 7h16M4 12h16M4 17h10"/>', list: '<path d="M9 7h11M9 12h11M9 17h11"/><circle cx="5" cy="7" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="17" r="1"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  date: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>', status: '<circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/>',
  formula: '<path d="M17 5H7l6 7-6 7h10"/>', checkbox: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>',
  title: '<path d="M5 18L10 6l5 12M7 14h6"/>', number: '<path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  sort: '<path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3"/>', eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  group: '<rect x="4" y="5" width="4" height="4" rx="1"/><rect x="10" y="5" width="4" height="4" rx="1"/><rect x="16" y="5" width="4" height="4" rx="1"/><rect x="4" y="13" width="4" height="4" rx="1"/><rect x="10" y="13" width="4" height="4" rx="1"/><rect x="16" y="13" width="4" height="4" rx="1"/>',
  paint: '<rect x="4" y="3" width="14" height="6" rx="1"/><path d="M18 6h2v5h-8v3"/><rect x="10" y="14" width="4" height="7" rx="1"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>', source: '<circle cx="18" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><path d="M16 6H8a3 3 0 0 0 0 6h8a3 3 0 0 1 0 6H8"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/><path d="M13 16a2 2 0 0 1 3-3"/>',
  board: '<rect x="4" y="4" width="4" height="16" rx="1"/><rect x="10" y="4" width="4" height="10" rx="1"/><rect x="16" y="4" width="4" height="13" rx="1"/>',
  person: '<circle cx="12" cy="9" r="4"/><path d="M4.5 20c1.4-3.4 4.2-5 7.5-5s6.1 1.6 7.5 5"/>', sync: '<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>',
  drag: '<circle cx="9" cy="6" r="1.4" fill="currentColor"/><circle cx="15" cy="6" r="1.4" fill="currentColor"/><circle cx="9" cy="12" r="1.4" fill="currentColor"/><circle cx="15" cy="12" r="1.4" fill="currentColor"/><circle cx="9" cy="18" r="1.4" fill="currentColor"/><circle cx="15" cy="18" r="1.4" fill="currentColor"/>',
  import: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 19h14"/>', face: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9v1M15 9v1M12 9v4h-1M9.5 15.5a3.5 3.5 0 0 0 5 0"/>'
};
export function icon(name, size = 20, extra = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  if (extra) s.setAttribute('class', extra);
  s.innerHTML = P[name] || P.pages; return s;
}
export const logo = (size = 30) => h('div', { class: 'logo', style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.62) + 'px', borderRadius: Math.round(size * 0.27) + 'px' }, 'aria-hidden': 'true' }, 'F');

// ---- sanitiser: only a small set of inline tags survives; never runs scripts ----
const OK = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'CODE', 'A', 'BR', 'SPAN', 'MARK']);
export function sanitize(html) {
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  const walk = node => {
    for (const c of [...node.childNodes]) {
      if (c.nodeType === 3) continue;
      if (c.nodeType !== 1 || !OK.has(c.tagName)) { if (c.nodeType === 1 && !['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT'].includes(c.tagName)) { walk(c); c.replaceWith(...c.childNodes); } else c.remove(); continue; }
      for (const a of [...c.attributes]) {
        const keep = (c.tagName === 'A' && a.name === 'href' && /^(https?:|mailto:|tel:|#)/i.test(a.value)) || (c.tagName === 'MARK' && a.name === 'data-c') || (c.tagName === 'SPAN' && a.name === 'data-c');
        if (!keep) c.removeAttribute(a.name);
      }
      if (c.tagName === 'A') { c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener noreferrer'); }
      walk(c);
    }
  };
  const root = doc.body.firstChild; walk(root); return root.innerHTML;
}
export const strip = html => { const d = document.createElement('div'); d.innerHTML = sanitize(html); return d.textContent || ''; };

// ---- toast ----
export function toast(msg, ms = 2600) {
  let t = $('#toast'); if (!t) { t = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
  t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), ms);
}

// ---- bottom sheet (glass) ----
export function sheet(title, body, { done = 'Done', onDone, wide = false } = {}) {
  const back = h('div', { class: 'sheet-back', onclick: e => { if (e.target === back) close(); } });
  const close = () => { back.classList.remove('open'); setTimeout(() => back.remove(), 200); document.removeEventListener('keydown', key); onDone && onDone(); };
  const key = e => { if (e.key === 'Escape') close(); };
  const panel = h('section', { class: 'sheet' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'grab', 'aria-hidden': 'true' }),
    h('header', {}, h('span'), h('h2', {}, title), h('button', { class: 'link', onclick: close }, done)),
    h('div', { class: 'sheet-body' }, body));
  back.append(panel); document.body.append(back); document.addEventListener('keydown', key);
  requestAnimationFrame(() => back.classList.add('open'));
  setTimeout(() => (panel.querySelector('input,select,textarea,button:not(.link)') || panel.querySelector('button'))?.focus(), 60);
  return { close, panel, body: panel.querySelector('.sheet-body') };
}
export function group(...rows) { return h('div', { class: 'group' }, rows); }
export function row({ icon: ic, label, value = '', chev = true, onclick, active = false, danger = false }) {
  return h('button', { class: 'grow' + (active ? ' active' : '') + (danger ? ' danger' : ''), onclick },
    ic ? icon(ic) : null, h('span', { class: 'gl' }, label), h('span', { class: 'gv' }, value), chev ? icon('chevr', 14, 'chev') : null);
}

// ---- small popover menu ----
export function menu(anchor, items, { width = 240 } = {}) {
  closeMenus();
  const r = anchor.getBoundingClientRect();
  const m = h('div', { class: 'menu', role: 'menu', style: { width: width + 'px' } },
    items.map(it => it === '-' ? h('div', { class: 'sep' }) :
      h('button', { role: 'menuitem', class: it.danger ? 'danger' : '', onclick: () => { closeMenus(); it.run(); } },
        it.icon ? icon(it.icon, 16) : null, h('span', {}, it.label), it.checked ? icon('check', 16, 'chk') : null)));
  document.body.append(m);
  const left = Math.min(Math.max(8, r.left), innerWidth - width - 8);
  const top = r.bottom + 6 + m.offsetHeight > innerHeight ? Math.max(8, r.top - 6 - m.offsetHeight) : r.bottom + 6;
  Object.assign(m.style, { left: left + 'px', top: top + 'px' });
  setTimeout(() => document.addEventListener('pointerdown', outside, { once: true }), 0);
  function outside(e) { if (!m.contains(e.target)) closeMenus(); else document.addEventListener('pointerdown', outside, { once: true }); }
  m.querySelector('button')?.focus();
  return m;
}
export function closeMenus() { $$('.menu').forEach(m => m.remove()); }

export function confirmBox(msg, okLabel = 'Delete') {
  return new Promise(res => {
    const s = sheet('Are you sure?', h('div', {}, h('p', { class: 'muted pad' }, msg),
      group(h('button', { class: 'grow danger', onclick: () => { res(true); s.close(); } }, h('span', { class: 'gl' }, okLabel)))), { done: 'Cancel', onDone: () => res(false) });
  });
}
export function promptBox(title, value = '', placeholder = '') {
  return new Promise(res => {
    const inp = h('input', { class: 'field', value, placeholder, 'aria-label': title });
    let done = false;
    const s = sheet(title, h('form', { onsubmit: e => { e.preventDefault(); done = true; res(inp.value); s.close(); } }, inp, h('button', { class: 'btn primary block', type: 'submit' }, 'Save')),
      { done: 'Cancel', onDone: () => { if (!done) res(null); } });
  });
}
