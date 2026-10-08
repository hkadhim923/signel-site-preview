/* Signel Services — dashboard: Jobs, for HR (plugs into src/js/admin.js). Every posting on
   the Careers page: edit its words in English and French, move it to another category, close
   it, or add a new one. Words are saved under their own keys in changes.text (the build applies
   them wherever they appear: src/lib/i18n.js); closing, new postings and categories go in
   changes.jobs (src/model/jobs.js). Both are published with the rest (Publish). */
(function () {
  'use strict';
  var A = window.SignelAdmin; if (!A) return;
  var $ = A.$, $$ = A.$$, esc = A.esc;
  var DATA = null;
  var load = function () { return DATA ? Promise.resolve(DATA) : fetch(A.ROOT + '/admin/jobs-data.json').then(function (r) { return r.json(); }).then(function (d) { DATA = d; return d; }); };
  var ch = function () { return A.changes(); };
  // a text as it will be published: the change made here, else the site's
  var word = function (ref) { var o = ch().text[ref], t = (DATA.texts[ref] || { en: '', fr: '' }); return { en: (o && o.en) || t.en, fr: (o && o.fr) || t.fr }; };
  var keysOf = function (id, n) { return { title: 'titles/job-' + id + '-title', seo: 'seo/job-' + id + '-seo', facts: 'rich/job-' + id + '-facts',
    sections: Array.apply(null, { length: n }).map(function (_, i) { return { head: 'blocks/job-' + id + '-h' + i, body: 'rich/job-' + id + '-t' + i }; }) }; };

  // published postings and the new ones made here, as one list
  function postings() {
    var jobs = ch().jobs, list = DATA.jobs.map(function (j) { return Object.assign({}, j, jobs[j.id] && jobs[j.id].category ? { category: jobs[j.id].category } : {}, { closed: !!(jobs[j.id] || {}).closed }); });
    Object.keys(jobs).forEach(function (id) {
      var j = jobs[id]; if (!j.new) return;
      var k = keysOf(id, j.sections || 0);
      list.unshift({ id: id, isNew: true, slug: j.slug, date: j.date, category: j.category, title: k.title, seo: k.seo, facts: k.facts, sections: k.sections, url: null });
    });
    return list;
  }
  function edited(j) { return j.isNew || !!ch().jobs[j.id] || [j.title, j.seo, j.facts].concat(j.sections.map(function (s) { return [s.head, s.body]; }).reduce(function (a, b) { return a.concat(b); }, [])).some(function (r) { return r && ch().text[r]; }); }
  var when = function (iso) { return iso ? new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'; };

  function show(args) {
    load().then(function () {
      if (args && args[0] === 'new') return openNew();
      if (args && args[0]) return openJob(decodeURIComponent(args[0]));
      var list = postings();
      A.view.innerHTML = '<div class="ad-page"><div class="ad-head"><div><h1>Jobs</h1><p class="ad-muted">The postings on the Careers page, in English and French. Changes go online when they are published.</p></div>' +
        '<div class="ad-head-tools"><button type="button" class="ad-btn ad-btn--primary" data-go="jobs/new">New posting</button></div></div>' +
        '<div class="ad-card ad-card--flush"><table class="ad-table"><thead><tr><th>Posting</th><th>Category</th><th>Posted</th><th>Status</th></tr></thead><tbody>' + list.map(function (j) {
          var t = word(j.title);
          return '<tr data-open-j="' + esc(j.id) + '" tabindex="0"' + (j.closed ? ' class="is-off"' : '') + '><td><b>' + esc(t.en || t.fr || 'Untitled') + '</b><small>' + esc(t.fr) + '</small></td><td>' + esc(DATA.categories[j.category] || '—') + '</td><td>' + when(j.date) + '</td><td>' +
            (j.isNew ? '<em class="ad-chip ad-chip--green">New, not published</em>' : j.closed ? '<em class="ad-chip ad-chip--gray">Closed, not published</em>' : edited(j) ? '<em class="ad-chip ad-chip--amber">Edited, not published</em>' : '<em class="ad-chip ad-chip--ok">On the website</em>') + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
      A.bindGo(A.view);
      $$('[data-open-j]', A.view).forEach(function (r) {
        var go = function () { A.go('jobs/' + encodeURIComponent(r.getAttribute('data-open-j'))); };
        r.addEventListener('click', go); r.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
      });
    });
  }

  // the fact line (location, schedule, date): signel.ca's icon list, its texts edited in place
  function factsOf(html) { var box = document.createElement('div'); box.innerHTML = html || ''; return $$('li', box).map(function (li) { var s = li.querySelectorAll('span'); return (s[s.length - 1] || li).textContent.trim(); }); }
  function factsWith(html, texts) { var box = document.createElement('div'); box.innerHTML = html || ''; $$('li', box).forEach(function (li, i) { var s = li.querySelectorAll('span'), t = s[s.length - 1]; if (t && texts[i] != null) t.textContent = texts[i]; }); return box.innerHTML; }

  function openNew() {
    var id = 'n' + Date.now().toString(36);
    var j = { id: id, isNew: true, date: new Date().toISOString(), category: Object.keys(DATA.categories)[0] || '', slug: '' };
    var k = keysOf(id, 3); Object.assign(j, k);
    editor(j, { facts: DATA.factsTemplate, defaults: [['Job description', 'Description du poste'], ['What we are looking for', 'Profil recherché'], ['What we offer', 'Ce que nous offrons']] });
  }
  function openJob(id) {
    var j = postings().filter(function (x) { return x.id === id; })[0];
    if (!j) { A.go('jobs'); return; }
    editor(j, {});
  }
  function editor(j, opts) {
    var isNew = !!j.isNew, sections = j.sections.slice(), rtes = {};
    var pair = function (ref, label, kind, def) {
      var w = ref ? word(ref) : { en: '', fr: '' }; if (def && !w.en && !w.fr) w = { en: def[0], fr: def[1] };
      return '<div class="ad-pair" data-ref="' + esc(ref) + '" data-kind="' + kind + '"><span class="ad-pair-l">' + esc(label) + '</span>' +
        ['en', 'fr'].map(function (l) { return '<label class="ad-pair-f"><span class="ad-lang-cap">' + (l === 'en' ? 'English' : 'Français') + '</span>' + (kind === 'rich' ? '<div data-rte="' + l + '"></div>' : kind === 'long' ? '<textarea class="ad-input" rows="2" data-l="' + l + '">' + esc(w[l]) + '</textarea>' : '<input class="ad-input" data-l="' + l + '" value="' + esc(w[l]) + '">') + '</label>'; }).join('') + '</div>';
    };
    var facts = opts.facts || word(j.facts), fen = factsOf(facts.en), ffr = factsOf(facts.fr);
    A.view.innerHTML = '<div class="ad-page"><div class="ad-head"><div><button type="button" class="ad-link" data-go="jobs">← All postings</button><h1>' + (isNew ? 'New posting' : esc(word(j.title).en || 'Posting')) + '</h1>' +
      (j.url ? '<p class="ad-muted"><a href="' + esc(A.ROOT + j.url) + '" target="_blank" rel="noopener">View in English</a> · <a href="' + esc(A.ROOT + j.url_fr) + '" target="_blank" rel="noopener">Voir en français</a></p>' : '<p class="ad-muted">Appears on the Careers page once published.</p>') + '</div>' +
      '<div class="ad-head-tools">' + (isNew ? '' : '<button type="button" class="ad-btn" data-jclose>' + (j.closed ? 'Reopen the posting' : 'Close the posting') + '</button>') + '<button type="button" class="ad-btn ad-btn--primary" data-jsave>Save</button></div></div>' +
      '<form class="ad-card ad-job" data-jform onsubmit="return false">' +
      pair(j.title, 'Title', 'line') + pair(j.seo, 'Summary (shown on the Careers page and in search results)', 'long') +
      '<div class="ad-pair ad-pair--select"><span class="ad-pair-l">Category</span><select class="ad-input" data-jcat>' + Object.keys(DATA.categories).map(function (c) { return '<option value="' + c + '"' + (j.category === c ? ' selected' : '') + '>' + esc(DATA.categories[c]) + '</option>'; }).join('') + '</select></div>' +
      '<div class="ad-pair ad-facts"><span class="ad-pair-l">Fact line (location, schedule, date…)</span><div class="ad-fact-list">' + fen.map(function (t, i) { return '<div class="ad-fact"><input class="ad-input" data-fact-en="' + i + '" value="' + esc(t) + '"><input class="ad-input" data-fact-fr="' + i + '" value="' + esc(ffr[i] || '') + '"></div>'; }).join('') + '</div></div>' +
      '<h2 class="ad-job-h">Sections</h2><div data-jsections>' + sections.map(function (s, i) {
        var d = (opts.defaults || [])[i];
        return '<section class="ad-job-sec" data-sec="' + i + '">' + pair(s.head, 'Section heading', 'line', d) + pair(s.body, 'Section text', 'rich') + '</section>';
      }).join('') + '</div>' +
      (isNew ? '<button type="button" class="ad-btn" data-jadd>Add a section</button>' : '<p class="ad-muted ad-small">A published posting keeps its sections; to add one, post a new version and close this one.</p>') +
      '</form></div>';
    A.bindGo(A.view);
    var mount = function () {
      $$('[data-kind="rich"]', A.view).forEach(function (p) {
        var ref = p.getAttribute('data-ref'), w = word(ref);
        ['en', 'fr'].forEach(function (l) { var slot = $('[data-rte="' + l + '"]', p); if (slot.firstChild) return; var r = A.rte(w[l]); slot.appendChild(r.el); rtes[ref + '|' + l] = r; });
      });
    };
    mount();
    var addBtn = $('[data-jadd]', A.view);
    if (addBtn) addBtn.addEventListener('click', function () {
      var i = sections.length, k = keysOf(j.id, i + 1).sections[i]; sections.push(k);
      var div = document.createElement('div'); div.innerHTML = '<section class="ad-job-sec" data-sec="' + i + '">' + pair(k.head, 'Section heading', 'line') + pair(k.body, 'Section text', 'rich') + '</section>';
      $('[data-jsections]', A.view).appendChild(div.firstChild); mount();
    });
    var closeBtn = $('[data-jclose]', A.view);
    if (closeBtn) closeBtn.addEventListener('click', function () {
      var jobs = ch().jobs, cur = jobs[j.id] || {};
      if (j.closed) { delete cur.closed; if (Object.keys(cur).length) jobs[j.id] = cur; else delete jobs[j.id]; }
      else { if (!confirm('Close this posting? It leaves the Careers page when you publish.')) return; jobs[j.id] = Object.assign(cur, { closed: true }); }
      A.save(); A.toast(j.closed ? 'Reopened.' : 'Closed. Publish to take it off the site.'); A.go('jobs');
    });
    $('[data-jsave]', A.view).addEventListener('click', function () {
      var text = ch().text, jobs = ch().jobs, form = $('[data-jform]', A.view);
      var put = function (ref, en, fr) {
        var pub = DATA.texts[ref] || { en: '', fr: '' };
        if (!isNew && en === pub.en && fr === pub.fr) delete text[ref]; else text[ref] = { en: en, fr: fr };
      };
      $$('.ad-pair[data-ref]', form).forEach(function (p) {
        var ref = p.getAttribute('data-ref'), kind = p.getAttribute('data-kind');
        if (kind === 'rich') put(ref, rtes[ref + '|en'].get(), rtes[ref + '|fr'].get());
        else put(ref, $('[data-l="en"]', p).value.trim(), $('[data-l="fr"]', p).value.trim());
      });
      var fe = $$('[data-fact-en]', form).map(function (i) { return i.value.trim(); }), ff = $$('[data-fact-fr]', form).map(function (i) { return i.value.trim(); });
      put(j.facts, factsWith(facts.en, fe), factsWith(facts.fr, ff));
      var title = text[j.title] || DATA.texts[j.title] || {};
      if (!title.en || !title.fr) { A.toast('A posting needs its title in English and French.'); return; }
      var cat = $('[data-jcat]', form).value;
      // its addresses, from its titles until it is published (then they stay)
      if (isNew) jobs[j.id] = { new: true, slug: A.slugify(title.fr), slug_en: A.slugify(title.en) || A.slugify(title.fr), date: j.date, category: cat, sections: sections.length };
      else if (cat !== (DATA.jobs.filter(function (x) { return x.id === j.id; })[0] || {}).category) jobs[j.id] = Object.assign(jobs[j.id] || {}, { category: cat });
      A.save(); A.toast('Saved. Publish to put it on the website.'); A.go('jobs');
    });
  }

  A.section('jobs', {
    show: show,
    tiles: function () {
      if (!DATA) { load().then(function () { if (/^#?(overview)?$/.test(location.hash)) A.go('overview'); }); return []; }
      var live = postings().filter(function (j) { return !j.closed && !j.isNew; }).length;
      return [A.tile('jobs', '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 13h18"/></svg>', 'Open postings', live, 'On the Careers page', '')];
    },
    changes: function () {
      if (!DATA) return [];
      return postings().filter(edited).map(function (j) {
        var t = word(j.title);
        return { title: t.en || t.fr || 'Posting', what: j.isNew ? 'New posting' : j.closed ? 'Closed posting' : 'Posting edited', chip: j.isNew ? 'New' : j.closed ? 'Closed' : 'Edited', go: 'jobs/' + encodeURIComponent(j.id),
          undo: function () {
            var c = ch(); delete c.jobs[j.id];
            [j.title, j.seo, j.facts].concat(j.sections.map(function (s) { return s.head; }), j.sections.map(function (s) { return s.body; })).forEach(function (r) { if (r) delete c.text[r]; });
          } };
      });
    }
  });
  load().then(function () { A.badges(); });
})();
