/* Signel Services — the Downloads page (src/pages/downloads.js): search and family filter over
   the manuals, and the application pop-ups. /downloads/?app=<id> (a product's QR code) opens
   that application's pop-up straight away. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };

  /* manuals: search box + family chips, both narrowing the same cards */
  var input = $('[data-dl-search]'), fam = '*';
  var cards = $$('.dl-card'), groups = $$('.dl-fam'), empty = $('[data-dl-empty]');
  function apply() {
    var terms = norm(input ? input.value : '').trim().split(/\s+/).filter(Boolean), shown = 0;
    groups.forEach(function (g) {
      var inFam = fam === '*' || g.getAttribute('data-fam') === fam, n = 0;
      $$('.dl-card', g).forEach(function (c) {
        var t = c.getAttribute('data-dl-text'), hit = inFam && terms.every(function (w) { return t.indexOf(w) >= 0; });
        c.hidden = !hit; if (hit) n++;
      });
      g.hidden = !n; shown += n;
    });
    if (empty) empty.hidden = shown > 0;
  }
  if (input) input.addEventListener('input', apply);
  $$('[data-dl-fam]').forEach(function (b) {
    b.addEventListener('click', function () {
      fam = b.getAttribute('data-dl-fam');
      $$('[data-dl-fam]').forEach(function (x) { x.classList.toggle('on', x === b); });
      apply();
    });
  });

  /* applications: one pop-up each; the address carries ?app=<id> while it is open, so the
     link can be shared, and a QR code can open it directly */
  function open(id, fromLink) {
    var d = document.getElementById('dlg-' + id);
    if (!d) return;
    if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
    var u = new URL(location.href); u.searchParams.set('app', id); history.replaceState(null, '', u);
    if (fromLink) { var card = document.getElementById('app-' + id); if (card) card.scrollIntoView({ block: 'center' }); }
  }
  function closed() { var u = new URL(location.href); u.searchParams.delete('app'); history.replaceState(null, '', u.pathname + u.search + u.hash); }
  $$('[data-app-open]').forEach(function (b) { b.addEventListener('click', function () { open(b.getAttribute('data-app-open')); }); });
  $$('.app-dialog').forEach(function (d) {
    d.addEventListener('close', closed);
    d.addEventListener('click', function (e) { if (e.target === d || e.target.closest('[data-app-close]')) d.close ? d.close() : (d.removeAttribute('open'), closed()); });
  });
  var q = new URLSearchParams(location.search).get('app') || (location.hash.indexOf('#app-') === 0 ? location.hash.slice(5) : '');
  if (q) {
    open(q, true);
    if (!document.getElementById('dlg-' + q) && window.signelLog) window.signelLog('downloads', 'unknown application in the address: ' + q);
  }
})();
