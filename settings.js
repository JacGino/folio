// Folio v2 — Settings: GitHub sync, encryption, app lock, import, backup restore, widgets, notifications.
import * as D from './data.js';
import * as S from './store.js';
import * as Sync from './sync.js';
import * as M from './model.js';
import { setupKeys, unlockKeys, changePassphrase } from './crypto.js';
import { h, icon, logo, group, row, sheet, toast, confirmBox } from './ui.js';
import { go, render, state, download, setGlass } from './app.js';
import { pageHead } from './views.js';
import { lockSettings } from './lock.js';
import { importNotion } from './import.js';
import { enableNotifications } from './notify.js';

export async function startupSync() {
  const cfg = await S.meta.get('gh'); await Sync.configure(cfg);
  const key = await S.meta.get('fileKey'); if (key) Sync.setFileKey(key);
  if (cfg) { Sync.run().then(() => render()); setInterval(() => { if (document.visibilityState === 'visible') Sync.run(); }, 5 * 60 * 1000); }
}

export function renderSettings(sub) {
  state.ctx = {};
  if (sub === 'import') { history.replaceState(null, '', '#/settings'); state.route = ['settings']; setTimeout(importSheet, 50); }
  const wrap = h('div', { class: 'wrap home' }, pageHead('Settings', 'Folio v2', 'settings'));
  const body = h('div'); wrap.append(body);
  (async () => {
    const cfg = await S.meta.get('gh'); const st = Sync.getStatus(); const ws = (await S.meta.get('ws-settings')) || {};
    const hasKey = !!(await S.meta.get('fileKey')); const used = await Sync.totalBlobBytes();
    body.replaceChildren(...[
      h('p', { class: 'ghead' }, 'Sync'),
      group(
        row({ icon: 'sync', label: cfg ? `GitHub: ${cfg.owner}/${cfg.repo}` : 'Connect GitHub', value: cfg ? (st.state === 'error' ? 'Problem' : st.state === 'syncing' ? 'Syncing…' : 'On') : 'Off', onclick: githubSheet }),
        cfg ? row({ icon: 'sync', label: 'Sync now', chev: false, onclick: async () => { toast('Syncing…'); const ok = await Sync.run(); toast(ok ? 'Synced' : 'Sync problem: ' + Sync.getStatus().error, 5000); render(); } }) : null),
      st.state === 'error' ? h('p', { class: 'muted pad', style: { color: 'var(--red)' } }, st.error) : null,
      h('p', { class: 'ghead' }, 'Privacy'),
      group(
        row({ icon: 'lock', label: 'Encrypted attachments', value: ws.crypto ? (hasKey ? 'Unlocked' : 'Locked') : 'Not set up', onclick: cryptoSheet }),
        row({ icon: 'face', label: 'App lock', value: '', onclick: lockSettings })),
      group(row({ icon: 'paint', label: 'Liquid Glass', value: (ws.glass ?? 50) + '%', onclick: glassSheet })),
      h('p', { class: 'ghead' }, 'Your data'),
      group(
        row({ icon: 'import', label: 'Import from Notion', onclick: importSheet }),
        row({ icon: 'archive', label: 'Restore from iCloud backup', onclick: restoreSheet }),
        row({ icon: 'export', label: 'Download a full backup', chev: false, onclick: backupNow }),
        row({ icon: 'clip', label: 'Attachments on this device', value: (used / 1048576).toFixed(1) + ' MB', chev: false })),
      h('p', { class: 'ghead' }, 'iPhone & computer'),
      group(
        row({ icon: 'cal', label: 'Widgets, notifications & calendar', onclick: widgetSheet }),
        row({ icon: 'today', label: 'Notifications on this device', value: 'Notification' in window ? (Notification.permission === 'granted' ? 'On' : 'Off') : 'Not supported', onclick: async () => { await enableNotifications(); render(); } })),
      h('p', { class: 'ghead' }, 'App'),
      group(row({ icon: 'sync', label: 'Clear app cache', value: 'Keeps your data', chev: false, onclick: clearCache })),
      h('p', { class: 'small muted', style: 'margin:6px 4px 0' }, 'Use this if Folio looks old or odd after an update: it removes the saved app files and reloads the newest ones. Your projects, pages, settings and sync stay.'),
      h('p', { class: 'ghead' }, 'Danger zone'),
      group(row({ icon: 'trash', label: 'Remove all Folio data from this device', danger: true, chev: false, onclick: async () => {
        if (await confirmBox('This removes Folio from this device only. Your GitHub copy stays. Continue?', 'Remove')) { await D.wipe(); location.reload(); } } }))].filter(Boolean));
  })();
  return wrap;
}

