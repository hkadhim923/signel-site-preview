/* Signel Services — /diagnostics/: the error log this browser kept (src/js/log.js) and a
   check to run before a presentation (connection, scripts, the search list, the header video). */
(function () {
  'use strict';
  var ROOT = document.documentElement.getAttribute('data-root') || '';
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var read = function () { try { return JSON.parse(localStorage.getItem('signel.log') || '[]'); } catch (e) { return []; } };
  function env() {
    var c = navigator.connection || {};
    return { browser: navigator.userAgent, online: navigator.onLine, network: c.effectiveType || 'unknown',
             downlinkMbps: c.downlink, saveData: !!c.saveData, screen: screen.width + 'x' + screen.height, time: new Date().toISOString() };
  }

  /* the log */
  function paintLog() {
    var list = read().slice().reverse();
    $('[data-log-count]').textContent = list.length ? list.length + ' entries, newest first' : 'Nothing recorded in this browser.';
    $('[data-log]').innerHTML = list.map(function (x) {
      return '<tr><td>' + esc(x.t.replace('T', ' ').slice(0, 19)) + '</td><td>' + esc(x.type) + '</td><td>' + esc(x.msg) +
        (x.extra ? ' <small>' + esc(JSON.stringify(x.extra)) + '</small>' : '') + '</td><td>' + esc(x.page) + '</td><td>' +
        (x.online ? 'online' : 'OFFLINE') + (x.net ? ' · ' + esc(x.net) : '') + (x.visible === 'hidden' ? ' · tab hidden' : '') + '</td></tr>';
    }).join('');
  }
  $('[data-log-copy]').addEventListener('click', function () {
    var text = JSON.stringify({ environment: env(), check: lastCheck, log: read() }, null, 1);
    var done = function () { $('[data-log-copied]').textContent = 'Copied. Paste it into your message.'; };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { fallback(text); done(); }); else { fallback(text); done(); }
  });
  function fallback(text) { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) {} t.remove(); }
  $('[data-log-clear]').addEventListener('click', function () { try { localStorage.removeItem('signel.log'); } catch (e) {} paintLog(); });

  /* the check */
  var lastCheck = null;
  function row(name, ok, detail) {
    return '<li class="' + (ok === true ? 'ok' : ok === false ? 'bad' : 'warn') + '"><b>' + esc(name) + '</b> ' + (ok === true ? 'OK' : ok === false ? 'PROBLEM' : 'CHECK') + ' — ' + esc(detail) + '</li>';
  }
  function timed(p) { var t = performance.now(); return p.then(function (v) { return [v, Math.round(performance.now() - t)]; }); }
  function checkSearch() {
    return timed(fetch(ROOT + '/search-index.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }))
      .then(function (a) { return row('Search product list', true, a[0].length + ' products in ' + a[1] + ' ms'); },
            function (e) { return row('Search product list', false, 'could not download: ' + e.message); });
  }
  function checkVideo() {
    return fetch(ROOT + '/', { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (html) {
      var srcs = []; html.replace(/<source src="([^"]+\.mp4)"[^>]*>/g, function (m, s) { if (!/media="\(max-width/.test(m) || matchMedia('(max-width: 767px)').matches) srcs.push(s); });
      if (!srcs.length) return row('Header video', null, 'no video on the home page');
      var v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = srcs[0];
      v.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0'; document.body.appendChild(v);
      var codec = v.canPlayType('video/mp4; codecs="avc1.640028"') || v.canPlayType('video/mp4');
      var t = performance.now();
      return new Promise(function (done) {
        var finish = function (r) { clearTimeout(timer); v.pause(); v.remove(); done(r); };
        var timer = setTimeout(function () { finish(row('Header video', false, 'no picture after 10 s (downloaded state ' + v.readyState + '/4): the connection is too slow or the file is blocked')); }, 10000);
        v.addEventListener('error', function () { finish(row('Header video', false, 'the browser could not play it (error ' + (v.error && v.error.code) + ', MP4/H.264 support: "' + codec + '")')); });
        v.addEventListener('playing', function () { finish(row('Header video', true, 'plays, started in ' + Math.round(performance.now() - t) + ' ms')); });
        var p = v.play(); if (p && p.catch) p.catch(function (e) {
          if (e.name === 'NotAllowedError') finish(row('Header video', false, 'autoplay held back by the browser (' + e.message + '). Battery saver or the browser\'s autoplay setting; it will start after the first click on the page.'));
        });
      });
    });
  }
  $('[data-check]').addEventListener('click', function () {
    var out = $('[data-check-out]'); out.innerHTML = '<li>Checking…</li>';
    var e = env(), rows = [
      row('Connection', e.online ? (/2g|slow/.test(e.network) ? null : true) : false, (e.online ? 'online' : 'OFFLINE') + ', network ' + e.network + (e.downlinkMbps ? ', about ' + e.downlinkMbps + ' Mb/s' : '') + (e.saveData ? ', data saver ON' : '')),
      row('Site scripts', !!window.__signelSite, window.__signelSite ? 'loaded' : 'site.js did not load: menus and search cannot work')
    ];
    checkSearch().then(function (r) { rows.push(r); return checkVideo(); }).then(function (r) { rows.push(r); }, function (err) { rows.push(row('Header video', false, err.message)); })
      .then(function () { out.innerHTML = rows.join(''); lastCheck = out.innerText; (window.signelLog || function () {})('check', 'diagnostics check run', { result: lastCheck }); paintLog(); });
  });

  $('[data-env]').textContent = JSON.stringify(env(), null, 1);
  paintLog();
})();
