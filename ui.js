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
  building: '<rect x="5" y="3.5" width="14" height="17" rx="1.5" stroke-width="1.6"/><path d="M9 7.5h1.5M13.5 7.5H15M9 11h1.5M13.5 11H15M9 14.5h1.5M13.5 14.5H15M10.5 20.5v-3h3v3" stroke-width="1.6"/>',
  hourglass: '<path d="M7 3.5h10M7 20.5h10M8 3.5c0 4.5 8 5.5 8 8.5s-8 4-8 8.5M16 3.5c0 4.5-8 5.5-8 8.5" stroke-width="1.6"/>',
  pencil: '<path d="M4.5 19.5l1-4L15.8 5.2a2 2 0 0 1 2.9 0l.1.1a2 2 0 0 1 0 2.9L8.5 18.5z" stroke-width="1.6"/><path d="M13.5 7.5l3 3" stroke-width="1.6"/>',
  phone: '<path d="M6.5 4h3l1.5 4-2 1.5a10 10 0 0 0 5.5 5.5l1.5-2 4 1.5v3a1.5 1.5 0 0 1-1.6 1.5A15.5 15.5 0 0 1 5 5.6 1.5 1.5 0 0 1 6.5 4z" stroke-width="1.6"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2" stroke-width="1.6"/><path d="M4 7l8 6 8-6" stroke-width="1.6"/>',
  xcircle: '<circle cx="12" cy="12" r="8.5" stroke-width="1.6"/><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" stroke-width="1.6"/>',
  okcircle: '<circle cx="12" cy="12" r="8.5" stroke-width="1.6"/><path d="M8.3 12.3l2.5 2.5 5-5.2" stroke-width="1.6"/>',
  redo: '<path d="M19 8.5H9.5a5 5 0 0 0 0 10H13" stroke-width="1.6"/><path d="M15.5 5l3.5 3.5-3.5 3.5" stroke-width="1.6"/>',
  info: '<circle cx="12" cy="12" r="8.5" stroke-width="1.6"/><path d="M12 11v5.5M12 7.8v.4" stroke-width="1.8"/>',
  today: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  ecpar: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M10 12l4 4M14 12l-4 4"/>',
  table: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M10 10v9"/>',
  page: '<path d="M6.5 3.5h7.5l4 4v13h-11.5z" stroke-width="1.5"/><path d="M14 3.5v4h4" stroke-width="1.5"/><path d="M9.5 12h5M9.5 15h5M9.5 18h3.5" stroke-width="1.4"/>',
  comment: '<path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-7l-4 3v-3H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5z" stroke-width="1.6"/><path d="M7.5 9.5h9M7.5 12.5h6" stroke-width="1.6"/>',
  linkadd: '<path d="M9.5 14.5a3.6 3.6 0 0 0 5.1 0l2.8-2.8a3.6 3.6 0 0 0-5.1-5.1l-1.1 1.1" stroke-width="1.8"/><path d="M13 11a3.6 3.6 0 0 0-5.1 0l-2.8 2.8a3.6 3.6 0 0 0 5.1 5.1" stroke-width="1.8"/><circle cx="18" cy="18" r="4" fill="currentColor" stroke="none"/><path d="M18 16v4M16 18h4" stroke="#fff" stroke-width="1.6"/>',
  keyboard: '<rect x="2.5" y="4.5" width="19" height="12" rx="2.5" stroke-width="1.6"/><path d="M6 8h.01M9 8h.01M12 8h.01M15 8h.01M18 8h.01M6 11h.01M9 11h.01M12 11h.01M15 11h.01M18 11h.01M8 13.7h8" stroke-width="1.8"/><path d="M9.5 19l2.5 2 2.5-2" stroke-width="1.6"/>',
  sidebar: '<rect x="3" y="4.5" width="18" height="15" rx="2.5" stroke-width="1.7"/><path d="M9.5 4.5v15" stroke-width="1.7"/>',
  arrowl: '<path d="M19 12H5.5M11 6l-6 6 6 6" stroke-width="1.8"/>', arrowr: '<path d="M5 12h13.5M13 6l6 6-6 6" stroke-width="1.8"/>',
  star: '<path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" stroke-width="1.6"/>',
  starf: '<path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" fill="#F5B400" stroke="#F5B400" stroke-width="1.4"/>',
  compose: '<path d="M11 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V13" stroke-width="1.8"/><path d="M17.6 3.9a1.9 1.9 0 0 1 2.7 2.7L12.5 14.4l-3.5.8.8-3.5z" stroke-width="1.8"/>',
  filelink: '<path d="M6.5 3.5h7.5l4 4v13h-11.5z" stroke-width="1.6"/><path d="M14 3.5v4h4" stroke-width="1.6"/><path d="M12 17v-6M9.5 13.5L12 11l2.5 2.5" stroke-width="1.6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16" stroke-width="1.8"/>',
  home: '<path d="M4 11.2L12 4.5l8 6.7V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5h-6v5.5H5.5A1.5 1.5 0 0 1 4 19z" fill="currentColor" stroke="currentColor" stroke-width="1.2"/>',
  inbox: '<path d="M4 13.5l2.4-7.2A1.8 1.8 0 0 1 8.1 5h7.8a1.8 1.8 0 0 1 1.7 1.3l2.4 7.2V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18z" stroke-width="1.7"/><path d="M4 13.5h4.5l1 2h5l1-2H20" stroke-width="1.7"/>',
  help: '<circle cx="12" cy="12" r="8.5" stroke-width="1.7"/><path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6" stroke-width="1.7"/><path d="M12 17h.01" stroke-width="2.4"/>',
  layers: '<path d="M12 3.5l8.5 4.5-8.5 4.5-8.5-4.5z" stroke-width="1.6"/><path d="M3.5 12l8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5" stroke-width="1.6"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" stroke-width="1.6"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" stroke-width="1.6"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0" stroke-width="1.6"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.6" stroke-width="1.6"/><path d="M4 4.5v4.1h4.1M12 7.5V12l3 2" stroke-width="1.6"/>',
  folder: '<path d="M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4.3l2 2.2H19a1.5 1.5 0 0 1 1.5 1.5v8.8A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z" stroke-width="1.6"/>',
  users: '<circle cx="9" cy="8.5" r="3.2" stroke-width="1.6"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M15.5 5.6a3.2 3.2 0 0 1 0 6M17 13.8a5.5 5.5 0 0 1 3.5 5.2" stroke-width="1.6"/>',
  listcheck: '<path d="M4 6.5l1.5 1.5L8 5.5M4 12.5L5.5 14 8 11.5M4 18.5L5.5 20 8 17.5M11 7h9M11 13h9M11 19h9" stroke-width="1.6"/>',
  barchart: '<path d="M4 20.5h16M7 17V10M12 17V5.5M17 17v-4" stroke-width="1.8"/>',
  target: '<circle cx="12" cy="12" r="8" stroke-width="1.6"/><circle cx="12" cy="12" r="3.5" stroke-width="1.6"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" stroke-width="1.6"/>',
  filex: '<path d="M6.5 3.5h7.5l4 4v13h-11.5z" stroke-width="1.6"/><path d="M14 3.5v4h4M10 12l4 4M14 12l-4 4" stroke-width="1.6"/>',
  timeline: '<circle cx="6" cy="6" r="2" stroke-width="1.6"/><circle cx="6" cy="18" r="2" stroke-width="1.6"/><circle cx="18" cy="12" r="2" stroke-width="1.6"/><path d="M8 6h4a4 4 0 0 1 4 4v0M8 18h4a4 4 0 0 0 4-4v0" stroke-width="1.6"/>',
  columns: '<rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke-width="1.6"/><path d="M9.2 4.5v15M14.8 4.5v15" stroke-width="1.6"/>',
  linechart: '<path d="M4 4v16.5h16.5" stroke-width="1.6"/><path d="M7.5 15l4-4.5 3 3 5-6" stroke-width="1.6"/>',
  chevup: '<path d="M7 14.5l5-5 5 5" stroke-width="1.8"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  highlight: '<path d="M14.5 4.5l5 5-8 8H6.5v-5z"/><path d="M4 21h16" stroke-width="2.4" stroke="#E8B931"/>',
  selectall: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8.5 9h7M8.5 12h7M8.5 15h4.5"/>',
  pages: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', back: '<path d="M15 5l-7 7 7 7"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>',
  export: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  filter: '<path d="M4 7h16M7 12h10M10 17h4" stroke-width="1.8"/>', sliders: '<path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/>',
  chevd: '<path d="M6 9l6 6 6-6"/>', chevr: '<path d="M9 5l7 7-7 7"/>', check: '<path d="M5 12l5 5 9-10"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>',
  settings: '<path d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z" stroke-width="1.8"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.7 7.7 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.7 7.7 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.7 7.7 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.7 7.7 0 0 0 2.6-1.5l2.4 1 2-3.4z" stroke-width="1.6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  clip: '<path d="M20 11l-8 8a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7"/>',
  undo: '<path d="M9 14L4.5 9.5 9 5" stroke-width="1.8"/><path d="M4.5 9.5H15a5 5 0 0 1 0 10h-3.5" stroke-width="1.8"/>', addprop: '<path d="M4 7h10M4 12h7M4 17h6M17 14v6M14 17h6"/>',
  text: '<path d="M4 6.5h16M4 12h16M4 17.5h11" stroke-width="1.8"/>', list: '<circle cx="5" cy="6.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="5" cy="17.5" r="1.4" fill="currentColor" stroke="none"/><path d="M9.5 6.5H20M9.5 12H20M9.5 17.5H20" stroke-width="1.8"/>',
  link: '<path d="M10.5 13.5a3.8 3.8 0 0 0 5.4 0l3-3a3.8 3.8 0 0 0-5.4-5.4l-1.2 1.2" stroke-width="1.8"/><path d="M13.5 10.5a3.8 3.8 0 0 0-5.4 0l-3 3a3.8 3.8 0 0 0 5.4 5.4l1.2-1.2" stroke-width="1.8"/>',
  date: '<rect x="4" y="5.5" width="16" height="14" rx="2" stroke-width="1.8"/><path d="M4 7.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2V10H4z" fill="currentColor" stroke="none"/><path d="M8.5 3.5v3M15.5 3.5v3" stroke-width="1.8"/>', status: '<circle cx="19.50" cy="12.00" r="1.00" fill="currentColor" stroke="none"/><circle cx="17.30" cy="17.30" r="1.12" fill="currentColor" stroke="none"/><circle cx="12.00" cy="19.50" r="1.24" fill="currentColor" stroke="none"/><circle cx="6.70" cy="17.30" r="1.36" fill="currentColor" stroke="none"/><circle cx="4.50" cy="12.00" r="1.48" fill="currentColor" stroke="none"/><circle cx="6.70" cy="6.70" r="1.60" fill="currentColor" stroke="none"/><circle cx="12.00" cy="4.50" r="1.72" fill="currentColor" stroke="none"/><circle cx="17.30" cy="6.70" r="1.84" fill="currentColor" stroke="none"/>',
  formula: '<path d="M17.5 5.5h-11l6 6.5-6 6.5h11" stroke-width="2"/>', checkbox: '<rect x="4.5" y="4.5" width="15" height="15" rx="2.5" stroke-width="1.8"/><path d="M8.5 12.2l2.5 2.5 4.6-5.2" stroke-width="1.8"/>',
  title: '<text x="12" y="17.5" text-anchor="middle" font-size="16" font-weight="600" font-family="-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif" fill="currentColor" stroke="none">Aa</text>', number: '<path d="M9.5 4.5L8 19.5M16 4.5l-1.5 15M5 9h14.5M4.5 15H19" stroke-width="1.8"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  sort: '<path d="M8 4.5v15M4.5 16l3.5 3.5 3.5-3.5M16 19.5v-15M12.5 8L16 4.5 19.5 8" stroke-width="1.8"/>', eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c6.5 0 10 6 10 6a16 16 0 0 1-3.1 3.7M6.2 7.6C3.6 9.4 2 12 2 12s3.5 6 10 6c1.6 0 3-.4 4.2-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>', grip: '<g fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></g>', eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  group: '<rect x="4" y="5" width="4" height="4" rx="1"/><rect x="10" y="5" width="4" height="4" rx="1"/><rect x="16" y="5" width="4" height="4" rx="1"/><rect x="4" y="13" width="4" height="4" rx="1"/><rect x="10" y="13" width="4" height="4" rx="1"/><rect x="16" y="13" width="4" height="4" rx="1"/>',
  paint: '<rect x="4" y="3" width="14" height="6" rx="1"/><path d="M18 6h2v5h-8v3"/><rect x="10" y="14" width="4" height="7" rx="1"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>', source: '<circle cx="18" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><path d="M16 6H8a3 3 0 0 0 0 6h8a3 3 0 0 1 0 6H8"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/><path d="M13 16a2 2 0 0 1 3-3"/>',
  board: '<rect x="4" y="4" width="4" height="16" rx="1"/><rect x="10" y="4" width="4" height="10" rx="1"/><rect x="16" y="4" width="4" height="13" rx="1"/>',
  person: '<circle cx="12" cy="9" r="4"/><path d="M4.5 20c1.4-3.4 4.2-5 7.5-5s6.1 1.6 7.5 5"/>', sync: '<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>',
  drag: '<circle cx="9" cy="6" r="1.4" fill="currentColor"/><circle cx="15" cy="6" r="1.4" fill="currentColor"/><circle cx="9" cy="12" r="1.4" fill="currentColor"/><circle cx="15" cy="12" r="1.4" fill="currentColor"/><circle cx="9" cy="18" r="1.4" fill="currentColor"/><circle cx="15" cy="18" r="1.4" fill="currentColor"/>',
  import: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 19h14"/>', face: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9v1M15 9v1M12 9v4h-1M9.5 15.5a3.5 3.5 0 0 0 5 0"/>'
};
// icons are built once and copied after that (much faster than building each one)
const ICON_CACHE = new Map();
export function icon(name, size = 20, extra = '') {
  const key = name + '|' + size + '|' + extra; let t = ICON_CACHE.get(key);
  if (!t) {
    t = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    t.setAttribute('width', size); t.setAttribute('height', size); t.setAttribute('viewBox', '0 0 24 24'); t.setAttribute('aria-hidden', 'true');
    t.setAttribute('fill', 'none'); t.setAttribute('stroke', 'currentColor'); t.setAttribute('stroke-width', '2'); t.setAttribute('stroke-linecap', 'round'); t.setAttribute('stroke-linejoin', 'round');
    if (extra) t.setAttribute('class', extra);
    t.innerHTML = P[name] || P.pages; ICON_CACHE.set(key, t);
  }
  return t.cloneNode(true);
}
/** Build a long list in steps: the first `first` items now, the rest a moment later, so the screen shows at once. */
export function later(items, build, { first = 40, step = 60, into } = {}) {
  const now = items.slice(0, first).map(build);
  if (items.length > first) {
    const holder = into || h('div', { class: 'later' }); let i = first;
    const go = () => { if (!holder.isConnected) return; const part = items.slice(i, i + step); i += step; holder.append(...part.map(build)); if (i < items.length) setTimeout(go, 16); };
    setTimeout(go, 30);
    if (!into) now.push(holder);
  }
  return now;
}
export const logo = (size = 30) => h('div', { class: 'logo', style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.62) + 'px', borderRadius: Math.round(size * 0.27) + 'px' }, 'aria-hidden': 'true' }, 'F');

