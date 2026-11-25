// Folio v2 — push notifications that arrive even when Folio is closed.
// Each device signs up once (its push address is saved in push/subs/ of the data repo). Folio keeps a short due-list
// in push/digest.json; a scheduled GitHub job in folio-data (folio-notify.yml) reads it at 08:00 and sends the summary,
// and sends "ECPAR rejected" as soon as the iPhone shortcut drops a rejection email in inbox/.
// Keys: the public key is in push/config.json; the private key is shown once to be saved as the repo secret
// VAPID_PRIVATE_KEY — Folio never stores it.
import * as DB from './db.js';
import * as E from './entities.js';
import * as Sync from './sync.js';
import * as S from './store.js';
import { toISODate } from './dates.js';

export const CONFIG = 'push/config.json', DIGEST = 'push/digest.json', SUBS = 'push/subs/';
const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); s += '='.repeat((4 - s.length % 4) % 4); return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };

/** push works here: a Home Screen app on iPhone / iPad (iOS 16.4+), or a desktop browser */
export function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/** a new key pair: public (65-byte point, base64url) for the repo, private (32-byte d, base64url) for the GitHub secret */
export async function makeKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const pub = new Uint8Array([4, ...unb64u(jwk.x), ...unb64u(jwk.y)]);
  return { publicKey: b64u(pub), privateKey: jwk.d };
}
export async function config() { const c = await Sync.rootGet(CONFIG).catch(() => null); return c && c.data && c.data.publicKey ? c.data : null; }
/** first device: make the keys, save the public one; returns the private key to show once */
export async function setupKeys() {
  const k = await makeKeys();
  await Sync.rootPut(CONFIG, { publicKey: k.publicKey, created: new Date().toISOString(), time: '08:00', tz: 'Asia/Kuching' });
  return k;
}
async function deviceId() { let id = await S.meta.get('deviceId'); if (!id) { id = 'd' + Math.random().toString(36).slice(2, 10); await S.meta.set('deviceId', id); } return id; }
const deviceName = () => { const u = navigator.userAgent; return /iPad|Macintosh.*Mobile/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1) ? 'iPad' : /iPhone/.test(u) ? 'iPhone' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : /Android/.test(u) ? 'Android' : 'Device'; };

/** is this device signed up? */
export async function pushOn() {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription();
  return !!sub && (await S.meta.get('pushOn')) === true;
}
/** sign this device up (asks for permission; needs the keys made first) */
export async function enablePush() {
  if (!pushSupported()) throw new Error(isStandalone() ? 'This device cannot receive push notifications.' : 'Open Folio from its Home Screen icon to turn on notifications.');
  // ask first, straight from the tap (iPhone Safari only allows the question right after a tap)
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications were not allowed. Allow them for Folio in Settings → Notifications.');
  const cfg = await config(); if (!cfg) throw new Error('nokeys');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub && (await S.meta.get('pushKey')) !== cfg.publicKey) { await sub.unsubscribe().catch(() => {}); sub = null; } // keys were made again
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(cfg.publicKey) });
  const id = await deviceId();
  await Sync.rootPut(SUBS + id + '.json', { device: deviceName(), at: new Date().toISOString(), sub: sub.toJSON() });
  await S.meta.set('pushOn', true); await S.meta.set('pushKey', cfg.publicKey);
  await S.meta.set('remind08', false); // the 8:00 summary now comes by push: no second one from the open app
  await writeDigest(true);
  return true;
}
export async function disablePush() {
  const reg = await navigator.serviceWorker?.getRegistration(); const sub = reg && await reg.pushManager.getSubscription();
  if (sub) await sub.unsubscribe().catch(() => {});
  await Sync.rootRemove(SUBS + (await deviceId()) + '.json').catch(() => {});
  await S.meta.set('pushOn', false);
}

/** the due-list the GitHub job reads: projects (and amendments) and tasks with a due date, open ones only */
export function digest(n = Date.now()) {
  const items = [];
  for (const t of DB.kpiTasks(n)) if (t.due && t.days != null && t.days >= -120 && t.days <= 7) items.push({ title: t.title, due: toISODate(t.due), kind: t.amend ? 'amend' : 'project' });
  for (const t of E.dueTasks(n, { within: 7 })) if (t.days >= -120) items.push({ title: (t.name || 'Task') + ' — ' + t.customer, due: toISODate(new Date(new Date(n).setHours(12, 0, 0, 0) + t.days * 864e5)), kind: 'task' });
  items.sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title));
  return { tz: 'Asia/Kuching', items };
}
/** save the due-list when it changed (after each sync, on any device, once push is set up) */
let hasConfig = null; // checked once per session: is push set up for this workspace?
export async function writeDigest(force = false) {
  if (!Sync.connected() || !DB.kpiDb()) return false;
  if (!force) { if (hasConfig === null) hasConfig = !!(await config()); if (!hasConfig) return false; } // every device keeps it current once any device has push
  hasConfig = true;
  const d = digest(), key = JSON.stringify(d.items);
  if (!force && (await S.meta.get('digestKey')) === key) return false;
  await Sync.rootPut(DIGEST, { ...d, updated: new Date().toISOString() });
  await S.meta.set('digestKey', key); return true;
}
