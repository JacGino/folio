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
export function alertsFor(n = now()) {
  const out = [];
  for (const t of DB.kpiTasks(n)) {
    if (t.days == null) continue;
    if (t.amend) out.push(t.days < 0 ? `🚨 AMENDMENT OVERDUE: ${t.title}` : `🟠 AMENDMENT DUE (${t.days} days left): ${t.title}`);
    else if (t.days < 0) out.push(`🔴 OVERDUE (${-t.days} days): ${t.title}`);
    else if (t.days === 1) out.push(`🟠 1 days left: ${t.title}`);
  }
  return out;
}
export async function checkNow(n = now()) {
  const d = new Date(n); if (d.getHours() < 8) return 0;
  const day = toISODate(d); if ((await S.meta.get('notified')) === day) return 0;
  const list = alertsFor(n); await S.meta.set('notified', day);
  if (!list.length || !('Notification' in window) || Notification.permission !== 'granted') return list.length;
  for (const m of list.slice(0, 8)) new Notification('Folio', { body: m, tag: 'folio-' + m });
  if (list.length > 8) new Notification('Folio', { body: `and ${list.length - 8} more` });
  return list.length;
}
export function startNotifier() { checkNow(); setInterval(() => checkNow(), 60 * 1000); }