/** remove the saved app files (service worker + its caches) and reload the newest ones; the data (IndexedDB) and settings are not touched */
async function clearCache() {
  if (!await confirmBox('Clear the app cache and reload Folio? Your projects, pages and settings stay on this device.', 'Clear and reload')) return;
  try { await D.flush(); } catch (e) {}
  try { if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch (e) {}
  try { if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch (e) {}
  toast('Cache cleared. Reloading…');
  setTimeout(() => location.reload(), 400);
}
function githubSheet() {
  const f = (id, label, ph, type = 'text') => h('label', { style: { display: 'block', marginTop: '12px' } }, h('span', { class: 'muted', style: { fontSize: '14px' } }, label), h('input', { id, class: 'field', placeholder: ph, type, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' }));
  const msg = h('p', { class: 'muted', role: 'status' });
  const s = sheet('GitHub sync', h('form', { onsubmit: async e => {
    e.preventDefault(); const owner = s.panel.querySelector('#gh-o').value.trim(), repo = s.panel.querySelector('#gh-r').value.trim().replace(/\s+/g, '-'), token = s.panel.querySelector('#gh-t').value.trim();
    msg.textContent = 'Checking…';
    try {
      await Sync.configure({ owner, repo, token }); const { client } = await import('./github.js'); const info = await client({ owner, repo, token }).check();
      if (!info.private) { msg.textContent = 'This repository is public. Make it private first: your tasks would be visible to anyone.'; await Sync.configure(null); return; }
      await S.meta.set('gh', { owner, repo, token }); msg.textContent = 'Connected. Syncing…'; const ok = await Sync.run(); msg.textContent = ok ? `Connected to ${info.name}.` : 'Connected, but sync failed: ' + Sync.getStatus().error; render();
    } catch (err) { msg.textContent = err.status === 404 ? 'Repository not found. Check the owner and name, and that the token can see it.' : err.status === 401 ? 'The token was not accepted. Make a new one and paste it again.' : err.message; await Sync.configure(await S.meta.get('gh')); }
  } },
    h('p', { class: 'muted' }, 'Folio keeps your workspace in a private GitHub repository so all your devices share it.'),
    f('gh-o', 'GitHub username', 'JacGino'), f('gh-r', 'Private repository', 'folio-data'), f('gh-t', 'Fine-grained token (Contents: read & write)', 'github_pat_…', 'password'),
    h('button', { class: 'btn primary block', type: 'submit' }, 'Connect'), msg,
    h('button', { class: 'btn block danger', type: 'button', onclick: async () => { await S.meta.set('gh', null); await Sync.configure(null); s.close(); render(); toast('GitHub disconnected on this device'); } }, 'Disconnect this device')));
  S.meta.get('gh').then(c => { if (c) { s.panel.querySelector('#gh-o').value = c.owner; s.panel.querySelector('#gh-r').value = c.repo; s.panel.querySelector('#gh-t').value = c.token; } else { s.panel.querySelector('#gh-o').value = 'JacGino'; s.panel.querySelector('#gh-r').value = 'folio-data'; } });
}

async function cryptoSheet() {
  const ws = (await S.meta.get('ws-settings')) || {};
  const hasKey = !!(await S.meta.get('fileKey'));
  const pass = h('input', { class: 'field', type: 'password', placeholder: ws.crypto ? 'Passphrase or recovery code' : 'New passphrase (at least 10 characters)', autocomplete: ws.crypto ? 'current-password' : 'new-password' });
  const msg = h('p', { class: 'muted', role: 'status' });
  const s = sheet('Encrypted attachments', h('form', { onsubmit: async e => {
    e.preventDefault(); const v = pass.value;
    try {
      if (!ws.crypto) {
        if (v.length < 10) { msg.textContent = 'Use at least 10 characters.'; return; }
        msg.textContent = 'Creating keys…'; const { meta, key, recoveryCode } = await setupKeys(v);
        await Sync.saveSettings({ crypto: meta }); await S.meta.set('fileKey', key); Sync.setFileKey(key); Sync.soon(200); s.close(); showRecovery(recoveryCode);
      } else {
        msg.textContent = 'Unlocking…'; const key = await unlockKeys(ws.crypto, v); await S.meta.set('fileKey', key); Sync.setFileKey(key); Sync.soon(200); s.close(); toast('Attachments unlocked on this device'); render();
      }
    } catch (err) { msg.textContent = err.message; }
  } },
    h('p', { class: 'muted' }, ws.crypto ? (hasKey ? 'Attachments are unlocked on this device. You can change the passphrase below.' : 'Enter your passphrase (or recovery code) to open PDFs and photos on this device.')
      : 'PDFs and photos are encrypted on this device before they go to GitHub. Choose a passphrase you will remember. Your task list itself is not encrypted, so the widget and notifications can read it.'),
    pass, h('button', { class: 'btn primary block', type: 'submit' }, ws.crypto ? 'Unlock' : 'Turn on encryption'), msg,
    ws.crypto && hasKey ? h('button', { class: 'btn block', type: 'button', onclick: async () => { const np = prompt('New passphrase (at least 10 characters)'); if (!np || np.length < 10) return; const key = await S.meta.get('fileKey'); const { meta, recoveryCode } = await changePassphrase(key, np); await Sync.saveSettings({ crypto: meta }); Sync.soon(200); s.close(); showRecovery(recoveryCode); } }, 'Change passphrase') : null));
}
function showRecovery(code) {
  sheet('Save your recovery code', h('div', {}, h('p', {}, 'If you forget your passphrase, this code is the only way to open your attachments. Save it in the Passwords app now. It will not be shown again.'),
    h('p', { style: { fontFamily: 'var(--mono)', fontSize: '20px', textAlign: 'center', padding: '16px', background: 'var(--bg)', borderRadius: '12px', userSelect: 'all' } }, code),
    h('button', { class: 'btn block', onclick: () => navigator.clipboard.writeText(code).then(() => toast('Copied. Paste it into Passwords.')) }, 'Copy code')), { done: 'I saved it' });
}

function importSheet() {
  const status = h('p', { class: 'muted', role: 'status' });
  const inp = h('input', { type: 'file', accept: '.zip,.md,.csv,application/zip', multiple: true, class: 'field', style: { paddingTop: '9px' }, 'aria-label': 'Notion export file' });
  const skip = h('input', { type: 'checkbox', id: 'skipf' });
  sheet('Import from Notion', h('div', {},
    h('p', { class: 'muted' }, 'In Notion: Settings › Export all workspace content, choose “Markdown & CSV”, include files and subpages. Then pick the ZIP here (big exports are fine).'),
    inp, h('label', { class: 'grow', style: { background: 'var(--bg)', borderRadius: '12px', marginTop: '12px' } }, h('span', { class: 'gl' }, 'Leave out attachments (faster)'), skip),
    h('button', { class: 'btn primary block', onclick: async () => {
      if (!inp.files.length) { status.textContent = 'Choose the ZIP file first.'; return; }
      try { const r = await importNotion([...inp.files], t => { status.textContent = t; }, { skipFiles: skip.checked }); status.textContent = `Done: ${r.pages} pages, ${r.rows} tasks, ${r.files} files${r.failed ? `, ${r.failed} files could not be read` : ''}.` + (r.comments ? '' : ' Comments are not in Notion’s export file.'); render(); }
      catch (e) { status.textContent = 'Import stopped: ' + e.message; }
    } }, 'Import'), status), { wide: true });
}

function restoreSheet() {
  const inp = h('input', { type: 'file', multiple: true, accept: '.json,application/json', class: 'field', style: { paddingTop: '9px' }, 'aria-label': 'Backup files' });
  const msg = h('p', { class: 'muted', role: 'status' });
  sheet('Restore from iCloud backup', h('div', {}, h('p', { class: 'muted' }, 'Open Files › iCloud Drive › Folio Backups › pick a date, then select workspace.json and the files in its db folder. They are merged with what you have, nothing is overwritten blindly.'),
    inp, h('button', { class: 'btn primary block', onclick: async () => {
      let n = 0;
      for (const f of inp.files) { try { const j = JSON.parse(await f.text()); if (!j.records) continue; const bySh = {}; for (const r of Object.values(j.records)) (bySh[r.sh] ||= {})[r.id] = r;
        for (const [sh, recs] of Object.entries(bySh)) { const { merged } = M.mergeMaps(D.shardRecords(sh), recs); await D.replaceShard(sh, merged); n += Object.keys(recs).length; }
        if (j.settings) await S.meta.set('ws-settings', { ...(await S.meta.get('ws-settings')), ...j.settings }); } catch (e) { msg.textContent = `${f.name}: ${e.message}`; } }
      msg.textContent = `Restored ${n} records.`; Sync.soon(500); render();
    } }, 'Restore'), msg));
}
async function backupNow() {
  const out = {}; for (const sh of D.shards()) out[sh] = D.shardRecords(sh);
  const records = Object.assign({}, ...Object.values(out));
  download(`folio-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ v: 2, app: 'folio', records, settings: await S.meta.get('ws-settings') }), 'application/json');
}
function widgetSheet() {
  sheet('Widgets, notifications & calendar', h('div', {},
    h('p', {}, 'On your iPhone, the free Scriptable app shows the Folio widgets, sends the 8:00 AM alerts even when Folio is closed, keeps the iCloud calendar “Folio” up to date, and saves a daily backup to iCloud Drive.'),
    h('ol', { class: 'muted', style: { paddingLeft: '20px' } },
      h('li', {}, 'Install Scriptable from the App Store.'), h('li', {}, 'Download Folio.js below and save it to iCloud Drive › Scriptable.'),
      h('li', {}, 'Run it once in Scriptable and paste your GitHub token when asked (it is kept in the iPhone Keychain).'),
      h('li', {}, 'Add a Scriptable widget, choose the script Folio, and type today, survey, ecpar or links as its Parameter.'),
      h('li', {}, 'In Shortcuts › Automation, run Folio every day at 8:00 AM so alerts and the calendar stay fresh.')),
    h('a', { class: 'btn primary block', href: 'Folio.js', download: 'Folio.js' }, 'Download Folio.js')));
}

// Liquid Glass opacity for the floating buttons and the shortcut bar — match it to the iPhone's
// Settings → Appearance → Liquid Glass slider (Clear on the left, Tinted on the right).
async function glassSheet() {
  const ws = (await S.meta.get('ws-settings')) || {}; let v = ws.glass ?? 50;
  const out = h('b', {}, v + '%');
  const rng = h('input', { type: 'range', min: 0, max: 100, step: 5, value: v, class: 'glassrange', 'aria-label': 'Liquid Glass opacity', oninput: e => { v = +e.target.value; out.textContent = v + '%'; setGlass(v); } });
  sheet('Liquid Glass', h('div', {},
    h('p', { class: 'muted' }, 'Match this to your iPhone: Settings → Appearance → Liquid Glass. Clear is more see-through, Tinted is more solid.'),
    h('div', { class: 'glassrow' }, h('span', {}, 'Clear'), rng, h('span', {}, 'Tinted')), h('p', { style: { textAlign: 'center' } }, out)),
    { onDone: async () => { await Sync.saveSettings({ glass: v }); Sync.soon(500); render(); } });
}
