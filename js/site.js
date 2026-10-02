/* Signel Services — site behaviour. No dependencies. */
(function () {
  'use strict';
  window.__signelSite = true;   // /diagnostics/ checks that this script arrived

  /* ---- mobile nav ---- */
  var burger = document.querySelector('.burger');
  var nav = document.querySelector('.nav');
  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  document.documentElement.classList.add('js');

  /* ---- mega menus (desktop). All three open on hover after a short delay, so crossing
     the header doesn't flash a panel. Products then stays open while the pointer wanders
     sideways in the header, so it can't vanish on the way to a category; it closes when
     the pointer moves below it onto the dimmed page, on the X, Esc, or another menu. Services and Solutions close after a short grace
     period, or as soon as the pointer moves onto the dimmed page. On touch, the first tap
     opens a panel instead of following the link. ---- */
  var menus = Array.prototype.slice.call(document.querySelectorAll('.has-menu'));
  if (menus.length) {
    var wide = window.matchMedia('(min-width: 861px)');
    var backdrop = document.createElement('div');
    backdrop.className = 'mega-backdrop';
    document.body.appendChild(backdrop);
    var current = null, openTimer = null, closeTimer = null, lastPointer = 'mouse';
    var setOpen = function (m, on) {
      m.classList.toggle('is-open', on);
      var a = m.querySelector(':scope > a'); if (a) a.setAttribute('aria-expanded', on ? 'true' : 'false');
    };
    var open = function (m) {
      clearTimeout(closeTimer); clearTimeout(openTimer);
      if (current && current !== m) setOpen(current, false);
      current = m; setOpen(m, true); backdrop.classList.add('on');
    };
    var close = function () {
      clearTimeout(openTimer); clearTimeout(closeTimer);
      if (current) setOpen(current, false);
      current = null; backdrop.classList.remove('on');
      if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.has-menu')) document.activeElement.blur();
    };
    document.addEventListener('pointerdown', function (e) { lastPointer = e.pointerType || 'mouse'; }, true);
    menus.forEach(function (m) {
      var sticky = m.hasAttribute('data-mega-sticky');
      m.addEventListener('mouseenter', function () {
        if (!wide.matches || lastPointer === 'touch') return;
        clearTimeout(closeTimer); clearTimeout(openTimer);
        openTimer = setTimeout(function () { open(m); }, current ? 0 : 150);   // switching between menus is instant
      });
      m.addEventListener('mouseleave', function () {
        if (!wide.matches || sticky) return;
        clearTimeout(openTimer);
        closeTimer = setTimeout(close, 250);
      });
      var link = m.querySelector(':scope > a');
      if (link) link.addEventListener('click', function (e) {
        if (wide.matches && lastPointer !== 'mouse' && current !== m) { e.preventDefault(); open(m); }
        // Phone menu: the first tap unfolds the list under the item, the second follows it.
        else if (!wide.matches && !m.classList.contains('is-open')) { e.preventDefault(); menus.forEach(function (o) { setOpen(o, o === m); }); }
      });
      var x = m.querySelector('[data-mega-close]');
      if (x) x.addEventListener('click', close);
    });
    backdrop.addEventListener('mouseenter', close);   // below the panel = done with the menu, Products included
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && current) close(); });
    wide.addEventListener('change', function () { menus.forEach(function (o) { setOpen(o, false); }); close(); });
  }

  /* ---- sticky header: shrink the logo once the page scrolls (signel.ca's sticky effect,
     offset 0) and publish the header's height as --head-h for sticky sidebars ---- */
  var head = document.querySelector('.site-head');
  if (head) {
    var root = document.documentElement, ticking = false;
    var sync = function () {
      ticking = false;
      head.classList.toggle('scrolled', window.pageYOffset > 0);
      var pinned = getComputedStyle(head).position === 'sticky';
      root.style.setProperty('--head-h', pinned ? head.offsetHeight + 'px' : '0px');
    };
    var onScroll = function () { if (!ticking) { ticking = true; requestAnimationFrame(sync); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    head.addEventListener('transitionend', onScroll);
    sync();
  }

  /* ---- background videos (the home header): the autoplay attribute alone can be held back
     (battery saver, a tab opened in the background, a slow start). Ask for playback
     ourselves, and again when the tab shows, the video can play, or on the first click, key
     or scroll; each refusal goes to the log with the browser's reason. ---- */
  Array.prototype.forEach.call(document.querySelectorAll('video[autoplay]'), function (v) {
    v.muted = true; v.playsInline = true;   // the property, not only the attribute: required to autoplay
    var reported = false;
    var kick = function (why) {
      if (!v.paused || document.visibilityState === 'hidden') return;
      var p = v.play();
      if (p && p.catch) p.catch(function (e) {
        if (!reported) { reported = true; (window.signelLog || function () {})('video', 'playback held back (' + why + '): ' + (e && e.name) + ' ' + (e && e.message)); }
      });
    };
    v.addEventListener('canplay', function () { kick('canplay'); });
    v.addEventListener('error', function () { (window.signelLog || function () {})('video', 'video error ' + (v.error && v.error.code)); });
    document.addEventListener('visibilitychange', function () { kick('tab shown'); });
    ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(function (t) {
      window.addEventListener(t, function () { kick(t); }, { once: true, passive: true });
    });
    setTimeout(function () { kick('4 s check'); if (v.readyState === 0) (window.signelLog || function () {})('video', 'no video data after 4 s (' + (v.currentSrc || 'no source chosen') + ')'); }, 4000);
    kick('page load');
  });

  /* ---- product page on a phone: the purchase box sits under the pictures, so a slim bar
     pinned to the bottom keeps the price (the same text as the box, updated with it) and a
     button that brings the box into view. It hides while the box itself is on screen. ---- */
  var buyBox = document.querySelector('.pinfo .pbox[data-buy], .pinfo .pbox[data-pt]');
  if (buyBox && 'IntersectionObserver' in window) {
    var slot = buyBox.querySelector('[data-price-slot]');
    var addBtn = buyBox.querySelector('[data-add-to-cart]');
    var bar = document.createElement('div');
    bar.className = 'pbar'; bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = '<span class="pbar-price"></span><button type="button" class="ui-btn ui-btn--primary ui-btn--app" tabindex="-1"></button>';
    var barPrice = bar.querySelector('.pbar-price'), barBtn = bar.querySelector('button');
    var paint = function () { barPrice.textContent = slot ? slot.textContent.trim() : ''; barBtn.textContent = addBtn ? addBtn.textContent.trim() : 'Buy'; };
    paint();
    if (slot && 'MutationObserver' in window) new MutationObserver(paint).observe(slot, { childList: true, subtree: true, characterData: true });
    barBtn.addEventListener('click', function () { buyBox.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    document.body.appendChild(bar);
    // shown while the price itself (not just the box's edge) is off screen
    new IntersectionObserver(function (es) { bar.classList.toggle('on', !es[0].isIntersecting); }).observe(slot || buyBox);
  }

  /* ---- careers: category filter over the job cards (signel.ca's "Tous / Administration /
     ..." strip). Without JavaScript every card simply stays visible. ---- */
  var jf = document.querySelector('[data-job-filters]');
  if (jf) {
    var cards = document.querySelectorAll('.tp-job');
    jf.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-cat]');
      if (!btn) return;
      var cat = btn.getAttribute('data-cat');
      jf.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b === btn); });
      cards.forEach(function (c) {
        c.hidden = cat !== '*' && (' ' + c.getAttribute('data-cats') + ' ').indexOf(' ' + cat + ' ') < 0;
      });
    });
  }

  /* ---- product gallery ---- */
  var gal = document.querySelector('.gallery');
  if (gal) {
    var main = gal.querySelector('.main img');
    gal.querySelectorAll('.thumbs button').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!main) return;
        main.src = b.getAttribute('data-src');
        main.alt = b.querySelector('img').alt;
        gal.querySelectorAll('.thumbs button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
      });
    });
  }

  /* ---- search (header + category filter) ---- */
  var ROOT = document.documentElement.getAttribute('data-root') || '';
  var index = null, loading = null;
  var log = window.signelLog || function () {};
  // The product list (~270 KB) search reads. A download that fails (a weak or filtered
  // network) is tried again 3 times, a moment apart, and a failure is not remembered: the
  // next search tries again instead of staying broken until the page is reloaded.
  function loadIndex() {
    if (index) return Promise.resolve(index);
    if (loading) return loading;
    var attempt = function (n) {
      return fetch(ROOT + '/search-index.json').then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).catch(function (e) {
        log('search-index', 'try ' + n + ' failed: ' + (e && e.message));
        if (n >= 3) throw e;
        return new Promise(function (ok) { setTimeout(ok, n * 1500); }).then(function () { return attempt(n + 1); });
      });
    };
    loading = attempt(1).then(function (d) { index = d; return d; }, function (e) { loading = null; throw e; });
    return loading;
  }
  window.addEventListener('online', function () { if (!index) loadIndex().catch(function () {}); });
  function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function score(item, q, terms) {
    var name = norm(item.n), sku = norm(item.s), cat = norm(item.c);
    if (sku && sku === q) return 100;
    if (sku && sku.indexOf(q) === 0) return 80;
    var s = 0;
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      if (name.indexOf(t) >= 0) s += 10; else if (sku.indexOf(t) >= 0) s += 8; else if (cat.indexOf(t) >= 0) s += 3; else return 0;
    }
    if (name.indexOf(q) >= 0) s += 15;
    return s;
  }
  function search(q, limit) {
    q = norm(q).trim();
    if (q.length < 2) return [];
    var terms = q.split(/\s+/);
    var out = [];
    for (var i = 0; i < index.length; i++) {
      var sc = score(index[i], q, terms);
      if (sc > 0) out.push([sc, index[i]]);
    }
    out.sort(function (a, b) { return b[0] - a[0] || a[1].n.localeCompare(b[1].n); });
    return out.slice(0, limit).map(function (x) { return x[1]; });
  }
  var box = document.querySelector('.search');
  if (box) {
    var input = box.querySelector('input');
    var results = box.querySelector('.search-results');
    var timer;
    function render(items) {
      if (!items.length) { results.classList.remove('open'); results.innerHTML = ''; return; }
      results.innerHTML = items.map(function (it) {
        var img = it.i ? '<img src="' + ROOT + it.i + '" alt="">' : '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="">';
        return '<a href="' + ROOT + it.u + '">' + img + '<span>' + esc(it.n) + '</span>' + (it.s ? '<span class="sku">' + esc(it.s) + '</span>' : '') + '</a>';
      }).join('');
      results.classList.add('open');
    }
    input.addEventListener('input', function () {
      clearTimeout(timer);
      var q = input.value;
      timer = setTimeout(function () { loadIndex().then(function () { render(search(q, 12)); }); }, 120);
    });
    input.addEventListener('focus', function () { loadIndex(); });
    document.addEventListener('click', function (e) { if (!box.contains(e.target)) results.classList.remove('open'); });
    box.addEventListener('submit', function (e) {
      e.preventDefault();
      location.href = ROOT + '/search/?q=' + encodeURIComponent(input.value);
    });
  }
  /* search results page */
  var page = document.querySelector('[data-search-page]');
  if (page) {
    var q = new URLSearchParams(location.search).get('q') || '';
    var qi = page.querySelector('input[name=q]'); if (qi) qi.value = q;
    var target = page.querySelector('.grid');
    var count = page.querySelector('[data-count]');
    var show = function () {
      if (count) count.textContent = '';
      loadIndex().then(function () {
        var items = search(q, 200);
        if (count) count.textContent = items.length + ' result' + (items.length === 1 ? '' : 's') + (q ? ' for "' + q + '"' : '');
        target.innerHTML = items.map(card).join('');
      }, function () {
        // never a silent empty page: say so, and offer to try again
        target.innerHTML = '<p class="search-failed">The product list could not be loaded (the connection may be weak). ' +
          '<button type="button" class="ui-btn ui-btn--outline" data-search-retry>Try again</button></p>';
      });
    };
    target.addEventListener('click', function (e) { if (e.target.closest('[data-search-retry]')) show(); });
    window.addEventListener('online', function () { if (target.querySelector('[data-search-retry]')) show(); });
    show();
  }
  /* client-side filter inside a category listing */
  var filter = document.querySelector('[data-filter]');
  if (filter) {
    var cards = Array.prototype.slice.call(document.querySelectorAll('.grid .pcard'));
    var empty = document.querySelector('[data-empty]');
    filter.addEventListener('input', function () {
      var q = norm(filter.value).trim();
      var shown = 0;
      cards.forEach(function (c) {
        var hit = !q || norm(c.getAttribute('data-name') + ' ' + c.getAttribute('data-sku')).indexOf(q) >= 0;
        c.style.display = hit ? '' : 'none'; if (hit) shown++;
      });
      if (empty) empty.style.display = shown ? 'none' : '';
    });
  }
  // Same markup as ProductCard (src/components/parts.js): contained square picture, name,
  // code, price status.
  function card(it) {
    var price = page ? page.getAttribute('data-price-label') || '' : '';
    var noimg = page ? page.getAttribute('data-noimg-label') || '' : '';
    var img = it.i ? '<img src="' + ROOT + it.i + '" alt="" loading="lazy" width="300" height="300">' : '<span>' + esc(noimg) + '</span>';
    return '<a class="pcard" href="' + ROOT + it.u + '"><div class="img' + (it.i ? '' : ' noimg') + '">' + img + '</div><div class="body"><h3>' + esc(it.n) + '</h3>' +
      '<div class="sku">' + (it.s ? esc(it.s) : '&nbsp;') + '</div>' + (price ? '<div class="price">' + esc(price) + '</div>' : '') + '</div></a>';
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---- forms: post JSON to the configured endpoint. Never pretend to succeed. ---- */
  document.querySelectorAll('form[data-form]').forEach(function (f) {
    var endpoint = f.getAttribute('data-endpoint') || document.documentElement.getAttribute('data-form-endpoint') || '';
    var msg = f.querySelector('.msg');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!f.checkValidity()) { f.reportValidity(); return; }
      var data = {}; new FormData(f).forEach(function (v, k) { data[k] = v; });
      data._form = f.getAttribute('data-form'); data._page = location.href;
      if (!endpoint) {
        msg.className = 'msg err';
        msg.textContent = 'This form is not connected yet. Please email ' + (f.getAttribute('data-fallback') || 'us') + ' directly.';
        return;
      }
      var btn = f.querySelector('[type=submit]'); if (btn) btn.disabled = true;
      fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { if (!r.ok) throw new Error(r.status);
          if (window.signelRequest) window.signelRequest('message', { customer: { name: [data.first_name, data.last_name].filter(Boolean).join(' '), company: data.company || '', email: data.email || '', phone: data.phone || '' }, message: data.message || '' });
          msg.className = 'msg ok'; msg.textContent = 'Thank you — your request has been sent.'; f.reset(); })
        .catch(function () { msg.className = 'msg err'; msg.textContent = 'Sorry, the request could not be sent. Please try again or contact us by phone.'; })
        .then(function () { if (btn) btn.disabled = false; });
    });
  });
})();
