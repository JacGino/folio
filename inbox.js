// Folio v2 — ECPAR rejection emails.
// The iPhone shortcut "ECPAR rejected" (Mail automation: from SAP_WFRT, subject "E-CPAR Approval Request - Rejected")
// drops each email into inbox/ of the data repo. On every sync Folio reads them, finds the project by its
// Project Reference (ECPAR No) — BTU260514 in the subject = BTU-260514 — records the ECPAR rejection with the
// email's Rejected Date and Notes, and removes the file. Emails that match no project wait on the Rejected ECPAR
// page, where you pick the project or dismiss them. An email can also be pasted in by hand (older emails).
import * as D from './data.js';
import * as DB from './db.js';
import * as E from './entities.js';
import * as Sync from './sync.js';
import * as S from './store.js';
import { toISODate, formatDate, parseDate } from './dates.js';

const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** the parts of an SAP_WFRT "E-CPAR Approval Request - Rejected" email (plain text or HTML) */
export function parseEcparEmail(raw, fileName = '') {
  let t = String(raw || '');
  t = t.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(td|th)>/gi, '\t').replace(/<\/(tr|p|div)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"');
  const flat = t.replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  const refM = flat.match(/\bBTU\s?-?\s?(\d{6})\b/i); if (!refM) return null;
  const ref = 'BTU-' + refM[1];
  // the table row: after the headings ("… Rejected Date Notes"), before "Please find the document…"
  let data = flat; const hi = flat.search(/Rejected\s+Date\s+Notes/i);
  if (hi >= 0) data = flat.slice(hi).replace(/^Rejected\s+Date\s+Notes\s*/i, '');
  const end = data.search(/Please find the document|Please find|Thank you/i); if (end >= 0) data = data.slice(0, end);
  const dm = data.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/);
  let date = '';
  if (dm) date = `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
  else { const fm = String(fileName).match(/(\d{4})(\d{2})(\d{2})-\d{6}/); if (fm) date = `${fm[1]}-${fm[2]}-${fm[3]}`; } // no date in the text: the day it arrived
  const bm = data.match(/MYR\s*[\d,]+(?:\.\d{1,2})?/i), vm = data.match(/\bZ\d{2}\b/);
  let by = '', notes = '';
  if (dm) { notes = data.slice(dm.index + dm[0].length).trim(); if (bm && bm.index < dm.index) by = data.slice(bm.index + bm[0].length, dm.index).trim(); }
  return { ref, date, by, notes, budget: bm ? bm[0] : '', version: vm ? vm[0] : '', rejected: /reject/i.test(flat) };
}

/** several emails pasted together: one result per BTU number */
export function parseEmails(raw) {
  const parts = String(raw || '').split(/(?=\bDear\s)/i).map(x => parseEcparEmail(x)).filter(Boolean);
  const by = new Map(); for (const p of parts) { const o = by.get(p.ref); if (!o || (!o.date && p.date) || (!o.notes && p.notes && p.date)) by.set(p.ref, p); } // the subject line alone has no date: the table wins
  const out = [...by.values()];
  if (out.length) return out;
  const one = parseEcparEmail(raw); return one ? [one] : [];
}
/** the project whose Project Reference (ECPAR No) is this BTU number */
export function findProject(ref) {
  const d = DB.kpiDb(); if (!d) return null;
  const p = DB.propByName(d, DB.REF_ECPAR), want = norm(ref);
  return DB.rows(d.id).find(r => (p && norm(D.val(r, 'p:' + p.id)) === want) || (E.ecparOf(r) && norm(D.val(E.ecparOf(r), 'p:ref')) === want)) || null;
}

/** record it on the project, unless this rejection is already there (same day) */
// only "already" when the ECPAR is open with this very rejection date: a rejection you removed by hand earlier can be recorded again
export function recordRejection(row, p) {
  const date = p.date || toISODate(new Date());
  const e = E.ecparOf(row);
  const sameDay = x => toISODate(x) === toISODate(date);
  if (e && D.val(e, 'p:status') === 'Pending Revision' && sameDay(D.val(e, 'p:rejected'))) return 'already';
  // an archived project comes back out of the archive, so the rejection shows on the Rejected ECPAR list
  const d = DB.kpiDb(), ap = d && DB.propByName(d, 'Archive');
  if (ap && D.val(row, 'p:' + ap.id) === true) D.update(row.id, { ['p:' + ap.id]: false, rejarch: null });
  E.rejectEcpar(row, date, '', { correction: p.notes || '', remarks: 'From the SAP_WFRT email' + (p.by ? ', rejected by ' + p.by : '') + '.' });
  return 'new';
}

let unmatched = [], busy = false;
const listeners = new Set();
export const onInbox = fn => (listeners.add(fn), () => listeners.delete(fn));
export const unmatchedEmails = () => unmatched;
export async function loadUnmatched() { unmatched = (await S.meta.get('ecpar-unmatched')) || []; }
const textOf = d => d == null ? '' : typeof d === 'string' ? d
  : (Object.entries(d).find(([k]) => /^(text|body|content|email)$/i.test(k)) || [])[1] ?? Object.values(d).filter(v => typeof v === 'string').join('\n');

/** read inbox/ (after each sync); returns the BTU numbers recorded */
export async function checkInbox() {
  if (busy || !Sync.connected() || !DB.kpiDb()) return [];
  busy = true; const done = [], waiting = [];
  try {
    E.ensureAll();
    for (const f of await Sync.inboxList()) {
      const p = parseEcparEmail(textOf(await Sync.inboxRead(f.path)), f.name);
      if (!p || !p.rejected) { await Sync.inboxDrop(f.path, f.sha); continue; } // empty test runs and anything that is not a rejection
      const row = findProject(p.ref);
      if (!row) { waiting.push({ ...p, path: f.path, sha: f.sha, file: f.name }); continue; } // stays in inbox/ until you pick the project
      if (recordRejection(row, p) === 'new') done.push(p.ref);
      await Sync.inboxDrop(f.path, f.sha);
    }
    unmatched = waiting; await S.meta.set('ecpar-unmatched', waiting);
  } finally { busy = false; }
  listeners.forEach(fn => fn({ done, unmatched }));
  return done;
}

/** an email that matched no project: record it on the project you pick, or dismiss it */
export async function resolveUnmatched(item, row) {
  if (row) recordRejection(row, item);
  try { await Sync.inboxDrop(item.path, item.sha); } catch (e) { /* gone already (another device) */ }
  unmatched = unmatched.filter(x => x.path !== item.path); await S.meta.set('ecpar-unmatched', unmatched);
  listeners.forEach(fn => fn({ done: row ? [item.ref] : [], unmatched }));
}

export const shortDate = iso => { const d = parseDate(iso); return d ? formatDate(d, 'DD/MM/YYYY') : ''; };
