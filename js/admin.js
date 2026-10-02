/* Signel Services — admin (src/pages/admin.js). Demo sign-in, then the dashboard:
     Overview          what needs attention (no picture, no SKU, no internal ID), new requests
     Products          the catalogue as a table with filters; a product opens in the editor
     Requests          a board of what visitors sent (cart, rental, account, message)
     Publish           the changes made here, and how they reach the website
     Website versions  every published version (rollback switched on at launch)
     Backups           copies of the changes, to go back to
   Product changes are kept in this browser (localStorage 'signel.admin.changes') and published
   as catalog.json, the file the build applies (src/model/catalog-edits.js). Requests are kept
   in 'signel.requests' (written by the site: src/js/log.js signelRequest). A back end will
   replace both stores and the demo sign-in, with the same shapes. */
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

  /* ---------- sign-in (demo: the back end will check real accounts) ---------- */
  var login = $('[data-admin-login]');
  if (login) {
    if (sessionStorage.getItem(SESSION)) location.replace(ROOT + '/admin/dashboard/');
    login.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = login.email.value.trim().toLowerCase(), pw = login.password.value, err = $('[data-admin-err]');
      if (email === 'admin@signel.ca' && pw === 'signel-admin') {
        sessionStorage.setItem(SESSION, JSON.stringify({ email: email, at: Date.now() }));
        location.href = ROOT + '/admin/dashboard/';
      } else { err.textContent = 'Wrong email or password.'; err.hidden = false; }
    });
    return;
  }

  var app = $('[data-admin-app]');
  if (!app) return;
  if (!sessionStorage.getItem(SESSION)) { location.replace(ROOT + '/admin/'); return; }
  $('[data-admin-logout]').addEventListener('click', function () { sessionStorage.removeItem(SESSION); location.href = ROOT + '/admin/'; });

  var DATA = null, byId = {}, catById = {};
  // changes: { products: { id: {field: value} }, new: [ {...} ] } — the catalog.json shape
  var changes = store.get(CHANGES, { products: {}, new: [] });
  var FIELDS = ['name', 'sku', 'internalId', 'categories', 'description', 'priceStyle', 'images', 'documents', 'options', 'specs', 'weight', 'dimensions', 'pricing', 'hidden'];
  var current = null;   // the product open in the editor: { id, isNew }
  var dirty = false, saved = null;   // unsaved edits in the editor, and the last saved state
  var viewEl = $('[data-view]');
  var src = function (s) { return /^(data:|https?:)/.test(s) ? s : ROOT + s; };
  var plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : many); };

  fetch(ROOT + '/admin/catalog-data.json').then(function (r) { return r.json(); }).then(function (d) {
    DATA = d;
    d.products.forEach(function (p) { byId[p.id] = p; });
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
    $$('[data-nav]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-nav') === (parts[0] === 'product' ? 'products' : parts[0])); });
    var fn = { overview: showOverview, products: showProducts, product: function () { openProduct(Number(parts[1])); }, requests: showRequests,
               publish: showPublish, versions: showVersions, backups: showBackups }[parts[0]] || showOverview;
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

  function paintBadges() {
    var n = Object.keys(changes.products).length + changes.new.length, r = requests().filter(function (x) { return x.status === 'new'; }).length;
    var bp = $('[data-badge-publish]'), br = $('[data-badge-requests]');
    bp.textContent = n; bp.hidden = !n; br.textContent = r; br.hidden = !r;
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
    nodesc: { label: 'No description', test: function (v) { return !String(v.description || '').replace(/<[^>]+>/g, '').trim(); } }
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

  /* ---------- Overview ---------- */
  function showOverview() {
    var list = allProducts().map(view), live = list.filter(function (v) { return !v.hidden; });
    var count = function (k) { return live.filter(CHECKS[k].test).length; };
    var reqs = requests(), fresh = reqs.filter(function (r) { return r.status === 'new'; });
    var n = Object.keys(changes.products).length + changes.new.length;
    var tile = function (k, icon, label, value, hint, tone) {
      return '<button type="button" class="ad-stat' + (tone ? ' ad-stat--' + tone : '') + '" data-go="' + k + '"><span class="ad-stat-ic">' + icon + '</span><span class="ad-stat-n">' + value.toLocaleString('en-CA') + '</span><span class="ad-stat-l">' + label + '</span><span class="ad-stat-h">' + hint + '</span></button>';
    };
    var hour = new Date().getHours();
    viewEl.innerHTML = '<div class="ad-page">' +
      '<div class="ad-head"><div><p class="ad-eyebrow">' + new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }) + '</p><h1>Good ' + (hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening') + '</h1></div></div>' +
      '<div class="ad-stats">' +
        tile('requests', ICON.inbox, 'New requests', fresh.length, fresh.length ? 'Waiting for an answer' : 'All answered', fresh.length ? 'blue' : '') +
        tile('products/nopic', ICON.pic, 'Need a picture', count('nopic'), 'Products shown without one', count('nopic') ? 'warn' : '') +
        tile('products/nosku', ICON.tag, 'No SKU', count('nosku'), 'Add the product code', count('nosku') ? 'warn' : '') +
        tile('products/noid', ICON.link, 'No internal ID', count('noid'), 'To match the internal software', '') +
        tile('publish', ICON.up, 'Not published yet', n, n ? 'Changes made here' : 'Everything is published', n ? 'warn' : '') +
      '</div>' +
      '<div class="ad-cols">' +
        '<section class="ad-card"><div class="ad-card-head"><h2>Latest requests</h2><button type="button" class="ad-link" data-go="requests">Open the board</button></div>' +
          (reqs.length ? '<ul class="ad-mini-list">' + reqs.slice(0, 6).map(function (r) {
            return '<li><button type="button" data-req="' + r.id + '">' + typeChip(r.type) + '<span class="ad-mini-t"><b>' + esc(who(r)) + '</b><small>' + esc(summary(r)) + '</small></span><span class="ad-mini-s">' + statusChip(r.status) + '<small>' + ago(r.at) + '</small></span></button></li>';
          }).join('') + '</ul>' : '<p class="ad-muted">No requests yet. They appear here when visitors send their cart, ask for a rental, create an account or write to you.</p>') + '</section>' +
        '<section class="ad-card"><div class="ad-card-head"><h2>Recently edited</h2><button type="button" class="ad-link" data-go="publish">Review and publish</button></div>' +
          (n ? '<ul class="ad-mini-list">' + changedList().slice(0, 6).map(function (c) {
            return '<li><button type="button" data-go="product/' + c.id + '">' + thumb(c.v) + '<span class="ad-mini-t"><b>' + esc(c.v.name) + '</b><small>' + esc(c.what) + '</small></span><span class="ad-mini-s">' + (c.isNew ? '<em class="ad-chip ad-chip--green">New</em>' : '<em class="ad-chip ad-chip--amber">Edited</em>') + '</span></button></li>';
          }).join('') + '</ul>' : '<p class="ad-muted">Nothing changed since the last publish. Open a product to edit it, or add a new one.</p>') + '</section>' +
      '</div></div>';
    bindGo(viewEl);
    $$('[data-req]', viewEl).forEach(function (b) { b.addEventListener('click', function () { go('requests'); setTimeout(function () { openRequest(b.getAttribute('data-req')); }, 60); }); });
  }
  function bindGo(root) { $$('[data-go]', root).forEach(function (b) { b.addEventListener('click', function () { go(b.getAttribute('data-go')); }); }); }
  function thumb(v, size) { var i = (v.images || [])[0]; return i ? '<img class="ad-thumb' + (size ? ' ad-thumb--' + size : '') + '" src="' + esc(src(i)) + '" alt="" loading="lazy">' : '<span class="ad-thumb ad-thumb--none' + (size ? ' ad-thumb--' + size : '') + '">' + ICON.pic + '</span>'; }

  /* ---------- Products: table with filters ---------- */
  var PF = { q: '', filter: 'all', cat: 0, page: 1 };
  var PER = 50;
  function showProducts(args) {
    if (args && args[0] && (CHECKS[args[0]] || /^(edited|hidden)$/.test(args[0]))) PF.filter = args[0];
    var chips = [['all', 'All'], ['edited', 'Edited here'], ['nopic', 'No picture'], ['nosku', 'No SKU'], ['noid', 'No internal ID'], ['nodesc', 'No description'], ['hidden', 'Hidden']];
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
        (v.hidden ? '<em class="ad-chip ad-chip--red">Hidden</em>' : '') + (!(v.images || []).length ? '<em class="ad-chip">No picture</em>' : '');
      return '<tr data-open="' + p.id + '" tabindex="0"><td><div class="ad-prod">' + thumb(v) + '<span><b>' + esc(v.name) + '</b><small>' + (v.sku ? esc(v.sku) : '<i>No SKU</i>') + '</small></span></div></td>' +
        '<td>' + (v.internalId ? esc(v.internalId) : '<span class="ad-muted">—</span>') + '</td><td class="ad-cat">' + (cat ? esc(cat.name) : '<span class="ad-muted">—</span>') + '</td><td>' + style + '</td><td><div class="ad-flags">' + (flags || '<span class="ad-muted">On the site</span>') + '</div></td></tr>';
    }).join('') || '<tr><td colspan="5" class="ad-none">No product matches. Try another filter or search.</td></tr>';
    $('[data-p-foot]', viewEl).innerHTML = list.length > PF.page * PER ? '<span>Showing ' + (PF.page * PER) + ' of ' + list.length.toLocaleString('en-CA') + '</span><button type="button" class="ad-btn" data-more>Show ' + Math.min(PER, list.length - PF.page * PER) + ' more</button>' : '';
  }

  $('[data-admin-new]').addEventListener('click', function () {
    // after every id in use: the catalogue's own (products added before) and this browser's
    var ids = changes.new.map(function (n) { return n.id; }).concat(DATA.products.map(function (p) { return p.id; }));
    var id = Math.max.apply(null, [Number(app.getAttribute('data-new-id-from')) - 1].concat(ids)) + 1;
    changes.new.unshift({ id: id, name: 'New product', sku: '', internalId: '', categories: [], description: '', priceStyle: 'auto', images: [], documents: [],
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
    return row('adm-pair-row', '<input type="text" placeholder="' + (kind === 'opt' ? 'Option, e.g. Colour' : 'Name, e.g. Material') + '" value="' + esc(o.label) + '" data-' + kind + '-label>' +
      '<input type="text" placeholder="Values, separated by |   e.g. Amber | White" value="' + esc((o.values || []).join(' | ')) + '" data-' + kind + '-values>');
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
    var panel = function (id, inner) { return '<section class="ad-panel" data-panel="' + id + '"' + (id === 'basics' ? '' : ' hidden') + '>' + inner + '</section>'; };
    return '<form class="ad-editor" data-admin-form novalidate>' +
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
      '<div class="ad-tabs" role="tablist">' + TABS.map(function (t, i) { return '<button type="button" role="tab" aria-selected="' + (i ? 'false' : 'true') + '" data-tab="' + t[0] + '">' + t[1] + '<i data-tab-err hidden></i></button>'; }).join('') + '</div>' +

      panel('basics',
        '<div class="ad-card"><h2>Product</h2><div class="ad-grid3">' + fld('Name', '<input type="text" name="name" required value="' + esc(v.name) + '">') +
          fld('SKU', '<input type="text" name="sku" value="' + esc(v.sku) + '">', 'The product code customers see') +
          fld('Internal ID', '<input type="text" name="internalId" value="' + esc(v.internalId || '') + '">', 'The code in the internal software') + '</div>' +
          '<label class="ad-switch"><input type="checkbox" name="hidden"' + (v.hidden ? ' checked' : '') + '><span aria-hidden="true"></span><b>Hide from the website</b><small>The product stays here but nobody can find it on the site.</small></label></div>' +
        '<div class="ad-card"><h2>Pictures <small>The first one is the main picture</small></h2><div class="ad-pics" data-imgs>' + (v.images || []).map(imgTile).join('') +
          '<label class="ad-pic ad-pic--add">' + ICON.pic + '<span>Add a picture</span><small>JPG, PNG or WebP, under 3 MB</small><input type="file" accept="image/*" data-img-file hidden multiple></label></div>' +
          '<div class="ad-inline"><input type="text" placeholder="Or paste a picture address, e.g. /img/2026/05/photo.jpg" data-img-url><button type="button" class="ad-btn" data-img-add>Add</button></div></div>') +

      panel('description',
        '<div class="ad-card"><h2>Description <small>Shown under the price card, folded with “Read more” where the pictures end</small></h2>' +
          '<div class="ad-rte-bar" role="toolbar" aria-label="Formatting"><button type="button" data-fmt="h3">Heading</button><button type="button" data-fmt="p">Paragraph</button><button type="button" data-fmt="ul">Bullet list</button><button type="button" data-fmt="b">Bold</button><span></span><button type="button" class="on" data-desc-mode="edit">Edit</button><button type="button" data-desc-mode="see">See it</button></div>' +
          '<textarea name="description" rows="16" class="ad-code">' + esc(v.description) + '</textarea><div class="ad-desc-see rich" data-preview-out hidden></div></div>') +

      panel('categories', '<div class="ad-card"><h2>Categories <small>Where customers find it when clicking through the site; it also shows in every parent category and in search</small></h2>' + catTree(v) + '</div>') +

      panel('price',
        '<div class="ad-card"><h2>Price</h2><div class="ad-choice">' +
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
        '<div class="ad-card"><h2>Options the customer chooses <small>Each needs two values or more; English colour names show as colour dots</small></h2><div data-opts>' + (v.options || []).map(function (o) { return pairRow('opt', o); }).join('') + '</div>' +
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
  function relabelPics(f) { $$('[data-pic]:not(.ad-pic--add)', f).forEach(function (t, i) { var m = $('.ad-pic-main', t); if (i === 0 && !m) t.insertAdjacentHTML('beforeend', '<em class="ad-pic-main">Main picture</em>'); if (i && m) m.remove(); }); }
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
      if (t.closest('[data-img-add]')) { var u = $('[data-img-url]', f); if (u.value.trim()) { $('.ad-pic--add', f).insertAdjacentHTML('beforebegin', imgTile(u.value.trim(), 1)); u.value = ''; relabelPics(f); changed(); } return; }
      if (t.closest('[data-doc-add]')) { $('[data-docs]', f).insertAdjacentHTML('beforeend', docRow({ type: 'product-sheet', href: '', lang: 'en' })); return; }
      if (t.closest('[data-opt-add]')) { $('[data-opts]', f).insertAdjacentHTML('beforeend', pairRow('opt', { label: '', values: [] })); return; }
      if (t.closest('[data-spec-add]')) { $('[data-specs]', f).insertAdjacentHTML('beforeend', pairRow('spec', { label: '', values: [] })); return; }
      var un = t.closest('[data-uncat]'); if (un) { var box = $('[data-cats] input[value="' + un.getAttribute('data-uncat') + '"]', f); if (box) box.checked = false; paintCats(f); changed(); return; }
      var fm = t.closest('[data-fmt]'); if (fm) { format(f.description, fm.getAttribute('data-fmt')); changed(); return; }
      var dm = t.closest('[data-desc-mode]');
      if (dm) {
        var see = dm.getAttribute('data-desc-mode') === 'see', out = $('[data-preview-out]', f);
        $$('[data-desc-mode]', f).forEach(function (b) { b.classList.toggle('on', b === dm); });
        out.innerHTML = f.description.value; out.hidden = !see; f.description.hidden = see; return;
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
    $('[data-img-file]', f).addEventListener('change', function (e) {
      Array.prototype.forEach.call(e.target.files, function (file) { readFile(file, function (d) { $('.ad-pic--add', f).insertAdjacentHTML('beforebegin', imgTile(d, 1)); relabelPics(f); changed(); }); });
      e.target.value = '';
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
    paintCats(f);
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
    paintDirty(); schedulePreview();
  }
  function paintDirty(err) {
    var bar = $('[data-savebar]'); if (!bar) return;
    bar.hidden = !dirty && !err;
    $('[data-savebar-err]').textContent = err || '';
    bar.classList.toggle('is-err', !!err);
  }

  function pairs(f, kind) {
    return $$('[data-' + kind + 's] .adm-rowedit', f).map(function (r) {
      return { label: $('[data-' + kind + '-label]', r).value.trim(), values: $('[data-' + kind + '-values]', r).value.split('|').map(function (s) { return s.trim(); }).filter(Boolean) };
    }).filter(function (o) { return o.label && o.values.length; });
  }
  function collect(f) {
    return {
      name: f.name.value.trim(), sku: f.sku.value.trim(), internalId: f.internalId.value.trim(), hidden: f.hidden.checked,
      categories: $$('[data-cats] input:checked', f).map(function (i) { return Number(i.value); }),
      description: f.description.value, priceStyle: (f.priceStyle && f.priceStyle.value) || 'auto',
      images: $$('[data-pic] [data-img]', f).map(function (i) { return i.getAttribute('data-file') || i.value.trim(); }).filter(Boolean),
      documents: $$('[data-docs] .adm-rowedit', f).map(function (r) {
        var h = $('[data-doc-href]', r);
        return { type: $('[data-doc-type]', r).value, label: $('[data-doc-label]', r).value.trim(), href: h.getAttribute('data-file') || h.value.trim(), lang: $('[data-doc-lang]', r).value };
      }).filter(function (d) { return d.href; }),
      options: pairs(f, 'opt'), specs: pairs(f, 'spec'),
      weight: f.weight.value.trim(), dimensions: { length: f.length.value.trim(), width: f.width.value.trim(), height: f.height.value.trim() },
      pricing: f.pmode.value === 'priced' ? { mode: 'priced', price: Number(f.price.value) || '', priceMax: Number(f.priceMax.value) || '' } : { mode: 'quote', price: '', priceMax: '' }
    };
  }
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
      var orig = byId[current.id], patch = {};
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
  function save() { var ok = store.set(CHANGES, changes); paintBadges(); return ok; }
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
    var list = changedList();
    viewEl.innerHTML = '<div class="ad-page"><div class="ad-head"><div><h1>Publish</h1><p class="ad-muted">' + (list.length ? plural(list.length, 'product', 'products') + ' changed in this browser, not on the website yet.' : 'Everything you changed is on the website.') + '</p></div></div>' +
      (list.length ? '<div class="ad-card ad-card--flush"><ul class="ad-change-list">' + list.map(function (c) {
        return '<li>' + thumb(c.v) + '<span class="ad-mini-t"><b>' + esc(c.v.name) + '</b><small>' + esc(c.what) + '</small></span>' + (c.isNew ? '<em class="ad-chip ad-chip--green">New</em>' : '<em class="ad-chip ad-chip--amber">Edited</em>') +
          '<button type="button" class="ad-btn" data-go="product/' + c.id + '">Open</button><button type="button" class="ad-icon-btn" data-undo="' + c.id + '" title="' + (c.isNew ? 'Delete' : 'Undo these changes') + '" aria-label="Undo">' + ICON.x + '</button></li>';
      }).join('') + '</ul></div>' +
      '<div class="ad-card ad-publish"><div class="ad-step"><b>1</b><div><h2>Download the changes</h2><p class="ad-muted">One file with every change above (catalog.json).</p><button type="button" class="ad-btn ad-btn--primary" data-export>Download the changes</button></div></div>' +
      '<div class="ad-step"><b>2</b><div><h2>Send it to put it online</h2><p class="ad-muted">Until the back end is connected, the file is added to the website project (data/admin/catalog.json) and the site is rebuilt: new products appear in their categories and in search. Once the back end is connected, this page will have a single Publish button.</p></div></div></div>' : '<div class="ad-empty-state">' + ICON.up + '<h2>Nothing to publish</h2><p>Changes you save to products appear here until they are on the website.</p><button type="button" class="ad-btn ad-btn--primary" data-go="products">Go to products</button></div>') +
      '<div class="ad-card"><h2>Changes file from someone else?</h2><p class="ad-muted">Load a catalog.json or a backup to continue where they left off. It replaces the changes in this browser.</p><label class="ad-btn">Load a file…<input type="file" accept="application/json" data-import hidden></label></div></div>';
    bindGo(viewEl);
    var ex = $('[data-export]', viewEl);
    if (ex) ex.addEventListener('click', function () {
      download('catalog.json', { _about: 'Changes from the Signel admin dashboard. Put this file at data/admin/catalog.json; the next build applies it (src/model/catalog-edits.js).', exported: new Date().toISOString(),
        products: changes.products, new: changes.new.map(function (n) { var c = Object.assign({}, n); delete c.isNew; return c; }) });
      toast('catalog.json downloaded.');
    });
    viewEl.addEventListener('click', function (e) {
      var u = e.target.closest('[data-undo]'); if (!u) return;
      var id = Number(u.getAttribute('data-undo'));
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
          if (!c || (!c.products && !c.new)) throw new Error('no changes');
          if (!confirm('Replace the changes in this browser with the ones in ' + file.name + '?')) return;
          changes = { products: c.products || {}, new: c.new || [] }; save(); showPublish(); toast('Loaded ' + file.name);
        } catch (err) { toast('That file is not a Signel changes file or backup.'); }
      };
      r.readAsText(file);
    });
  }

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
    if (r.type === 'account') return ((d.customer || {}).type || 'Account') + ((d.customer || {}).customer === 'yes' ? ' · existing customer' : '');
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
      board.outerHTML = '<div class="ad-empty-state" data-board>' + ICON.inbox + '<h2>No requests yet</h2><p>Requests appear here when a visitor sends their cart, asks for a rental, creates an account or writes to you. Until the back end is connected, only those sent from this browser show.</p>' +
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
      if (t.closest('[data-note-add]')) { var ta = $('[data-note]', dr); if (!ta.value.trim()) return; updateRequest(id, function (x) { (x.notes = x.notes || []).push({ at: new Date().toISOString(), text: ta.value.trim() }); }); openRequest(id); paintBoard(); return; }
      if (t.closest('[data-req-del]')) { if (!confirm('Delete this request?')) return; saveRequests(requests().filter(function (x) { return x.id !== id; })); closeDrawer(); paintBoard(); }
    };
    $('[data-assignee]', dr).addEventListener('change', function (e) { updateRequest(id, function (x) { x.assignee = e.target.value.trim(); }); paintBoard(); });
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
      { id: 'ex1', example: true, type: 'quote', status: 'new', at: t(1), data: { customer: { name: 'Example contact', company: 'Example municipality', email: 'example@example.com', phone: '(450) 555-0100' }, lines: [line(pick('moose'), 4, [['Dimensions', '900 x 900 mm'], ['Thickness', '2.0'], ['Sheeting', 'Diamond Grade']]), line(pick('stop'), 10)] } },
      { id: 'ex2', example: true, type: 'rental', status: 'progress', at: t(20), data: { customer: { name: 'Example contact', company: 'Example contractor', email: 'example@example.com' }, lines: [line(pick('rad62'), 2, [['Rental', '2026-11-03 → 2026-11-21'], ['Site', 'Example site']])] } },
      { id: 'ex3', example: true, type: 'account', status: 'new', at: t(48), data: { customer: { name: 'Example person', company: 'Example signage company', email: 'example@example.com', type: 'Signage', customer: 'no' } } },
      { id: 'ex4', example: true, type: 'quote', status: 'quoted', at: t(96), data: { customer: { name: 'Example contact', company: 'Example engineering firm', email: 'example@example.com' }, lines: [line(pick('cone'), 50)] } }
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
    var url = (byId[current.id] || {}).url || DATA.products[0].url;   // a new product borrows any product page's frame
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
