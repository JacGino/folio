import { boot } from './app.js';
import * as D from './data.js';
import * as DB from './db.js';
import * as Sync from './sync.js';
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') window.__folio = { D, DB, Sync };
boot().catch(e => { console.error(e); document.body.textContent = 'Folio could not start: ' + e.message; });
