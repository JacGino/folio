// Shows why Folio did not open, instead of a blank screen.
(function () {
  var errs = [];
  addEventListener('error', function (e) { errs.push((e.message || 'Could not load ' + ((e.target && (e.target.src || e.target.href)) || 'a file')) + (e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ')' : '')); }, true);
  addEventListener('unhandledrejection', function (e) { errs.push(String(e.reason && e.reason.message || e.reason)); });
  setTimeout(function () {
    var main = document.getElementById('main');
    if (main && main.children.length) { try { sessionStorage.removeItem('folio-autoreset'); } catch (e) {} return; }
    // usually an update caught half-way (some new files, some old): clear the saved copy and reload once by itself before showing this screen
    var last = 0; try { last = +sessionStorage.getItem('folio-autoreset') || 0; } catch (e) {}
    if (!errs.length && Date.now() - last > 120000) {
      try { sessionStorage.setItem('folio-autoreset', String(Date.now())); } catch (e) {}
      var note = document.createElement('div');
      note.style.cssText = 'font:16px -apple-system,system-ui,sans-serif;position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#fff;color:#1d1d1f;z-index:99999';
      note.textContent = 'Finishing an update…'; document.body.appendChild(note);
      var jobs0 = [];
      if (navigator.serviceWorker) jobs0.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }));
      if (window.caches) jobs0.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }));
      Promise.all(jobs0).then(function () { setTimeout(function () { location.reload(); }, 1500); }, function () { location.reload(); });
      return;
    }
    var files = ['index.html', 'styles.css', 'MAIN', 'app.js', 'sw.js'];
    var main_js = (document.querySelector('script[type=module]') || {}).getAttribute ? document.querySelector('script[type=module]').getAttribute('src') : 'main.js';
    var box = document.createElement('div');
    box.style.cssText = 'font:15px -apple-system,system-ui,sans-serif;padding:max(24px,env(safe-area-inset-top)) 20px 24px;color:#1d1d1f;background:#fff;position:fixed;inset:0;overflow:auto;z-index:99999';
    box.innerHTML = '<h2 style="margin:0 0 8px">Folio did not open</h2><p style="color:#6e6e73;margin:0 0 16px">Take a screenshot of this screen and send it to Claude.</p><pre id="fc-out" style="white-space:pre-wrap;font:12px ui-monospace,monospace;background:#f2f2f7;padding:12px;border-radius:10px">Checking…</pre><button id="fc-reset" style="margin-top:16px;font:600 16px -apple-system,system-ui;padding:12px 18px;border:0;border-radius:12px;background:#007aff;color:#fff">Clear saved copy and reload</button>';
    document.body.appendChild(box);
    var out = document.getElementById('fc-out');
    var lines = ['Step: ' + (window.__folioStep || 'not started (script did not run)'), 'Errors: ' + (errs.length ? errs.join('\n  ') : 'none'), 'Browser: ' + navigator.userAgent, 'Page: ' + location.href, 'Service worker: ' + (navigator.serviceWorker && navigator.serviceWorker.controller ? 'active' : 'none'), 'Files:'];
    out.textContent = lines.join('\n');
    var names = ['styles.css', main_js, main_js.replace('main.js', 'app.js'), main_js.replace('main.js', 'ui.js'), main_js.replace('main.js', 'store.js'), 'sw.js', 'manifest.json'];
    names.forEach(function (n) {
      fetch(n, { cache: 'no-store' }).then(function (r) { out.textContent += '\n  ' + n + ': ' + r.status + ' ' + (r.headers.get('content-type') || ''); }).catch(function (e) { out.textContent += '\n  ' + n + ': ' + e.message; });
    });
    document.getElementById('fc-reset').onclick = function () {
      var jobs = [];
      if (navigator.serviceWorker) jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }));
      if (window.caches) jobs.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }));
      Promise.all(jobs).then(function () { location.reload(); }, function () { location.reload(); });
    };
  }, 6000);
})();
