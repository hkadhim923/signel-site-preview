/* Signel Services - account, prices, cart. No dependencies, no server.
 *
 *  account  demo sign-in kept in localStorage ('signel.account'); swapped for the real
 *           account system later. While signed in, /prices.json is loaded and priced items
 *           show their price everywhere.
 *  cart     localStorage ('signel.cart'): [{ key, id, sku, name, url, img, opts, qty }].
 *           Lines are "priced" (a price is known and the visitor is signed in) or "quote"
 *           (priced per order). Both go in the same cart; "Send request" emails the lot.
 *  views    product purchase box, product cards, the header badge, the cart drawer, /cart/
 *           and /login/. Every view re-renders from storage, so tabs stay in step.
 */
(function () {
  'use strict';
  var ROOT = document.documentElement.getAttribute('data-root') || '';
  var CART = 'signel.cart', ACCOUNT = 'signel.account';
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  // prices in the page's language: $25.00 on English pages, 25,00 $ on French ones
  var LOCALE = /^fr/.test(document.documentElement.lang || '') ? 'fr-CA' : 'en-CA';
  var money = function (n) { return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'CAD' }).format(n); };
  var read = function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  var write = function (k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  var T = {};                                                  // UI strings, from the page
  try { T = JSON.parse($('#shop-i18n').textContent); } catch (e) {}
  var t = function (k, n) { return String(T[k] || k).replace('{n}', n); };
  // an address in the page's language (shop-i18n routes: /cart/ is /panier/ on French pages)
  var R = function (p) { return ROOT + ((T.routes || {})[p] || p); };

  /* ---------- account + prices ---------- */
  var account = function () { return read(ACCOUNT, null); };
  var prices = null, pricesLoading = null;
  function loadPrices() {
    if (!account()) return Promise.resolve(null);
    if (prices) return Promise.resolve(prices);
    if (!pricesLoading) pricesLoading = fetch(ROOT + '/prices.json').then(function (r) { return r.json(); })
      .then(function (d) { prices = d; return d; }).catch(function () { return null; });
    return pricesLoading;
  }
  var priceOf = function (id, key) {
    var lp = key ? linePrice(key) : null;
    if (lp != null) return { min: lp, max: lp };
    return prices && prices[id] ? { min: prices[id][0], max: prices[id][1] || prices[id][0] } : null;
  };
  // the price of one exact version, when the price list has it (prices.json "lines":
  // { "<id>|<options as JSON>": price }, from the back end)
  var linePrice = function (key) { return prices && prices.lines && prices.lines[key] != null ? prices.lines[key] : null; };
  var priceText = function (p) { return p.max > p.min ? t('from') + ' ' + money(p.min) : money(p.min); };

  /* ---------- cart store ---------- */
  var cart = function () { return read(CART, []); };
  var save = function (lines) { write(CART, lines); render(); };
  var count = function (lines) { return lines.reduce(function (n, l) { return n + l.qty; }, 0); };
  function add(item) {
    var lines = cart(), hit = lines.filter(function (l) { return l.key === item.key; })[0];
    if (hit) hit.qty += item.qty; else lines.push(item);
    save(lines);
  }
  function setQty(key, qty) { save(cart().map(function (l) { if (l.key === key) l.qty = Math.max(1, qty); return l; })); }
  function remove(key) { save(cart().filter(function (l) { return l.key !== key; })); }

  /* ---------- totals ---------- */
  function totals(lines) {
    var out = { subtotal: 0, ranged: false, quoted: 0, hidden: 0, priced: 0 };
    lines.forEach(function (l) {
      var p = priceOf(l.id, l.key);
      if (p) { out.priced += l.qty; out.subtotal += p.min * l.qty; if (p.max > p.min) out.ranged = true; }
      else if (l.priced && !account()) out.hidden += l.qty;
      else out.quoted += l.qty;
    });
    return out;
  }

  /* ---------- line + summary markup (drawer and cart page share it) ---------- */
  function lineHtml(l, big) {
    var p = priceOf(l.id, l.key);
    var opts = (l.show || l.opts || []).map(function (o) { return '<span>' + esc(o[0]) + ': ' + esc(o[1]) + '</span>'; }).join('');
    var price = p ? '<span class="cl-unit">' + esc(priceText(p)) + ' <small>' + esc(t('each')) + '</small></span><b class="cl-total">' + esc(money(p.min * l.qty)) + (p.max > p.min ? '<sup>*</sup>' : '') + '</b>'
      : (l.priced && !account() ? '<a class="cl-tag cl-tag--login" href="' + R('/login/') + '">' + esc(t('login_for_price_short')) + '</a>' : '<span class="cl-tag">' + esc(t('price_on_request_tag')) + '</span>');
    return '<li class="cl' + (big ? ' cl--big' : '') + '" data-key="' + esc(l.key) + '">' +
      '<a class="cl-img" href="' + ROOT + esc(l.url) + '">' + (l.img ? '<img src="' + ROOT + esc(l.img) + '" alt="" loading="lazy">' : '') + '</a>' +
      '<div class="cl-main"><a class="cl-name" href="' + ROOT + esc(l.url) + '">' + esc(l.name) + '</a>' +
      '<div class="cl-meta">' + (l.sku ? '<span>' + esc(t('code')) + ': ' + esc(l.sku) + '</span>' : '') + opts + '</div>' +
      '<div class="cl-row"><div class="qty qty--sm"><button type="button" data-line-dec aria-label="' + esc(t('decrease')) + '">&minus;</button>' +
      '<input type="number" min="1" value="' + l.qty + '" data-line-qty aria-label="' + esc(t('quantity')) + '"><button type="button" data-line-inc aria-label="' + esc(t('increase')) + '">+</button></div>' +
      '<button type="button" class="cl-remove" data-line-remove>' + esc(t('remove')) + '</button></div></div>' +
      '<div class="cl-price">' + price + '</div></li>';
  }

  function summaryHtml(lines, page) {
    var s = totals(lines), n = count(lines);
    var rows = '<div class="cs-row"><span>' + esc(n === 1 ? t('item') : t('items', n)) + '</span></div>';
    if (s.priced) rows += '<div class="cs-row cs-sub"><span>' + esc(s.ranged ? t('subtotal_from') : t('subtotal')) + '</span><b>' + esc(money(s.subtotal)) + '</b></div>';
    if (s.quoted) rows += '<div class="cs-row cs-q"><span class="cl-tag">' + esc(t('quoted_count', s.quoted)) + '</span></div>';
    if (s.hidden) rows += '<div class="cs-row cs-q"><a class="cl-tag cl-tag--login" href="' + R('/login/') + '">' + esc(t('hidden_count', s.hidden)) + '</a></div>';
    var note = '<p class="cs-note">' + esc(t('taxes')) + (s.ranged ? ' ' + esc('* ' + t('range_note')) : '') + '</p>';
    var actions = page
      ? '<button type="button" class="ui-btn ui-btn--primary ui-btn--app ui-btn--full" data-send>' + esc(t('send_request')) + '</button><p class="cs-hint">' + esc(t('send_hint')) + '</p>' +
        (s.hidden ? '<a class="ui-btn ui-btn--outline ui-btn--app ui-btn--full" href="' + R('/login/') + '">' + esc(t('login_cta')) + '</a>' : '') +
        '<div class="cs-links"><a href="' + R('/products/') + '">' + esc(t('continue')) + '</a><button type="button" class="linkish" data-clear>' + esc(t('clear')) + '</button></div>'
      : '<a class="ui-btn ui-btn--primary ui-btn--app ui-btn--full" href="' + R('/cart/') + '">' + esc(t('view_cart')) + '</a><button type="button" class="ui-btn ui-btn--outline ui-btn--app ui-btn--full" data-cart-close>' + esc(t('continue')) + '</button>';
    return (page ? '<h2>' + esc(t('summary')) + '</h2>' : '') + rows + note + actions;
  }

  function emptyHtml() {
    return '<div class="cart-empty"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6h15l-1.5 9h-12z"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M6 6 5 3H2"/></svg>' +
      '<p class="cart-empty-t">' + esc(t('empty')) + '</p><p>' + esc(t('empty_hint')) + '</p><a class="ui-btn ui-btn--primary ui-btn--app ui-btn--full" href="' + R('/products/') + '">' + esc(t('browse')) + '</a></div>';
  }

  /* ---------- render everything that shows the cart or prices ---------- */
  function render() {
    var lines = cart(), n = count(lines), acc = account();
    $$('[data-cart-badge]').forEach(function (b) { b.textContent = n; b.hidden = !n; });
    $$('[data-cart-count]').forEach(function (b) { b.textContent = n ? '(' + n + ')' : ''; });
    $$('[data-account-label]').forEach(function (el) { if (!el.dataset.orig) el.dataset.orig = el.textContent; el.textContent = acc ? (acc.name || acc.email).split(/[\s@]/)[0] : el.dataset.orig; });

    var drawer = $('[data-cart-drawer]');
    if (drawer) {
      $('[data-cart-lines]', drawer).innerHTML = n ? '<ul class="cl-list">' + lines.map(function (l) { return lineHtml(l, false); }).join('') + '</ul>' : emptyHtml();
      var foot = $('[data-cart-summary]', drawer); foot.innerHTML = n ? summaryHtml(lines, false) : ''; foot.hidden = !n;
    }
    var page = $('[data-cart-page]');
    if (page) {
      $('[data-cart-lines]', page).innerHTML = n ? '<ul class="cl-list">' + lines.map(function (l) { return lineHtml(l, true); }).join('') + '</ul>' : emptyHtml();
      var sum = $('[data-cart-summary]', page); sum.innerHTML = n ? summaryHtml(lines, true) : ''; sum.hidden = !n;
      page.classList.toggle('is-empty', !n);
    }
    // product cards: the price replaces "Log in for price" once signed in
    $$('.pcard[data-priced] [data-card-price]').forEach(function (el) {
      var p = priceOf(el.closest('.pcard').getAttribute('data-id'));
      el.textContent = p ? priceText(p) : t('login_for_price_short');
      el.classList.toggle('is-price', !!p);
    });
    $$('[data-buy]').forEach(paintBuy);
    $$('[data-pt]').forEach(paintTable);
  }

  /* ---------- drawer ---------- */
  var drawer = $('[data-cart-drawer]'), scrim = $('.cd-scrim'), lastFocus = null;
  function openDrawer() {
    if (!drawer) return;
    lastFocus = document.activeElement;
    render();
    scrim.hidden = false; drawer.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(function () { document.body.classList.add('cd-open'); drawer.focus(); });
  }
  function closeDrawer() {
    if (!drawer || !document.body.classList.contains('cd-open')) return;
    document.body.classList.remove('cd-open'); drawer.setAttribute('aria-hidden', 'true');
    setTimeout(function () { scrim.hidden = true; }, 250);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target : null; if (!el) return;
    if (el.closest('[data-cart-open]') && !$('[data-cart-page]')) { e.preventDefault(); openDrawer(); return; }
    if (el.closest('[data-cart-close]')) { closeDrawer(); return; }
    var line = el.closest('[data-key]');
    if (line) {
      var key = line.getAttribute('data-key'), qty = $('[data-line-qty]', line);
      if (el.closest('[data-line-dec]')) setQty(key, Number(qty.value) - 1);
      else if (el.closest('[data-line-inc]')) setQty(key, Number(qty.value) + 1);
      else if (el.closest('[data-line-remove]')) remove(key);
    }
    if (el.closest('[data-clear]')) save([]);
    if (el.closest('[data-send]')) sendRequest();
  });
  document.addEventListener('change', function (e) {
    if (e.target.matches && e.target.matches('[data-line-qty]')) setQty(e.target.closest('[data-key]').getAttribute('data-key'), parseInt(e.target.value, 10) || 1);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });

  /* ---------- product purchase box ---------- */
  function boxState(box) {
    var groups = $$('[data-opt]', box).map(function (g) {
      var sel = $('select', g), checked = $('input:checked', g);
      return { el: g, key: g.getAttribute('data-opt'), value: sel ? sel.value : (checked ? checked.value : '') };
    });
    var variants = null; try { variants = JSON.parse(($('[data-variants]', box) || {}).textContent || 'null'); } catch (e) {}
    return { groups: groups, variants: variants };
  }
  // A value is possible if some existing combination has it along with every other chosen value.
  function possible(variants, groups, key, value) {
    if (!variants) return true;
    return variants.some(function (v) {
      if (v[key] !== value) return false;
      return groups.every(function (g) { return g.key === key || !g.value || v[g.key] === g.value; });
    });
  }
  function paintBuy(box) {
    var s = boxState(box);
    s.groups.forEach(function (g) {
      $('[data-opt-val]', g.el).textContent = g.value ? ': ' + g.value : '';
      $$('input[type=radio], option', g.el).forEach(function (inp) {
        if (!inp.value) return;
        var ok = possible(s.variants, s.groups, g.key, inp.value);
        inp.disabled = !ok && inp.value !== g.value;
        var chip = inp.closest('.pbox-chip'); if (chip) chip.classList.toggle('is-off', !ok);
      });
    });
    var slot = $('[data-price-slot]', box), note = $('[data-price-note]', box),
        text = $('[data-price-text]', box) || (box.nextElementSibling && $('[data-price-text]', box.nextElementSibling)) || document.createElement('p');   // the line sits under the card
    if (box.hasAttribute('data-priced')) {
      var p = priceOf(box.getAttribute('data-id'));
      if (p) { slot.textContent = p.max > p.min ? money(p.min) + ' – ' + money(p.max) : money(p.min); note.hidden = !(p.max > p.min); text.hidden = true; }
      else { slot.innerHTML = '<a href="' + R('/login/') + '">' + esc(t('login_for_price')) + '</a>'; note.hidden = true; text.hidden = false; }
    }
  }
  /* ---------- price table and size run (src/components/price-table.js) ---------- */
  function paintHead(box) {
    if (!box.hasAttribute('data-priced')) return;
    var slot = $('[data-price-slot]', box), note = $('[data-price-note]', box), p = priceOf(box.getAttribute('data-id'));
    if (p) { slot.textContent = p.max > p.min ? money(p.min) + ' – ' + money(p.max) : money(p.min); note.hidden = !(p.max > p.min); }
    else { slot.innerHTML = '<a href="' + R('/login/') + '">' + esc(t('login_for_price')) + '</a>'; note.hidden = true; }
  }
  var keyOf = function (box, line) { return box.getAttribute('data-id') + '|' + line.getAttribute('data-line'); };
  var qtyOf = function (line) { return Math.max(0, parseInt($('[data-q]', line).value, 10) || 0); };
  function paintTable(box) {
    paintHead(box);
    var any = false;
    $$('.pt-line', box).forEach(function (line) {
      var cell = $('[data-line-price]', line), lp = linePrice(keyOf(box, line));
      if (cell) { cell.hidden = lp == null; cell.textContent = lp == null ? '' : money(lp); }
      if (lp != null) any = true;
    });
    $$('th[data-line-price]', box).forEach(function (th) { th.hidden = !any; });
    sumTable(box);
  }
  function sumTable(box) {
    var lines = $$('.pt-line', box).filter(function (l) { return qtyOf(l) > 0; }), n = 0, total = 0, known = true;
    lines.forEach(function (l) {
      var q = qtyOf(l), p = priceOf(box.getAttribute('data-id'), keyOf(box, l)); n += q;
      if (p && p.min === p.max) total += p.min * q; else known = false;
      l.classList.add('is-on');
    });
    $$('.pt-line', box).forEach(function (l) { if (!qtyOf(l)) l.classList.remove('is-on'); });
    var sum = $('[data-pt-sum]', box), btn = $('[data-pt-add]', box), label = $('span', btn);
    sum.textContent = !lines.length ? sum.getAttribute('data-hint')
      : (lines.length === 1 ? (n === 1 ? t('line_sum_one') : t('line_sum', n)) : t('lines_sum', n).replace('{l}', lines.length)) + (known && total ? ' · ' + money(total) : '');
    sum.classList.toggle('is-on', !!lines.length);
    btn.disabled = !lines.length;
    if (!btn.classList.contains('is-added')) label.textContent = lines.length > 1 ? t('add_lines', lines.length) : t('add_to_cart');
  }
  $$('[data-pt]').forEach(function (box) {
    box.addEventListener('click', function (e) {
      var step = e.target.closest('[data-q-dec], [data-q-inc]');
      if (step) {
        var inp = $('[data-q]', step.parentNode), q = parseInt(inp.value, 10) || 0;
        q = step.hasAttribute('data-q-inc') ? q + 1 : Math.max(0, q - 1);
        inp.value = q || ''; sumTable(box); return;
      }
      var chip = e.target.closest('[data-pt-filter]');
      if (chip) {
        var g = chip.getAttribute('data-pt-filter');
        $$('[data-pt-filter]', box).forEach(function (c) { c.classList.toggle('on', c === chip); });
        $$('tbody[data-group]', box).forEach(function (b) { b.hidden = !!g && b.getAttribute('data-group') !== g; });
        return;
      }
      var btn = e.target.closest('[data-pt-add]'); if (!btn || btn.disabled) return;
      // settings (chosen once for the order, e.g. the display language) go on every line
      var set = {}, setShow = [], missing = null;
      $$('[data-pt-set]', box).forEach(function (fs) {
        var c = $('input:checked', fs), err = $('[data-pt-set-err]', fs);
        if (c) { set[fs.getAttribute('data-pt-set')] = c.value; setShow.push([fs.getAttribute('data-label'), c.getAttribute('data-label')]); } else if (!missing) missing = fs;
        err.hidden = !!c; fs.classList.toggle('is-bad', !c);
      });
      if (missing) { missing.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      var added = 0;
      $$('.pt-line', box).forEach(function (l) {
        var q = qtyOf(l); if (!q) return;
        var opts = JSON.parse(l.getAttribute('data-line')).map(function (o) { return o[1] == null ? [o[0], set[o[0]]] : o; });
        var show = l.hasAttribute('data-show') ? JSON.parse(l.getAttribute('data-show')).concat(setShow) : null;
        add({ key: box.getAttribute('data-id') + '|' + JSON.stringify(opts), id: box.getAttribute('data-id'), show: show, sku: box.getAttribute('data-sku'), name: box.getAttribute('data-name'),
              url: box.getAttribute('data-url'), img: box.getAttribute('data-img'), priced: box.hasAttribute('data-priced'), opts: opts, qty: q });
        $('[data-q]', l).value = ''; added++;
      });
      if (!added) return;
      btn.classList.add('is-added'); var label = $('span', btn); label.textContent = t('added');
      setTimeout(function () { btn.classList.remove('is-added'); sumTable(box); }, 1600);
      sumTable(box); openDrawer();
    });
    box.addEventListener('input', function (e) { if (e.target.matches('[data-q]')) sumTable(box); });
    box.addEventListener('change', function (e) {
      var fs = e.target.closest('[data-pt-set]'); if (!fs) return;
      fs.classList.remove('is-bad'); $('[data-pt-set-err]', fs).hidden = true;
    });
    box.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.matches('[data-q]')) { e.preventDefault(); var b = $('[data-pt-add]', box); if (!b.disabled) b.click(); } });
  });

  /* ---------- rent or buy (src/components/rent-compare.js) ---------- */
  $$('[data-rb]').forEach(function (rb) {
    rb.addEventListener('click', function (e) {
      var tab = e.target.closest('[data-rb-tab]');
      if (tab) {
        var name = tab.getAttribute('data-rb-tab');
        $$('[data-rb-tab]', rb).forEach(function (b) { b.setAttribute('aria-selected', b === tab ? 'true' : 'false'); });
        $$('[data-rb-pane]', rb).forEach(function (p) { p.hidden = p.getAttribute('data-rb-pane') !== name; });
        rb.classList.toggle('is-rent', name === 'rent');
        return;
      }
      var btn = e.target.closest('[data-rent-add]'); if (!btn) return;
      var box = $('[data-rent]', rb), from = $('[data-rent-from]', box).value, to = $('[data-rent-to]', box).value, site = $('[data-rent-site]', box).value.trim();
      var err = $('[data-rent-err]', box);
      if (!from || !to || to < from) { err.hidden = false; $('[data-rent-from]', box).focus(); return; }
      err.hidden = true;
      var opts = [[t('rent_line'), from + ' → ' + to]]; if (site) opts.push([t('rent_where'), site]);
      add({ key: box.getAttribute('data-id') + '|rent|' + JSON.stringify(opts), id: box.getAttribute('data-id'), sku: box.getAttribute('data-sku'), name: box.getAttribute('data-name'),
            url: box.getAttribute('data-url'), img: box.getAttribute('data-img'), priced: false, rental: true, opts: opts, qty: Math.max(1, parseInt($('[data-rent-qty]', box).value, 10) || 1) });
      btn.classList.add('is-added'); var label = $('span', btn), was = label.textContent; label.textContent = t('added');
      setTimeout(function () { btn.classList.remove('is-added'); label.textContent = was; }, 1600);
      openDrawer();
    });
    rb.addEventListener('change', function (e) {
      if (e.target.matches('[data-rent-from]')) { var to = $('[data-rent-to]', rb); to.min = e.target.value; if (to.value && to.value < e.target.value) to.value = e.target.value; }
    });
  });

  /* ---------- model comparison: only the rows where models differ ---------- */
  $$('[data-cmp]').forEach(function (c) {
    var sw = $('[data-cmp-diff]', c);
    sw.addEventListener('change', function () { c.classList.toggle('is-diff-only', sw.checked); });
  });

  $$('[data-buy]').forEach(function (box) {
    var qty = $('input[name=qty]', box);
    box.addEventListener('change', function (e) {
      if (e.target.closest('[data-opt]')) { var err = $('[data-opt-err]', e.target.closest('[data-opt]')); if (err) err.hidden = true; paintBuy(box); }
    });
    box.addEventListener('click', function (e) {
      if (e.target.closest('[data-qty-dec]')) qty.value = Math.max(1, (parseInt(qty.value, 10) || 1) - 1);
      if (e.target.closest('[data-qty-inc]')) qty.value = (parseInt(qty.value, 10) || 1) + 1;
      var btn = e.target.closest('[data-add-to-cart]'); if (!btn) return;
      var s = boxState(box), missing = s.groups.filter(function (g) { return !g.value; });
      missing.forEach(function (g) { $('[data-opt-err]', g.el).hidden = false; });
      if (missing.length) { missing[0].el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      var opts = s.groups.map(function (g) { return [g.key, g.value]; });
      // the same choices as the page shows them (its language), for the cart's lines
      var show = s.groups.map(function (g) {
        var leg = $('legend', g.el), name = leg ? leg.firstChild.textContent.trim() : g.key;
        var sel = $('select', g.el), lab = sel ? sel.options[sel.selectedIndex].text : (($('input:checked + span', g.el) || {}).textContent || g.value);
        return [name, lab.trim()];
      });
      add({ key: box.getAttribute('data-id') + '|' + JSON.stringify(opts), id: box.getAttribute('data-id'), sku: box.getAttribute('data-sku'),
            name: box.getAttribute('data-name'), url: box.getAttribute('data-url'), img: box.getAttribute('data-img'),
            priced: box.hasAttribute('data-priced'), opts: opts, show: show, qty: Math.max(1, parseInt(qty.value, 10) || 1) });
      btn.classList.add('is-added'); var label = $('span', btn), was = label.textContent; label.textContent = t('added');
      setTimeout(function () { btn.classList.remove('is-added'); label.textContent = was; }, 1600);
      openDrawer();
    });
  });

  /* ---------- long description fold ---------- */
  $$('[data-fold-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var box = b.closest('[data-fold]'), open = box.classList.toggle('is-open');
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      // a block may name its own labels ("Read more" for the short description)
      b.textContent = open ? (b.getAttribute('data-less') || t('read_less_desc')) : (b.getAttribute('data-more') || t('read_more_desc'));
      if (!open) box.scrollIntoView({ block: 'nearest' });
    });
  });

  /* ---------- description fold: the description under the price card shows down to where
     the pictures column ends (then "Read more"), so Related products follows the product
     instead of a long column of text. Phones fold at a fixed height. ---------- */
  function fitFolds() {
    $$('[data-fold-auto]').forEach(function (box) {
      var rich = $('.rich', box), btn = $('[data-fold-toggle]', box), gal = $('.product .pgal');
      if (!rich || box.classList.contains('is-open')) return;
      var wide = window.matchMedia('(min-width: 1101px)').matches;
      var room = wide && gal ? gal.getBoundingClientRect().bottom - rich.getBoundingClientRect().top : 220;
      room = Math.max(wide ? 150 : 220, Math.round(room));
      var fits = rich.scrollHeight <= room + 90;   // never fold away just a line or two
      box.classList.toggle('is-folded', !fits);
      btn.hidden = fits;
      rich.style.setProperty('--fold', room + 'px');
    });
  }
  if ($('[data-fold-auto]')) {
    fitFolds();
    window.addEventListener('load', fitFolds);
    window.addEventListener('resize', function () { clearTimeout(fitFolds.t); fitFolds.t = setTimeout(fitFolds, 150); });
    $$('.product .pgal img').forEach(function (im) { if (!im.complete) im.addEventListener('load', fitFolds); });
  }

  /* ---------- send the cart: an email with every line ---------- */
  function sendRequest() {
    var lines = cart(), acc = account(), s = totals(lines);
    var body = lines.map(function (l) {
      var p = priceOf(l.id, l.key);
      return l.qty + ' x ' + (l.sku ? l.sku + ' - ' : '') + l.name +
        ((l.show || l.opts) && (l.show || l.opts).length ? ' (' + (l.show || l.opts).map(function (o) { return o[0] + ': ' + o[1]; }).join(', ') + ')' : '') +
        ' - ' + (p ? priceText(p) + ' ' + t('each') : t('price_on_request_tag')) + '\n   ' + location.origin + ROOT + l.url;
    }).join('\n\n');
    if (s.priced) body += '\n\n' + (s.ranged ? t('subtotal_from') : t('subtotal')) + ': ' + money(s.subtotal);
    if (acc) body += '\n\n' + [acc.name, acc.company, acc.email, acc.phone].filter(Boolean).join('\n');
    if (window.signelRequest) window.signelRequest(lines.some(function (l) { return l.rental; }) ? 'rental' : 'quote', {
      customer: acc || null, total: s.priced ? s.subtotal : null,
      lines: lines.map(function (l) { var p = priceOf(l.id, l.key); return { id: l.id, sku: l.sku, name: l.name, url: l.url, img: l.img, qty: l.qty, opts: l.opts || [], rental: !!l.rental, price: p ? p.min : null }; })
    });
    location.href = 'mailto:' + (T.email || '') + '?subject=' + encodeURIComponent(t('request_subject') + ' (' + count(lines) + ')') + '&body=' + encodeURIComponent(body);
  }

  /* ---------- login page ---------- */
  var auth = $('[data-auth]');
  if (auth) {
    if (location.hash === '#register') { location.replace(R('/create-account/') + location.search); return; }   // old links to the sign-up tab
    var showTab = function (name) {
      $$('[data-auth-tab]', auth).forEach(function (b) { if (b.getAttribute('role') === 'tab') b.setAttribute('aria-selected', b.getAttribute('data-auth-tab') === name ? 'true' : 'false'); });
      $$('[data-auth-form]', auth).forEach(function (f) { f.hidden = f.getAttribute('data-auth-form') !== name; });
    };
    var paintAuth = function () {
      var acc = account();
      $('.auth-tabs', auth).hidden = !!acc;
      if (acc) $$('[data-auth-form]', auth).forEach(function (f) { f.hidden = true; });
      else showTab('login');
      $('[data-auth-done]', auth).hidden = !acc;
      if (acc) $('[data-auth-name]', auth).textContent = acc.name || acc.email;
    };
    auth.addEventListener('click', function (e) {
      var tab = e.target.closest('[data-auth-tab]'); if (tab) { showTab(tab.getAttribute('data-auth-tab')); return; }
      if (e.target.closest('[data-logout]')) { write(ACCOUNT, null); prices = null; pricesLoading = null; paintAuth(); render(); }
    });
    $$('[data-auth-form]', auth).forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var ok = true;
        $$('input[required]', form).forEach(function (inp) {
          var bad = !inp.value.trim() || (inp.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inp.value.trim()));
          inp.classList.toggle('is-bad', bad);
          var msg = inp.parentNode.querySelector('.af-err');
          if (bad && !msg) { msg = document.createElement('small'); msg.className = 'af-err'; inp.parentNode.appendChild(msg); }
          if (msg) msg.textContent = bad ? (inp.value.trim() ? t('bad_email') : t('required')) : '';
          if (bad) ok = false;
        });
        if (!ok) return;
        var f = new FormData(form);
        write(ACCOUNT, { email: f.get('email'), name: f.get('name') || '', company: f.get('company') || '', phone: f.get('phone') || '' });
        loadPrices().then(function () {
          var next = new URLSearchParams(location.search).get('next');
          if (next && next.charAt(0) === '/') location.href = ROOT + next; else { paintAuth(); render(); }
        });
      });
    });
    window.addEventListener('hashchange', paintAuth);
    paintAuth();
  }

  // Other tabs changing the cart or the account
  window.addEventListener('storage', function (e) { if (e.key === CART || e.key === ACCOUNT) { prices = null; pricesLoading = null; loadPrices().then(render); } });

  render();
  loadPrices().then(render);
})();
