/* Signel Services — admin (src/pages/admin.js). Staff sign-in, then the dashboard. This file
   is the core (sign-in, roles, navigation, products, prices, requests, publish); Orders,
   Members, Users, Jobs and Pages live in their own files (src/js/admin-*.js) and plug in
   through window.SignelAdmin. Who sees which section: src/model/admin-roles.js.
     Overview          what needs attention, for the signed-in role
     Products          the catalogue as a table with filters; a product opens in the editor
     Requests          a board of what visitors sent (account, message)
     Publish           the changes made here (products, jobs, page text), and how they go online
     Website versions  every published version (rollback switched on at launch)
     Backups           copies of the changes, to go back to
   Served by the back end (backend/server.js, on a computer at Signel), the dashboard signs
   in against it, keeps every change in its shared draft (each save sends what changed: one
   product, one job, one text) and publishes with one button: the site is rebuilt and goes
   online. Served by the static preview (no back end), it is a demo: changes stay in this
   browser (localStorage 'signel.admin.changes') and are downloaded as catalog.json, the file
   the build applies (src/model/catalog-edits.js). Requests stay in 'signel.requests' (written
   by the site: src/js/log.js signelRequest) either way, until the site itself has a server. */
(function () {
  'use strict';
  var ROOT = document.documentElement.getAttribute('data-root') || '';
  var SESSION = 'signel.admin.session', CHANGES = 'signel.admin.changes', REQUESTS = 'signel.requests';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
  var store = {
    get: function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };
  var ICON = {
    pic: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
    tag: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="8" cy="8" r="1.5"/></svg>',
    link: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1"/><path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1"/></svg>',
    eye: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 6.1A9.7 9.7 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-2.6 3.2M6.5 7.6A15 15 0 0 0 3 12s4 6 9 6a9 9 0 0 0 4.4-1.1"/></svg>',
    inbox: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v12H8l-4 4z"/></svg>',
    up: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg>',
    left: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
    right: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'
  };

  /* ---------- the back end, when this page is served by it (backend/server.js) ---------- */
  var BACKEND = fetch(ROOT + '/api/status', { credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { return d && d.backend ? d : null; }).catch(function () { return null; });
  function api(method, url, data) {
    var o = { method: method, credentials: 'same-origin', headers: { 'X-Signel': '1' } };
    if (data !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(data); }
    return fetch(ROOT + '/api/' + url, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || 'The server said ' + r.status); e.status = r.status; throw e; } return d; });
    });
  }
  var clone = function (v) { return JSON.parse(JSON.stringify(v)); };
  var signIn = function (me) { sessionStorage.setItem(SESSION, JSON.stringify({ email: me.email, name: me.name, role: me.role, at: Date.now(), backend: true })); };

  /* ---------- roles and staff (src/model/admin-roles.js) ---------- */
  var ACCESS = { roles: {}, sections: [], staff: [] };
  try { ACCESS = JSON.parse($('#admin-access').textContent); } catch (e) {}
  var USERS = 'signel.admin.users';
  // staff accounts: kept in this browser until the back end holds them (Users section)
  function staff() {
    var list = store.get(USERS, null);
    if (!list) { list = ACCESS.staff.map(function (u) { return Object.assign({ active: true }, u); }); store.set(USERS, list); }
    return list;
  }

  /* ---------- sign-in (demo: the back end will check real accounts and passwords) ---------- */
  var login = $('[data-admin-login]');
  if (login) {
    var enter = function () { location.href = ROOT + '/admin/dashboard/'; };
    BACKEND.then(function (b) {
      if (!b) { if (sessionStorage.getItem(SESSION)) location.replace(ROOT + '/admin/dashboard/'); return; }
      // real accounts: no demo list
      var demo = $('.adm-demo'); if (demo) demo.hidden = true;
      if (b.signedIn) api('GET', 'me').then(function (d) { signIn(d.me); enter(); }).catch(function () {});
    });
    $$('[data-demo-email]').forEach(function (b) { b.addEventListener('click', function () { login.email.value = b.getAttribute('data-demo-email'); login.password.value = 'signel-admin'; login.password.focus(); }); });
    login.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = login.email.value.trim().toLowerCase(), pw = login.password.value, err = $('[data-admin-err]');
      BACKEND.then(function (b) {
        if (b) {
          api('POST', 'login', { email: email, password: pw }).then(function (d) { signIn(d.me); enter(); })
            .catch(function (x) { err.textContent = x.message; err.hidden = false; });
          return;
        }
        var u = staff().filter(function (x) { return x.email.toLowerCase() === email; })[0];
        if (u && u.active && pw === 'signel-admin') {
          sessionStorage.setItem(SESSION, JSON.stringify({ email: u.email, name: u.name, role: u.role, at: Date.now() }));
          enter();
        } else { err.textContent = u && !u.active ? 'This account is switched off. Ask Administration.' : 'Wrong email or password.'; err.hidden = false; }
      });
    });
    return;
  }

  var app = $('[data-admin-app]');
  if (!app) return;
  if (!sessionStorage.getItem(SESSION)) {
    // a new tab of someone signed in to the back end: ask it who they are
    BACKEND.then(function (b) { return b && b.signedIn ? api('GET', 'me') : null; })
      .then(function (d) { if (d) { signIn(d.me); location.reload(); } else location.replace(ROOT + '/admin/'); })
      .catch(function () { location.replace(ROOT + '/admin/'); });
    return;
  }
  var signOut = function () { sessionStorage.removeItem(SESSION); location.href = ROOT + '/admin/'; };
  $('[data-admin-logout]').addEventListener('click', function () {
    BACKEND.then(function (b) { return b ? api('POST', 'logout', {}).catch(function () {}) : null; }).then(signOut);
  });
  // who is signed in, and what their role may open
  var ME = JSON.parse(sessionStorage.getItem(SESSION));
  if (!ME.role) { var u0 = staff().filter(function (x) { return x.email === ME.email; })[0]; ME.role = u0 ? u0.role : 'administration'; ME.name = u0 ? u0.name : 'Administration'; }
  var SECTION = {}; ACCESS.sections.forEach(function (x) { SECTION[x.id] = x; });
  function can(id) { var x = SECTION[id === 'product' ? 'products' : id]; return !!x && x.roles.indexOf(ME.role) >= 0; }
  $('[data-me-name]').textContent = ME.name || ME.email;
  // the role under the name, or the address when the name is the role's
  var roleLabel = (ACCESS.roles[ME.role] || {}).label || ME.role;
  $('[data-me-role]').textContent = roleLabel === ME.name ? ME.email : roleLabel;
  $('[data-me-initial]').textContent = (ME.name || ME.email).charAt(0).toUpperCase();
  $$('[data-nav]').forEach(function (b) { b.hidden = !can(b.getAttribute('data-nav')); });
  // a group title shows when one of its sections does
  $$('[data-nav-group]').forEach(function (g) {
    var el = g.nextElementSibling, any = false;
    while (el && !el.matches('[data-nav-group]')) { if (el.matches('[data-nav]') && !el.hidden) any = true; el = el.nextElementSibling; }
    g.hidden = !any;
  });
  $('[data-search-box]').hidden = $('[data-admin-new]').hidden = !can('products');

  // sections in their own files (src/js/admin-*.js) register here: { show(args), badge(), tiles(), changes() }
  var MOD = {};

  var DATA = null, byId = {}, catById = {};
  // changes: { products: { id: {field: value} }, new: [ {...} ] } — the catalog.json shape
  var changes = store.get(CHANGES, { products: {}, new: [] });
  // job postings and page text changed here go online with the products (Publish)
  changes.jobs = changes.jobs || {}; changes.text = changes.text || {};
  // with a back end: its status, the draft as last saved there (BASE), its revision, and a
  // price list imported and not published yet
  var SERVER = null, BASE = null, REV = 0, PRICES_PENDING = null;
  var FIELDS = ['name', 'name_fr', 'sku', 'internalId', 'categories', 'description', 'description_fr', 'priceStyle', 'images', 'images_fr', 'documents', 'options', 'specs', 'weight', 'dimensions', 'pricing', 'hidden'];
  // the language being edited: name, description, pictures and option wording show in it;
  // everything else (SKU, categories, prices...) is the same in both and shows once
  var EL = sessionStorage.getItem('signel.admin.lang') === 'fr' ? 'fr' : 'en';
  var LANGS = { en: 'English', fr: 'Français' };
  var current = null;   // the product open in the editor: { id, isNew }
  var dirty = false, saved = null;   // unsaved edits in the editor, and the last saved state
  var viewEl = $('[data-view]');
  var src = function (s) { return /^(data:|https?:)/.test(s) ? s : ROOT + s; };
  var plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : many); };

  // the sections in their own files load after this one: start once they have registered
  var domReady = new Promise(function (res) { if (document.readyState === 'complete') res(); else document.addEventListener('DOMContentLoaded', res); });
  // with a back end, the changes are its shared draft, not this browser's
  var fromServer = BACKEND.then(function (b) {
    if (!b) return null;
    SERVER = b;
    return Promise.all([api('GET', 'me'), api('GET', 'draft')]).then(function (r) {
      var me = r[0].me;
      if (me.role !== ME.role || me.name !== ME.name) { signIn(me); location.reload(); return new Promise(function () {}); }
      applyDraft(r[1]);
      var pw = $('[data-admin-password]'); if (pw) { pw.hidden = false; pw.addEventListener('click', changePassword); }
      return b;
    }, function (e) { if (e.status === 401) { signOut(); return new Promise(function () {}); } throw e; });
  });
  Promise.all([fetch(ROOT + '/admin/catalog-data.json').then(function (r) { return r.json(); }), domReady, fromServer]).then(function (all) {
    var d = all[0];
    DATA = d;
    d.products.forEach(function (p) {
      byId[p.id] = p;
      // French option wording that the build had none for counts as empty, so it reads "to translate"
      (p.options || []).concat(p.specs || []).forEach(function (o) { if (!(o.values_fr || []).some(Boolean)) o.values_fr = []; });
    });
    d.categories.forEach(function (c) { catById[c.id] = c; });
    paintBadges();
    route();
  }).catch(function () { viewEl.innerHTML = '<div class="ad-empty-state"><h2>The catalogue could not be loaded</h2><p>Reload the page. If it keeps happening, the site build may be missing admin/catalog-data.json.</p></div>'; });

  /* ---------- navigation: #overview, #products, #product/<id>, #requests, #publish ... ---------- */
  function go(hash) { if (location.hash !== '#' + hash) location.hash = hash; else route(); }
  window.addEventListener('hashchange', function () {
    if (dirty && !confirm('You have unsaved changes to this product. Leave without saving?')) { history.replaceState(null, '', '#product/' + current.id); return; }
    route();
  });
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  function route() {
    if (!DATA) return;
    var h = location.hash.replace(/^#/, '') || 'overview', parts = h.split('/');
    dirty = false; app.classList.remove('nav-open');
    if (parts[0] !== 'product') { current = null; closePreview(); }
    if (!can(parts[0])) { parts = ['overview']; history.replaceState(null, '', '#overview'); }
    $$('[data-nav]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-nav') === (parts[0] === 'product' ? 'products' : parts[0])); });
    var core = { overview: showOverview, products: showProducts, product: function () { openProduct(Number(parts[1])); }, requests: showRequests,
               prices: showPrices, publish: showPublish, versions: showVersions, backups: showBackups };
    var fn = core[parts[0]] || (MOD[parts[0]] && MOD[parts[0]].show) || showOverview;
    fn(parts.slice(1));
    if (document.activeElement !== gsearch) viewEl.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  $$('[data-nav]').forEach(function (b) { b.addEventListener('click', function () { go(b.getAttribute('data-nav')); }); });
  $('[data-nav-toggle]').addEventListener('click', function () { app.classList.toggle('nav-open'); });

  // the search box in the top bar: products, from anywhere ("/" to jump to it)
  var gsearch = $('[data-global-search]');
  gsearch.addEventListener('input', function () { PF.q = gsearch.value; PF.page = 1; if (location.hash !== '#products') go('products'); else paintTable(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); gsearch.focus(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && current) { e.preventDefault(); saveProduct(); }
    if (e.key === 'Escape') closeDrawer();
  });

  function pendingCount() { return Object.keys(changes.products).length + changes.new.length + Object.keys(changes.jobs).length + Object.keys(changes.text).length + (PRICES_PENDING ? 1 : 0); }
  function paintBadges() {
    var counts = { publish: pendingCount(), requests: requests().filter(function (x) { return x.status === 'new'; }).length };
    Object.keys(MOD).forEach(function (k) { if (MOD[k].badge) counts[k] = MOD[k].badge(); });
    Object.keys(counts).forEach(function (k) { var b = $('[data-badge-' + k + ']'); if (b) { b.textContent = counts[k]; b.hidden = !counts[k]; } });
  }

  /* ---------- products: the catalogue with this browser's changes over it ---------- */
  function allProducts() { return changes.new.map(function (n) { return Object.assign({ isNew: true }, n); }).concat(DATA.products); }
  function view(p) { return p.isNew ? p : Object.assign({}, p, changes.products[p.id] || {}); }
  function isChanged(p) { return p.isNew || !!changes.products[p.id]; }
  function find(id) { return changes.new.filter(function (n) { return n.id === id; })[0] || byId[id]; }
  var CHECKS = {
    nopic: { label: 'No picture', test: function (v) { return !(v.images || []).length; } },
    nosku: { label: 'No SKU', test: function (v) { return !v.sku; } },
    noid: { label: 'No internal ID', test: function (v) { return !v.internalId; } },
    nocat: { label: 'No category', test: function (v) { return !(v.categories || []).length; } },
    nodesc: { label: 'No description', test: function (v) { return !String(v.description || '').replace(/<[^>]+>/g, '').trim(); } },
    tofr: { label: 'To translate', test: function (v) { return missingIn(v, 'fr').length > 0; } }
  };
  var STYLE_NAME = { card: 'Normal', table: 'Price table', sizes: 'Size run' };
  // A sketch of each page display (not the product): what the customer will see in the price card
  var g = function (x, y, w, h, fill, r) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (r == null ? 4 : r) + '" fill="' + fill + '"/>'; };
  var T = function (x, y, t, fill, size, weight, anchor) { return '<text x="' + x + '" y="' + y + '" fill="' + (fill || '#0E171B') + '" font-size="' + (size || 13) + '" font-weight="' + (weight || 600) + '" font-family="Red Hat Display, system-ui, sans-serif"' + (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + t + '</text>'; };
  var step = function (x, y, n, on) { return g(x, y, 78, 26, '#fff', 13) + '<rect x="' + (x + .75) + '" y="' + (y + .75) + '" width="76.5" height="24.5" rx="12.25" fill="none" stroke="' + (on ? '#004EA4' : '#C9D2DB') + '" stroke-width="' + (on ? 1.5 : 1) + '"/>' + T(x + 13, y + 18, '−', '#5B6770', 14, 500) + T(x + 39, y + 18, n, on ? '#004EA4' : '#9AA6B0', 13, 700, 'middle') + T(x + 60, y + 18, '+', '#5B6770', 14, 500); };
  var cardFrame = function (inner) { return '<svg viewBox="0 0 440 236" role="img" xmlns="http://www.w3.org/2000/svg">' + g(0, 0, 440, 236, '#EEF2F6', 16) + g(20, 16, 400, 204, '#fff', 14) + inner + '</svg>'; };
  var btn = function (x, y, w, label) { return g(x, y, w, 32, '#004EA4', 16) + T(x + w / 2, y + 21, label, '#fff', 12.5, 700, 'middle'); };
  var STYLE_ART = {
    card: { label: 'Normal', text: 'One price, the options as buttons or lists, then one quantity and Add to cart. Best for colours or a product with few choices.',
      svg: cardFrame(T(40, 50, '$25.00 – $197.50', '#0E171B', 19, 700) +
        T(40, 80, 'Size', '#3B4852', 11.5) + g(40, 88, 74, 26, '#EEF4FC', 8) + '<rect x="40.75" y="88.75" width="72.5" height="24.5" rx="7.5" fill="none" stroke="#004EA4" stroke-width="1.5"/>' + T(77, 105, '600 mm', '#004EA4', 11.5, 700, 'middle') +
        g(122, 88, 74, 26, '#F3F5F8', 8) + T(159, 105, '750 mm', '#5B6770', 11.5, 500, 'middle') + g(204, 88, 74, 26, '#F3F5F8', 8) + T(241, 105, '900 mm', '#5B6770', 11.5, 500, 'middle') +
        T(40, 136, 'Sheeting', '#3B4852', 11.5) + g(40, 144, 112, 26, '#F3F5F8', 8) + T(96, 161, 'Engineer grade', '#5B6770', 11.5, 500, 'middle') + g(160, 144, 104, 26, '#F3F5F8', 8) + T(212, 161, 'Diamond Grade', '#5B6770', 11.5, 500, 'middle') +
        step(40, 182, '1', false) + btn(130, 179, 270, 'Add to cart')) },
    table: { label: 'Price table', text: 'Every version that exists on its own line, grouped by size, with a quantity on each line and one Add for all of them. Best for signs and anything sold in sizes and materials.',
      svg: cardFrame(T(40, 46, '$25.00 – $197.50', '#0E171B', 19, 700) + g(320, 31, 82, 22, '#EEF4FC', 11) + T(361, 46, '12 versions', '#004EA4', 11, 700, 'middle') +
        g(20, 58, 400, 24, '#F5F7FA', 0) + '<polygon points="46,62 54,70 46,78 38,70" fill="#FFD200" stroke="#0E171B" stroke-width="1"/>' + T(62, 75, '600 x 600 mm', '#0E171B', 12, 700) + T(152, 75, '2 versions', '#9AA6B0', 11, 500) +
        T(40, 104, '1.5 mm', '#3B4852', 12, 500) + g(110, 91, 98, 20, '#F3F5F8', 10) + T(159, 105, 'Engineer grade', '#3B4852', 10.5, 600, 'middle') + step(322, 88, '', false) +
        g(20, 118, 400, 32, '#EEF4FC', 0) + T(40, 138, '2.0 mm', '#3B4852', 12, 500) + g(110, 124, 98, 20, '#fff', 10) + T(159, 138, 'Diamond Grade', '#3B4852', 10.5, 600, 'middle') + step(322, 121, '4', true) +
        g(20, 150, 400, 24, '#F5F7FA', 0) + '<polygon points="46,153 55,162 46,171 37,162" fill="#FFD200" stroke="#0E171B" stroke-width="1"/>' + T(62, 167, '900 x 900 mm', '#0E171B', 12, 700) +
        T(40, 204, '1 line · 4 signs', '#0E171B', 12, 700) + btn(270, 186, 130, 'Add to cart')) },
    sizes: { label: 'Size run', text: 'One box per size, so a whole crew is ordered at once (3 M, 5 L, 2 XL). Best for clothing.',
      svg: cardFrame(T(40, 50, '$83.32', '#0E171B', 19, 700) +
        ['S', 'M', 'L', 'XL'].map(function (sz, i) { var x = 40 + i * 92, on = sz === 'L'; return g(x, 66, 82, 92, on ? '#EEF4FC' : '#F5F7FA', 12) + (on ? '<rect x="' + (x + .75) + '" y="66.75" width="80.5" height="90.5" rx="11.25" fill="none" stroke="#004EA4" stroke-width="1.5"/>' : '') + T(x + 41, 98, sz, on ? '#004EA4' : '#0E171B', 18, 700, 'middle') + step(x + 2, 118, on ? '5' : '', on); }).join('') +
        T(40, 204, '5 coveralls · $416.60', '#0E171B', 12, 700) + btn(270, 186, 130, 'Add to cart')) }
  };
  function paintStyleArt(f) {
    var fig = $('[data-style-art]', f); if (!fig) return;
    var pick = (f.priceStyle && f.priceStyle.value) || 'auto', auto = pick === 'auto', key = auto ? fig.getAttribute('data-auto') : pick, a = STYLE_ART[key] || STYLE_ART.card;
    fig.innerHTML = '<div class="ad-style-art-pic">' + a.svg + '</div><figcaption><b>' + (auto ? 'Automatic: ' : '') + a.label + '</b><span>' + a.text + '</span><small>A sketch of the price card, not this product.</small></figcaption>';
  }

  /* ---------- Overview: what needs attention, for the signed-in role ---------- */
  function tile(k, icon, label, value, hint, tone) {
    return '<button type="button" class="ad-stat' + (tone ? ' ad-stat--' + tone : '') + '" data-go="' + k + '"><span class="ad-stat-ic">' + icon + '</span><span class="ad-stat-n">' + Number(value).toLocaleString('en-CA') + '</span><span class="ad-stat-l">' + label + '</span><span class="ad-stat-h">' + hint + '</span></button>';
  }
  function showOverview() {
    var hour = new Date().getHours(), tiles = [], cards = [];
    // the sections in their own files first (orders, members, jobs...), each only for its roles
    Object.keys(MOD).forEach(function (k) { if (can(k) && MOD[k].tiles) tiles = tiles.concat(MOD[k].tiles()); });
    if (can('requests')) {
      var reqs = requests(), fresh = reqs.filter(function (r) { return r.status === 'new'; });
      tiles.push(tile('requests', ICON.inbox, 'New requests', fresh.length, fresh.length ? 'Waiting for an answer' : 'All answered', fresh.length ? 'blue' : ''));
      cards.push('<section class="ad-card"><div class="ad-card-head"><h2>Latest requests</h2><button type="button" class="ad-link" data-go="requests">Open the board</button></div>' +
        (reqs.length ? '<ul class="ad-mini-list">' + reqs.slice(0, 6).map(function (r) {
          return '<li><button type="button" data-req="' + r.id + '">' + typeChip(r.type) + '<span class="ad-mini-t"><b>' + esc(who(r)) + '</b><small>' + esc(summary(r)) + '</small></span><span class="ad-mini-s">' + statusChip(r.status) + '<small>' + ago(r.at) + '</small></span></button></li>';
        }).join('') + '</ul>' : '<p class="ad-muted">No requests yet. They appear here when visitors create an account or write to you.</p>') + '</section>');
    }
    if (can('products')) {
      var live = allProducts().map(view).filter(function (v) { return !v.hidden; });
      var count = function (k) { return live.filter(CHECKS[k].test).length; };
      tiles.push(tile('products/nopic', ICON.pic, 'Need a picture', count('nopic'), 'Products shown without one', count('nopic') ? 'warn' : ''),
        tile('products/nosku', ICON.tag, 'No SKU', count('nosku'), 'Add the product code', count('nosku') ? 'warn' : ''),
        tile('products/noid', ICON.link, 'No internal ID', count('noid'), 'To match the internal software', ''),
        tile('products/tofr', '<b class="ad-stat-fr">FR</b>', 'French to finish', count('tofr'), 'Name, description or options', count('tofr') ? 'warn' : ''));
      var n0 = Object.keys(changes.products).length + changes.new.length;
      cards.push('<section class="ad-card"><div class="ad-card-head"><h2>Recently edited</h2><button type="button" class="ad-link" data-go="publish">Review and publish</button></div>' +
        (n0 ? '<ul class="ad-mini-list">' + changedList().slice(0, 6).map(function (c) {
          return '<li><button type="button" data-go="product/' + c.id + '">' + thumb(c.v) + '<span class="ad-mini-t"><b>' + esc(c.v.name) + '</b><small>' + esc(c.what) + '</small></span><span class="ad-mini-s">' + (c.isNew ? '<em class="ad-chip ad-chip--green">New</em>' : '<em class="ad-chip ad-chip--amber">Edited</em>') + '</span></button></li>';
        }).join('') + '</ul>' : '<p class="ad-muted">Nothing changed since the last publish. Open a product to edit it, or add a new one.</p>') + '</section>');
    }
    if (can('publish')) { var n = pendingCount(); tiles.push(tile('publish', ICON.up, 'Not published yet', n, n ? 'Changes made here' : 'Everything is published', n ? 'warn' : '')); }
    Object.keys(MOD).forEach(function (k) { if (can(k) && MOD[k].cards) cards = cards.concat(MOD[k].cards()); });
    viewEl.innerHTML = '<div class="ad-page">' +
      '<div class="ad-head"><div><p class="ad-eyebrow">' + new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }) + ' · ' + esc((ACCESS.roles[ME.role] || {}).label || '') + '</p><h1>Good ' + (hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening') + ', ' + esc((ME.name || '').split(' ')[0]) + '</h1></div></div>' +
      '<div class="ad-stats">' + tiles.join('') + '</div>' +
      (cards.length ? '<div class="ad-cols">' + cards.join('') + '</div>' : '') + '</div>';
    bindGo(viewEl);
    $$('[data-req]', viewEl).forEach(function (b) { b.addEventListener('click', function () { go('requests'); setTimeout(function () { openRequest(b.getAttribute('data-req')); }, 60); }); });
    Object.keys(MOD).forEach(function (k) { if (can(k) && MOD[k].bindOverview) MOD[k].bindOverview(viewEl); });
  }
  function bindGo(root) { $$('[data-go]', root).forEach(function (b) { b.addEventListener('click', function () { go(b.getAttribute('data-go')); }); }); }
  function thumb(v, size) { var i = (v.images || [])[0]; return i ? '<img class="ad-thumb' + (size ? ' ad-thumb--' + size : '') + '" src="' + esc(src(i)) + '" alt="" loading="lazy">' : '<span class="ad-thumb ad-thumb--none' + (size ? ' ad-thumb--' + size : '') + '">' + ICON.pic + '</span>'; }

  /* ---------- Products: table with filters ---------- */
  var PF = { q: '', filter: 'all', cat: 0, page: 1 };
  var PER = 50;
  function showProducts(args) {
    if (args && args[0] && (CHECKS[args[0]] || /^(edited|hidden)$/.test(args[0]))) PF.filter = args[0];
    var chips = [['all', 'All'], ['edited', 'Edited here'], ['tofr', 'French to finish'], ['nopic', 'No picture'], ['nosku', 'No SKU'], ['noid', 'No internal ID'], ['nodesc', 'No description'], ['hidden', 'Hidden']];
    viewEl.innerHTML = '<div class="ad-page">' +
      '<div class="ad-head"><div><h1>Products</h1><p class="ad-muted" data-p-count></p></div></div>' +
      '<div class="ad-toolbar"><div class="ad-chips" role="group" aria-label="Show">' + chips.map(function (c) { return '<button type="button" class="ad-chip-btn' + (PF.filter === c[0] ? ' on' : '') + '" data-pf="' + c[0] + '">' + c[1] + '<span data-pf-n="' + c[0] + '"></span></button>'; }).join('') + '</div>' +
      '<select class="ad-select" data-p-cat aria-label="Category"><option value="">All categories</option>' + DATA.categories.map(function (c) { return '<option value="' + c.id + '"' + (PF.cat === c.id ? ' selected' : '') + '>' + esc(c.path) + '</option>'; }).join('') + '</select></div>' +
      '<div class="ad-card ad-card--flush"><table class="ad-table"><thead><tr><th>Product</th><th>Internal ID</th><th>Category</th><th>Page display</th><th>Status</th></tr></thead><tbody data-p-rows></tbody></table>' +
      '<div class="ad-table-foot" data-p-foot></div></div></div>';
    gsearch.value = PF.q;
    $$('[data-pf]', viewEl).forEach(function (b) { b.addEventListener('click', function () { PF.filter = b.getAttribute('data-pf'); PF.page = 1; $$('[data-pf]', viewEl).forEach(function (x) { x.classList.toggle('on', x === b); }); paintTable(); }); });
    $('[data-p-cat]', viewEl).addEventListener('change', function (e) { PF.cat = Number(e.target.value) || 0; PF.page = 1; paintTable(); });
    $('[data-p-rows]', viewEl).addEventListener('click', function (e) { var r = e.target.closest('[data-open]'); if (r) go('product/' + r.getAttribute('data-open')); });
    $('[data-p-rows]', viewEl).addEventListener('keydown', function (e) { var r = e.target.closest('[data-open]'); if (r && e.key === 'Enter') go('product/' + r.getAttribute('data-open')); });
    $('[data-p-foot]', viewEl).addEventListener('click', function (e) { if (e.target.closest('[data-more]')) { PF.page++; paintTable(); } });
    paintTable();
  }
  function filtered(filter) {
    var q = norm(PF.q).trim();
    return allProducts().filter(function (p) {
      var v = view(p);
      if (PF.cat && (v.categories || []).indexOf(PF.cat) < 0) return false;
      if (q && norm(v.name + ' ' + v.sku + ' ' + (v.internalId || '') + ' ' + v.id).indexOf(q) < 0) return false;
      if (filter === 'edited') return isChanged(p);
      if (filter === 'hidden') return !!v.hidden;
      if (CHECKS[filter]) return !v.hidden && CHECKS[filter].test(v);
      return true;
    });
  }
  function paintTable() {
    var rows = $('[data-p-rows]'); if (!rows) return;
    var list = filtered(PF.filter);
    $$('[data-pf-n]', viewEl).forEach(function (s) { var n = filtered(s.getAttribute('data-pf-n')).length; s.textContent = n.toLocaleString('en-CA'); });
    $('[data-p-count]', viewEl).textContent = plural(list.length, 'product', 'products') + (PF.q ? ' matching “' + PF.q + '”' : '');
    rows.innerHTML = list.slice(0, PF.page * PER).map(function (p) {
      var v = view(p), cat = catById[(v.categories || [])[(v.categories || []).length - 1]];
      var style = v.priceStyle && v.priceStyle !== 'auto' ? STYLE_NAME[v.priceStyle] : STYLE_NAME[v.autoStyle || 'card'] + ' <small>(auto)</small>';
      var flags = (p.isNew ? '<em class="ad-chip ad-chip--green">New</em>' : isChanged(p) ? '<em class="ad-chip ad-chip--amber">Edited</em>' : '') +
        (v.hidden ? '<em class="ad-chip ad-chip--red">Hidden</em>' : '') + (!(v.images || []).length ? '<em class="ad-chip">No picture</em>' : '') +
        (missingIn(v, 'fr').length ? '<em class="ad-chip ad-chip--amber" title="Something is still in English only">FR to finish</em>' : '');
      return '<tr data-open="' + p.id + '" tabindex="0"><td><div class="ad-prod">' + thumb(v) + '<span><b>' + esc(v.name) + '</b><small>' + (v.sku ? esc(v.sku) : '<i>No SKU</i>') + '</small></span></div></td>' +
        '<td>' + (v.internalId ? esc(v.internalId) : '<span class="ad-muted">—</span>') + '</td><td class="ad-cat">' + (cat ? esc(cat.name) : '<span class="ad-muted">—</span>') + '</td><td>' + style + '</td><td><div class="ad-flags">' + (flags || '<span class="ad-muted">On the site</span>') + '</div></td></tr>';
    }).join('') || '<tr><td colspan="5" class="ad-none">No product matches. Try another filter or search.</td></tr>';
    $('[data-p-foot]', viewEl).innerHTML = list.length > PF.page * PER ? '<span>Showing ' + (PF.page * PER) + ' of ' + list.length.toLocaleString('en-CA') + '</span><button type="button" class="ad-btn" data-more>Show ' + Math.min(PER, list.length - PF.page * PER) + ' more</button>' : '';
  }

  $('[data-admin-new]').addEventListener('click', function () {
    // after every id in use: the catalogue's own (products added before) and this browser's
    var ids = changes.new.map(function (n) { return n.id; }).concat(DATA.products.map(function (p) { return p.id; }));
    var id = Math.max.apply(null, [Number(app.getAttribute('data-new-id-from')) - 1].concat(ids)) + 1;
    changes.new.unshift({ id: id, name: 'New product', name_fr: '', sku: '', internalId: '', categories: [], description: '', description_fr: '', priceStyle: 'auto', images: [], images_fr: null, documents: [],
                          options: [], specs: [], weight: '', dimensions: { length: '', width: '', height: '' }, pricing: { mode: 'quote', price: '', priceMax: '' } });
    save(); go('product/' + id);
  });

  /* ---------- the product editor: tabs over one form, a save bar while there are edits ---------- */
  function openProduct(id) {
    var p = find(id); if (!p) { go('products'); return; }
    var isNew = !byId[id];
    current = { id: id, isNew: isNew };
    var v = isNew ? p : Object.assign({}, p, changes.products[id] || {});
    viewEl.innerHTML = editorHtml(v, isNew);
    bindEditor(v);
    saved = JSON.stringify(collect($('[data-admin-form]')));
    paintDirty();
  }
  var TABS = [['basics', 'Basics'], ['description', 'Description'], ['categories', 'Categories'], ['price', 'Price & choices'], ['details', 'Specs & documents']];
  function row(cls, inner) { return '<div class="adm-rowedit ' + cls + '">' + inner + '<button type="button" class="ad-icon-btn" data-del title="Remove" aria-label="Remove">' + ICON.x + '</button></div>'; }
  function imgTile(s, i) {
    return '<div class="ad-pic" data-pic>' + '<img src="' + esc(src(s)) + '" alt="">' + (i === 0 ? '<em class="ad-pic-main">Main picture</em>' : '') +
      '<input type="hidden" data-img value="' + esc(/^data:/.test(s) ? '' : s) + '"' + (/^data:/.test(s) ? ' data-file="' + esc(s) + '"' : '') + '>' +
      '<div class="ad-pic-tools"><button type="button" data-pic-left title="Move left" aria-label="Move left">' + ICON.left + '</button><button type="button" data-pic-right title="Move right" aria-label="Move right">' + ICON.right + '</button><button type="button" data-pic-del title="Remove" aria-label="Remove">' + ICON.x + '</button></div></div>';
  }
  function docRow(d) {
    return row('adm-doc-row', '<select data-doc-type>' + DATA.docTypes.map(function (t) { return '<option value="' + t + '"' + (t === d.type ? ' selected' : '') + '>' + (DOC_LABEL[t] || t) + '</option>'; }).join('') + '</select>' +
      '<input type="text" placeholder="Label (optional)" value="' + esc(d.label || '') + '" data-doc-label>' +
      '<input type="text" placeholder="/files/... or https://..." value="' + esc(/^data:/.test(d.href) ? '(file from this computer)' : d.href) + '" data-doc-href' + (/^data:/.test(d.href) ? ' data-file="' + esc(d.href) + '" readonly' : '') + '>' +
      '<select data-doc-lang aria-label="Language"><option value="en"' + (d.lang !== 'fr' ? ' selected' : '') + '>English</option><option value="fr"' + (d.lang === 'fr' ? ' selected' : '') + '>French</option></select>');
  }
  function pairRow(kind, o) {
    var vfr = (o.values_fr || []).join(' | ').replace(/^[\s|]+$/, '');
    return row('adm-pair-row',
      '<input type="text" data-l="en" placeholder="' + (kind === 'opt' ? 'Option, e.g. Colour' : 'Name, e.g. Material') + '" value="' + esc(o.label) + '" data-' + kind + '-label>' +
      '<input type="text" data-l="en" placeholder="Values, separated by |   e.g. Amber | White" value="' + esc((o.values || []).join(' | ')) + '" data-' + kind + '-values>' +
      '<input type="text" data-l="fr" placeholder="' + esc(o.label || (kind === 'opt' ? 'Option, ex. Couleur' : 'Nom, ex. Matériau')) + '" value="' + esc(o.label_fr || '') + '" data-' + kind + '-label-fr>' +
      '<input type="text" data-l="fr" placeholder="' + esc((o.values || []).join(' | ') || 'Valeurs, séparées par |   ex. Ambre | Blanc') + '" value="' + esc(vfr) + '" data-' + kind + '-values-fr>');
  }
  // a small marker on fields that are the same in both languages
  var BOTH = '<em class="ad-both" title="The same in English and French">EN = FR</em>';
  function langFld(name, label, v, hint) {
    return '<label class="ad-fld" data-l="en"><span>' + label + ' <em class="ad-lang">EN</em></span><input type="text" name="' + name + '" value="' + esc(v[name] || '') + '"' + (name === 'name' ? ' required' : '') + '>' + (hint ? '<small>' + hint + '</small>' : '') + '</label>' +
      '<label class="ad-fld" data-l="fr"><span>' + label + ' <em class="ad-lang">FR</em></span><input type="text" name="' + name + '_fr" value="' + esc(v[name + '_fr'] || '') + '" placeholder="' + esc(v[name] || '') + '">' + (hint ? '<small>' + hint + '</small>' : '') + '</label>';
  }
  function fld(l, inner, hint) { return '<label class="ad-fld"><span>' + l + '</span>' + inner + (hint ? '<small>' + hint + '</small>' : '') + '</label>'; }
  function catTree(v) {
    var chosen = v.categories || [], roots = DATA.categories.filter(function (c) { return c.depth === 0; });
    return '<div class="ad-catpicked" data-catpicked></div>' +
      '<label class="ad-search ad-search--in">' + '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>' +
      '<input type="search" placeholder="Find a category" data-catfilter></label>' +
      '<div class="ad-cattree" data-cats>' + roots.map(function (r) {
        var kids = DATA.categories.filter(function (c) { return c.path.indexOf(r.path + ' › ') === 0; });
        var open = kids.some(function (k) { return chosen.indexOf(k.id) >= 0; }) || chosen.indexOf(r.id) >= 0;
        var box = function (c) { return '<label data-catpath="' + esc(norm(c.path)) + '" style="--d:' + c.depth + '"><input type="checkbox" value="' + c.id + '"' + (chosen.indexOf(c.id) >= 0 ? ' checked' : '') + '><span>' + esc(c.name) + '</span></label>'; };
        return '<details' + (open ? ' open' : '') + '><summary>' + esc(r.name) + '<small>' + kids.length + '</small></summary>' + box(r) + kids.map(box).join('') + '</details>';
      }).join('') + '</div>';
  }
  function editorHtml(v, isNew) {
    var pr = v.pricing || { mode: 'quote' }, dm = v.dimensions || {};
    var samePics = !v.images_fr || JSON.stringify(v.images_fr) === JSON.stringify(v.images || []);
    var grid = function (key, list, l) {
      return '<div class="ad-pics" data-imgs="' + key + '"' + (l ? ' data-l="' + l + '"' : '') + '>' + (list || []).map(imgTile).join('') +
        '<label class="ad-pic ad-pic--add">' + ICON.pic + '<span>Add a picture</span><small>JPG, PNG or WebP, under 3 MB</small><input type="file" accept="image/*" data-img-file hidden multiple></label></div>';
    };
    var panel = function (id, inner) { return '<section class="ad-panel" data-panel="' + id + '"' + (id === 'basics' ? '' : ' hidden') + '>' + inner + '</section>'; };
    return '<form class="ad-editor" data-admin-form data-elang="' + EL + '" novalidate>' +
      '<nav class="ad-crumbs"><button type="button" class="ad-link" data-go="products">Products</button><span>/</span><span>' + esc(v.name) + '</span></nav>' +
      '<div class="ad-ed-head">' + thumb(v, 'lg') + '<div class="ad-ed-title"><h1 data-ed-name>' + esc(v.name) + '</h1><p>' +
        (v.sku ? '<em class="ad-chip">SKU ' + esc(v.sku) + '</em>' : '<em class="ad-chip ad-chip--warn">No SKU</em>') +
        (isNew ? '<em class="ad-chip ad-chip--green">New, not published</em>' : changes.products[v.id] ? '<em class="ad-chip ad-chip--amber">Edited, not published</em>' : '<em class="ad-chip ad-chip--ok">On the website</em>') +
        (v.hidden ? '<em class="ad-chip ad-chip--red">Hidden</em>' : '') + '<small class="ad-muted">ID ' + v.id + '</small></p></div>' +
        '<div class="ad-ed-actions">' + (v.url && !isNew ? '<a class="ad-btn" href="' + ROOT + v.url + '" target="_blank" rel="noopener">View on site</a>' : '') +
        '<button type="button" class="ad-btn" data-preview-toggle aria-pressed="false">Live preview</button>' +
        '<details class="ad-more"><summary class="ad-btn" aria-label="More actions">•••</summary><div class="ad-menu-pop">' +
          '<button type="button" data-backup>Back up all changes</button>' +
          '<button type="button" data-revert>' + (isNew ? 'Delete this new product' : 'Undo all my changes to this product') + '</button></div></details></div></div>' +
      '<div class="ad-tabbar"><div class="ad-tabs" role="tablist">' + TABS.map(function (t, i) { return '<button type="button" role="tab" aria-selected="' + (i ? 'false' : 'true') + '" data-tab="' + t[0] + '">' + t[1] + '<i data-tab-err hidden></i><i class="ad-tab-tr" data-tab-tr hidden title="Something to translate here"></i></button>'; }).join('') + '</div>' +
      '<div class="ad-langsw" role="group" aria-label="Language you are editing">' + ['en', 'fr'].map(function (l) { return '<button type="button" data-elang="' + l + '" aria-pressed="' + (EL === l) + '">' + LANGS[l] + '<i data-lang-dot="' + l + '" hidden></i></button>'; }).join('') + '</div></div>' +
      '<p class="ad-lang-note" data-lang-note hidden></p>' +

      panel('basics',
        '<div class="ad-card"><h2>Product</h2><div class="ad-grid3">' + langFld('name', 'Name', v) +
          fld('SKU ' + BOTH, '<input type="text" name="sku" value="' + esc(v.sku) + '">', 'The product code customers see') +
          fld('Internal ID ' + BOTH, '<input type="text" name="internalId" value="' + esc(v.internalId || '') + '">', 'The code in the internal software') + '</div>' +
          '<label class="ad-switch"><input type="checkbox" name="hidden"' + (v.hidden ? ' checked' : '') + '><span aria-hidden="true"></span><b>Hide from the website</b><small>The product stays here but nobody can find it on the site.</small></label></div>' +
        '<div class="ad-card' + (samePics ? ' is-same-pics' : '') + '" data-pics-card><h2>Pictures <small>The first one is the main picture</small></h2>' +
          '<label class="ad-switch ad-switch--blue"><input type="checkbox" name="samePics"' + (samePics ? ' checked' : '') + '><span aria-hidden="true"></span><b>Same pictures in English and French</b><small>Turn off when a picture has text in it, to give each language its own.</small></label>' +
          '<p class="ad-pics-lang" data-pics-lang></p>' +
          grid('en', v.images, samePics ? '' : 'en') + grid('fr', samePics ? v.images : v.images_fr, 'fr') +
          '<div class="ad-inline"><input type="text" placeholder="Or paste a picture address, e.g. /img/2026/05/photo.jpg" data-img-url><button type="button" class="ad-btn" data-img-add>Add</button></div></div>') +

      panel('description',
        '<div class="ad-card"><h2>Description <small>Shown under the price card, folded with “Read more” where the pictures end</small></h2>' +
          '<div class="ad-rte-bar" role="toolbar" aria-label="Formatting"><button type="button" data-fmt="h3">Heading</button><button type="button" data-fmt="p">Paragraph</button><button type="button" data-fmt="ul">Bullet list</button><button type="button" data-fmt="b">Bold</button><span></span><button type="button" data-sbs aria-pressed="false">Both languages side by side</button><button type="button" class="on" data-desc-mode="edit">Edit</button><button type="button" data-desc-mode="see">See it</button></div>' +
          '<div class="ad-desc-pair"><label class="ad-desc-l" data-l="en"><span class="ad-lang-cap">English</span><textarea name="description" rows="16" class="ad-code">' + esc(v.description) + '</textarea></label>' +
          '<label class="ad-desc-l" data-l="fr"><span class="ad-lang-cap">Français</span><textarea name="description_fr" rows="16" class="ad-code" placeholder="La description en français. Laissée vide, la page française montre la description anglaise en attendant.">' + esc(v.description_fr || '') + '</textarea></label></div>' +
          '<div class="ad-desc-see rich" data-preview-out hidden></div></div>') +

      panel('categories', '<div class="ad-card"><h2>Categories ' + BOTH + ' <small>Where customers find it when clicking through the site; it also shows in every parent category and in search</small></h2>' + catTree(v) + '</div>') +

      panel('price',
        '<div class="ad-card"><h2>Price ' + BOTH + '</h2><div class="ad-choice">' +
          '<label><input type="radio" name="pmode" value="quote"' + (pr.mode !== 'priced' ? ' checked' : '') + '><span><b>Price on request</b><small>Quoted for each order</small></span></label>' +
          '<label><input type="radio" name="pmode" value="priced"' + (pr.mode === 'priced' ? ' checked' : '') + '><span><b>Fixed price</b><small>Shown to signed-in customers</small></span></label></div>' +
          '<div class="ad-grid3" data-prices' + (pr.mode === 'priced' ? '' : ' hidden') + '>' + fld('Price (CAD)', '<input type="number" min="0" step="0.01" name="price" value="' + esc(pr.price) + '">') +
          fld('Up to (CAD)', '<input type="number" min="0" step="0.01" name="priceMax" value="' + esc(pr.priceMax || '') + '">', 'When options change the price') + '</div></div>' +
        '<div class="ad-card"><h2>Page display <small>How the product page shows the price and the choices</small></h2><div class="ad-choice ad-choice--4">' + [
          ['auto', 'Automatic', 'Now: ' + (STYLE_NAME[v.autoStyle] || STYLE_NAME.card)],
          ['card', 'Normal', 'Price card with option buttons'],
          ['table', 'Price table', 'Every version on its own line'],
          ['sizes', 'Size run', 'One box per clothing size']
        ].map(function (o) { return '<label><input type="radio" name="priceStyle" value="' + o[0] + '"' + ((v.priceStyle || 'auto') === o[0] ? ' checked' : '') + '><span><b>' + o[1] + '</b><small>' + o[2] + '</small></span></label>'; }).join('') + '</div>' +
          '<figure class="ad-style-art" data-style-art data-auto="' + esc(v.autoStyle || 'card') + '"></figure></div>' +
        '<div class="ad-card"><h2>Options the customer chooses <small data-l="en">Each needs two values or more; English colour names show as colour dots</small><small data-l="fr">La même liste dans les deux langues : écrivez ici le texte français de chaque option, dans le même ordre</small></h2><div data-opts>' + (v.options || []).map(function (o) { return pairRow('opt', o); }).join('') + '</div>' +
          '<button type="button" class="ad-btn ad-btn--ghost" data-opt-add>+ Add an option</button></div>') +

      panel('details',
        '<div class="ad-card"><h2>Specifications</h2><div data-specs>' + (v.specs || []).map(function (o) { return pairRow('spec', o); }).join('') + '</div><button type="button" class="ad-btn ad-btn--ghost" data-spec-add>+ Add a specification</button>' +
          '<div class="ad-grid4">' + fld('Weight', '<input type="text" name="weight" value="' + esc(v.weight || '') + '">') + fld('Length', '<input type="text" name="length" value="' + esc(dm.length || '') + '">') +
          fld('Width', '<input type="text" name="width" value="' + esc(dm.width || '') + '">') + fld('Height', '<input type="text" name="height" value="' + esc(dm.height || '') + '">') + '</div></div>' +
        '<div class="ad-card"><h2>Documents <small>Shown under Additional information</small></h2><div data-docs>' + (v.documents || []).map(docRow).join('') + '</div>' +
          '<div class="ad-inline"><button type="button" class="ad-btn ad-btn--ghost" data-doc-add>+ Add by address</button><label class="ad-btn ad-btn--ghost">Upload a PDF…<input type="file" accept="application/pdf" data-doc-file hidden></label></div></div>') +

      '<div class="ad-savebar" data-savebar hidden><span class="ad-savebar-t"><b data-savebar-msg>Unsaved changes</b><small data-savebar-err></small></span><button type="button" class="ad-btn" data-discard>Discard</button><button type="submit" class="ad-btn ad-btn--primary">Save <kbd>Ctrl S</kbd></button></div>' +
      '</form>';
  }

  function readFile(file, cb) {
    if (file.size > 3 * 1024 * 1024) { toast(file.name + ' is over 3 MB. Use a smaller file, or put it on the site and add it by address.'); return; }
    var r = new FileReader(); r.onload = function () { cb(r.result); }; r.readAsDataURL(file);
  }
  function relabelPics(f) {
    $$('[data-imgs]', f).forEach(function (g) { $$('[data-pic]:not(.ad-pic--add)', g).forEach(function (t, i) { var m = $('.ad-pic-main', t); if (i === 0 && !m) t.insertAdjacentHTML('beforeend', '<em class="ad-pic-main">Main picture</em>'); if (i && m) m.remove(); }); });
  }
  // the picture list being edited: the shared one, or the language's own
  function activeGrid(f) { return $('[data-imgs="' + (f.samePics.checked ? 'en' : EL) + '"]', f); }
  function setLang(f, l) {
    EL = l; try { sessionStorage.setItem('signel.admin.lang', l); } catch (e) {}
    f.setAttribute('data-elang', l);
    $$('[data-elang]', f).forEach(function (b) { if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', b.getAttribute('data-elang') === l ? 'true' : 'false'); });
    paintLang(f); schedulePreview();
  }
  // what is still missing in each language, shown on the switch and on the tabs
  function missingIn(v, l) {
    var out = [], fr = l === 'fr';
    if (!(fr ? v.name_fr : v.name)) out.push(['basics', 'name']);
    var d = (fr ? v.description_fr : v.description) || '', other = (fr ? v.description : v.description_fr) || '';
    if (!d.replace(/<[^>]+>/g, '').trim() && other.replace(/<[^>]+>/g, '').trim()) out.push(['description', 'description']);
    var opts = (v.options || []).filter(function (o) { return fr ? !o.label_fr || (o.values_fr || []).length < o.values.length : !o.label; });
    if (opts.length) out.push(['price', plural(opts.length, 'option', 'options')]);
    var specs = (v.specs || []).filter(function (o) { return fr ? !o.label_fr : !o.label; });
    if (specs.length) out.push(['details', plural(specs.length, 'specification', 'specifications')]);
    return out;
  }
  function paintLang(f) {
    var v = collect(f), miss = { en: missingIn(v, 'en'), fr: missingIn(v, 'fr') };
    ['en', 'fr'].forEach(function (l) { var d = $('[data-lang-dot="' + l + '"]', f); if (d) d.hidden = !miss[l].length; });
    $$('[data-tab-tr]', f).forEach(function (i) { var tab = i.parentNode.getAttribute('data-tab'); i.hidden = !miss[EL].some(function (m) { return m[0] === tab; }); });
    var note = $('[data-lang-note]', f);
    note.hidden = !miss[EL].length;
    note.innerHTML = miss[EL].length ? '<b>' + (EL === 'fr' ? 'Still to translate into French: ' : 'Missing in English: ') + '</b>' + miss[EL].map(function (m) { return m[1]; }).join(', ') +
      (EL === 'fr' ? '. Until then the French page shows the English.' : '.') : '';
    var pl = $('[data-pics-lang]', f);
    if (pl) pl.textContent = f.samePics.checked ? 'These pictures show in both languages.' : 'Pictures for the ' + (EL === 'fr' ? 'French' : 'English') + ' page. Switch language above to edit the other list.';
    $('[data-pics-card]', f).classList.toggle('is-same-pics', f.samePics.checked);
  }
  function paintCats(f) {
    var picked = $$('[data-cats] input:checked', f).map(function (i) { return catById[Number(i.value)]; }).filter(Boolean);
    $('[data-catpicked]', f).innerHTML = picked.length ? picked.map(function (c) { return '<span class="ad-chip ad-chip--blue">' + esc(c.path) + '<button type="button" data-uncat="' + c.id + '" aria-label="Remove ' + esc(c.name) + '">' + ICON.x + '</button></span>'; }).join('')
      : '<span class="ad-muted">No category chosen yet. Pick at least one below.</span>';
  }
  function bindEditor(v) {
    var f = $('[data-admin-form]');
    bindGo(f);
    f.addEventListener('click', function (e) {
      var t = e.target, tab = t.closest('[data-tab]');
      if (tab) {
        $$('[data-tab]', f).forEach(function (b) { b.setAttribute('aria-selected', b === tab ? 'true' : 'false'); });
        $$('[data-panel]', f).forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== tab.getAttribute('data-tab'); });
        return;
      }
      if (t.closest('[data-del]')) { t.closest('.adm-rowedit').remove(); changed(); return; }
      var pic = t.closest('[data-pic]');
      if (pic && t.closest('[data-pic-del]')) { pic.remove(); relabelPics(f); changed(); return; }
      if (pic && t.closest('[data-pic-left]') && pic.previousElementSibling) { pic.parentNode.insertBefore(pic, pic.previousElementSibling); relabelPics(f); changed(); return; }
      if (pic && t.closest('[data-pic-right]') && pic.nextElementSibling && !pic.nextElementSibling.classList.contains('ad-pic--add')) { pic.parentNode.insertBefore(pic.nextElementSibling, pic); relabelPics(f); changed(); return; }
      if (t.closest('[data-img-add]')) { var u = $('[data-img-url]', f); if (u.value.trim()) { $('.ad-pic--add', activeGrid(f)).insertAdjacentHTML('beforebegin', imgTile(u.value.trim(), 1)); u.value = ''; relabelPics(f); changed(); } return; }
      var lb = t.closest('button[data-elang]'); if (lb) { setLang(f, lb.getAttribute('data-elang')); return; }
      var sbs = t.closest('[data-sbs]'); if (sbs) { var on = f.classList.toggle('is-sbs'); sbs.setAttribute('aria-pressed', on ? 'true' : 'false'); sbs.classList.toggle('on', on); return; }
      if (t.closest('[data-doc-add]')) { $('[data-docs]', f).insertAdjacentHTML('beforeend', docRow({ type: 'product-sheet', href: '', lang: 'en' })); return; }
      if (t.closest('[data-opt-add]')) { $('[data-opts]', f).insertAdjacentHTML('beforeend', pairRow('opt', { label: '', values: [] })); return; }
      if (t.closest('[data-spec-add]')) { $('[data-specs]', f).insertAdjacentHTML('beforeend', pairRow('spec', { label: '', values: [] })); return; }
      var un = t.closest('[data-uncat]'); if (un) { var box = $('[data-cats] input[value="' + un.getAttribute('data-uncat') + '"]', f); if (box) box.checked = false; paintCats(f); changed(); return; }
      var fm = t.closest('[data-fmt]'); if (fm) { format(EL === 'fr' ? f.description_fr : f.description, fm.getAttribute('data-fmt')); changed(); return; }
      var dm = t.closest('[data-desc-mode]');
      if (dm) {
        var see = dm.getAttribute('data-desc-mode') === 'see', out = $('[data-preview-out]', f);
        $$('[data-desc-mode]', f).forEach(function (b) { b.classList.toggle('on', b === dm); });
        out.innerHTML = (EL === 'fr' ? f.description_fr.value : f.description.value) || f.description.value; out.hidden = !see; $('.ad-desc-pair', f).hidden = see; return;
      }
      if (t.closest('[data-preview-toggle]')) { app.classList.contains('is-preview') ? closePreview() : openPreview(); return; }
      if (t.closest('[data-backup]')) { t.closest('details').open = false; backup(); return; }
      if (t.closest('[data-discard]')) { openProduct(current.id); toast('Your edits were discarded.'); return; }
      if (t.closest('[data-revert]')) {
        t.closest('details').open = false;
        if (current.isNew) { if (!confirm('Delete this new product? It has not been published.')) return; changes.new = changes.new.filter(function (n) { return n.id !== current.id; }); save(); dirty = false; go('products'); toast('New product deleted.'); return; }
        if (!confirm('Undo every change made to this product since it was published?')) return;
        delete changes.products[current.id]; save(); dirty = false; openProduct(current.id); toast('Back to the published version.');
      }
    });
    $$('[data-img-file]', f).forEach(function (inp) {
      inp.addEventListener('change', function (e) {
        var g = inp.closest('[data-imgs]');
        Array.prototype.forEach.call(e.target.files, function (file) { readFile(file, function (d) { $('.ad-pic--add', g).insertAdjacentHTML('beforebegin', imgTile(d, 1)); relabelPics(f); changed(); }); });
        e.target.value = '';
      });
    });
    f.samePics.addEventListener('change', function () {
      // turning "same pictures" off starts the French list from the English one
      if (!f.samePics.checked) { var fr = $('[data-imgs="fr"]', f), en = $('[data-imgs="en"]', f); $$('[data-pic]:not(.ad-pic--add)', fr).forEach(function (x) { x.remove(); }); $$('[data-pic]:not(.ad-pic--add)', en).forEach(function (x) { $('.ad-pic--add', fr).insertAdjacentHTML('beforebegin', x.outerHTML); }); }
      $('[data-imgs="en"]', f).setAttribute('data-l', f.samePics.checked ? '' : 'en'); if (f.samePics.checked) $('[data-imgs="en"]', f).removeAttribute('data-l');
      relabelPics(f); paintLang(f);
    });
    $('[data-doc-file]', f).addEventListener('change', function (e) { var file = e.target.files[0]; if (file) readFile(file, function (d) { $('[data-docs]', f).insertAdjacentHTML('beforeend', docRow({ type: 'product-sheet', label: file.name.replace(/\.pdf$/i, ''), href: d, lang: 'en' })); changed(); }); });
    $('[data-catfilter]', f).addEventListener('input', function (e) {
      var q = norm(e.target.value);
      $$('[data-catpath]', f).forEach(function (l) { l.hidden = q && l.getAttribute('data-catpath').indexOf(q) < 0; });
      $$('[data-cats] details', f).forEach(function (d) { var any = $$('[data-catpath]:not([hidden])', d).length; d.hidden = q && !any; if (q && any) d.open = true; });
    });
    $$('input[name=pmode]', f).forEach(function (r) { r.addEventListener('change', function () { $('[data-prices]', f).hidden = f.pmode.value !== 'priced'; }); });
    $$('input[name=priceStyle]', f).forEach(function (r) { r.addEventListener('change', function () { paintStyleArt(f); }); });
    paintStyleArt(f);
    f.addEventListener('change', function (e) { if (e.target.closest('[data-cats]')) paintCats(f); });
    f.addEventListener('submit', function (e) { e.preventDefault(); saveProduct(); });
    ['input', 'change'].forEach(function (ev) { f.addEventListener(ev, function (e) { if (e.target.matches('[data-catfilter], [data-img-url]')) return; changed(); }); });
    f.name.addEventListener('input', function () { $('[data-ed-name]', f).textContent = f.name.value || 'Untitled product'; });
    paintCats(f); paintLang(f);
    if (app.classList.contains('is-preview')) schedulePreview();
  }
  // simple formatting for the HTML description: wraps the selected text (or the line the cursor is on)
  function format(ta, kind) {
    var a = ta.selectionStart, b = ta.selectionEnd, v = ta.value;
    if (a === b) { a = v.lastIndexOf('\n', a - 1) + 1; b = v.indexOf('\n', b); if (b < 0) b = v.length; }
    var sel = v.slice(a, b), out;
    if (kind === 'ul') out = '<ul>\n' + sel.split('\n').filter(function (l) { return l.trim(); }).map(function (l) { return '<li>' + l.replace(/^\s*[-•*]\s*/, '').trim() + '</li>'; }).join('\n') + '\n</ul>';
    else if (kind === 'b') out = '<strong>' + sel + '</strong>';
    else out = '<' + kind + '>' + sel.trim() + '</' + kind + '>';
    ta.setRangeText(out, a, b, 'end'); ta.focus();
  }
  function changed() {
    var f = $('[data-admin-form]'); if (!f) return;
    dirty = JSON.stringify(collect(f)) !== saved;
    paintDirty(); paintLang(f); schedulePreview();
  }
  function paintDirty(err) {
    var bar = $('[data-savebar]'); if (!bar) return;
    bar.hidden = !dirty && !err;
    $('[data-savebar-err]').textContent = err || '';
    bar.classList.toggle('is-err', !!err);
  }

  function pairs(f, kind) {
    var split = function (v) { return v.trim() ? v.split('|').map(function (s) { return s.trim(); }) : []; };
    return $$('[data-' + kind + 's] .adm-rowedit', f).map(function (r) {
      return { label: $('[data-' + kind + '-label]', r).value.trim(), values: split($('[data-' + kind + '-values]', r).value).filter(Boolean),
               label_fr: $('[data-' + kind + '-label-fr]', r).value.trim(), values_fr: split($('[data-' + kind + '-values-fr]', r).value) };
    }).filter(function (o) { return o.label && o.values.length; });
  }
  function collect(f) {
    return {
      name: f.name.value.trim(), name_fr: f.name_fr.value.trim(), sku: f.sku.value.trim(), internalId: f.internalId.value.trim(), hidden: f.hidden.checked,
      categories: $$('[data-cats] input:checked', f).map(function (i) { return Number(i.value); }),
      description: f.description.value, description_fr: f.description_fr.value, priceStyle: (f.priceStyle && f.priceStyle.value) || 'auto',
      images: picsOf($('[data-imgs="en"]', f)),
      images_fr: f.samePics.checked ? null : picsOf($('[data-imgs="fr"]', f)),
      documents: $$('[data-docs] .adm-rowedit', f).map(function (r) {
        var h = $('[data-doc-href]', r);
        return { type: $('[data-doc-type]', r).value, label: $('[data-doc-label]', r).value.trim(), href: h.getAttribute('data-file') || h.value.trim(), lang: $('[data-doc-lang]', r).value };
      }).filter(function (d) { return d.href; }),
      options: pairs(f, 'opt'), specs: pairs(f, 'spec'),
      weight: f.weight.value.trim(), dimensions: { length: f.length.value.trim(), width: f.width.value.trim(), height: f.height.value.trim() },
      pricing: f.pmode.value === 'priced' ? { mode: 'priced', price: Number(f.price.value) || '', priceMax: Number(f.priceMax.value) || '' } : { mode: 'quote', price: '', priceMax: '' }
    };
  }
  var picsOf = function (g) { return $$('[data-pic] [data-img]', g).map(function (i) { return i.getAttribute('data-file') || i.value.trim(); }).filter(Boolean); };
  var same = function (a, b) { return JSON.stringify(a) === JSON.stringify(b); };
  // problems that stop a save, each with the tab it is on
  function problemsOf(f, v) {
    var out = [];
    if (!v.name) out.push(['basics', 'a name']);
    if (!v.categories.length) out.push(['categories', 'at least one category']);
    if (v.pricing.mode === 'priced' && !(v.pricing.price > 0)) out.push(['price', 'a price (or choose Price on request)']);
    var badOpt = $$('[data-opts] .adm-rowedit', f).filter(function (r) { var vals = $('[data-opt-values]', r).value.split('|').filter(function (s) { return s.trim(); }); return $('[data-opt-label]', r).value.trim() && vals.length < 2; });
    if (badOpt.length) out.push(['price', 'two values or more for option “' + $('[data-opt-label]', badOpt[0]).value.trim() + '”']);
    return out;
  }
  function saveProduct(quiet) {
    var f = $('[data-admin-form]'); if (!f || !current) return false;
    var v = collect(f), problems = problemsOf(f, v);
    $$('[data-tab-err]', f).forEach(function (i) { i.hidden = !problems.some(function (p) { return p[0] === i.parentNode.getAttribute('data-tab'); }); });
    if (problems.length) {
      var msg = 'Add ' + problems.map(function (p) { return p[1]; }).join(', ') + ' to save.';
      if (quiet) { toast('This product still needs ' + problems.map(function (p) { return p[1]; }).join(', ') + ': its edits are not in the backup.'); return false; }
      paintDirty(msg); var tab = $('[data-tab="' + problems[0][0] + '"]', f); if (tab) tab.click(); return false;
    }
    if (current.isNew) Object.assign(changes.new.filter(function (x) { return x.id === current.id; })[0], v);
    else {
      var orig = Object.assign({}, byId[current.id]), patch = {};
      if (same(orig.images_fr, orig.images)) orig.images_fr = null;
      var sorted = function (a) { return (a || []).slice().sort(function (x, y) { return x - y; }); };
      FIELDS.forEach(function (k) {
        var diff = k === 'hidden' ? v.hidden !== !!orig.hidden : k === 'categories' ? !same(sorted(v[k]), sorted(orig[k])) : !same(v[k], orig[k]);
        if (diff) patch[k] = v[k];
      });
      if (Object.keys(patch).length) changes.products[current.id] = patch; else delete changes.products[current.id];
    }
    if (!save()) { paintDirty('This browser is full (probably large files). Publish or back up your changes, then remove large files.'); return false; }
    saved = JSON.stringify(v); dirty = false; paintDirty();
    if (!quiet) toast('Saved. Publish when you are ready to put it on the website.');
    return true;
  }
  function save() {
    if (!SERVER) { var ok = store.set(CHANGES, changes); paintBadges(); return ok; }
    sync(); paintBadges(); return true;
  }
  /* ---------- the back end's draft: what changed since the last save is sent, part by part ---------- */
  function applyDraft(d) {
    changes = d.changes; ['products', 'jobs', 'text'].forEach(function (k) { changes[k] = changes[k] || {}; }); changes.new = changes.new || [];
    BASE = clone(changes); REV = d.rev; PRICES_PENDING = d.prices || null;
  }
  function diff() {
    var set = [], del = [];
    ['products', 'jobs', 'text'].forEach(function (k) {
      var a = changes[k] || {}, b = BASE[k] || {};
      Object.keys(a).forEach(function (id) { if (!same(a[id], b[id])) set.push([[k, id], clone(a[id])]); });
      Object.keys(b).forEach(function (id) { if (!(id in a)) del.push([k, id]); });
    });
    if (!same(changes.new, BASE.new)) set.push([['new'], clone(changes.new)]);
    return { set: set, del: del };
  }
  var syncing = null, again = false;
  function sync() {
    if (syncing) { again = true; return syncing; }
    var patch = diff();
    if (!patch.set.length && !patch.del.length) return Promise.resolve();
    syncing = api('PATCH', 'draft', patch).then(function (d) {
      patch.set.forEach(function (x) { if (x[0][0] === 'new') BASE.new = x[1]; else BASE[x[0][0]][x[0][1]] = x[1]; });
      patch.del.forEach(function (p) { delete BASE[p[0]][p[1]]; });
      REV = d.rev;
    }).catch(function (e) {
      if (e.status === 401) { toast('You were signed out. Sign in again: your last change was not saved.'); setTimeout(signOut, 2500); }
      else toast('Not saved on the server: ' + e.message);
    }).then(function () { syncing = null; if (again) { again = false; return sync(); } });
    return syncing;
  }
  // someone else's changes: picked up when this window comes back, if nothing here is waiting
  window.addEventListener('focus', function () {
    if (!SERVER || dirty || syncing || !BASE || !same(changes, BASE)) return;
    api('GET', 'draft').then(function (d) {
      if (d.rev === REV) return;
      applyDraft(d); paintBadges();
      if (/^#?publish/.test(location.hash)) route();
    }).catch(function () {});
  });
  function changePassword() {
    var current = prompt('Your current password'); if (current == null) return;
    var next = prompt('Your new password (10 characters or more)'); if (next == null) return;
    if (prompt('Your new password, once more') !== next) { toast('The two new passwords are not the same.'); return; }
    api('POST', 'me/password', { current: current, next: next }).then(function () { toast('Password changed.'); }).catch(function (e) { toast(e.message); });
  }
  function toast(msg) {
    var t = $('.adm-toast') || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'adm-toast', role: 'status' }));
    t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('on'); }, 3500);
  }
  function download(name, obj) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- Publish: what changed here, and how it reaches the website ---------- */
  function changedList() {
    var list = changes.new.map(function (n) { return { id: n.id, isNew: true, v: n, what: 'New product' }; });
    Object.keys(changes.products).forEach(function (id) {
      var p = byId[id]; if (!p) return;
      var keys = Object.keys(changes.products[id]).map(function (k) { return { internalId: 'internal ID', priceStyle: 'page display', sku: 'SKU', images: 'pictures' }[k] || k; });
      list.push({ id: Number(id), v: view(p), what: 'Changed: ' + keys.join(', ') });
    });
    return list;
  }
  function showPublish() {
    // products, then what the other sections changed (job postings, page text)
    var list = changedList().map(function (c) {
      return { thumb: thumb(c.v), title: c.v.name, what: c.what, chip: c.isNew ? 'New' : 'Edited', go: 'product/' + c.id, undo: 'p:' + c.id, undoTitle: c.isNew ? 'Delete' : 'Undo these changes' };
    });
    var undoers = {};
    Object.keys(MOD).forEach(function (k) {
      if (!MOD[k].changes) return;
      MOD[k].changes().forEach(function (c, i) { var key = k + ':' + i; undoers[key] = c.undo; list.push(Object.assign({ thumb: '<span class="ad-thumb ad-thumb--none">' + (c.icon || ICON.up) + '</span>', undo: key, undoTitle: 'Undo these changes' }, c)); });
    });
    if (PRICES_PENDING) list.unshift({ thumb: '<span class="ad-thumb ad-thumb--none">' + ICON.tag + '</span>', title: 'Price list: ' + PRICES_PENDING.file,
      what: plural(PRICES_PENDING.cells, 'price', 'prices') + ' changed on ' + plural(PRICES_PENDING.lines, 'line', 'lines') + ', imported ' + ago(PRICES_PENDING.at), chip: 'Imported', go: can('prices') ? 'prices' : '', undo: 'prices', undoTitle: 'Undo the import' });
    var chipTone = { New: 'green', Edited: 'amber', Closed: 'gray', Imported: 'green' };
    var publishCard = SERVER
      ? '<div class="ad-card ad-publish ad-publish--one"><div class="ad-step"><b>1</b><div><h2>Publish</h2><p class="ad-muted">Everything above, by everyone, goes on the website: the site is rebuilt (a minute or two) and a version is saved, so it can be undone.</p>' +
        (SERVER.online ? '<label class="ad-switch"><input type="checkbox" data-pub-online checked><span></span><b>Also put it online</b><small class="ad-muted">' + esc(SERVER.url.replace(/^https?:\/\//, '').replace(/\/$/, '')) + '</small></label>' : '<p class="ad-muted ad-small">Online publishing is not set up on this computer: the changes go on the website here (' + esc(location.host) + '). backend/README.md explains how to set it up.</p>') +
        '<button type="button" class="ad-btn ad-btn--primary" data-pub-go>Publish now</button></div></div></div>'
      : '<div class="ad-card ad-publish"><div class="ad-step"><b>1</b><div><h2>Download the changes</h2><p class="ad-muted">One file with every change above (catalog.json).</p><button type="button" class="ad-btn ad-btn--primary" data-export>Download the changes</button></div></div>' +
        '<div class="ad-step"><b>2</b><div><h2>Send it to put it online</h2><p class="ad-muted">This is the demo dashboard (no back end): the file is added to the website project (data/admin/catalog.json) and the site is rebuilt. Run the dashboard from the back end (backend/server.js) to publish with one button.</p></div></div></div>';
    viewEl.innerHTML = '<div class="ad-page"><div class="ad-head"><div><h1>Publish</h1><p class="ad-muted">' + (list.length ? plural(list.length, 'change', 'changes') + (SERVER ? ' not on the website yet.' : ' made in this browser, not on the website yet.') : 'Everything you changed is on the website.') + '</p></div></div>' +
      '<div data-pub-progress></div>' +
      (list.length ? '<div class="ad-card ad-card--flush"><ul class="ad-change-list">' + list.map(function (c) {
        return '<li>' + c.thumb + '<span class="ad-mini-t"><b>' + esc(c.title) + '</b><small>' + esc(c.what) + '</small></span><em class="ad-chip ad-chip--' + (chipTone[c.chip] || 'amber') + '">' + esc(c.chip) + '</em>' +
          (c.go ? '<button type="button" class="ad-btn" data-go="' + esc(c.go) + '">Open</button>' : '') + '<button type="button" class="ad-icon-btn" data-undo="' + esc(c.undo) + '" title="' + esc(c.undoTitle) + '" aria-label="Undo">' + ICON.x + '</button></li>';
      }).join('') + '</ul></div>' + publishCard : '<div class="ad-empty-state">' + ICON.up + '<h2>Nothing to publish</h2><p>Changes you save to products appear here until they are on the website.</p><button type="button" class="ad-btn ad-btn--primary" data-go="products">Go to products</button></div>') +
      '<div class="ad-card"><h2>Changes file from someone else?</h2><p class="ad-muted">Load a catalog.json or a backup to continue where they left off. It replaces the changes in this browser.</p><label class="ad-btn">Load a file…<input type="file" accept="application/json" data-import hidden></label></div></div>';
    bindGo(viewEl);
    var ex = $('[data-export]', viewEl);
    if (ex) ex.addEventListener('click', function () {
      download('catalog.json', { _about: 'Changes from the Signel admin dashboard. Put this file at data/admin/catalog.json; the next build applies it (products: src/model/catalog-edits.js, jobs: src/model/jobs.js, text: src/lib/i18n.js).', exported: new Date().toISOString(),
        products: changes.products, new: changes.new.map(function (n) { var c = Object.assign({}, n); delete c.isNew; return c; }), jobs: changes.jobs, text: changes.text });
      toast('catalog.json downloaded.');
    });
    var pubBtn = $('[data-pub-go]', viewEl);
    if (pubBtn) pubBtn.addEventListener('click', function () {
      var online = $('[data-pub-online]', viewEl);
      pubBtn.disabled = true;
      // what is still being sent goes first, so it is published too
      Promise.resolve(syncing).then(function () { return sync(); })
        .then(function () { return api('POST', 'publish', { online: !!(online && online.checked) }); })
        .then(function () { watchPublish(); })
        .catch(function (e) { pubBtn.disabled = false; toast(e.message); });
    });
    if (SERVER) api('GET', 'publish').then(function (d) { if (d.job && d.job.state === 'running') watchPublish(); }).catch(function () {});
    viewEl.addEventListener('click', function (e) {
      var u = e.target.closest('[data-undo]'); if (!u) return;
      var key = u.getAttribute('data-undo');
      if (key === 'prices') {
        if (!confirm('Undo the price list import? The prices go back to what is on the website.')) return;
        api('DELETE', 'prices').then(function () { PRICES_PENDING = null; paintBadges(); showPublish(); toast('Import undone.'); }).catch(function (x) { toast(x.message); });
        return;
      }
      if (key.indexOf('p:') !== 0) { if (!confirm('Undo these changes?')) return; undoers[key](); save(); showPublish(); return; }
      var id = Number(key.slice(2));
      if (!confirm(byId[id] ? 'Undo the changes to this product?' : 'Delete this new product?')) return;
      if (byId[id]) delete changes.products[id]; else changes.new = changes.new.filter(function (n) { return n.id !== id; });
      save(); showPublish();
    });
    $('[data-import]', viewEl).addEventListener('change', function (e) {
      var file = e.target.files[0]; if (!file) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var d = JSON.parse(r.result), c = d.kind === 'signel-admin-backup' ? d.changes : d;
          if (!c || (!c.products && !c.new && !c.jobs && !c.text)) throw new Error('no changes');
          if (!confirm('Replace the changes in this browser with the ones in ' + file.name + '?')) return;
          changes = { products: c.products || {}, new: c.new || [], jobs: c.jobs || {}, text: c.text || {} }; save(); showPublish(); toast('Loaded ' + file.name);
        } catch (err) { toast('That file is not a Signel changes file or backup.'); }
      };
      r.readAsText(file);
    });
  }

  // a publish on the back end, step by step; once done, the dashboard reloads the new site's data
  function watchPublish() {
    var box = $('[data-pub-progress]', viewEl); if (!box) return;
    $$('[data-pub-go]', viewEl).forEach(function (b) { b.disabled = true; });
    var mark = { done: '✓', running: '…', failed: '✕', skipped: '–' };
    var tick = function () {
      api('GET', 'publish').then(function (d) {
        var j = d.job; if (!j || !document.body.contains(box)) return;
        var res = j.result || {};
        box.innerHTML = '<div class="ad-card ad-pubrun is-' + j.state + '"><h2>' + (j.state === 'running' ? 'Publishing…' : j.state === 'done' ? 'Published' : 'Not published') + ' <small class="ad-muted">by ' + esc(j.by.name) + ', ' + ago(j.startedAt) + '</small></h2>' +
          '<ol class="ad-pubsteps">' + j.steps.map(function (st) { return '<li class="is-' + st.state + '"><b>' + mark[st.state] + '</b> ' + esc(st.name) + (st.ms && st.state !== 'running' ? ' <small>' + Math.round(st.ms / 1000) + ' s</small>' : '') + (st.error ? '<small class="ad-bad"> ' + esc(st.error) + '</small>' : '') + '</li>'; }).join('') + '</ol>' +
          (j.state === 'failed' ? '<p class="ad-bad">' + esc(j.error || '') + '</p><p class="ad-muted">The website is as it was, and every change is still here: fix what the message says, then publish again.</p>' : '') +
          (j.state === 'done' ? '<p class="ad-muted">' + [res.git ? 'Version: ' + res.git : '', res.online ? 'Online: ' + res.online : ''].filter(Boolean).map(esc).join('<br>') + '</p><button type="button" class="ad-btn ad-btn--primary" data-pub-reload>Continue</button>' : '') +
          (j.state === 'running' ? '<pre class="ad-publog">' + esc(j.log.slice(-6).join('\n')) + '</pre>' : '') + '</div>';
        var r = $('[data-pub-reload]', box); if (r) r.addEventListener('click', function () { location.reload(); });
        if (j.state === 'running') setTimeout(tick, 1500);
        else {
          $$('[data-pub-go]', viewEl).forEach(function (b) { b.disabled = false; });
          // what is left in the draft (changes made during the publish stay)
          if (j.state === 'done') { toast('Published.'); api('GET', 'draft').then(function (d) { applyDraft(d); paintBadges(); }).catch(function () {}); }
        }
      }).catch(function (e) { box.innerHTML = '<div class="ad-card"><p class="ad-bad">' + esc(e.message) + '</p></div>'; });
    };
    tick();
  }

  /* ---------- Prices: the Excel price list (in French), out and back in ----------
     Export downloads the list the build wrote (src/model/price-sheet.js). Import reads a
     returned sheet here, with the same code as tools/price-sheet.mjs (/admin/xlsx.js and
     /admin/price-import.js), and shows what changes before anything is kept. */
  var PRICES = null, CLASSES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'];
  function priceList() { return PRICES || (PRICES = fetch(ROOT + '/admin/price-list.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })); }
  var cad = function (n) { return n == null ? 'On request' : n.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' }); };
  function inflateRaw(bytes) {
    return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function showPrices() {
    var day = new Date().toISOString().slice(0, 10);
    viewEl.innerHTML = '<div class="ad-page"><div class="ad-head"><div><h1>Prices</h1><p class="ad-muted">One Excel price list, in French: every item the website sells, with its codes (parent, child, Code SIGNEL), its price for each class P1 to P7, its quantity breaks (QTY2, QTY3) and how its price shows on the site (Price Category). Road signs and reflective sheeting have their prices in their own tabs. Export it, change it, import it back.</p></div></div>' +
      '<div class="ad-tiles" data-price-tiles></div>' +
      '<div class="ad-card ad-publish"><div class="ad-step"><b>1</b><div><h2>Export the price list</h2><p class="ad-muted">Always the latest prices. Codes that belong together (a parent and its versions, AB1022 and AB1022P) sit together; versions fold under their parent.</p>' +
      '<a class="ad-btn ad-btn--primary" href="' + ROOT + '/admin/liste-de-prix.xlsx" download="liste-de-prix-' + day + '.xlsx">' + ICON.up.replace('M12 16V4M7 9l5-5 5 5', 'M12 4v12M7 11l5 5 5-5') + 'Export to Excel</a></div></div>' +
      '<div class="ad-step"><b>2</b><div><h2>Import the changed list</h2><p class="ad-muted">Change the yellow P1 to P7 columns, the green QTY2 and QTY3, the purple Price Category (show price, login to see price, ask for quote, remove from website) and the comments. You will see every change before anything is kept.</p>' +
      '<label class="ad-drop" data-price-drop><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-price-file hidden><b>Choose the Excel file</b><span>or drop it here (.xlsx)</span></label></div></div></div>' +
      '<div data-price-result></div></div>';
    priceList().then(function (d) {
      var sold = d.rows.filter(function (r) { return r.kind !== 'parent'; }), priced = sold.filter(function (r) { return r.prices[0]; }).length;
      var products = {}; d.rows.forEach(function (r) { products[r.pid] = r.display || 'login'; });
      var shows = { show: 0, login: 0, quote: 0, remove: 0 }; Object.keys(products).forEach(function (k) { shows[products[k]]++; });
      $('[data-price-tiles]', viewEl).innerHTML =
        '<div class="ad-tile"><small>Items sold</small><b>' + sold.length.toLocaleString('en-CA') + '</b><span>' + priced.toLocaleString('en-CA') + ' with a P1 price</span></div>' +
        '<div class="ad-tile"><small>Price shown to everyone</small><b>' + shows.show.toLocaleString('en-CA') + '</b><span>products (show price)</span></div>' +
        '<div class="ad-tile"><small>Price after login</small><b>' + shows.login.toLocaleString('en-CA') + '</b><span>products; ' + shows.quote + ' on quote only</span></div>' +
        '<div class="ad-tile"><small>Off the site for now</small><b>' + shows.remove.toLocaleString('en-CA') + '</b><span>products (remove from website)</span></div>';
    }).catch(function () { $('[data-price-tiles]', viewEl).innerHTML = '<p class="ad-muted">The price list could not be loaded (admin/price-list.json).</p>'; });
    var drop = $('[data-price-drop]', viewEl), input = $('[data-price-file]', viewEl);
    input.addEventListener('change', function () { if (input.files[0]) readSheet(input.files[0]); });
    ['dragover', 'dragenter'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function () { drop.classList.remove('is-over'); }); });
    drop.addEventListener('drop', function (e) { e.preventDefault(); if (e.dataTransfer.files[0]) readSheet(e.dataTransfer.files[0]); });
  }
  function readSheet(file) {
    var out = $('[data-price-result]', viewEl);
    out.innerHTML = '<div class="ad-card"><p class="ad-muted">Reading ' + esc(file.name) + '…</p></div>';
    Promise.all([file.arrayBuffer(), import(ROOT + '/admin/xlsx.js'), import(ROOT + '/admin/price-import.js'), priceList()]).then(function (a) {
      return a[1].readXlsx(new Uint8Array(a[0]), inflateRaw).then(function (sheets) { return a[2].checkPriceSheet(sheets, a[3]); });
    }).then(function (res) {
      var list = function (items, cls) { return items.length ? '<ul class="ad-notes ' + cls + '">' + items.slice(0, 50).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + (items.length > 50 ? '<li>… and ' + (items.length - 50) + ' more</li>' : '') + '</ul>' : ''; };
      if (!res.next) { out.innerHTML = '<div class="ad-card"><h2>This file cannot be imported</h2>' + list(res.errors, 'is-bad') + '</div>'; return; }
      var ch = res.changes, MAX = 300;
      var head = res.cells === 1 ? '1 price changes' : res.cells ? res.cells.toLocaleString('en-CA') + ' prices change' : ch.length ? 'Breaks or price categories change' : 'No changes';
      out.innerHTML = '<div class="ad-card"><div class="ad-card-head"><h2>' + head + (ch.length ? ' <small class="ad-muted">on ' + plural(ch.length, 'line', 'lines') + '</small>' : '') + '</h2><span class="ad-muted">' + esc(file.name) + ' · ' + res.read.toLocaleString('en-CA') + ' lines read</span></div>' +
        list(res.errors, 'is-bad') + list(res.warnings, 'is-warn') +
        (ch.length ? '<div class="ad-table-wrap"><table class="ad-table ad-price-diff"><thead><tr><th>Code</th><th>Product</th><th>Changes</th></tr></thead><tbody>' + ch.slice(0, MAX).map(function (c) {
          var bits = c.cells.map(function (x) {
            var how = x.from != null && x.to != null ? (x.to > x.from ? 'up' : 'down') : x.to == null ? 'off' : 'new';
            return '<span class="ad-pchg is-' + how + '"><b>' + x.cls + '</b> ' + (x.from == null ? '—' : cad(x.from)) + ' → ' + (x.to == null ? 'empty' : cad(x.to)) + '</span>';
          });
          if (c.qty) bits.push('<span class="ad-pchg"><b>Quantité</b> ' + esc(c.qty.from || '—') + ' → ' + esc(c.qty.to || '—') + '</span>');
          var brk = function (b) { return b ? b[0] + ' / ' + (b[1] || '—') : '—'; };
          if (c.breaks) bits.push('<span class="ad-pchg"><b>QTY2 / QTY3</b> ' + esc(brk(c.breaks.from)) + ' → ' + esc(brk(c.breaks.to)) + '</span>');
          var SHOW = { show: 'show price', login: 'login to see price', quote: 'ask for quote', remove: 'remove from website' };
          if (c.display) bits.push('<span class="ad-pchg is-' + (c.display.to === 'remove' ? 'off' : 'new') + '"><b>Price Category</b> ' + esc(SHOW[c.display.from || 'login']) + ' → ' + esc(SHOW[c.display.to]) + '</span>');
          return '<tr><td><b>' + esc(c.code || '—') + '</b></td><td>' + esc(c.name) + (c.options ? '<small>' + esc(c.options) + '</small>' : '') + '</td><td><div class="ad-pchgs">' + bits.join('') + '</div></td></tr>';
        }).join('') + '</tbody></table></div>' + (ch.length > MAX ? '<p class="ad-muted">… and ' + (ch.length - MAX) + ' more lines, all in the file below.</p>' : '') +
        (SERVER
          ? '<div class="ad-publish ad-publish--one"><div class="ad-step"><b>3</b><div><h2>Apply the new prices</h2><p class="ad-muted">They join the changes waiting on the Publish page, and go on the website at the next publish.</p><button type="button" class="ad-btn ad-btn--primary" data-price-apply>Apply these prices</button></div></div></div>'
          : '<div class="ad-publish ad-publish--one"><div class="ad-step"><b>3</b><div><h2>Put the new prices online</h2><p class="ad-muted">This is the demo dashboard (no back end): the file below goes into the website project (data/prices/prix.json) and the site is rebuilt. From the back end (backend/server.js), this step is one button.</p><button type="button" class="ad-btn ad-btn--primary" data-price-save>Download prix.json</button></div></div></div>') : '') + '</div>';
      var ap = $('[data-price-apply]', out);
      if (ap) ap.addEventListener('click', function () {
        ap.disabled = true;
        api('POST', 'prices', { file: file.name, next: res.next, cells: res.cells, lines: ch.length }).then(function (d) {
          PRICES_PENDING = d.prices; PRICES = null; paintBadges();
          toast('Prices applied. Publish to put them on the website.');
          go(can('publish') ? 'publish' : 'prices');
        }).catch(function (e) { ap.disabled = false; toast(e.message); });
      });
      var b = $('[data-price-save]', out);
      if (b) b.addEventListener('click', function () {
        var n = res.next;
        download('prix.json', { _about: 'Prices in CAD before taxes, by customer class P1..P7 (index 0..6): products sold as is and versions (codes), by id. breaks: QTY2 and QTY3 of a code; quantities: older ranges for codes without breaks. display: show | login | quote | remove, login when absent; a product with no P1 price is quoted. sources: signs | sheeting (else Dynacom). codes: Code SIGNEL; notes: comments. See src/model/prices.js.',
          updated: new Date().toISOString().slice(0, 10), source: file.name, classes: CLASSES, products: n.products, versions: n.versions, breaks: n.breaks, quantities: n.quantities,
          display: n.display, sources: n.sources, codes: n.codes, notes: n.notes });
        toast('prix.json downloaded.');
      });
    }).catch(function (err) {
      out.innerHTML = '<div class="ad-card"><h2>This file cannot be read</h2><p class="ad-muted">' + esc(String(err && err.message || err)) + '. Save it as an Excel workbook (.xlsx) and try again.</p></div>';
    });
  }

  /* ---------- a small visual text editor (bold, italic, lists, links): staff never see HTML.
     rte(html, onChange) -> { el, get() }; what it returns keeps only the tags a page's text may
     hold (the build cleans it again before it reaches a page). ---------- */
  var RTE_TAGS = { P: 1, BR: 1, STRONG: 1, B: 1, EM: 1, I: 1, UL: 1, OL: 1, LI: 1, A: 1, H3: 1, H4: 1 };
  function cleanHtml(html) {
    var box = document.createElement('div'); box.innerHTML = html;
    (function walk(n) {
      Array.prototype.slice.call(n.childNodes).forEach(function (c) {
        if (c.nodeType === 8) { c.remove(); return; }
        if (c.nodeType !== 1) return;
        walk(c);
        if (!RTE_TAGS[c.tagName]) { while (c.firstChild) c.parentNode.insertBefore(c.firstChild, c); c.remove(); return; }
        Array.prototype.slice.call(c.attributes).forEach(function (a) { if (!(c.tagName === 'A' && a.name === 'href')) c.removeAttribute(a.name); });
      });
    })(box);
    return box.innerHTML.replace(/<b>/g, '<strong>').replace(/<\/b>/g, '</strong>').replace(/<i>/g, '<em>').replace(/<\/i>/g, '</em>').replace(/(<br>\s*)+$/, '').trim();
  }
  function rte(html, onChange) {
    var wrap = document.createElement('div'); wrap.className = 'ad-rte';
    wrap.innerHTML = '<div class="ad-rte-tools" role="toolbar" aria-label="Formatting">' +
      [['bold', '<b>B</b>', 'Bold'], ['italic', '<i>I</i>', 'Italic'], ['insertUnorderedList', '• List', 'Bullet list'], ['insertOrderedList', '1. List', 'Numbered list'], ['link', 'Link', 'Link'], ['removeFormat', 'Clear', 'Clear formatting']]
        .map(function (b) { return '<button type="button" data-cmd="' + b[0] + '" title="' + b[2] + '">' + b[1] + '</button>'; }).join('') +
      '</div><div class="ad-rte-area" contenteditable="true"></div>';
    var area = wrap.querySelector('.ad-rte-area'); area.innerHTML = cleanHtml(html || '');
    wrap.querySelector('.ad-rte-tools').addEventListener('mousedown', function (e) {
      var b = e.target.closest('[data-cmd]'); if (!b) return; e.preventDefault(); area.focus();
      var cmd = b.getAttribute('data-cmd');
      if (cmd === 'link') { var u = prompt('Link address (https://… or /page/)', 'https://'); if (u) document.execCommand('createLink', false, u); }
      else document.execCommand(cmd, false, null);
      if (onChange) onChange();
    });
    area.addEventListener('input', function () { if (onChange) onChange(); });
    return { el: wrap, get: function () { return cleanHtml(area.innerHTML); } };
  }
  var slugify = function (t) { return norm(t).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70); };

  /* ---------- what the sections in their own files use (src/js/admin-*.js) ---------- */
  window.SignelAdmin = {
    ROOT: ROOT, ICON: ICON, me: ME, roles: ACCESS.roles, view: viewEl,
    $: $, $$: $$, esc: esc, norm: norm, store: store, plural: plural, ago: ago, money: function (n) { return money(n); },
    go: go, bindGo: bindGo, toast: toast, download: download, can: can, tile: tile, staff: staff, USERS: USERS, rte: rte, cleanHtml: cleanHtml, slugify: slugify,
    changes: function () { return changes; }, save: function () { var ok = save(); return ok; }, badges: function () { paintBadges(); },
    backend: function () { return SERVER; }, api: api,
    requests: function () { return requests(); }, saveRequests: function (l) { saveRequests(l); }, products: function () { return DATA ? DATA.products : []; },
    // a section: { show(args), badge() -> number, tiles() -> [html], cards() -> [html], changes() -> [{ title, what, chip, go, undo }] }
    section: function (id, def) { MOD[id] = def; if (DATA) { paintBadges(); if ((location.hash.replace(/^#/, '').split('/')[0] || 'overview') === id) route(); } }
  };

  /* ---------- Requests: a board of what visitors sent ---------- */
  var COLS = [['new', 'New'], ['progress', 'In progress'], ['quoted', 'Quoted'], ['done', 'Done']];
  var TYPES = { quote: ['Quote', 'blue'], rental: ['Rental', 'amber'], account: ['New account', 'green'], message: ['Message', 'violet'] };
  var RF = { type: '', q: '' };
  function requests() { return store.get(REQUESTS, []); }
  function saveRequests(list) { store.set(REQUESTS, list); paintBadges(); }
  function typeChip(t) { var x = TYPES[t] || [t, '']; return '<em class="ad-chip ad-chip--' + x[1] + '">' + x[0] + '</em>'; }
  function statusChip(s) { var c = COLS.filter(function (x) { return x[0] === s; })[0]; return '<em class="ad-status ad-status--' + s + '">' + (c ? c[1] : s) + '</em>'; }
  function who(r) { var c = (r.data || {}).customer || {}; return c.company || c.name || c.email || 'Visitor without an account'; }
  function summary(r) {
    var d = r.data || {}, lines = d.lines || [];
    if (lines.length) { var n = lines.reduce(function (t, l) { return t + l.qty; }, 0); return plural(lines.length, 'line', 'lines') + ' · ' + plural(n, 'item', 'items') + (d.total ? ' · ' + money(d.total) : ''); }
    if (r.type === 'account') return ((window.SignelMembers && window.SignelMembers.statusOf((d.customer || {}).email)) || 'To review') + ' · ' + ((d.customer || {}).type || 'Account') + ((d.customer || {}).customer === 'yes' ? ' · existing customer' : '');
    return String(d.message || '').slice(0, 70) || '—';
  }
  function ago(iso) {
    var m = Math.round((Date.now() - new Date(iso)) / 60000);
    return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  }
  function showRequests() {
    viewEl.innerHTML = '<div class="ad-page ad-page--wide"><div class="ad-head"><div><h1>Requests</h1><p class="ad-muted">Drag a card to move it along, or open it to answer.</p></div>' +
      '<div class="ad-head-tools"><div class="ad-chips" role="group" aria-label="Type"><button type="button" class="ad-chip-btn on" data-rt="">All</button>' + Object.keys(TYPES).map(function (k) { return '<button type="button" class="ad-chip-btn" data-rt="' + k + '">' + TYPES[k][0] + 's</button>'; }).join('') + '</div>' +
      '<label class="ad-search ad-search--in"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input type="search" placeholder="Find a customer" data-rq></label></div></div>' +
      '<div class="ad-board" data-board></div></div>' +
      '<div class="ad-drawer-scrim" data-drawer-scrim hidden></div><aside class="ad-drawer" data-drawer aria-hidden="true" tabindex="-1"></aside>';
    $$('[data-rt]', viewEl).forEach(function (b) { b.addEventListener('click', function () { RF.type = b.getAttribute('data-rt'); $$('[data-rt]', viewEl).forEach(function (x) { x.classList.toggle('on', x === b); }); paintBoard(); }); });
    $('[data-rq]', viewEl).addEventListener('input', function (e) { RF.q = e.target.value; paintBoard(); });
    $('[data-drawer-scrim]').addEventListener('click', closeDrawer);
    paintBoard();
  }
  function paintBoard() {
    var board = $('[data-board]'); if (!board) return;
    var all = requests(), q = norm(RF.q);
    var list = all.filter(function (r) { return (!RF.type || r.type === RF.type) && (!q || norm(who(r) + ' ' + JSON.stringify((r.data || {}).customer || {})).indexOf(q) >= 0); });
    if (!all.length) {
      board.outerHTML = '<div class="ad-empty-state" data-board>' + ICON.inbox + '<h2>No requests yet</h2><p>Requests appear here when a visitor creates an account or writes to you (carts sent from the site are in Orders). Until the back end is connected, only those sent from this browser show.</p>' +
        '<button type="button" class="ad-btn" data-examples>Add example requests to try the board</button></div>';
      $('[data-examples]').addEventListener('click', function () { saveRequests(examples()); showRequests(); });
      return;
    }
    board.innerHTML = COLS.map(function (c) {
      var cards = list.filter(function (r) { return (r.status || 'new') === c[0]; });
      return '<section class="ad-col" data-col="' + c[0] + '"><header><h2>' + c[1] + '</h2><em>' + cards.length + '</em></header><div class="ad-col-body" data-drop="' + c[0] + '">' +
        (cards.map(function (r) {
          return '<article class="ad-rcard" draggable="true" data-rid="' + r.id + '" tabindex="0">' + '<div class="ad-rcard-top">' + typeChip(r.type) + (r.example ? '<em class="ad-chip">Example</em>' : '') + '<small>' + ago(r.at) + '</small></div>' +
            '<b>' + esc(who(r)) + '</b><p>' + esc(summary(r)) + '</p>' + (r.assignee || (r.notes || []).length ? '<div class="ad-rcard-foot">' + (r.assignee ? '<span class="ad-avatar ad-avatar--sm" title="' + esc(r.assignee) + '">' + esc(r.assignee.charAt(0).toUpperCase()) + '</span>' : '') + ((r.notes || []).length ? '<small>' + plural(r.notes.length, 'note', 'notes') + '</small>' : '') + '</div>' : '') + '</article>';
        }).join('') || '<p class="ad-col-empty">Nothing here</p>') + '</div></section>';
    }).join('');
    board.onclick = function (e) { var c = e.target.closest('[data-rid]'); if (c) openRequest(c.getAttribute('data-rid')); };
    board.onkeydown = function (e) { var c = e.target.closest('[data-rid]'); if (c && e.key === 'Enter') openRequest(c.getAttribute('data-rid')); };
    // drag and drop between columns
    $$('[data-rid]', board).forEach(function (c) {
      c.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', c.getAttribute('data-rid')); c.classList.add('is-drag'); });
      c.addEventListener('dragend', function () { c.classList.remove('is-drag'); });
    });
    $$('[data-drop]', board).forEach(function (z) {
      z.addEventListener('dragover', function (e) { e.preventDefault(); z.classList.add('is-over'); });
      z.addEventListener('dragleave', function () { z.classList.remove('is-over'); });
      z.addEventListener('drop', function (e) { e.preventDefault(); z.classList.remove('is-over'); setStatus(e.dataTransfer.getData('text/plain'), z.getAttribute('data-drop')); });
    });
  }
  function updateRequest(id, fn) { var all = requests(); all.forEach(function (r) { if (r.id === id) fn(r); }); saveRequests(all); }
  function setStatus(id, status) {
    updateRequest(id, function (r) { if (r.status !== status) { (r.history = r.history || []).push({ at: new Date().toISOString(), to: status }); r.status = status; } });
    paintBoard(); if ($('[data-drawer]') && $('[data-drawer]').getAttribute('data-open') === id) openRequest(id);
  }
  function openRequest(id) {
    var r = requests().filter(function (x) { return x.id === id; })[0], dr = $('[data-drawer]'); if (!r || !dr) return;
    var d = r.data || {}, c = d.customer || {}, lines = d.lines || [];
    var contact = [['Email', c.email, c.email ? 'mailto:' + c.email : ''], ['Phone', c.phone, c.phone ? 'tel:' + c.phone.replace(/[^\d+]/g, '') : ''], ['Company', c.company], ['Type', c.type], ['Role', c.position], ['Address', c.address], ['Customer no.', c.customer_no]]
      .filter(function (x) { return x[1]; });
    dr.setAttribute('data-open', id);
    dr.innerHTML = '<header class="ad-drawer-head"><div>' + typeChip(r.type) + (r.example ? ' <em class="ad-chip">Example</em>' : '') + '<h2>' + esc(who(r)) + '</h2><small class="ad-muted">' + new Date(r.at).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }) + (c.name && c.name !== who(r) ? ' · ' + esc(c.name) : '') + '</small></div>' +
      '<button type="button" class="ad-icon-btn" data-drawer-close aria-label="Close">' + ICON.x + '</button></header>' +
      '<div class="ad-drawer-body">' +
      '<div class="ad-seg" role="group" aria-label="Status">' + COLS.map(function (col) { return '<button type="button" class="' + ((r.status || 'new') === col[0] ? 'on' : '') + '" data-set-status="' + col[0] + '">' + col[1] + '</button>'; }).join('') + '</div>' +
      (contact.length ? '<dl class="ad-dl">' + contact.map(function (x) { return '<div><dt>' + x[0] + '</dt><dd>' + (x[2] ? '<a href="' + esc(x[2]) + '">' + esc(x[1]) + '</a>' : esc(x[1])) + '</dd></div>'; }).join('') + '</dl>' : '<p class="ad-muted">Sent without an account, so there are no contact details here: they are in the email the visitor sent.</p>') +
      (lines.length ? '<h3>Items</h3><ul class="ad-lines">' + lines.map(function (l) {
        return '<li>' + (l.img ? '<img src="' + esc(src(l.img)) + '" alt="">' : '<span class="ad-thumb ad-thumb--none">' + ICON.pic + '</span>') + '<span><b>' + l.qty + ' × ' + esc(l.name) + '</b><small>' + esc([l.sku].concat((l.opts || []).map(function (o) { return o[0] + ': ' + o[1]; })).filter(Boolean).join(' · ')) + '</small></span>' + (l.price ? '<em>' + money(l.price * l.qty) + '</em>' : '<em class="ad-muted">To quote</em>') + '</li>';
      }).join('') + '</ul>' + (d.total ? '<p class="ad-total">Listed prices: <b>' + money(d.total) + '</b></p>' : '') : '') +
      (r.type === 'account' ? reviewHtml(r) : '') +
      (d.message || c.message ? '<h3>Message</h3><blockquote>' + esc(d.message || c.message) + '</blockquote>' : '') +
      '<h3>Handled by</h3><input class="ad-input" type="text" placeholder="Name of the person in charge" value="' + esc(r.assignee || '') + '" data-assignee>' +
      '<h3>Notes</h3><ul class="ad-notes">' + (r.notes || []).map(function (n) { return '<li><p>' + esc(n.text) + '</p><small>' + new Date(n.at).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }) + '</small></li>'; }).join('') + '</ul>' +
      '<div class="ad-note-add"><textarea class="ad-input" rows="2" placeholder="Add a note: called back, quote sent, waiting for PO…" data-note></textarea><button type="button" class="ad-btn" data-note-add>Add note</button></div>' +
      '</div><footer class="ad-drawer-foot">' + (c.email ? '<a class="ad-btn ad-btn--primary" href="mailto:' + esc(c.email) + '?subject=' + encodeURIComponent('Your Signel request') + '">Email ' + esc((c.name || c.email).split(' ')[0]) + '</a>' : '') +
      '<button type="button" class="ad-btn ad-btn--danger-ghost" data-req-del>Delete</button></footer>';
    dr.setAttribute('aria-hidden', 'false'); dr.classList.add('on'); $('[data-drawer-scrim]').hidden = false; dr.focus();
    dr.onclick = function (e) {
      var t = e.target;
      if (t.closest('[data-drawer-close]')) return closeDrawer();
      var s = t.closest('[data-set-status]'); if (s) return setStatus(id, s.getAttribute('data-set-status'));
      var gm = t.closest('[data-go-member]'); if (gm) { closeDrawer(); go('members/' + encodeURIComponent(gm.getAttribute('data-go-member'))); return; }
      if (t.closest('[data-note-add]')) { var ta = $('[data-note]', dr); if (!ta.value.trim()) return; updateRequest(id, function (x) { (x.notes = x.notes || []).push({ at: new Date().toISOString(), text: ta.value.trim() }); }); openRequest(id); paintBoard(); return; }
      if (t.closest('[data-req-del]')) { if (!confirm('Delete this request?')) return; saveRequests(requests().filter(function (x) { return x.id !== id; })); closeDrawer(); paintBoard(); }
    };
    $('[data-assignee]', dr).addEventListener('change', function (e) { updateRequest(id, function (x) { x.assignee = e.target.value.trim(); }); paintBoard(); });
  }
  // new accounts are reviewed in Members (src/js/admin-team.js): the request points there
  function reviewHtml(r) {
    var c = (r.data || {}).customer || {};
    return '<h3>Account review</h3><div class="ad-review"><p class="ad-muted">The customer sees no prices until the account is approved and given its price class.</p>' +
      (can('members') ? '<div class="ad-review-row"><button type="button" class="ad-btn ad-btn--primary" data-go-member="' + esc(c.email || '') + '">Review in Members</button></div>' : '') + '</div>';
  }
  function closeDrawer() {
    var dr = $('[data-drawer]'); if (!dr || !dr.classList.contains('on')) return;
    dr.classList.remove('on'); dr.setAttribute('aria-hidden', 'true'); dr.removeAttribute('data-open'); $('[data-drawer-scrim]').hidden = true;
  }
  // a few requests marked "Example", to try the board before real ones arrive
  function examples() {
    var pick = function (q) { return DATA.products.filter(function (p) { return norm(p.name).indexOf(q) >= 0; })[0] || DATA.products[0]; };
    var line = function (p, qty, opts) { return { id: p.id, sku: p.sku, name: p.name, url: p.url, img: (p.images || [])[0] || '', qty: qty, opts: opts || [], price: null }; };
    var t = function (h) { return new Date(Date.now() - h * 3600000).toISOString(); };
    return [
      { id: 'ex1', example: true, type: 'message', status: 'new', at: t(1), data: { customer: { name: 'Example contact', company: 'Example municipality', email: 'example@example.com', phone: '(450) 555-0100' }, message: 'Can you install the 911 address plates for 40 rural addresses this fall?' } },
      { id: 'ex3', example: true, type: 'account', status: 'new', at: t(48), data: { customer: { name: 'Example person', company: 'Example signage company', email: 'example@example.com', type: 'Signage', customer: 'no' } } },
      { id: 'ex4', example: true, type: 'message', status: 'progress', at: t(96), data: { customer: { name: 'Example contact', company: 'Example engineering firm', email: 'example@example.com' }, message: 'Do you have a data sheet for the BOSS signals in English?' } }
    ];
  }

  /* ---------- live preview: the product's real page (header, styles, scripts) with its
     product area drawn from the form, in a frame at a laptop's size (1366x768, scaled to
     the panel) or a phone's (390x844). Opening it hides the product list for room. ---------- */
  var PV = { device: 'laptop', timer: null, tpl: {} };
  var DEVICES = { laptop: [1366, 768], phone: [390, 844] };
  var DOC_LABEL = { 'product-sheet': 'Product sheet', 'technical-sheet': 'Technical sheet', manual: 'User manual', guide: 'Quick-start guide',
                    brochure: 'Brochure', comparison: 'Comparison sheet', form: 'Form', document: 'Document' };
  var panel = $('[data-admin-preview]'), frame = $('[data-pv-frame]'), stage = $('[data-pv-stage]');
  function openPreview() {
    app.classList.add('is-preview'); panel.hidden = false;
    var b = $('[data-preview-toggle]'); if (b) { b.setAttribute('aria-pressed', 'true'); b.classList.add('on'); }
    fit(); renderPreview();
  }
  function closePreview() {
    app.classList.remove('is-preview', 'is-preview-wide'); panel.hidden = true;
    var b = $('[data-preview-toggle]'); if (b) { b.setAttribute('aria-pressed', 'false'); b.classList.remove('on'); }
    $('[data-pv-expand]').textContent = 'Expand';
  }
  function schedulePreview() {
    if (!current || !app.classList.contains('is-preview')) return;
    clearTimeout(PV.timer); PV.timer = setTimeout(renderPreview, 250);
  }
  function fit() {
    var d = DEVICES[PV.device], w = stage.clientWidth - 2, h = stage.clientHeight - 2;
    var k = Math.min(1, w / d[0], PV.device === 'phone' ? h / d[1] : 1);
    frame.style.width = d[0] + 'px'; frame.style.height = d[1] + 'px';
    frame.style.transform = 'scale(' + k + ')';
    // a scaled frame keeps its full size in the layout: a box of the scaled size holds it
    var box = frame.parentNode.classList.contains('adm-pv-sizer') ? frame.parentNode : null;
    if (!box) { box = document.createElement('div'); box.className = 'adm-pv-sizer'; stage.insertBefore(box, frame); box.appendChild(frame); }
    box.style.width = Math.round(d[0] * k) + 'px'; box.style.height = Math.round(d[1] * k) + 'px';
  }
  window.addEventListener('resize', function () { if (!panel.hidden) fit(); });
  $$('[data-pv-device]').forEach(function (b) {
    b.addEventListener('click', function () {
      PV.device = b.getAttribute('data-pv-device');
      $$('[data-pv-device]').forEach(function (x) { x.classList.toggle('on', x === b); });
      fit();
    });
  });
  $('[data-pv-expand]').addEventListener('click', function (e) {
    var wide = app.classList.toggle('is-preview-wide');
    e.currentTarget.textContent = wide ? 'Shrink' : 'Expand';
    setTimeout(fit, 0);
  });
  $('[data-pv-close]').addEventListener('click', closePreview);

  function template(url) {
    if (!PV.tpl[url]) PV.tpl[url] = fetch(ROOT + url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); });
    return PV.tpl[url];
  }
  var money = function (n) { return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n); };
  function productHtml(v, doc) {
    var imgs = v.images || [];
    var gallery = '<div class="gallery"><div class="main">' + (imgs[0] ? '<img src="' + esc(src(imgs[0])) + '" alt="">' : '<div class="noimg" style="aspect-ratio:1;display:flex;align-items:center;justify-content:center">Picture coming soon</div>') + '</div>' +
      (imgs.length > 1 ? '<div class="thumbs">' + imgs.map(function (s, i) { return '<button type="button" data-src="' + esc(src(s)) + '"' + (i ? '' : ' class="on"') + '><img src="' + esc(src(s)) + '" alt="" width="72" height="72"></button>'; }).join('') + '</div>' : '') + '</div>';
    var docs = (v.documents || []).map(function (d) {
      return '<li><a class="pdoc" href="' + esc(src(d.href)) + '" target="_blank" rel="noopener"><span class="pdoc-t">' + esc(d.label || DOC_LABEL[d.type] || 'Document') + '<small>' + (d.lang === 'fr' ? 'PDF · in French' : 'PDF') + '</small></span><span class="pdoc-eye"><span>View</span></span></a></li>';
    }).join('');
    var dm = v.dimensions || {}, dims = [dm.length, dm.width, dm.height].filter(Boolean).join(' × ');
    var specs = (v.specs || []).concat(v.weight ? [{ label: 'Weight', values: [v.weight] }] : [], dims ? [{ label: 'Dimensions', values: [dims] }] : []);
    var info = (docs || specs.length) ? '<section class="pcard-info"><h2>Additional information</h2>' +
      (docs ? '<div class="pdocs2"><p class="pdocs2-title">Documentation</p><ul>' + docs + '</ul></div>' : '') +
      (specs.length ? '<dl class="pspecs">' + specs.map(function (x) { return '<div><dt>' + esc(x.label) + '</dt><dd>' + (x.values.length > 1 ? '<ul class="chips">' + x.values.map(function (y) { return '<li class="chip">' + esc(y) + '</li>'; }).join('') + '</ul>' : esc(x.values[0])) + '</dd></div>'; }).join('') + '</dl>' : '') + '</section>' : '';
    // the purchase card, with the same compact rules as the site (src/components/pricing.js)
    var opts = v.options || [], total = opts.reduce(function (n, o) { return n + o.values.length; }, 0), compact = opts.length >= 3 || total > 9;
    var wide = function (o) { return o.values.length > 5 || o.values.reduce(function (n, x) { return n + x.length + 5; }, 0) > 62; };
    var group = function (o, i, drop) {
      return '<fieldset class="pbox-opt" data-opt="' + esc(o.label) + '"><legend>' + esc(o.label) + '<span class="pbox-opt-val" data-opt-val></span></legend>' +
        (drop ? '<select name="opt-' + i + '" data-opt-select><option value="">Choose…</option>' + o.values.map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('') + '</select>'
              : '<div class="pbox-chips">' + o.values.map(function (x) { return '<label class="pbox-chip"><input type="radio" name="opt-' + i + '" value="' + esc(x) + '"><span>' + esc(x) + '</span></label>'; }).join('') + '</div>') +
        '<p class="pbox-err" data-opt-err hidden>Choose a ' + esc(o.label.toLowerCase()) + ' first.</p></fieldset>';
    };
    var pr = v.pricing || {}, priced = pr.mode === 'priced' && pr.price > 0;
    var price = priced ? money(pr.price) + (pr.priceMax > pr.price ? ' – ' + money(pr.priceMax) : '') : 'Price on request';
    var after = doc.querySelector('.pbox-after');
    var box = '<aside class="pbox pbox--buy" data-buy data-id="' + v.id + '"><div class="pbox-head"><p class="pbox-price" data-price-slot>' + esc(price) + '</p>' +
      (priced ? '<p class="pbox-note">Shown to signed-in customers; visitors see “Log in to see your price”.</p>' : '') + '</div>' +
      (compact ? '<div class="pbox-opts--compact">' + opts.map(function (o, i) { return group(o, i, true); }).join('') + '</div>' : opts.map(function (o, i) { return group(o, i, wide(o)); }).join('')) +
      '<div class="pbox-buyrow"><div class="qty"><button type="button" data-qty-dec>&minus;</button><input name="qty" type="number" value="1" min="1"><button type="button" data-qty-inc>+</button></div>' +
      '<button type="button" class="ui-btn ui-btn--primary ui-btn--app pbox-add" data-add-to-cart><span>Add to cart</span></button></div></aside>' + (after ? after.outerHTML : '');
    // the price table or size run instead, as the site chooses (src/model/price-style.js)
    var style = v.priceStyle && v.priceStyle !== 'auto' ? v.priceStyle : (v.autoStyle || (opts.length && !opts.some(function (o) { return /colou?r/i.test(o.label); }) ? 'table' : 'card'));
    if (style !== 'card' && opts.length) box = tableHtml(v, opts, style, price, priced);
    var plain = (v.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    var desc = plain ? '<section class="pdesc is-folded" data-fold data-fold-auto><h2 class="pdesc-title">Description</h2><div class="rich">' + v.description + '</div>' +
      '<button type="button" class="pdesc-more" data-fold-toggle aria-expanded="false" data-more="Read more" data-less="Show less">Read more</button></section>' : '';
    var cats = (v.categories || []).map(function (id) { return catById[id] ? esc(catById[id].path) : ''; }).filter(Boolean);
    return '<div class="product' + (style === 'table' && opts.length ? ' product--table' : '') + '"><div class="pgal">' + gallery + info + '</div><div class="pinfo" data-product-id="' + v.id + '">' +
      '<div class="phead"><h1>' + esc(v.name) + '</h1>' + (v.sku ? '<p class="psku">SKU: <b>' + esc(v.sku) + '</b></p>' : '') + '</div>' + box + desc +
      (cats.length ? '<p class="cats">Categories: ' + cats.join(', ') + '</p>' : '') + '</div></div>';
  }
  var STYLE_NAME = { card: 'Normal', table: 'Price table', sizes: 'Size run' };
  // A sketch of each page display (not the product): what the customer will see in the price card
  var g = function (x, y, w, h, fill, r) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (r == null ? 4 : r) + '" fill="' + fill + '"/>'; };
  var T = function (x, y, t, fill, size, weight, anchor) { return '<text x="' + x + '" y="' + y + '" fill="' + (fill || '#0E171B') + '" font-size="' + (size || 13) + '" font-weight="' + (weight || 600) + '" font-family="Red Hat Display, system-ui, sans-serif"' + (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + t + '</text>'; };
  var step = function (x, y, n, on) { return g(x, y, 78, 26, '#fff', 13) + '<rect x="' + (x + .75) + '" y="' + (y + .75) + '" width="76.5" height="24.5" rx="12.25" fill="none" stroke="' + (on ? '#004EA4' : '#C9D2DB') + '" stroke-width="' + (on ? 1.5 : 1) + '"/>' + T(x + 13, y + 18, '−', '#5B6770', 14, 500) + T(x + 39, y + 18, n, on ? '#004EA4' : '#9AA6B0', 13, 700, 'middle') + T(x + 60, y + 18, '+', '#5B6770', 14, 500); };
  var cardFrame = function (inner) { return '<svg viewBox="0 0 440 236" role="img" xmlns="http://www.w3.org/2000/svg">' + g(0, 0, 440, 236, '#EEF2F6', 16) + g(20, 16, 400, 204, '#fff', 14) + inner + '</svg>'; };
  var btn = function (x, y, w, label) { return g(x, y, w, 32, '#004EA4', 16) + T(x + w / 2, y + 21, label, '#fff', 12.5, 700, 'middle'); };
  var STYLE_ART = {
    card: { label: 'Normal', text: 'One price, the options as buttons or lists, then one quantity and Add to cart. Best for colours or a product with few choices.',
      svg: cardFrame(T(40, 50, '$25.00 – $197.50', '#0E171B', 19, 700) +
        T(40, 80, 'Size', '#3B4852', 11.5) + g(40, 88, 74, 26, '#EEF4FC', 8) + '<rect x="40.75" y="88.75" width="72.5" height="24.5" rx="7.5" fill="none" stroke="#004EA4" stroke-width="1.5"/>' + T(77, 105, '600 mm', '#004EA4', 11.5, 700, 'middle') +
        g(122, 88, 74, 26, '#F3F5F8', 8) + T(159, 105, '750 mm', '#5B6770', 11.5, 500, 'middle') + g(204, 88, 74, 26, '#F3F5F8', 8) + T(241, 105, '900 mm', '#5B6770', 11.5, 500, 'middle') +
        T(40, 136, 'Sheeting', '#3B4852', 11.5) + g(40, 144, 112, 26, '#F3F5F8', 8) + T(96, 161, 'Engineer grade', '#5B6770', 11.5, 500, 'middle') + g(160, 144, 104, 26, '#F3F5F8', 8) + T(212, 161, 'Diamond Grade', '#5B6770', 11.5, 500, 'middle') +
        step(40, 182, '1', false) + btn(130, 179, 270, 'Add to cart')) },
    table: { label: 'Price table', text: 'Every version that exists on its own line, grouped by size, with a quantity on each line and one Add for all of them. Best for signs and anything sold in sizes and materials.',
      svg: cardFrame(T(40, 46, '$25.00 – $197.50', '#0E171B', 19, 700) + g(320, 31, 82, 22, '#EEF4FC', 11) + T(361, 46, '12 versions', '#004EA4', 11, 700, 'middle') +
        g(20, 58, 400, 24, '#F5F7FA', 0) + '<polygon points="46,62 54,70 46,78 38,70" fill="#FFD200" stroke="#0E171B" stroke-width="1"/>' + T(62, 75, '600 x 600 mm', '#0E171B', 12, 700) + T(152, 75, '2 versions', '#9AA6B0', 11, 500) +
        T(40, 104, '1.5 mm', '#3B4852', 12, 500) + g(110, 91, 98, 20, '#F3F5F8', 10) + T(159, 105, 'Engineer grade', '#3B4852', 10.5, 600, 'middle') + step(322, 88, '', false) +
        g(20, 118, 400, 32, '#EEF4FC', 0) + T(40, 138, '2.0 mm', '#3B4852', 12, 500) + g(110, 124, 98, 20, '#fff', 10) + T(159, 138, 'Diamond Grade', '#3B4852', 10.5, 600, 'middle') + step(322, 121, '4', true) +
        g(20, 150, 400, 24, '#F5F7FA', 0) + '<polygon points="46,153 55,162 46,171 37,162" fill="#FFD200" stroke="#0E171B" stroke-width="1"/>' + T(62, 167, '900 x 900 mm', '#0E171B', 12, 700) +
        T(40, 204, '1 line · 4 signs', '#0E171B', 12, 700) + btn(270, 186, 130, 'Add to cart')) },
    sizes: { label: 'Size run', text: 'One box per size, so a whole crew is ordered at once (3 M, 5 L, 2 XL). Best for clothing.',
      svg: cardFrame(T(40, 50, '$83.32', '#0E171B', 19, 700) +
        ['S', 'M', 'L', 'XL'].map(function (sz, i) { var x = 40 + i * 92, on = sz === 'L'; return g(x, 66, 82, 92, on ? '#EEF4FC' : '#F5F7FA', 12) + (on ? '<rect x="' + (x + .75) + '" y="66.75" width="80.5" height="90.5" rx="11.25" fill="none" stroke="#004EA4" stroke-width="1.5"/>' : '') + T(x + 41, 98, sz, on ? '#004EA4' : '#0E171B', 18, 700, 'middle') + step(x + 2, 118, on ? '5' : '', on); }).join('') +
        T(40, 204, '5 coveralls · $416.60', '#0E171B', 12, 700) + btn(270, 186, 130, 'Add to cart')) }
  };
  function paintStyleArt(f) {
    var fig = $('[data-style-art]', f); if (!fig) return;
    var pick = (f.priceStyle && f.priceStyle.value) || 'auto', auto = pick === 'auto', key = auto ? fig.getAttribute('data-auto') : pick, a = STYLE_ART[key] || STYLE_ART.card;
    fig.innerHTML = '<div class="ad-style-art-pic">' + a.svg + '</div><figcaption><b>' + (auto ? 'Automatic: ' : '') + a.label + '</b><span>' + a.text + '</span><small>A sketch of the price card, not this product.</small></figcaption>';
  }
  // the price table / size run in the preview: every combination (the built page keeps only
  // the ones that exist), grouped by the first option
  function tableHtml(v, opts, style, price, priced) {
    var lines = [[]];
    opts.forEach(function (o) { var next = []; lines.forEach(function (l) { o.values.forEach(function (x) { next.push(l.concat([x])); }); }); lines = next; });
    var step = '<div class="pt-step"><button type="button" data-q-dec>&minus;</button><input type="number" min="0" placeholder="0" data-q><button type="button" data-q-inc>+</button></div>';
    var head = '<div class="pt-head"><div><p class="pbox-price" data-price-slot>' + esc(price) + '</p></div><span class="pt-count">' + lines.length + ' versions</span></div>';
    var foot = '<div class="pt-foot"><p class="pt-sum" data-pt-sum data-hint="Type a quantity on each line you need.">Type a quantity on each line you need.</p><button type="button" class="ui-btn ui-btn--primary ui-btn--app pt-add" data-pt-add data-add-to-cart disabled><span>Add to cart</span></button></div>';
    var body;
    if (style === 'sizes') {
      body = '<div class="srun"><div class="srun-grid">' + lines.map(function (l) { return '<label class="srun-tile pt-line" data-line="[]"><span class="srun-size">' + esc(l.join(' · ').replace(/^Size\s+/i, '')) + '</span>' + step + '</label>'; }).join('') + '</div></div>';
      return '<aside class="pbox pbox--sizes pt" data-pt data-id="' + v.id + '">' + head + body + foot + '</aside>';
    }
    var grouped = opts.length > 1 && lines.length > 4, cols = grouped ? opts.slice(1) : opts;
    var row = function (l) { return '<tr class="pt-line" data-line="[]">' + (grouped ? l.slice(1) : l).map(function (x, i) { return '<td data-col="' + esc(cols[i].label) + '"><span>' + esc(x) + '</span></td>'; }).join('') + '<td class="pt-q">' + step + '</td></tr>'; };
    var thead = '<thead><tr>' + cols.map(function (c) { return '<th>' + esc(c.label) + '</th>'; }).join('') + '<th class="pt-q">Qty</th></tr></thead>';
    if (grouped) {
      var groups = {}; lines.forEach(function (l) { (groups[l[0]] = groups[l[0]] || []).push(l); });
      body = Object.keys(groups).map(function (g) { return '<tbody><tr class="pt-g"><th colspan="' + (cols.length + 1) + '"><span>' + esc(g) + '</span></th></tr>' + groups[g].map(row).join('') + '</tbody>'; }).join('');
    } else body = '<tbody>' + lines.map(row).join('') + '</tbody>';
    return '<aside class="pbox pbox--table pt" data-pt data-id="' + v.id + '">' + head + '<div class="pt-scroll"><table class="pt-t">' + thead + body + '</table></div>' + foot + '</aside>';
  }
  function renderPreview() {
    var f = $('[data-admin-form]'); if (!f || !current) return;
    var v = collect(f), orig = find(current.id) || {};
    v.id = current.id; v.autoStyle = orig.autoStyle;
    // the page in the language being edited: French text and pictures, the English while missing
    if (EL === 'fr') v = Object.assign({}, v, {
      name: v.name_fr || v.name, description: v.description_fr || v.description, images: v.images_fr || v.images,
      options: (v.options || []).map(function (o) { return { label: o.label_fr || o.label, values: o.values.map(function (x, i) { return (o.values_fr || [])[i] || x; }) }; }),
      specs: (v.specs || []).map(function (o) { return { label: o.label_fr || o.label, values: o.values.map(function (x, i) { return (o.values_fr || [])[i] || x; }) }; })
    });
    var pub = byId[current.id] || {};
    var url = (EL === 'fr' ? pub.url_fr : pub.url) || (EL === 'fr' ? DATA.products[0].url_fr : DATA.products[0].url);   // a new product borrows any product page's frame
    template(url).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html'), prod = doc.querySelector('.product');
      if (!prod) return;
      prod.outerHTML = productHtml(v, doc);
      $$('.related', doc).forEach(function (x) { x.remove(); });
      var last = doc.querySelector('.crumbs span:last-child'); if (last) last.textContent = v.name;
      var base = doc.createElement('base'); base.target = '_blank'; doc.head.prepend(base);   // links open outside the preview
      var y = frame.contentWindow ? frame.contentWindow.scrollY : 0;
      frame.onload = function () { try { frame.contentWindow.scrollTo(0, y); } catch (e) {} };
      frame.srcdoc = '<!DOCTYPE html>' + doc.documentElement.outerHTML;
    }).catch(function () { frame.srcdoc = '<p style="font:16px sans-serif;padding:20px">The preview could not load the page frame.</p>'; });
  }

  /* ---------- Backups: copies of every change made here, to go back to ---------- */
  var BACKUPS = 'signel.admin.backups';
  function backup() {
    if (current) { var before = JSON.stringify(changes); if (dirty) saveProduct(true); if (JSON.stringify(changes) !== before) toast('Your edits to this product were saved first.'); }
    var n = Object.keys(changes.products).length + changes.new.length;
    var at = new Date(), snap = { id: at.getTime(), at: at.toISOString(), label: 'Backup of ' + at.toLocaleString('en-CA'), count: n, catalogBuilt: DATA.generated, changes: JSON.parse(JSON.stringify(changes)) };
    var list = store.get(BACKUPS, []); list.unshift(snap);
    var kept = store.set(BACKUPS, list.slice(0, 20));
    download('signel-backup-' + at.toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json',
             { kind: 'signel-admin-backup', at: snap.at, catalogBuilt: DATA.generated, changes: snap.changes, publishedCatalog: DATA.products });
    toast(kept ? 'Backup made (' + plural(n, 'changed product', 'changed products') + ') and downloaded.' : 'Backup downloaded (this browser is full, so it is not in the list).');
  }
  function showBackups() {
    var list = store.get(BACKUPS, []);
    viewEl.innerHTML = '<div class="ad-page"><div class="ad-head"><div><h1>Backups</h1><p class="ad-muted">A backup keeps every change made in this dashboard at that moment, to go back to if something goes wrong. Each is also downloaded as a file.</p></div>' +
      '<div class="ad-head-tools"><label class="ad-btn">Restore from a file…<input type="file" accept="application/json" data-bk-file hidden></label><button type="button" class="ad-btn ad-btn--primary" data-backup>Back up now</button></div></div>' +
      (list.length ? '<div class="ad-card ad-card--flush"><ul class="ad-change-list">' + list.map(function (b) {
        return '<li><span class="ad-mini-t"><b>' + esc(b.label) + '</b><small>' + plural(b.count, 'changed product', 'changed products') + '</small></span><button type="button" class="ad-btn" data-bk-restore="' + b.id + '">Restore</button><button type="button" class="ad-btn" data-bk-download="' + b.id + '">Download</button><button type="button" class="ad-icon-btn" data-bk-delete="' + b.id + '" aria-label="Delete this backup">' + ICON.x + '</button></li>';
      }).join('') + '</ul></div>' : '<div class="ad-empty-state"><h2>No backups yet</h2><p>Make one before big changes, so you can always go back.</p></div>') +
      '<p class="ad-muted ad-small">To put the whole website back as it was, see <button type="button" class="ad-link" data-go="versions">Website versions</button>.</p></div>';
    bindGo(viewEl);
    viewEl.onclick = function (e) {
      var t = e.target, id;
      if (t.closest('[data-backup]')) { backup(); return showBackups(); }
      var all = store.get(BACKUPS, []), pick = function (x) { return all.filter(function (b) { return String(b.id) === x; })[0]; };
      if ((id = t.getAttribute('data-bk-restore'))) { var b = pick(id); if (!b || !confirm('Replace the current changes with “' + b.label + '”? Back up first if you may want them.')) return; changes = JSON.parse(JSON.stringify(b.changes)); save(); toast('Restored: ' + b.label); return; }
      if ((id = t.getAttribute('data-bk-download'))) { var d = pick(id); if (d) download('signel-backup-' + id + '.json', { kind: 'signel-admin-backup', at: d.at, catalogBuilt: d.catalogBuilt, changes: d.changes }); return; }
      if ((id = t.closest('[data-bk-delete]') && t.closest('[data-bk-delete]').getAttribute('data-bk-delete'))) { if (!confirm('Delete this backup?')) return; store.set(BACKUPS, all.filter(function (b) { return String(b.id) !== id; })); showBackups(); }
    };
    $('[data-bk-file]', viewEl).addEventListener('change', function (e) {
      var file = e.target.files[0]; if (!file) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var d = JSON.parse(r.result), c = d.kind === 'signel-admin-backup' ? d.changes : d;
          if (!c || (!c.products && !c.new)) throw new Error('no changes');
          if (!confirm('Replace the current changes with the ones in this file?')) return;
          changes = { products: c.products || {}, new: c.new || [] }; save(); toast('Restored from ' + file.name);
        } catch (err) { toast('That file is not a Signel backup or catalog.json.'); }
      };
      r.readAsText(file);
    });
  }

  /* ---------- Website versions: every published version, to roll the whole site back to.
     Rolling back is switched on at launch, when a back end can restore a version. ---------- */
  function showVersions() {
    viewEl.innerHTML = '<div class="ad-page"><div class="ad-loading">Loading the versions…</div></div>';
    fetch(ROOT + '/admin/versions.json').then(function (r) { return r.json(); }).then(function (d) {
      var when = function (iso) { var t = new Date(iso); return t.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) + ' · ' + t.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' }); };
      viewEl.innerHTML = '<div class="ad-page"><div class="ad-head"><div><h1>Website versions</h1><p class="ad-muted">Every version of the website that was published, newest first. Rolling back puts the whole site back as it was; the versions after it are kept, so a rollback can be undone.</p></div></div>' +
        '<p class="adm-launch">Rollback is switched on when the site goes live. Until then you can browse the versions; nothing is changed.</p>' +
        (d.versions.length ? '<div class="ad-card ad-card--flush"><ol class="ad-timeline">' + d.versions.map(function (v, i) {
          return '<li' + (i ? '' : ' class="is-current"') + '><span class="ad-dot"></span><span class="ad-mini-t"><b>' + esc(v.title) + '</b><small>' + esc(when(v.at)) + ' · version ' + esc(v.id) + '</small></span>' +
            (i ? '<button type="button" class="ad-btn" data-roll="' + esc(v.id) + '">Roll back to this</button>' : '<em class="ad-chip ad-chip--green">Live now</em>') + '</li>';
        }).join('') + '</ol></div>' : '<p>No versions available in this build.</p>') +
        '<dialog class="adm-dialog" data-roll-dialog><form method="dialog"><h3>Roll the website back?</h3><p data-roll-what></p>' +
        '<p class="ad-muted ad-small">The site will look and work exactly as it did in that version. Versions published since stay in the history. Dashboard changes not yet published are not affected.</p>' +
        '<p class="adm-launch" data-roll-note hidden>Rollback is switched on when the site goes live. Nothing was changed.</p>' +
        '<div class="adm-dialog-actions"><button value="cancel" class="ad-btn">Cancel</button><button type="button" class="ad-btn ad-btn--danger" data-roll-confirm>Roll back</button></div></form></dialog></div>';
      var dlg = $('[data-roll-dialog]', viewEl);
      viewEl.onclick = function (e) {
        var b = e.target.closest('[data-roll]');
        if (b) {
          var v = d.versions.filter(function (x) { return x.id === b.getAttribute('data-roll'); })[0];
          $('[data-roll-what]', dlg).innerHTML = 'Back to <b>' + esc(v.title) + '</b>, published ' + esc(when(v.at));
          $('[data-roll-note]', dlg).hidden = true; $('[data-roll-confirm]', dlg).hidden = false;
          dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
        }
        // at launch: ask the back end to publish this version again (POST /api/versions/<id>/restore)
        if (e.target.closest('[data-roll-confirm]')) { $('[data-roll-note]', dlg).hidden = false; $('[data-roll-confirm]', dlg).hidden = true; }
      };
    }).catch(function () { viewEl.innerHTML = '<div class="ad-page"><p>The list of versions could not be loaded.</p></div>'; });
  }

  // other tabs: a request sent from the site, or changes made in another dashboard tab
  window.addEventListener('storage', function (e) {
    if (e.key === REQUESTS) { paintBadges(); if (location.hash === '#requests') paintBoard(); }
    if (e.key === CHANGES) { changes = store.get(CHANGES, { products: {}, new: [] }); paintBadges(); }
  });
})();