// ---- sanitiser: only a small set of inline tags survives; never runs scripts ----
/** text colours / highlights and sizes the editor keeps (span[data-c], mark[data-c], span[data-s]) */
export const TEXT_COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
export const TEXT_SIZES = ['s', 'l', 'xl'];
const OK = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'CODE', 'A', 'BR', 'SPAN', 'MARK']);
export function sanitize(html) {
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  const walk = node => {
    for (const c of [...node.childNodes]) {
      if (c.nodeType === 3) continue;
      if (c.nodeType !== 1 || !OK.has(c.tagName)) { if (c.nodeType === 1 && !['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT'].includes(c.tagName)) { walk(c); c.replaceWith(...c.childNodes); } else c.remove(); continue; }
      for (const a of [...c.attributes]) {
        const keep = (c.tagName === 'A' && a.name === 'href' && /^(https?:|mailto:|tel:|#)/i.test(a.value)) || (c.tagName === 'MARK' && a.name === 'data-c' && TEXT_COLORS.includes(a.value)) || (c.tagName === 'SPAN' && a.name === 'data-c' && TEXT_COLORS.includes(a.value)) || (c.tagName === 'SPAN' && a.name === 'data-s' && TEXT_SIZES.includes(a.value));
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
/** the zoom chosen in ⋯ → Zoom (1 = 100%) */
export const zoomNow = () => document.documentElement.classList.contains('zoomed') ? (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--zoom')) || 1) : 1;
export function menu(anchor, items, { width = 240 } = {}) {
  closeMenus();
  const r = anchor.getBoundingClientRect();
  const m = h('div', { class: 'menu', role: 'menu', style: { width: width + 'px' } },
    items.map(it => it === '-' ? h('div', { class: 'sep' }) : it.el ? it.el :
      h('button', { role: 'menuitem', class: it.danger ? 'danger' : '', onclick: () => { closeMenus(); it.run(); } },
        it.icon ? icon(it.icon, 16) : null, h('span', {}, it.label), it.checked ? icon('check', 16, 'chk') : null)));
  document.body.append(m);
  // with zoom on (⋯ → Zoom) the menu is scaled from its top-left corner, so place it by its scaled size
  const z = zoomNow(), mw = Math.min(width * z, innerWidth - 16);
  if (mw < width * z) m.style.width = (mw / z) + 'px'; // never wider than the screen
  const mh = m.offsetHeight * z;
  const left = Math.min(Math.max(8, r.left), innerWidth - mw - 8);
  const top = r.bottom + 6 + mh > innerHeight ? Math.max(8, r.top - 6 - mh) : r.bottom + 6;
  Object.assign(m.style, { left: left + 'px', top: top + 'px' });
  setTimeout(() => document.addEventListener('pointerdown', outside, { once: true }), 0);
  function outside(e) { if (!m.isConnected) return; if (!m.contains(e.target)) closeMenus(); else document.addEventListener('pointerdown', outside, { once: true }); } // a menu that already closed must not close the next one
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

/** A text box that behaves like an <input>/<textarea> (.value, setSelectionRange, input/keydown events)
 *  but is an editable area, so iPhone Safari does not add its ^ v ✓ bar above the keyboard (like Notion). */
export function textbox({ value = '', placeholder = '', multiline = false, cls = '', label = '', attrs = {}, style = null, oninput, onkeydown, onblur } = {}) {
  const el = h('div', { class: ('tbox ' + cls).trim(), role: 'textbox', 'aria-label': label || placeholder, 'aria-multiline': multiline ? 'true' : 'false', 'data-ph': placeholder, tabindex: '0', autocorrect: 'on', ...attrs, style });
  el.contentEditable = 'plaintext-only'; if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
  const read = () => { let t = el.innerText ?? el.textContent; t = t.replace(/\u00a0/g, ' '); if (t === '\n') t = ''; return multiline ? t.replace(/\n$/, '') : t.replace(/\n/g, ' '); };
  Object.defineProperty(el, 'value', { get: read, set: v => { el.textContent = v == null ? '' : String(v); } });
  el.setSelectionRange = (a, b) => { const sel = getSelection(), r = document.createRange(), tn = el.firstChild;
    if (tn && tn.nodeType === 3 && el.childNodes.length === 1) { const n = tn.length; r.setStart(tn, Math.min(a, n)); r.setEnd(tn, Math.min(b ?? a, n)); } else { r.selectNodeContents(el); r.collapse(a === 0 && !b ? true : false); }
    sel.removeAllRanges(); sel.addRange(r); };
  el.select = () => { const r = document.createRange(); r.selectNodeContents(el); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); };
  el.value = value;
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && !multiline) e.preventDefault(); onkeydown && onkeydown(e); });
  el.addEventListener('input', e => { if (!el.textContent && el.innerHTML) el.innerHTML = ''; oninput && oninput(e); });
  el.addEventListener('paste', e => { if (el.contentEditable === 'plaintext-only') return; e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain')); });
  if (onblur) el.addEventListener('blur', onblur);
  return el;
}

// ---- choose a photo (profile photo, cover, page icon) ----
// The file input is put on the page while it is open: iPhone (especially from the Home Screen) ignores one that is not.
// Big camera photos are made smaller before saving (max side `max` px, JPEG), which also turns HEIC into JPEG.
export function pickImage(onFile, { max = 1600 } = {}) {
  document.querySelector('input.imgpick')?.remove();
  const inp = h('input', { type: 'file', accept: 'image/*', class: 'imgpick', 'aria-hidden': 'true', tabindex: '-1',
    style: { position: 'fixed', left: '-1000px', top: '0', width: '1px', height: '1px', opacity: '0' } });
  const done = () => setTimeout(() => inp.remove(), 1000);
  inp.addEventListener('cancel', done);
  inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0]; done(); if (!f) return;
    try {
      if (f.type && !f.type.startsWith('image/') && !/\.(heic|heif)$/i.test(f.name)) { toast('Please choose a photo.'); return; }
      await onFile(await shrinkImage(f, max));
    } catch (e) { toast('The photo could not be added: ' + (e && e.message || 'please try another photo.')); }
  });
  document.body.append(inp);
  inp.click();
}
async function shrinkImage(f, max) {
  try {
    const url = URL.createObjectURL(f);
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    URL.revokeObjectURL(url);
    const w = img.naturalWidth, hh = img.naturalHeight; if (!w || !hh) return f;
    const k = Math.min(1, max / Math.max(w, hh));
    if (k === 1 && f.size < 1.5e6 && /jpe?g|png|webp/i.test(f.type)) return f; // already small: keep as it is
    const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(hh * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.86));
    if (!blob) return f;
    return new File([blob], (f.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return f; } // the browser could not read it: save the original
}
