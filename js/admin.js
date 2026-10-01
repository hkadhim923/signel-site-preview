/* Signel Services — admin (src/pages/admin.js). Demo sign-in, then the product dashboard:
   list, search, add and edit products. Changes are kept in this browser (localStorage
   'signel.admin.changes') and exported as catalog.json, the file the build applies
   (src/model/catalog-edits.js). A back end will replace the demo sign-in and save changes
   itself, in the same format. */
(function () {
  'use strict';
  var ROOT = document.documentElement.getAttribute('data-root') || '';
  var SESSION = 'signel.admin.session', CHANGES = 'signel.admin.changes';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
  var store = {
    get: function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
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
  var current = null;   // { id, isNew }

  fetch(ROOT + '/admin/catalog-data.json').then(function (r) { return r.json(); }).then(function (d) {
    DATA = d;
    d.products.forEach(function (p) { byId[p.id] = p; });
    d.categories.forEach(function (c) { catById[c.id] = c; });
    $('[data-admin-cat]').insertAdjacentHTML('beforeend', d.categories.map(function (c) { return '<option value="' + c.id + '">' + esc(c.path) + '</option>'; }).join(''));
    renderList(); paintCount();
    var want = new URLSearchParams(location.search).get('edit');
    if (want) open(Number(want));
  });

  /* ---------- the product list ---------- */
  function allProducts() {
    var news = changes.new.map(function (n) { return Object.assign({ isNew: true }, n); });
    return news.concat(DATA.products);
  }
  function view(p) { return p.isNew ? p : Object.assign({}, p, changes.products[p.id] || {}); }
  function isChanged(p) { return p.isNew || !!changes.products[p.id]; }
  function renderList() {
    var q = norm($('[data-admin-search]').value).trim(), cat = Number($('[data-admin-cat]').value) || 0, only = $('[data-admin-only-changed]').checked;
    var list = allProducts().filter(function (p) {
      var v = view(p);
      if (only && !isChanged(p)) return false;
      if (cat && (v.categories || []).indexOf(cat) < 0) return false;
      return !q || norm(v.name + ' ' + v.sku + ' ' + (v.internalId || '') + ' ' + v.id).indexOf(q) >= 0;
    });
    $('[data-admin-listcount]').textContent = list.length + ' products' + (list.length > 300 ? ' (first 300 shown; search to narrow)' : '');
    $('[data-admin-rows]').innerHTML = list.slice(0, 300).map(function (p) {
      var v = view(p);
      return '<li><button type="button" data-admin-open="' + p.id + '" class="' + (current && current.id === p.id ? 'on' : '') + '">' +
        (v.images && v.images[0] ? '<img src="' + esc(src(v.images[0])) + '" alt="" loading="lazy">' : '<span class="adm-noimg"></span>') +
        '<span class="adm-row-t"><b>' + esc(v.name) + '</b><small>' + esc(v.sku || 'no SKU') + (v.internalId ? ' · ' + esc(v.internalId) : '') + '</small></span>' +
        (p.isNew ? '<em class="adm-tag adm-tag--new">new</em>' : isChanged(p) ? '<em class="adm-tag">edited</em>' : '') + (v.hidden ? '<em class="adm-tag adm-tag--off">hidden</em>' : '') + '</button></li>';
    }).join('');
  }
  var src = function (s) { return /^(data:|https?:)/.test(s) ? s : ROOT + s; };
  // the search box redraws as you type ('input' only: its 'change' fires on the click that
  // leaves it, and redrawing then would swallow that click on a row)
  $('[data-admin-search]').addEventListener('input', renderList);
  $('[data-admin-cat]').addEventListener('change', renderList);
  $('[data-admin-only-changed]').addEventListener('change', renderList);
  $('[data-admin-rows]').addEventListener('click', function (e) { var b = e.target.closest('[data-admin-open]'); if (b) open(Number(b.getAttribute('data-admin-open'))); });
  $('[data-admin-new]').addEventListener('click', function () {
    // after every id in use: the catalogue's own (products added before) and this browser's
    var ids = changes.new.map(function (n) { return n.id; }).concat(DATA.products.map(function (p) { return p.id; }));
    var id = Math.max.apply(null, [Number(app.getAttribute('data-new-id-from')) - 1].concat(ids)) + 1;
    changes.new.unshift({ id: id, name: 'New product', sku: '', internalId: '', categories: [], description: '', priceStyle: 'auto', images: [], documents: [],
                          options: [], specs: [], weight: '', dimensions: { length: '', width: '', height: '' }, pricing: { mode: 'quote', price: '', priceMax: '' } });
    save(); open(id);
  });

  /* ---------- the editor ---------- */
  var EMPTY = $('[data-admin-editor]').innerHTML;   // the "choose a product" panel, restored on close
  function closeEditor() {
    current = null; closePreview();
    $('[data-admin-editor]').innerHTML = EMPTY;
    var u = new URL(location.href); u.searchParams.delete('edit'); history.replaceState(null, '', u);
    renderList();
  }
  function find(id) { return changes.new.filter(function (n) { return n.id === id; })[0] || byId[id]; }
  function open(id) {
    var p = find(id); if (!p) return;
    var isNew = !byId[id];
    current = { id: id, isNew: isNew };
    var v = isNew ? p : Object.assign({}, p, changes.products[id] || {});
    var u = new URL(location.href); u.searchParams.set('edit', id); history.replaceState(null, '', u);
    $('[data-admin-editor]').innerHTML = editorHtml(v, isNew);
    bindEditor(v);
    renderList();
  }

  function row(cls, inner) { return '<div class="adm-rowedit ' + cls + '">' + inner + '<button type="button" class="adm-x" data-del title="Remove">×</button></div>'; }
  function imgRow(s) { return row('adm-img-row', '<img src="' + esc(src(s)) + '" alt=""><input type="text" value="' + esc(/^data:/.test(s) ? '(file from this computer)' : s) + '" data-img' + (/^data:/.test(s) ? ' data-file="' + esc(s) + '" readonly' : '') + '><button type="button" class="adm-mini" data-up title="Move up">↑</button>'); }
  function docRow(d) {
    return row('adm-doc-row', '<select data-doc-type>' + DATA.docTypes.map(function (t) { return '<option' + (t === d.type ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select>' +
      '<input type="text" placeholder="Label (optional)" value="' + esc(d.label || '') + '" data-doc-label>' +
      '<input type="text" placeholder="/files/... or https://..." value="' + esc(/^data:/.test(d.href) ? '(file from this computer)' : d.href) + '" data-doc-href' + (/^data:/.test(d.href) ? ' data-file="' + esc(d.href) + '" readonly' : '') + '>' +
      '<select data-doc-lang><option value="en"' + (d.lang !== 'fr' ? ' selected' : '') + '>EN</option><option value="fr"' + (d.lang === 'fr' ? ' selected' : '') + '>FR</option></select>');
  }
  function pairRow(kind, o) { return row('adm-pair-row', '<input type="text" placeholder="' + (kind === 'opt' ? 'Option, e.g. Colour' : 'Name, e.g. Material') + '" value="' + esc(o.label) + '" data-' + kind + '-label>' +
    '<input type="text" placeholder="Values, separated by |  e.g. Amber | White" value="' + esc((o.values || []).join(' | ')) + '" data-' + kind + '-values>'); }

  function editorHtml(v, isNew) {
    var pr = v.pricing || { mode: 'quote' }, dm = v.dimensions || {};
    return '<form class="adm-form" data-admin-form>' +
      '<div class="adm-form-head"><div><p class="adm-muted adm-small">' + (isNew ? 'New product · id ' + v.id : 'Product id ' + v.id) + '</p><h2>' + esc(v.name) + '</h2></div>' +
      '<div class="adm-form-actions">' + (v.url && !isNew ? '<a class="adm-btn" href="' + ROOT + v.url + '" target="_blank" rel="noopener">View on site</a>' : '') +
      '<button type="button" class="adm-btn" data-preview-toggle aria-pressed="false">Preview</button>' +
      '<button type="button" class="adm-btn" data-revert>' + (isNew ? 'Delete' : 'Undo my changes') + '</button>' +
      '<button type="button" class="adm-btn" data-backup title="Keep a copy of every change made so far, to go back to it if anything breaks">Backup current version</button>' +
      '<button type="submit" class="adm-btn adm-btn--primary">Save</button>' +
      '<button type="button" class="adm-x" data-editor-close title="Close this product" aria-label="Close this product">×</button></div></div>' +
      '<p class="adm-saved" data-saved hidden>Saved in this browser. Export the changes to publish them.</p>' +

      sec('Product', '<div class="adm-grid3">' + fld('Name *', '<input type="text" name="name" required value="' + esc(v.name) + '">') +
        fld('SKU (product code)', '<input type="text" name="sku" value="' + esc(v.sku) + '">') +
        fld('Internal ID <small>(internal software)</small>', '<input type="text" name="internalId" value="' + esc(v.internalId || '') + '">') + '</div>' +
        '<label class="adm-check"><input type="checkbox" name="hidden"' + (v.hidden ? ' checked' : '') + '> Hidden: take this product off the site</label>') +

      sec('Categories *', '<p class="adm-muted adm-small">Where the product appears when clicking through the site. It also shows in every parent category and in search.</p>' +
        '<input type="search" class="adm-catsearch" placeholder="Filter categories" data-catfilter>' +
        '<div class="adm-cats" data-cats>' + DATA.categories.map(function (c) {
          return '<label style="padding-left:' + (c.depth * 16) + 'px" data-catpath="' + esc(norm(c.path)) + '"><input type="checkbox" value="' + c.id + '"' + ((v.categories || []).indexOf(c.id) >= 0 ? ' checked' : '') + '> ' + esc(c.name) + '</label>';
        }).join('') + '</div>') +

      sec('Pictures', '<p class="adm-muted adm-small">The first picture is the main one; the others make the gallery.</p><div data-imgs>' + (v.images || []).map(imgRow).join('') + '</div>' +
        '<div class="adm-add"><input type="text" placeholder="Picture address, e.g. /img/2026/05/photo.jpg" data-img-url><button type="button" class="adm-btn" data-img-add>Add</button>' +
        '<label class="adm-btn adm-file">Choose file…<input type="file" accept="image/*" data-img-file hidden></label></div>') +

      sec('Description', '<p class="adm-muted adm-small">One description, shown under the price card. On the page it folds with “Read more” where the pictures column ends.</p>' +
        fld('Description <small>(HTML: paragraphs, lists, headings)</small>', '<textarea name="description" rows="12">' + esc(v.description) + '</textarea>') +
        '<button type="button" class="adm-btn" data-preview>Preview description</button><div class="adm-preview rich" data-preview-out hidden></div>') +

      sec('Page display', '<p class="adm-muted adm-small">How the product page shows the price and the choices.</p>' +
        '<div class="adm-radio adm-display">' + [
          ['auto', 'Automatic', 'Now: ' + (STYLE_NAME[v.autoStyle] || STYLE_NAME.card)],
          ['card', 'Normal', 'The price card with option buttons and one Add to cart'],
          ['table', 'Price table', 'Every version on its own line, with a quantity box per line'],
          ['sizes', 'Size run', 'One quantity box per clothing size']
        ].map(function (o) { return '<label><input type="radio" name="priceStyle" value="' + o[0] + '"' + ((v.priceStyle || 'auto') === o[0] ? ' checked' : '') + '> <b>' + o[1] + '</b> <span class="adm-muted adm-small">' + o[2] + '</span></label>'; }).join('') + '</div>') +

      sec('Documents', '<p class="adm-muted adm-small">Shown under Additional information. Types set the label (product-sheet → “Product sheet”).</p><div data-docs>' + (v.documents || []).map(docRow).join('') + '</div>' +
        '<div class="adm-add"><button type="button" class="adm-btn" data-doc-add>Add a document by address</button><label class="adm-btn adm-file">Choose PDF…<input type="file" accept="application/pdf" data-doc-file hidden></label></div>') +

      sec('Options the customer chooses', '<p class="adm-muted adm-small">Each option needs at least two values. Colours named in English show as colour dots.</p><div data-opts>' + (v.options || []).map(function (o) { return pairRow('opt', o); }).join('') + '</div>' +
        '<button type="button" class="adm-btn" data-opt-add>Add an option</button>') +

      sec('Specifications', '<div data-specs>' + (v.specs || []).map(function (o) { return pairRow('spec', o); }).join('') + '</div><button type="button" class="adm-btn" data-spec-add>Add a specification</button>' +
        '<div class="adm-grid4">' + fld('Weight', '<input type="text" name="weight" value="' + esc(v.weight || '') + '">') +
        fld('Length', '<input type="text" name="length" value="' + esc(dm.length || '') + '">') + fld('Width', '<input type="text" name="width" value="' + esc(dm.width || '') + '">') +
        fld('Height', '<input type="text" name="height" value="' + esc(dm.height || '') + '">') + '</div>') +

      sec('Pricing', '<div class="adm-radio"><label><input type="radio" name="pmode" value="quote"' + (pr.mode !== 'priced' ? ' checked' : '') + '> Price on request (quoted per order)</label>' +
        '<label><input type="radio" name="pmode" value="priced"' + (pr.mode === 'priced' ? ' checked' : '') + '> Fixed price (shown to signed-in customers)</label></div>' +
        '<div class="adm-grid3" data-prices' + (pr.mode === 'priced' ? '' : ' hidden') + '>' + fld('Price (CAD)', '<input type="number" min="0" step="0.01" name="price" value="' + esc(pr.price) + '">') +
        fld('Up to (CAD) <small>(when options change the price)</small>', '<input type="number" min="0" step="0.01" name="priceMax" value="' + esc(pr.priceMax || '') + '">') + '</div>') +
      '<div class="adm-form-foot"><button type="submit" class="adm-btn adm-btn--primary">Save</button></div></form>';
  }
  function sec(t, inner) { return '<section class="adm-sec"><h3>' + t + '</h3>' + inner + '</section>'; }
  function fld(l, inner) { return '<label class="adm-fld"><span>' + l + '</span>' + inner + '</label>'; }

  function readFile(file, cb) {
    if (file.size > 3 * 1024 * 1024) { alert('This file is over 3 MB. Until the back end is connected, files travel inside the exported changes; please use a smaller file or put it on the site and add it by address.'); return; }
    var r = new FileReader(); r.onload = function () { cb(r.result); }; r.readAsDataURL(file);
  }

  function bindEditor(v) {
    var f = $('[data-admin-form]');
    f.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-del]')) { t.closest('.adm-rowedit').remove(); return; }
      if (t.closest('[data-up]')) { var r = t.closest('.adm-rowedit'); if (r.previousElementSibling) r.parentNode.insertBefore(r, r.previousElementSibling); return; }
      if (t.closest('[data-img-add]')) { var u = $('[data-img-url]', f); if (u.value.trim()) { $('[data-imgs]', f).insertAdjacentHTML('beforeend', imgRow(u.value.trim())); u.value = ''; } return; }
      if (t.closest('[data-doc-add]')) { $('[data-docs]', f).insertAdjacentHTML('beforeend', docRow({ type: 'product-sheet', href: '', lang: 'en' })); return; }
      if (t.closest('[data-opt-add]')) { $('[data-opts]', f).insertAdjacentHTML('beforeend', pairRow('opt', { label: '', values: [] })); return; }
      if (t.closest('[data-spec-add]')) { $('[data-specs]', f).insertAdjacentHTML('beforeend', pairRow('spec', { label: '', values: [] })); return; }
      if (t.closest('[data-preview]')) { var o = $('[data-preview-out]', f); o.innerHTML = f.description.value; o.hidden = !o.hidden; return; }
      if (t.closest('[data-editor-close]')) { closeEditor(); return; }
      if (t.closest('[data-preview-toggle]')) { app.classList.contains('is-preview') ? closePreview() : openPreview(); return; }
      if (t.closest('[data-backup]')) { backup(); return; }
      if (t.closest('[data-revert]')) {
        if (current.isNew) { if (!confirm('Delete this new product?')) return; changes.new = changes.new.filter(function (n) { return n.id !== current.id; }); }
        else delete changes.products[current.id];
        save(); var id = current.id; current = null;
        if (byId[id]) open(id); else { $('[data-admin-editor]').innerHTML = '<div class="adm-empty"><p>Deleted.</p></div>'; renderList(); }
      }
    });
    $('[data-img-file]', f).addEventListener('change', function (e) { var file = e.target.files[0]; if (file) readFile(file, function (d) { $('[data-imgs]', f).insertAdjacentHTML('beforeend', imgRow(d)); }); });
    $('[data-doc-file]', f).addEventListener('change', function (e) { var file = e.target.files[0]; if (file) readFile(file, function (d) { $('[data-docs]', f).insertAdjacentHTML('beforeend', docRow({ type: 'product-sheet', label: file.name.replace(/\.pdf$/i, ''), href: d, lang: 'en' })); }); });
    $('[data-catfilter]', f).addEventListener('input', function (e) { var q = norm(e.target.value); $$('[data-catpath]', f).forEach(function (l) { l.hidden = q && l.getAttribute('data-catpath').indexOf(q) < 0; }); });
    $$('input[name=pmode]', f).forEach(function (r) { r.addEventListener('change', function () { $('[data-prices]', f).hidden = f.pmode.value !== 'priced'; }); });
    f.addEventListener('submit', function (e) { e.preventDefault(); commit(f); });
    // the preview follows every edit (typing, adding or removing a row, a new file)
    ['input', 'change'].forEach(function (ev) { f.addEventListener(ev, schedulePreview); });
    f.addEventListener('click', function () { setTimeout(schedulePreview, 0); });
    new MutationObserver(schedulePreview).observe(f, { childList: true, subtree: true });
    if (app.classList.contains('is-preview')) schedulePreview();
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
      images: $$('[data-imgs] .adm-rowedit', f).map(function (r) { var i = $('[data-img]', r); return i.getAttribute('data-file') || i.value.trim(); }).filter(Boolean),
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
  function commit(f, quiet) {   // quiet: a backup saving first; an incomplete product is left out, said with a note
    var v = collect(f), problems = [];
    if (!v.name) problems.push('a name');
    if (!v.categories.length) problems.push('at least one category');
    if (v.pricing.mode === 'priced' && !(v.pricing.price > 0)) problems.push('a price (or choose “Price on request”)');
    var badOpt = pairs(f, 'opt').filter(function (o) { return o.values.length < 2; });
    if (badOpt.length) problems.push('two values or more for option “' + badOpt[0].label + '”');
    if (problems.length) {
      if (quiet) { toast('This product still needs ' + problems.join(', ') + ': its unsaved edits are not in the backup.'); return; }
      alert('Please add ' + problems.join(', ') + '.'); return;
    }
    if (current.isNew) {
      var n = changes.new.filter(function (x) { return x.id === current.id; })[0];
      Object.assign(n, v);
    } else {
      var orig = byId[current.id], patch = {};
      var sorted = function (a) { return (a || []).slice().sort(function (x, y) { return x - y; }); };
      FIELDS.forEach(function (k) {
        var diff = k === 'hidden' ? v.hidden : k === 'categories' ? !same(sorted(v[k]), sorted(orig[k])) : !same(v[k], orig[k]);
        if (diff) patch[k] = v[k];
      });
      if (Object.keys(patch).length) changes.products[current.id] = patch; else delete changes.products[current.id];
    }
    if (!save()) { alert('This browser could not keep the change (storage is full: probably large files). Export your changes now, then remove large files.'); return; }
    $('[data-saved]').hidden = false;
    $('.adm-form-head h2').textContent = v.name;
    renderList();
  }

  function save() { var ok = store.set(CHANGES, changes); paintCount(); return ok; }
  function paintCount() { $('[data-admin-count]').textContent = Object.keys(changes.products).length + changes.new.length; }

  /* ---------- export / import / review ---------- */
  $('[data-admin-export]').addEventListener('click', function () {
    var out = { _about: 'Changes from the Signel admin dashboard. Put this file at data/admin/catalog.json; the next build applies it (src/model/catalog-edits.js).', exported: new Date().toISOString(),
                products: changes.products, new: changes.new.map(function (n) { var c = Object.assign({}, n); delete c.isNew; return c; }) };
    var blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'catalog.json'; document.body.appendChild(a); a.click(); a.remove();
  });
  $('[data-admin-import]').addEventListener('change', function (e) {
    var file = e.target.files[0]; if (!file) return;
    var r = new FileReader();
    r.onload = function () {
      try { var d = JSON.parse(r.result); changes = { products: d.products || {}, new: d.new || [] }; save(); renderList(); alert('Imported ' + (Object.keys(changes.products).length + changes.new.length) + ' changed products.'); }
      catch (err) { alert('This is not a catalog.json file.'); }
    };
    r.readAsText(file);
  });
  $('[data-admin-changes]').addEventListener('click', function () {
    var list = changes.new.map(function (n) { return '<li><b>New</b> ' + esc(n.name) + ' <button type="button" class="adm-link" data-admin-open="' + n.id + '">edit</button></li>'; })
      .concat(Object.keys(changes.products).map(function (id) { return '<li><b>Edited</b> ' + esc((byId[id] || {}).name) + ': ' + esc(Object.keys(changes.products[id]).join(', ')) + ' <button type="button" class="adm-link" data-admin-open="' + id + '">edit</button></li>'; }));
    $('[data-admin-editor]').innerHTML = '<div class="adm-empty"><h2>Changes in this browser</h2>' + (list.length ? '<ul class="adm-changes">' + list.join('') + '</ul><p class="adm-muted">Export them to publish.</p>' : '<p>No changes yet.</p>') + '</div>';
    current = null; renderList();
  });
  $('[data-admin-editor]').addEventListener('click', function (e) { var b = e.target.closest('.adm-changes [data-admin-open]'); if (b) open(Number(b.getAttribute('data-admin-open'))); });

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

  /* ---------- backups: "Backup current version" keeps a copy of every change made so far
     (up to 20, in this browser) and downloads it with the published catalogue, so the
     dashboard can go back to it if anything breaks. Backups lists them to restore. ---------- */
  var BACKUPS = 'signel.admin.backups';
  function toast(msg) {
    var t = $('.adm-toast') || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'adm-toast', role: 'status' }));
    t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('on'); }, 3500);
  }
  function download(name, obj) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  function backup() {
    var f = $('[data-admin-form]');
    if (f && current) {
      var before = JSON.stringify(changes); commit(f, true);
      if (JSON.stringify(changes) !== before) toast('Your edits to this product were saved first.');
    }
    var n = Object.keys(changes.products).length + changes.new.length;
    var at = new Date(), snap = { id: at.getTime(), at: at.toISOString(), label: 'Backup of ' + at.toLocaleString('en-CA'), count: n, catalogBuilt: DATA.generated, changes: JSON.parse(JSON.stringify(changes)) };
    var list = store.get(BACKUPS, []); list.unshift(snap);
    var kept = store.set(BACKUPS, list.slice(0, 20));
    download('signel-backup-' + at.toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json',
             { kind: 'signel-admin-backup', at: snap.at, catalogBuilt: DATA.generated, changes: snap.changes, publishedCatalog: DATA.products });
    toast(kept ? 'Backup made (' + n + ' changed products) and downloaded.' : 'Backup downloaded (this browser is full, so it is not in the Backups list).');
  }
  $('[data-admin-backups]').addEventListener('click', showBackups);
  function showBackups() {
    closePreview(); current = null; renderList();
    var list = store.get(BACKUPS, []);
    $('[data-admin-editor]').innerHTML = '<div class="adm-empty adm-backups"><div class="adm-bk-head"><h2>Backups</h2><button type="button" class="adm-x" data-editor-close aria-label="Close">×</button></div>' +
      '<p class="adm-muted">Each backup is every change made in the dashboard at that moment. Restoring one replaces the current changes with it. Each is also downloaded as a file, with the whole catalogue as published then.</p>' +
      '<p><button type="button" class="adm-btn adm-btn--primary" data-backup>Backup current version</button> <label class="adm-btn adm-file">Restore from a file…<input type="file" accept="application/json" data-bk-file hidden></label></p>' +
      (list.length ? '<ul class="adm-bk-list">' + list.map(function (b) {
        return '<li><div><b>' + esc(b.label) + '</b><small>' + b.count + ' changed products · catalogue of ' + esc((b.catalogBuilt || '').slice(0, 16).replace('T', ' ')) + '</small></div>' +
          '<span><button type="button" class="adm-btn" data-bk-restore="' + b.id + '">Restore</button><button type="button" class="adm-btn" data-bk-download="' + b.id + '">Download</button><button type="button" class="adm-x" data-bk-delete="' + b.id + '" title="Delete this backup">×</button></span></li>';
      }).join('') + '</ul>' : '<p>No backups yet.</p>') +
      '<p class="adm-muted adm-small">The published website keeps every version it has had: see <button type="button" class="adm-link" data-go-versions>Website versions</button> to roll the whole site back.</p></div>';
    var box = $('.adm-backups');
    box.addEventListener('click', function (e) {
      var t = e.target, id;
      if (t.closest('[data-editor-close]')) return closeEditor();
      if (t.closest('[data-go-versions]')) return showVersions();
      if (t.closest('[data-backup]')) { backup(); return showBackups(); }
      var all = store.get(BACKUPS, []), pick = function (x) { return all.filter(function (b) { return String(b.id) === x; })[0]; };
      if ((id = t.getAttribute('data-bk-restore'))) {
        var b = pick(id); if (!b || !confirm('Replace the current changes with “' + b.label + '”? Make a backup first if you may want them back.')) return;
        changes = JSON.parse(JSON.stringify(b.changes)); save(); renderList(); toast('Restored: ' + b.label); return;
      }
      if ((id = t.getAttribute('data-bk-download'))) { var d = pick(id); if (d) download('signel-backup-' + id + '.json', { kind: 'signel-admin-backup', at: d.at, catalogBuilt: d.catalogBuilt, changes: d.changes }); return; }
      if ((id = t.getAttribute('data-bk-delete'))) { if (!confirm('Delete this backup?')) return; store.set(BACKUPS, all.filter(function (b) { return String(b.id) !== id; })); showBackups(); }
    });
    $('[data-bk-file]', box).addEventListener('change', function (e) {
      var file = e.target.files[0]; if (!file) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var d = JSON.parse(r.result), c = d.kind === 'signel-admin-backup' ? d.changes : d;
          if (!c || (!c.products && !c.new)) throw new Error('no changes');
          if (!confirm('Replace the current changes with the ones in this file?')) return;
          changes = { products: c.products || {}, new: c.new || [] }; save(); renderList(); toast('Restored from ' + file.name);
        } catch (err) { alert('This is not a Signel backup or catalog.json file.'); }
      };
      r.readAsText(file);
    });
  }

  /* ---------- website versions: every published version of the site, newest first, to roll
     the whole site back to (pages, products, prices). The list is real (the site's history,
     admin/versions.json); rolling back is switched on at launch, when a back end can restore a
     version. Until then the button explains that and changes nothing. ---------- */
  $('[data-admin-versions]').addEventListener('click', showVersions);
  function showVersions() {
    closePreview(); current = null; renderList();
    var ed = $('[data-admin-editor]');
    ed.innerHTML = '<div class="adm-empty adm-versions"><p class="adm-muted">Loading the versions…</p></div>';
    fetch(ROOT + '/admin/versions.json').then(function (r) { return r.json(); }).then(function (d) {
      var when = function (iso) { var t = new Date(iso); return t.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) + ' · ' + t.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' }); };
      ed.innerHTML = '<div class="adm-empty adm-versions"><div class="adm-bk-head"><h2>Website versions</h2><button type="button" class="adm-x" data-editor-close aria-label="Close">×</button></div>' +
        '<p class="adm-muted">Every version of the website that was published, newest first. Rolling back puts the whole site (pages, products, pictures, prices) back as it was in that version; the versions after it are kept, so a rollback can itself be undone.</p>' +
        '<p class="adm-launch">Rollback is switched on when the site goes live. Until then you can browse the versions; nothing is changed.</p>' +
        (d.versions.length ? '<ol class="adm-ver-list">' + d.versions.map(function (v, i) {
          return '<li' + (i ? '' : ' class="is-current"') + '><div><b>' + esc(v.title) + '</b><small>' + esc(when(v.at)) + ' · version ' + esc(v.id) + '</small></div>' +
            (i ? '<button type="button" class="adm-btn" data-roll="' + esc(v.id) + '">Roll back to this version</button>' : '<em class="adm-tag adm-tag--new">Live now</em>') + '</li>';
        }).join('') + '</ol>' : '<p>No versions available in this build.</p>') +
        '<dialog class="adm-dialog" data-roll-dialog><form method="dialog"><h3>Roll the website back?</h3><p data-roll-what></p>' +
        '<p class="adm-muted adm-small">The site will look and work exactly as it did in that version. Changes published since stay in the history and can be brought back with another rollback. Dashboard changes not yet published are not affected.</p>' +
        '<p class="adm-launch" data-roll-note hidden>Rollback is switched on when the site goes live. Nothing was changed.</p>' +
        '<div class="adm-dialog-actions"><button value="cancel" class="adm-btn">Cancel</button><button type="button" class="adm-btn adm-btn--danger" data-roll-confirm>Roll back</button></div></form></dialog></div>';
      var box = $('.adm-versions'), dlg = $('[data-roll-dialog]', box);
      box.addEventListener('click', function (e) {
        if (e.target.closest('[data-editor-close]')) return closeEditor();
        var b = e.target.closest('[data-roll]');
        if (b) {
          var v = d.versions.filter(function (x) { return x.id === b.getAttribute('data-roll'); })[0];
          $('[data-roll-what]', dlg).innerHTML = 'Back to <b>' + esc(v.title) + '</b>, published ' + esc(when(v.at));
          $('[data-roll-note]', dlg).hidden = true; $('[data-roll-confirm]', dlg).hidden = false;
          dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
        }
        if (e.target.closest('[data-roll-confirm]')) {
          // at launch: ask the back end to publish this version again (POST /api/versions/<id>/restore)
          $('[data-roll-note]', dlg).hidden = false; $('[data-roll-confirm]', dlg).hidden = true;
        }
      });
    }).catch(function () { ed.innerHTML = '<div class="adm-empty"><p>The list of versions could not be loaded.</p></div>'; });
  }
})();
