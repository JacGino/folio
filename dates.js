// Folio v2 — dates. Day-first parsing, Notion-style date maths.
const DAY = 86400000;
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const MON_SHORT = MONTHS.map(m => m.slice(0, 3));

export function isDate(v) { return v instanceof Date && !isNaN(v); }

function mk(y, m, d, hh = 0, mm = 0) {
  if (y < 100) y += 2000;
  const r = new Date(y, m, d, hh, mm);
  return (r.getFullYear() === y && r.getMonth() === m && r.getDate() === d) ? r : null;
}

function monthIndex(word) {
  const w = word.toLowerCase().replace(/\.$/, '');
  let i = MONTHS.indexOf(w); if (i >= 0) return i;
  i = MON_SHORT.indexOf(w.slice(0, 3)); return w.length >= 3 ? i : -1;
}

/** Parse a date. Day-first for numeric forms. Returns a local Date or null. */
export function parseDate(v) {
  if (v == null || v === '') return null;
  if (isDate(v)) return new Date(v.getTime());
  if (typeof v === 'number') return new Date(v);
  let s = String(v).trim();
  if (!s) return null;
  // Notion ranges "A → B": use the start
  s = s.split(/\s*(?:→|->)\s*/)[0].trim();
  // time suffix
  let hh = 0, mm = 0;
  const t = s.match(/\s+(\d{1,2}):(\d{2})\s*(am|pm)?\s*(\(.*\))?$/i);
  if (t) {
    hh = +t[1] % 12 + (t[3] && t[3].toLowerCase() === 'pm' ? 12 : (!t[3] && +t[1] === 12 ? 12 : 0));
    if (!t[3]) hh = +t[1];
    mm = +t[2]; s = s.slice(0, t.index).trim();
  }
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{2}):(\d{2}))?/))) return mk(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : hh, m[5] ? +m[5] : mm);
  if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/))) return mk(+m[3], +m[2] - 1, +m[1], hh, mm);
  if ((m = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/))) { const mi = monthIndex(m[1]); return mi < 0 ? null : mk(+m[3], mi, +m[2], hh, mm); }
  if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{4})$/))) { const mi = monthIndex(m[2]); return mi < 0 ? null : mk(+m[3], mi, +m[1], hh, mm); }
  return null;
}

export function startOfDay(d) { const r = new Date(d.getTime()); r.setHours(0, 0, 0, 0); return r; }

export function dateAdd(d, n, unit = 'days') {
  d = parseDate(d); if (!d || typeof n !== 'number' || isNaN(n)) return null;
  const r = new Date(d.getTime()); const u = String(unit).toLowerCase().replace(/s$/, '');
  if (u === 'day') r.setDate(r.getDate() + n);
  else if (u === 'week') r.setDate(r.getDate() + 7 * n);
  else if (u === 'month') r.setMonth(r.getMonth() + n);
  else if (u === 'quarter') r.setMonth(r.getMonth() + 3 * n);
  else if (u === 'year') r.setFullYear(r.getFullYear() + n);
  else if (u === 'hour') r.setTime(r.getTime() + n * 3600000);
  else if (u === 'minute') r.setTime(r.getTime() + n * 60000);
  else return null;
  return r;
}

/** a − b in whole units, truncated toward zero (Notion semantics). Null if either is empty. */
export function dateBetween(a, b, unit = 'days') {
  a = parseDate(a); b = parseDate(b); if (!a || !b) return null;
  const u = String(unit).toLowerCase().replace(/s$/, '');
  const utc = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
  const ms = utc(a) - utc(b);
  if (u === 'day') return Math.trunc(ms / DAY);
  if (u === 'week') return Math.trunc(ms / (7 * DAY));
  if (u === 'hour') return Math.trunc(ms / 3600000);
  if (u === 'minute') return Math.trunc(ms / 60000);
  if (u === 'month' || u === 'year' || u === 'quarter') {
    let months = (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
    if (months > 0 && a.getDate() < b.getDate()) months--;
    if (months < 0 && a.getDate() > b.getDate()) months++;
    return u === 'month' ? months : u === 'quarter' ? Math.trunc(months / 3) : Math.trunc(months / 12);
  }
  return null;
}

const WD = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const cap = s => s[0].toUpperCase() + s.slice(1);
/** Format: tokens YYYY MMMM MMM MM M DD D dddd ddd HH mm. Default "D MMMM YYYY". */
/** how date properties (Due Date, Date Assigned …) are shown everywhere */
export const DATE_FMT = 'DD/MM/YYYY';
export function formatDate(d, fmt = 'D MMMM YYYY') {
  d = parseDate(d); if (!d) return '';
  const p = n => String(n).padStart(2, '0');
  const map = { YYYY: d.getFullYear(), MMMM: cap(MONTHS[d.getMonth()]), MMM: cap(MON_SHORT[d.getMonth()]), MM: p(d.getMonth() + 1), M: d.getMonth() + 1,
    DD: p(d.getDate()), D: d.getDate(), dddd: WD[d.getDay()], ddd: WD[d.getDay()].slice(0, 3), HH: p(d.getHours()), mm: p(d.getMinutes()) };
  return fmt.replace(/YYYY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|mm/g, k => map[k]);
}

export function toISODate(d) { d = parseDate(d); return d ? formatDate(d, 'YYYY-MM-DD') : ''; }
