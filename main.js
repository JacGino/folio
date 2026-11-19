import { boot } from './app.js';
import * as D from './data.js';
import * as DB from './db.js';
import * as Sync from './sync.js';
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') window.__folio = { D, DB, Sync };
// opening animation: keep the logo up for its full show (about 2s, slow like Notion) on every device;
// with Reduce Motion (often on for Mac / Windows) the logo only fades, it does not move, but it stays just as long, then hand over to the app or the passkey screen
function hideSplash() {
  const sp = document.getElementById('splash'); if (!sp) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = window.FOLIO_NOW ? 0 : Math.max(0, 2000 - performance.now()); // tests skip the show
  setTimeout(() => { sp.classList.add('out'); document.body.classList.add('arrive'); setTimeout(() => { sp.remove(); document.body.classList.remove('arrive'); }, 950); }, wait);
}
boot().then(hideSplash, e => { hideSplash(); console.error(e); document.body.textContent = 'Folio could not start: ' + e.message; });
