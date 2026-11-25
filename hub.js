// Folio v2 — the menu's Notion-style screens: Comments, Calendar, Inbox (reminders).
import * as D from './data.js';
import * as DB from './db.js';
import * as E from './entities.js';
import { h, icon, logo, sanitize, strip, sheet, toast } from './ui.js';
import * as Push from './push.js';
import { formatDate, toISODate } from './dates.js';
import { state, openTask, now, render, download, elabel, moreMenu } from './app.js';
import { head as coverHead, pageHead } from './views.js';
import { reminderOn, setReminder } from './notify.js';

const head = (title, sub, ic) => pageHead(elabel('title.' + title.toLowerCase(), title, 'span'), sub || '', ic, { crumb: title });
const when = t => { const d = new Date(t), n = new Date(now()); const days = Math.round((new Date(n.toDateString()) - new Date(d.toDateString())) / 864e5);
  return days === 0 ? 'Today ' + d.toTimeString().slice(0, 5) : days === 1 ? 'Yesterday' : formatDate(d, 'DD/MM/YYYY'); };

// ---------- Activity Log: every project's log entries (comments, notes, ECPAR / ECX events…), newest first ----------
let cFrom = '', cTo = ''; // date filter (YYYY-MM-DD) on the project's Date Assigned, kept while the app is open
export function commentsScreen() {
  state.ctx = {};
  const dbr = DB.kpiDb();
  const rows = dbr ? DB.rows(dbr.id) : [];
  const ap = dbr && DB.propByName(dbr, 'Date Assigned'), ep = dbr && DB.propByName(dbr, DB.REF_ECX);
  const assigned = r => ap ? toISODate(DB.value(r, ap)) : '';
  const all = [];
  for (const r of rows) for (const e of E.history(r)) if (!String(e.id).startsWith('new')) all.push({ ...e, row: r });
  const inRange = x => (!cFrom && !cTo) || (assigned(x.row) && (!cFrom || assigned(x.row) >= cFrom) && (!cTo || assigned(x.row) <= cTo));
  const list = all.filter(inRange).sort((a, b) => b.t - a.t);
  const field = (label, val, set) => h('label', { class: 'dfield' }, h('span', {}, label), h('input', { type: 'date', class: 'field', value: val, onchange: e => { set(e.target.value); render(); } }));
  const filtered = cFrom || cTo;
  const sub = filtered ? `${list.length} of ${all.length} entries · ${cFrom ? formatDate(cFrom, 'DD/MM/YYYY') : 'start'} – ${cTo ? formatDate(cTo, 'DD/MM/YYYY') : 'today'}` : list.length + (list.length === 1 ? ' entry' : ' entries') + ' across all projects';
  const shown = list.slice(0, 300);
  return h('div', { class: 'wrap home' }, head('Activity Log', sub, 'history'),
    h('div', { class: 'dfilter' }, h('span', { class: 'dftitle' }, icon('filter', 16), 'Date Assigned'),
      field('From', cFrom, v => { cFrom = v; if (cTo && v && v > cTo) cTo = v; }),
      field('To', cTo, v => { cTo = v; if (cFrom && v && v < cFrom) cFrom = v; }),
      filtered ? h('button', { class: 'btn', onclick: () => { cFrom = cTo = ''; render(); } }, 'Clear') : null),
    shown.length ? h('div', { class: 'hublist' }, shown.map(x => {
      const ecx = ep ? DB.raw(x.row, ep) : '';
      const open = () => { location.hash = '#/project/' + x.row.id + '/log'; };
      const kind = x.type === 'Comment' ? 'comment' : x.ecx ? 'ecxs' : x.ecpar ? 'ecpar' : 'history';
      return h('div', { class: 'hubitem', role: 'button', tabindex: '0', 'aria-label': 'Open the Activity Log of ' + DB.title(x.row), onclick: open, onkeydown: e => { if (e.key === 'Enter') open(); } },
        h('span', { class: 'hi-ic' }, icon(kind, 20)),
        h('span', { class: 'hi-body' }, h('span', { class: 'hi-top' }, h('b', {}, DB.title(x.row)), h('small', {}, when(x.t))),
          h('span', { class: 'asgd' }, h('span', { class: 'hi-type' }, x.type || 'Note'), assigned(x.row) ? ' · Assigned ' + formatDate(assigned(x.row), 'DD/MM/YYYY') : ''),
          ecx ? h('a', { class: 'ecxlink', href: '#/project/' + x.row.id, onclick: e => { e.stopPropagation(); } }, icon('filelink', 15), ecx) : null,
          h('span', { class: 'hi-text' }, strip(String(x.text || x.reason || '')).slice(0, 240))));
    }), list.length > shown.length ? h('p', { class: 'muted small' }, `Showing the latest ${shown.length} of ${list.length}. Narrow the dates to see older entries.`) : null)
    : h('p', { class: 'empty' }, filtered ? 'No log entries for projects assigned between these dates.' : 'No log entries yet. Notes, comments and ECPAR / ECX events from every project show up here.'));
}

