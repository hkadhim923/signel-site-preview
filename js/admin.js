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
  var FIELDS = ['name', 'sku', 'internalId', 'categories', 'highlights', 'summary', 'description', 'images', 'documents', 'options', 'specs', 'weight', 'dimensions', 'pricing', 'hidden'];
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
    changes.new.unshift({ id: id, name: 'New product', sku: '', internalId: '', categories: [], highlights: [], summary: '', description: '', images: [], documents: [],
                          options: [], specs: [], weight: '', dimensions: { length: '', width: '', height: '' }, pricing: { mode: 'quote', price: '', priceMax: '' } });
    save(); open(id);
  });

  /* ---------- the editor ---------- */
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
      '<button type="button" class="adm-btn" data-revert>' + (isNew ? 'Delete' : 'Undo my changes') + '</button><button type="submit" class="adm-btn adm-btn--primary">Save</button></div></div>' +
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

      sec('Short description', '<p class="adm-muted adm-small">The key points shown between the name and the price (“About this item”), one per line. Leave empty to show the automatic ones.</p>' +
        fld('Key points <small>(one per line, up to 5 is best)</small>', '<textarea name="highlights" rows="5" placeholder="' + esc((v.autoHighlights || []).join('\n')) + '">' + esc((v.highlights || []).join('\n')) + '</textarea>') +
        ((v.autoHighlights || []).length && !(v.highlights || []).length ? '<p class="adm-muted adm-small">Shown now (automatic, from the product’s existing text): the grey lines in the box. Type your own to replace them.</p>' : '')) +

      sec('Descriptions', fld('Summary <small>(optional opening sentence, shown above the key points)</small>', '<textarea name="summary" rows="3">' + esc(v.summary) + '</textarea>') +
        fld('Full description <small>(HTML; shown folded with “Read full description” when long)</small>', '<textarea name="description" rows="10">' + esc(v.description) + '</textarea>') +
        '<button type="button" class="adm-btn" data-preview>Preview description</button><div class="adm-preview rich" data-preview-out hidden></div>') +

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
      highlights: f.highlights.value.split('\n').map(function (t) { return t.trim(); }).filter(Boolean),
      summary: f.summary.value, description: f.description.value,
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
  function commit(f) {
    var v = collect(f), problems = [];
    if (!v.name) problems.push('a name');
    if (!v.categories.length) problems.push('at least one category');
    if (v.pricing.mode === 'priced' && !(v.pricing.price > 0)) problems.push('a price (or choose “Price on request”)');
    var badOpt = pairs(f, 'opt').filter(function (o) { return o.values.length < 2; });
    if (badOpt.length) problems.push('two values or more for option “' + badOpt[0].label + '”');
    if (problems.length) { alert('Please add ' + problems.join(', ') + '.'); return; }
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
})();
