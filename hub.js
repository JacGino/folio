// Folio v2 — the menu's Notion-style screens: Comments, Calendar, Inbox (reminders).
import * as D from './data.js';
import * as DB from './db.js';
import { h, icon, logo, sanitize, strip } from './ui.js';
import { formatDate, toISODate } from './dates.js';
import { state, openTask, now, render, download } from './app.js';
import { reminderOn, setReminder } from './notify.js';

const head = (title, sub, ic) => h('div', { class: 'head' }, h('span', { class: 'hubicon' }, icon(ic, 26)), h('div', {}, h('h1', {}, title), sub ? h('p', { class: 'date' }, sub) : null));
const when = t => { const d = new Date(t), n = new Date(now()); const days = Math.round((new Date(n.toDateString()) - new Date(d.toDateString())) / 864e5);
  return days === 0 ? 'Today ' + d.toTimeString().slice(0, 5) : days === 1 ? 'Yesterday' : formatDate(d, 'D/M/YYYY'); };

// ---------- Comments: every comment on your tasks, newest first ----------
let cFrom = '', cTo = ''; // Comments date filter (YYYY-MM-DD), kept while the app is open
export function commentsScreen() {
  state.ctx = {};
  const dayOf = c => toISODate(new Date(D.val(c, 'created', 0)));
  const all = D.all('cmt').filter(c => D.live(D.val(c, 'parent')));
  const list = all.filter(c => (!cFrom || dayOf(c) >= cFrom) && (!cTo || dayOf(c) <= cTo)).sort((a, b) => D.val(b, 'created', 0) - D.val(a, 'created', 0));
  const field = (label, val, set) => h('label', { class: 'dfield' }, h('span', {}, label), h('input', { type: 'date', class: 'field', value: val, onchange: e => { set(e.target.value); render(); } }));
  const filtered = cFrom || cTo;
  const sub = filtered ? `${list.length} of ${all.length} comments` + (cFrom || cTo ? ` · ${cFrom ? formatDate(cFrom, 'D/M/YYYY') : 'start'} – ${cTo ? formatDate(cTo, 'D/M/YYYY') : 'today'}` : '') : list.length + (list.length === 1 ? ' comment' : ' comments');
  return h('div', { class: 'wrap' }, head('Comments', sub, 'comment'),
    h('div', { class: 'dfilter' }, icon('filter', 18),
      field('From', cFrom, v => { cFrom = v; if (cTo && v && v > cTo) cTo = v; }),
      field('To', cTo, v => { cTo = v; if (cFrom && v && v < cFrom) cFrom = v; }),
      filtered ? h('button', { class: 'btn', onclick: () => { cFrom = cTo = ''; render(); } }, 'Clear') : null),
    list.length ? h('div', { class: 'hublist' }, list.map(c => {
      const task = D.live(D.val(c, 'parent')); const title = task.k === 'row' ? DB.title(task) : (D.val(task, 'title') || 'Untitled');
      const dbr = task.k === 'row' ? DB.db(D.val(task, 'db')) : null, ep = dbr && DB.propByName(dbr, 'ECX & WBS NO'), ecx = ep ? DB.raw(task, ep) : '';
      return h('div', { class: 'hubitem', role: 'button', tabindex: '0', onclick: () => openTask(task.id) },
        h('span', { class: 'hi-ic' }, icon('comment', 20)),
        h('span', { class: 'hi-body' }, h('span', { class: 'hi-top' }, h('b', {}, title), h('small', {}, when(D.val(c, 'created', 0)))),
          ecx ? h('a', { class: 'ecxlink', href: '#/r/' + task.id, onclick: e => { e.stopPropagation(); e.preventDefault(); openTask(task.id); } }, icon('filelink', 15), ecx) : null,
          h('span', { class: 'hi-text' }, strip(D.val(c, 'text', '')).slice(0, 240))));
    })) : h('p', { class: 'empty' }, filtered ? 'No comments between these dates.' : 'No comments yet. Comments you add on a task show up here.'));
}

// ---------- Calendar: due dates and ECPAR amendments by month ----------
let monthOff = 0, picked = null;
export function calendarScreen() {
  state.ctx = {};
  const n = now(), base = new Date(n), first = new Date(base.getFullYear(), base.getMonth() + monthOff, 1);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const tasks = DB.kpiTasks(n).filter(t => t.due), today = toISODate(new Date(n));
  const byDay = new Map(); for (const t of tasks) { const k = toISODate(t.due); byDay.set(k, [...(byDay.get(k) || []), t]); }
  const color = t => t.days < 0 ? 'red' : t.amend ? 'orange' : t.days <= 2 ? 'orange' : 'blue';
  const days = [...Array(42)].map((_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const sel = picked || today;
  const dayList = (byDay.get(sel) || []).sort((a, b) => a.title.localeCompare(b.title));
  return h('div', { class: 'wrap' }, head('Calendar', formatDate(first, 'MMMM YYYY'), 'date'),
    h('div', { class: 'calnav' },
      h('button', { class: 'iconbtn', 'aria-label': 'Previous month', onclick: () => { monthOff--; render(); } }, icon('back', 20)),
      h('button', { class: 'btn', onclick: () => { monthOff = 0; picked = null; render(); } }, 'Today'),
      h('button', { class: 'iconbtn', 'aria-label': 'Next month', onclick: () => { monthOff++; render(); } }, icon('chevr', 20))),
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
  return h('div', { class: 'wrap' }, head('Inbox', 'Overdue, due today and due tomorrow', 'inbox'),
    h('label', { class: 'remind' }, icon('today', 20), h('span', {}, h('b', {}, 'Reminder at 08:00'), h('small', {}, 'Every morning: overdue, due today and due tomorrow tasks')), sw),
    groups.map(([label, test, c]) => { const list = tasks.filter(test); return list.length ? [h('div', { class: 'inboxh ' + c }, label),
      h('div', { class: 'hublist' }, list.map(t => h('button', { class: 'hubitem', onclick: () => openTask(t.id) },
        h('span', { class: 'hi-dot ' + c }), h('span', { class: 'hi-body' }, h('span', { class: 'hi-top' }, h('b', {}, t.title), h('small', {}, formatDate(t.due, 'D/M/YYYY'))), h('span', { class: 'hi-text' }, msg(t))))))] : []; }),
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
    `SUMMARY:${esc((t.amend ? 'ECPAR amendment: ' : 'Due: ') + t.title)}`, `DESCRIPTION:${esc([t.ecx && 'ECX & WBS NO: ' + t.ecx, t.address, t.status && 'Status: ' + t.status].filter(Boolean).join('\n'))}`,
    t.address ? `LOCATION:${esc(t.address)}` : null, 'END:VEVENT'].filter(Boolean).join('\r\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Folio//EN', 'X-WR-CALNAME:Folio', ...tasks.map(ev), 'END:VCALENDAR'].join('\r\n');
}