// ---------- Calendar: due dates and ECPAR amendments by month ----------
let monthOff = 0, picked = null;
export function calendarScreen() {
  const n = now(), base = new Date(n), first = new Date(base.getFullYear(), base.getMonth() + monthOff, 1);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const tasks = DB.kpiTasks(n).filter(t => t.due), today = toISODate(new Date(n));
  const byDay = new Map(); for (const t of tasks) { const k = toISODate(t.due); byDay.set(k, [...(byDay.get(k) || []), t]); }
  const color = t => t.days < 0 ? 'red' : t.amend ? 'orange' : t.days <= 2 ? 'orange' : 'blue';
  const days = [...Array(42)].map((_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const sel = picked || today;
  const dayList = (byDay.get(sel) || []).sort((a, b) => a.title.localeCompare(b.title));
  state.ctx = { more: a => moreMenu(a) };
  // same cover header as the other pages (cover photo, menu ← →, bell, ⋯); month buttons in the row under it
  return h('div', { class: 'wrap home calpage' }, coverHead({ crumb: 'Calendar', title: elabel('title.calendar', 'Calendar', 'span'), desc: formatDate(first, 'MMMM YYYY'), ic: 'date', more: a => moreMenu(a),
      tools: [h('div', { class: 'calnav' },
        h('button', { class: 'hbtn glass', 'aria-label': 'Previous month', onclick: () => { monthOff--; render(); } }, icon('back', 18)),
        h('button', { class: 'btn', onclick: () => { monthOff = 0; picked = null; render(); } }, 'Today'),
        h('button', { class: 'hbtn glass', 'aria-label': 'Next month', onclick: () => { monthOff++; render(); } }, icon('chevr', 18)))] }),
    h('div', { class: 'icloud' }, icon('sync', 18), h('span', {}, 'iCloud Calendar: the Folio widget keeps a “Folio” calendar up to date, or add all due dates now.'),
      h('button', { class: 'btn', onclick: () => download('Folio due dates.ics', icsFor(DB.kpiTasks(n).filter(t => t.due)), 'text/calendar') }, 'Add to iCloud Calendar')),
    h('div', { class: 'mcal', role: 'grid' }, ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => h('div', { class: 'mh' }, d)),
      days.map(d => { const iso = toISODate(d), evs = byDay.get(iso) || [];
        return h('button', { class: 'md' + (d.getMonth() !== first.getMonth() ? ' out' : '') + (iso === today ? ' now' : '') + (iso === sel ? ' sel' : ''), 'aria-label': formatDate(d, 'D MMMM') + (evs.length ? ', ' + evs.length + ' due' : ''), onclick: () => { picked = iso; render(); } },
          h('span', { class: 'dn' }, d.getDate()), h('span', { class: 'dots' }, evs.slice(0, 4).map(t => h('i', { class: color(t) })))); })),
    h('div', { class: 'calday' }, h('h2', {}, formatDate(sel, 'dddd, D MMMM YYYY')),
      h('a', { class: 'btn calbtn', href: calshow(sel) }, icon('date', 16), 'Open in iPhone Calendar')),
    dayList.length ? h('div', { class: 'hublist' }, dayList.map(t => h('button', { class: 'hubitem', onclick: () => openTask(t.id) },
      h('span', { class: 'hi-dot ' + color(t) }), h('span', { class: 'hi-body' }, h('span', { class: 'hi-top' }, h('b', {}, t.title), h('small', {}, t.amend ? 'Amendment' : t.status || '')), t.address ? h('span', { class: 'hi-text' }, t.address) : null))))
      : h('p', { class: 'empty' }, 'Nothing due on this day.'));
}

// ---------- Inbox: reminders worked out from the same dates as the calendar ----------
export function inboxScreen() {
  state.ctx = {};
  const n = now(); const tasks = DB.kpiTasks(n).filter(t => t.days != null && t.days <= 1).sort((a, b) => a.days - b.days);
  const msg = t => (t.amend ? 'Amendment ' : '') + (t.days < 0 ? `overdue ${-t.days} ${-t.days === 1 ? 'day' : 'days'}` : t.days === 0 ? 'due today' : 'due tomorrow');
  const groups = [['Overdue', t => t.days < 0, 'red'], ['Today', t => t.days === 0, 'orange'], ['Tomorrow', t => t.days === 1, 'yellow']];
  const sw = h('input', { type: 'checkbox', class: 'switch', role: 'switch', 'aria-label': 'Reminder at 08:00', onchange: async e => { const ok = await setReminder(e.target.checked); e.target.checked = !!ok; } });
  reminderOn().then(v => { sw.checked = v; });
  return h('div', { class: 'wrap home' }, head('Inbox', 'Overdue, due today and due tomorrow', 'inbox'),
    pushRow(),
    h('label', { class: 'remind' }, icon('today', 20), h('span', {}, h('b', {}, 'Reminder at 08:00 (while Folio is open)'), h('small', {}, 'Off when push notifications are on, so you do not get it twice')), sw),
    groups.map(([label, test, c]) => { const list = tasks.filter(test); return list.length ? [h('div', { class: 'inboxh ' + c }, label),
      h('div', { class: 'hublist' }, list.map(t => h('button', { class: 'hubitem', onclick: () => openTask(t.id) },
        h('span', { class: 'hi-dot ' + c }), h('span', { class: 'hi-body' }, h('span', { class: 'hi-top' }, h('b', {}, t.title), h('small', {}, formatDate(t.due, 'DD/MM/YYYY'))), h('span', { class: 'hi-text' }, msg(t))))))] : []; }),
    tasks.length ? null : h('p', { class: 'empty' }, 'Nothing overdue, due today or due tomorrow.'));
}

// open Apple Calendar on a day (seconds since 1 Jan 2001, Apple's calendar epoch)
function calshow(iso) { const d = new Date(iso + 'T09:00:00'); return 'calshow:' + Math.round((d - new Date('2001-01-01T00:00:00Z')) / 1000); }
// all due dates as all-day events; opening the file on iPhone offers "Add All" to a calendar
function icsFor(tasks) {
  const esc = s => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const day = d => toISODate(d).replace(/-/g, ''); const next = d => { const x = new Date(d); x.setDate(x.getDate() + 1); return day(x); };
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ev = t => ['BEGIN:VEVENT', `UID:folio-${t.id}-${t.amend ? 'amend' : 'due'}@folio`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day(t.due)}`, `DTEND;VALUE=DATE:${next(t.due)}`,
    `SUMMARY:${esc((t.amend ? 'ECPAR amendment: ' : 'Due: ') + t.title)}`, `DESCRIPTION:${esc([t.ecx && 'Reference No (ECX No): ' + t.ecx, t.address, t.status && 'Status: ' + t.status].filter(Boolean).join('\n'))}`,
    t.address ? `LOCATION:${esc(t.address)}` : null, 'END:VEVENT'].filter(Boolean).join('\r\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Folio//EN', 'X-WR-CALNAME:Folio', ...tasks.map(ev), 'END:VCALENDAR'].join('\r\n');
}

// ---------- push notifications, even when Folio is closed (sent by the GitHub job in folio-data) ----------
function pushRow() {
  const sw = h('input', { type: 'checkbox', class: 'switch', role: 'switch', 'aria-label': 'Notifications when Folio is closed', onchange: async e => {
    const on = e.target.checked; e.target.disabled = true;
    try { if (on) { await Push.enablePush(); toast('Notifications are on for this ' + (/iPhone|iPad/.test(navigator.userAgent) ? 'device' : 'computer') + '.'); } else { await Push.disablePush(); toast('Notifications are off for this device.'); } }
    catch (err) { e.target.checked = false; if (err.message === 'nokeys') pushSetup(); else toast(err.message || String(err), 6000); }
    finally { e.target.disabled = false; render(); } } });
  Push.pushOn().then(v => { sw.checked = v; });
  return h('div', { class: 'remind pushrow' }, h('label', { class: 'pushlab' }, icon('bell', 20),
    h('span', {}, h('b', {}, 'Notifications when Folio is closed'), h('small', {}, 'Every 4 hours: Due Today and Rejected ECPAR — and ECPAR rejection emails as they arrive')), sw),
    h('span', { class: 'pushtests' },
      h('button', { class: 'gbtn', onclick: async () => { try { await Push.testLocal(); toast('Test sent. A notification should appear now.'); } catch (err) { toast(err.message || String(err), 6000); } } }, 'Test this device'),
      h('button', { class: 'gbtn', onclick: async () => { try { await Push.testGitHub(); toast('GitHub is sending it. It arrives in about a minute — you can close Folio to check.', 7000); } catch (err) { toast(err.message || String(err), 9000); } } }, 'Test from GitHub'),
      h('button', { class: 'link pushhelp', onclick: () => pushSetup(true) }, 'Setup on GitHub')));
}
/** one-time setup: make the keys, then save the private one as a GitHub secret (Folio does not keep it) */
function pushSetup(help = false) {
  const body = h('div', { class: 'pushsetup' });
  const s = sheet('Set up notifications', body, { done: 'Close', float: 'lg' });
  const steps = key => h('ol', { class: 'pushsteps' },
    h('li', {}, 'On github.com open ', h('b', {}, 'JacGino/folio-data'), ' → ', h('b', {}, 'Settings'), ' → ', h('b', {}, 'Secrets and variables'), ' → ', h('b', {}, 'Actions'), ' → ', h('b', {}, 'New repository secret'), '.'),
    h('li', {}, 'Name: ', h('code', {}, 'VAPID_PRIVATE_KEY'), '. Secret: paste the key', key ? ' below' : ' you copied when the keys were made', '. Save.'),
    h('li', {}, 'Upload the two notification files (folio-notify.yml and folio-notify.mjs) as described in the setup note.'),
    h('li', {}, 'Back here, turn on ', h('b', {}, 'Notifications when Folio is closed'), ' on each device (iPhone and iPad: from the Home Screen icon).'));
  const show = async () => {
    const cfg = await Push.config().catch(() => null);
    if (cfg && help) { body.replaceChildren(h('p', {}, 'The keys are made. If the GitHub secret is not saved yet:'), steps(false),
      h('p', { class: 'muted' }, 'Lost the private key? Make new keys — then save the new secret and turn notifications on again on each device.'),
      h('button', { class: 'btn block', onclick: make }, 'Make new keys')); return; }
    if (cfg) { s.close(); return; }
    body.replaceChildren(h('p', {}, 'First, Folio makes a pair of keys. The private key is shown once — you save it in your folio-data repo as a secret, so only the GitHub job can send to your devices.'),
      h('button', { class: 'btn primary block', onclick: make }, 'Make keys'));
  };
  const make = async () => {
    try {
      const k = await Push.setupKeys(); const box = h('textarea', { class: 'field pushkey', readonly: true, rows: 2 }); box.value = k.privateKey;
      body.replaceChildren(h('p', {}, h('b', {}, 'Private key — copy it now. '), 'Folio does not keep it.'), box,
        h('button', { class: 'btn block', onclick: async () => { try { await navigator.clipboard.writeText(k.privateKey); toast('Key copied.'); } catch { box.select(); toast('Select the key and copy it.'); } } }, 'Copy key'),
        steps(true));
    } catch (e) { toast(e.message || String(e), 6000); }
  };
  show();
}
