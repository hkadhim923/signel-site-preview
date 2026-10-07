/* Signel Services — dashboard: Pages, for marketing (plugs into src/js/admin.js). Every content
   page of the site and the texts it shows, in English and French. A text is saved under its own
   key in changes.text and the build applies it wherever it appears (src/lib/i18n.js), so a text
   shared by several pages is edited once. Products and job postings have their own sections. */
(function () {
  'use strict';
  var A = window.SignelAdmin; if (!A) return;
  var $ = A.$, $$ = A.$$, esc = A.esc;
  var DATA = null, JOBREFS = {};
  var load = function () {
    if (DATA) return Promise.resolve(DATA);
    var get = function (f) { return fetch(A.ROOT + '/admin/' + f).then(function (r) { return r.json(); }); };
    return Promise.all([get('pages-data.json'), get('jobs-data.json').catch(function () { return { texts: {} }; })]).then(function (d) {
      // a posting's words are edited in Jobs, even where a page lists them
      JOBREFS = d[1].texts || {};
      d[0].pages.forEach(function (p) { p.refs = p.refs.filter(function (r) { return !JOBREFS[r]; }); });
      DATA = d[0]; return DATA;
    });
  };
  var ch = function () { return A.changes(); };
  var word = function (ref) { var o = ch().text[ref], t = DATA.texts[ref] || { en: '', fr: '' }; return { en: (o && o.en) || t.en, fr: (o && o.fr) || t.fr }; };
  var KIND = { titles: 'Page title', seo: 'Summary (search results and listings)', blocks: 'Text', rich: 'Formatted text' };
  var tableOf = function (ref) { return ref.slice(0, ref.indexOf('/')); };
  // the pages a text appears on
  var where = function (ref) { return DATA.pages.filter(function (p) { return p.refs.indexOf(ref) >= 0; }); };
  var editedRefs = function (p) { return p.refs.filter(function (r) { return ch().text[r]; }); };
  var SHARED = { url: '*', title: 'Every page (header, footer, menus)' };
  var pageOf = function (url) { return url === '*' ? Object.assign({ refs: DATA.shared }, SHARED) : DATA.pages.filter(function (p) { return p.url === url; })[0]; };

  function show(args) {
    load().then(function () {
      if (args && args[0]) return openPage(decodeURIComponent(args.join('/')));
      var list = (DATA.shared.length ? [pageOf('*')] : []).concat(DATA.pages);
      A.view.innerHTML = '<div class="ad-page"><div class="ad-head"><div><h1>Pages</h1><p class="ad-muted">The words on each page of the website, in English and French. Products and job postings are edited in their own sections. Changes go online when they are published.</p></div>' +
        '<div class="ad-head-tools"><input class="ad-input" type="search" placeholder="Find a page" data-pfind aria-label="Find a page"></div></div>' +
        '<div class="ad-card ad-card--flush"><table class="ad-table"><thead><tr><th>Page</th><th>Address</th><th>Texts</th><th>Status</th></tr></thead><tbody>' + list.map(function (p) {
          var n = editedRefs(p).length;
          return '<tr data-open-p="' + esc(p.url) + '" data-find="' + esc((p.title + ' ' + p.url + ' ' + (p.url_fr || '')).toLowerCase()) + '" tabindex="0"><td><b>' + esc(p.title) + '</b></td><td><small>' + esc(p.url === '*' ? '—' : p.url) + (p.url_fr && p.url_fr !== p.url ? '<br>' + esc(p.url_fr) : '') + '</small></td><td>' + p.refs.length + '</td><td>' +
            (n ? '<em class="ad-chip ad-chip--amber">' + A.plural(n, 'text', 'texts') + ' edited, not published</em>' : '<em class="ad-chip ad-chip--ok">On the website</em>') + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
      $$('[data-open-p]', A.view).forEach(function (r) {
        var go = function () { A.go('pages/' + encodeURIComponent(r.getAttribute('data-open-p'))); };
        r.addEventListener('click', go); r.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
      });
      $('[data-pfind]', A.view).addEventListener('input', function (e) {
        var q = A.norm(e.target.value);
        $$('[data-open-p]', A.view).forEach(function (r) { r.hidden = !!q && A.norm(r.getAttribute('data-find')).indexOf(q) < 0; });
      });
    });
  }

  function openPage(url) {
    var p = pageOf(url); if (!p) { A.go('pages'); return; }
    var rtes = {};
    var field = function (ref) {
      var w = word(ref), table = tableOf(ref), rich = table === 'rich';
      var long = !rich && (table === 'seo' || Math.max(w.en.length, w.fr.length) > 90);
      var others = url === '*' ? [] : where(ref).filter(function (x) { return x.url !== url; });
      return '<div class="ad-pair" data-ref="' + esc(ref) + '" data-kind="' + (rich ? 'rich' : long ? 'long' : 'line') + '"><span class="ad-pair-l">' + esc(KIND[table] || 'Text') +
        (ch().text[ref] ? ' <em class="ad-chip ad-chip--amber">Edited</em>' : '') +
        (others.length ? '<small class="ad-pair-note">Also on ' + others.slice(0, 3).map(function (x) { return esc(x.title); }).join(', ') + (others.length > 3 ? ' and ' + (others.length - 3) + ' more' : '') + ': a change shows there too.</small>' : '') + '</span>' +
        ['en', 'fr'].map(function (l) { return '<label class="ad-pair-f"><span class="ad-lang-cap">' + (l === 'en' ? 'English' : 'Français') + '</span>' + (rich ? '<div data-rte="' + l + '"></div>' : long ? '<textarea class="ad-input" rows="3" data-l="' + l + '">' + esc(w[l]) + '</textarea>' : '<input class="ad-input" data-l="' + l + '" value="' + esc(w[l]) + '">') + '</label>'; }).join('') + '</div>';
    };
    A.view.innerHTML = '<div class="ad-page"><div class="ad-head"><div><button type="button" class="ad-link" data-go="pages">← All pages</button><h1>' + esc(p.title) + '</h1>' +
      (url === '*' ? '<p class="ad-muted">These texts appear on every page.</p>' : '<p class="ad-muted"><a href="' + esc(A.ROOT + p.url) + '" target="_blank" rel="noopener">View in English</a>' + (p.url_fr ? ' · <a href="' + esc(A.ROOT + p.url_fr) + '" target="_blank" rel="noopener">Voir en français</a>' : '') + '</p>') + '</div>' +
      '<div class="ad-head-tools"><button type="button" class="ad-btn ad-btn--primary" data-psave>Save</button></div></div>' +
      '<form class="ad-card ad-job" data-pform onsubmit="return false">' + p.refs.map(field).join('') + '</form></div>';
    A.bindGo(A.view);
    $$('[data-kind="rich"]', A.view).forEach(function (box) {
      var ref = box.getAttribute('data-ref'), w = word(ref);
      ['en', 'fr'].forEach(function (l) { var r = A.rte(w[l]); $('[data-rte="' + l + '"]', box).appendChild(r.el); rtes[ref + '|' + l] = r; });
    });
    $('[data-psave]', A.view).addEventListener('click', function () {
      var text = ch().text, n = 0, empty = false;
      $$('.ad-pair[data-ref]', A.view).forEach(function (box) {
        var ref = box.getAttribute('data-ref'), rich = box.getAttribute('data-kind') === 'rich';
        var en = rich ? rtes[ref + '|en'].get() : $('[data-l="en"]', box).value.trim(), fr = rich ? rtes[ref + '|fr'].get() : $('[data-l="fr"]', box).value.trim();
        var pub = DATA.texts[ref] || { en: '', fr: '' };
        if (en === pub.en && fr === pub.fr) { delete text[ref]; return; }
        if ((pub.en && !en) || (pub.fr && !fr)) empty = true;
        text[ref] = { en: en, fr: fr }; n++;
      });
      if (empty) A.toast('An emptied text keeps its published words: write them again or undo the change.');
      A.save(); A.toast(n ? 'Saved ' + A.plural(n, 'text', 'texts') + '. Publish to put them on the website.' : 'Nothing changed.'); A.go('pages');
    });
  }

  A.section('pages', {
    show: show,
    changes: function () {
      if (!DATA) return [];
      var seen = {};
      return (DATA.shared.length ? [pageOf('*')] : []).concat(DATA.pages).map(function (p) {
        var refs = editedRefs(p).filter(function (r) { if (seen[r]) return false; seen[r] = 1; return true; });
        if (!refs.length) return null;
        return { title: p.title, what: A.plural(refs.length, 'text', 'texts') + ' edited', chip: 'Edited', go: 'pages/' + encodeURIComponent(p.url),
          undo: function () { var c = ch(); refs.forEach(function (r) { delete c.text[r]; }); } };
      }).filter(Boolean);
    }
  });
  load().then(function () { A.badges(); });
})();
