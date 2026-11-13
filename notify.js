// Folio v2 — 8:00 AM alerts on computers while Folio is open (the iPhone uses Scriptable).
import * as DB from './db.js';
import * as S from './store.js';
import { toast } from './ui.js';
import { now } from './app.js';
import { toISODate } from './dates.js';

export async function enableNotifications() {
  if (!('Notification' in window)) return toast('This browser cannot show notifications.');
  const p = await Notification.requestPermission(); toast(p === 'granted' ? 'Notifications are on for this device' : 'Notifications were not allowed');
}
// the 08:00 reminder covers overdue, due today and due tomorrow tasks (and the same for ECPAR amendments)
export function alertsFor(n = now()) {
  const out = [];
  for (const t of DB.kpiTasks(n)) {
    if (t.days == null || t.days > 1) continue;
    const what = t.amend ? 'Amendment ' : '';
    out.push(t.days < 0 ? `🔴 ${what}Overdue ${-t.days} ${-t.days === 1 ? 'day' : 'days'}: ${t.title}` : t.days === 0 ? `🟠 ${what}Due today: ${t.title}` : `🟡 ${what}Due tomorrow: ${t.title}`);
  }
  return out;
}
/** The Inbox switch: on = a notification at 08:00 each day on this device. */
export async function reminderOn() { const v = await S.meta.get('remind08'); return v !== false && 'Notification' in window && Notification.permission === 'granted'; }
export async function setReminder(on) {
  if (on) { if (!('Notification' in window)) { toast('This browser cannot show notifications.'); return false; }
    const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (p !== 'granted') { toast('Notifications were not allowed. Allow them in Settings for this web app.'); return false; } }
  await S.meta.set('remind08', !!on); toast(on ? 'Reminder at 08:00 is on' : 'Reminder at 08:00 is off'); return on;
}
export async function checkNow(n = now()) {
  const d = new Date(n); if (d.getHours() < 8) return 0;
  const day = toISODate(d); if ((await S.meta.get('notified')) === day) return 0;
  if ((await S.meta.get('remind08')) === false) return 0;
  const list = alertsFor(n); await S.meta.set('notified', day);
  if (!list.length || !('Notification' in window) || Notification.permission !== 'granted') return list.length;
  for (const m of list.slice(0, 8)) new Notification('Folio', { body: m, tag: 'folio-' + m });
  if (list.length > 8) new Notification('Folio', { body: `and ${list.length - 8} more` });
  return list.length;
}
export function startNotifier() { checkNow(); setInterval(() => checkNow(), 60 * 1000); }
